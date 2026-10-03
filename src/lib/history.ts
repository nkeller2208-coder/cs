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
  round_types: Map<number, { name: string }>
  role_actions?: Map<number, { name: string }>
  sources?: Map<number, { name: string }>
}

const STATUS: Record<string, string> = { draft: 'Brouillon', published: 'Publié', review: 'À revoir' }
const KIND: Record<string, string> = { strategy: 'Stratégie', stuff: 'Stuff' }

/** Liste lisible des changements entre deux instantanés. */
export function diffSnapshots(prev: Snapshot | null, next: Snapshot, n: Names): string[] {
  if (!prev) return ['Carte créée']
  const out: string[] = []
  const name = (m: Map<number, { name: string }>, id: number | null) => (id == null ? '—' : (m.get(id)?.name ?? '(supprimé)'))

  if ((prev.kind ?? 'strategy') !== (next.kind ?? 'strategy')) {
    out.push(`Type : ${KIND[prev.kind ?? 'strategy']} → ${KIND[next.kind ?? 'strategy']}`)
  }
  if (prev.title !== next.title) out.push(`Titre : « ${prev.title} » → « ${next.title} »`)
  if (prev.status !== next.status) out.push(`Statut : ${STATUS[prev.status]} → ${STATUS[next.status]}`)
  if (prev.map_id !== next.map_id) out.push(`Map : ${name(n.maps, prev.map_id)} → ${name(n.maps, next.map_id)}`)
  if (prev.side !== next.side) out.push(`Side : ${prev.side ?? '—'} → ${next.side ?? '—'}`)
  if (prev.risk_id !== next.risk_id) out.push(`Risque : ${name(n.risks, prev.risk_id)} → ${name(n.risks, next.risk_id)}`)
  if ((prev.source_id ?? null) !== (next.source_id ?? null) && n.sources) {
    out.push(`Source : ${name(n.sources, prev.source_id ?? null)} → ${name(n.sources, next.source_id ?? null)}`)
  }

  const lists: [keyof Snapshot, string, Map<number, { name: string }>][] = [
    ['role_ids', 'Rôles', n.roles],
    ['zone_ids', 'Zones', n.zones],
    ['category_ids', 'Catégories', n.categories],
    ['utility_ids', 'Utilitaires', n.utilities],
    ['economy_ids', 'Économie', n.economies],
    ['round_type_ids', 'Types de round', n.round_types],
  ]
  for (const [key, label, map] of lists) {
    const a = new Set((prev[key] as number[] | undefined) ?? [])
    const b = new Set((next[key] as number[] | undefined) ?? [])
    const added = [...b].filter((x) => !a.has(x)).map((id) => `+${name(map, id)}`)
    const removed = [...a].filter((x) => !b.has(x)).map((id) => `−${name(map, id)}`)
    if (added.length || removed.length) out.push(`${label} : ${[...added, ...removed].join(', ')}`)
  }

  // Actions des rôles : « Pivot B : Lurk → Support », « +Central : Support », « −AWP ».
  const acts = (s: Snapshot) => new Map((s.role_actions ?? []).map((a) => [a.role_id, a]))
  const pa0 = acts(prev)
  const na0 = acts(next)
  const actName = (id: number) => n.role_actions?.get(id)?.name ?? '(supprimée)'
  const actChanges: string[] = []
  for (const roleId of new Set([...pa0.keys(), ...na0.keys()])) {
    const a = pa0.get(roleId)
    const b = na0.get(roleId)
    const role = name(n.roles, roleId)
    if (!a && b) actChanges.push(`+${role} : ${actName(b.action_id)}`)
    else if (a && !b) actChanges.push(`−${role}`)
    else if (a && b && a.action_id !== b.action_id) actChanges.push(`${role} : ${actName(a.action_id)} → ${actName(b.action_id)}`)
    else if (a && b && a.note !== b.note) actChanges.push(`${role} : note modifiée`)
  }
  if (actChanges.length) out.push(`Actions des rôles : ${actChanges.join(', ')}`)

  const stuffs = (s: Snapshot) => (s.stuff_links ?? []).map((l) => l.stuff_id)
  const ps = stuffs(prev)
  const ns = stuffs(next)
  if (ps.join() !== ns.join()) {
    const added = ns.filter((x) => !ps.includes(x)).length
    const removed = ps.filter((x) => !ns.includes(x)).length
    const parts = [added && `${added} ajouté${added > 1 ? 's' : ''}`, removed && `${removed} retiré${removed > 1 ? 's' : ''}`].filter(Boolean).join(', ')
    out.push(`Stuffs rattachés : ${parts || 'ordre ou lanceur modifié'}`)
  } else if (JSON.stringify(prev.stuff_links ?? []) !== JSON.stringify(next.stuff_links ?? [])) {
    out.push('Stuffs rattachés : lanceur modifié')
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
