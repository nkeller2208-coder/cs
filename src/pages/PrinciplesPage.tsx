import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { EMPTY_TAGS, qk, useCards, useMemberIndex, usePrinciples, useTagIndex, useTags } from '../hooks/data'
import { useMember } from '../hooks/auth'
import { deletePrinciple, linkPrincipleCard, savePrinciple, unlinkPrincipleCard, type PrinciplePayload } from '../lib/api'
import { cardsForPrinciple, isGeneral, principleFilterHref, principleMatchesCard, searchPrinciple } from '../lib/principles'
import { errorMessage } from '../lib/supabase'
import { byOrder, formatDate } from '../lib/text'
import type { Principle, Side } from '../lib/types'
import { CardTile } from '../components/CardTile'
import { LinkPicker, PrincipleBadges, PrincipleTile, cardLabel } from '../components/PrinciplePieces'
import { Markdown, MarkdownEditor } from '../components/Markdown'
import { Button, Chip, EmptyState, Field, Modal, Spinner, cx, inputClass } from '../components/ui'
import { useToast } from '../components/toast'

function canEdit(p: Pick<Principle, 'author_id'>, me: { id: string; role: string }) {
  return me.role === 'admin' || p.author_id === me.id
}

function Loading() {
  return (
    <div className="grid place-items-center py-24">
      <Spinner className="size-8" />
    </div>
  )
}

// ================================================================ Liste

