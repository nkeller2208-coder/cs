import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { canEditCard, qk, useCards, useMemberIndex, usePrinciples, useTagIndex, useTags, type TagIndex } from '../hooks/data'
import { useMember } from '../hooks/auth'
import { deleteCard, fetchHistory, flagCard, linkPrincipleCard, resolveCardReview, unlinkPrincipleCard } from '../lib/api'
import { principlesForCard } from '../lib/principles'
import { LinkPicker } from '../components/PrinciplePieces'
import { errorMessage } from '../lib/supabase'
import { formatDate } from '../lib/text'
import { diffSnapshots } from '../lib/history'
import type { Card, Member } from '../lib/types'
import { CardBadges, StatusBadge } from '../components/CardBadges'
import { MediaView } from '../components/MediaView'
import { Markdown } from '../components/Markdown'
import { Button, Modal, Spinner, cx, inputClass } from '../components/ui'
import { useToast } from '../components/toast'

function memberName(members: Map<string, Member>, id: string | null) {
  if (!id) return 'Ancien membre'
  return members.get(id)?.display_name || members.get(id)?.email || 'Ancien membre'
}

/** Vue détaillée : en modale au-dessus de la grille, ou en page si on arrive par l'URL. */
export function CardDetailRoute({ asModal }: { asModal: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const close = () => {
    const bg = (location.state as { background?: Location } | null)?.background
    if (bg) navigate(-1)
    else navigate('/')
  }
  if (asModal) {
    return (
      <Modal open onClose={close} wide>
        <CardDetail onClose={close} />
      </Modal>
    )
  }
  return (
    <div className="mx-auto max-w-4xl px-0 py-0 sm:px-4 sm:py-6">
      <div className="bg-slate-900 ring-1 ring-slate-800 sm:rounded-2xl">
        <CardDetail onClose={close} />
      </div>
    </div>
  )
}

function CardDetail({ onClose }: { onClose: () => void }) {
  const { id } = useParams()
  const cardId = Number(id)
  const me = useMember()
  const cardsQ = useCards()
  const tagsQ = useTags()
  const idx = useTagIndex(tagsQ.data)
  const members = useMemberIndex()
  const card = cardsQ.data?.find((c) => c.id === cardId)
  // Lien partagé vers une carte créée depuis le dernier chargement : on recharge une fois.
  const [refetched, setRefetched] = useState(false)
  useEffect(() => {
    if (!card && cardsQ.isSuccess && !refetched) {
      setRefetched(true)
      cardsQ.refetch()
    }
  }, [card, cardsQ, refetched])

  if (cardsQ.isLoading || tagsQ.isLoading || (!card && (!refetched || cardsQ.isFetching))) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="size-8" />
      </div>
    )
  }
  if (!card) {
    return (
      <div className="space-y-3 p-8 text-center">
        <p className="text-lg font-semibold">Carte introuvable</p>
        <p className="text-sm text-slate-400">Elle a peut-être été supprimée, ou c'est le brouillon de quelqu'un d'autre.</p>
        <Button onClick={onClose}>Retour aux cartes</Button>
      </div>
    )
  }
  return <CardDetailBody card={card} idx={idx} members={members} me={me} onClose={onClose} />
}

