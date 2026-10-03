import type { Card, Member, Side, Tags } from './types'

export type Period = '30' | '90' | '365' | 'all'
export const PERIOD_LABEL: Record<Period, string> = { '30': '30 jours', '90': '90 jours', '365': '12 mois', all: 'Tout' }

export interface Bucket {
  label: string
  start: Date
  end: Date
  count: number
}

export type ContentKind = 'video' | 'image' | 'link' | 'text'
export const CONTENT_LABEL: Record<ContentKind, string> = {
  video: 'Vidéo',
  image: 'Image',
  link: 'Lien externe',
  text: 'Texte seul',
}

export interface CoverageRow {
  mapId: number
  mapName: string
  total: number
  byRole: Map<number, number>
  noRole: number
  zonesCovered: number
  zonesTotal: number
}

export interface Stats {
  total: number
  created: number
  createdPrev: number | null
  review: number
  contributors: number
  activity: Bucket[]
  coverage: Record<Side, { roles: { id: number; name: string }[]; rows: CoverageRow[] }>
  categories: { id: number; name: string; count: number }[]
  rounds: { id: number; name: string; count: number }[]
  content: { kind: ContentKind; count: number }[]
  risks: { id: number | null; name: string; color: string | null; count: number }[]
  leaderboard: { memberId: string | null; name: string; count: number }[]
  reviewCards: Card[]
}

const DAY = 86_400_000

export function contentKind(c: Card): ContentKind {
  if (c.media.some((m) => m.kind === 'youtube')) return 'video'
  if (c.media.some((m) => m.kind === 'image')) return 'image'
  if (c.media.length) return 'link'
  return 'text'
}

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // lundi
  return x
}

const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

/** Semaines pour 30/90 jours, mois au-delà. */
export function buildBuckets(period: Period, now: Date, first: Date | null): Bucket[] {
  const buckets: Bucket[] = []
  if (period === '30' || period === '90') {
    const weeks = period === '30' ? 5 : 13
    let start = startOfWeek(now)
    start = new Date(start.getTime() - (weeks - 1) * 7 * DAY)
    for (let i = 0; i < weeks; i++) {
      const s = new Date(start.getTime() + i * 7 * DAY)
      buckets.push({ label: dayFmt.format(s), start: s, end: new Date(s.getTime() + 7 * DAY), count: 0 })
    }
    return buckets
  }
  let months = 12
  if (period === 'all' && first) {
    months = (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1
    months = Math.min(24, Math.max(6, months))
  }
  for (let i = months - 1; i >= 0; i--) {
    const s = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({ label: monthFmt.format(s), start: s, end: new Date(s.getFullYear(), s.getMonth() + 1, 1), count: 0 })
  }
  return buckets
}

export function computeStats(
  cards: Card[],
  tags: Tags,
  members: Map<string, Member>,
  period: Period,
  now = new Date(),
): Stats {
  // Les brouillons sont privés : ils ne comptent pas dans les statistiques d'équipe.
  const base = cards.filter((c) => c.status !== 'draft')
  const since = period === 'all' ? null : new Date(now.getTime() - Number(period) * DAY)
  const prevSince = since ? new Date(since.getTime() - Number(period) * DAY) : null
  const created = base.filter((c) => !since || new Date(c.created_at) >= since)
  const createdPrev = prevSince
    ? base.filter((c) => {
        const d = new Date(c.created_at)
        return d >= prevSince && d < since!
      }).length
    : null

  // Activité
  const first = base.length ? new Date(Math.min(...base.map((c) => new Date(c.created_at).getTime()))) : null
  const activity = buildBuckets(period, now, first)
  for (const c of base) {
    const d = new Date(c.created_at)
    const b = activity.find((x) => d >= x.start && d < x.end)
    if (b) b.count++
  }

  // Couverture map × rôle, par side (toute la base)
  const usedMaps = new Set(base.map((c) => c.map_id))
  const maps = tags.maps.filter((m) => !m.archived || usedMaps.has(m.id))
  const coverage = {} as Stats['coverage']
  for (const side of ['CT', 'T'] as Side[]) {
    const sideCards = base.filter((c) => c.side === side)
    const usedRoles = new Set(sideCards.flatMap((c) => c.role_ids))
    const roles = tags.roles.filter((r) => r.side === side && (!r.archived || usedRoles.has(r.id)))
    const rows = maps.map((m) => {
      const mc = sideCards.filter((c) => c.map_id === m.id)
      const byRole = new Map<number, number>()
      for (const c of mc) for (const r of c.role_ids) byRole.set(r, (byRole.get(r) ?? 0) + 1)
      const mapZones = tags.zones.filter((z) => z.map_id === m.id && !z.archived)
      const covered = new Set(base.filter((c) => c.map_id === m.id).flatMap((c) => c.zone_ids))
      return {
        mapId: m.id,
        mapName: m.name,
        total: mc.length,
        byRole,
        noRole: mc.filter((c) => !c.role_ids.length).length,
        zonesCovered: mapZones.filter((z) => covered.has(z.id)).length,
        zonesTotal: mapZones.length,
      }
    })
    coverage[side] = { roles: roles.map((r) => ({ id: r.id, name: r.name })), rows }
  }

  const countBy = <T,>(list: T[], key: (c: Card) => T[]) => {
    const m = new Map<T, number>()
    for (const c of base) for (const k of key(c)) m.set(k, (m.get(k) ?? 0) + 1)
    return list.map((k) => m.get(k) ?? 0)
  }

  const cats = tags.categories.filter((c) => !c.archived || base.some((x) => x.category_ids.includes(c.id)))
  const catCounts = countBy(cats.map((c) => c.id), (c) => c.category_ids)
  const categories = cats.map((c, i) => ({ id: c.id, name: c.name, count: catCounts[i] }))

  const rts = tags.round_types.filter((r) => !r.archived || base.some((x) => x.round_type_ids.includes(r.id)))
  const rtCounts = countBy(rts.map((r) => r.id), (c) => c.round_type_ids)
  const rounds = rts.map((r, i) => ({ id: r.id, name: r.name, count: rtCounts[i] }))

  const content = (['video', 'image', 'link', 'text'] as ContentKind[]).map((kind) => ({
    kind,
    count: base.filter((c) => contentKind(c) === kind).length,
  }))

  const risks: Stats['risks'] = tags.risks
    .filter((r) => !r.archived || base.some((c) => c.risk_id === r.id))
    .map((r) => ({ id: r.id, name: r.name, color: r.color, count: base.filter((c) => c.risk_id === r.id).length }))
  risks.push({ id: null, name: 'Non renseigné', color: null, count: base.filter((c) => c.risk_id == null).length })

  const byAuthor = new Map<string | null, number>()
  for (const c of created) byAuthor.set(c.author_id, (byAuthor.get(c.author_id) ?? 0) + 1)
  const leaderboard = [...byAuthor.entries()]
    .map(([memberId, count]) => ({
      memberId,
      name: (memberId && (members.get(memberId)?.display_name || members.get(memberId)?.email)) || 'Ancien membre',
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'))

  const reviewCards = base
    .filter((c) => c.status === 'review')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  return {
    total: base.length,
    created: created.length,
    createdPrev,
    review: reviewCards.length,
    contributors: byAuthor.size,
    activity,
    coverage,
    categories,
    rounds,
    content,
    risks,
    leaderboard,
    reviewCards,
  }
}
