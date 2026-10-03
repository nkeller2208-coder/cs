import { Hono } from 'hono'
import { canView } from './cards'
import { type AppEnv, type Me, fail, first, fixBools, ids, now } from './env'

const LINKS = [
  ['principle_maps', 'map_id', 'map_ids'],
  ['principle_roles', 'role_id', 'role_ids'],
  ['principle_categories', 'category_id', 'category_ids'],
  ['principle_round_types', 'round_type_id', 'round_type_ids'],
] as const

const canEdit = (p: { author_id: string | null }, me: Me) => me.role === 'admin' || p.author_id === me.id

export const principles = new Hono<AppEnv>()

principles.get('/', async (c) => {
  const db = c.env.DB
  const me = c.get('me')
  const [rows, cards, ...links] = await db.batch([
    db.prepare('SELECT * FROM principles ORDER BY id'),
    // Seules les cartes visibles par l'utilisateur sont renvoyées.
    db.prepare(`SELECT pc.principle_id, pc.card_id AS v FROM principle_cards pc JOIN cards c ON c.id = pc.card_id
                 WHERE c.status <> 'draft' OR c.author_id = ?`).bind(me.id),
    ...LINKS.map(([t, col]) => db.prepare(`SELECT principle_id, ${col} AS v FROM ${t}`)),
  ])
  const byId = new Map<number, Record<string, unknown> & Record<string, number[]>>()
  for (const r of rows.results as Record<string, unknown>[]) {
    byId.set(r.id as number, { ...fixBools(r), sides: JSON.parse(String(r.sides || '[]')), map_ids: [], role_ids: [], category_ids: [], round_type_ids: [], card_ids: [] })
  }
  const push = (res: D1Result, key: string) => {
    for (const r of res.results as { principle_id: number; v: number }[]) byId.get(r.principle_id)?.[key].push(r.v)
  }
  push(cards, 'card_ids')
  links.forEach((res, i) => push(res, LINKS[i][2]))
  return c.json([...byId.values()])
})

principles.post('/', async (c) => {
  const db = c.env.DB
  const me = c.get('me')
  const p = await c.req.json<Record<string, unknown>>()
  const title = String(p.title ?? '').trim()
  const summary = String(p.summary ?? '')
  const body = String(p.body ?? '')
  if (!title) fail(400, 'Le titre est obligatoire')
  if (title.length > 120) fail(400, 'Titre trop long (120 caractères max)')
  if (summary.length > 280) fail(400, 'Résumé trop long (280 caractères max)')
  if (body.length > 20000) fail(400, 'Texte trop long (20 000 caractères max)')
  const sides = Array.isArray(p.sides) ? [...new Set(p.sides.filter((s) => s === 'CT' || s === 'T'))] : []
  const roles = ids(p.role_ids)
  if (sides.length && roles.length) {
    const bad = await first(db, `SELECT id FROM roles WHERE id IN (${roles.map(() => '?').join(',')}) AND side NOT IN (${sides.map(() => '?').join(',')})`, ...roles, ...sides)
    if (bad) fail(400, 'Rôle incompatible avec le side choisi')
  }
  const themeId = p.theme_id ? Number(p.theme_id) : null
  const pinned = p.pinned ? 1 : 0
  let id = p.id ? Number(p.id) : null
  if (!id) {
    const row = await first<{ id: number }>(db,
      'INSERT INTO principles (title, summary, body, theme_id, sides, pinned, author_id, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
      title, summary, body, themeId, JSON.stringify(sides), pinned, me.id, me.id)
    id = row!.id
  } else {
    const existing = await first<{ author_id: string | null }>(db, 'SELECT author_id FROM principles WHERE id = ?', id)
    if (!existing) fail(404, 'Principe introuvable')
    if (!canEdit(existing, me)) fail(403, "Seuls l'auteur et les admins peuvent modifier ce principe")
    await db.prepare('UPDATE principles SET title = ?, summary = ?, body = ?, theme_id = ?, sides = ?, pinned = ?, updated_by = ?, updated_at = ? WHERE id = ?')
      .bind(title, summary, body, themeId, JSON.stringify(sides), pinned, me.id, now(), id).run()
  }
  const values: Record<string, number[]> = { map_ids: ids(p.map_ids), role_ids: roles, category_ids: ids(p.category_ids), round_type_ids: ids(p.round_type_ids) }
  const stmts: D1PreparedStatement[] = []
  for (const [t, col, key] of LINKS) {
    stmts.push(db.prepare(`DELETE FROM ${t} WHERE principle_id = ?`).bind(id))
    for (const v of values[key]) stmts.push(db.prepare(`INSERT OR IGNORE INTO ${t} (principle_id, ${col}) VALUES (?, ?)`).bind(id, v))
  }
  await db.batch(stmts)
  return c.json({ id })
})

principles.delete('/:id', async (c) => {
  const p = await first<{ author_id: string | null }>(c.env.DB, 'SELECT author_id FROM principles WHERE id = ?', Number(c.req.param('id')))
  if (!p) fail(404, 'Principe introuvable')
  if (!canEdit(p, c.get('me'))) fail(403, 'Suppression non autorisée')
  await c.env.DB.prepare('DELETE FROM principles WHERE id = ?').bind(Number(c.req.param('id'))).run()
  return c.json({ ok: true })
})

/** Tout membre peut rattacher / détacher une carte qu'il voit. */
principles.put('/:id/cards/:cardId', async (c) => {
  const pid = Number(c.req.param('id'))
  const cid = Number(c.req.param('cardId'))
  if (!(await first(c.env.DB, 'SELECT id FROM principles WHERE id = ?', pid))) fail(404, 'Principe introuvable')
  if (!(await canView(c.env.DB, cid, c.get('me')))) fail(404, 'Carte introuvable')
  await c.env.DB.prepare('INSERT OR IGNORE INTO principle_cards (principle_id, card_id, linked_by) VALUES (?, ?, ?)').bind(pid, cid, c.get('me').id).run()
  return c.json({ ok: true })
})

principles.delete('/:id/cards/:cardId', async (c) => {
  const cid = Number(c.req.param('cardId'))
  if (!(await canView(c.env.DB, cid, c.get('me')))) fail(404, 'Carte introuvable')
  await c.env.DB.prepare('DELETE FROM principle_cards WHERE principle_id = ? AND card_id = ?').bind(Number(c.req.param('id')), cid).run()
  return c.json({ ok: true })
})

