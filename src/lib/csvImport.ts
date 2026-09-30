import Papa from 'papaparse'
import type { CardPayload } from './api'
import { parseMedia } from './media'
import { normalize } from './text'
import type { CardStatus, Side, Tag, Tags } from './types'

export const CSV_COLUMNS = [
  'titre', 'description', 'liens', 'map', 'side', 'roles', 'categories', 'zones', 'risque', 'utilitaires', 'rounds', 'economie', 'statut',
] as const
type Column = (typeof CSV_COLUMNS)[number]

export interface ImportRow {
  line: number
  title: string
  payload: CardPayload | null
  /** Zones inconnues à créer (marquées « à valider ») avant l'import. */
  newZones: string[]
  errors: string[]
  warnings: string[]
}

const HEADER_ALIASES: Record<string, Column> = {
  titre: 'titre', title: 'titre',
  description: 'description',
  liens: 'liens', lien: 'liens', medias: 'liens', media: 'liens', links: 'liens', url: 'liens', urls: 'liens',
  map: 'map', carte: 'map',
  side: 'side', camp: 'side',
  roles: 'roles', role: 'roles',
  categories: 'categories', categorie: 'categories',
  zones: 'zones', zone: 'zones', callouts: 'zones', callout: 'zones',
  risque: 'risque', risk: 'risque',
  utilitaires: 'utilitaires', utilitaire: 'utilitaires', stuff: 'utilitaires',
  economie: 'economie', eco: 'economie',
  rounds: 'rounds', round: 'rounds', typederound: 'rounds', roundlance: 'rounds', typesderound: 'rounds',
  statut: 'statut', status: 'statut',
}

const split = (s: string | undefined) =>
  (s ?? '').split(';').map((x) => x.trim()).filter(Boolean)

function find<T extends Tag>(list: T[], name: string): T | undefined {
  const n = normalize(name)
  return list.find((t) => normalize(t.name) === n && !t.archived) ?? list.find((t) => normalize(t.name) === n)
}

const STATUS: Record<string, CardStatus> = {
  '': 'published', publie: 'published', published: 'published', brouillon: 'draft', draft: 'draft',
}

export function parseCsv(text: string): { rows: Record<Column, string>[]; unknownColumns: string[]; error?: string } {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => HEADER_ALIASES[normalize(h).replace(/\s+/g, '')] ?? `?${h.trim()}`,
  })
  const fields = res.meta.fields ?? []
  const unknownColumns = fields.filter((f) => f.startsWith('?')).map((f) => f.slice(1))
  if (!fields.includes('titre')) {
    return { rows: [], unknownColumns, error: 'Colonne « titre » introuvable. Utilise le modèle CSV.' }
  }
  return { rows: res.data as Record<Column, string>[], unknownColumns }
}

