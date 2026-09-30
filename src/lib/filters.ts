import type { Card, Side, Tags } from './types'
import { normalize } from './text'

/** Familles d'étiquettes filtrables : ET entre familles, OU au sein d'une famille. */
export const FAMILIES = ['map', 'side', 'role', 'zone', 'cat', 'util', 'risk', 'eco'] as const
export type Family = (typeof FAMILIES)[number]

export type SortKey = 'recent' | 'oldest' | 'alpha'
/** all = publiées + à revoir ; review = à revoir ; drafts = mes brouillons ; mine = mes cartes */
export type ViewKey = 'all' | 'review' | 'drafts' | 'mine'

export interface Filters {
  map: number[]
  side: Side[]
  role: number[]
  zone: number[]
  cat: number[]
  util: number[]
  risk: number[]
  eco: number[]
  q: string
  sort: SortKey
  view: ViewKey
}

export const EMPTY_FILTERS: Filters = {
  map: [], side: [], role: [], zone: [], cat: [], util: [], risk: [], eco: [],
  q: '', sort: 'recent', view: 'all',
}

/** Valeurs d'une carte pour une famille donnée. */
export function cardValues(card: Card, family: Family): (number | string)[] {
  switch (family) {
    case 'map': return card.map_id == null ? [] : [card.map_id]
    case 'side': return card.side ? [card.side] : []
    case 'role': return card.role_ids
    case 'zone': return card.zone_ids
    case 'cat': return card.category_ids
    case 'util': return card.utility_ids
    case 'risk': return card.risk_id == null ? [] : [card.risk_id]
    case 'eco': return card.economy_ids
  }
}

// ---------------------------------------------------------------- URL

export function filtersFromParams(params: URLSearchParams): Filters {
  const nums = (k: string) =>
    (params.get(k) ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)
  const sort = params.get('sort')
  const view = params.get('view')
  return {
    map: nums('map'),
    side: (params.get('side') ?? '').split(',').filter((s): s is Side => s === 'CT' || s === 'T'),
    role: nums('role'),
    zone: nums('zone'),
    cat: nums('cat'),
    util: nums('util'),
    risk: nums('risk'),
    eco: nums('eco'),
    q: params.get('q') ?? '',
    sort: sort === 'oldest' || sort === 'alpha' ? sort : 'recent',
    view: view === 'review' || view === 'drafts' || view === 'mine' ? view : 'all',
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
  return p
}

export function activeFilterCount(f: Filters): number {
  return FAMILIES.reduce((n, fam) => n + f[fam].length, 0) + (f.q.trim() ? 1 : 0) + (f.view !== 'all' ? 1 : 0)
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

/** Cartes correspondant à toutes les familles sauf `except` (pour les compteurs). */
function baseMatch(card: Card, f: Filters, userId: string | undefined, except?: Family): boolean {
  if (!matchesView(card, f.view, userId) || !matchesQuery(card, f.q)) return false
  for (const fam of FAMILIES) {
    if (fam !== except && !matchesFamily(card, f, fam)) return false
  }
  return true
}

export function applyFilters(cards: Card[], f: Filters, userId: string | undefined): Card[] {
  const out = cards.filter((c) => baseMatch(c, f, userId))
  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })
  switch (f.sort) {
    case 'recent': return out.sort((a, b) => b.created_at.localeCompare(a.created_at))
    case 'oldest': return out.sort((a, b) => a.created_at.localeCompare(b.created_at))
    case 'alpha': return out.sort((a, b) => collator.compare(a.title, b.title))
  }
}

export type FacetCounts = Record<Family, Map<number | string, number>>

/**
 * Compteur par option : nombre de cartes qu'on obtiendrait en ajoutant cette
 * option, compte tenu des filtres des autres familles.
 */
export function facetCounts(cards: Card[], f: Filters, userId: string | undefined): FacetCounts {
  const counts = Object.fromEntries(FAMILIES.map((fam) => [fam, new Map()])) as FacetCounts
  for (const card of cards) {
    if (!matchesView(card, f.view, userId) || !matchesQuery(card, f.q)) continue
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

export function viewCounts(cards: Card[], userId: string | undefined): Record<ViewKey, number> {
  const out: Record<ViewKey, number> = { all: 0, review: 0, drafts: 0, mine: 0 }
  for (const c of cards) for (const v of ['all', 'review', 'drafts', 'mine'] as const) if (matchesView(c, v, userId)) out[v]++
  return out
}
