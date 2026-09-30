import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCards, useTagIndex, useTags, EMPTY_TAGS } from '../hooks/data'
import { useMember } from '../hooks/auth'
import {
  activeFilterCount, applyFilters, EMPTY_FILTERS, facetCounts, filtersFromParams, filtersToParams, pruneFilters,
  viewCounts, type Filters, type SortKey,
} from '../lib/filters'
import { FilterPanel } from '../components/FilterPanel'
import { CardTile } from '../components/CardTile'
import { Button, EmptyState, Spinner, cx, inputClass } from '../components/ui'
import { useNewCardHref } from '../components/Layout'
import { DemoPanel } from '../components/DemoPanel'

export function BrowsePage() {
  const me = useMember()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(params), [params])
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
  const results = useMemo(() => applyFilters(cards, filters, me.id), [cards, filters, me.id])
  const counts = useMemo(() => facetCounts(cards, filters, me.id), [cards, filters, me.id])
  const views = useMemo(() => viewCounts(cards, me.id), [cards, me.id])
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
                Voir {results.length} carte{results.length > 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher dans les titres et descriptions…"
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
            {cardsQ.isLoading ? 'Chargement…' : `${results.length} carte${results.length > 1 ? 's' : ''}`}
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
          <EmptyState title={cards.length ? 'Aucune carte ne correspond' : 'La base est vide'}>
            <Link to={newHref} className="text-amber-400 hover:text-amber-300">
              + Créer une carte{active ? ' avec ces filtres' : ''}
            </Link>
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
