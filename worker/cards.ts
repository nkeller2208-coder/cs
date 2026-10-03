import { Hono } from 'hono'
import { type AppEnv, type Me, all, fail, first, ids, now } from './env'

// Visibilité d'une carte : publiée / à revoir, ou brouillon de l'utilisateur.
const VISIBLE = `(c.status <> 'draft' OR c.author_id = ?)`

const LINKS = [
  ['card_roles', 'role_id', 'role_ids'],
  ['card_categories', 'category_id', 'category_ids'],
  ['card_zones', 'zone_id', 'zone_ids'],
  ['card_utilities', 'utility_id', 'utility_ids'],
  ['card_economies', 'economy_id', 'economy_ids'],
  ['card_round_types', 'round_type_id', 'round_type_ids'],
] as const

interface CardRow {
  id: number
  title: string
  description: string
  map_id: number | null
  side: string | null
  risk_id: number | null
  status: string
  review_comment: string | null
  review_by: string | null
  author_id: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}

type Card = CardRow & { media: { url: string; kind: string; url_key: string }[] } & Record<(typeof LINKS)[number][2], number[]>

/** Charge des cartes avec leurs médias et étiquettes. `where` porte sur l'alias c. */
async function loadCards(db: D1Database, where: string, params: unknown[]): Promise<Card[]> {
  const stmts = [
    db.prepare(`SELECT c.* FROM cards c WHERE ${where} ORDER BY c.id`).bind(...params),
    db.prepare(`SELECT m.card_id, m.url, m.kind, m.url_key FROM card_media m JOIN cards c ON c.id = m.card_id WHERE ${where} ORDER BY m.card_id, m.position`).bind(...params),
    ...LINKS.map(([t, col]) => db.prepare(`SELECT l.card_id, l.${col} AS v FROM ${t} l JOIN cards c ON c.id = l.card_id WHERE ${where}`).bind(...params)),
  ]
  const [cards, media, ...links] = await db.batch(stmts)
  const byId = new Map<number, Card>()
  for (const r of cards.results as CardRow[]) {
    byId.set(r.id, { ...r, media: [], role_ids: [], category_ids: [], zone_ids: [], utility_ids: [], economy_ids: [], round_type_ids: [] })
  }
  for (const m of media.results as { card_id: number; url: string; kind: string; url_key: string }[]) {
    byId.get(m.card_id)?.media.push({ url: m.url, kind: m.kind, url_key: m.url_key })
  }
  links.forEach((res, i) => {
    const key = LINKS[i][2]
    for (const r of res.results as { card_id: number; v: number }[]) byId.get(r.card_id)?.[key].push(r.v)
  })
  return [...byId.values()]
}

async function snapshot(db: D1Database, id: number) {
  const [c] = await loadCards(db, 'c.id = ?', [id])
  if (!c) return null
  const sort = (a: number[]) => [...a].sort((x, y) => x - y)
  return {
    title: c.title, description: c.description, map_id: c.map_id, side: c.side, risk_id: c.risk_id,
    status: c.status, review_comment: c.review_comment,
    media: c.media.map(({ url, kind }) => ({ url, kind })),
    role_ids: sort(c.role_ids), category_ids: sort(c.category_ids), zone_ids: sort(c.zone_ids),
    utility_ids: sort(c.utility_ids), economy_ids: sort(c.economy_ids), round_type_ids: sort(c.round_type_ids),
  }
}

