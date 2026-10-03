import { describe, expect, it } from 'vitest'
import { EMPTY_FORM, formFromParams, nextInSeries, reconcile, setRoleAction, setRoleNote, toPayload, validate } from './cardForm'
import type { Tags } from './types'

const tags: Tags = {
  maps: [{ id: 1, name: 'Mirage', sort_order: 1, archived: false }],
  zones: [
    { id: 5, name: 'Palace', map_id: 1, sort_order: 1, archived: false, pending: false, created_by: null },
    { id: 6, name: 'Banana', map_id: 2, sort_order: 1, archived: false, pending: false, created_by: null },
  ],
  roles: [
    { id: 10, name: 'Pivot B', side: 'CT', sort_order: 1, archived: false },
    { id: 20, name: 'Central', side: 'T', sort_order: 1, archived: false },
  ],
  categories: [
    { id: 1, name: 'Stuff', shows_utility: true, shows_round_type: false, sort_order: 1, archived: false },
    { id: 2, name: 'Position', shows_utility: false, shows_round_type: false, sort_order: 2, archived: false },
  ],
  risks: [], utilities: [{ id: 1, name: 'Smoke', sort_order: 1, archived: false }], economies: [], round_types: [], role_actions: [
    { id: 1, name: 'Support', involved: true, color: '#22c55e', sort_order: 1, archived: false },
    { id: 2, name: 'Non concerné', involved: false, color: '#64748b', sort_order: 2, archived: false },
  ],
  sources: [{ id: 1, name: 'Devil', url: '', sort_order: 1, archived: false }],
  principle_themes: [], skill_groups: [],
}

describe('validate', () => {
  it('exige titre, map, side, catégorie et média ou description', () => {
    expect(Object.keys(validate(EMPTY_FORM)).sort()).toEqual(['category', 'map', 'media', 'side', 'title'])
    const ok = { ...EMPTY_FORM, title: 't', map_id: 1, side: 'CT' as const, category_ids: [2], description: 'x' }
    expect(validate(ok)).toEqual({})
    expect(validate({ ...ok, title: 'x'.repeat(101) }).title).toBeDefined()
  })
})

describe('pré-remplissage et cohérence', () => {
  it('reprend les filtres actifs', () => {
    const f = formFromParams(new URLSearchParams('map=1&side=CT&role=10,20&zone=5,6&cat=2'), tags)
    expect(f).toMatchObject({ map_id: 1, side: 'CT', role_ids: [10], zone_ids: [5], category_ids: [2] })
  })
  it('ignore les familles multi-valeurs à choix unique', () => {
    expect(formFromParams(new URLSearchParams('side=CT,T'), tags).side).toBeNull()
  })
  it('retire les rôles d’un autre side', () => {
    expect(reconcile({ ...EMPTY_FORM, side: 'T', role_ids: [10, 20] }, tags).role_ids).toEqual([20])
  })
  it('série : garde map, side, rôles, zones', () => {
    const f = nextInSeries({ ...EMPTY_FORM, id: 3, map_id: 1, side: 'CT', role_ids: [10], zone_ids: [5], title: 'a', category_ids: [2] })
    expect(f).toMatchObject({ id: null, map_id: 1, side: 'CT', role_ids: [10], zone_ids: [5], title: '', category_ids: [] })
  })
  it('n’envoie les utilitaires que pour un stuff', () => {
    expect(toPayload({ ...EMPTY_FORM, kind: 'strategy', utility_ids: [1] }, 'published', tags).utility_ids).toEqual([])
    expect(toPayload({ ...EMPTY_FORM, kind: 'stuff', utility_ids: [1] }, 'published', tags).utility_ids).toEqual([1])
  })
  it('source : envoyée, gardée en série, pré-remplie depuis le filtre', () => {
    expect(toPayload({ ...EMPTY_FORM, source_id: 1 }, 'draft', tags).source_id).toBe(1)
    expect(nextInSeries({ ...EMPTY_FORM, source_id: 1, title: 'x' }).source_id).toBe(1)
    expect(formFromParams(new URLSearchParams('src=1'), tags).source_id).toBe(1)
  })
  it('pré-remplit le type et le stuff depuis l’URL', () => {
    expect(formFromParams(new URLSearchParams('kind=stuff&map=1'), tags)).toMatchObject({ kind: 'stuff', map_id: 1 })
    expect(formFromParams(new URLSearchParams('stuff=12'), tags)).toMatchObject({ kind: 'strategy', stuff_links: [{ stuff_id: 12, role_id: null }] })
  })
})

describe('stratégie : actions des rôles et stuffs', () => {
  const base = { ...EMPTY_FORM, kind: 'strategy' as const, side: 'CT' as const, map_id: 1 }
  it('une action par rôle ; re-cliquer la retire ; la note est conservée', () => {
    let f = setRoleAction(base, 10, 1)
    f = setRoleNote(f, 10, 'lance la smoke')
    f = setRoleAction(f, 10, 2)
    expect(f.role_actions).toEqual([{ role_id: 10, action_id: 2, note: 'lance la smoke' }])
    expect(setRoleAction(f, 10, null).role_actions).toEqual([])
  })
  it('rôles concernés déduits des actions (« Non concerné » exclu)', () => {
    expect(toPayload(setRoleAction(base, 10, 1), 'published', tags).role_ids).toEqual([10])
    expect(toPayload(setRoleAction(base, 10, 2), 'published', tags).role_ids).toEqual([])
  })
  it('changer de side retire les actions et le lanceur des autres rôles', () => {
    const f = reconcile({ ...setRoleAction(base, 10, 1), stuff_links: [{ stuff_id: 3, role_id: 10 }], side: 'T' }, tags)
    expect(f.role_actions).toEqual([])
    expect(f.stuff_links).toEqual([{ stuff_id: 3, role_id: null }])
  })
  it('un stuff n’envoie ni actions ni stuffs ; validation propre à chaque type', () => {
    const p = toPayload({ ...setRoleAction(base, 10, 1), kind: 'stuff', stuff_links: [{ stuff_id: 3, role_id: null }] }, 'published', tags)
    expect(p.role_actions).toEqual([])
    expect(p.stuff_links).toEqual([])
    const stuff = { ...EMPTY_FORM, kind: 'stuff' as const, title: 't', map_id: 1, side: 'CT' as const, description: 'x' }
    expect(Object.keys(validate(stuff))).toEqual(['utility'])
    expect(validate({ ...stuff, utility_ids: [1] })).toEqual({})
  })
})
