import type { HistoryEntry } from './types'

type Snapshot = HistoryEntry['snapshot']
type Names = {
  maps: Map<number, { name: string }>
  roles: Map<number, { name: string; side?: string }>
  categories: Map<number, { name: string }>
  zones: Map<number, { name: string }>
  utilities: Map<number, { name: string }>
  economies: Map<number, { name: string }>
  risks: Map<number, { name: string }>
}

const STATUS: Record<string, string> = { draft: 'Brouillon', published: 'Publié', review: 'À revoir' }

/** Liste lisible des changements entre deux instantanés. */
export function diffSnapshots(prev: Snapshot | null, next: Snapshot, n: Names): string[] {
  if (!prev) return ['Carte créée']
  const out: string[] = []
  const name = (m: Map<number, { name: string }>, id: number | null) => (id == null ? '—' : (m.get(id)?.name ?? '(supprimé)'))

  if (prev.title !== next.title) out.push(`Titre : « ${prev.title} » → « ${next.title} »`)
  if (prev.status !== next.status) out.push(`Statut : ${STATUS[prev.status]} → ${STATUS[next.status]}`)
  if (prev.map_id !== next.map_id) out.push(`Map : ${name(n.maps, prev.map_id)} → ${name(n.maps, next.map_id)}`)
  if (prev.side !== next.side) out.push(`Side : ${prev.side ?? '—'} → ${next.side ?? '—'}`)
  if (prev.risk_id !== next.risk_id) out.push(`Risque : ${name(n.risks, prev.risk_id)} → ${name(n.risks, next.risk_id)}`)

  const lists: [keyof Snapshot, string, Map<number, { name: string }>][] = [
    ['role_ids', 'Rôles', n.roles],
    ['zone_ids', 'Zones', n.zones],
    ['category_ids', 'Catégories', n.categories],
    ['utility_ids', 'Utilitaires', n.utilities],
    ['economy_ids', 'Économie', n.economies],
  ]
  for (const [key, label, map] of lists) {
    const a = new Set((prev[key] as number[] | undefined) ?? [])
    const b = new Set((next[key] as number[] | undefined) ?? [])
    const added = [...b].filter((x) => !a.has(x)).map((id) => `+${name(map, id)}`)
    const removed = [...a].filter((x) => !b.has(x)).map((id) => `−${name(map, id)}`)
    if (added.length || removed.length) out.push(`${label} : ${[...added, ...removed].join(', ')}`)
  }

  const urls = (s: Snapshot) => (s.media ?? []).map((m) => m.url)
  const pa = urls(prev)
  const na = urls(next)
  if (pa.join('\n') !== na.join('\n')) {
    const added = na.filter((u) => !pa.includes(u)).length
    const removed = pa.filter((u) => !na.includes(u)).length
    const parts = [added && `${added} ajouté${added > 1 ? 's' : ''}`, removed && `${removed} retiré${removed > 1 ? 's' : ''}`]
      .filter(Boolean)
      .join(', ')
    out.push(`Médias : ${parts || 'ordre modifié'}`)
  }
  if (prev.description !== next.description) out.push('Description modifiée')
  return out.length ? out : ['Aucun changement visible']
}