/** Historique : une entrée par modification ; les sauvegardes auto d'un brouillon sont fusionnées. */
async function logHistory(db: D1Database, cardId: number, action: string, me: Me, note: string | null = null) {
  const snap = await snapshot(db, cardId)
  if (!snap) return
  const json = JSON.stringify(snap)
  const last = await first<{ id: number; snapshot: string; changed_by: string | null }>(
    db, 'SELECT id, snapshot, changed_by FROM card_history WHERE card_id = ? ORDER BY changed_at DESC, id DESC LIMIT 1', cardId,
  )
  if (last && last.changed_by === me.id) {
    if (last.snapshot === json) return
    if (JSON.parse(last.snapshot).status === 'draft' && snap.status === 'draft') {
      await db.prepare('UPDATE card_history SET snapshot = ?, changed_at = ? WHERE id = ?').bind(json, now(), last.id).run()
      return
    }
  }
  await db.prepare('INSERT INTO card_history (card_id, action, changed_by, note, snapshot) VALUES (?, ?, ?, ?, ?)')
    .bind(cardId, action, me.id, note, json).run()
}

export async function canEdit(db: D1Database, cardId: number, me: Me): Promise<CardRow | null> {
  const c = await first<CardRow>(db, 'SELECT * FROM cards WHERE id = ?', cardId)
  if (!c) return null
  // Le brouillon d'un autre reste privé, même pour un admin.
  if (c.status === 'draft' && c.author_id !== me.id) return null
  return me.role === 'admin' || c.author_id === me.id ? c : null
}

export async function canView(db: D1Database, cardId: number, me: Me) {
  return first<CardRow>(db, `SELECT c.* FROM cards c WHERE c.id = ? AND ${VISIBLE}`, cardId, me.id)
}

interface Payload {
  id?: number | null
  title?: string
  description?: string
  map_id?: number | null
  side?: string | null
  risk_id?: number | null
  status?: string
  media?: { url: string; kind: string; url_key: string }[]
  role_ids?: unknown
  category_ids?: unknown
  zone_ids?: unknown
  utility_ids?: unknown
  economy_ids?: unknown
  round_type_ids?: unknown
  remember?: boolean
}

