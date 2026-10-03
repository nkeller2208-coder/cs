import { Link, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk, useTagIndex, useTags } from '../hooks/data'
import { useMember } from '../hooks/auth'
import { fetchCardLearning, fetchTeamLearning, rateCard, setTeamCardStatus } from '../lib/api'
import { errorMessage } from '../lib/http'
import type { Card, TeamCardStatus } from '../lib/types'
import { Badge, Spinner, cx } from './ui'
import { useToast } from './toast'

/** Échelle de niveau (note sur 5). */
export const LEVELS = ['', 'Je découvre', 'J’ai des notions', 'En cours', 'Solide', 'Je maîtrise']

export const TEAM_STATUS_LABEL: Record<TeamCardStatus | 'none', string> = {
  none: 'Non travaillée',
  to_learn: 'À apprendre',
  learned: 'Maîtrisée',
}

/** Étoiles de 1 à 5. Interactives si `onChange` : re-cliquer la note actuelle l'efface. */
export function Stars({
  value,
  onChange,
  size = 'md',
  label,
}: {
  value: number | null | undefined
  onChange?: (n: number) => void
  size?: 'sm' | 'md' | 'lg'
  label?: string
}) {
  const v = value ?? 0
  const cls = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-xs' : 'text-base'
  if (!onChange) {
    return (
      <span className={cx('inline-flex tracking-tight', cls)} aria-label={v ? `${v} sur 5` : 'Pas encore noté'} title={v ? `${v}/5 · ${LEVELS[v]}` : 'Pas encore noté'}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= v ? 'text-amber-400' : 'text-slate-700'}>
            ★
          </span>
        ))}
      </span>
    )
  }
  return (
    <span className={cx('inline-flex', cls)} role="radiogroup" aria-label={label ?? 'Mon niveau'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={v === n}
          aria-label={`${n} sur 5 : ${LEVELS[n]}`}
          title={v === n ? 'Effacer ma note' : `${n}/5 · ${LEVELS[n]}`}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onChange(v === n ? 0 : n)
          }}
          className={cx('px-0.5 leading-none transition-transform hover:scale-125', n <= v ? 'text-amber-400' : 'text-slate-600 hover:text-amber-200')}
        >
          ★
        </button>
      ))}
    </span>
  )
}

/** Badge de vignette : statut d'équipe d'une stratégie. */
export function LearningBadge({ card }: { card: Card }) {
  const statuses = (card.learning ?? []).map((l) => l.status)
  if (statuses.includes('to_learn')) return <Badge className="bg-sky-500/15 text-sky-200 ring-sky-400/40">📌 À apprendre</Badge>
  if (statuses.includes('learned')) return <Badge className="bg-emerald-500/15 text-emerald-200 ring-emerald-500/30">✓ Maîtrisée</Badge>
  return null
}

/** Noter une carte : met à jour la liste des cartes et le panneau d'apprentissage. */
export function useRateCard(cardId: number) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (rating: number) => rateCard(cardId, rating),
    onMutate: (rating) => {
      qc.setQueryData<Card[]>(qk.cards, (old) => old?.map((c) => (c.id === cardId ? { ...c, my_rating: rating || null } : c)))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.learning(cardId) })
      qc.invalidateQueries({ queryKey: ['learning', 'team'] })
    },
    onError: (e) => {
      toast(errorMessage(e), 'error')
      qc.invalidateQueries({ queryKey: qk.cards })
    },
  })
}

