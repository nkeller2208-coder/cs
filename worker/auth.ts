import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { type AppEnv, type Ctx, type Env, type Me, fail, first, now, randomToken, sha256 } from './env'
import { hashPassword, passwordProblem, verifyPassword } from './password'

const SESSION_COOKIE = 'cs2kb_session'
const SESSION_DAYS = 30
/** Verrouillage temporaire du compte après plusieurs mots de passe erronés. */
const MAX_FAILED = 5
const LOCK_MINUTES = 15
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function cookieOpts(c: Ctx, maxAge: number) {
  const secure = new URL(c.req.url).protocol === 'https:'
  return { httpOnly: true, secure, sameSite: 'Lax' as const, path: '/', maxAge }
}

interface AllowEntry {
  id: number
  email: string | null
  role: 'admin' | 'member'
  note: string | null
  team_id: number | null
  team_role: string | null
  invite_expires_at: string | null
}

/** Invitation dans une équipe : la personne la rejoint dès qu'elle est inscrite. */
async function joinInvitedTeam(env: Env, entry: AllowEntry, memberId: string) {
  if (!entry.team_id) return
  await env.DB.prepare('INSERT OR IGNORE INTO team_members (team_id, member_id, role, added_by) SELECT ?, ?, ?, invited_by FROM allowlist WHERE id = ?')
    .bind(entry.team_id, memberId, entry.team_role ?? 'player', entry.id).run()
}

interface Identity {
  email?: string | null
  name?: string | null
}

