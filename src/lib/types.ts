export type Side = 'CT' | 'T'
export type CardStatus = 'draft' | 'published' | 'review'
export type MediaKind = 'youtube' | 'image' | 'link'
export type MemberRole = 'admin' | 'member'

export interface Tag {
  id: number
  name: string
  sort_order: number
  archived: boolean
}
export interface MapTag extends Tag {}
export interface Zone extends Tag {
  map_id: number
  pending: boolean
  created_by: string | null
}
export interface Role extends Tag {
  side: Side
}
export interface Category extends Tag {
  shows_utility: boolean
  shows_round_type: boolean
}
export interface Risk extends Tag {
  color: string
}

export interface Tags {
  maps: MapTag[]
  zones: Zone[]
  roles: Role[]
  categories: Category[]
  risks: Risk[]
  utilities: Tag[]
  economies: Tag[]
  round_types: Tag[]
  principle_themes: Tag[]
}

export type TagTable = keyof Tags

export interface Media {
  url: string
  kind: MediaKind
  url_key: string
}

export interface Card {
  id: number
  title: string
  description: string
  map_id: number | null
  side: Side | null
  risk_id: number | null
  status: CardStatus
  review_comment: string | null
  review_by: string | null
  author_id: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
  media: Media[]
  role_ids: number[]
  category_ids: number[]
  zone_ids: number[]
  utility_ids: number[]
  economy_ids: number[]
  round_type_ids: number[]
}

/** Principe de jeu : fiche de doctrine, rattachée à des étiquettes et à des cartes. */
export interface Principle {
  id: number
  title: string
  summary: string
  body: string
  theme_id: number | null
  sides: Side[]
  pinned: boolean
  sort_order: number
  author_id: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
  map_ids: number[]
  role_ids: number[]
  category_ids: number[]
  round_type_ids: number[]
  /** Cartes rattachées explicitement. */
  card_ids: number[]
}

export interface Member {
  id: string
  email: string | null
  display_name: string
  avatar_url: string | null
  role: MemberRole
  created_at: string
}

export interface AllowlistEntry {
  id: number
  email: string | null
  discord_id: string | null
  role: MemberRole
  note: string | null
  created_at: string
}

export interface LastValues {
  map_id?: number | null
  side?: Side | null
  role_ids?: number[]
  zone_ids?: number[]
  category_ids?: number[]
  risk_id?: number | null
  utility_ids?: number[]
  economy_ids?: number[]
  round_type_ids?: number[]
}

export interface HistoryEntry {
  id: number
  card_id: number
  action: 'create' | 'update' | 'status'
  changed_by: string | null
  changed_at: string
  note: string | null
  snapshot: {
    title: string
    description: string
    map_id: number | null
    side: Side | null
    risk_id: number | null
    status: CardStatus
    review_comment: string | null
    media: { url: string; kind: MediaKind }[]
    role_ids: number[]
    category_ids: number[]
    zone_ids: number[]
    utility_ids: number[]
    economy_ids: number[]
    round_type_ids?: number[]
  }
}
