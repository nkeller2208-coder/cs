import { api } from './http'
import type {
  AllowlistEntry, Card, CardStatus, HistoryEntry, LastValues, Me, Media, Member, Principle, Side, SkillsData,
  SkillStatus, Tags, TagTable,
} from './types'
import { byOrder } from './text'

// ------------------------------------------------------------ Connexion

export interface AuthConfig {
  discord: boolean
  devLogin: boolean
}
export const fetchAuthConfig = () => api.get<AuthConfig>('/auth/config')
export const fetchMe = () => api.get<Me>('/auth/me')
export const logout = () => api.post('/auth/logout')
export const devLogin = (email: string) => api.post('/auth/dev', { email })

// ------------------------------------------------------------ Étiquettes

export async function fetchTags(): Promise<Tags> {
  const t = await api.get<Tags>('/tags')
  return {
    maps: t.maps.sort(byOrder),
    zones: t.zones.sort(byOrder),
    roles: t.roles.sort((a, b) => a.side.localeCompare(b.side) || byOrder(a, b)),
    categories: t.categories.sort(byOrder),
    risks: t.risks.sort(byOrder),
    utilities: t.utilities.sort(byOrder),
    economies: t.economies.sort(byOrder),
    round_types: t.round_types.sort(byOrder),
    principle_themes: t.principle_themes.sort(byOrder),
    skill_groups: t.skill_groups.sort(byOrder),
  }
}

export const insertTag = (table: TagTable | 'skills', values: Record<string, unknown>) => api.post(`/tags/${table}`, values)
export const updateTag = (table: TagTable | 'skills', id: number, values: Record<string, unknown>) =>
  api.patch(`/tags/${table}/${id}`, values)
export const deleteTag = (table: TagTable | 'skills', id: number) => api.del(`/tags/${table}/${id}`)
export const reorderTags = (table: TagTable | 'skills', ids: number[]) => api.post(`/tags/${table}/reorder`, { ids })
export const mergeZones = (source: number, target: number) => api.post('/tags/zones/merge', { source, target })
/** Un membre propose une zone : utilisable tout de suite, marquée « à valider ». */
export const proposeZone = (mapId: number, name: string, _userId?: string) =>
  api.post<Tags['zones'][number]>('/tags/zones/propose', { map_id: mapId, name: name.trim() })

// ------------------------------------------------------------ Cartes

export const fetchCards = () => api.get<Card[]>('/cards')

export interface CardPayload {
  id?: number | null
  title: string
  description: string
  map_id: number | null
  side: Side | null
  risk_id: number | null
  status: CardStatus
  media: Media[]
  role_ids: number[]
  category_ids: number[]
  zone_ids: number[]
  utility_ids: number[]
  economy_ids: number[]
  round_type_ids: number[]
  remember?: boolean
}

export const saveCard = async (p: CardPayload) => (await api.post<{ id: number }>('/cards', p)).id
export const deleteCard = (id: number) => api.del(`/cards/${id}`)
export const flagCard = (id: number, comment: string) => api.post(`/cards/${id}/flag`, { comment })
export const resolveCardReview = (id: number) => api.post(`/cards/${id}/resolve`)
export const fetchHistory = (cardId: number) => api.get<HistoryEntry[]>(`/cards/${cardId}/history`)

/** Cartes qui utilisent déjà l'un de ces liens (anti-doublon). */
export function findDuplicateMedia(keys: string[], excludeCardId?: number | null) {
  if (!keys.length) return Promise.resolve([])
  const q = new URLSearchParams(keys.map((k) => ['key', k]))
  if (excludeCardId) q.set('exclude', String(excludeCardId))
  return api.get<{ url_key: string; card_id: number; cards: { id: number; title: string; status: CardStatus } | null }[]>(
    `/media/duplicates?${q}`,
  )
}

/** Supprime les cartes et principes de démonstration (titre préfixé). */
export const deleteDemoCards = (prefix: string) => api.del(`/cards?prefix=${encodeURIComponent(prefix)}`)

// ------------------------------------------------------------ Membres

export const fetchMembers = () => api.get<Member[]>('/members')
export const updateMember = (id: string, values: Partial<Pick<Member, 'role' | 'display_name'>>) => api.patch(`/members/${id}`, values)
export const removeMember = (id: string) => api.del(`/members/${id}`)
export const fetchLastValues = (_userId?: string) => api.get<LastValues>('/members/me/last-values')

export const fetchAllowlist = () => api.get<AllowlistEntry[]>('/allowlist')
export const addAllowlist = (entry: { email?: string | null; discord_id?: string | null; role: string; note?: string }) =>
  api.post<{ id: number }>('/allowlist', entry)
export const updateAllowlist = (id: number, values: Partial<Pick<AllowlistEntry, 'role'>>) => api.patch(`/allowlist/${id}`, values)
export const deleteAllowlist = (id: number) => api.del(`/allowlist/${id}`)
export const createInvite = (id: number) => api.post<{ url: string; expires_at: string }>(`/allowlist/${id}/invite`)
export const revokeInvite = (id: number) => api.del(`/allowlist/${id}/invite`)

// ------------------------------------------------------------ Principes de jeu

export const fetchPrinciples = () => api.get<Principle[]>('/principles')

export interface PrinciplePayload {
  id?: number | null
  title: string
  summary: string
  body: string
  theme_id: number | null
  sides: Side[]
  pinned: boolean
  map_ids: number[]
  role_ids: number[]
  category_ids: number[]
  round_type_ids: number[]
}

export const savePrinciple = async (p: PrinciplePayload) => (await api.post<{ id: number }>('/principles', p)).id
export const deletePrinciple = (id: number) => api.del(`/principles/${id}`)
export const linkPrincipleCard = (principleId: number, cardId: number, _userId?: string) => api.put(`/principles/${principleId}/cards/${cardId}`)
export const unlinkPrincipleCard = (principleId: number, cardId: number) => api.del(`/principles/${principleId}/cards/${cardId}`)

// ------------------------------------------------------------ Compétences

export const fetchSkills = () => api.get<SkillsData>('/skills')
export const setTeamSkill = (skillId: number, status: SkillStatus) =>
  api.put<{ ok: true; propagated: number }>(`/skills/${skillId}/team`, { status })
export const setMemberSkill = (skillId: number, memberId: string, status: SkillStatus) =>
  api.put(`/skills/${skillId}/members/${memberId}`, { status })