function CardDetailBody({
  card, idx, members, me, onClose,
}: {
  card: Card
  idx: TagIndex
  members: Map<string, Member>
  me: Member
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [comment, setComment] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const location = useLocation()

  // Carte précédente / suivante dans l'ordre de la grille filtrée (← / →).
  const navState = location.state as { background?: unknown; order?: number[] } | null
  const pos = navState?.order?.indexOf(card.id) ?? -1
  const prevId = pos > 0 ? navState!.order![pos - 1] : null
  const nextId = pos >= 0 && pos < navState!.order!.length - 1 ? navState!.order![pos + 1] : null
  const go = (id: number | null) => id && navigate(`/c/${id}`, { replace: true, state: navState })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA'].includes(t.tagName) || confirmDelete || flagging) return
      if (e.key === 'ArrowLeft') go(prevId)
      if (e.key === 'ArrowRight') go(nextId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const editable = canEditCard(card, me)
  const canResolve = editable || card.review_by === me.id

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.cards })
    qc.invalidateQueries({ queryKey: qk.history(card.id) })
  }

  const del = useMutation({
    mutationFn: () => deleteCard(card.id),
    onSuccess: () => {
      toast('Carte supprimée')
      qc.setQueryData<Card[]>(qk.cards, (old) => old?.filter((c) => c.id !== card.id))
      onClose()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const flag = useMutation({
    mutationFn: () => flagCard(card.id, comment),
    onSuccess: () => {
      toast('Carte signalée « À revoir »')
      setFlagging(false)
      setComment('')
      refresh()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const resolve = useMutation({
    mutationFn: () => resolveCardReview(card.id),
    onSuccess: () => {
      toast('Signalement levé')
      refresh()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  async function copyLink() {
    const url = `${window.location.origin}/c/${card.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Lien copié', 'info')
    } catch {
      window.prompt('Lien de la carte', url)
    }
  }

  return (
    <article>
      <header className="flex items-start gap-3 border-b border-slate-800 px-5 py-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <StatusBadge status={card.status} />
            <span className="text-xs text-slate-500">#{card.id}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-50 sm:text-2xl">{card.title || 'Sans titre'}</h1>
          <CardBadges card={card} idx={idx} full />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {pos >= 0 && (
            <>
              <button type="button" onClick={() => go(prevId)} disabled={!prevId} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-25" aria-label="Carte précédente (←)" title="Carte précédente (←)">
                ‹
              </button>
              <span className="text-xs text-slate-500 tabular-nums">
                {pos + 1}/{navState!.order!.length}
              </span>
              <button type="button" onClick={() => go(nextId)} disabled={!nextId} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-25" aria-label="Carte suivante (→)" title="Carte suivante (→)">
                ›
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Fermer">
            ✕
          </button>
        </div>
      </header>

      {card.status === 'review' && (
        <div className="mx-5 mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-red-500/10 px-4 py-3 ring-1 ring-red-500/30">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-red-200">À revoir</p>
            <p className="text-red-100/80">
              {card.review_comment}
              {card.review_by && <span className="text-red-200/60"> — {memberName(members, card.review_by)}</span>}
            </p>
          </div>
          {canResolve && (
            <Button size="sm" onClick={() => resolve.mutate()} disabled={resolve.isPending}>
              ✓ Lever le signalement
            </Button>
          )}
        </div>
      )}

      <div className="space-y-5 px-5 py-5">
        {card.media.length > 0 && (
          <div className="space-y-4">
            {card.media.map((m, i) => (
              <MediaView key={`${m.url}-${i}`} media={m} />
            ))}
          </div>
        )}
        {card.description.trim() && <Markdown source={card.description} className="text-base" />}

        <CardPrinciples card={card} me={me} />

        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-slate-800 pt-4 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-slate-500">Auteur</dt>
            <dd className="text-slate-200">{memberName(members, card.author_id)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Créée le</dt>
            <dd className="text-slate-200">{formatDate(card.created_at)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Modifiée par</dt>
            <dd className="text-slate-200">{memberName(members, card.updated_by ?? card.author_id)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Modifiée le</dt>
            <dd className="text-slate-200">{formatDate(card.updated_at)}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2">
          {editable && (
            <Link to={`/c/${card.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400">
              ✎ Modifier
            </Link>
          )}
          <Button onClick={() => navigate(`/new?from=${card.id}`)}>⧉ Dupliquer</Button>
          <Button onClick={copyLink}>🔗 Copier le lien</Button>
          {card.status === 'published' && <Button onClick={() => setFlagging(true)}>⚠ Signaler « À revoir »</Button>}
          <Button variant="ghost" onClick={() => setShowHistory((s) => !s)}>
            🕘 Historique
          </Button>
          <span className="flex-1" />
          {editable && (
            <Button variant="ghost" className="text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => setConfirmDelete(true)}>
              Supprimer
            </Button>
          )}
        </div>

        {showHistory && <History cardId={card.id} idx={idx} members={members} />}
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Supprimer la carte ?">
        <div className="space-y-4 p-5">
          <p className="text-sm text-slate-300">
            « {card.title} » sera définitivement supprimée, ainsi que son historique.
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmDelete(false)}>Annuler</Button>
            <Button variant="danger" onClick={() => del.mutate()} disabled={del.isPending}>
              Supprimer
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={flagging} onClose={() => setFlagging(false)} title="Signaler « À revoir »">
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (comment.trim()) flag.mutate()
          }}
        >
          <p className="text-sm text-slate-400">Lineup cassé après un patch, info obsolète… Explique en une phrase.</p>
          <input
            autoFocus
            value={comment}
            maxLength={280}
            onChange={(e) => setComment(e.target.value)}
            className={inputClass}
            placeholder="Ex. : la smoke ne passe plus depuis le patch du 12/09"
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setFlagging(false)}>Annuler</Button>
            <button
              type="submit"
              disabled={!comment.trim() || flag.isPending}
              className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              Signaler
            </button>
          </div>
        </form>
      </Modal>
    </article>
  )
}

function History({ cardId, idx, members }: { cardId: number; idx: TagIndex; members: Map<string, Member> }) {
  const q = useQuery({ queryKey: qk.history(cardId), queryFn: () => fetchHistory(cardId) })
  if (q.isLoading) return <Spinner />
  if (q.error) return <p className="text-sm text-red-400">{errorMessage(q.error)}</p>
  const entries = q.data ?? []
  return (
    <section className="space-y-3 rounded-xl bg-slate-950/50 p-4 ring-1 ring-slate-800">
      <h2 className="text-sm font-semibold">Historique des modifications</h2>
      {entries.length === 0 && <p className="text-sm text-slate-500">Aucun historique.</p>}
      <ol className="space-y-3">
        {entries.map((e, i) => {
          const prev = entries[i + 1]?.snapshot ?? null
          const changes = diffSnapshots(prev, e.snapshot, idx)
          return (
            <li key={e.id} className="border-l-2 border-slate-700 pl-3">
              <p className="text-xs text-slate-500">
                {formatDate(e.changed_at)} · <span className="text-slate-300">{memberName(members, e.changed_by)}</span>
              </p>
              <ul className={cx('mt-1 space-y-0.5 text-sm text-slate-300')}>
                {changes.map((c, j) => (
                  <li key={j}>{c}</li>
                ))}
                {e.note && <li className="text-slate-400 italic">« {e.note} »</li>}
              </ul>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Principes de jeu de la carte : rattachés explicitement + concernés par ses étiquettes. */
function CardPrinciples({ card, me }: { card: Card; me: Member }) {
  const qc = useQueryClient()
  const toast = useToast()
  const principles = usePrinciples().data ?? []
  const [adding, setAdding] = useState(false)
  const { linked, matching } = principlesForCard(card, principles)
  const refresh = () => qc.invalidateQueries({ queryKey: qk.principles })
  const onError = (e: unknown) => toast(errorMessage(e), 'error')
  const link = useMutation({ mutationFn: (pid: number) => linkPrincipleCard(pid, card.id, me.id), onSuccess: refresh, onError })
  const unlink = useMutation({ mutationFn: (pid: number) => unlinkPrincipleCard(pid, card.id), onSuccess: refresh, onError })
  if (card.status === 'draft' && !linked.length && !matching.length) return null

  const item = (p: (typeof principles)[number], auto: boolean) => (
    <li key={p.id} className="flex items-start gap-2 rounded-lg bg-slate-950/40 px-3 py-2 ring-1 ring-slate-800">
      <span className="mt-0.5 text-amber-400">{p.pinned ? '★' : '◆'}</span>
      <div className="min-w-0 flex-1">
        <Link to={`/principes/${p.id}`} className="font-medium text-slate-100 hover:text-amber-300">
          {p.title}
        </Link>
        {p.summary && <p className="text-sm text-slate-400">{p.summary}</p>}
      </div>
      {auto ? (
        <span className="shrink-0 text-[11px] text-slate-500" title="Rattaché automatiquement : les étiquettes de la carte correspondent">
          via étiquettes
        </span>
      ) : (
        <button type="button" onClick={() => unlink.mutate(p.id)} className="shrink-0 rounded px-1.5 text-slate-500 hover:text-red-300" aria-label={`Détacher ${p.title}`} title="Détacher">
          ✕
        </button>
      )}
    </li>
  )

  return (
    <section className="space-y-2 border-t border-slate-800 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Principes de jeu</h2>
        {card.status !== 'draft' && (
          <div className="flex gap-3 text-sm">
            <button type="button" onClick={() => setAdding((a) => !a)} className="text-amber-400 hover:text-amber-300">
              + Rattacher un principe
            </button>
            <Link to={`/principes/new?card=${card.id}`} className="text-slate-400 hover:text-slate-200">
              Créer depuis cette carte
            </Link>
          </div>
        )}
      </div>
      {adding && (
        <LinkPicker
          items={principles}
          exclude={linked.map((p) => p.id)}
          onPick={(p) => {
            link.mutate(p.id)
            setAdding(false)
          }}
          placeholder="Chercher un principe…"
        />
      )}
      {!linked.length && !matching.length ? (
        <p className="text-sm text-slate-500">Aucun principe rattaché.</p>
      ) : (
        <ul className="space-y-1.5">
          {linked.map((p) => item(p, false))}
          {matching.map((p) => item(p, true))}
        </ul>
      )}
    </section>
  )
}
