export type Side = 'CT' | 'T'
/** Une carte est une stratégie (ce que fait l'équipe) ou un stuff (une grenade précise). */
export type CardKind = 'strategy' | 'stuff'
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
/** Source d'une carte (chaîne, coach, site…), complétée au fur et à mesure. */
export interface SourceTag extends Tag {
  url: string
}
/** Action d'un rôle dans une stratégie : Support, Lurk, Fight… (« Non concerné » : involved = false). */
export interface RoleActionTag extends Tag {
  involved: boolean
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
  role_actions: RoleActionTag[]
  sources: SourceTag[]
  principle_themes: Tag[]
  skill_groups: Tag[]
}

export type TagTable = keyof Tags

export interface Media {
  url: string
  kind: MediaKind
  url_key: string
}

/** Ce que fait un rôle dans une stratégie. */
export interface RoleAction {
  role_id: number
  action_id: number
  /** Précision libre : « lance la smoke Window », « joue le crossfire avec l'AWP »… */
  note: string
}

/** Stuff rattaché à une stratégie, éventuellement lancé par un rôle. */
export interface StuffLink {
  stuff_id: number
  role_id: number | null
}

export interface Card {
  id: number
  kind: CardKind
  title: string
  description: string
  map_id: number | null
  side: Side | null
  risk_id: number | null
  /** D'où vient le contenu (Devil, Le Repère…). */
  source_id: number | null
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
  /** Stratégie : action de chaque rôle (vide pour un stuff). */
  role_actions: RoleAction[]
  /** Stratégie : stuffs rattachés, dans l'ordre (vide pour un stuff). */
  stuff_links: StuffLink[]
  /** Ma note d'apprentissage (1 à 5), null si pas encore notée. */
  my_rating?: number | null
  /** Statut de la stratégie dans mes équipes (« à apprendre », « maîtrisée »). */
  learning?: { team_id: number; status: TeamCardStatus }[]
}

/** Statut d'une stratégie pour une équipe (aucun = non travaillée). */
export type TeamCardStatus = 'to_learn' | 'learned'

/** Apprentissage d'une carte : ma note, et par équipe le statut et les notes des joueurs. */
export interface CardLearning {
  my_rating: number | null
  teams: {
    id: number
    name: string
    status: TeamCardStatus | null
    can_manage: boolean
    players: { id: string; display_name: string; email: string | null; team_role: TeamRole; rating: number | null }[]
  }[]
}

/** Tableau de bord d'une équipe : stratégies suivies et notes des joueurs. */
export interface TeamLearning {
  can_manage: boolean
  players: { id: string; display_name: string; email: string | null; team_role: TeamRole }[]
  cards: { card_id: number; status: TeamCardStatus; title: string; map_id: number | null; side: Side | null }[]
  ratings: { member_id: string; card_id: number; rating: number }[]
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
  /** Rôles en jeu du membre (Pivot B, AWP…). */
  role_ids?: number[]
}

/** Espace perso : ce que l'API renvoie pour le membre connecté. */
export interface Profile {
  role_ids: number[]
  teams: { id: number; name: string; role: TeamRole }[]
}

/** Utilisateur connecté. */
export interface Me {
  id: string
  role: MemberRole
  email: string | null
  display_name: string
  avatar_url: string | null
  created_at: string
}

export interface AllowlistEntry {
  id: number
  email: string | null
  role: MemberRole
  note: string | null
  created_at: string
  /** Fin de validité du lien d'inscription (null : aucun lien actif). */
  invite_expires_at: string | null
  member_id: string | null
  member_name: string | null
}

// ------------------------------------------------------------ Compétences

export type SkillStatus = 'not_worked' | 'to_work' | 'acquired'

export interface Skill extends Tag {
  group_id: number | null
  description: string
  created_by: string | null
}

export interface SkillState {
  skill_id: number
  status: SkillStatus
  updated_by: string | null
  updated_at: string
}

export type TeamRole = 'captain' | 'coach' | 'player'

export interface SkillsData {
  /** Équipes accessibles (les siennes ; toutes pour l'admin). */
  teams: { id: number; name: string }[]
  /** Équipe affichée (null : l'utilisateur n'est dans aucune équipe). */
  team: { id: number; name: string } | null
  my_role: TeamRole | null
  /** Capitaine, coach ou admin : peut fixer le statut d'équipe et modifier les joueurs. */
  can_manage: boolean
  groups: Tag[]
  skills: Skill[]
  teamStatus: SkillState[]
  memberStatus: (SkillState & { member_id: string })[]
  /** Capitaines et joueurs (les coachs n'ont pas de compétences). */
  players: (Pick<Member, 'id' | 'display_name' | 'email' | 'avatar_url'> & { team_role: TeamRole })[]
}

export interface TeamMember {
  team_id: number
  member_id: string
  role: TeamRole
  joined_at: string
  display_name: string
  avatar_url: string | null
  email: string | null
}

export interface TeamInvite {
  id: number
  team_id: number
  team_role: TeamRole
  note: string | null
  email: string | null
  invite_expires_at: string | null
  created_at: string
}

export interface Team {
  id: number
  name: string
  created_at: string
  can_manage: boolean
  members: TeamMember[]
  invites: TeamInvite[]
}

export interface LastValues {
  source_id?: number | null
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
    kind?: CardKind
    source_id?: number | null
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
    role_actions?: RoleAction[]
    stuff_links?: StuffLink[]
  }
}
