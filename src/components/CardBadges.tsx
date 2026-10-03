import type { Card } from '../lib/types'
import type { TagIndex } from '../hooks/data'
import { Badge, RiskBadge, SideBadge } from './ui'

/** Badges colorés : map, side, rôles, catégories, risque (+ zones/utilitaires/éco en mode complet). */
export function KindBadge({ kind }: { kind: Card['kind'] }) {
  return kind === 'stuff' ? (
    <Badge className="bg-cyan-500/15 text-cyan-200 ring-cyan-500/30 font-semibold">💨 Stuff</Badge>
  ) : (
    <Badge className="bg-amber-500/15 text-amber-200 ring-amber-500/30 font-semibold">🎯 Stratégie</Badge>
  )
}

export function CardBadges({ card, idx, full = false }: { card: Card; idx: TagIndex; full?: boolean }) {
  const map = card.map_id != null ? idx.maps.get(card.map_id) : undefined
  const risk = card.risk_id != null ? idx.risks.get(card.risk_id) : undefined
  const source = card.source_id != null ? idx.sources.get(card.source_id) : undefined
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
      {names(card.round_type_ids, idx.round_types).map((r) => (
        <Badge key={`rt${r.name}`} className="bg-rose-500/15 text-rose-200 ring-rose-500/30">
          ⚡ {r.name}
        </Badge>
      ))}
      {risk && <RiskBadge name={risk.name} color={risk.color} />}
      {source &&
        (full && source.url ? (
          <a href={source.url} target="_blank" rel="noreferrer" title="Source : ouvrir le lien" className="hover:opacity-80">
            <Badge className="bg-fuchsia-500/10 text-fuchsia-200 ring-fuchsia-500/25">📺 {source.name} ↗</Badge>
          </a>
        ) : (
          <Badge className="bg-fuchsia-500/10 text-fuchsia-200 ring-fuchsia-500/25" title="Source">
            📺 {source.name}
          </Badge>
        ))}
      {!full && card.kind === 'stuff' &&
        names(card.utility_ids, idx.utilities).map((u) => (
          <Badge key={`u${u.name}`} className="bg-cyan-500/10 text-cyan-200 ring-cyan-500/25">
            💨 {u.name}
          </Badge>
        ))}
      {!full && card.kind === 'strategy' && card.stuff_links?.length > 0 && (
        <Badge className="bg-cyan-500/10 text-cyan-200 ring-cyan-500/25" title="Stuffs utilisés">
          💨 {card.stuff_links.length} stuff{card.stuff_links.length > 1 ? 's' : ''}
        </Badge>
      )}
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
