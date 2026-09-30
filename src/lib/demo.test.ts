import { describe, expect, it } from 'vitest'
import { buildDemoCards, buildDemoPrinciples, DEMO_PREFIX } from './demo'
import type { Tags } from './types'

const t = (id: number, name: string) => ({ id, name, sort_order: id, archived: false })
const tags: Tags = {
  maps: ['Ancient', 'Anubis', 'Dust II', 'Inferno', 'Mirage', 'Nuke', 'Overpass', 'Train'].map((n, i) => t(i + 1, n)),
  zones: [{ ...t(100, 'Window'), map_id: 5, pending: false, created_by: null }, { ...t(101, 'Banana'), map_id: 4, pending: false, created_by: null }],
  roles: [{ ...t(10, 'Central'), side: 'T' }, { ...t(11, 'Fixe A'), side: 'CT' }],
  categories: ['Stuff', 'Position', 'Move solo', 'Routine', 'Prise de zone', 'Reprise de zone', 'Retake', 'Post-plant', 'Round lancé'].map((n, i) => ({ ...t(i + 1, n), shows_utility: n === 'Stuff', shows_round_type: n === 'Round lancé' })),
  risks: [{ ...t(1, 'Passif'), color: '#0f0' }],
  utilities: [t(1, 'Smoke')],
  economies: [t(1, 'Full buy')],
  round_types: [t(1, 'Rush')],
  principle_themes: [],
}

describe('cartes de démo', () => {
  const cards = buildDemoCards(tags)
  it('couvre tous les types de contenu et statuts', () => {
    expect(cards.length).toBe(13)
    const kinds = new Set(cards.flatMap((c) => c.payload.media.map((m) => m.kind)))
    expect(kinds).toEqual(new Set(['youtube', 'image', 'link']))
    expect(cards.some((c) => !c.payload.media.length)).toBe(true)
    expect(cards.filter((c) => c.payload.status === 'draft')).toHaveLength(1)
    expect(cards.filter((c) => c.review)).toHaveLength(1)
    expect(cards.every((c) => c.payload.title.startsWith(DEMO_PREFIX))).toBe(true)
  })
  it('ne référence que des étiquettes cohérentes (rôles du side, zones de la map)', () => {
    const first = cards[0].payload
    expect(first).toMatchObject({ side: 'T', role_ids: [10], zone_ids: [100], utility_ids: [1] })
    for (const c of cards) {
      for (const r of c.payload.role_ids) expect(tags.roles.find((x) => x.id === r)!.side).toBe(c.payload.side)
      for (const z of c.payload.zone_ids) expect(tags.zones.find((x) => x.id === z)!.map_id).toBe(c.payload.map_id)
    }
  })
  it('rattache les types de round aux cartes « Round lancé »', () => {
    const rush = cards.find((c) => c.payload.title.includes('Rush B'))!.payload
    expect(rush.round_type_ids).toEqual([1])
  })
  it('prépare des principes généraux et par étiquettes', () => {
    const ps = buildDemoPrinciples(tags)
    expect(ps).toHaveLength(4)
    expect(ps[0].cardTitles).toContain(DEMO_PREFIX + 'Exé B complète')
    expect(ps[1].payload).toMatchObject({ sides: ['T'], category_ids: [9] })
  })
})
