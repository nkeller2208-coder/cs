import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EMPTY_TAGS, useCards, useMemberIndex, useTags } from '../hooks/data'
import { useMember } from '../hooks/auth'
import { CONTENT_LABEL, PERIOD_LABEL, computeStats, type Period, type Stats } from '../lib/stats'
import { formatDay } from '../lib/text'
import type { Side } from '../lib/types'
import { Spinner, cx } from '../components/ui'

/*
 * Tableau de bord analytique. Toutes les grandeurs sont des quantités d'un seul
 * type : une seule teinte (bleu) du clair au foncé, jamais de palette arc-en-ciel.
 * Rampe séquentielle adaptée au fond sombre : les petites valeurs se fondent
 * dans la surface, les grandes ressortent.
 */
const SEQ = ['#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef']
const BAR = '#3987e5'

export default function DashboardPage() {
  const me = useMember()
  const cardsQ = useCards()
  const tagsQ = useTags()
  const members = useMemberIndex()
  const [period, setPeriod] = useState<Period>('30')
  const tags = tagsQ.data ?? EMPTY_TAGS
  const cards = cardsQ.data ?? []
  const stats = useMemo(() => computeStats(cards, tags, members, period), [cards, tags, members, period])
  const myDrafts = cards.filter((c) => c.status === 'draft' && c.author_id === me.id).length
  const pendingZones = tags.zones.filter((z) => z.pending && !z.archived).length

  if (cardsQ.isLoading || tagsQ.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="size-8" />
      </div>
    )
  }

  const delta = stats.createdPrev == null ? null : stats.created - stats.createdPrev

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Tableau de bord</h1>
          <p className="text-sm text-slate-400">
            Brouillons exclus. La période s'applique à l'activité, aux créations et aux contributeurs ; la couverture porte sur toute la base.
          </p>
        </div>
        <div role="radiogroup" aria-label="Période" className="flex rounded-lg bg-slate-900 p-1 ring-1 ring-slate-800">
          {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className={cx(
                'rounded-md px-3 py-1.5 text-sm',
                period === p ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Indicateurs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Cartes dans la base" value={stats.total} to="/" />
        <Kpi
          label={`Créées · ${PERIOD_LABEL[period].toLowerCase()}`}
          value={stats.created}
          sub={
            delta == null ? undefined : (
              <span className={delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-slate-400'}>
                {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '= stable'} vs les {PERIOD_LABEL[period].toLowerCase()} d'avant
              </span>
            )
          }
        />
        <Kpi label="Contributeurs actifs" value={stats.contributors} sub={<span className="text-slate-400">sur la période</span>} />
        <Kpi
          label="À revoir"
          value={stats.review}
          to="/?view=review"
          tone={stats.review > 0 ? 'warn' : undefined}
          sub={<span className="text-slate-400">{stats.review ? 'lineups à vérifier' : 'rien à signaler'}</span>}
        />
        {me.role === 'admin' ? (
          <Kpi
            label="Zones à valider"
            value={pendingZones}
            to="/admin/zones"
            tone={pendingZones > 0 ? 'warn' : undefined}
            sub={<span className="text-slate-400">proposées par l'équipe</span>}
          />
        ) : (
          <Kpi label="Mes brouillons" value={myDrafts} to="/?view=drafts" sub={<span className="text-slate-400">visibles par toi seul</span>} />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Cartes créées" subtitle={period === '30' || period === '90' ? 'par semaine' : 'par mois'} className="lg:col-span-2">
          <ColumnChart buckets={stats.activity} />
        </Panel>
        <Panel title="Top contributeurs" subtitle={PERIOD_LABEL[period].toLowerCase()}>
          <BarList
            empty="Aucune carte créée sur la période."
            items={stats.leaderboard.slice(0, 8).map((l) => ({ key: l.memberId ?? 'x', label: l.name, value: l.count }))}
          />
        </Panel>
      </div>

      <Coverage stats={stats} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Par catégorie" subtitle="toute la base · clic pour filtrer">
          <BarList items={stats.categories.map((c) => ({ key: String(c.id), label: c.name, value: c.count, to: `/?cat=${c.id}` }))} />
        </Panel>
        <Panel title="Type de contenu" subtitle="média principal de la carte">
          <BarList items={stats.content.map((c) => ({ key: c.kind, label: CONTENT_LABEL[c.kind], value: c.count }))} />
        </Panel>
        <Panel title="Niveau de risque" subtitle="toute la base">
          <BarList
            items={stats.risks.map((r) => ({
              key: String(r.id),
              label: r.name,
              value: r.count,
              marker: r.color ?? undefined,
              to: r.id ? `/?risk=${r.id}` : undefined,
            }))}
          />
        </Panel>
      </div>

      <Panel title="File « À revoir »" subtitle="signalements en attente">
        {stats.reviewCards.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune carte signalée. 👌</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {stats.reviewCards.slice(0, 10).map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                <Link to={`/c/${c.id}`} className="font-medium text-slate-100 hover:text-amber-300">
                  {c.title}
                </Link>
                <span className="text-sm text-slate-400">« {c.review_comment} »</span>
                <span className="ml-auto text-xs text-slate-500">{formatDay(c.updated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------- éléments

function Panel({ title, subtitle, children, className }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-800', className)}>
      <header className="mb-3 flex items-baseline gap-2">
        <h2 className="font-semibold text-slate-100">{title}</h2>
        {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
      </header>
      {children}
    </section>
  )
}

function Kpi({ label, value, sub, to, tone }: { label: string; value: number; sub?: ReactNode; to?: string; tone?: 'warn' }) {
  const body = (
    <>
      <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">{label}</p>
      <p className={cx('mt-1 text-3xl font-bold tabular-nums', tone === 'warn' ? 'text-amber-300' : 'text-slate-50')}>
        {tone === 'warn' && <span aria-hidden>⚠ </span>}
        {value}
      </p>
      {sub && <p className="mt-1 text-xs">{sub}</p>}
    </>
  )
  const cls = 'block rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-800'
  return to ? (
    <Link to={to} className={cx(cls, 'transition hover:ring-slate-600')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** Histogramme en colonnes (une seule série) avec info-bulle au survol. */
function ColumnChart({ buckets }: { buckets: Stats['activity'] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  const every = Math.ceil(buckets.length / 8) // étiquettes d'axe sélectives
  const total = buckets.reduce((a, b) => a + b.count, 0)
  if (!total) return <p className="py-12 text-center text-sm text-slate-500">Aucune carte créée sur la période.</p>
  return (
    <figure>
      <div className="relative h-44">
        {/* lignes de repère discrètes */}
        {[1, 0.5].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t" style={{ bottom: `${f * 100}%`, borderColor: '#1e293b' }}>
            <span className="absolute -top-2 left-0 bg-slate-900 pr-1 text-[10px] text-slate-500 tabular-nums">{Math.round(max * f)}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-0.5 pl-7">
          {buckets.map((b) => (
            <div key={b.label} className="group relative flex h-full flex-1 items-end" tabIndex={0} aria-label={`${b.label} : ${b.count} carte(s)`}>
              <div
                className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
                style={{ height: `${(b.count / max) * 100}%`, minHeight: b.count ? 3 : 0, backgroundColor: BAR }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-slate-800 px-2 py-1 text-xs whitespace-nowrap text-slate-100 shadow-lg ring-1 ring-slate-700 group-hover:block group-focus:block">
                {b.label} · <strong className="tabular-nums">{b.count}</strong> carte{b.count > 1 ? 's' : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-0.5 pl-7">
        {buckets.map((b, i) => (
          <span key={b.label} className="flex-1 truncate text-center text-[10px] text-slate-500">
            {i % every === 0 || i === buckets.length - 1 ? b.label : ''}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        {buckets.map((b) => `${b.label} : ${b.count}`).join(', ')}
      </figcaption>
    </figure>
  )
}

/** Barres horizontales avec valeur affichée (quelques catégories au plus). */
function BarList({
  items,
  empty = 'Aucune donnée.',
}: {
  items: { key: string; label: string; value: number; to?: string; marker?: string }[]
  empty?: string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (!items.length || items.every((i) => !i.value)) return <p className="text-sm text-slate-500">{empty}</p>
  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 truncate text-slate-300">
                {it.marker && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: it.marker }} />}
                {it.label}
              </span>
              <span className="font-semibold text-slate-100 tabular-nums">{it.value}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-slate-800">
              <div className="h-2 rounded-full" style={{ width: `${(it.value / max) * 100}%`, backgroundColor: BAR }} />
            </div>
          </>
        )
        return (
          <li key={it.key}>
            {it.to ? (
              <Link to={it.to} className="block rounded-md hover:bg-slate-800/60">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Carte de chaleur map × rôle : repère d'un coup d'œil les trous de la base. */
function Coverage({ stats }: { stats: Stats }) {
  const [side, setSide] = useState<Side>('CT')
  const { roles, rows } = stats.coverage[side]
  const max = Math.max(1, ...rows.flatMap((r) => [...r.byRole.values(), r.noRole]))
  const gaps = rows.flatMap((r) => roles.filter((ro) => !r.byRole.get(ro.id)).map((ro) => `${r.mapName} · ${ro.name}`))

  function cell(count: number, href: string, label: string) {
    if (!count) {
      return (
        <Link to={href.replace('/?', '/new?')} title={`${label} : aucune carte — cliquer pour en créer une`} className="grid h-9 place-items-center rounded-md text-xs text-slate-600 ring-1 ring-slate-800 ring-inset hover:text-amber-300 hover:ring-amber-500/50">
          +
        </Link>
      )
    }
    const step = Math.min(SEQ.length - 1, Math.floor((count / max) * (SEQ.length - 1)))
    return (
      <Link
        to={href}
        title={`${label} : ${count} carte${count > 1 ? 's' : ''}`}
        className="grid h-9 place-items-center rounded-md text-sm font-semibold tabular-nums hover:ring-2 hover:ring-amber-400"
        style={{ backgroundColor: SEQ[step], color: step >= 6 ? '#020617' : '#f8fafc' }}
      >
        {count}
      </Link>
    )
  }

  return (
    <Panel title="Couverture map × rôle" subtitle="toute la base · clic pour voir les cartes, « + » pour combler un trou">
      <div className="mb-3 flex items-center gap-3">
        <div role="radiogroup" aria-label="Side" className="flex rounded-lg bg-slate-950 p-1 ring-1 ring-slate-800">
          {(['CT', 'T'] as Side[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={side === s}
              onClick={() => setSide(s)}
              className={cx(
                'rounded-md px-4 py-1 text-sm font-bold',
                side === s ? (s === 'CT' ? 'bg-ct text-white' : 'bg-t text-slate-950') : 'text-slate-400',
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          {gaps.length ? `${gaps.length} combinaison${gaps.length > 1 ? 's' : ''} sans aucune carte` : 'Tous les rôles sont couverts sur toutes les maps.'}
        </span>
      </div>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0.5 text-left">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="px-2 py-1 font-medium">Map</th>
              {roles.map((r) => (
                <th key={r.id} className="px-1 py-1 text-center font-medium">
                  {r.name}
                </th>
              ))}
              <th className="px-1 py-1 text-center font-medium">Sans rôle</th>
              <th className="px-2 py-1 text-right font-medium">Total {side}</th>
              <th className="px-2 py-1 text-right font-medium">Callouts couverts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const base = `/?map=${row.mapId}&side=${side}`
              return (
                <tr key={row.mapId}>
                  <th className="px-2 text-sm font-semibold whitespace-nowrap text-slate-200">{row.mapName}</th>
                  {roles.map((r) => (
                    <td key={r.id} className="min-w-16">
                      {cell(row.byRole.get(r.id) ?? 0, `${base}&role=${r.id}`, `${row.mapName} ${side} ${r.name}`)}
                    </td>
                  ))}
                  <td className="min-w-16">
                    {row.noRole ? cell(row.noRole, base, `${row.mapName} ${side} sans rôle`) : <span className="grid h-9 place-items-center text-xs text-slate-700">·</span>}
                  </td>
                  <td className="px-2 text-right text-sm font-semibold text-slate-100 tabular-nums">{row.total}</td>
                  <td className="px-2 text-right text-xs whitespace-nowrap text-slate-400 tabular-nums">
                    {row.zonesTotal ? (
                      <span title={`${row.zonesCovered} callouts sur ${row.zonesTotal} ont au moins une carte (tous sides)`}>
                        {row.zonesCovered}/{row.zonesTotal}
                        <span className="ml-2 inline-block h-1.5 w-12 rounded-full bg-slate-800 align-middle">
                          <span className="block h-1.5 rounded-full" style={{ width: `${(row.zonesCovered / row.zonesTotal) * 100}%`, backgroundColor: BAR }} />
                        </span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500" aria-hidden>
        <span>moins</span>
        {SEQ.map((c) => (
          <span key={c} className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: c }} />
        ))}
        <span>plus</span>
      </div>
    </Panel>
  )
}
