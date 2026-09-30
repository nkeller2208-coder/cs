import { describe, expect, it } from 'vitest'
import { applyFilters, EMPTY_FILTERS, facetCounts, filtersFromParams, filtersToParams, type Filters } from './filters'
import type { Card } from './types'

let n = 0
function card(p: Partial<Card>): Card {
  n++
  return {
    id: n, title: `Carte ${n}`, description: '', map_id: 1, side: 'CT', risk_id: null, status: 'published',
    review_comment: null, review_by: null, author_id: 'u1', created_at: `2026-01-${String(n).padStart(2, '0')}T00:00:00Z`,
    updated_by: null, updated_at: '', media: [], role_ids: [], category_ids: [], zone_ids: [], utility_ids: [],
    economy_ids: [], ...p,
  }
}

const cards = [
  card({ map_id: 1, side: 'CT', role_ids: [10], title: 'Smoke fenêtre' }),
  card({ map_id: 1, side: 'CT', role_ids: [11] }),
  card({ map_id: 1, side: 'T', role_ids: [20] }),
  card({ map_id: 2, side: 'CT', role_ids: [10] }),
  card({ map_id: 1, side: 'CT', role_ids: [10], status: 'draft', author_id: 'u2' }),
  card({ map_id: 1, side: 'CT', role_ids: [12], status: 'review' }),
]
const f = (p: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...p })

describe('applyFilters', () => {
  it('ET entre familles, OU dans une famille', () => {
    expect(applyFilters(cards, f({ map: [1], side: ['CT'], role: [10, 11] }), 'u1').map((c) => c.id)).toEqual([2, 1])
  })
  it('masque les brouillons des autres, montre les siens dans « Mes brouillons »', () => {
    expect(applyFilters(cards, f({}), 'u1')).toHaveLength(5)
    expect(applyFilters(cards, f({ view: 'drafts' }), 'u2').map((c) => c.id)).toEqual([5])
    expect(applyFilters(cards, f({ view: 'review' }), 'u1').map((c) => c.id)).toEqual([6])
  })
  it('recherche plein texte insensible aux accents', () => {
    expect(applyFilters(cards, f({ q: 'FENETRE smoke' }), 'u1').map((c) => c.id)).toEqual([1])
  })
  it('tri alphabétique', () => {
    const out = applyFilters([card({ title: 'b' }), card({ title: 'A' })], f({ sort: 'alpha' }), 'u1')
    expect(out.map((c) => c.title)).toEqual(['A', 'b'])
  })
})

describe('facetCounts', () => {
  it('compte chaque option en ignorant sa propre famille', () => {
    const c = facetCounts(cards, f({ map: [1], role: [10] }), 'u1')
    expect(c.map.get(1)).toBe(1)
    expect(c.map.get(2)).toBe(1)
    expect(c.role.get(10)).toBe(1)
    expect(c.role.get(11)).toBe(1)
    expect(c.role.get(12)).toBe(1)
    expect(c.side.get('CT')).toBe(1)
  })
})

describe('URL', () => {
  it('aller-retour', () => {
    const x = f({ map: [3], side: ['CT', 'T'], role: [1, 2], q: 'smoke', sort: 'alpha', view: 'review' })
    expect(filtersFromParams(new URLSearchParams(filtersToParams(x).toString()))).toEqual(x)
    expect(filtersToParams(EMPTY_FILTERS).toString()).toBe('')
  })
})
