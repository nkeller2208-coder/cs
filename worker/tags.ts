import { Hono } from 'hono'
import { requireAdmin } from './auth'
import { type AppEnv, all, bool, fail, first, fixBools, ids } from './env'

/** Listes d'étiquettes éditables et colonnes modifiables de chacune. */
export const TAG_TABLES: Record<string, string[]> = {
  maps: ['name', 'sort_order', 'archived'],
  zones: ['name', 'sort_order', 'archived', 'pending', 'map_id'],
  roles: ['name', 'sort_order', 'archived', 'side'],
  categories: ['name', 'sort_order', 'archived', 'shows_utility', 'shows_round_type'],
  risks: ['name', 'sort_order', 'archived', 'color'],
  utilities: ['name', 'sort_order', 'archived'],
  economies: ['name', 'sort_order', 'archived'],
  round_types: ['name', 'sort_order', 'archived'],
  principle_themes: ['name', 'sort_order', 'archived'],
  skill_groups: ['name', 'sort_order', 'archived'],
  skills: ['name', 'sort_order', 'archived', 'description', 'group_id'],
}
const BOOLS = new Set(['archived', 'pending', 'shows_utility', 'shows_round_type'])

function table(name: string) {
  if (!TAG_TABLES[name]) fail(404, 'Liste inconnue')
  return name
}

/** Valeurs acceptées pour une table (les autres clés sont ignorées). */
function clean(t: string, body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of TAG_TABLES[t]) {
    if (!(k in body)) continue
    let v = body[k]
    if (BOOLS.has(k)) v = bool(v)
    if (k === 'name') {
      v = String(v ?? '').trim()
      if (!v) fail(400, 'Le nom est obligatoire')
      if ((v as string).length > 100) fail(400, 'Nom trop long (100 caractères max)')
    }
    if (k === 'side' && v !== 'CT' && v !== 'T') fail(400, 'Side invalide')
    if (k === 'color' && !/^#[0-9a-f]{6}$/i.test(String(v))) fail(400, 'Couleur invalide')
    if (k === 'description') v = String(v ?? '').slice(0, 2000)
    out[k] = v
  }
  return out
}

/** Erreurs SQLite → messages lisibles. */
export function sqlError(e: unknown): never {
  const msg = String((e as Error)?.message ?? e)
  if (/UNIQUE/i.test(msg)) fail(409, 'Cette valeur existe déjà.')
  if (/FOREIGN KEY/i.test(msg)) fail(409, 'Cette valeur est encore utilisée par des cartes : archive-la plutôt.')
  if (/CHECK/i.test(msg)) fail(400, 'Valeur invalide.')
  throw e
}

export const tags = new Hono<AppEnv>()

tags.get('/', async (c) => {
  const names = Object.keys(TAG_TABLES).filter((t) => t !== 'skills')
  const res = await c.env.DB.batch(names.map((t) => c.env.DB.prepare(`SELECT * FROM ${t}`)))
  return c.json(Object.fromEntries(names.map((t, i) => [t, (res[i].results as Record<string, unknown>[]).map(fixBools)])))
})

/** Un membre peut proposer une zone (marquée « à valider ») ; le reste est réservé aux admins. */
tags.post('/zones/propose', async (c) => {
  const me = c.get('me')
  const { map_id, name } = await c.req.json<{ map_id: number; name: string }>()
  const n = String(name ?? '').trim()
  if (!n || n.length > 100) fail(400, 'Nom de zone invalide')
  if (!(await first(c.env.DB, 'SELECT id FROM maps WHERE id = ?', Number(map_id)))) fail(400, 'Map inconnue')
  const row = await c.env.DB.prepare('INSERT INTO zones (map_id, name, pending, created_by, sort_order) VALUES (?, ?, 1, ?, 999) RETURNING *')
    .bind(Number(map_id), n, me.id).first().catch(sqlError)
  return c.json(fixBools(row as Record<string, unknown>))
})

tags.post('/zones/merge', requireAdmin, async (c) => {
  const { source, target } = await c.req.json<{ source: number; target: number }>()
  const s = await first<{ map_id: number }>(c.env.DB, 'SELECT map_id FROM zones WHERE id = ?', source)
  const t = await first<{ map_id: number }>(c.env.DB, 'SELECT map_id FROM zones WHERE id = ?', target)
  if (!s || !t || source === target) fail(400, 'Zones invalides')
  if (s.map_id !== t.map_id) fail(400, 'Les deux zones doivent appartenir à la même map')
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR IGNORE INTO card_zones (card_id, zone_id) SELECT card_id, ? FROM card_zones WHERE zone_id = ?').bind(target, source),
    c.env.DB.prepare('DELETE FROM zones WHERE id = ?').bind(source),
    c.env.DB.prepare('UPDATE zones SET pending = 0 WHERE id = ?').bind(target),
  ])
  return c.json({ ok: true })
})

tags.post('/:table', requireAdmin, async (c) => {
  const t = table(c.req.param('table'))
  const v = clean(t, await c.req.json())
  if (!('name' in v)) fail(400, 'Le nom est obligatoire')
  if (t === 'skills') v.created_by = c.get('me').id
  const cols = Object.keys(v)
  const row = await c.env.DB.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) RETURNING *`)
    .bind(...Object.values(v)).first().catch(sqlError)
  return c.json(fixBools(row as Record<string, unknown>))
})

tags.patch('/:table/:id', requireAdmin, async (c) => {
  const t = table(c.req.param('table'))
  const v = clean(t, await c.req.json())
  const cols = Object.keys(v)
  if (!cols.length) return c.json({ ok: true })
  await c.env.DB.prepare(`UPDATE ${t} SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .bind(...Object.values(v), Number(c.req.param('id'))).run().catch(sqlError)
  return c.json({ ok: true })
})

tags.delete('/:table/:id', requireAdmin, async (c) => {
  const t = table(c.req.param('table'))
  await c.env.DB.prepare(`DELETE FROM ${t} WHERE id = ?`).bind(Number(c.req.param('id'))).run().catch(sqlError)
  return c.json({ ok: true })
})

tags.post('/:table/reorder', requireAdmin, async (c) => {
  const t = table(c.req.param('table'))
  const list = ids((await c.req.json<{ ids: unknown }>()).ids)
  await c.env.DB.batch(list.map((id, i) => c.env.DB.prepare(`UPDATE ${t} SET sort_order = ? WHERE id = ?`).bind(i + 1, id)))
  return c.json({ ok: true })
})

export async function listMembers(db: D1Database) {
  return all(db, 'SELECT id, email, display_name, avatar_url, role, team_id, created_at FROM members ORDER BY display_name COLLATE NOCASE')
}
