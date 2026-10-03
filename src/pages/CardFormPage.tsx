import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { canEditCard, EMPTY_TAGS, qk, useCards, useLastValues, useMyRoleIds, useTagIndex, useTags } from '../hooks/data'
import { useMember } from '../hooks/auth'
import { deleteCard, proposeSource, proposeZone, saveCard } from '../lib/api'
import { errorMessage } from '../lib/http'
import {
  applyLastValues, clearLocal, formFromCard, formFromDuplicate, formFromParams, hasContent, loadLocal,
  localKey, nextInSeries, reconcile, saveLocal, setRoleAction, setRoleNote, showsRoundType, showsUtility, signature, TITLE_MAX,
  toPayload, validate,
  type FormErrors, type FormState,
} from '../lib/cardForm'
import { normalize } from '../lib/text'
import type { Card, CardKind, CardStatus, Side, Tags } from '../lib/types'
import { MediaField } from '../components/MediaField'
import { MarkdownEditor } from '../components/Markdown'
import { RoleActionsEditor, StuffLinksEditor } from '../components/StrategyPieces'
import { Button, Chip, Field, Spinner, cx, inputClass } from '../components/ui'
import { useToast } from '../components/toast'

const SERVER_AUTOSAVE_MS = 2500

export function CardFormPage() {
  const { id } = useParams()
  const editId = id ? Number(id) : null
  const [params] = useSearchParams()
  const me = useMember()
  const tagsQ = useTags()
  const cardsQ = useCards()

  if (tagsQ.isLoading || cardsQ.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="size-8" />
      </div>
    )
  }
  const tags = tagsQ.data ?? EMPTY_TAGS
  const cards = cardsQ.data ?? []

  let initial: FormState
  let source: Card | undefined
  if (editId) {
    source = cards.find((c) => c.id === editId)
    if (!source) return <Message title="Carte introuvable" />
    if (!canEditCard(source, me)) return <Message title="Tu ne peux modifier que tes propres cartes." />
    initial = formFromCard(source)
  } else if (params.get('from')) {
    const from = cards.find((c) => c.id === Number(params.get('from')))
    initial = from ? formFromDuplicate(from) : formFromParams(params, tags)
  } else {
    initial = formFromParams(params, tags)
  }

  return (
    <CardForm
      key={`${editId ?? 'new'}-${params.toString()}`}
      initial={initial}
      source={source}
      tags={tags}
      cards={cards}
      userId={me.id}
      prefilled={!editId && (params.size > 0)}
    />
  )
}

function Message({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 py-16 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <Link to="/" className="text-amber-400">
        ← Retour aux cartes
      </Link>
    </div>
  )
}

