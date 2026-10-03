import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMember } from '../hooks/auth'
import { useMembers } from '../hooks/data'
import {
  cancelTeamInvite, createTeam, deleteTeam, fetchTeams, inviteToTeam, removeTeamMember, renameTeam, setTeamMember, teamInviteLink,
} from '../lib/api'
import { errorMessage } from '../lib/http'
import { formatDay } from '../lib/text'
import type { Me, Team, TeamRole } from '../lib/types'
import { InviteLinkModal, type InviteLink } from '../components/InviteLinkModal'
import { Badge, Button, EmptyState, Spinner, cx, inputClass } from '../components/ui'
import { useToast } from '../components/toast'
import { TEAM_ROLE_LABEL, skillsKey } from './SkillsPage'

const teamsKey = ['teams'] as const
const ROLES: TeamRole[] = ['captain', 'coach', 'player']
const ROLE_TONE: Record<TeamRole, string> = {
  captain: 'bg-amber-500/15 text-amber-200 ring-amber-500/40',
  coach: 'bg-violet-500/15 text-violet-200 ring-violet-500/40',
  player: 'bg-slate-800 text-slate-300 ring-slate-600',
}

function useTeamActions() {
  const qc = useQueryClient()
  const toast = useToast()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: teamsKey })
    qc.invalidateQueries({ queryKey: skillsKey })
  }
  return { refresh, onError: (e: unknown) => toast(errorMessage(e), 'error'), toast }
}