/** Création / mise à jour atomique d'une carte (équivalent de l'ancienne RPC save_card). */
export async function saveCard(db: D1Database, p: Payload, me: Me): Promise<number> {
  const status = p.status ?? 'published'
  if (!['draft', 'published', 'review'].includes(status)) fail(400, 'Statut invalide')
  const title = String(p.title ?? '').trim().slice(0, 100)
  const description = String(p.description ?? '')
  const mapId = p.map_id ? Number(p.map_id) : null
  const side = p.side === 'CT' || p.side === 'T' ? p.side : null
  const riskId = p.risk_id ? Number(p.risk_id) : null
  const media = Array.isArray(p.media) ? p.media : []
  const cats = ids(p.category_ids)
  const roles = ids(p.role_ids)
  const zones = ids(p.zone_ids)

  if (description.length > 20000) fail(400, 'Description trop longue (20 000 caractères max)')
  if (media.length > 20) fail(400, '20 liens maximum par carte')
  for (const m of media) {
    if (typeof m?.url !== 'string' || m.url.length > 2048 || !/^https?:\/\//i.test(m.url)) {
      fail(400, 'Lien invalide (http(s) uniquement, 2048 caractères max)')
    }
    if (!['youtube', 'image', 'link'].includes(m.kind)) fail(400, 'Type de média invalide')
  }
  if (status !== 'draft') {
    if (!title) fail(400, 'Le titre est obligatoire')
    if (!mapId) fail(400, 'La map est obligatoire')
    if (!side) fail(400, 'Le side est obligatoire')
    if (!cats.length) fail(400, 'Au moins une catégorie est obligatoire')
    if (!media.length && !description.trim()) fail(400, 'Ajoute au moins un lien média ou une description')
  }

  // Cohérence : zones de la map de la carte, rôles de son side.
  if (zones.length) {
    const ok = await all<{ id: number }>(db, `SELECT id FROM zones WHERE map_id IS ? AND id IN (${zones.map(() => '?').join(',')})`, mapId, ...zones)
    if (ok.length !== zones.length) fail(400, 'Zone incompatible avec la map choisie')
  }
  if (roles.length) {
    const ok = await all<{ id: number }>(db, `SELECT id FROM roles WHERE side IS ? AND id IN (${roles.map(() => '?').join(',')})`, side, ...roles)
    if (ok.length !== roles.length) fail(400, 'Rôle incompatible avec le side choisi')
  }
  const flags = cats.length
    ? await first<{ u: number; r: number }>(db, `SELECT MAX(shows_utility) AS u, MAX(shows_round_type) AS r FROM categories WHERE id IN (${cats.map(() => '?').join(',')})`, ...cats)
    : null
  const utils = flags?.u ? ids(p.utility_ids) : []
  const rounds = flags?.r ? ids(p.round_type_ids) : []
  const ecos = ids(p.economy_ids)

  let id = p.id ? Number(p.id) : null
  let action = 'update'
  const ts = now()
  if (!id) {
    const row = await first<{ id: number }>(
      db,
      `INSERT INTO cards (title, description, map_id, side, risk_id, status, author_id, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      title, description, mapId, side, riskId, status, me.id, me.id, ts, ts,
    )
    id = row!.id
    action = 'create'
  } else {
    const prev = await canEdit(db, id, me)
    if (!prev) fail(403, 'Carte introuvable ou modification non autorisée')
    if (prev.status === 'draft' && status !== 'draft') action = 'create' // publication d'un brouillon
    await db.prepare(
      `UPDATE cards SET title = ?, description = ?, map_id = ?, side = ?, risk_id = ?, status = ?,
         review_comment = CASE WHEN ? = 'review' THEN review_comment ELSE NULL END,
         review_by = CASE WHEN ? = 'review' THEN review_by ELSE NULL END,
         updated_by = ?, updated_at = ? WHERE id = ?`,
    ).bind(title, description, mapId, side, riskId, status, status, status, me.id, ts, id).run()
  }

  // Remplacement des médias et étiquettes en une transaction.
  const stmts: D1PreparedStatement[] = [db.prepare('DELETE FROM card_media WHERE card_id = ?').bind(id)]
  media.forEach((m, i) =>
    stmts.push(db.prepare('INSERT INTO card_media (card_id, url, kind, url_key, position) VALUES (?, ?, ?, ?, ?)').bind(id, m.url, m.kind, String(m.url_key || m.url), i)),
  )
  const values: Record<string, number[]> = {
    role_ids: roles, category_ids: cats, zone_ids: zones, utility_ids: utils, economy_ids: ecos, round_type_ids: rounds,
  }
  for (const [table, col, key] of LINKS) {
    stmts.push(db.prepare(`DELETE FROM ${table} WHERE card_id = ?`).bind(id))
    for (const v of values[key]) stmts.push(db.prepare(`INSERT OR IGNORE INTO ${table} (card_id, ${col}) VALUES (?, ?)`).bind(id, v))
  }
  if (p.remember !== false && status !== 'draft') {
    stmts.push(
      db.prepare('UPDATE members SET last_values = ? WHERE id = ?').bind(
        JSON.stringify({ map_id: mapId, side, risk_id: riskId, ...values }),
        me.id,
      ),
    )
  }
  await db.batch(stmts)
  await logHistory(db, id, action, me)
  return id
}

// ------------------------------------------------------------ Routes

export const cards = new Hono<AppEnv>()

cards.get('/', async (c) => {
  const me = c.get('me')
  return c.json(await loadCards(c.env.DB, VISIBLE, [me.id]))
})

cards.post('/', async (c) => {
  const id = await saveCard(c.env.DB, await c.req.json<Payload>(), c.get('me'))
  return c.json({ id })
})

cards.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!(await canEdit(c.env.DB, id, c.get('me')))) fail(403, 'Suppression non autorisée')
  await c.env.DB.prepare('DELETE FROM cards WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

/** Tout membre peut signaler une carte « À revoir ». */
cards.post('/:id/flag', async (c) => {
  const me = c.get('me')
  const id = Number(c.req.param('id'))
  const { comment } = await c.req.json<{ comment?: string }>()
  const text = String(comment ?? '').trim().slice(0, 280)
  if (!text) fail(400, 'Un commentaire est requis')
  const card = await canView(c.env.DB, id, me)
  if (!card) fail(404, 'Carte introuvable')
  if (card.status === 'draft') fail(400, 'Un brouillon ne peut pas être signalé')
  await c.env.DB.prepare(
    `UPDATE cards SET status = 'review', review_comment = ?, review_by = ?, updated_by = ?, updated_at = ? WHERE id = ?`,
  ).bind(text, me.id, me.id, now(), id).run()
  await logHistory(c.env.DB, id, 'status', me, text)
  return c.json({ ok: true })
})

/** Lever le signalement : auteur, admin, ou membre qui a signalé. */
cards.post('/:id/resolve', async (c) => {
  const me = c.get('me')
  const id = Number(c.req.param('id'))
  const card = await canView(c.env.DB, id, me)
  if (!card) fail(404, 'Carte introuvable')
  if (!(me.role === 'admin' || card.author_id === me.id || card.review_by === me.id)) fail(403, 'Non autorisé')
  await c.env.DB.prepare(
    `UPDATE cards SET status = 'published', review_comment = NULL, review_by = NULL, updated_by = ?, updated_at = ? WHERE id = ? AND status = 'review'`,
  ).bind(me.id, now(), id).run()
  await logHistory(c.env.DB, id, 'status', me, 'Signalement levé')
  return c.json({ ok: true })
})

cards.get('/:id/history', async (c) => {
  const id = Number(c.req.param('id'))
  if (!(await canView(c.env.DB, id, c.get('me')))) fail(404, 'Carte introuvable')
  const rows = await all<{ snapshot: string }>(c.env.DB, 'SELECT * FROM card_history WHERE card_id = ? ORDER BY changed_at DESC, id DESC', id)
  return c.json(rows.map((r) => ({ ...r, snapshot: JSON.parse(r.snapshot) })))
})

/** Suppression des données de démonstration (titres préfixés), limitée à ce que l'utilisateur peut supprimer. */
cards.delete('/', async (c) => {
  const me = c.get('me')
  const prefix = c.req.query('prefix') ?? ''
  if (prefix.length < 3) fail(400, 'Préfixe requis')
  const like = `${prefix.replace(/[\\%_]/g, '\\$&')}%`
  const owner = me.role === 'admin' ? `(status <> 'draft' OR author_id = ?)` : 'author_id = ?'
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM cards WHERE title LIKE ? ESCAPE '\\' AND ${owner}`).bind(like, me.id),
    c.env.DB.prepare(`DELETE FROM principles WHERE title LIKE ? ESCAPE '\\' AND ${me.role === 'admin' ? '1' : 'author_id = ?'}`).bind(
      ...(me.role === 'admin' ? [like] : [like, me.id]),
    ),
  ])
  return c.json({ ok: true })
})

export const media = new Hono<AppEnv>()

/** Anti-doublon : cartes visibles qui utilisent déjà ces liens. */
media.get('/duplicates', async (c) => {
  const me = c.get('me')
  const keys = (c.req.queries('key') ?? []).slice(0, 20)
  const exclude = Number(c.req.query('exclude') ?? 0)
  if (!keys.length) return c.json([])
  const rows = await all<{ url_key: string; card_id: number; title: string; status: string }>(
    c.env.DB,
    `SELECT m.url_key, m.card_id, c.title, c.status FROM card_media m JOIN cards c ON c.id = m.card_id
      WHERE m.url_key IN (${keys.map(() => '?').join(',')}) AND c.id <> ? AND ${VISIBLE}`,
    ...keys, exclude, me.id,
  )
  return c.json(rows.map((r) => ({ url_key: r.url_key, card_id: r.card_id, cards: { id: r.card_id, title: r.title, status: r.status } })))
})
