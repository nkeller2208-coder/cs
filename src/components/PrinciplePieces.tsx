import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TagIndex } from '../hooks/data'
import type { Card, Principle } from '../lib/types'
import { isGeneral } from '../lib/principles'
import { normalize } from '../lib/text'
import { Badge, SideBadge, cx, inputClass } from './ui'

/** Étiquettes d'un principe (« Général » s'il n'en a aucune). */
export function PrincipleBadges({ p, idx }: { p: Principle; idx: TagIndex }) {
  if (isGeneral(p)) return <Badge className="bg-slate-800 text-slate-300 ring-slate-600">Général</Badge>
  const names = <T extends { name: string }>(ids: number[], m: Map<number, T>) =>
    ids.map((id) => m.get(id)).filter((x): x is T => !!x)
  return (
    <div className="flex flex-wrap gap-1">
      {p.sides.map((s) => (
        <SideBadge key={s} side={s} />
      ))}
      {names(p.map_ids, idx.maps).map((m) => (
        <Badge key={`m${m.name}`} className="bg-slate-100 text-slate-900 ring-slate-100 font-semibold">
          {m.name}
        </Badge>
      ))}
      {p.role_ids.map((id) => idx.roles.get(id)).filter(Boolean).map((r) => (
        <Badge key={`r${r!.id}`} className={r!.side === 'CT' ? 'bg-ct/10 text-sky-200 ring-ct/25' : 'bg-t/10 text-amber-200 ring-t/25'}>
          {r!.name}
          {!p.sides.length && <span className="ml-1 opacity-60">{r!.side}</span>}
        </Badge>
      ))}
      {names(p.category_ids, idx.categories).map((c) => (
        <Badge key={`c${c.name}`} className="bg-violet-500/15 text-violet-200 ring-violet-500/30">
          {c.name}
        </Badge>
      ))}
      {names(p.round_type_ids, idx.round_types).map((r) => (
        <Badge key={`rt${r.name}`} className="bg-rose-500/15 text-rose-200 ring-rose-500/30">
          ⚡ {r.name}
        </Badge>
      ))}
    </div>
  )
}

export function PrincipleTile({ p, idx, cardCount }: { p: Principle; idx: TagIndex; cardCount: number }) {
  return (
    <Link
      to={`/principes/${p.id}`}
      className="group flex flex-col gap-2 rounded-xl bg-slate-900 p-4 ring-1 ring-slate-800 transition hover:-translate-y-0.5 hover:ring-slate-600"
    >
      <div className="flex items-start gap-2">
        {p.pinned && (
          <span title="Incontournable" className="text-amber-400">
            ★
          </span>
        )}
        <h3 className="flex-1 font-semibold leading-snug text-slate-50 group-hover:text-amber-200">{p.title}</h3>
        <span className="shrink-0 text-xs text-slate-500 tabular-nums" title="Cartes rattachées ou concernées">
          {cardCount} carte{cardCount > 1 ? 's' : ''}
        </span>
      </div>
      {p.summary && <p className="line-clamp-3 text-sm text-slate-400">{p.summary}</p>}
      <PrincipleBadges p={p} idx={idx} />
    </Link>
  )
}

/** Recherche d'un élément à rattacher (carte ou principe) par son titre. */
export function LinkPicker<T extends { id: number; title: string }>({
  items,
  exclude,
  onPick,
  placeholder,
  render,
}: {
  items: T[]
  exclude: number[]
  onPick: (item: T) => void
  placeholder: string
  render?: (item: T) => React.ReactNode
}) {
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const nq = normalize(q)
    return items.filter((i) => !exclude.includes(i.id) && (!nq || normalize(i.title).includes(nq))).slice(0, 8)
  }, [items, exclude, q])
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={inputClass}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg bg-slate-900 p-1 shadow-xl ring-1 ring-slate-700">
          {results.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(i)
                  setQ('')
                  setOpen(false)
                }}
                className={cx('w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-slate-800')}
              >
                {render ? render(i) : i.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function cardLabel(c: Card, idx: TagIndex) {
  const map = c.map_id != null ? idx.maps.get(c.map_id)?.name : null
  return (
    <span className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-slate-100">{c.title}</span>
      <span className="shrink-0 text-xs text-slate-500">{[map, c.side].filter(Boolean).join(' · ')}</span>
    </span>
  )
}
