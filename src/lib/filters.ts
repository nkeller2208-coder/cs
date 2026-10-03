import type { Card, CardKind, Side, Tags } from './types'
import { normalize } from './text'

/** Familles d'étiquettes filtrables : ET entre familles, OU au sein d'une famille. */
export const FAMILIES = ['map', 'side', 'role', 'act', 'zone', 'cat', 'util', 'round', 'risk', 'eco', 'src'] as const
export type Family = (typeof FAMILIES)[number]

export type SortKey = 'recent' | 'oldest' | 'alpha'
/** all = publiées + à revoir ; review = à revoir ; drafts = mes brouillons ; mine = mes cartes */
export type ViewKey = 'all' | 'review' | 'drafts' | 'mine'

export interface Filters {
  /** Rubrique affichée (fixée par la page, pas dans l'URL). */
  kind: CardKind
  map: number[]
  side: Side[]
  role: number[]
  /** Actions des rôles (stratégies) : Lurk, Support… */
  act: number[]
  zone: number[]
  cat: number[]
  util: number[]
  round: number[]
  risk: number[]
  eco: number[]
  /** Source (Devil, Le Repère…). */
  src: number[]
  q: string
  sort: SortKey
  view: ViewKey
  /** « Mes rôles » : uniquement les cartes qui concernent un de mes rôles en jeu. */
  mine: boolean
  /** « À apprendre » : stratégies que l'une de mes équipes doit apprendre. */
  todo: boolean
  /** « Pas encore notées » : cartes que je n'ai pas encore notées. */
  unrated: boolean
}

/** Contexte de l'utilisateur pour le filtrage. */
export interface FilterContext {
  userId?: string
  /** Rôles en jeu du membre (Espace perso). */
  myRoleIds?: number[]
}

export const EMPTY_FILTERS: Filters = {
  kind: 'strategy', map: [], side: [], role: [], act: [], zone: [], cat: [], util: [], round: [], risk: [], eco: [], src: [],
  q: '', sort: 'recent', view: 'all', mine: false, todo: false, unrated: false,
}

/** Valeurs d'une carte pour une famille donnée. */
export function cardValues(card: Card, family: Family): (number | string)[] {
  switch (family) {
    case 'map': return card.map_id == null ? [] : [card.map_id]
    case 'side': return card.side ? [card.side] : []
    case 'role': return card.role_ids
    case 'act': return (card.role_actions ?? []).map((a) => a.action_id)
    case 'zone': return card.zone_ids
    case 'cat': return card.category_ids
    case 'util': return card.utility_ids
    case 'round': return card.round_type_ids
    case 'risk': return card.risk_id == null ? [] : [card.risk_id]
    case 'eco': return card.economy_ids
    case 'src': return card.source_id == null ? [] : [card.source_id]
  }
}

// ---------------------------------------------------------------- URL

export function filtersFromParams(params: URLSearchParams, kind: CardKind = 'strategy'): Filters {
  const nums = (k: string) =>
    (params.get(k) ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)
  const sort = params.get('sort')
  const view = params.get('view')
  return {
    kind,
    map: nums('map'),
    side: (params.get('side') ?? '').split(',').filter((s): s is Side => s === 'CT' || s === 'T'),
    role: nums('role'),
    act: nums('act'),
    zone: nums('zone'),
    cat: nums('cat'),
    util: nums('util'),
    round: nums('round'),
    risk: nums('risk'),
    eco: nums('eco'),
    src: nums('src'),
    q: params.get('q') ?? '',
    sort: sort === 'oldest' || sort === 'alpha' ? sort : 'recent',
    view: view === 'review' || view === 'drafts' || view === 'mine' ? view : 'all',
    mine: params.get('mesroles') === '1',
    todo: params.get('aapprendre') === '1',
    unrated: params.get('nonnotees') === '1',
  }
}

export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams()
  for (const fam of FAMILIES) {
    const values = f[fam] as (number | string)[]
    if (values.length) p.set(fam, values.join(','))
  }
  if (f.q.trim()) p.set('q', f.q)
  if (f.sort !== 'recent') p.set('sort', f.sort)
  if (f.view !== 'all') p.set('view', f.view)
  if (f.mine) p.set('mesroles', '1')
  if (f.todo) p.set('aapprendre', '1')
  if (f.unrated) p.set('nonnotees', '1')
  return p
}

export function activeFilterCount(f: Filters): number {
  return FAMILIES.reduce((n, fam) => n + f[fam].length, 0) + (f.q.trim() ? 1 : 0) + (f.view !== 'all' ? 1 : 0) + (f.mine ? 1 : 0) + (f.todo ? 1 : 0) + (f.unrated ? 1 : 0)
}

