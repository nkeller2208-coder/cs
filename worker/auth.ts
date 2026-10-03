import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { type AppEnv, type Ctx, type Env, type Me, fail, first, now, randomToken, sha256 } from './env'

const SESSION_COOKIE = 'cs2kb_session'
const STATE_COOKIE = 'cs2kb_oauth_state'
const SESSION_DAYS = 30

function cookieOpts(c: Ctx, maxAge: number) {
  const secure = new URL(c.req.url).protocol === 'https:'
  return { httpOnly: true, secure, sameSite: 'Lax' as const, path: '/', maxAge }
}

interface AllowEntry {
  id: number
  email: string | null
  discord_id: string | null
  role: 'admin' | 'member'
  note: string | null
}

interface Identity {
  discord_id?: string | null
  email?: string | null
  name?: string | null
  avatar_url?: string | null
}

/** Membre rattaché à une entrée de la liste blanche (créé à la première connexion). */
async function claimMember(env: Env, entry: AllowEntry, who: Identity): Promise<string> {
  const db = env.DB
  const existing = await first<{ id: string }>(db, 'SELECT id FROM members WHERE allowlist_id = ?', entry.id)
  if (existing) {
    await db
      .prepare(
        `UPDATE members SET
           discord_id = COALESCE(?, discord_id), email = COALESCE(?, email),
           avatar_url = COALESCE(?, avatar_url),
           display_name = CASE WHEN display_name = '' THEN COALESCE(?, '') ELSE display_name END
         WHERE id = ?`,
      )
      .bind(who.discord_id ?? null, who.email ?? null, who.avatar_url ?? null, who.name ?? null, existing.id)
      .run()
    return existing.id
  }
  const id = crypto.randomUUID()
  // INSERT OR IGNORE : deux connexions simultanées ne créent qu'un membre.
  await db
    .prepare(
      `INSERT OR IGNORE INTO members (id, allowlist_id, email, discord_id, display_name, avatar_url, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, entry.id, who.email ?? entry.email, who.discord_id ?? entry.discord_id, who.name || entry.note || (who.email ?? entry.email ?? '').split('@')[0], who.avatar_url ?? null, entry.role)
    .run()
  return (await first<{ id: string }>(db, 'SELECT id FROM members WHERE allowlist_id = ?', entry.id))!.id
}

async function startSession(c: Ctx, memberId: string) {
  const token = randomToken()
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString()
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, member_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), memberId, expires)
    .run()
  // Ménage opportuniste des sessions expirées.
  await c.env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()).run()
  setCookie(c, SESSION_COOKIE, token, cookieOpts(c, SESSION_DAYS * 86_400))
}

async function findEntry(env: Env, who: Identity): Promise<AllowEntry | null> {
  if (who.discord_id) {
    const e = await first<AllowEntry>(env.DB, 'SELECT * FROM allowlist WHERE discord_id = ?', who.discord_id)
    if (e) return e
  }
  if (who.email) return first<AllowEntry>(env.DB, 'SELECT * FROM allowlist WHERE email = ? COLLATE NOCASE', who.email)
  return null
}

/** Membre de la session courante (ou null). */
export async function currentMember(c: Ctx): Promise<Me | null> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null
  return first<Me>(
    c.env.DB,
    `SELECT m.id, m.role, m.email, m.display_name, m.avatar_url, m.created_at
       FROM sessions s JOIN members m ON m.id = s.member_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
    await sha256(token),
    now(),
  )
}

export const requireMember = createMiddleware<AppEnv>(async (c, next) => {
  const me = await currentMember(c)
  if (!me) fail(401, 'Non connecté')
  c.set('me', me)
  await next()
})

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('me').role !== 'admin') fail(403, 'Réservé aux admins')
  await next()
})

export const auth = new Hono<AppEnv>()

auth.get('/config', (c) =>
  c.json({ discord: !!(c.env.DISCORD_CLIENT_ID && c.env.DISCORD_CLIENT_SECRET), devLogin: c.env.DEV_LOGIN === 'true' }),
)

auth.get('/me', async (c) => {
  const me = await currentMember(c)
  return me ? c.json(me) : c.json({ error: 'Non connecté' }, 401)
})

auth.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

// ------------------------------------------------------------ Lien de connexion personnel

auth.get('/invite/:token', async (c) => {
  const entry = await first<AllowEntry & { invite_expires_at: string }>(
    c.env.DB,
    'SELECT * FROM allowlist WHERE invite_hash = ? AND invite_expires_at > ?',
    await sha256(c.req.param('token')),
    now(),
  )
  if (!entry) return c.redirect('/?auth=expired')
  await startSession(c, await claimMember(c.env, entry, {}))
  return c.redirect('/')
})

// ------------------------------------------------------------ Connexion de développement

auth.post('/dev', async (c) => {
  if (c.env.DEV_LOGIN !== 'true') fail(404, 'Indisponible')
  const { email } = await c.req.json<{ email?: string }>()
  const entry = await findEntry(c.env, { email: email?.trim() })
  if (!entry) fail(403, `« ${email} » n'est pas sur la liste des membres.`)
  await startSession(c, await claimMember(c.env, entry, { email: email?.trim() }))
  return c.json({ ok: true })
})

// ------------------------------------------------------------ Discord OAuth2

auth.get('/discord', (c) => {
  if (!c.env.DISCORD_CLIENT_ID) fail(404, 'Connexion Discord non configurée')
  const state = randomToken(16)
  setCookie(c, STATE_COOKIE, state, cookieOpts(c, 600))
  const redirect = new URL('/api/auth/callback', c.req.url).toString()
  const url = new URL('https://discord.com/oauth2/authorize')
  url.search = new URLSearchParams({
    client_id: c.env.DISCORD_CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'identify email',
    state,
    prompt: 'none',
  }).toString()
  return c.redirect(url.toString())
})

auth.get('/callback', async (c) => {
  const { code, state } = c.req.query()
  const expected = getCookie(c, STATE_COOKIE)
  deleteCookie(c, STATE_COOKIE, { path: '/' })
  if (!code || !state || state !== expected) return c.redirect('/?auth=error')

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.env.DISCORD_CLIENT_ID!,
      client_secret: c.env.DISCORD_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: new URL('/api/auth/callback', c.req.url).toString(),
    }),
  })
  if (!tokenRes.ok) return c.redirect('/?auth=error')
  const { access_token } = await tokenRes.json<{ access_token: string }>()
  const userRes = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${access_token}` } })
  if (!userRes.ok) return c.redirect('/?auth=error')
  const u = await userRes.json<{ id: string; username: string; global_name?: string; email?: string; verified?: boolean; avatar?: string }>()

  const who: Identity = {
    discord_id: u.id,
    email: u.verified ? (u.email ?? null) : null,
    name: u.global_name || u.username,
    avatar_url: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null,
  }
  const entry = await findEntry(c.env, who)
  if (!entry) {
    // On affiche l'identifiant Discord pour que l'admin puisse l'ajouter à la liste.
    const q = new URLSearchParams({ auth: 'denied', name: who.name ?? '', discord: u.id })
    return c.redirect(`/?${q}`)
  }
  await startSession(c, await claimMember(c.env, entry, who))
  return c.redirect('/')
})