function CardForm({
  initial,
  source,
  tags,
  cards,
  userId,
  prefilled,
}: {
  initial: FormState
  source: Card | undefined
  tags: Tags
  cards: Card[]
  userId: string
  prefilled: boolean
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const toast = useToast()
  const idx = useTagIndex(tags)
  const lastValues = useLastValues()
  const isEdit = !!source
  const key = localKey(userId, source?.id ?? 'new')

  // Restauration d'une saisie non terminée (onglet fermé, navigation…).
  const [restored, setRestored] = useState<boolean>(false)
  const [form, setForm] = useState<FormState>(() => {
    const local = loadLocal(key)
    if (!local) return initial
    if (isEdit && source && local.savedAt < source.updated_at) return initial
    if (signature(local.state) === signature(initial)) return initial
    // Un brouillon serveur déjà publié entre-temps ne doit pas être réutilisé.
    if (!isEdit && local.state.id && !cards.some((c) => c.id === local.state.id && c.status === 'draft')) {
      return initial
    }
    setTimeout(() => setRestored(true))
    return local.state
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState<null | 'publish' | 'series' | 'draft'>(null)
  const [serverSavedAt, setServerSavedAt] = useState<Date | null>(null)
  const [markFixed, setMarkFixed] = useState(true)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const refs = {
    media: useRef<HTMLDivElement>(null),
    map: useRef<HTMLDivElement>(null),
    side: useRef<HTMLDivElement>(null),
    category: useRef<HTMLDivElement>(null),
    utility: useRef<HTMLDivElement>(null),
    title: useRef<HTMLDivElement>(null),
  }
  const myRoleIds = useMyRoleIds()
  const home = form.kind === 'stuff' ? '/stuff' : '/'

  const set = useCallback(
    (patch: Partial<FormState> | ((f: FormState) => Partial<FormState>)) =>
      setForm((f) => reconcile({ ...f, ...(typeof patch === 'function' ? patch(f) : patch) }, tags)),
    [tags],
  )

  // Les erreurs se mettent à jour en direct après une première tentative d'envoi.
  useEffect(() => {
    if (submitted) setErrors(validate(form))
  }, [form, submitted])

  // ---------------------------------------------------------------- sauvegardes

  // Rien n'est sauvegardé tant que l'utilisateur n'a rien changé (ouvrir une
  // duplication ou un formulaire pré-rempli puis repartir ne laisse aucune trace).
  const initialSig = useMemo(() => signature(initial), [initial])
  const dirty = signature(form) !== initialSig

  // 1. Locale, immédiate : aucune perte si l'onglet se ferme.
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => saveLocal(key, form), 300)
    return () => clearTimeout(t)
  }, [form, key, dirty])

  // 2. Serveur, en brouillon, pour une nouvelle carte (ou un brouillon existant).
  const savingChain = useRef<Promise<unknown>>(Promise.resolve())
  const lastServerSig = useRef(initialSig)
  const formRef = useRef(form)
  formRef.current = form
  const autosaveEnabled = form.status === 'draft' && saving === null

  const persistDraft = useCallback(() => {
    const run = async () => {
      const f = formRef.current
      const sig = signature(f)
      if (sig === lastServerSig.current || !hasContent(f)) return
      const newId = await saveCard(toPayload(f, 'draft', tags))
      lastServerSig.current = sig
      if (f.id !== newId) setForm((cur) => ({ ...cur, id: newId }))
      setServerSavedAt(new Date())
    }
    savingChain.current = savingChain.current.then(run).catch(() => {})
    return savingChain.current
  }, [tags])

  useEffect(() => {
    if (!autosaveEnabled || !hasContent(form) || !dirty) return
    const t = setTimeout(persistDraft, SERVER_AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [form, autosaveEnabled, persistDraft, dirty])

  // ---------------------------------------------------------------- envoi

  function focusFirstError(e: FormErrors) {
    const order: (keyof FormErrors)[] = ['media', 'map', 'side', 'utility', 'category', 'title']
    const first = order.find((k) => e[k])
    if (first) refs[first].current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function submit(mode: 'publish' | 'series' | 'draft') {
    if (saving) return
    let status: CardStatus = 'draft'
    if (mode !== 'draft') {
      setSubmitted(true)
      const e = validate(form)
      setErrors(e)
      if (Object.keys(e).length) {
        focusFirstError(e)
        return
      }
      status = source?.status === 'review' && !markFixed ? 'review' : 'published'
    } else if (!hasContent(form) && !form.map_id) {
      toast('Rien à enregistrer pour l’instant.', 'info')
      return
    }

    setSaving(mode)
    try {
      await savingChain.current // attend une éventuelle sauvegarde auto en cours
      const f = formRef.current
      const savedId = await saveCard(toPayload(f, status, tags))
      clearLocal(key)
      await qc.invalidateQueries({ queryKey: qk.cards })
      qc.invalidateQueries({ queryKey: qk.lastValues(userId) })
      qc.invalidateQueries({ queryKey: qk.history(savedId) })

      if (mode === 'draft') {
        toast('Brouillon enregistré (visible par toi seul)')
        navigate(`${home}?view=drafts`)
      } else if (mode === 'series') {
        toast(
          <span>
            Carte publiée ·{' '}
            <Link to={`/c/${savedId}`} className="underline">
              voir
            </Link>
          </span>,
        )
        lastServerSig.current = ''
        setSubmitted(false)
        setErrors({})
        setServerSavedAt(null)
        setForm(nextInSeries(f))
        window.scrollTo({ top: 0, behavior: 'smooth' })
        setTimeout(() => mediaInputRef.current?.focus(), 300)
      } else if (isEdit) {
        toast('Modifications enregistrées')
        navigate(`/c/${savedId}`, { replace: true })
      } else {
        toast(
          <span>
            Carte publiée ·{' '}
            <Link to={`/c/${savedId}`} className="underline">
              voir
            </Link>
          </span>,
        )
        const back = new URLSearchParams(location.search)
        back.delete('from')
        back.delete('kind')
        back.delete('stuff')
        navigate(`${home}${back.size ? `?${back}` : ''}`)
      }
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSaving(null)
    }
  }

  async function discard() {
    const msg = isEdit ? 'Annuler les modifications non enregistrées ?' : 'Abandonner cette carte ? Le brouillon sera supprimé.'
    if (dirty && !window.confirm(msg)) return
    clearLocal(key)
    if (!isEdit && form.id) {
      await savingChain.current
      await deleteCard(form.id).catch(() => {})
      qc.invalidateQueries({ queryKey: qk.cards })
    }
    // Formulaire ouvert directement par son URL : pas de page précédente dans l'appli.
    if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1)
    else navigate(isEdit ? `/c/${source!.id}` : home)
  }

  // Ctrl/Cmd + Entrée : publier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        submit('publish')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---------------------------------------------------------------- rendu

  const toggle = (field: 'role_ids' | 'zone_ids' | 'category_ids' | 'utility_ids' | 'economy_ids' | 'round_type_ids', value: number) =>
    set((f) => ({ [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value] }))

  const activeOrSelected = <T extends { id: number; archived: boolean }>(list: T[], selected: number[]) =>
    list.filter((t) => !t.archived || selected.includes(t.id))

  const lv = lastValues.data
  const lastSummary = useMemo(() => {
    if (!lv?.map_id && !lv?.side) return null
    const parts = [
      lv.map_id ? idx.maps.get(lv.map_id)?.name : null,
      lv.side,
      ...(lv.role_ids ?? []).map((id) => idx.roles.get(id)?.name),
    ].filter(Boolean)
    return parts.join(' · ')
  }, [lv, idx])

  const strategy = form.kind === 'strategy'
  const utilityVisible = showsUtility(form)
  const roundVisible = showsRoundType(form, tags)
  // Numérotation des champs selon le type de carte et les champs conditionnels.
  const steps = (
    strategy
      ? ['media', 'source', 'map', 'side', 'roles', 'zones', 'cats', 'round', 'stuffs', 'risk', 'eco', 'title', 'desc']
      : ['media', 'source', 'map', 'side', 'util', 'thrower', 'zones', 'cats', 'risk', 'eco', 'title', 'desc']
  ).filter((k) => k !== 'round' || roundVisible)
  const n = (k: string) => steps.indexOf(k) + 1
  const sideRoles = activeOrSelected(tags.roles.filter((r) => r.side === form.side), form.role_ids)
  const switchKind = (kind: CardKind) => setForm((f) => ({ ...f, kind }))

  return (
    <div className="mx-auto max-w-3xl px-4 pt-5 pb-40">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">
          {isEdit ? (strategy ? 'Modifier la stratégie' : 'Modifier le stuff') : strategy ? 'Nouvelle stratégie' : 'Nouveau stuff'}
        </h1>
        <AutosaveIndicator form={form} serverSavedAt={serverSavedAt} isEdit={isEdit} />
        <span className="flex-1" />
        {!isEdit && lastSummary && (
          <Button size="sm" onClick={() => lv && setForm((f) => applyLastValues(f, lv, tags))} title="Map, side, rôles, zones, catégories…">
            ↺ Mes dernières valeurs <span className="text-slate-400">({lastSummary})</span>
          </Button>
        )}
      </div>

      {restored && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-sky-500/10 px-4 py-3 text-sm ring-1 ring-sky-500/30">
          <span className="flex-1 text-sky-100">Saisie non terminée restaurée.</span>
          <Button
            size="sm"
            onClick={async () => {
              await savingChain.current
              if (!isEdit && form.id && form.id !== initial.id) await deleteCard(form.id).catch(() => {})
              clearLocal(key)
              lastServerSig.current = initialSig
              setForm(initial)
              setRestored(false)
              qc.invalidateQueries({ queryKey: qk.cards })
            }}
          >
            Repartir de zéro
          </Button>
        </div>
      )}
      {prefilled && !restored && !isEdit && (
        <p className="mb-5 text-sm text-slate-400">Pré-rempli avec les filtres actifs.</p>
      )}
      {source?.status === 'review' && (
        <label className="mb-5 flex items-center gap-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm ring-1 ring-red-500/30">
          <input type="checkbox" checked={markFixed} onChange={(e) => setMarkFixed(e.target.checked)} className="size-4 accent-amber-500" />
          <span>
            <span className="font-semibold text-red-100">Signalée « À revoir » :</span>{' '}
            <span className="text-red-100/80">{source.review_comment}</span>
            <span className="block text-slate-400">Cocher pour lever le signalement à l'enregistrement.</span>
          </span>
        </label>
      )}

      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault()
          submit('publish')
        }}
      >
        {/* Type de carte */}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type de carte">
          {(
            [
              ['strategy', '🎯 Stratégie', 'Ce que fait l’équipe : rôles, timings, stuffs utilisés.'],
              ['stuff', '💨 Stuff', 'Une grenade précise : smoke, flash, molotov…'],
            ] as [CardKind, string, string][]
          ).map(([k, label, hint]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={form.kind === k}
              onClick={() => switchKind(k)}
              className={cx(
                'rounded-xl px-4 py-3 text-left ring-1 ring-inset transition',
                form.kind === k ? 'bg-amber-500/15 ring-2 ring-amber-400' : 'bg-slate-900 ring-slate-700 hover:ring-slate-500',
              )}
            >
              <span className="block font-semibold text-slate-50">{label}</span>
              <span className="block text-xs text-slate-400">{hint}</span>
            </button>
          ))}
        </div>

        {/* Médias */}
        <div ref={refs.media}>
          <Field label={`${n('media')}. Lien(s) média`} hint="YouTube (Shorts et ?t= acceptés), Imgur, image directe ou tout autre lien." error={errors.media}>
            <MediaField
              media={form.media}
              onChange={(media) => setForm((f) => ({ ...f, media }))}
              cardId={form.id}
              inputRef={mediaInputRef}
              onVideoTitle={(title) =>
                setForm((f) => (f.titleTouched || f.title.trim() ? f : { ...f, title: title.slice(0, TITLE_MAX) }))
              }
            />
          </Field>
        </div>

        {/* Source */}
        <Field label={`${n('source')}. Source`} hint="D'où vient ce contenu. Pas dans la liste ? Choisis « + Ajouter une source… »." optional>
          <SourcePicker tags={tags} value={form.source_id} onChange={(source_id) => setForm((f) => ({ ...f, source_id }))} />
        </Field>

        {/* Map */}
        <div ref={refs.map}>
          <Field label={`${n('map')}. Map`} error={errors.map}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {activeOrSelected(tags.maps, form.map_id ? [form.map_id] : []).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={form.map_id === m.id}
                  onClick={() => set({ map_id: form.map_id === m.id ? null : m.id })}
                  className={cx(
                    'relative h-14 overflow-hidden rounded-xl text-base font-bold tracking-wide uppercase ring-1 ring-inset transition',
                    form.map_id === m.id
                      ? 'bg-gradient-to-br from-amber-500/30 to-amber-700/20 text-amber-100 ring-2 ring-amber-400'
                      : 'bg-gradient-to-br from-slate-800 to-slate-900 text-slate-300 ring-slate-700 hover:text-white hover:ring-slate-500',
                  )}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* Side */}
        <div ref={refs.side}>
          <Field label={`${n('side')}. Side`} error={errors.side}>
            <div className="grid grid-cols-2 gap-3">
              {(['CT', 'T'] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={form.side === s}
                  onClick={() => set({ side: form.side === s ? null : s })}
                  className={cx(
                    'h-14 rounded-xl text-2xl font-black ring-1 ring-inset transition',
                    s === 'CT'
                      ? form.side === s
                        ? 'bg-ct text-white ring-ct'
                        : 'bg-ct/10 text-sky-300 ring-ct/40 hover:bg-ct/20'
                      : form.side === s
                        ? 'bg-t text-slate-950 ring-t'
                        : 'bg-t/10 text-amber-300 ring-t/40 hover:bg-t/20',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* Stratégie : action de chaque rôle */}
        {strategy && (
          <Field
            label={`${n('roles')}. Que fait chaque rôle ?`}
            hint="Choisis l'action de chaque rôle (re-clique pour l'enlever). « Non concerné » : le rôle ne participe pas."
            optional
          >
            {!form.side ? (
              <p className="text-sm text-slate-500">Choisis d'abord un side.</p>
            ) : (
              <RoleActionsEditor
                side={form.side}
                tags={tags}
                value={form.role_actions}
                myRoleIds={myRoleIds}
                onAction={(roleId, actionId) => setForm((f) => setRoleAction(f, roleId, actionId))}
                onNote={(roleId, note) => setForm((f) => setRoleNote(f, roleId, note))}
              />
            )}
          </Field>
        )}

        {/* Stuff : type d'utilitaire */}
        {utilityVisible && (
          <div ref={refs.utility}>
            <Field label={`${n('util')}. Type d'utilitaire`} error={errors.utility}>
              <div className="flex flex-wrap gap-2">
                {activeOrSelected(tags.utilities, form.utility_ids).map((u) => (
                  <Chip key={u.id} selected={form.utility_ids.includes(u.id)} onClick={() => toggle('utility_ids', u.id)}>
                    {u.name}
                  </Chip>
                ))}
              </div>
            </Field>
          </div>
        )}

        {/* Stuff : qui le lance */}
        {!strategy && (
          <Field label={`${n('thrower')}. Lancé par`} hint="Le ou les rôles qui lancent ce stuff d'habitude." optional>
            {!form.side ? (
              <p className="text-sm text-slate-500">Choisis d'abord un side.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sideRoles.map((r) => (
                  <Chip key={r.id} selected={form.role_ids.includes(r.id)} tone={form.side === 'CT' ? 'ct' : 't'} onClick={() => toggle('role_ids', r.id)}>
                    {r.name}
                  </Chip>
                ))}
              </div>
            )}
          </Field>
        )}

        {/* Zones */}
        <Field label={`${n('zones')}. ${strategy ? 'Zones / callouts' : 'Position et cible'}`} optional>
          {!form.map_id ? (
            <p className="text-sm text-slate-500">Choisis d'abord une map.</p>
          ) : (
            <ZonePicker
              mapId={form.map_id}
              tags={tags}
              userId={userId}
              selected={form.zone_ids}
              onToggle={(id) => toggle('zone_ids', id)}
              // Pas de reconcile ici : la liste des zones en props ne contient pas encore la nouvelle.
              onCreated={(id) => setForm((f) => ({ ...f, zone_ids: [...f.zone_ids, id] }))}
            />
          )}
        </Field>

        {/* Catégories (obligatoires pour une stratégie) */}
        <div ref={refs.category}>
          <Field label={`${n('cats')}. Catégories`} error={errors.category} optional={!strategy}>
            <div className="flex flex-wrap gap-2">
              {activeOrSelected(tags.categories, form.category_ids).map((c) => (
                <Chip key={c.id} selected={form.category_ids.includes(c.id)} onClick={() => toggle('category_ids', c.id)}>
                  {c.name}
                </Chip>
              ))}
            </div>
          </Field>
        </div>

        {/* Type de round (si « Round lancé ») */}
        {strategy && roundVisible && (
          <Field label={`${n('round')}. Type de round`} hint="Rush, déclic, strat… (plusieurs choix possibles)" optional>
            <div className="flex flex-wrap gap-2">
              {activeOrSelected(tags.round_types, form.round_type_ids).map((r) => (
                <Chip key={r.id} selected={form.round_type_ids.includes(r.id)} onClick={() => toggle('round_type_ids', r.id)}>
                  {r.name}
                </Chip>
              ))}
            </div>
          </Field>
        )}

        {/* Stratégie : stuffs utilisés */}
        {strategy && (
          <Field label={`${n('stuffs')}. Stuffs utilisés`} hint="Les grenades de la stratégie, dans l'ordre, avec qui les lance." optional>
            <StuffLinksEditor
              mapId={form.map_id}
              side={form.side}
              cards={cards.filter((c) => c.id !== form.id)}
              links={form.stuff_links}
              tags={tags}
              idx={idx}
              onChange={(stuff_links) => setForm((f) => ({ ...f, stuff_links }))}
            />
          </Field>
        )}

        {/* Risque */}
        <Field label={`${n('risk')}. Risque`} optional>
          <div className="flex flex-wrap gap-2">
            {activeOrSelected(tags.risks, form.risk_id ? [form.risk_id] : []).map((r) => (
              <Chip key={r.id} selected={form.risk_id === r.id} onClick={() => set({ risk_id: form.risk_id === r.id ? null : r.id })}>
                <span className="size-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                {r.name}
              </Chip>
            ))}
          </div>
        </Field>

        {/* Économie */}
        <Field label={`${n('eco')}. Économie du round`} optional>
          <div className="flex flex-wrap gap-2">
            {activeOrSelected(tags.economies, form.economy_ids).map((e) => (
              <Chip key={e.id} selected={form.economy_ids.includes(e.id)} onClick={() => toggle('economy_ids', e.id)}>
                {e.name}
              </Chip>
            ))}
          </div>
        </Field>

        {/* 10. Titre */}
        <div ref={refs.title}>
          <Field
            label={`${n('title')}. Titre`}
            htmlFor="title"
            error={errors.title}
            action={
              <span className={cx('text-xs tabular-nums', form.title.length > TITLE_MAX ? 'text-red-400' : 'text-slate-500')}>
                {form.title.length}/{TITLE_MAX}
              </span>
            }
          >
            <input
              id="title"
              value={form.title}
              maxLength={TITLE_MAX}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value, titleTouched: true }))}
              placeholder={strategy ? 'Ex. : Exé B avec smoke CT et flash Banana' : 'Ex. : Smoke Window depuis T Spawn'}
              className={cx(inputClass, 'py-2.5 text-base', errors.title && 'ring-red-500')}
            />
          </Field>
        </div>

        {/* 11. Description */}
        <Field label={`${n('desc')}. Description`} optional={form.media.length > 0} htmlFor="description">
          <MarkdownEditor
            id="description"
            value={form.description}
            onChange={(description) => setForm((f) => ({ ...f, description }))}
            placeholder={strategy ? 'Déroulé, timings, calls, variantes…' : 'Placement, visée, type de lancer (jumpthrow…)…'}
          />
        </Field>

        {/* Barre d'actions */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-3">
            <Button variant="ghost" onClick={discard} disabled={!!saving}>
              {isEdit ? 'Annuler' : 'Abandonner'}
            </Button>
            {(!isEdit || form.status === 'draft') && (
              <Button onClick={() => submit('draft')} disabled={!!saving} className="max-sm:hidden!">
                {saving === 'draft' ? <Spinner className="size-4" /> : null} Brouillon
              </Button>
            )}
            <span className="flex-1" />
            {!isEdit && (
              <Button onClick={() => submit('series')} disabled={!!saving} title="Garde map, side, rôles et zones">
                {saving === 'series' ? <Spinner className="size-4" /> : null}
                <span className="hidden sm:inline">Enregistrer et en créer une autre</span>
                <span className="sm:hidden">+ Une autre</span>
              </Button>
            )}
            <button
              type="submit"
              disabled={!!saving}
              title="Ctrl + Entrée"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {saving === 'publish' ? <Spinner className="size-4" /> : null}
              {isEdit && form.status !== 'draft' ? 'Enregistrer' : 'Publier'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function AutosaveIndicator({ form, serverSavedAt, isEdit }: { form: FormState; serverSavedAt: Date | null; isEdit: boolean }) {
  if (form.status === 'draft' && serverSavedAt) {
    return (
      <span className="text-xs text-emerald-400">
        ✓ Brouillon enregistré à {serverSavedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
      </span>
    )
  }
  if (hasContent(form)) {
    return <span className="text-xs text-slate-500">{isEdit ? 'Modifications sauvegardées localement' : 'Sauvegarde automatique'}</span>
  }
  return null
}

/** Liste déroulante des sources, complétée au fur et à mesure (« + Ajouter une source… »). */
function SourcePicker({ tags, value, onChange }: { tags: Tags; value: number | null; onChange: (id: number | null) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const options = tags.sources.filter((s) => !s.archived || s.id === value)

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const source = await proposeSource(name)
      qc.setQueryData<Tags>(qk.tags, (old) =>
        old && !old.sources.some((s) => s.id === source.id) ? { ...old, sources: [...old.sources, source] } : old,
      )
      onChange(source.id)
      setAdding(false)
      setName('')
      toast(`Source « ${source.name} » ajoutée`, 'info')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (adding) {
    return (
      <div className="flex flex-wrap gap-2">
        <input
          autoFocus
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
            if (e.key === 'Escape') setAdding(false)
          }}
          placeholder="Nom de la source (chaîne, coach, site…)"
          className={cx(inputClass, 'min-w-56 flex-1')}
          aria-label="Nouvelle source"
        />
        <Button variant="primary" onClick={add} disabled={!name.trim() || busy}>
          {busy && <Spinner className="size-4" />} Ajouter
        </Button>
        <Button variant="ghost" onClick={() => setAdding(false)}>
          Annuler
        </Button>
      </div>
    )
  }
  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value === '__new') setAdding(true)
        else onChange(e.target.value ? Number(e.target.value) : null)
      }}
      className={cx(inputClass, 'max-w-sm py-2.5')}
      aria-label="Source"
    >
      <option value="">— Aucune —</option>
      {options.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      <option value="__new">+ Ajouter une source…</option>
    </select>
  )
}

