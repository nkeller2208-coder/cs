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
    { id: 1, name: 'Stuff', shows_utility: true, shows_round_type: false, sort_order: 1, archived: false },
    { id: 2, name: 'Position', shows_utility: false, shows_round_type: false, sort_order: 2, archived: false },
  ],
  risks: [{ id: 1, name: 'Passif', color: '#0f0', sort_order: 1, archived: false }],
  utilities: [{ id: 1, name: 'Smoke', sort_order: 1, archived: false }],
  economies: [{ id: 1, name: 'Eco', sort_order: 1, archived: false }],
  round_types: [],
  role_actions: [],
  sources: [{ id: 1, name: 'Devil', url: '', sort_order: 1, archived: false }, { id: 2, name: 'Le Repère', url: '', sort_order: 2, archived: false }],
  principle_themes: [], skill_groups: [],
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
    // Ancien format (catégorie « Stuff ») : devient une carte stuff, sans la catégorie.
    expect(row.payload).toMatchObject({ kind: 'stuff', map_id: 1, side: 'T', role_ids: [20], category_ids: [], zone_ids: [5], risk_id: 1, utility_ids: [1] })
  })

  it('colonne « type » : stratégie ou stuff, avec leurs champs obligatoires', () => {
    const csv = [
      'type;titre;description;map;side;categories;utilitaires',
      'Stratégie;A;x;Mirage;CT;;',
      'stuff;B;x;Mirage;T;;',
      'strat;C;x;Mirage;CT;Position;smoke',
      'bidon;D;x;Mirage;CT;Position;',
    ].join('\n')
    const [a, b, c, d] = analyzeRows(parseCsv(csv).rows, tags, true)
    expect(a.errors.join(' ')).toContain('catégorie est obligatoire')
    expect(b.errors.join(' ')).toContain("type d'utilitaire")
    expect(c.errors).toEqual([])
    expect(c.payload).toMatchObject({ kind: 'strategy', utility_ids: [] })
    expect(c.warnings.join(' ')).toContain('Utilitaires ignorés')
    expect(d.errors.join(' ')).toContain('Type inconnu')
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

  it('colonne « source » : reconnue sans tenir compte des accents ; inconnue créée ou refusée', () => {
    const csv = ['type;titre;description;map;side;utilitaires;source', 'stuff;A;x;Mirage;T;Smoke;le repere', 'stuff;B;x;Mirage;T;Smoke;Inconnu'].join('\n')
    const [a, b] = analyzeRows(parseCsv(csv).rows, tags, true)
    expect(a.payload?.source_id).toBe(2)
    expect(b.errors).toEqual([])
    expect(b.newSource).toBe('Inconnu')
    const [, strict] = analyzeRows(parseCsv(csv).rows, tags, false)
    expect(strict.errors.join(' ')).toContain('Source inconnue')
  })

  it('refuse un fichier sans colonne titre', () => {
    expect(parseCsv('foo,bar\n1,2').error).toBeDefined()
  })
})
