import type { Card } from '../lib/types'
import type { TagIndex } from '../hooks/data'
import { Badge, RiskBadge, SideBadge } from './ui'

/** Badges colorés : map, side, rôles, catégories, risque (+ zones/utilitaires/éco en mode complet). */
export function CardBadges({ card, idx, full = false }: { card: Card; idx: TagIndex; full?: boolean }) {
  const map = card.map_id != null ? idx.maps.get(card.map_id) : undefined
  const risk = card.risk_id != null ? idx.risks.get(card.risk_id) : undefined
  const roleTone =
    card.side === 'CT' ? 'bg-ct/10 text-sky-200 ring-ct/25' : card.side === 'T' ? 'bg-t/10 text-amber-200 ring-t/25' : undefined
  const names = <T extends { name: string }>(ids: number[], m: Map<number, T>) =>
    ids.map((id) => m.get(id)).filter((x): x is T => !!x)

  return (
    <div className="flex flex-wrap gap-1">
      {map && <Badge className="bg-slate-100 text-slate-900 ring-slate-100 font-semibold">{map.name}</Badge>}
      {card.side && <SideBadge side={card.side} />}
      {names(card.role_ids, idx.roles).map((r) => (
        <Badge key={`r${r.name}`} className={roleTone}>
          {r.name}
        </Badge>
      ))}
      {names(card.category_ids, idx.categories).map((c) => (
        <Badge key={`c${c.name}`} className="bg-violet-500/15 text-violet-200 ring-violet-500/30">
          {c.name}
        </Badge>
      ))}
      {risk && <RiskBadge name={risk.name} color={risk.color} />}
      {full && (
        <>
          {names(card.zone_ids, idx.zones).map((z) => (
            <Badge key={`z${z.name}`} className="bg-emerald-500/10 text-emerald-200 ring-emerald-500/25" title={z.pending ? 'Zone à valider' : undefined}>
              📍 {z.name}
              {z.pending && ' *'}
            </Badge>
          ))}
          {names(card.utility_ids, idx.utilities).map((u) => (
            <Badge key={`u${u.name}`} className="bg-cyan-500/10 text-cyan-200 ring-cyan-500/25">
              {u.name}
            </Badge>
          ))}
          {names(card.economy_ids, idx.economies).map((e) => (
            <Badge key={`e${e.name}`} className="bg-lime-500/10 text-lime-200 ring-lime-500/25">
              💰 {e.name}
            </Badge>
          ))}
        </>
      )}
    </div>
  )
}

export function StatusBadge({ status }: { status: Card['status'] }) {
  if (status === 'draft') return <Badge className="bg-slate-700 text-slate-200 ring-slate-500">Brouillon</Badge>
  if (status === 'review') return <Badge className="bg-red-500/20 text-red-200 ring-red-500/40">⚠ À revoir</Badge>
  return null
}
