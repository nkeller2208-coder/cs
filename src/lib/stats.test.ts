import { describe, expect, it } from 'vitest'
import { buildBuckets, computeStats, contentKind } from './stats'
import type { Card, Tags } from './types'

const tags: Tags = {
  maps: [
    { id: 1, name: 'Mirage', sort_order: 1, archived: false },
    { id: 2, name: 'Nuke', sort_order: 2, archived: false },
  ],
  zones: [
    { id: 5, name: 'Palace', map_id: 1, sort_order: 1, archived: false, pending: false, created_by: null },
    { id: 6, name: 'Jungle', map_id: 1, sort_order: 2, archived: false, pending: false, created_by: null },
  ],
  roles: [
    { id: 10, name: 'Pivot B', side: 'CT', sort_order: 1, archived: false },
    { id: 20, name: 'Central', side: 'T', sort_order: 1, archived: false },
  ],
  categories: [{ id: 1, name: 'Stuff', shows_utility: true, sort_order: 1, archived: false }],
  risks: [{ id: 1, name: 'Passif', color: '#22c55e', sort_order: 1, archived: false }],
  utilities: [],
  economies: [],
}

const now = new Date('2026-09-30T12:00:00Z')
let n = 0
const card = (p: Partial<Card>): Card => ({
  id: ++n, title: 't', description: '', map_id: 1, side: 'CT', risk_id: null, status: 'published', review_comment: null,
  review_by: null, author_id: 'a', created_at: '2026-09-25T10:00:00Z', updated_by: null, updated_at: '2026-09-25T10:00:00Z',
  media: [], role_ids: [], category_ids: [1], zone_ids: [], utility_ids: [], economy_ids: [], ...p,
})

describe('computeStats', () => {
  const cards = [
    card({ role_ids: [10], zone_ids: [5], media: [{ kind: 'youtube', url: '', url_key: '' }] }),
    card({ role_ids: [10], author_id: 'b', created_at: '2026-08-15T10:00:00Z', risk_id: 1 }),
    card({ side: 'T', role_ids: [20], status: 'review', media: [{ kind: 'image', url: '', url_key: '' }] }),
    card({ status: 'draft', role_ids: [10] }),
  ]
  const s = computeStats(cards, tags, new Map(), '30', now)

  it('ignore les brouillons et compare à la période précédente', () => {
    expect(s.total).toBe(3)
    expect(s.created).toBe(2)
    expect(s.createdPrev).toBe(1)
    expect(s.review).toBe(1)
    expect(s.contributors).toBe(1)
  })
  it('calcule la couverture map × rôle et les zones couvertes', () => {
    const mirageCT = s.coverage.CT.rows.find((r) => r.mapName === 'Mirage')!
    expect(mirageCT.byRole.get(10)).toBe(2)
    expect(mirageCT.zonesCovered).toBe(1)
    expect(mirageCT.zonesTotal).toBe(2)
    expect(s.coverage.CT.rows.find((r) => r.mapName === 'Nuke')!.total).toBe(0)
  })
  it('répartit par type de contenu et risque', () => {
    expect(Object.fromEntries(s.content.map((c) => [c.kind, c.count]))).toEqual({ video: 1, image: 1, link: 0, text: 1 })
    expect(s.risks.find((r) => r.id === null)!.count).toBe(2)
  })
  it('regroupe l’activité par semaine', () => {
    expect(s.activity).toHaveLength(5)
    expect(s.activity.reduce((a, b) => a + b.count, 0)).toBe(2)
  })
})

describe('outils', () => {
  it('buckets mensuels pour 12 mois', () => {
    expect(buildBuckets('365', now, null)).toHaveLength(12)
  })
  it('type de contenu : la vidéo prime', () => {
    expect(contentKind(card({ media: [{ kind: 'image', url: '', url_key: '' }, { kind: 'youtube', url: '', url_key: '' }] }))).toBe('video')
  })
})