export default function TeamsPage() {
  const me = useMember()
  const q = useQuery({ queryKey: teamsKey, queryFn: fetchTeams })
  if (q.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="size-8" />
      </div>
    )
  }
  const teams = q.data ?? []
  const mine = teams.filter((t) => t.members.some((m) => m.member_id === me.id) || t.can_manage)
  const others = teams.filter((t) => !mine.includes(t))

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-5">
      <div>
        <h1 className="text-xl font-bold">Équipes</h1>
        <p className="text-sm text-slate-400">
          Rôles : <strong className="text-amber-200">Capitaine</strong> (joue et gère l'équipe), <strong className="text-violet-200">Coach</strong> (gère,
          ne joue pas), <strong className="text-slate-200">Joueur</strong>. Capitaines et coachs fixent les compétences de l'équipe et invitent des joueurs.
        </p>
      </div>
      {me.role === 'admin' && <NewTeam />}
      {teams.length === 0 ? (
        <EmptyState title="Aucune équipe">{me.role === 'admin' ? 'Crée la première équipe ci-dessus.' : "L'admin n'a pas encore créé d'équipe."}</EmptyState>
      ) : (
        <>
          {mine.map((t) => (
            <TeamCard key={t.id} team={t} me={me} />
          ))}
          {others.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold tracking-wider text-slate-500 uppercase">Autres équipes</h2>
              {others.map((t) => (
                <TeamCard key={t.id} team={t} me={me} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function NewTeam() {
  const members = useMembers().data ?? []
  const { refresh, onError, toast } = useTeamActions()
  const [name, setName] = useState('')
  const [captain, setCaptain] = useState('')
  const create = useMutation({
    mutationFn: () => createTeam(name.trim(), captain || null),
    onSuccess: () => {
      toast('Équipe créée')
      setName('')
      setCaptain('')
      refresh()
    },
    onError,
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) create.mutate()
      }}
      className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-900 p-3 ring-1 ring-slate-800"
    >
      <span className="text-sm font-semibold">Nouvelle équipe</span>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom (ex. : Équipe 2)" maxLength={60} className={cx(inputClass, 'min-w-48 flex-1')} aria-label="Nom de l'équipe" />
      <select value={captain} onChange={(e) => setCaptain(e.target.value)} className={cx(inputClass, 'w-auto!')} aria-label="Capitaine">
        <option value="">Capitaine : plus tard</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            Capitaine : {m.display_name || m.email}
          </option>
        ))}
      </select>
      <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
        Créer
      </Button>
    </form>
  )
}

function TeamCard({ team, me }: { team: Team; me: Me }) {
  const allMembers = useMembers().data ?? []
  const { refresh, onError, toast } = useTeamActions()
  const [link, setLink] = useState<InviteLink | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(team.name)
  const [addId, setAddId] = useState('')
  const [addRole, setAddRole] = useState<TeamRole>('player')
  const [invite, setInvite] = useState({ note: '', email: '', role: 'player' as TeamRole })
  const manage = team.can_manage
  const myRole = team.members.find((m) => m.member_id === me.id)?.role
  const canNameCaptain = me.role === 'admin' || myRole === 'captain'

  const rename = useMutation({ mutationFn: () => renameTeam(team.id, name.trim()), onSuccess: () => { setRenaming(false); refresh() }, onError })
  const remove = useMutation({ mutationFn: () => deleteTeam(team.id), onSuccess: () => { toast('Équipe supprimée'); refresh() }, onError })
  const setRole = useMutation({ mutationFn: ({ id, role }: { id: string; role: TeamRole }) => setTeamMember(team.id, id, role), onSuccess: refresh, onError })
  const kick = useMutation({ mutationFn: (id: string) => removeTeamMember(team.id, id), onSuccess: refresh, onError })
  const add = useMutation({
    mutationFn: () => setTeamMember(team.id, addId, addRole),
    onSuccess: () => {
      setAddId('')
      refresh()
    },
    onError,
  })
  const sendInvite = useMutation({
    mutationFn: () => inviteToTeam(team.id, { note: invite.note.trim(), email: invite.email.trim() || undefined, role: invite.role }),
    onSuccess: (r) => {
      if (r.added) toast('Déjà membre du site : ajouté directement à l’équipe')
      else if (r.url) setLink({ url: r.url, expires_at: r.expires_at!, who: invite.note.trim() })
      setInvite({ note: '', email: '', role: 'player' })
      refresh()
    },
    onError,
  })
  const relink = useMutation({
    mutationFn: ({ id }: { id: number; who: string }) => teamInviteLink(team.id, id),
    onSuccess: (r, v) => {
      setLink({ ...r, who: v.who })
      refresh()
    },
    onError,
  })
  const cancel = useMutation({ mutationFn: (id: number) => cancelTeamInvite(team.id, id), onSuccess: refresh, onError })

  const notInTeam = allMembers.filter((m) => !team.members.some((t) => t.member_id === m.id))
  const validInvite = !!invite.note.trim() && (!invite.email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(invite.email.trim()))

  return (
    <article className="space-y-4 rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-800 sm:p-5">
      <header className="flex flex-wrap items-center gap-2">
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) rename.mutate()
            }}
            className="flex gap-2"
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={cx(inputClass, 'py-1')} aria-label="Nom de l'équipe" />
            <Button type="submit" size="sm" variant="primary">
              OK
            </Button>
          </form>
        ) : (
          <h2 className="text-lg font-bold">{team.name}</h2>
        )}
        {myRole && <Badge className={ROLE_TONE[myRole]}>{TEAM_ROLE_LABEL[myRole]}</Badge>}
        <span className="text-xs text-slate-500">{team.members.length} membre{team.members.length > 1 ? 's' : ''}</span>
        <span className="flex-1" />
        <Link to={`/competences?equipe=${team.id}`} className="text-sm text-amber-400 hover:text-amber-300">
          Compétences →
        </Link>
        {manage && !renaming && (
          <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>
            Renommer
          </Button>
        )}
        {me.role === 'admin' && (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-300"
            onClick={() => window.confirm(`Supprimer l'équipe « ${team.name} » ? Les joueurs restent membres du site.`) && remove.mutate()}
          >
            Supprimer
          </Button>
        )}
      </header>

      <ul className="divide-y divide-slate-800 rounded-xl ring-1 ring-slate-800">
        {team.members.map((m) => (
          <li key={m.member_id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            {m.avatar_url ? (
              <img src={m.avatar_url} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid size-8 place-items-center rounded-full bg-slate-700 text-sm">{(m.display_name || '?')[0]}</span>
            )}
            <span className="min-w-0 flex-1 truncate font-medium">
              {m.display_name || m.email}
              {m.member_id === me.id && <span className="ml-1 text-xs font-normal text-slate-500">(toi)</span>}
            </span>
            {manage ? (
              <select
                value={m.role}
                onChange={(e) => setRole.mutate({ id: m.member_id, role: e.target.value as TeamRole })}
                className={cx(inputClass, 'w-auto! py-1')}
                aria-label={`Rôle de ${m.display_name}`}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} disabled={r !== 'player' && !canNameCaptain && m.role !== r}>
                    {TEAM_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            ) : (
              <Badge className={ROLE_TONE[m.role]}>{TEAM_ROLE_LABEL[m.role]}</Badge>
            )}
            {(manage || m.member_id === me.id) && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:text-red-300"
                onClick={() =>
                  window.confirm(m.member_id === me.id ? `Quitter « ${team.name} » ?` : `Retirer ${m.display_name} de l'équipe ?`) && kick.mutate(m.member_id)
                }
              >
                {m.member_id === me.id ? 'Quitter' : 'Retirer'}
              </Button>
            )}
          </li>
        ))}
        {team.members.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Personne pour l'instant.</li>}
      </ul>

      {manage && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (validInvite) sendInvite.mutate()
            }}
            className="space-y-2 rounded-xl bg-slate-950/50 p-3 ring-1 ring-slate-800"
          >
            <p className="text-sm font-semibold">Inviter un nouveau joueur</p>
            <p className="text-xs text-slate-500">Un lien d'inscription à usage unique est créé : envoie-le lui. Il y choisit son email et son mot de passe, et rejoint l'équipe.</p>
            <div className="flex flex-wrap gap-2">
              <input value={invite.note} onChange={(e) => setInvite({ ...invite, note: e.target.value })} placeholder="Pseudo" maxLength={60} className={cx(inputClass, 'min-w-32 flex-1')} aria-label="Pseudo du joueur invité" />
              <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as TeamRole })} className={cx(inputClass, 'w-auto!')} aria-label="Rôle du joueur invité">
                {ROLES.filter((r) => r === 'player' || canNameCaptain).map((r) => (
                  <option key={r} value={r}>
                    {TEAM_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="email"
              value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              placeholder="Email (optionnel : s'il est déjà inscrit, il est ajouté directement)"
              className={inputClass}
              aria-label="Email du joueur invité"
            />
            <Button type="submit" variant="primary" disabled={!validInvite || sendInvite.isPending}>
              Inviter
            </Button>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (addId) add.mutate()
            }}
            className="space-y-2 rounded-xl bg-slate-950/50 p-3 ring-1 ring-slate-800"
          >
            <p className="text-sm font-semibold">Ajouter un membre du site</p>
            <p className="text-xs text-slate-500">Pour quelqu'un qui a déjà accès au site (par exemple membre d'une autre équipe).</p>
            <div className="flex flex-wrap gap-2">
              <select value={addId} onChange={(e) => setAddId(e.target.value)} className={cx(inputClass, 'min-w-40 flex-1')} aria-label="Membre à ajouter">
                <option value="">Choisir…</option>
                {notInTeam.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name || m.email}
                  </option>
                ))}
              </select>
              <select value={addRole} onChange={(e) => setAddRole(e.target.value as TeamRole)} className={cx(inputClass, 'w-auto!')} aria-label="Rôle du membre ajouté">
                {ROLES.filter((r) => r === 'player' || canNameCaptain).map((r) => (
                  <option key={r} value={r}>
                    {TEAM_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={!addId || add.isPending}>
              Ajouter
            </Button>
          </form>
        </div>
      )}

      {manage && team.invites.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-semibold">Invitations en attente</p>
          <ul className="divide-y divide-slate-800 rounded-xl ring-1 ring-slate-800">
            {team.invites.map((i) => {
              const active = i.invite_expires_at && new Date(i.invite_expires_at) > new Date()
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {i.note || i.email} <span className="text-slate-500">· {TEAM_ROLE_LABEL[i.team_role]}</span>
                  </span>
                  <span className={cx('text-xs', active ? 'text-sky-300' : 'text-slate-500')}>
                    {active ? `lien valable jusqu'au ${formatDay(i.invite_expires_at!)}` : 'lien expiré'}
                  </span>
                  <Button size="sm" onClick={() => relink.mutate({ id: i.id, who: i.note || '' })}>
                    🔗 Nouveau lien
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-400" onClick={() => window.confirm('Annuler cette invitation ?') && cancel.mutate(i.id)}>
                    Annuler
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <InviteLinkModal link={link} onClose={() => setLink(null)} />
    </article>
  )
}