export default function PrinciplesPage() {
  const tagsQ = useTags()
  const principlesQ = usePrinciples()
  const cards = useCards().data ?? []
  const tags = tagsQ.data ?? EMPTY_TAGS
  const idx = useTagIndex(tagsQ.data)
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const theme = params.get('theme')
  const side = params.get('side') as Side | null
  const map = params.get('map') ? Number(params.get('map')) : null

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const principles = principlesQ.data ?? []
  const filtered = principles.filter(
    (p) =>
      searchPrinciple(p, q) &&
      (!theme || String(p.theme_id ?? 'none') === theme) &&
      // Un principe sans side / sans map s'applique à tous : on le garde.
      (!side || !p.sides.length || p.sides.includes(side)) &&
      (!map || !p.map_ids.length || p.map_ids.includes(map)),
  )
  const counts = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of principles) {
      const r = cardsForPrinciple(p, cards)
      m.set(p.id, r.linked.length + r.matching.length)
    }
    return m
  }, [principles, cards])

  const themes = [...tags.principle_themes].sort(byOrder)
  const groups = [
    ...themes.map((t) => ({ key: String(t.id), name: t.name, items: filtered.filter((p) => p.theme_id === t.id) })),
    { key: 'none', name: 'Sans thème', items: filtered.filter((p) => p.theme_id == null || !idx.principle_themes.has(p.theme_id)) },
  ].filter((g) => g.items.length)
  const sortItems = (list: Principle[]) =>
    [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'fr'))

  if (tagsQ.isLoading || principlesQ.isLoading) return <Loading />

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Principes de jeu</h1>
          <p className="text-sm text-slate-400">
            La doctrine de l'équipe. Un principe s'affiche sur les cartes qui lui sont rattachées et sur celles qui partagent ses étiquettes.
          </p>
        </div>
        <Link to="/principes/new" className="rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400">
          + Nouveau principe
        </Link>
      </div>

      <div className="space-y-3">
        <input
          type="search"
          value={q}
          onChange={(e) => set('q', e.target.value || null)}
          placeholder="Rechercher un principe…"
          className={cx(inputClass, 'py-2.5')}
          aria-label="Rechercher un principe"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip selected={!theme} onClick={() => set('theme', null)}>
            Tous les thèmes
          </Chip>
          {themes.filter((t) => !t.archived || principles.some((p) => p.theme_id === t.id)).map((t) => (
            <Chip key={t.id} selected={theme === String(t.id)} onClick={() => set('theme', theme === String(t.id) ? null : String(t.id))} count={principles.filter((p) => p.theme_id === t.id).length}>
              {t.name}
            </Chip>
          ))}
          <span className="mx-1 h-6 w-px bg-slate-800" />
          {(['CT', 'T'] as Side[]).map((s) => (
            <Chip key={s} tone={s === 'CT' ? 'ct' : 't'} selected={side === s} onClick={() => set('side', side === s ? null : s)} className="font-bold">
              {s}
            </Chip>
          ))}
          <select value={map ?? ''} onChange={(e) => set('map', e.target.value || null)} className={cx(inputClass, 'w-auto! py-1.5')} aria-label="Map">
            <option value="">Toutes les maps</option>
            {tags.maps.filter((m) => !m.archived).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {principles.length === 0 ? (
        <EmptyState title="Aucun principe pour l'instant">
          <Link to="/principes/new" className="text-amber-400">
            + Écrire le premier principe de l'équipe
          </Link>
        </EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState title="Aucun principe ne correspond" />
      ) : (
        groups.map((g) => (
          <section key={g.key} className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wider text-slate-400 uppercase">
              {g.name} <span className="text-slate-600">({g.items.length})</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sortItems(g.items).map((p) => (
                <PrincipleTile key={p.id} p={p} idx={idx} cardCount={counts.get(p.id) ?? 0} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

// ================================================================ Détail

export function PrincipleDetailPage() {
  const { id } = useParams()
  const me = useMember()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const tagsQ = useTags()
  const idx = useTagIndex(tagsQ.data)
  const principlesQ = usePrinciples()
  const cards = useCards().data ?? []
  const members = useMemberIndex()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const p = principlesQ.data?.find((x) => x.id === Number(id))

  const refresh = () => qc.invalidateQueries({ queryKey: qk.principles })
  const onError = (e: unknown) => toast(errorMessage(e), 'error')
  const link = useMutation({ mutationFn: (cardId: number) => linkPrincipleCard(p!.id, cardId, me.id), onSuccess: refresh, onError })
  const unlink = useMutation({ mutationFn: (cardId: number) => unlinkPrincipleCard(p!.id, cardId), onSuccess: refresh, onError })
  const del = useMutation({
    mutationFn: () => deletePrinciple(p!.id),
    onSuccess: () => {
      toast('Principe supprimé')
      refresh()
      navigate('/principes')
    },
    onError,
  })

  if (tagsQ.isLoading || principlesQ.isLoading) return <Loading />
  if (!p) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-semibold">Principe introuvable</p>
        <Link to="/principes" className="text-amber-400">
          ← Tous les principes
        </Link>
      </div>
    )
  }

  const { linked, matching } = cardsForPrinciple(p, cards)
  const theme = p.theme_id != null ? idx.principle_themes.get(p.theme_id) : undefined
  const name = (uid: string | null) => (uid && (members.get(uid)?.display_name || members.get(uid)?.email)) || 'Ancien membre'
  const order = [...linked, ...matching].map((c) => c.id)

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-5">
      <Link to="/principes" className="text-sm text-slate-400 hover:text-slate-200">
        ← Principes de jeu
      </Link>
      <article className="space-y-4 rounded-2xl bg-slate-900 p-5 ring-1 ring-slate-800 sm:p-7">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          {theme && <span className="rounded-md bg-slate-800 px-2 py-0.5 font-medium text-slate-200">{theme.name}</span>}
          {p.pinned && <span className="text-amber-400">★ Incontournable</span>}
        </div>
        <h1 className="text-2xl font-bold text-slate-50">{p.title}</h1>
        {p.summary && <p className="text-lg text-slate-300">{p.summary}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">S'applique à :</span>
          <PrincipleBadges p={p} idx={idx} />
        </div>
        {p.body.trim() && <Markdown source={p.body} className="border-t border-slate-800 pt-4 text-base" />}
        <p className="border-t border-slate-800 pt-3 text-xs text-slate-500">
          Rédigé par {name(p.author_id)} le {formatDate(p.created_at)}
          {p.updated_at !== p.created_at && ` · modifié par ${name(p.updated_by)} le ${formatDate(p.updated_at)}`}
        </p>
        {canEdit(p, me) && (
          <div className="flex gap-2">
            <Link to={`/principes/${p.id}/edit`} className="rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400">
              ✎ Modifier
            </Link>
            <Button variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setConfirmDelete(true)}>
              Supprimer
            </Button>
          </div>
        )}
      </article>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-semibold">
            Cartes rattachées <span className="text-slate-500">({linked.length})</span>
          </h2>
          <div className="w-full sm:w-96">
            <LinkPicker
              items={cards.filter((c) => c.status !== 'draft')}
              exclude={p.card_ids}
              onPick={(c) => link.mutate(c.id)}
              placeholder="Rattacher une carte (chercher par titre)…"
              render={(c) => cardLabel(c, idx)}
            />
          </div>
        </div>
        {linked.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune carte rattachée explicitement.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {linked.map((c) => (
              <div key={c.id} className="relative">
                <CardTile card={c} idx={idx} order={order} />
                <button
                  type="button"
                  onClick={() => unlink.mutate(c.id)}
                  title="Détacher la carte"
                  aria-label={`Détacher ${c.title}`}
                  className="absolute top-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-sm text-white hover:bg-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {!isGeneral(p) && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">
              Concernées par les étiquettes <span className="text-slate-500">({matching.length})</span>
            </h2>
            <Link to={principleFilterHref(p)} className="text-sm text-amber-400 hover:text-amber-300">
              Voir dans la grille →
            </Link>
          </div>
          {matching.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune autre carte ne correspond à ces étiquettes.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {matching.slice(0, 9).map((c) => (
                <CardTile key={c.id} card={c} idx={idx} order={order} />
              ))}
            </div>
          )}
        </section>
      )}

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Supprimer le principe ?">
        <div className="space-y-4 p-5">
          <p className="text-sm text-slate-300">« {p.title} » sera supprimé. Les cartes ne sont pas touchées.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmDelete(false)}>Annuler</Button>
            <Button variant="danger" onClick={() => del.mutate()} disabled={del.isPending}>
              Supprimer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ================================================================ Formulaire

export function PrincipleFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const me = useMember()
  const tagsQ = useTags()
  const principlesQ = usePrinciples()
  const cardsQ = useCards()
  if (tagsQ.isLoading || principlesQ.isLoading || cardsQ.isLoading) return <Loading />
  const existing = id ? principlesQ.data?.find((p) => p.id === Number(id)) : undefined
  if (id && !existing) return <p className="py-16 text-center">Principe introuvable</p>
  if (existing && !canEdit(existing, me)) return <p className="py-16 text-center">Seuls l'auteur et les admins peuvent modifier ce principe.</p>
  // « Créer un principe depuis cette carte » : reprend ses étiquettes principales et la rattache.
  const fromCard = params.get('card') ? cardsQ.data?.find((c) => c.id === Number(params.get('card'))) : undefined
  return <PrincipleForm key={id ?? 'new'} existing={existing} fromCardId={fromCard?.id} initialSides={fromCard?.side ? [fromCard.side] : []} />
}

function PrincipleForm({ existing, fromCardId, initialSides }: { existing?: Principle; fromCardId?: number; initialSides: Side[] }) {
  const me = useMember()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const tags = useTags().data ?? EMPTY_TAGS
  const cards = useCards().data ?? []
  const [f, setF] = useState<PrinciplePayload>(() =>
    existing
      ? {
          id: existing.id, title: existing.title, summary: existing.summary, body: existing.body, theme_id: existing.theme_id,
          sides: existing.sides, pinned: existing.pinned, map_ids: existing.map_ids, role_ids: existing.role_ids,
          category_ids: existing.category_ids, round_type_ids: existing.round_type_ids,
        }
      : { title: '', summary: '', body: '', theme_id: null, sides: initialSides, pinned: false, map_ids: [], role_ids: [], category_ids: [], round_type_ids: [] },
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const toggle = <K extends 'map_ids' | 'role_ids' | 'category_ids' | 'round_type_ids'>(k: K, v: number) =>
    setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((i) => i !== v) : [...x[k], v] }))
  const toggleSide = (s: Side) =>
    setF((x) => {
      const sides = x.sides.includes(s) ? x.sides.filter((i) => i !== s) : [...x.sides, s]
      // Les rôles restent cohérents avec les sides choisis.
      const ok = new Set(tags.roles.filter((r) => !sides.length || sides.includes(r.side)).map((r) => r.id))
      return { ...x, sides, role_ids: x.role_ids.filter((r) => ok.has(r)) }
    })
  const alive = <T extends { id: number; archived: boolean }>(list: T[], sel: number[]) => list.filter((t) => !t.archived || sel.includes(t.id))

  // Aperçu : nombre de cartes concernées par ces étiquettes.
  const preview = useMemo(() => {
    const p = { ...f, id: 0, card_ids: [] } as unknown as Principle
    return isGeneral(p) ? null : cards.filter((c) => c.status !== 'draft' && principleMatchesCard(p, c)).length
  }, [f, cards])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!f.title.trim()) {
      setError('Le titre est obligatoire.')
      return
    }
    setSaving(true)
    try {
      const pid = await savePrinciple(f)
      if (fromCardId && !existing) await linkPrincipleCard(pid, fromCardId, me.id).catch(() => {})
      await qc.invalidateQueries({ queryKey: qk.principles })
      toast(existing ? 'Principe mis à jour' : 'Principe créé')
      navigate(`/principes/${pid}`, { replace: true })
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const roles = tags.roles.filter((r) => !f.sides.length || f.sides.includes(r.side))

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-7 px-4 pt-5 pb-32">
      <h1 className="text-xl font-bold">{existing ? 'Modifier le principe' : 'Nouveau principe de jeu'}</h1>
      {fromCardId && !existing && <p className="text-sm text-slate-400">La carte d'origine sera rattachée à ce principe.</p>}

      <Field label="Titre" htmlFor="ptitle" error={error} action={<span className="text-xs text-slate-500 tabular-nums">{f.title.length}/120</span>}>
        <input
          id="ptitle"
          value={f.title}
          maxLength={120}
          onChange={(e) => {
            setF({ ...f, title: e.target.value })
            setError(null)
          }}
          placeholder="Ex. : Toujours jouer en trade"
          className={cx(inputClass, 'py-2.5 text-base')}
        />
      </Field>

      <Field label="Thème" optional>
        <div className="flex flex-wrap gap-2">
          {alive(tags.principle_themes, f.theme_id ? [f.theme_id] : []).map((t) => (
            <Chip key={t.id} selected={f.theme_id === t.id} onClick={() => setF({ ...f, theme_id: f.theme_id === t.id ? null : t.id })}>
              {t.name}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Résumé" hint="Une ou deux phrases : c'est ce qui s'affiche sur les cartes." optional htmlFor="psummary" action={<span className="text-xs text-slate-500 tabular-nums">{f.summary.length}/280</span>}>
        <textarea id="psummary" value={f.summary} maxLength={280} rows={2} onChange={(e) => setF({ ...f, summary: e.target.value })} className={inputClass} />
      </Field>

      <Field label="Explication" optional htmlFor="pbody">
        <MarkdownEditor id="pbody" value={f.body} onChange={(body) => setF({ ...f, body })} placeholder="Pourquoi, quand, exemples, contre-exemples…" />
      </Field>

      <fieldset className="space-y-5 rounded-xl p-4 ring-1 ring-slate-800">
        <legend className="px-1 text-sm font-semibold">S'applique à</legend>
        <p className="-mt-2 text-xs text-slate-500">
          Laisse tout vide pour un principe général (rattaché aux cartes à la main). Sinon, il s'affiche automatiquement sur les
          cartes qui correspondent : ET entre familles, OU dans une famille.
          {preview != null && <strong className="ml-1 text-slate-300">→ {preview} carte{preview > 1 ? 's' : ''} concernée{preview > 1 ? 's' : ''} aujourd'hui.</strong>}
        </p>
        <Field label="Side" optional>
          <div className="flex gap-2">
            {(['CT', 'T'] as Side[]).map((s) => (
              <Chip key={s} tone={s === 'CT' ? 'ct' : 't'} selected={f.sides.includes(s)} onClick={() => toggleSide(s)} className="min-w-16 justify-center font-bold">
                {s}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Maps" optional>
          <div className="flex flex-wrap gap-2">
            {alive(tags.maps, f.map_ids).map((m) => (
              <Chip key={m.id} selected={f.map_ids.includes(m.id)} onClick={() => toggle('map_ids', m.id)}>
                {m.name}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Rôles" optional>
          <div className="flex flex-wrap gap-2">
            {alive(roles, f.role_ids).map((r) => (
              <Chip key={r.id} tone={r.side === 'CT' ? 'ct' : 't'} selected={f.role_ids.includes(r.id)} onClick={() => toggle('role_ids', r.id)}>
                {r.name}
                {f.sides.length !== 1 && <span className="text-xs opacity-60">{r.side}</span>}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Catégories" optional>
          <div className="flex flex-wrap gap-2">
            {alive(tags.categories, f.category_ids).map((c) => (
              <Chip key={c.id} selected={f.category_ids.includes(c.id)} onClick={() => toggle('category_ids', c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Types de round" optional>
          <div className="flex flex-wrap gap-2">
            {alive(tags.round_types, f.round_type_ids).map((r) => (
              <Chip key={r.id} selected={f.round_type_ids.includes(r.id)} onClick={() => toggle('round_type_ids', r.id)}>
                {r.name}
              </Chip>
            ))}
          </div>
        </Field>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} className="size-4 accent-amber-500" />
        ★ Incontournable (affiché en tête de son thème)
      </label>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl justify-end gap-2 px-4 py-3">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Annuler
          </Button>
          <button type="submit" disabled={saving} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
            {existing ? 'Enregistrer' : 'Créer le principe'}
          </button>
        </div>
      </div>
    </form>
  )
}
