import { describe, expect, it } from 'vitest'
import { analyzeRows, parseCsv, templateCsv } from './csvImport'
import type { Tags } from './types'

const tags: Tags = {
  maps: [{ id: 1, name: 'Mirage', sort_order: 1, archived: false }],
  zones: [{ id: 5, name: 'Palace', map_id: 1, sort_order: 1, archived: false, pending: false, created_by: null }],
  roles: [
    { id: 10, name: 'AWP', side: 'CT', sort_order: 1, archived: false },
    { id: 20, name: 'AWP', side: 'T', sort_order: 1, archived: false },
  ],
  categories: [
    { id: 1, name: 'Stuff', shows_utility: true, sort_order: 1, archived: false },
    { id: 2, name: 'Position', shows_utility: false, sort_order: 2, archived: false },
  ],
  risks: [{ id: 1, name: 'Passif', color: '#0f0', sort_order: 1, archived: false }],
  utilities: [{ id: 1, name: 'Smoke', sort_order: 1, archived: false }],
  economies: [{ id: 1, name: 'Eco', sort_order: 1, archived: false }],
}

describe('import CSV', () => {
  it('lit le modèle généré sans erreur', () => {
    const { rows, error } = parseCsv(templateCsv(tags))
    expect(error).toBeUndefined()
    const analyzed = analyzeRows(rows, tags, true)
    expect(analyzed.map((r) => r.errors)).toEqual([[], []])
    expect(analyzed[1].payload?.status).toBe('draft')
    expect(analyzed[1].payload?.description).toContain('\n- jouer passif')
  })

  it('résout les étiquettes sans tenir compte de la casse ni des accents, rôles selon le side', () => {
    const csv = 'Titre;Liens;Map;Side;Rôles;Catégories;Zones;Risque;Utilitaires\n' +
      'Test;https://youtu.be/abcdefghijk;mirage;t;awp;stuff;palace;PASSIF;smoke'
    const [row] = analyzeRows(parseCsv(csv).rows, tags, true)
    expect(row.errors).toEqual([])
    expect(row.payload).toMatchObject({ map_id: 1, side: 'T', role_ids: [20], category_ids: [1], zone_ids: [5], risk_id: 1, utility_ids: [1] })
  })

  it('signale les étiquettes inconnues et les zones à créer', () => {
    const csv = 'titre,description,map,side,categories,zones,roles\nA,x,Mirage,CT,Inconnue,Nouvelle,Pivot Z'
    const [row] = analyzeRows(parseCsv(csv).rows, tags, true)
    expect(row.payload).toBeNull()
    expect(row.errors.join(' ')).toContain('Catégorie inconnu(s) : Inconnue')
    expect(row.errors.join(' ')).toContain('Pivot Z')
    expect(row.newZones).toEqual(['Nouvelle'])
    const [strict] = analyzeRows(parseCsv(csv).rows, tags, false)
    expect(strict.errors.join(' ')).toContain('Zone inconnue')
  })

  it('refuse un fichier sans colonne titre', () => {
    expect(parseCsv('foo,bar\n1,2').error).toBeDefined()
  })
})
