import { supabase } from './supabase'
import type {
  AllowlistEntry, Card, HistoryEntry, LastValues, Member, Principle, Tags, TagTable, CardStatus, Side, Media,
} from './types'
import { byOrder } from './text'

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error
  return res.data as T
}

const PAGE = 1000

/** Récupère toutes les lignes en contournant la limite de 1000 lignes de PostgREST. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const page = check(await build(from, from + PAGE - 1))
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

// ------------------------------------------------------------ Étiquettes

export async function fetchTags(): Promise<Tags> {
  const [maps, zones, roles, categories, risks, utilities, economies, round_types, principle_themes] = await Promise.all([
    fetchAll((a, b) => supabase.from('maps').select('*').range(a, b)),
    fetchAll((a, b) => supabase.from('zones').select('*').range(a, b)),
    fetchAll((a, b) => supabase.from('roles').select('*').range(a, b)),
    fetchAll((a, b) => supabase.from('categories').select('*').range(a, b)),
    fetchAll((a, b) => supabase.from('risks').select('*').range(a, b)),
    fetchAll((a, b) => supabase.from('utilities').select('*').range(a, b)),
    fetchAll((a, b) => supabase.from('economies').select('*').range(a, b)),
    fetchAll((a, b) => supabase.from('round_types').select('*').range(a, b)),
    fetchAll((a, b) => supabase.from('principle_themes').select('*').range(a, b)),
  ])
  return {
    maps: (maps as Tags['maps']).sort(byOrder),
    zones: (zones as Tags['zones']).sort(byOrder),
    roles: (roles as Tags['roles']).sort((a, b) => a.side.localeCompare(b.side) || byOrder(a, b)),
    categories: (categories as Tags['categories']).sort(byOrder),
    risks: (risks as Tags['risks']).sort(byOrder),
    utilities: (utilities as Tags['utilities']).sort(byOrder),
    economies: (economies as Tags['economies']).sort(byOrder),
    round_types: (round_types as Tags['round_types']).sort(byOrder),
    principle_themes: (principle_themes as Tags['principle_themes']).sort(byOrder),
  }
}

export async function insertTag(table: TagTable, values: Record<string, unknown>) {
  return check(await supabase.from(table).insert(values).select().single())
}
export async function updateTag(table: TagTable, id: number, values: Record<string, unknown>) {
  check(await supabase.from(table).update(values).eq('id', id))
}
export async function deleteTag(table: TagTable, id: number) {
  check(await supabase.from(table).delete().eq('id', id))
}
export async function reorderTags(table: TagTable, ids: number[]) {
  check(await supabase.rpc('reorder_tags', { p_table: table, p_ids: ids }))
}
export async function mergeZones(source: number, target: number) {
  check(await supabase.rpc('merge_zones', { p_source: source, p_target: target }))
}
/** Un membre propose une zone : utilisable tout de suite, marquée « à valider ». */
export async function proposeZone(mapId: number, name: string, userId: string) {
  return check(
    await supabase
      .from('zones')
      .insert({ map_id: mapId, name: name.trim(), pending: true, created_by: userId, sort_order: 999 })
      .select()
      .single(),
  ) as Tags['zones'][number]
}

// ------------------------------------------------------------ Cartes

const CARD_SELECT =
  '*, card_media(url, kind, url_key, position), card_roles(role_id), card_categories(category_id), ' +
  'card_zones(zone_id), card_utilities(utility_id), card_economies(economy_id), card_round_types(round_type_id)'

interface CardRow extends Omit<Card, 'media' | 'role_ids' | 'category_ids' | 'zone_ids' | 'utility_ids' | 'economy_ids' | 'round_type_ids'> {
  card_media: (Media & { position: number })[]
  card_roles: { role_id: number }[]
  card_categories: { category_id: number }[]
  card_zones: { zone_id: number }[]
  card_utilities: { utility_id: number }[]
  card_economies: { economy_id: number }[]
  card_round_types: { round_type_id: number }[]
}

function toCard(r: CardRow): Card {
  const { card_media, card_roles, card_categories, card_zones, card_utilities, card_economies, card_round_types, ...rest } = r
  return {
    ...rest,
    media: [...card_media].sort((a, b) => a.position - b.position).map(({ url, kind, url_key }) => ({ url, kind, url_key })),
    role_ids: card_roles.map((x) => x.role_id),
    category_ids: card_categories.map((x) => x.category_id),
    zone_ids: card_zones.map((x) => x.zone_id),
    utility_ids: card_utilities.map((x) => x.utility_id),
    economy_ids: card_economies.map((x) => x.economy_id),
    round_type_ids: (card_round_types ?? []).map((x) => x.round_type_id),
  }
}

export async function fetchCards(): Promise<Card[]> {
  const rows = await fetchAll((a, b) =>
    supabase.from('cards').select(CARD_SELECT).order('id').range(a, b) as unknown as PromiseLike<{
      data: CardRow[] | null
      error: unknown
    }>,
  )
  return rows.map(toCard)
}

export interface CardPayload {
  id?: number | null
  title: string
  description: string
  map_id: number | null
  side: Side | null
  risk_id: number | null
  status: CardStatus
  media: Media[]
  role_ids: number[]
  category_ids: number[]
  zone_ids: number[]
  utility_ids: number[]
  economy_ids: number[]
  round_type_ids: number[]
  remember?: boolean
}

export async function saveCard(p: CardPayload): Promise<number> {
  return check(await supabase.rpc('save_card', { p })) as number
}

export async function deleteCard(id: number) {
  check(await supabase.from('cards').delete().eq('id', id))
}

