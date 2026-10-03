import type { Card, CardKind, CardStatus, LastValues, RoleAction, Side, StuffLink, Tags } from './types'
import type { CardPayload } from './api'
import { describeMedia } from './media'
import { filtersFromParams } from './filters'
import { formatTimestamp } from './text'
import type { FormMedia } from '../components/MediaField'

export interface FormState {
  id: number | null
  kind: CardKind
  status: CardStatus
  media: FormMedia[]
  map_id: number | null
  side: Side | null
  role_ids: number[]
  zone_ids: number[]
  category_ids: number[]
  utility_ids: number[]
  risk_id: number | null
  source_id: number | null
  economy_ids: number[]
  round_type_ids: number[]
  /** Stratégie : action de chaque rôle (au plus une par rôle). */
  role_actions: RoleAction[]
  /** Stratégie : stuffs rattachés, dans l'ordre. */
  stuff_links: StuffLink[]
  title: string
  titleTouched: boolean
  description: string
}

export const EMPTY_FORM: FormState = {
  id: null, kind: 'strategy', status: 'draft', role_actions: [], stuff_links: [], source_id: null, media: [], map_id: null, side: null, role_ids: [], zone_ids: [], category_ids: [],
  utility_ids: [], risk_id: null, economy_ids: [], round_type_ids: [], title: '', titleTouched: false, description: '',
}

export type FormErrors = Partial<Record<'media' | 'title' | 'map' | 'side' | 'category' | 'utility', string>>

export const TITLE_MAX = 100

export function validate(f: FormState): FormErrors {
  const e: FormErrors = {}
  if (!f.media.length && !f.description.trim()) e.media = 'Ajoute au moins un lien média, ou une description plus bas.'
  if (!f.map_id) e.map = 'Choisis une map.'
  if (!f.side) e.side = 'Choisis un side.'
  if (f.kind === 'strategy' && !f.category_ids.length) e.category = 'Coche au moins une catégorie.'
  if (f.kind === 'stuff' && !f.utility_ids.length) e.utility = "Choisis le type d'utilitaire (smoke, flash…)."
  if (!f.title.trim()) e.title = 'Le titre est obligatoire.'
  else if (f.title.length > TITLE_MAX) e.title = `${TITLE_MAX} caractères maximum.`
  return e
}

/** Le type d'utilitaire décrit un stuff (une stratégie référence ses stuffs à la place). */
export function showsUtility(f: Pick<FormState, 'kind'>, _tags?: Tags): boolean {
  return f.kind === 'stuff'
}

/** Rôles concernés par une stratégie : ceux dont l'action n'est pas « Non concerné ». */
export function involvedRoles(actions: RoleAction[], tags: Tags): number[] {
  const involved = new Set(tags.role_actions.filter((a) => a.involved).map((a) => a.id))
  return actions.filter((a) => involved.has(a.action_id)).map((a) => a.role_id)
}

/** Le type de round n'est proposé que si une catégorie « Round lancé » est cochée. */
export function showsRoundType(f: Pick<FormState, 'category_ids'>, tags: Tags): boolean {
  return tags.categories.some((c) => c.shows_round_type && f.category_ids.includes(c.id))
}

/** Garde la cohérence : rôles du side, zones de la map. */
export function reconcile(f: FormState, tags: Tags): FormState {
  const roleOk = new Set(tags.roles.filter((r) => r.side === f.side).map((r) => r.id))
  const zoneOk = new Set(tags.zones.filter((z) => z.map_id === f.map_id).map((z) => z.id))
  return {
    ...f,
    role_ids: f.role_ids.filter((id) => roleOk.has(id)),
    zone_ids: f.zone_ids.filter((id) => zoneOk.has(id)),
    role_actions: f.role_actions.filter((a) => roleOk.has(a.role_id)),
    stuff_links: f.stuff_links.map((l) => (l.role_id && !roleOk.has(l.role_id) ? { ...l, role_id: null } : l)),
  }
}

export function toPayload(f: FormState, status: CardStatus, tags: Tags): CardPayload {
  const strategy = f.kind === 'strategy'
  return {
    id: f.id,
    kind: f.kind,
    title: f.title.trim().slice(0, TITLE_MAX),
    description: f.description,
    map_id: f.map_id,
    side: f.side,
    risk_id: f.risk_id,
    source_id: f.source_id,
    status,
    media: f.media.map(({ url, kind, url_key }) => ({ url, kind, url_key })),
    // Stratégie : rôles concernés déduits des actions (s'il y en a) ; stuff : rôles « lancé par ».
    role_ids: strategy && f.role_actions.length ? involvedRoles(f.role_actions, tags) : f.role_ids,
    category_ids: f.category_ids,
    zone_ids: f.zone_ids,
    utility_ids: showsUtility(f) ? f.utility_ids : [],
    economy_ids: f.economy_ids,
    round_type_ids: showsRoundType(f, tags) ? f.round_type_ids : [],
    role_actions: strategy ? f.role_actions : [],
    stuff_links: strategy ? f.stuff_links : [],
    remember: status !== 'draft',
  }
}

let seq = 0
export function formFromCard(c: Card): FormState {
  return {
    id: c.id,
    kind: c.kind,
    status: c.status,
    role_actions: c.role_actions,
    stuff_links: c.stuff_links,
    source_id: c.source_id ?? null,
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
    round_type_ids: c.round_type_ids,
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
      kind: params.get('kind') === 'stuff' ? 'stuff' : 'strategy',
      stuff_links: Number(params.get('stuff')) > 0 ? [{ stuff_id: Number(params.get('stuff')), role_id: null }] : [],
      map_id: one(f.map),
      side: one(f.side),
      role_ids: f.role,
      zone_ids: f.zone,
      category_ids: f.cat,
      utility_ids: f.util,
      risk_id: one(f.risk),
      source_id: one(f.src),
      economy_ids: f.eco,
      round_type_ids: f.round,
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
      source_id: v.source_id ?? f.source_id,
      economy_ids: alive(v.economy_ids, tags.economies),
      round_type_ids: alive(v.round_type_ids, tags.round_types),
    },
    tags,
  )
}

/** « Enregistrer et en créer une autre » : garde le type, la map, le side, les rôles, les zones et la source. */
export function nextInSeries(f: FormState): FormState {
  return { ...EMPTY_FORM, kind: f.kind, map_id: f.map_id, side: f.side, role_ids: f.role_ids, zone_ids: f.zone_ids, source_id: f.source_id }
}

/** Changer d'action pour un rôle (null : retirer l'action). */
export function setRoleAction(f: FormState, roleId: number, actionId: number | null): FormState {
  const rest = f.role_actions.filter((a) => a.role_id !== roleId)
  if (actionId == null) return { ...f, role_actions: rest }
  const note = f.role_actions.find((a) => a.role_id === roleId)?.note ?? ''
  return { ...f, role_actions: [...rest, { role_id: roleId, action_id: actionId, note }] }
}

export function setRoleNote(f: FormState, roleId: number, note: string): FormState {
  return { ...f, role_actions: f.role_actions.map((a) => (a.role_id === roleId ? { ...a, note: note.slice(0, 200) } : a)) }
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
    if (!raw) return null
    const saved = JSON.parse(raw) as { state: FormState; savedAt: string }
    // Saisie enregistrée par une version précédente du site : champs ajoutés depuis complétés.
    return { ...saved, state: { ...EMPTY_FORM, ...saved.state } }
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
