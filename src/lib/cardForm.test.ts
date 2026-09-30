import { describe, expect, it } from 'vitest'
import { EMPTY_FORM, formFromParams, nextInSeries, reconcile, toPayload, validate } from './cardForm'
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
    { id: 1, name: 'Stuff', shows_utility: true, sort_order: 1, archived: false },
    { id: 2, name: 'Position', shows_utility: false, sort_order: 2, archived: false },
  ],
  risks: [], utilities: [{ id: 1, name: 'Smoke', sort_order: 1, archived: false }], economies: [],
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
  it('n’envoie les utilitaires que si Stuff est coché', () => {
    expect(toPayload({ ...EMPTY_FORM, category_ids: [2], utility_ids: [1] }, 'published', tags).utility_ids).toEqual([])
    expect(toPayload({ ...EMPTY_FORM, category_ids: [1], utility_ids: [1] }, 'published', tags).utility_ids).toEqual([1])
  })
})