function ZonePicker({
  mapId,
  tags,
  userId,
  selected,
  onToggle,
  onCreated,
}: {
  mapId: number
  tags: Tags
  userId: string
  selected: number[]
  onToggle: (id: number) => void
  onCreated: (id: number) => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const all = tags.zones.filter((z) => z.map_id === mapId && (!z.archived || selected.includes(z.id)))
  const nq = normalize(q)
  const shown = nq ? all.filter((z) => normalize(z.name).includes(nq)) : all
  const exact = all.find((z) => normalize(z.name) === nq)

  async function create() {
    const name = q.trim()
    if (!name || exact) return
    setCreating(true)
    try {
      const zone = await proposeZone(mapId, name, userId)
      qc.setQueryData<Tags>(qk.tags, (old) => (old ? { ...old, zones: [...old.zones, zone] } : old))
      onCreated(zone.id)
      setQ('')
      toast(`Zone « ${zone.name} » créée (à valider par l'admin)`, 'info')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          if (shown.length === 1) {
            onToggle(shown[0].id)
            setQ('')
          } else if (exact) {
            onToggle(exact.id)
            setQ('')
          } else if (!shown.length) create()
        }}
        placeholder="Filtrer les zones… (Entrée pour sélectionner)"
        className={inputClass}
        aria-label="Chercher une zone"
      />
      <div className="flex flex-wrap gap-2">
        {shown.map((z) => (
          <Chip key={z.id} selected={selected.includes(z.id)} onClick={() => onToggle(z.id)} title={z.pending ? 'À valider par l’admin' : undefined}>
            {z.name}
            {z.pending && <span className="text-[10px] text-amber-400">à valider</span>}
          </Chip>
        ))}
        {q.trim() && !exact && (
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-dashed border-emerald-600 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/10"
          >
            + Nouvelle zone « {q.trim()} »
          </button>
        )}
        {!q && all.length === 0 && <p className="text-sm text-slate-500">Aucune zone pour cette map : tape un nom pour en créer une.</p>}
      </div>
    </div>
  )
}