/**
 * Retire les sélections devenues incohérentes : rôles d'un autre side,
 * zones d'une autre map, utilitaires sans catégorie « Stuff ».
 */
export function pruneFilters(f: Filters, tags: Tags): Filters {
  const next = { ...f }
  if (f.side.length) {
    const ok = new Set(tags.roles.filter((r) => f.side.includes(r.side)).map((r) => r.id))
    next.role = f.role.filter((id) => ok.has(id))
  }
  if (f.map.length) {
    const ok = new Set(tags.zones.filter((z) => f.map.includes(z.map_id)).map((z) => z.id))
    next.zone = f.zone.filter((id) => ok.has(id))
  } else {
    next.zone = []
  }
  return next
}

// ---------------------------------------------------------------- Filtrage

function matchesView(card: Card, view: ViewKey, userId: string | undefined): boolean {
  switch (view) {
    case 'all': return card.status !== 'draft'
    case 'review': return card.status === 'review'
    case 'drafts': return card.status === 'draft' && card.author_id === userId
    case 'mine': return card.author_id === userId
  }
}

export function searchText(card: Card): string {
  return normalize(`${card.title} ${card.description}`)
}

function matchesQuery(card: Card, q: string): boolean {
  const terms = normalize(q).split(' ').filter(Boolean)
  if (!terms.length) return true
  const hay = searchText(card)
  return terms.every((t) => hay.includes(t))
}

function matchesFamily(card: Card, f: Filters, fam: Family): boolean {
  const selected = f[fam] as (number | string)[]
  if (!selected.length) return true
  const values = cardValues(card, fam)
  return selected.some((v) => values.includes(v))
}

/** Rubrique (stratégies / stuff) et « mes rôles » : conditions préalables à tout le reste. */
function inScope(card: Card, f: Filters, ctx: FilterContext): boolean {
  if ((card.kind ?? 'strategy') !== f.kind) return false
  if (f.mine && !card.role_ids.some((r) => ctx.myRoleIds?.includes(r))) return false
  if (f.todo && !card.learning?.some((l) => l.status === 'to_learn')) return false
  if (f.unrated && card.my_rating) return false
  return matchesView(card, f.view, ctx.userId) && matchesQuery(card, f.q)
}

const asCtx = (c: string | undefined | FilterContext): FilterContext => (typeof c === 'object' ? c : { userId: c })

/** Cartes correspondant à toutes les familles sauf `except` (pour les compteurs). */
function baseMatch(card: Card, f: Filters, ctx: FilterContext, except?: Family): boolean {
  if (!inScope(card, f, ctx)) return false
  for (const fam of FAMILIES) {
    if (fam !== except && !matchesFamily(card, f, fam)) return false
  }
  return true
}

export function applyFilters(cards: Card[], f: Filters, ctx: string | undefined | FilterContext): Card[] {
  const out = cards.filter((c) => baseMatch(c, f, asCtx(ctx)))
  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })
  switch (f.sort) {
    // L'id départage les cartes créées au même instant (import, démo) : ordre stable.
    case 'recent': return out.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
    case 'oldest': return out.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
    case 'alpha': return out.sort((a, b) => collator.compare(a.title, b.title) || a.id - b.id)
  }
}

export type FacetCounts = Record<Family, Map<number | string, number>>

/**
 * Compteur par option : nombre de cartes qu'on obtiendrait en ajoutant cette
 * option, compte tenu des filtres des autres familles.
 */
export function facetCounts(cards: Card[], f: Filters, ctx: string | undefined | FilterContext): FacetCounts {
  const counts = Object.fromEntries(FAMILIES.map((fam) => [fam, new Map()])) as FacetCounts
  const c = asCtx(ctx)
  for (const card of cards) {
    if (!inScope(card, f, c)) continue
    // Nombre de familles non satisfaites : si 0, la carte compte partout ;
    // si 1, elle ne compte que pour la famille fautive.
    const failing = FAMILIES.filter((fam) => !matchesFamily(card, f, fam))
    if (failing.length > 1) continue
    for (const fam of FAMILIES) {
      if (failing.length === 1 && failing[0] !== fam) continue
      const m = counts[fam]
      for (const v of new Set(cardValues(card, fam))) m.set(v, (m.get(v) ?? 0) + 1)
    }
  }
  return counts
}

export function viewCounts(cards: Card[], userId: string | undefined, kind: CardKind = 'strategy'): Record<ViewKey, number> {
  const out: Record<ViewKey, number> = { all: 0, review: 0, drafts: 0, mine: 0 }
  for (const c of cards) {
    if ((c.kind ?? 'strategy') !== kind) continue
    for (const v of ['all', 'review', 'drafts', 'mine'] as const) if (matchesView(c, v, userId)) out[v]++
  }
  return out
}
