import { Hono } from 'hono'
import { requireAdmin } from './auth'
import { listMembers, sqlError } from './tags'
import { type AppEnv, all, fail, first, randomToken, sha256 } from './env'

const INVITE_DAYS = 7

export const members = new Hono<AppEnv>()

members.get('/', async (c) => c.json(await listMembers(c.env.DB)))

members.get('/me/last-values', async (c) => {
  const row = await first<{ last_values: string }>(c.env.DB, 'SELECT last_values FROM members WHERE id = ?', c.get('me').id)
  return c.json(JSON.parse(row?.last_values || '{}'))
})

/** Chacun peut changer son pseudo ; l'admin peut aussi changer le rôle des autres. */
members.patch('/:id', async (c) => {
  const me = c.get('me')
  const id = c.req.param('id')
  const body = await c.req.json<{ role?: string; display_name?: string }>()
  if (id !== me.id && me.role !== 'admin') fail(403, 'Non autorisé')
  if (body.display_name !== undefined) {
    const n = String(body.display_name).trim().slice(0, 40)
    await c.env.DB.prepare('UPDATE members SET display_name = ? WHERE id = ?').bind(n, id).run()
  }
  if (body.role !== undefined) {
    if (me.role !== 'admin') fail(403, 'Réservé aux admins')
    if (id === me.id) fail(400, 'Tu ne peux pas changer ton propre rôle')
    if (body.role !== 'admin' && body.role !== 'member') fail(400, 'Rôle invalide')
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE members SET role = ? WHERE id = ?').bind(body.role, id),
      c.env.DB.prepare('UPDATE allowlist SET role = ? WHERE id = (SELECT allowlist_id FROM members WHERE id = ?)').bind(body.role, id),
    ])
  }
  return c.json({ ok: true })
})

/** Retirer un membre : fiche, sessions et entrée de liste blanche. Ses cartes sont conservées. */
members.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  if (id === c.get('me').id) fail(400, 'Impossible de se retirer soi-même')
  const m = await first<{ allowlist_id: number | null }>(c.env.DB, 'SELECT allowlist_id FROM members WHERE id = ?', id)
  if (!m) fail(404, 'Membre introuvable')
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM members WHERE id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM allowlist WHERE id = ?').bind(m.allowlist_id),
  ])
  return c.json({ ok: true })
})

// ------------------------------------------------------------ Liste blanche & liens de connexion

export const allowlist = new Hono<AppEnv>()
allowlist.use(requireAdmin)

allowlist.get('/', async (c) => {
  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT a.id, a.email, a.role, a.note, a.created_at, a.invite_expires_at,
            m.id AS member_id, m.display_name AS member_name
       FROM allowlist a LEFT JOIN members m ON m.allowlist_id = a.id
      ORDER BY a.created_at DESC`,
  )
  return c.json(rows)
})

allowlist.post('/', async (c) => {
  const b = await c.req.json<{ email?: string; role?: string; note?: string }>()
  const email = b.email?.trim().toLowerCase() || null
  const note = b.note?.trim().slice(0, 60) || null
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Email invalide')
  if (!email && !note) fail(400, 'Indique au moins un pseudo')
  const role = b.role === 'admin' ? 'admin' : 'member'
  const row = await c.env.DB.prepare('INSERT INTO allowlist (email, role, note) VALUES (?, ?, ?) RETURNING id')
    .bind(email, role, note).first().catch(sqlError)
  return c.json(row)
})

allowlist.patch('/:id', async (c) => {
  const b = await c.req.json<{ role?: string }>()
  if (b.role !== 'admin' && b.role !== 'member') fail(400, 'Rôle invalide')
  await c.env.DB.prepare('UPDATE allowlist SET role = ? WHERE id = ?').bind(b.role, Number(c.req.param('id'))).run()
  return c.json({ ok: true })
})

allowlist.delete('/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM allowlist WHERE id = ?').bind(Number(c.req.param('id'))).run()
  return c.json({ ok: true })
})

/**
 * Génère un lien d'inscription à usage unique (valable 7 jours) : la personne y choisit son email et son mot de passe.
 * Pour un membre déjà inscrit, le lien sert à choisir un nouveau mot de passe.
 * Un nouveau lien remplace le précédent. Seul le haché est stocké.
 */
allowlist.post('/:id/invite', async (c) => {
  const id = Number(c.req.param('id'))
  if (!(await first(c.env.DB, 'SELECT id FROM allowlist WHERE id = ?', id))) fail(404, 'Entrée introuvable')
  const token = randomToken()
  const expires = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString()
  await c.env.DB.prepare('UPDATE allowlist SET invite_hash = ?, invite_expires_at = ? WHERE id = ?').bind(await sha256(token), expires, id).run()
  return c.json({ url: new URL(`/inscription/${token}`, c.req.url).toString(), expires_at: expires })
})

allowlist.delete('/:id/invite', async (c) => {
  await c.env.DB.prepare('UPDATE allowlist SET invite_hash = NULL, invite_expires_at = NULL WHERE id = ?').bind(Number(c.req.param('id'))).run()
  return c.json({ ok: true })
})
