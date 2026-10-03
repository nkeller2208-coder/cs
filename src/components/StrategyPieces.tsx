import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { TagIndex } from '../hooks/data'
import type { Card, Member, RoleAction, RoleActionTag, Side, StuffLink, Tags } from '../lib/types'
import { thumbnailOf } from '../lib/media'
import { normalize } from '../lib/text'
import { Badge, cx, inputClass } from './ui'

// ---------------------------------------------------------------- Actions des rôles

/** Badge coloré d'une action (Support, Lurk…). */
export function ActionBadge({ action, className }: { action: Pick<RoleActionTag, 'name' | 'color' | 'involved'>; className?: string }) {
  return (
    <span
      className={cx('inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold', !action.involved && 'opacity-70', className)}
      style={{ color: action.color, backgroundColor: `${action.color}22`, boxShadow: `inset 0 0 0 1px ${action.color}55` }}
    >
      {action.name}
    </span>
  )
}

/** Mon action dans une stratégie (premier de mes rôles qui y a une action). */
export function myAction(card: Card, myRoleIds: number[], idx: TagIndex) {
  for (const a of card.role_actions ?? []) {
    if (!myRoleIds.includes(a.role_id)) continue
    const action = idx.role_actions.get(a.action_id)
    const role = idx.roles.get(a.role_id)
    if (action && role) return { action, role, note: a.note }
  }
  return null
}

/**
 * Formulaire : « Que fait chaque rôle ? ». Une ligne par rôle du side, une action par rôle
 * (cliquer à nouveau sur l'action la retire), et une note facultative.
 */
export function RoleActionsEditor({
  side,
  tags,
  value,
  myRoleIds,
  onAction,
  onNote,
}: {
  side: Side
  tags: Tags
  value: RoleAction[]
  myRoleIds: number[]
  onAction: (roleId: number, actionId: number | null) => void
  onNote: (roleId: number, note: string) => void
}) {
  const roles = tags.roles.filter((r) => r.side === side && (!r.archived || value.some((a) => a.role_id === r.id)))
  const actions = tags.role_actions
  return (
    <div className="divide-y divide-slate-800 overflow-hidden rounded-xl ring-1 ring-slate-800">
      {roles.map((r) => {
        const current = value.find((a) => a.role_id === r.id)
        const mine = myRoleIds.includes(r.id)
        return (
          <div key={r.id} className={cx('space-y-2 px-3 py-2.5', mine && 'bg-amber-500/5')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cx('w-24 shrink-0 text-sm font-semibold', side === 'CT' ? 'text-sky-200' : 'text-amber-200')}>
                {r.name}
                {mine && <span className="ml-1 text-[10px] font-normal text-amber-400">toi</span>}
              </span>
              <div className="flex flex-1 flex-wrap gap-1" role="radiogroup" aria-label={`Action ${r.name}`}>
                {actions
                  .filter((a) => !a.archived || current?.action_id === a.id)
                  .map((a) => {
                    const on = current?.action_id === a.id
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={`${r.name} : ${a.name}`}
                        onClick={() => onAction(r.id, on ? null : a.id)}
                        className={cx(
                          'min-h-8 rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset transition-colors',
                          'focus-visible:outline-2 focus-visible:outline-amber-400',
                          !on && 'bg-slate-900 text-slate-400 ring-slate-700 hover:text-slate-100',
                        )}
                        style={on ? { color: a.color, backgroundColor: `${a.color}26`, boxShadow: `inset 0 0 0 1.5px ${a.color}` } : undefined}
                      >
                        {a.name}
                      </button>
                    )
                  })}
              </div>
            </div>
            {current && (
              <input
                value={current.note}
                maxLength={200}
                onChange={(e) => onNote(r.id, e.target.value)}
                placeholder="Précision (facultatif) : lance la smoke Window, joue avec l'AWP…"
                className={cx(inputClass, 'py-1.5 text-xs')}
                aria-label={`Précision pour ${r.name}`}
              />
            )}
          </div>
        )
      })}
      {roles.length === 0 && <p className="px-3 py-2.5 text-sm text-slate-500">Aucun rôle pour ce side (Admin → Rôles).</p>}
    </div>
  )
}

