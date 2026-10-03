import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMember } from '../hooks/auth'
import { fetchSkills, insertTag, setMemberSkill, setTeamSkill, updateTag } from '../lib/api'
import { errorMessage } from '../lib/http'
import {
  STATUS_ICON, STATUS_LABEL, STATUS_ORDER, groupSkills, indexSkills, memberCounts, playerCounts, toWorkOverview, type Counts,
} from '../lib/skills'
import type { Me, Skill, SkillsData, SkillStatus } from '../lib/types'
import { Button, EmptyState, Field, Modal, Spinner, cx, inputClass } from '../components/ui'
import { useToast } from '../components/toast'

export const skillsKey = ['skills'] as const

const TONE: Record<SkillStatus, string> = {
  not_worked: 'bg-slate-800 text-slate-300 ring-slate-600',
  to_work: 'bg-amber-500/15 text-amber-200 ring-amber-500/50',
  acquired: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/50',
}
const BAR: Record<SkillStatus, string> = { not_worked: '#475569', to_work: '#f59e0b', acquired: '#10b981' }

type Player = SkillsData['players'][number]
const playerName = (p: Pick<Player, 'display_name' | 'email'>) => p.display_name || p.email || 'Joueur'

// ================================================================ Page

export default function SkillsPage() {
  const me = useMember()
  const q = useQuery({ queryKey: skillsKey, queryFn: fetchSkills })
  const [params, setParams] = useSearchParams()
  const tab = (params.get('vue') ?? 'travail') as 'travail' | 'matrice' | 'joueur'
  const setTab = (v: string, extra: Record<string, string> = {}) => setParams({ vue: v, ...extra }, { replace: true })

  if (q.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="size-8" />
      </div>
    )
  }
  if (q.error || !q.data) return <EmptyState title="Impossible de charger les compétences">{errorMessage(q.error)}</EmptyState>
  const data = q.data

  const tabs: [typeof tab, string][] = [
    ['travail', 'À travailler'],
    ['matrice', 'Équipe & joueurs'],
    ['joueur', 'Fiche joueur'],
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Compétences · {data.team.name}</h1>
          <p className="text-sm text-slate-400">
            Trois statuts : {STATUS_ORDER.map((s) => `${STATUS_ICON[s]} ${STATUS_LABEL[s]}`).join(' · ')}. Une compétence passée « à travailler » pour
            l'équipe passe « à travailler » chez tous les joueurs.
          </p>
        </div>
        {me.role === 'admin' && <NewSkillButton data={data} />}
      </div>

      <nav className="flex gap-1 border-b border-slate-800" role="tablist">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cx(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === k ? 'border-amber-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200',
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {data.skills.filter((s) => !s.archived).length === 0 ? (
        <EmptyState title="Aucune compétence">{me.role === 'admin' ? 'Ajoute la première avec « + Compétence ».' : "L'admin n'a pas encore défini de compétences."}</EmptyState>
      ) : tab === 'travail' ? (
        <ToWorkView data={data} me={me} onOpenPlayer={(id) => setTab('joueur', { joueur: id })} />
      ) : tab === 'matrice' ? (
        <MatrixView data={data} me={me} />
      ) : (
        <PlayerView data={data} me={me} playerId={params.get('joueur') ?? me.id} onPick={(id) => setTab('joueur', { joueur: id })} />
      )}
    </div>
  )
}

// ================================================================ Mutations

function useSkillMutations() {
  const qc = useQueryClient()
  const toast = useToast()
  const onError = (e: unknown) => toast(errorMessage(e), 'error')
  const refresh = () => qc.invalidateQueries({ queryKey: skillsKey })

  /** Mise à jour optimiste : le changement s'affiche tout de suite. */
  const patch = (fn: (d: SkillsData) => SkillsData) => qc.setQueryData<SkillsData>(skillsKey, (d) => (d ? fn(d) : d))

  const team = useMutation({
    mutationFn: ({ skillId, status }: { skillId: number; status: SkillStatus }) => setTeamSkill(skillId, status),
    onMutate: ({ skillId, status }) =>
      patch((d) => ({
        ...d,
        teamStatus: [...d.teamStatus.filter((s) => s.skill_id !== skillId), { skill_id: skillId, status, updated_by: null, updated_at: '' }],
        memberStatus:
          status === 'to_work'
            ? [
                ...d.memberStatus.filter((s) => s.skill_id !== skillId),
                ...d.players.map((p) => ({ member_id: p.id, skill_id: skillId, status: 'to_work' as const, updated_by: null, updated_at: '' })),
              ]
            : d.memberStatus,
      })),
    onSuccess: (r, { status }) => {
      if (status === 'to_work') toast(`Objectif d'équipe : passé « à travailler » chez ${r.propagated} joueur${r.propagated > 1 ? 's' : ''}`)
    },
    onError,
    onSettled: refresh,
  })
  const member = useMutation({
    mutationFn: ({ skillId, memberId, status }: { skillId: number; memberId: string; status: SkillStatus }) =>
      setMemberSkill(skillId, memberId, status),
    onMutate: ({ skillId, memberId, status }) =>
      patch((d) => ({
        ...d,
        memberStatus: [
          ...d.memberStatus.filter((s) => !(s.skill_id === skillId && s.member_id === memberId)),
          { member_id: memberId, skill_id: skillId, status, updated_by: null, updated_at: '' },
        ],
      })),
    onError,
    onSettled: refresh,
  })
  return { team, member }
}

