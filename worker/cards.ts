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

export type CardKind = 'strategy' | 'stuff'

interface CardRow {
  id: number
  kind: CardKind
  title: string
  description: string
  map_id: number | null
  side: string | null
  risk_id: number | null
  source_id: number | null
  status: string
  review_comment: string | null
  review_by: string | null
  author_id: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}

/** Action d'un rôle dans une stratégie (Pivot B → Support, « lance la smoke Window »). */
export interface RoleAction {
  role_id: number
  action_id: number
  note: string
}
/** Stuff rattaché à une stratégie, éventuellement lancé par un rôle. */
export interface StuffLink {
  stuff_id: number
  role_id: number | null
}

type Card = CardRow & {
  media: { url: string; kind: string; url_key: string }[]
  role_actions: RoleAction[]
  stuff_links: StuffLink[]
} & Record<(typeof LINKS)[number][2], number[]>

/**
 * Charge des cartes avec leurs médias et étiquettes. `where` porte sur l'alias c.
 * `viewer` : les stuffs rattachés invisibles pour lui (brouillons d'autrui) sont omis.
 */
async function loadCards(db: D1Database, where: string, params: unknown[], viewer?: string): Promise<Card[]> {
  const stuffVisible = viewer ? `AND (s.status <> 'draft' OR s.author_id = ?)` : ''
  const stmts = [
    db.prepare(`SELECT c.* FROM cards c WHERE ${where} ORDER BY c.id`).bind(...params),
    db.prepare(`SELECT m.card_id, m.url, m.kind, m.url_key FROM card_media m JOIN cards c ON c.id = m.card_id WHERE ${where} ORDER BY m.card_id, m.position`).bind(...params),
    db.prepare(`SELECT a.card_id, a.role_id, a.action_id, a.note FROM card_role_actions a JOIN cards c ON c.id = a.card_id WHERE ${where}`).bind(...params),
    db.prepare(
      `SELECT l.strategy_id, l.stuff_id, l.role_id FROM strategy_stuff l JOIN cards c ON c.id = l.strategy_id JOIN cards s ON s.id = l.stuff_id
        WHERE ${where} ${stuffVisible} ORDER BY l.strategy_id, l.position`,
    ).bind(...params, ...(viewer ? [viewer] : [])),
    ...LINKS.map(([t, col]) => db.prepare(`SELECT l.card_id, l.${col} AS v FROM ${t} l JOIN cards c ON c.id = l.card_id WHERE ${where}`).bind(...params)),
  ]
  const [cards, media, actions, stuff, ...links] = await db.batch(stmts)
  const byId = new Map<number, Card>()
  for (const r of cards.results as CardRow[]) {
    byId.set(r.id, {
      ...r, media: [], role_actions: [], stuff_links: [],
      role_ids: [], category_ids: [], zone_ids: [], utility_ids: [], economy_ids: [], round_type_ids: [],
    })
  }
  for (const m of media.results as { card_id: number; url: string; kind: string; url_key: string }[]) {
    byId.get(m.card_id)?.media.push({ url: m.url, kind: m.kind, url_key: m.url_key })
  }
  for (const a of actions.results as (RoleAction & { card_id: number })[]) {
    byId.get(a.card_id)?.role_actions.push({ role_id: a.role_id, action_id: a.action_id, note: a.note })
  }
  for (const l of stuff.results as (StuffLink & { strategy_id: number })[]) {
    byId.get(l.strategy_id)?.stuff_links.push({ stuff_id: l.stuff_id, role_id: l.role_id })
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
    kind: c.kind, title: c.title, description: c.description, map_id: c.map_id, side: c.side, risk_id: c.risk_id,
    source_id: c.source_id ?? null,
    status: c.status, review_comment: c.review_comment,
    media: c.media.map(({ url, kind }) => ({ url, kind })),
    role_ids: sort(c.role_ids), category_ids: sort(c.category_ids), zone_ids: sort(c.zone_ids),
    utility_ids: sort(c.utility_ids), economy_ids: sort(c.economy_ids), round_type_ids: sort(c.round_type_ids),
    role_actions: [...c.role_actions].sort((a, b) => a.role_id - b.role_id),
    stuff_links: c.stuff_links,
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
  kind?: string
  title?: string
  description?: string
  map_id?: number | null
  side?: string | null
  risk_id?: number | null
  source_id?: number | null
  status?: string
  media?: { url: string; kind: string; url_key: string }[]
  role_ids?: unknown
  category_ids?: unknown
  zone_ids?: unknown
  utility_ids?: unknown
  economy_ids?: unknown
  round_type_ids?: unknown
  /** Stratégie : action de chaque rôle. */
  role_actions?: unknown
  /** Stratégie : stuffs rattachés (dans l'ordre d'exécution). */
  stuff_links?: unknown
  remember?: boolean
}

const MAX_STUFF_LINKS = 30

function parseRoleActions(v: unknown): RoleAction[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<number>()
  const out: RoleAction[] = []
  for (const x of v as Record<string, unknown>[]) {
    const role_id = Number(x?.role_id)
    const action_id = Number(x?.action_id)
    if (!Number.isInteger(role_id) || role_id <= 0 || !Number.isInteger(action_id) || action_id <= 0 || seen.has(role_id)) continue
    seen.add(role_id)
    out.push({ role_id, action_id, note: String(x?.note ?? '').trim().slice(0, 200) })
  }
  return out
}

function parseStuffLinks(v: unknown): StuffLink[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<number>()
  const out: StuffLink[] = []
  for (const x of v as Record<string, unknown>[]) {
    const stuff_id = Number(x?.stuff_id)
    const role = Number(x?.role_id)
    if (!Number.isInteger(stuff_id) || stuff_id <= 0 || seen.has(stuff_id)) continue
    seen.add(stuff_id)
    out.push({ stuff_id, role_id: Number.isInteger(role) && role > 0 ? role : null })
  }
  return out
}

/** Création / mise à jour atomique d'une carte (équivalent de l'ancienne RPC save_card). */
export async function saveCard(db: D1Database, p: Payload, me: Me): Promise<number> {
  const status = p.status ?? 'published'
  if (!['draft', 'published', 'review'].includes(status)) fail(400, 'Statut invalide')
  const kind: CardKind = p.kind === 'stuff' ? 'stuff' : 'strategy'
  const strategy = kind === 'strategy'
  const title = String(p.title ?? '').trim().slice(0, 100)
  const description = String(p.description ?? '')
  const mapId = p.map_id ? Number(p.map_id) : null
  const side = p.side === 'CT' || p.side === 'T' ? p.side : null
  const riskId = p.risk_id ? Number(p.risk_id) : null
  const sourceId = p.source_id ? Number(p.source_id) : null
  if (sourceId && !(await first(db, 'SELECT id FROM sources WHERE id = ?', sourceId))) fail(400, 'Source inconnue')
  const media = Array.isArray(p.media) ? p.media : []
  const cats = ids(p.category_ids)
  const zones = ids(p.zone_ids)
  const roleActions = strategy ? parseRoleActions(p.role_actions) : []
  const stuffLinks = strategy ? parseStuffLinks(p.stuff_links) : []
  if (stuffLinks.length > MAX_STUFF_LINKS) fail(400, `${MAX_STUFF_LINKS} stuffs maximum par stratégie`)

  // Actions des rôles : existence, et « concerné » ou non (une stratégie concerne les rôles qui y ont un rôle actif).
  const actionIds = [...new Set(roleActions.map((a) => a.action_id))]
  const actionRows = actionIds.length
    ? await all<{ id: number; involved: number }>(db, `SELECT id, involved FROM role_actions WHERE id IN (${actionIds.map(() => '?').join(',')})`, ...actionIds)
    : []
  if (actionRows.length !== actionIds.length) fail(400, 'Action de rôle inconnue')
  const involved = new Set(actionRows.filter((a) => a.involved).map((a) => a.id))
  // Stratégie avec actions renseignées : rôles concernés = rôles ayant une action active.
  // Sinon (stuff, import CSV, ancienne saisie) : rôles cochés tels quels.
  const roles = roleActions.length ? roleActions.filter((a) => involved.has(a.action_id)).map((a) => a.role_id) : ids(p.role_ids)
  const checkedRoles = [...new Set([...roles, ...roleActions.map((a) => a.role_id), ...stuffLinks.flatMap((l) => (l.role_id ? [l.role_id] : []))])]

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
    if (strategy && !cats.length) fail(400, 'Au moins une catégorie est obligatoire')
    if (!strategy && !ids(p.utility_ids).length) fail(400, "Choisis au moins un type d'utilitaire")
    if (!media.length && !description.trim()) fail(400, 'Ajoute au moins un lien média ou une description')
  }

  // Cohérence : zones de la map de la carte, rôles de son side.
  if (zones.length) {
    const ok = await all<{ id: number }>(db, `SELECT id FROM zones WHERE map_id IS ? AND id IN (${zones.map(() => '?').join(',')})`, mapId, ...zones)
    if (ok.length !== zones.length) fail(400, 'Zone incompatible avec la map choisie')
  }
  if (checkedRoles.length) {
    const ok = await all<{ id: number }>(db, `SELECT id FROM roles WHERE side IS ? AND id IN (${checkedRoles.map(() => '?').join(',')})`, side, ...checkedRoles)
    if (ok.length !== checkedRoles.length) fail(400, 'Rôle incompatible avec le side choisi')
  }
  const flags = cats.length
    ? await first<{ r: number }>(db, `SELECT MAX(shows_round_type) AS r FROM categories WHERE id IN (${cats.map(() => '?').join(',')})`, ...cats)
    : null
  // Le type d'utilitaire décrit un stuff ; une stratégie référence ses stuffs à la place.
  const utils = strategy ? [] : ids(p.utility_ids)
  const rounds = flags?.r ? ids(p.round_type_ids) : []
  const ecos = ids(p.economy_ids)

  let id = p.id ? Number(p.id) : null

  // Stuffs rattachés : des cartes stuff, visibles, de la même map que la stratégie.
  if (stuffLinks.length) {
    const sIds = stuffLinks.map((l) => l.stuff_id)
    const rows = await all<{ id: number; kind: string; map_id: number | null; title: string }>(
      db,
      `SELECT c.id, c.kind, c.map_id, c.title FROM cards c WHERE c.id IN (${sIds.map(() => '?').join(',')}) AND ${VISIBLE}`,
      ...sIds, me.id,
    )
    if (rows.length !== sIds.length || sIds.includes(id ?? -1)) fail(400, 'Stuff introuvable')
    for (const r of rows) {
      if (r.kind !== 'stuff') fail(400, `« ${r.title} » n'est pas une carte stuff`)
      if (mapId && r.map_id && r.map_id !== mapId) fail(400, `Le stuff « ${r.title} » est sur une autre map`)
    }
  }

  let action = 'update'
  const ts = now()
  let prevKind: string | null = null
  if (!id) {
    const row = await first<{ id: number }>(
      db,
      `INSERT INTO cards (kind, title, description, map_id, side, risk_id, source_id, status, author_id, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      kind, title, description, mapId, side, riskId, sourceId, status, me.id, me.id, ts, ts,
    )
    id = row!.id
    action = 'create'
  } else {
    const prev = await canEdit(db, id, me)
    if (!prev) fail(403, 'Carte introuvable ou modification non autorisée')
    prevKind = prev.kind
    if (prev.status === 'draft' && status !== 'draft') action = 'create' // publication d'un brouillon
    await db.prepare(
      `UPDATE cards SET kind = ?, title = ?, description = ?, map_id = ?, side = ?, risk_id = ?, source_id = ?, status = ?,
         review_comment = CASE WHEN ? = 'review' THEN review_comment ELSE NULL END,
         review_by = CASE WHEN ? = 'review' THEN review_by ELSE NULL END,
         updated_by = ?, updated_at = ? WHERE id = ?`,
    ).bind(kind, title, description, mapId, side, riskId, sourceId, status, status, status, me.id, ts, id).run()
  }

  // Remplacement des médias et étiquettes en une transaction.
  const stmts: D1PreparedStatement[] = [db.prepare('DELETE FROM card_media WHERE card_id = ?').bind(id)]
  stmts.push(db.prepare('DELETE FROM card_role_actions WHERE card_id = ?').bind(id))
  for (const a of roleActions) {
    stmts.push(db.prepare('INSERT INTO card_role_actions (card_id, role_id, action_id, note) VALUES (?, ?, ?, ?)').bind(id, a.role_id, a.action_id, a.note))
  }
  // Seuls les liens vers des stuffs visibles par l'auteur sont remplacés : ceux qu'il ne voit pas
  // (brouillons d'autrui) sont conservés.
  stmts.push(
    db.prepare(
      `DELETE FROM strategy_stuff WHERE strategy_id = ?
          AND stuff_id IN (SELECT c.id FROM cards c WHERE ${VISIBLE})`,
    ).bind(id, me.id),
  )
  stuffLinks.forEach((l, i) =>
    stmts.push(db.prepare('INSERT OR REPLACE INTO strategy_stuff (strategy_id, stuff_id, role_id, position) VALUES (?, ?, ?, ?)').bind(id, l.stuff_id, l.role_id, i)),
  )
  // Une carte qui devient stratégie ne peut plus être utilisée comme stuff ailleurs.
  if (prevKind === 'stuff' && strategy) stmts.push(db.prepare('DELETE FROM strategy_stuff WHERE stuff_id = ?').bind(id))
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
        JSON.stringify({ map_id: mapId, side, risk_id: riskId, source_id: sourceId, ...values }),
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
  const db = c.env.DB
  const [list, ratings, statuses] = await Promise.all([
    loadCards(db, VISIBLE, [me.id], me.id),
    all<{ card_id: number; rating: number }>(db, 'SELECT card_id, rating FROM card_ratings WHERE member_id = ?', me.id),
    // Statut « à apprendre / maîtrisée » dans les équipes dont je fais partie.
    all<{ card_id: number; team_id: number; status: string }>(
      db,
      'SELECT tc.card_id, tc.team_id, tc.status FROM team_cards tc JOIN team_members tm ON tm.team_id = tc.team_id WHERE tm.member_id = ?',
      me.id,
    ),
  ])
  const rating = new Map(ratings.map((r) => [r.card_id, r.rating]))
  return c.json(
    list.map((card) => ({
      ...card,
      my_rating: rating.get(card.id) ?? null,
      learning: statuses.filter((s) => s.card_id === card.id).map(({ team_id, status }) => ({ team_id, status })),
    })),
  )
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