/** Fiche : mon niveau, et pour chaque équipe le statut (stratégies) et les notes des joueurs. */
export function CardLearningPanel({ card }: { card: Card }) {
  const me = useMember()
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: qk.learning(card.id), queryFn: () => fetchCardLearning(card.id), enabled: card.status !== 'draft' })
  const rate = useRateCard(card.id)
  const setStatus = useMutation({
    mutationFn: ({ teamId, status }: { teamId: number; status: TeamCardStatus | 'none' }) => setTeamCardStatus(card.id, teamId, status),
    onSuccess: (_d, v) => {
      toast(`« ${card.title} » : ${TEAM_STATUS_LABEL[v.status].toLowerCase()}`)
      qc.invalidateQueries({ queryKey: qk.learning(card.id) })
      qc.invalidateQueries({ queryKey: qk.cards })
      qc.invalidateQueries({ queryKey: ['learning', 'team'] })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  if (card.status === 'draft') return null
  const mine = card.my_rating ?? q.data?.my_rating ?? null
  const strategy = card.kind === 'strategy'

  return (
    <section className="space-y-3 rounded-xl bg-slate-950/40 p-4 ring-1 ring-slate-800">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">Mon niveau</h2>
        <Stars value={mine} onChange={(n) => rate.mutate(n)} size="lg" />
        <span className="text-sm text-slate-400">{mine ? LEVELS[mine] : 'Pas encore noté : clique sur une étoile'}</span>
      </div>

      {q.isLoading && <Spinner />}
      {(q.data?.teams ?? []).map((t) => {
        const rated = t.players.filter((p) => p.rating)
        const avg = rated.length ? rated.reduce((s, p) => s + (p.rating ?? 0), 0) / rated.length : null
        return (
          <div key={t.id} className="space-y-2 border-t border-slate-800 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-200">{t.name}</span>
              {strategy &&
                (t.can_manage ? (
                  <span className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-700" role="radiogroup" aria-label={`Statut pour ${t.name}`}>
                    {(['none', 'to_learn', 'learned'] as const).map((s) => {
                      const on = (t.status ?? 'none') === s
                      return (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={setStatus.isPending}
                          onClick={() => !on && setStatus.mutate({ teamId: t.id, status: s })}
                          className={cx(
                            'px-2.5 py-1 text-xs',
                            on
                              ? s === 'to_learn'
                                ? 'bg-sky-500/25 text-sky-100'
                                : s === 'learned'
                                  ? 'bg-emerald-500/25 text-emerald-100'
                                  : 'bg-slate-700 text-slate-100'
                              : 'text-slate-400 hover:bg-slate-800',
                          )}
                        >
                          {TEAM_STATUS_LABEL[s]}
                        </button>
                      )
                    })}
                  </span>
                ) : (
                  <Badge>{TEAM_STATUS_LABEL[t.status ?? 'none']}</Badge>
                ))}
              {avg != null && (
                <span className="ml-auto text-xs text-slate-400">
                  Moyenne {avg.toFixed(1)}/5 · {rated.length}/{t.players.length} noté{rated.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {t.players.length > 0 && (
              <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {t.players.map((p) => (
                  <li key={p.id} className={cx('flex items-center justify-between gap-2 text-sm', p.id === me.id && 'text-amber-200')}>
                    <span className="truncate">{p.display_name || p.email}</span>
                    <Stars value={p.rating} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {strategy && q.data && !q.data.teams.length && (
        <p className="text-xs text-slate-500">Rejoins une équipe pour suivre son apprentissage (le capitaine met les stratégies « à apprendre »).</p>
      )}
    </section>
  )
}

/** Équipe : stratégies suivies × notes de chaque joueur (vue du capitaine). */
export function TeamLearningBoard({ teamId }: { teamId: number }) {
  const location = useLocation()
  const idx = useTagIndex(useTags().data)
  const q = useQuery({ queryKey: qk.teamLearning(teamId), queryFn: () => fetchTeamLearning(teamId) })
  if (q.isLoading) return <Spinner />
  const data = q.data
  if (!data) return null
  const rating = (m: string, c: number) => data.ratings.find((r) => r.member_id === m && r.card_id === c)?.rating ?? null
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Playbook de l'équipe</p>
        <Link to="/?aapprendre=1" className="text-xs text-amber-400 hover:text-amber-300">
          Voir les stratégies à apprendre →
        </Link>
      </div>
      {!data.cards.length ? (
        <p className="text-sm text-slate-500">
          Aucune stratégie suivie. {data.can_manage ? 'Ouvre une stratégie et choisis « À apprendre » pour cette équipe.' : 'Le capitaine choisit les stratégies à apprendre.'}
        </p>
      ) : (
        <div className="scrollbar-thin overflow-x-auto rounded-xl ring-1 ring-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-950/60 text-xs text-slate-400">
                <th className="px-3 py-2 text-left font-medium">Stratégie</th>
                {data.players.map((p) => (
                  <th key={p.id} className="px-2 py-2 text-center font-medium whitespace-nowrap">
                    {p.display_name || p.email}
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-medium">Moyenne</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.cards.map((c) => {
                const notes = data.players.map((p) => rating(p.id, c.card_id)).filter((x): x is number => x != null)
                const avg = notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null
                return (
                  <tr key={c.card_id}>
                    <td className="px-3 py-2">
                      <Link to={`/c/${c.card_id}`} state={{ background: location }} className="font-medium text-slate-100 hover:text-amber-300">
                        {c.title}
                      </Link>
                      <span className="ml-2 text-xs text-slate-500">
                        {[c.map_id ? idx.maps.get(c.map_id)?.name : null, c.side].filter(Boolean).join(' · ')}
                      </span>
                      {c.status === 'learned' && <span className="ml-2 text-xs text-emerald-300">✓ maîtrisée</span>}
                    </td>
                    {data.players.map((p) => (
                      <td key={p.id} className="px-2 py-2 text-center">
                        <Stars value={rating(p.id, c.card_id)} size="sm" />
                      </td>
                    ))}
                    <td className={cx('px-2 py-2 text-center tabular-nums', avg == null ? 'text-slate-600' : avg >= 4 ? 'text-emerald-300' : avg >= 2.5 ? 'text-amber-300' : 'text-red-300')}>
                      {avg == null ? '—' : avg.toFixed(1)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
