import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { EMPTY_TAGS, qk, useCards, useProfile, useTagIndex, useTags } from '../hooks/data'
import { useAuthRefresh, useMember } from '../hooks/auth'
import { changePassword, setMyRoles, updateMember } from '../lib/api'
import { errorMessage } from '../lib/http'
import type { Card, Profile, Side } from '../lib/types'
import { ActionBadge, myAction } from '../components/StrategyPieces'
import { LEVELS, Stars, useRateCard } from '../components/Learning'
import { StatusBadge } from '../components/CardBadges'
import { Badge, Button, Chip, Spinner, cx, inputClass } from '../components/ui'
import { useToast } from '../components/toast'
import { TEAM_ROLE_LABEL } from '../lib/teamRoles'

/** Espace perso : profil, rôles en jeu, ce que je joue, mes objectifs, mes cartes, mot de passe. */
export default function MePage() {
  const me = useMember()
  const profileQ = useProfile()
  const tags = useTags().data ?? EMPTY_TAGS
  const idx = useTagIndex(tags)
  const cards = useCards().data ?? []

  if (profileQ.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="size-8" />
      </div>
    )
  }
  const profile: Profile = profileQ.data ?? { role_ids: [], teams: [] }
  const myRoleIds = profile.role_ids

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <ProfileHeader profile={profile} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Mes rôles en jeu" hint="Les stratégies te montrent alors directement ce que tu dois faire.">
          <MyRolesPicker roleIds={myRoleIds} />
        </Panel>
        <Panel
          title="À apprendre"
          hint="Les stratégies que ton équipe doit apprendre. Note ton niveau au fur et à mesure."
          action={
            <Link to="/?aapprendre=1" className="text-sm text-amber-400 hover:text-amber-300">
              Tout voir →
            </Link>
          }
        >
          <ToLearn cards={cards} profile={profile} />
        </Panel>
      </div>

      <Panel
        title="Ce que je joue"
        hint={myRoleIds.length ? 'Les stratégies où un de tes rôles a une action.' : undefined}
        action={
          myRoleIds.length > 0 && (
            <Link to="/?mesroles=1" className="text-sm text-amber-400 hover:text-amber-300">
              Tout voir →
            </Link>
          )
        }
      >
        <MyPlays cards={cards} myRoleIds={myRoleIds} idx={idx} />
      </Panel>

      <Panel title="Mes cartes">
        <MyCards cards={cards} userId={me.id} />
      </Panel>

      <Panel title="Sécurité">
        <PasswordForm />
      </Panel>
    </div>
  )
}