// ================================================================ Éléments

/** Pastille de statut ; si modifiable, ouvre un menu des trois statuts. */
function StatusControl({
  status,
  editable,
  onChange,
  label,
  compact = false,
  confirmToWork,
}: {
  status: SkillStatus
  editable: boolean
  onChange: (s: SkillStatus) => void
  label: string
  compact?: boolean
  /** Message de confirmation avant de passer « à travailler » (équipe : propagation). */
  confirmToWork?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const pill = (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset whitespace-nowrap', TONE[status])}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {!compact && STATUS_LABEL[status]}
    </span>
  )
  if (!editable) return <span title={`${label} : ${STATUS_LABEL[status]}`}>{pill}</span>
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} : ${STATUS_LABEL[status]} (modifier)`}
        title={`${label} : ${STATUS_LABEL[status]}`}
        className="rounded-md focus-visible:outline-2 focus-visible:outline-amber-400 hover:brightness-125"
      >
        {pill}
      </button>
      {open && (
        <div role="menu" className="absolute left-1/2 z-30 mt-1 w-44 -translate-x-1/2 rounded-lg bg-slate-900 p-1 shadow-xl ring-1 ring-slate-700">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === status}
              onClick={() => {
                setOpen(false)
                if (s === status) return
                if (s === 'to_work' && confirmToWork && !window.confirm(confirmToWork)) return
                onChange(s)
              }}
              className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-800', s === status && 'bg-slate-800')}
            >
              <span className={cx('inline-flex size-5 items-center justify-center rounded ring-1 ring-inset', TONE[s])}>{STATUS_ICON[s]}</span>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Barre de progression empilée : acquis / à travailler / non travaillé. */
function ProgressBar({ counts, total }: { counts: Counts; total: number }) {
  if (!total) return null
  const order: SkillStatus[] = ['acquired', 'to_work', 'not_worked']
  return (
    <div className="space-y-1">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-800" aria-hidden>
        {order.map((s) =>
          counts[s] ? <div key={s} style={{ width: `${(counts[s] / total) * 100}%`, backgroundColor: BAR[s] }} /> : null,
        )}
      </div>
      <p className="text-xs text-slate-400 tabular-nums">
        {order.map((s) => `${STATUS_ICON[s]} ${counts[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(' · ')}
      </p>
    </div>
  )
}

function Avatar({ p, size = 'size-7' }: { p: Pick<Player, 'avatar_url' | 'display_name' | 'email'>; size?: string }) {
  return p.avatar_url ? (
    <img src={p.avatar_url} alt="" className={cx(size, 'shrink-0 rounded-full')} referrerPolicy="no-referrer" />
  ) : (
    <span className={cx(size, 'grid shrink-0 place-items-center rounded-full bg-slate-700 text-xs font-semibold')}>
      {playerName(p).slice(0, 1).toUpperCase()}
    </span>
  )
}

const canEditPlayer = (me: Me, playerId: string) => me.role === 'admin' || me.id === playerId

// ================================================================ Vue « À travailler »

