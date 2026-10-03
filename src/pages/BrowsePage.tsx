import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useSearchParams } from 'react-router-dom'
import { useCards, useMyRoleIds, useTagIndex, useTags, EMPTY_TAGS } from '../hooks/data'
import { useMember } from '../hooks/auth'
import {
  activeFilterCount, applyFilters, EMPTY_FILTERS, facetCounts, filtersFromParams, filtersToParams, pruneFilters,
  viewCounts, type Filters, type SortKey,
} from '../lib/filters'
import { FilterPanel } from '../components/FilterPanel'
import { CardTile } from '../components/CardTile'
import { Button, Chip, EmptyState, Spinner, cx, inputClass } from '../components/ui'
import type { CardKind, Side } from '../lib/types'
import { useNewCardHref } from '../components/Layout'
import { DemoPanel } from '../components/DemoPanel'

const KIND_INFO: Record<CardKind, { title: string; one: string; many: string; hint: string }> = {
  strategy: { title: 'Stratégies', one: 'stratégie', many: 'stratégies', hint: 'Ce que fait l’équipe : rôles, timings, stuffs utilisés.' },
  stuff: { title: 'Stuff', one: 'stuff', many: 'stuffs', hint: 'Les grenades : smokes, flashs, molotovs…' },
}

export function BrowsePage({ kind = 'strategy' }: { kind?: CardKind }) {
  const me = useMember()
  const myRoleIds = useMyRoleIds()
  const info = KIND_INFO[kind]
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(params, kind), [params, kind])
  const tagsQ = useTags()
  const cardsQ = useCards()
  const tags = tagsQ.data ?? EMPTY_TAGS
  const idx = useTagIndex(tagsQ.data)
  const [drawer, setDrawer] = useState(false)
  const [q, setQ] = useState(filters.q)
  const newHref = useNewCardHref()

  function update(f: Filters) {
    setParams(filtersToParams(pruneFilters(f, tags)), { replace: true })
  }

  // Recherche plein texte : on attend une courte pause avant de mettre l'URL à jour.
  useEffect(() => {
    if (q === filters.q) return
    const t = setTimeout(() => update({ ...filters, q }), 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])
  useEffect(() => setQ(filters.q), [filters.q])

  const cards = cardsQ.data ?? []
  const ctx = useMemo(() => ({ userId: me.id, myRoleIds }), [me.id, myRoleIds])
  const results = useMemo(() => applyFilters(cards, filters, ctx), [cards, filters, ctx])
  const counts = useMemo(() => facetCounts(cards, filters, ctx), [cards, filters, ctx])
  const views = useMemo(() => viewCounts(cards, me.id, kind), [cards, me.id, kind])
  const kindTotal = useMemo(() => cards.filter((c) => c.kind === kind && c.status !== 'draft').length, [cards, kind])
  const plural = (n: number) => `${n} ${n > 1 ? info.many : info.one}`
  const active = activeFilterCount(filters)
  const order = useMemo(() => results.map((c) => c.id), [results])

  // Rendu progressif : 48 cartes, puis la suite en arrivant en bas de page.
  const PAGE = 48
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [params])
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || shown >= results.length) return
    const obs = new IntersectionObserver((e) => e[0].isIntersecting && setShown((n) => n + PAGE), { rootMargin: '600px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [shown, results.length])

  const panel = <FilterPanel filters={filters} tags={tags} counts={counts} views={views} onChange={update} />
  const toggleMap = (id: number) => update({ ...filters, map: filters.map.length === 1 && filters.map[0] === id ? [] : [id] })
  const toggleSide = (s: Side) => update({ ...filters, side: filters.side.length === 1 && filters.side[0] === s ? [] : [s] })

  return (
    <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-5">
      <aside className="scrollbar-thin sticky top-[4.75rem] hidden max-h-[calc(100dvh-6rem)] w-72 shrink-0 overflow-y-auto pr-2 lg:block">
        {panel}
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <div className="scrollbar-thin absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-slate-950 ring-1 ring-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="font-semibold">Filtres</h2>
              <button type="button" onClick={() => setDrawer(false)} className="rounded p-1 text-slate-400" aria-label="Fermer">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{panel}</div>
            <div className="flex gap-2 border-t border-slate-800 p-3">
              <Button className="flex-1" onClick={() => update({ ...EMPTY_FILTERS, sort: filters.sort })}>
                Réinitialiser
              </Button>
              <Button variant="primary" className="flex-1" onClick={() => setDrawer(false)}>
                Voir {plural(results.length)}
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Playbook</h1>
            {/* Sous-onglets : stratégies / stuff */}
            <nav className="inline-flex rounded-xl bg-slate-900 p-1 ring-1 ring-slate-800" aria-label="Playbook">
              {(
                [
                  ['/', '🎯 Stratégies'],
                  ['/stuff', '💨 Stuff'],
                ] as const
              ).map(([to, label]) => (
                <NavLink
                  key={to}
                  to={to}
                  end
                  className={({ isActive }) =>
                    cx('rounded-lg px-4 py-1.5 text-sm font-semibold', isActive ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white')
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
            <p className="text-sm text-slate-400">{info.hint}</p>
          </div>
          <span className="text-sm text-slate-500">{plural(kindTotal)} au total</span>
        </div>

        {/* Accès rapide : une map, un side, mes rôles (sans ouvrir les filtres) */}
        <div className="scrollbar-thin -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label="Filtres rapides">
          {(['CT', 'T'] as Side[]).map((s) => (
            <Chip key={s} selected={filters.side.length === 1 && filters.side[0] === s} tone={s === 'CT' ? 'ct' : 't'} onClick={() => toggleSide(s)} className="shrink-0 font-bold">
              {s}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-slate-800" />
          {tags.maps
            .filter((m) => !m.archived)
            .map((m) => (
              <Chip key={m.id} selected={filters.map.length === 1 && filters.map[0] === m.id} onClick={() => toggleMap(m.id)} className="shrink-0">
                {m.name}
              </Chip>
            ))}
          <span className="mx-1 w-px shrink-0 bg-slate-800" />
          {kind === 'strategy' && (
            <Chip selected={filters.todo} onClick={() => update({ ...filters, todo: !filters.todo })} className="shrink-0" title="Stratégies que ton équipe doit apprendre">
              📌 À apprendre
            </Chip>
          )}
          <Chip selected={filters.unrated} onClick={() => update({ ...filters, unrated: !filters.unrated })} className="shrink-0" title="Cartes que tu n'as pas encore notées">
            ☆ Pas encore notées
          </Chip>
          {myRoleIds.length ? (
            <Chip selected={filters.mine} onClick={() => update({ ...filters, mine: !filters.mine })} className="shrink-0" title="Cartes qui concernent un de mes rôles">
              ★ Mes rôles
            </Chip>
          ) : (
            <Link to="/moi" className="inline-flex min-h-9 shrink-0 items-center rounded-lg px-3 text-sm text-slate-400 ring-1 ring-slate-800 ring-inset hover:text-slate-100">
              ★ Indique tes rôles
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Rechercher dans les ${info.many}…`}
              className={cx(inputClass, 'py-2.5 pl-9')}
              aria-label="Recherche"
            />
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500">⌕</span>
          </div>
          <Button className="lg:hidden" onClick={() => setDrawer(true)}>
            Filtres{active ? ` (${active})` : ''}
          </Button>
          <select
            value={filters.sort}
            onChange={(e) => update({ ...filters, sort: e.target.value as SortKey })}
            className={cx(inputClass, 'w-auto! py-2.5')}
            aria-label="Tri"
          >
            <option value="recent">Plus récent</option>
            <option value="oldest">Plus ancien</option>
            <option value="alpha">Alphabétique</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-2 text-sm text-slate-400">
          <span>
            {cardsQ.isLoading ? 'Chargement…' : plural(results.length)}
          </span>
          {active > 0 && (
            <button type="button" className="text-amber-400 hover:text-amber-300" onClick={() => update({ ...EMPTY_FILTERS, sort: filters.sort })}>
              Réinitialiser les filtres
            </button>
          )}
        </div>

        {cardsQ.isLoading || tagsQ.isLoading ? (
          <div className="grid place-items-center py-24">
            <Spinner className="size-8" />
          </div>
        ) : cardsQ.error ? (
          <EmptyState title="Impossible de charger les cartes">{(cardsQ.error as Error).message}</EmptyState>
        ) : results.length === 0 ? (
          <EmptyState title={kindTotal ? `Aucune ${info.one} ne correspond` : cards.length ? `Pas encore de ${info.one}` : 'La base est vide'}>
            <Link to={newHref} className="text-amber-400 hover:text-amber-300">
              + Créer {kind === 'stuff' ? 'un stuff' : 'une stratégie'}
              {active ? ' avec ces filtres' : ''}
            </Link>
            {filters.mine && (
              <p className="mt-2">
                Filtre « Mes rôles » actif.{' '}
                <button type="button" className="text-amber-400" onClick={() => update({ ...filters, mine: false })}>
                  Le retirer
                </button>
              </p>
            )}
            {!cards.length && me.role === 'admin' && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <p>Ou charge des cartes de test pour tout vérifier :</p>
                <DemoPanel compact />
              </div>
            )}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {results.slice(0, shown).map((c) => (
              <CardTile key={c.id} card={c} idx={idx} order={order} />
            ))}
          </div>
        )}
        {shown < results.length && (
          <div ref={sentinel} className="flex justify-center py-4">
            <Button onClick={() => setShown((n) => n + PAGE)}>Afficher plus ({results.length - shown} restantes)</Button>
          </div>
        )}
      </main>
    </div>
  )
}
