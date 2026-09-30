import type { Card, CardStatus, LastValues, Side, Tags } from './types'
import type { CardPayload } from './api'
import { describeMedia } from './media'
import { filtersFromParams } from './filters'
import { formatTimestamp } from './text'
import type { FormMedia } from '../components/MediaField'

export interface FormState {
  id: number | null
  status: CardStatus
  media: FormMedia[]
  map_id: number | null
  side: Side | null
  role_ids: number[]
  zone_ids: number[]
  category_ids: number[]
  utility_ids: number[]
  risk_id: number | null
  economy_ids: number[]
  title: string
  titleTouched: boolean
  description: string
}

export const EMPTY_FORM: FormState = {
  id: null, status: 'draft', media: [], map_id: null, side: null, role_ids: [], zone_ids: [], category_ids: [],
  utility_ids: [], risk_id: null, economy_ids: [], title: '', titleTouched: false, description: '',
}

export type FormErrors = Partial<Record<'media' | 'title' | 'map' | 'side' | 'category', string>>

export const TITLE_MAX = 100

export function validate(f: FormState): FormErrors {
  const e: FormErrors = {}
  if (!f.media.length && !f.description.trim()) e.media = 'Ajoute au moins un lien média, ou une description plus bas.'
  if (!f.map_id) e.map = 'Choisis une map.'
  if (!f.side) e.side = 'Choisis un side.'
  if (!f.category_ids.length) e.category = 'Coche au moins une catégorie.'
  if (!f.title.trim()) e.title = 'Le titre est obligatoire.'
  else if (f.title.length > TITLE_MAX) e.title = `${TITLE_MAX} caractères maximum.`
  return e
}

/** Le type d'utilitaire n'est proposé que si une catégorie « Stuff » est cochée. */
export function showsUtility(f: Pick<FormState, 'category_ids'>, tags: Tags): boolean {
  return tags.categories.some((c) => c.shows_utility && f.category_ids.includes(c.id))
}

/** Garde la cohérence : rôles du side, zones de la map. */
export function reconcile(f: FormState, tags: Tags): FormState {
  const roleOk = new Set(tags.roles.filter((r) => r.side === f.side).map((r) => r.id))
  const zoneOk = new Set(tags.zones.filter((z) => z.map_id === f.map_id).map((z) => z.id))
  return {
    ...f,
    role_ids: f.role_ids.filter((id) => roleOk.has(id)),
    zone_ids: f.zone_ids.filter((id) => zoneOk.has(id)),
  }
}

export function toPayload(f: FormState, status: CardStatus, tags: Tags): CardPayload {
  return {
    id: f.id,
    title: f.title.trim().slice(0, TITLE_MAX),
    description: f.description,
    map_id: f.map_id,
    side: f.side,
    risk_id: f.risk_id,
    status,
    media: f.media.map(({ url, kind, url_key }) => ({ url, kind, url_key })),
    role_ids: f.role_ids,
    category_ids: f.category_ids,
    zone_ids: f.zone_ids,
    utility_ids: showsUtility(f, tags) ? f.utility_ids : [],
    economy_ids: f.economy_ids,
    remember: status !== 'draft',
  }
}

let seq = 0
export function formFromCard(c: Card): FormState {
  return {
    id: c.id,
    status: c.status,
    media: c.media.map((m) => {
      const p = describeMedia(m)
      return { ...p, url_key: m.url_key, uid: `c${c.id}-${seq++}`, startInput: p.start ? formatTimestamp(p.start) : '' }
    }),
    map_id: c.map_id,
    side: c.side,
    role_ids: c.role_ids,
    zone_ids: c.zone_ids,
    category_ids: c.category_ids,
    utility_ids: c.utility_ids,
    risk_id: c.risk_id,
    economy_ids: c.economy_ids,
    title: c.title,
    titleTouched: true,
    description: c.description,
  }
}

/** Duplication : tout est copié sauf l'identité et le statut. */
export function formFromDuplicate(c: Card): FormState {
  return { ...formFromCard(c), id: null, status: 'draft', title: `${c.title} (copie)`.slice(0, TITLE_MAX) }
}

/** Pré-remplissage depuis les filtres actifs (URL de la vue filtrée). */
export function formFromParams(params: URLSearchParams, tags: Tags): FormState {
  const f = filtersFromParams(params)
  const one = <T,>(list: T[]) => (list.length === 1 ? list[0] : null)
  return reconcile(
    {
      ...EMPTY_FORM,
      map_id: one(f.map),
      side: one(f.side),
      role_ids: f.role,
      zone_ids: f.zone,
      category_ids: f.cat,
      utility_ids: f.util,
      risk_id: one(f.risk),
      economy_ids: f.eco,
    },
    tags,
  )
}

export function applyLastValues(f: FormState, v: LastValues, tags: Tags): FormState {
  const alive = <T extends { id: number; archived: boolean }>(ids: number[] | undefined, list: T[]) =>
    (ids ?? []).filter((id) => list.some((t) => t.id === id && !t.archived))
  return reconcile(
    {
      ...f,
      map_id: v.map_id ?? f.map_id,
      side: v.side ?? f.side,
      role_ids: alive(v.role_ids, tags.roles),
      zone_ids: alive(v.zone_ids, tags.zones),
      category_ids: alive(v.category_ids, tags.categories),
      utility_ids: alive(v.utility_ids, tags.utilities),
      risk_id: v.risk_id ?? null,
      economy_ids: alive(v.economy_ids, tags.economies),
    },
    tags,
  )
}

/** « Enregistrer et en créer une autre » : garde map, side, rôles et zones. */
export function nextInSeries(f: FormState): FormState {
  return { ...EMPTY_FORM, map_id: f.map_id, side: f.side, role_ids: f.role_ids, zone_ids: f.zone_ids }
}

export function hasContent(f: FormState): boolean {
  return Boolean(f.title.trim() || f.media.length || f.description.trim())
}

/** Signature du contenu (pour savoir s'il y a des changements à sauvegarder). */
export function signature(f: FormState): string {
  const { titleTouched: _t, status: _s, id: _i, ...rest } = f
  return JSON.stringify({ ...rest, media: f.media.map((m) => m.url) })
}

// ------------------------------------------------------------ Sauvegarde locale

export function localKey(userId: string, cardId: number | 'new') {
  return `cs2kb:form:${userId}:${cardId}`
}

export function loadLocal(key: string): { state: FormState; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveLocal(key: string, state: FormState) {
  try {
    localStorage.setItem(key, JSON.stringify({ state, savedAt: new Date().toISOString() }))
  } catch {
    /* stockage plein ou désactivé : la sauvegarde serveur prend le relais */
  }
}

export function clearLocal(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