export function analyzeRows(rows: Record<Column, string>[], tags: Tags, createZones: boolean): ImportRow[] {
  return rows.map((r, i) => {
    const errors: string[] = []
    const warnings: string[] = []
    const newZones: string[] = []
    const title = (r.titre ?? '').trim()
    const unknown = (label: string, names: string[]) => names.length && errors.push(`${label} inconnu(s) : ${names.join(', ')}`)

    const map = r.map?.trim() ? find(tags.maps, r.map) : undefined
    if (!r.map?.trim()) errors.push('Map manquante')
    else if (!map) errors.push(`Map inconnue : ${r.map.trim()}`)

    const sideRaw = (r.side ?? '').trim().toUpperCase()
    const side: Side | null = sideRaw === 'CT' ? 'CT' : sideRaw === 'T' || sideRaw === 'TERRO' ? 'T' : null
    if (!side) errors.push(sideRaw ? `Side invalide : ${sideRaw} (CT ou T)` : 'Side manquant')

    const resolve = <T extends Tag>(names: string[], list: T[], label: string) => {
      const found = names.map((n) => [n, find(list, n)] as const)
      unknown(label, found.filter(([, t]) => !t).map(([n]) => n))
      found.forEach(([, t]) => t?.archived && warnings.push(`« ${t.name} » est archivé(e)`))
      return found.flatMap(([, t]) => (t ? [t.id] : []))
    }

    const roles = resolve(split(r.roles), tags.roles.filter((x) => !side || x.side === side), side ? `Rôle ${side}` : 'Rôle')
    const cats = resolve(split(r.categories), tags.categories, 'Catégorie')
    if (!split(r.categories).length) errors.push('Au moins une catégorie est obligatoire')
    const utils = resolve(split(r.utilitaires), tags.utilities, 'Utilitaire')
    const ecos = resolve(split(r.economie), tags.economies, 'Économie')
    const rounds = resolve(split(r.rounds), tags.round_types, 'Type de round')
    const riskName = (r.risque ?? '').trim()
    const risk = riskName ? find(tags.risks, riskName) : undefined
    if (riskName && !risk) errors.push(`Risque inconnu : ${riskName}`)

    const zoneIds: number[] = []
    if (map) {
      for (const z of split(r.zones)) {
        const zone = find(tags.zones.filter((x) => x.map_id === map.id), z)
        if (zone) zoneIds.push(zone.id)
        else if (createZones) newZones.push(z)
        else errors.push(`Zone inconnue sur ${map.name} : ${z}`)
      }
      if (newZones.length) warnings.push(`Nouvelle(s) zone(s) à valider : ${newZones.join(', ')}`)
    }

    const media = split((r.liens ?? '').replace(/[\s,]+(?=https?:\/\/)/g, ';')).map((u) => [u, parseMedia(u)] as const)
    const badLinks = media.filter(([, m]) => !m).map(([u]) => u)
    if (badLinks.length) errors.push(`Lien(s) invalide(s) : ${badLinks.join(', ')}`)
    const description = (r.description ?? '').replace(/\\n/g, '\n').trim()

    if (!title) errors.push('Titre manquant')
    else if (title.length > 100) errors.push('Titre trop long (100 caractères max)')
    if (!media.length && !description) errors.push('Il faut au moins un lien ou une description')
    if (utils.length && !tags.categories.some((c) => c.shows_utility && cats.includes(c.id))) {
      warnings.push('Utilitaires ignorés (catégorie Stuff non cochée)')
    }
    if (rounds.length && !tags.categories.some((c) => c.shows_round_type && cats.includes(c.id))) {
      warnings.push('Types de round ignorés (catégorie « Round lancé » non cochée)')
    }

    const statusKey = normalize(r.statut ?? '')
    const status = STATUS[statusKey]
    if (!status) errors.push(`Statut inconnu : ${r.statut} (publié ou brouillon)`)

    return {
      line: i + 2, // +1 pour l'en-tête, +1 pour la numérotation humaine
      title,
      newZones,
      errors,
      warnings,
      payload: errors.length
        ? null
        : {
            title,
            description,
            map_id: map!.id,
            side,
            risk_id: risk?.id ?? null,
            status: status!,
            media: media.map(([, m]) => ({ url: m!.url, kind: m!.kind, url_key: m!.url_key })),
            role_ids: roles,
            category_ids: cats,
            zone_ids: zoneIds,
            utility_ids: utils,
            economy_ids: ecos,
            round_type_ids: rounds,
            remember: false,
          },
    }
  })
}

export function templateCsv(tags: Tags): string {
  const first = <T extends Tag>(l: T[]) => l.find((t) => !t.archived)?.name ?? ''
  const mapName = first(tags.maps)
  const mapId = tags.maps.find((m) => m.name === mapName)?.id
  const zones = tags.zones.filter((z) => z.map_id === mapId && !z.archived).slice(0, 2).map((z) => z.name)
  const ct = tags.roles.filter((r) => r.side === 'CT' && !r.archived).map((r) => r.name)
  const t = tags.roles.filter((r) => r.side === 'T' && !r.archived).map((r) => r.name)
  const stuff = tags.categories.find((c) => c.shows_utility && !c.archived)?.name ?? ''
  const rows = [
    CSV_COLUMNS as unknown as string[],
    [
      'Smoke window depuis T spawn', 'Viser le coin du toit puis **jumpthrow**.', 'https://www.youtube.com/watch?v=XXXXXXXXXXX&t=42s',
      mapName, 'T', t.slice(0, 1).join(';'), stuff, zones.join(';'), first(tags.risks), first(tags.utilities), '', first(tags.economies), 'publié',
    ],
    [
      'Position fixe A', 'Tenir le site depuis le coin.\\n- jouer passif\\n- reculer si flash', 'https://i.imgur.com/XXXXXXX.png',
      mapName, 'CT', ct.slice(0, 2).join(';'), tags.categories.find((c) => !c.shows_utility && !c.archived)?.name ?? '', zones.slice(0, 1).join(';'),
      first(tags.risks), '', '', '', 'brouillon',
    ],
  ]
  return '﻿' + Papa.unparse(rows, { quotes: true })
}