export async function flagCard(id: number, comment: string) {
  check(await supabase.rpc('flag_card_for_review', { p_card: id, p_comment: comment }))
}
export async function resolveCardReview(id: number) {
  check(await supabase.rpc('resolve_card_review', { p_card: id }))
}

export async function fetchHistory(cardId: number): Promise<HistoryEntry[]> {
  return check(
    await supabase.from('card_history').select('*').eq('card_id', cardId).order('changed_at', { ascending: false }),
  ) as HistoryEntry[]
}

/** Cartes qui utilisent déjà l'un de ces liens (anti-doublon). */
export async function findDuplicateMedia(keys: string[], excludeCardId?: number | null) {
  if (!keys.length) return []
  let q = supabase.from('card_media').select('url_key, card_id, cards(id, title, status)').in('url_key', keys)
  if (excludeCardId) q = q.neq('card_id', excludeCardId)
  const rows = check(await q) as unknown as { url_key: string; card_id: number; cards: { id: number; title: string; status: CardStatus } | null }[]
  return rows.filter((r) => r.cards)
}

// ------------------------------------------------------------ Membres

export async function claimMembership(): Promise<Member | null> {
  const data = check(await supabase.rpc('claim_membership')) as Member | null
  return data && data.id ? data : null
}

export async function fetchMembers(): Promise<Member[]> {
  return check(await supabase.from('members').select('*').order('display_name')) as Member[]
}
export async function updateMember(id: string, values: Partial<Pick<Member, 'role' | 'display_name'>>) {
  check(await supabase.from('members').update(values).eq('id', id))
}
export async function removeMember(id: string) {
  check(await supabase.rpc('remove_member', { p_member: id }))
}

export async function fetchAllowlist(): Promise<AllowlistEntry[]> {
  return check(await supabase.from('allowlist').select('*').order('created_at', { ascending: false })) as AllowlistEntry[]
}
export async function addAllowlist(entry: { email?: string | null; discord_id?: string | null; role: string; note?: string }) {
  check(
    await supabase.from('allowlist').insert({
      email: entry.email?.trim().toLowerCase() || null,
      discord_id: entry.discord_id?.trim() || null,
      role: entry.role,
      note: entry.note?.trim() || null,
    }),
  )
}
export async function updateAllowlist(id: number, values: Partial<Pick<AllowlistEntry, 'role'>>) {
  check(await supabase.from('allowlist').update(values).eq('id', id))
}
export async function deleteAllowlist(id: number) {
  check(await supabase.from('allowlist').delete().eq('id', id))
}

export async function fetchLastValues(userId: string): Promise<LastValues> {
  const data = check(
    await supabase.from('member_prefs').select('last_values').eq('member_id', userId).maybeSingle(),
  ) as { last_values: LastValues } | null
  return data?.last_values ?? {}
}

/** Supprime les cartes de démonstration (titre préfixé « [Démo] ») que l'utilisateur peut supprimer. */
export async function deleteDemoCards(prefix: string) {
  const pattern = `${prefix.replace(/[%_\\]/g, '\\$&')}%`
  check(await supabase.from('cards').delete().like('title', pattern))
  check(await supabase.from('principles').delete().like('title', pattern))
}

// ------------------------------------------------------------ Principes de jeu

const PRINCIPLE_SELECT =
  '*, principle_maps(map_id), principle_roles(role_id), principle_categories(category_id), ' +
  'principle_round_types(round_type_id), principle_cards(card_id)'

interface PrincipleRow extends Omit<Principle, 'map_ids' | 'role_ids' | 'category_ids' | 'round_type_ids' | 'card_ids'> {
  principle_maps: { map_id: number }[]
  principle_roles: { role_id: number }[]
  principle_categories: { category_id: number }[]
  principle_round_types: { round_type_id: number }[]
  principle_cards: { card_id: number }[]
}

export async function fetchPrinciples(): Promise<Principle[]> {
  const rows = await fetchAll((a, b) =>
    supabase.from('principles').select(PRINCIPLE_SELECT).order('id').range(a, b) as unknown as PromiseLike<{
      data: PrincipleRow[] | null
      error: unknown
    }>,
  )
  return rows.map(({ principle_maps, principle_roles, principle_categories, principle_round_types, principle_cards, ...p }) => ({
    ...p,
    map_ids: principle_maps.map((x) => x.map_id),
    role_ids: principle_roles.map((x) => x.role_id),
    category_ids: principle_categories.map((x) => x.category_id),
    round_type_ids: principle_round_types.map((x) => x.round_type_id),
    card_ids: principle_cards.map((x) => x.card_id),
  }))
}

export interface PrinciplePayload {
  id?: number | null
  title: string
  summary: string
  body: string
  theme_id: number | null
  sides: Side[]
  pinned: boolean
  map_ids: number[]
  role_ids: number[]
  category_ids: number[]
  round_type_ids: number[]
}

export async function savePrinciple(p: PrinciplePayload): Promise<number> {
  return check(await supabase.rpc('save_principle', { p })) as number
}
export async function deletePrinciple(id: number) {
  check(await supabase.from('principles').delete().eq('id', id))
}
export async function linkPrincipleCard(principleId: number, cardId: number, userId: string) {
  check(await supabase.from('principle_cards').insert({ principle_id: principleId, card_id: cardId, linked_by: userId }))
}
export async function unlinkPrincipleCard(principleId: number, cardId: number) {
  check(await supabase.from('principle_cards').delete().eq('principle_id', principleId).eq('card_id', cardId))
}