function Panel({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-800 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-50">{title}</h2>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function ProfileHeader({ profile }: { profile: Profile }) {
  const me = useMember()
  const refresh = useAuthRefresh()
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(me.display_name)
  const save = useMutation({
    mutationFn: () => updateMember(me.id, { display_name: name.trim() }),
    onSuccess: async () => {
      setEditing(false)
      toast('Pseudo modifié')
      qc.invalidateQueries({ queryKey: qk.members })
      await refresh()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  return (
    <header className="flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 p-5 ring-1 ring-slate-800">
      <span className="grid size-16 place-items-center rounded-full bg-amber-500/20 text-2xl font-bold text-amber-200 ring-2 ring-amber-400/40">
        {(me.display_name || me.email || '?').slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {editing ? (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) save.mutate()
            }}
          >
            <input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={cx(inputClass, 'w-56!')} aria-label="Pseudo" />
            <Button type="submit" variant="primary" disabled={!name.trim() || save.isPending}>
              Enregistrer
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Annuler
            </Button>
          </form>
        ) : (
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            {me.display_name || me.email}
            <button type="button" onClick={() => setEditing(true)} className="text-sm font-normal text-slate-500 hover:text-amber-300" aria-label="Modifier mon pseudo">
              ✎
            </button>
          </h1>
        )}
        <p className="text-sm text-slate-400">
          {me.email} · {me.role === 'admin' ? 'Admin du site' : 'Membre'}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {profile.teams.map((t) => (
            <Badge key={t.id} className="bg-slate-800 text-slate-200 ring-slate-600">
              {t.name} · {TEAM_ROLE_LABEL[t.role]}
            </Badge>
          ))}
          {!profile.teams.length && (
            <Link to="/equipes" className="text-xs text-slate-500 hover:text-slate-300">
              Aucune équipe pour l'instant
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

function MyRolesPicker({ roleIds }: { roleIds: number[] }) {
  const me = useMember()
  const qc = useQueryClient()
  const toast = useToast()
  const tags = useTags().data ?? EMPTY_TAGS
  const save = useMutation({
    mutationFn: (ids: number[]) => setMyRoles(ids),
    onMutate: (ids) => {
      // Mise à jour immédiate de l'affichage.
      qc.setQueryData<Profile>(qk.profile(me.id), (old) => (old ? { ...old, role_ids: ids } : old))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.profile(me.id) })
      qc.invalidateQueries({ queryKey: qk.members })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const toggle = (id: number) => save.mutate(roleIds.includes(id) ? roleIds.filter((r) => r !== id) : [...roleIds, id])
  return (
    <div className="space-y-3">
      {(['CT', 'T'] as Side[]).map((side) => (
        <div key={side} className="space-y-1.5">
          <p className={cx('text-xs font-semibold tracking-wider uppercase', side === 'CT' ? 'text-sky-300' : 'text-amber-300')}>{side}</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.roles
              .filter((r) => r.side === side && (!r.archived || roleIds.includes(r.id)))
              .map((r) => (
                <Chip key={r.id} selected={roleIds.includes(r.id)} tone={side === 'CT' ? 'ct' : 't'} onClick={() => toggle(r.id)}>
                  {r.name}
                </Chip>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Stratégies où un de mes rôles a une action, regroupées par map. */
function MyPlays({ cards, myRoleIds, idx }: { cards: Card[]; myRoleIds: number[]; idx: ReturnType<typeof useTagIndex> }) {
  const plays = useMemo(
    () =>
      cards
        .filter((c) => c.kind === 'strategy' && c.status !== 'draft')
        .map((c) => ({ card: c, mine: myAction(c, myRoleIds, idx) }))
        .filter((x): x is { card: Card; mine: NonNullable<typeof x.mine> } => !!x.mine && x.mine.action.involved),
    [cards, myRoleIds, idx],
  )
  if (!myRoleIds.length) return <p className="text-sm text-slate-500">Indique d'abord tes rôles en jeu (ci-dessus).</p>
  if (!plays.length) return <p className="text-sm text-slate-500">Aucune stratégie ne donne encore d'action à tes rôles.</p>
  const byMap = new Map<string, typeof plays>()
  for (const p of plays) {
    const m = idx.maps.get(p.card.map_id ?? -1)?.name ?? 'Sans map'
    byMap.set(m, [...(byMap.get(m) ?? []), p])
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[...byMap.entries()].map(([map, list]) => (
        <div key={map} className="space-y-1.5">
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">{map}</p>
          <ul className="space-y-1">
            {list.map(({ card, mine }) => (
              <li key={card.id}>
                <Link to={`/c/${card.id}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-950/40 px-3 py-2 ring-1 ring-slate-800 hover:ring-slate-600">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{card.title}</span>
                  <span className="text-xs text-slate-500">{mine.role.name}</span>
                  <ActionBadge action={mine.action} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function ToLearn({ cards, profile }: { cards: Card[]; profile: Profile }) {
  const list = cards.filter((c) => c.learning?.some((l) => l.status === 'to_learn'))
  if (!profile.teams.length) return <p className="text-sm text-slate-500">Rejoins une équipe : son capitaine choisit les stratégies à apprendre.</p>
  if (!list.length) return <p className="text-sm text-slate-500">Rien à apprendre pour l'instant.</p>
  const done = list.filter((c) => (c.my_rating ?? 0) >= 4).length
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-400">
        {done}/{list.length} maîtrisée{done > 1 ? 's' : ''} par toi (4 étoiles ou plus)
      </p>
      <ul className="space-y-1">
        {list.map((c) => (
          <ToLearnRow key={c.id} card={c} teams={profile.teams.filter((t) => c.learning?.some((l) => l.team_id === t.id && l.status === 'to_learn')).map((t) => t.name)} />
        ))}
      </ul>
    </div>
  )
}

function ToLearnRow({ card, teams }: { card: Card; teams: string[] }) {
  const rate = useRateCard(card.id)
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-950/40 px-3 py-2 ring-1 ring-slate-800">
      <Link to={`/c/${card.id}`} className="min-w-0 flex-1 truncate text-sm text-slate-100 hover:text-amber-300">
        {card.title}
      </Link>
      <span className="text-xs text-slate-500">{teams.join(', ')}</span>
      <Stars value={card.my_rating} onChange={(n) => rate.mutate(n)} label={`Mon niveau sur ${card.title}`} />
      <span className="w-28 text-xs text-slate-400">{card.my_rating ? LEVELS[card.my_rating] : 'Pas noté'}</span>
    </li>
  )
}

function MyCards({ cards, userId }: { cards: Card[]; userId: string }) {
  const mine = cards.filter((c) => c.author_id === userId)
  const count = (kind: Card['kind'], status?: Card['status']) => mine.filter((c) => c.kind === kind && (!status || c.status === status)).length
  const toFix = mine.filter((c) => c.status === 'review')
  const tiles: [string, number, string][] = [
    ['Stratégies publiées', count('strategy') - count('strategy', 'draft'), '/?view=mine'],
    ['Stuffs publiés', count('stuff') - count('stuff', 'draft'), '/stuff?view=mine'],
    ['Brouillons', mine.filter((c) => c.status === 'draft').length, '/?view=drafts'],
    ['À corriger', toFix.length, '/?view=review'],
  ]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([label, n, href]) => (
          <Link key={label} to={href} className="rounded-xl bg-slate-950/40 px-3 py-3 ring-1 ring-slate-800 hover:ring-slate-600">
            <p className="text-2xl font-bold text-slate-50 tabular-nums">{n}</p>
            <p className="text-xs text-slate-400">{label}</p>
          </Link>
        ))}
      </div>
      {toFix.length > 0 && (
        <ul className="space-y-1">
          {toFix.map((c) => (
            <li key={c.id}>
              <Link to={`/c/${c.id}`} className="flex items-center gap-2 rounded-lg bg-red-500/5 px-3 py-2 ring-1 ring-red-500/30 hover:ring-red-400/60">
                <StatusBadge status={c.status} />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{c.title}</span>
                <span className="truncate text-xs text-red-200/70">{c.review_comment}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PasswordForm() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => changePassword(current, password),
    onSuccess: () => {
      toast('Mot de passe modifié (tes autres appareils sont déconnectés)')
      setCurrent('')
      setPassword('')
      setConfirm('')
    },
    onError: (e) => setError(errorMessage(e)),
  })
  return (
    <form
      className="grid max-w-xl gap-2 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        if (password.length < 8) return setError('Nouveau mot de passe trop court (8 caractères minimum)')
        if (password !== confirm) return setError('Les deux nouveaux mots de passe ne correspondent pas')
        save.mutate()
      }}
    >
      <input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Mot de passe actuel" autoComplete="current-password" className={inputClass} aria-label="Mot de passe actuel" />
      <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nouveau mot de passe" autoComplete="new-password" className={inputClass} aria-label="Nouveau mot de passe" />
      <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirmer" autoComplete="new-password" className={inputClass} aria-label="Confirmer le nouveau mot de passe" />
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Spinner className="size-4" />} Changer mon mot de passe
        </Button>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}