/** Membre rattaché à une entrée de la liste blanche (créé à la première connexion / inscription). */
async function claimMember(env: Env, entry: AllowEntry, who: Identity): Promise<string> {
  const db = env.DB
  const existing = await first<{ id: string }>(db, 'SELECT id FROM members WHERE allowlist_id = ?', entry.id)
  if (existing) {
    await db
      .prepare(
        `UPDATE members SET email = COALESCE(?, email),
           display_name = CASE WHEN display_name = '' THEN COALESCE(?, '') ELSE display_name END
         WHERE id = ?`,
      )
      .bind(who.email ?? null, who.name ?? null, existing.id)
      .run()
    await joinInvitedTeam(env, entry, existing.id)
    return existing.id
  }
  const id = crypto.randomUUID()
  // INSERT OR IGNORE : deux connexions simultanées ne créent qu'un membre.
  await db
    .prepare('INSERT OR IGNORE INTO members (id, allowlist_id, email, display_name, role) VALUES (?, ?, ?, ?, ?)')
    .bind(id, entry.id, who.email ?? entry.email, who.name || entry.note || (who.email ?? entry.email ?? '').split('@')[0], entry.role)
    .run()
  const memberId = (await first<{ id: string }>(db, 'SELECT id FROM members WHERE allowlist_id = ?', entry.id))!.id
  await joinInvitedTeam(env, entry, memberId)
  return memberId
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

auth.get('/config', (c) => c.json({ devLogin: c.env.DEV_LOGIN === 'true' }))

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

// ------------------------------------------------------------ Connexion email + mot de passe

auth.post('/login', async (c) => {
  const b = await c.req.json<{ email?: string; password?: string }>().catch(() => ({}) as { email?: string; password?: string })
  const email = String(b.email ?? '').trim().toLowerCase()
  const password = String(b.password ?? '')
  if (!email || !password || password.length > 200) fail(400, 'Indique ton email et ton mot de passe.')

  const m = await first<{ id: string; password_hash: string | null; failed_logins: number; locked_until: string | null }>(
    c.env.DB,
    'SELECT id, password_hash, failed_logins, locked_until FROM members WHERE email = ? COLLATE NOCASE AND password_hash IS NOT NULL LIMIT 1',
    email,
  )
  if (m?.locked_until && m.locked_until > now()) {
    fail(429, `Trop d'essais : compte bloqué ${LOCK_MINUTES} minutes. Réessaie plus tard ou demande un nouveau lien à l'admin.`)
  }
  // Toujours calculer un hash (même sans compte) : la durée de réponse ne révèle pas si l'email existe.
  const ok = await verifyPassword(password, m?.password_hash ?? null)
  if (!m || !ok) {
    if (m) {
      const failed = m.failed_logins + 1
      const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null
      await c.env.DB.prepare('UPDATE members SET failed_logins = ?, locked_until = ? WHERE id = ?')
        .bind(lock ? 0 : failed, lock, m.id)
        .run()
    }
    fail(401, 'Email ou mot de passe incorrect.')
  }
  await c.env.DB.prepare('UPDATE members SET failed_logins = 0, locked_until = NULL WHERE id = ?').bind(m.id).run()
  await startSession(c, m.id)
  return c.json({ ok: true })
})

// ------------------------------------------------------------ Lien d'inscription (usage unique)

async function inviteEntry(env: Env, token: string): Promise<AllowEntry | null> {
  return first<AllowEntry>(
    env.DB,
    'SELECT id, email, role, note, team_id, team_role, invite_expires_at FROM allowlist WHERE invite_hash = ? AND invite_expires_at > ?',
    await sha256(token),
    now(),
  )
}

const EXPIRED = "Ce lien a expiré, a déjà été utilisé ou a été remplacé : demande un nouveau lien à l'admin ou à ton capitaine."

// Anciens liens (/api/auth/invite/…) : redirigés vers la page d'inscription, sans connecter personne.
auth.get('/invite/:token', (c) => c.redirect(`/inscription/${encodeURIComponent(c.req.param('token'))}`))

/** Ce que la page d'inscription doit afficher (sans consommer le lien). */
auth.get('/invite/:token/info', async (c) => {
  const entry = await inviteEntry(c.env, c.req.param('token'))
  if (!entry) fail(404, EXPIRED)
  const member = await first<{ display_name: string; email: string | null }>(
    c.env.DB,
    'SELECT display_name, email FROM members WHERE allowlist_id = ?',
    entry.id,
  )
  return c.json({
    // « reset » : la personne a déjà un compte, le lien sert à choisir un nouveau mot de passe.
    mode: member ? 'reset' : 'signup',
    name: member?.display_name || entry.note || '',
    email: member?.email ?? entry.email ?? '',
    expires_at: entry.invite_expires_at,
  })
})

/** Inscription (ou nouveau mot de passe) : consomme le lien, puis connecte la personne. */
auth.post('/register', async (c) => {
  const db = c.env.DB
  const b = await c.req
    .json<{ token?: string; display_name?: string; email?: string; password?: string }>()
    .catch(() => ({}) as Record<string, string | undefined>)
  const token = String(b.token ?? '')
  const entry = token ? await inviteEntry(c.env, token) : null
  if (!entry) fail(400, EXPIRED)

  const email = String(b.email ?? '').trim().toLowerCase()
  const password = String(b.password ?? '')
  if (!EMAIL_RE.test(email) || email.length > 254) fail(400, 'Email invalide')
  const problem = passwordProblem(password)
  if (problem) fail(400, problem)
  const member = await first<{ id: string }>(db, 'SELECT id FROM members WHERE allowlist_id = ?', entry.id)
  const name = String(b.display_name ?? '').trim().slice(0, 40)
  if (!member && !name) fail(400, 'Choisis un pseudo')

  // L'email sert d'identifiant de connexion : il doit être unique.
  const taken = await first(
    db,
    `SELECT 1 FROM allowlist WHERE email = ?1 COLLATE NOCASE AND id <> ?2
     UNION SELECT 1 FROM members WHERE email = ?1 COLLATE NOCASE AND (allowlist_id IS NULL OR allowlist_id <> ?2) LIMIT 1`,
    email,
    entry.id,
  )
  if (taken) fail(409, 'Cet email est déjà utilisé par un autre compte.')

  const hash = await hashPassword(password)
  // Consommation atomique : deux envois simultanés du formulaire ne peuvent pas tous deux réussir.
  const used = await db
    .prepare('UPDATE allowlist SET invite_hash = NULL, invite_expires_at = NULL, email = ? WHERE id = ? AND invite_hash = ? AND invite_expires_at > ?')
    .bind(email, entry.id, await sha256(token), now())
    .run()
    .catch(() => fail(409, 'Cet email est déjà utilisé par un autre compte.'))
  if (!used.meta.changes) fail(400, EXPIRED)

  let memberId: string
  if (member) {
    // Nouveau mot de passe : les autres appareils connectés sont déconnectés.
    memberId = member.id
    await db.batch([
      db.prepare('UPDATE members SET password_hash = ?, email = ?, failed_logins = 0, locked_until = NULL WHERE id = ?').bind(hash, email, memberId),
      db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(memberId),
    ])
  } else {
    memberId = await claimMember(c.env, { ...entry, email }, { email, name })
    await db.prepare('UPDATE members SET password_hash = ?, display_name = ? WHERE id = ?').bind(hash, name, memberId).run()
  }
  await startSession(c, memberId)
  return c.json({ ok: true, mode: member ? 'reset' : 'signup' })
})

// ------------------------------------------------------------ Connexion de développement

auth.post('/dev', async (c) => {
  if (c.env.DEV_LOGIN !== 'true') fail(404, 'Indisponible')
  const { email } = await c.req.json<{ email?: string }>()
  const entry = email ? await first<AllowEntry>(c.env.DB, 'SELECT * FROM allowlist WHERE email = ? COLLATE NOCASE', email.trim()) : null
  if (!entry) fail(403, `« ${email} » n'est pas sur la liste des membres.`)
  await startSession(c, await claimMember(c.env, entry, { email: email?.trim() }))
  return c.json({ ok: true })
})
