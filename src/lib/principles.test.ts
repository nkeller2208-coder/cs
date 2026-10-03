import { describe, expect, it } from 'vitest'
import { cardsForPrinciple, principleFilterHref, principleMatchesCard, principlesForCard } from './principles'
import type { Card, Principle } from './types'

const principle = (p: Partial<Principle>): Principle => ({
  id: 1, title: 'P', summary: '', body: '', theme_id: null, sides: [], pinned: false, sort_order: 0, author_id: null,
  created_at: '', updated_by: null, updated_at: '', map_ids: [], role_ids: [], category_ids: [], round_type_ids: [],
  card_ids: [], ...p,
})
const card = (p: Partial<Card>): Card => ({
  id: 1, title: 'c', description: '', map_id: 1, side: 'T', risk_id: null, status: 'published', review_comment: null,
  review_by: null, author_id: 'a', created_at: '', updated_by: null, updated_at: '', media: [], role_ids: [],
  category_ids: [], zone_ids: [], utility_ids: [], economy_ids: [], round_type_ids: [], kind: 'strategy', role_actions: [], stuff_links: [], source_id: null, ...p,
})

describe('principes', () => {
  it('un principe général ne s’applique qu’explicitement', () => {
    const p = principle({ card_ids: [2] })
    expect(principleMatchesCard(p, card({}))).toBe(false)
    expect(principlesForCard(card({ id: 2 }), [p]).linked).toHaveLength(1)
  })
  it('ET entre familles, OU au sein d’une famille', () => {
    const p = principle({ sides: ['T'], category_ids: [9], round_type_ids: [1, 2] })
    expect(principleMatchesCard(p, card({ category_ids: [9], round_type_ids: [2] }))).toBe(true)
    expect(principleMatchesCard(p, card({ category_ids: [9], round_type_ids: [3] }))).toBe(false)
    expect(principleMatchesCard(p, card({ side: 'CT', category_ids: [9], round_type_ids: [1] }))).toBe(false)
  })
  it('sépare cartes rattachées et concernées, sans brouillons', () => {
    const p = principle({ sides: ['T'], card_ids: [1] })
    const r = cardsForPrinciple(p, [card({ id: 1 }), card({ id: 2 }), card({ id: 3, status: 'draft' })])
    expect(r.linked.map((c) => c.id)).toEqual([1])
    expect(r.matching.map((c) => c.id)).toEqual([2])
  })
  it('lien vers la grille filtrée', () => {
    expect(principleFilterHref(principle({ sides: ['T'], category_ids: [9], round_type_ids: [1] }))).toBe('/?side=T&cat=9&round=1')
  })
})