function ToWorkView({ data, me, onOpenPlayer }: { data: SkillsData; me: Me; onOpenPlayer: (id: string) => void }) {
  const { team, individual } = useMemo(() => toWorkOverview(data), [data])
  const ix = useMemo(() => indexSkills(data), [data])
  const m = useSkillMutations()
  const groupName = (s: Skill) => data.groups.find((g) => g.id === s.group_id)?.name

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="flex items-baseline gap-2 font-semibold">
          Objectifs de l'équipe <span className="text-sm text-slate-500">({team.length})</span>
        </h2>
        {team.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucun objectif d'équipe.{' '}
            {me.role === 'admin' ? 'Dans « Équipe & joueurs », passe une compétence « à travailler » dans la colonne Équipe.' : ''}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {team.map(({ skill, counts }) => (
              <article key={skill.id} className="space-y-3 rounded-xl bg-slate-900 p-4 ring-1 ring-amber-500/30">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {groupName(skill) && <p className="text-xs text-slate-500">{groupName(skill)}</p>}
                    <h3 className="font-semibold text-slate-50">{skill.name}</h3>
                    {skill.description && <p className="mt-1 text-sm text-slate-400">{skill.description}</p>}
                  </div>
                  <StatusControl
                    status="to_work"
                    editable={me.role === 'admin'}
                    label={`${skill.name} (équipe)`}
                    onChange={(status) => m.team.mutate({ skillId: skill.id, status })}
                  />
                </div>
                <ProgressBar counts={counts} total={data.players.length} />
                <ul className="flex flex-wrap gap-1.5">
                  {data.players.map((p) => {
                    const s = ix.memberStatus(p.id, skill.id)
                    return (
                      <li key={p.id} className="flex items-center gap-1 rounded-full bg-slate-950/60 py-0.5 pr-1 pl-0.5 ring-1 ring-slate-800">
                        <Avatar p={p} size="size-5" />
                        <span className="max-w-24 truncate text-xs text-slate-300">{playerName(p)}</span>
                        <StatusControl
                          compact
                          status={s}
                          editable={canEditPlayer(me, p.id)}
                          label={`${skill.name} · ${playerName(p)}`}
                          onChange={(status) => m.member.mutate({ skillId: skill.id, memberId: p.id, status })}
                        />
                      </li>
                    )
                  })}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Objectifs individuels</h2>
        <p className="-mt-2 text-sm text-slate-500">Ce que chaque joueur a « à travailler » en plus des objectifs d'équipe.</p>
        {individual.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun objectif individuel pour l'instant.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {individual.map(({ player, skills }) => (
              <article key={player.id} className="rounded-xl bg-slate-900 p-4 ring-1 ring-slate-800">
                <button type="button" onClick={() => onOpenPlayer(player.id)} className="mb-2 flex items-center gap-2 font-semibold hover:text-amber-300">
                  <Avatar p={player} />
                  {playerName(player)}
                  {player.id === me.id && <span className="text-xs font-normal text-slate-500">(toi)</span>}
                </button>
                <ul className="space-y-1.5">
                  {skills.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-slate-200">{s.name}</span>
                      <StatusControl
                        compact
                        status="to_work"
                        editable={canEditPlayer(me, player.id)}
                        label={`${s.name} · ${playerName(player)}`}
                        onChange={(status) => m.member.mutate({ skillId: s.id, memberId: player.id, status })}
                      />
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ================================================================ Matrice équipe × joueurs

function MatrixView({ data, me }: { data: SkillsData; me: Me }) {
  const ix = useMemo(() => indexSkills(data), [data])
  const groups = useMemo(() => groupSkills(data), [data])
  const m = useSkillMutations()
  const n = data.players.length

  return (
    <div className="scrollbar-thin overflow-x-auto rounded-xl ring-1 ring-slate-800">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="sticky top-0 bg-slate-900 text-xs text-slate-400">
          <tr>
            <th className="px-3 py-2 font-medium">Compétence</th>
            <th className="bg-amber-500/5 px-2 py-2 text-center font-semibold text-amber-200">Équipe</th>
            <th className="px-2 py-2 text-center font-medium">Progression</th>
            {data.players.map((p) => (
              <th key={p.id} className="px-2 py-2 text-center font-medium">
                <span className="inline-flex flex-col items-center gap-1">
                  <Avatar p={p} size="size-6" />
                  <span className="max-w-20 truncate">{playerName(p)}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.id ?? 'none'} className="divide-y divide-slate-800/70">
            <tr>
              <th colSpan={3 + n} className="bg-slate-950 px-3 pt-4 pb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                {g.name}
              </th>
            </tr>
            {g.skills.map((s) => {
              const counts = playerCounts(data, s.id)
              return (
                <tr key={s.id} className="hover:bg-slate-900/60">
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-100">{s.name}</span>
                    {s.description && <span className="block max-w-xs truncate text-xs text-slate-500">{s.description}</span>}
                  </td>
                  <td className="bg-amber-500/5 px-2 py-2 text-center">
                    <StatusControl
                      status={ix.teamStatus(s.id)}
                      editable={me.role === 'admin'}
                      label={`${s.name} (équipe)`}
                      confirmToWork={`Passer « ${s.name} » à travailler pour l'équipe ?\n\nTous les joueurs (${n}) passeront « à travailler » sur cette compétence.`}
                      onChange={(status) => m.team.mutate({ skillId: s.id, status })}
                    />
                  </td>
                  <td className="px-2 py-2 text-center text-xs text-slate-400 tabular-nums" title="Joueurs ayant acquis la compétence">
                    {counts.acquired}/{n}
                  </td>
                  {data.players.map((p) => (
                    <td key={p.id} className="px-2 py-2 text-center">
                      <StatusControl
                        compact
                        status={ix.memberStatus(p.id, s.id)}
                        editable={canEditPlayer(me, p.id)}
                        label={`${s.name} · ${playerName(p)}`}
                        onChange={(status) => m.member.mutate({ skillId: s.id, memberId: p.id, status })}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </div>
  )
}

// ================================================================ Fiche joueur

function PlayerView({ data, me, playerId, onPick }: { data: SkillsData; me: Me; playerId: string; onPick: (id: string) => void }) {
  const ix = useMemo(() => indexSkills(data), [data])
  const m = useSkillMutations()
  const player = data.players.find((p) => p.id === playerId) ?? data.players.find((p) => p.id === me.id) ?? data.players[0]
  if (!player) return <EmptyState title="Aucun joueur dans l'équipe" />
  const counts = memberCounts(data, player.id)
  const total = counts.acquired + counts.to_work + counts.not_worked
  const editable = canEditPlayer(me, player.id)
  const groupName = (s: Skill) => data.groups.find((g) => g.id === s.group_id)?.name

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar p={player} size="size-10" />
        <select value={player.id} onChange={(e) => onPick(e.target.value)} className={cx(inputClass, 'w-auto! py-2 text-base font-semibold')} aria-label="Joueur">
          {data.players.map((p) => (
            <option key={p.id} value={p.id}>
              {playerName(p)}
              {p.id === me.id ? ' (toi)' : ''}
            </option>
          ))}
        </select>
        <div className="min-w-60 flex-1">
          <ProgressBar counts={counts} total={total} />
        </div>
      </div>
      {!editable && <p className="text-sm text-slate-500">Lecture seule : chaque joueur met à jour ses propres compétences (l'admin peut tout modifier).</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {(['to_work', 'not_worked', 'acquired'] as SkillStatus[]).map((status) => {
          const list = data.skills.filter((s) => !s.archived && ix.memberStatus(player.id, s.id) === status)
          return (
            <section key={status} className={cx('rounded-xl p-3 ring-1', status === 'to_work' ? 'bg-amber-500/5 ring-amber-500/30' : 'bg-slate-900 ring-slate-800')}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <span className={cx('inline-flex size-5 items-center justify-center rounded ring-1 ring-inset', TONE[status])}>{STATUS_ICON[status]}</span>
                {STATUS_LABEL[status]}
                <span className="text-slate-500">({list.length})</span>
              </h3>
              {list.length === 0 ? (
                <p className="text-sm text-slate-600">—</p>
              ) : (
                <ul className="space-y-1.5">
                  {list.map((s) => {
                    const teamGoal = ix.teamStatus(s.id) === 'to_work'
                    return (
                      <li key={s.id} className="flex items-center gap-2 rounded-lg bg-slate-950/50 px-2.5 py-2 ring-1 ring-slate-800">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-100">{s.name}</p>
                          <p className="truncate text-xs text-slate-500">
                            {[groupName(s), teamGoal && '🎯 objectif d’équipe'].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <StatusControl
                          compact
                          status={status}
                          editable={editable}
                          label={`${s.name} · ${playerName(player)}`}
                          onChange={(next) => m.member.mutate({ skillId: s.id, memberId: player.id, status: next })}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ================================================================ Ajout / modification (admin)

function NewSkillButton({ data }: { data: SkillsData }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        + Compétence
      </Button>
      <SkillEditor open={open} onClose={() => setOpen(false)} data={data} />
    </>
  )
}

export function SkillEditor({ open, onClose, data, skill }: { open: boolean; onClose: () => void; data: SkillsData; skill?: Skill }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(skill?.name ?? '')
  const [description, setDescription] = useState(skill?.description ?? '')
  const [groupId, setGroupId] = useState<number | null>(skill?.group_id ?? data.groups.find((g) => !g.archived)?.id ?? null)
  const save = useMutation({
    mutationFn: () => {
      const values = { name, description, group_id: groupId, ...(skill ? {} : { sort_order: 999 }) }
      return skill ? updateTag('skills', skill.id, values) : insertTag('skills', values)
    },
    onSuccess: () => {
      toast(skill ? 'Compétence modifiée' : 'Compétence ajoutée')
      qc.invalidateQueries({ queryKey: skillsKey })
      if (!skill) {
        setName('')
        setDescription('')
      }
      onClose()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  return (
    <Modal open={open} onClose={onClose} title={skill ? 'Modifier la compétence' : 'Nouvelle compétence'}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) save.mutate()
        }}
      >
        <Field label="Nom" htmlFor="sk-name">
          <input id="sk-name" autoFocus value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Ex. : Smokes d'exé B Mirage" />
        </Field>
        <Field label="Groupe" htmlFor="sk-group">
          <select id="sk-group" value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)} className={inputClass}>
            <option value="">Sans groupe</option>
            {data.groups.filter((g) => !g.archived || g.id === groupId).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description" optional htmlFor="sk-desc">
          <textarea id="sk-desc" rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} className={inputClass} placeholder="Critère pour la considérer comme acquise…" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || save.isPending}>
            {skill ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