/** Fiche : tableau des actions de chaque rôle, avec les joueurs qui tiennent ce rôle. */
export function RoleActionsView({
  card,
  idx,
  myRoleIds,
  members,
}: {
  card: Card
  idx: TagIndex
  myRoleIds: number[]
  members: Member[]
}) {
  const rows = [...(card.role_actions ?? [])].sort(
    (a, b) => (idx.roles.get(a.role_id)?.sort_order ?? 0) - (idx.roles.get(b.role_id)?.sort_order ?? 0),
  )
  if (!rows.length) return null
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Rôle de chacun</h2>
      <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl ring-1 ring-slate-800">
        {rows.map((a) => {
          const role = idx.roles.get(a.role_id)
          const action = idx.role_actions.get(a.action_id)
          if (!role || !action) return null
          const mine = myRoleIds.includes(role.id)
          const players = members.filter((m) => m.role_ids?.includes(role.id))
          return (
            <li key={a.role_id} className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2', mine && 'bg-amber-500/10', !action.involved && 'opacity-60')}>
              <span className={cx('w-24 shrink-0 font-semibold', role.side === 'CT' ? 'text-sky-200' : 'text-amber-200')}>{role.name}</span>
              <ActionBadge action={action} />
              {a.note && <span className="min-w-0 flex-1 text-sm text-slate-300">{a.note}</span>}
              <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
                {mine && <Badge className="bg-amber-500/20 text-amber-200 ring-amber-400/50">Ton rôle</Badge>}
                {players.length > 0 && <span title="Joueurs qui tiennent ce rôle">{players.map((p) => p.display_name || p.email).join(', ')}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------- Stuffs rattachés

function StuffThumb({ card }: { card: Card }) {
  const m = card.media.find((x) => thumbnailOf(x))
  const src = m ? thumbnailOf(m) : null
  const [broken, setBroken] = useState(false)
  return (
    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-800 text-lg text-slate-500">
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        '💨'
      )}
    </span>
  )
}

function stuffSummary(card: Card, idx: TagIndex) {
  const utils = card.utility_ids.map((id) => idx.utilities.get(id)?.name).filter(Boolean)
  const zones = card.zone_ids.map((id) => idx.zones.get(id)?.name).filter(Boolean)
  return [utils.join(' + '), zones.join(', ')].filter(Boolean).join(' · ')
}

/**
 * Formulaire : stuffs utilisés par la stratégie. On choisit parmi les stuffs de la même map
 * (même side par défaut), on indique éventuellement qui le lance, et on ordonne.
 */
export function StuffLinksEditor({
  mapId,
  side,
  cards,
  links,
  tags,
  idx,
  onChange,
}: {
  mapId: number | null
  side: Side | null
  cards: Card[]
  links: StuffLink[]
  tags: Tags
  idx: TagIndex
  onChange: (links: StuffLink[]) => void
}) {
  const [q, setQ] = useState('')
  const [otherSide, setOtherSide] = useState(false)
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const candidates = useMemo(() => {
    const nq = normalize(q)
    return cards.filter(
      (c) =>
        c.kind === 'stuff' &&
        c.map_id === mapId &&
        (otherSide || !side || c.side === side) &&
        !links.some((l) => l.stuff_id === c.id) &&
        (!nq || normalize(`${c.title} ${stuffSummary(c, idx)}`).includes(nq)),
    )
  }, [cards, mapId, side, otherSide, links, q, idx])
  const sideRoles = tags.roles.filter((r) => r.side === side && !r.archived)

  if (!mapId) return <p className="text-sm text-slate-500">Choisis d'abord une map.</p>

  const move = (i: number, d: -1 | 1) => {
    const next = [...links]
    const [x] = next.splice(i, 1)
    next.splice(i + d, 0, x)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {links.length > 0 && (
        <ol className="space-y-1.5">
          {links.map((l, i) => {
            const s = byId.get(l.stuff_id)
            return (
              <li key={l.stuff_id} className="flex items-center gap-2 rounded-lg bg-slate-950/50 p-2 ring-1 ring-slate-800">
                <span className="w-5 text-center text-xs text-slate-500 tabular-nums">{i + 1}</span>
                {s && <StuffThumb card={s} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{s?.title ?? 'Stuff indisponible'}</p>
                  {s && <p className="truncate text-xs text-slate-500">{stuffSummary(s, idx)}</p>}
                </div>
                <select
                  value={l.role_id ?? ''}
                  onChange={(e) => onChange(links.map((x) => (x.stuff_id === l.stuff_id ? { ...x, role_id: e.target.value ? Number(e.target.value) : null } : x)))}
                  className={cx(inputClass, 'w-auto! py-1 text-xs')}
                  aria-label={`Qui lance ${s?.title ?? 'ce stuff'}`}
                >
                  <option value="">Lancé par…</option>
                  {sideRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <div className="flex flex-col">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="px-1 text-xs text-slate-400 hover:text-white disabled:opacity-20" aria-label="Monter">
                    ▲
                  </button>
                  <button type="button" disabled={i === links.length - 1} onClick={() => move(i, 1)} className="px-1 text-xs text-slate-400 hover:text-white disabled:opacity-20" aria-label="Descendre">
                    ▼
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(links.filter((x) => x.stuff_id !== l.stuff_id))}
                  className="rounded px-1.5 text-slate-500 hover:text-red-300"
                  aria-label={`Retirer ${s?.title ?? 'ce stuff'}`}
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ol>
      )}

      <div className="space-y-2 rounded-xl bg-slate-950/40 p-3 ring-1 ring-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher un stuff de cette map (smoke, zone…)"
            className={cx(inputClass, 'min-w-48 flex-1 py-1.5')}
            aria-label="Chercher un stuff"
          />
          {side && (
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input type="checkbox" checked={otherSide} onChange={(e) => setOtherSide(e.target.checked)} className="accent-amber-500" />
              Aussi l'autre side
            </label>
          )}
        </div>
        <ul className="scrollbar-thin max-h-64 space-y-1 overflow-y-auto">
          {candidates.slice(0, 30).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onChange([...links, { stuff_id: c.id, role_id: c.role_ids.find((r) => sideRoles.some((x) => x.id === r)) ?? null }])}
                className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-slate-800"
                aria-label={`Ajouter ${c.title}`}
              >
                <StuffThumb card={c} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-100">{c.title}</span>
                  <span className="block truncate text-xs text-slate-500">{stuffSummary(c, idx)}</span>
                </span>
                <span className="text-sm text-amber-400">+ Ajouter</span>
              </button>
            </li>
          ))}
          {candidates.length === 0 && (
            <li className="px-1 py-2 text-sm text-slate-500">
              {q ? 'Aucun stuff ne correspond.' : 'Aucun autre stuff sur cette map.'}
            </li>
          )}
        </ul>
        <Link
          to={`/new?kind=stuff&map=${mapId}${side ? `&side=${side}` : ''}`}
          target="_blank"
          className="inline-block text-xs text-slate-400 hover:text-amber-300"
        >
          Le stuff n'existe pas encore ? Le créer dans un nouvel onglet ↗
        </Link>
      </div>
    </div>
  )
}

/** Petite ligne cliquable vers une carte (stuff ou stratégie), qui reste dans la modale. */
function CardRowLink({ card, idx, extra }: { card: Card; idx: TagIndex; extra?: React.ReactNode }) {
  const location = useLocation()
  return (
    <Link
      to={`/c/${card.id}`}
      state={location.state}
      className="flex items-center gap-3 rounded-lg bg-slate-950/40 p-2 ring-1 ring-slate-800 hover:ring-slate-600"
    >
      <StuffThumb card={card} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-100">{card.title}</span>
        <span className="block truncate text-xs text-slate-500">{card.kind === 'stuff' ? stuffSummary(card, idx) : card.side}</span>
      </span>
      {extra}
    </Link>
  )
}

/** Fiche d'une stratégie : ses stuffs, dans l'ordre, avec le rôle qui les lance. */
export function StuffLinksView({ card, cards, idx, myRoleIds }: { card: Card; cards: Card[]; idx: TagIndex; myRoleIds: number[] }) {
  const byId = new Map(cards.map((c) => [c.id, c]))
  const items = (card.stuff_links ?? []).flatMap((l) => (byId.has(l.stuff_id) ? [{ ...l, stuff: byId.get(l.stuff_id)! }] : []))
  if (!items.length) return null
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Stuffs utilisés ({items.length})</h2>
      <ol className="space-y-1.5">
        {items.map(({ stuff, role_id }) => {
          const role = role_id ? idx.roles.get(role_id) : undefined
          return (
            <li key={stuff.id}>
              <CardRowLink
                card={stuff}
                idx={idx}
                extra={
                  role && (
                    <Badge className={myRoleIds.includes(role.id) ? 'bg-amber-500/20 text-amber-200 ring-amber-400/50' : undefined}>
                      {myRoleIds.includes(role.id) ? 'À toi · ' : ''}
                      {role.name}
                    </Badge>
                  )
                }
              />
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Fiche d'un stuff : les stratégies qui l'utilisent. */
export function UsedInStrategies({ card, cards, idx }: { card: Card; cards: Card[]; idx: TagIndex }) {
  const strategies = cards.filter((c) => c.kind === 'strategy' && c.status !== 'draft' && c.stuff_links?.some((l) => l.stuff_id === card.id))
  if (card.kind !== 'stuff') return null
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Utilisé dans {strategies.length ? `${strategies.length} stratégie${strategies.length > 1 ? 's' : ''}` : 'aucune stratégie'}</h2>
      {strategies.length > 0 ? (
        <ul className="space-y-1.5">
          {strategies.map((s) => {
            const role = s.stuff_links.find((l) => l.stuff_id === card.id)?.role_id
            return (
              <li key={s.id}>
                <CardRowLink card={s} idx={idx} extra={role ? <Badge>{idx.roles.get(role)?.name}</Badge> : null} />
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Rattache-le depuis le formulaire d'une stratégie (section « Stuffs utilisés »).</p>
      )}
    </section>
  )
}

/** Bouton pour démarrer une stratégie qui utilise déjà ce stuff. */
export function NewStrategyFromStuff({ card }: { card: Card }) {
  if (card.kind !== 'stuff' || !card.map_id) return null
  const q = new URLSearchParams({ kind: 'strategy', map: String(card.map_id), stuff: String(card.id) })
  if (card.side) q.set('side', card.side)
  return (
    <Link
      to={`/new?${q}`}
      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 py-2 text-sm text-slate-100 ring-1 ring-slate-700 ring-inset hover:bg-slate-700"
    >
      🎯 Nouvelle stratégie avec ce stuff
    </Link>
  )
}
