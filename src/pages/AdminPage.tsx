import { useMemo, useState, type ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EMPTY_TAGS, qk, useCards, useTags } from '../hooks/data'
import { useMember } from '../hooks/auth'
import {
  addAllowlist, deleteAllowlist, deleteTag, fetchAllowlist, insertTag, mergeZones, removeMember, reorderTags,
  updateAllowlist, updateMember, updateTag,
} from '../lib/api'
import { errorMessage } from '../lib/supabase'
import { formatDay, normalize } from '../lib/text'
import type { Card, Member, MemberRole, Side, Tag, TagTable, Tags, Zone } from '../lib/types'
import { useMembers } from '../hooks/data'
import { Badge, Button, cx, inputClass, Spinner } from '../components/ui'
import { useToast } from '../components/toast'

const TABS: [string, string][] = [
  ['membres', 'Membres'],
  ['maps', 'Maps'],
  ['zones', 'Zones'],
  ['roles', 'Rôles'],
  ['categories', 'Catégories'],
  ['risques', 'Risque'],
  ['utilitaires', 'Utilitaires'],
  ['economie', 'Économie'],
]

export default function AdminPage() {
  const tagsQ = useTags()
  const pending = (tagsQ.data?.zones ?? []).filter((z) => z.pending && !z.archived).length
  return (
    <div className="mx-auto max-w-5xl px-4 py-5">
      <h1 className="mb-4 text-xl font-bold">Administration</h1>
      <nav className="scrollbar-thin mb-6 flex gap-1 overflow-x-auto border-b border-slate-800">
        {TABS.map(([path, label]) => (
          <NavLink
            key={path}
            to={`/admin/${path}`}
            className={({ isActive }) =>
              cx(
                '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm',
                isActive ? 'border-amber-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200',
              )
            }
          >
            {label}
            {path === 'zones' && pending > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs font-bold text-slate-950">{pending}</span>
            )}
          </NavLink>
        ))}
      </nav>
      {tagsQ.isLoading ? (
        <Spinner />
      ) : (
        <Routes>
          <Route index element={<Navigate to="membres" replace />} />
          <Route path="membres" element={<MembersAdmin />} />
          <Route path="maps" element={<TagEditor table="maps" title="Maps" hint="Le map pool actif. Archive une map sortie du pool : ses cartes restent consultables." />} />
          <Route path="zones" element={<ZonesAdmin />} />
          <Route path="roles" element={<RolesAdmin />} />
          <Route path="categories" element={<TagEditor table="categories" title="Catégories" hint="« Affiche l'utilitaire » fait apparaître le choix Smoke/Flash/… dans le formulaire (catégorie Stuff)." />} />
          <Route path="risques" element={<TagEditor table="risks" title="Niveaux de risque" hint="Ordre du moins au plus risqué. La couleur sert aux badges." />} />
          <Route path="utilitaires" element={<TagEditor table="utilities" title="Types d'utilitaire" />} />
          <Route path="economie" element={<TagEditor table="economies" title="Économie du round" />} />
        </Routes>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- utilitaires

type AnyTag = Tag & Partial<{ side: Side; color: string; shows_utility: boolean; map_id: number; pending: boolean }>

function usageCounts(cards: Card[] | undefined, table: TagTable): Map<number, number> {
  const m = new Map<number, number>()
  const add = (id: number | null) => id != null && m.set(id, (m.get(id) ?? 0) + 1)
  for (const c of cards ?? []) {
    switch (table) {
      case 'maps': add(c.map_id); break
      case 'risks': add(c.risk_id); break
      case 'roles': c.role_ids.forEach(add); break
      case 'zones': c.zone_ids.forEach(add); break
      case 'categories': c.category_ids.forEach(add); break
      case 'utilities': c.utility_ids.forEach(add); break
      case 'economies': c.economy_ids.forEach(add); break
    }
  }
  return m
}

function useTagMutations(table: TagTable) {
  const qc = useQueryClient()
  const toast = useToast()
  const done = () => qc.invalidateQueries({ queryKey: qk.tags })
  const onError = (e: unknown) => toast(errorMessage(e), 'error')
  return {
    insert: useMutation({ mutationFn: (v: Record<string, unknown>) => insertTag(table, v), onSuccess: done, onError }),
    update: useMutation({
      mutationFn: ({ id, values }: { id: number; values: Record<string, unknown> }) => updateTag(table, id, values),
      onSuccess: done,
      onError,
    }),
    remove: useMutation({
      mutationFn: (id: number) => deleteTag(table, id),
      onSuccess: () => {
        toast('Supprimé')
        done()
      },
      onError,
    }),
    reorder: useMutation({ mutationFn: (ids: number[]) => reorderTags(table, ids), onSuccess: done, onError }),
  }
}

function Section({ title, hint, children, actions }: { title: string; hint?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {hint && <p className="text-sm text-slate-400">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------- éditeur générique

function TagEditor({
  table,
  title,
  hint,
  filter,
  defaults,
}: {
  table: TagTable
  title: string
  hint?: string
  filter?: (t: AnyTag) => boolean
  defaults?: Record<string, unknown>
}) {
  const tags = useTags().data ?? EMPTY_TAGS
  const cards = useCards().data
  const usage = useMemo(() => usageCounts(cards, table), [cards, table])
  const m = useTagMutations(table)
  const [name, setName] = useState('')
  const items = (tags[table] as AnyTag[]).filter(filter ?? (() => true))
  const active = items.filter((t) => !t.archived)
  const archived = items.filter((t) => t.archived)

  function add(e: React.FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const max = Math.max(0, ...items.map((t) => t.sort_order))
    m.insert.mutate({ name: n, sort_order: max + 1, ...defaults }, { onSuccess: () => setName('') })
  }

  function move(i: number, d: number) {
    const ids = active.map((t) => t.id)
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    m.reorder.mutate(ids)
  }

  return (
    <Section title={title} hint={hint}>
      <form onSubmit={add} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvelle valeur…" className={inputClass} />
        <Button type="submit" variant="primary" disabled={!name.trim() || m.insert.isPending}>
          Ajouter
        </Button>
      </form>
      <ul className="divide-y divide-slate-800 rounded-xl ring-1 ring-slate-800">
        {active.map((t, i) => (
          <TagRow key={t.id} tag={t} table={table} usage={usage.get(t.id) ?? 0} m={m} onUp={() => move(i, -1)} onDown={() => move(i, 1)} first={i === 0} last={i === active.length - 1} />
        ))}
        {active.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Aucune valeur.</li>}
      </ul>
      {archived.length > 0 && (
        <details className="rounded-xl ring-1 ring-slate-800">
          <summary className="cursor-pointer px-4 py-2 text-sm text-slate-400">Archivées ({archived.length})</summary>
          <ul className="divide-y divide-slate-800 border-t border-slate-800">
            {archived.map((t) => (
              <TagRow key={t.id} tag={t} table={table} usage={usage.get(t.id) ?? 0} m={m} />
            ))}
          </ul>
        </details>
      )}
    </Section>
  )
}

function TagRow({
  tag, table, usage, m, onUp, onDown, first, last, extra,
}: {
  tag: AnyTag
  table: TagTable
  usage: number
  m: ReturnType<typeof useTagMutations>
  onUp?: () => void
  onDown?: () => void
  first?: boolean
  last?: boolean
  extra?: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(tag.name)
  const save = () => {
    const n = name.trim()
    setEditing(false)
    if (n && n !== tag.name) m.update.mutate({ id: tag.id, values: { name: n } })
    else setName(tag.name)
  }
  return (
    <li className={cx('flex flex-wrap items-center gap-2 px-3 py-2', tag.archived && 'opacity-60')}>
      {onUp && (
        <span className="flex flex-col">
          <button type="button" onClick={onUp} disabled={first} className="px-1 text-xs text-slate-500 hover:text-white disabled:opacity-20" aria-label="Monter">
            ▲
          </button>
          <button type="button" onClick={onDown} disabled={last} className="px-1 text-xs text-slate-500 hover:text-white disabled:opacity-20" aria-label="Descendre">
            ▼
          </button>
        </span>
      )}
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setName(tag.name)
              setEditing(false)
            }
          }}
          className={cx(inputClass, 'max-w-xs py-1')}
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="font-medium hover:text-amber-300" title="Renommer">
          {tag.name}
        </button>
      )}
      {tag.pending && <Badge className="bg-amber-500/20 text-amber-200 ring-amber-500/40">à valider</Badge>}
      <span className="text-xs text-slate-500">{usage} carte{usage > 1 ? 's' : ''}</span>
      <span className="flex-1" />
      {extra}
      {table === 'risks' && (
        <input
          type="color"
          value={tag.color ?? '#64748b'}
          onChange={(e) => m.update.mutate({ id: tag.id, values: { color: e.target.value } })}
          className="h-7 w-10 cursor-pointer rounded bg-transparent"
          aria-label="Couleur"
        />
      )}
      {table === 'categories' && (
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={!!tag.shows_utility}
            onChange={(e) => m.update.mutate({ id: tag.id, values: { shows_utility: e.target.checked } })}
            className="accent-amber-500"
          />
          Affiche l'utilitaire
        </label>
      )}
      <Button size="sm" variant="ghost" onClick={() => m.update.mutate({ id: tag.id, values: { archived: !tag.archived } })}>
        {tag.archived ? 'Désarchiver' : 'Archiver'}
      </Button>
      {usage === 0 && (
        <Button
          size="sm"
          variant="ghost"
          className="text-red-400 hover:text-red-300"
          onClick={() => window.confirm(`Supprimer « ${tag.name} » ?`) && m.remove.mutate(tag.id)}
        >
          Supprimer
        </Button>
      )}
    </li>
  )
}

function RolesAdmin() {
  return (
    <div className="space-y-10">
      <TagEditor table="roles" title="Rôles CT" filter={(t) => t.side === 'CT'} defaults={{ side: 'CT' }} />
      <TagEditor table="roles" title="Rôles T" filter={(t) => t.side === 'T'} defaults={{ side: 'T' }} />
    </div>
  )
}

// ---------------------------------------------------------------- zones

function ZonesAdmin() {
  const tags = useTags().data ?? EMPTY_TAGS
  const maps = tags.maps.filter((m) => !m.archived)
  const [mapId, setMapId] = useState<number | null>(maps[0]?.id ?? null)
  const pending = tags.zones.filter((z) => z.pending && !z.archived)
  const map = tags.maps.find((m) => m.id === mapId)

  return (
    <div className="space-y-10">
      {pending.length > 0 && <PendingZones pending={pending} tags={tags} />}
      <Section
        title={`Zones${map ? ` · ${map.name}` : ''}`}
        hint="Les zones sont propres à chaque map. Clique sur un nom pour le renommer."
        actions={
          <select value={mapId ?? ''} onChange={(e) => setMapId(Number(e.target.value))} className={cx(inputClass, 'w-auto!')}>
            {tags.maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.archived ? ' (archivée)' : ''}
              </option>
            ))}
          </select>
        }
      >
        {mapId && (
          <TagEditor key={mapId} table="zones" title="" filter={(t) => t.map_id === mapId} defaults={{ map_id: mapId, pending: false }} />
        )}
      </Section>
    </div>
  )
}

function PendingZones({ pending, tags }: { pending: Zone[]; tags: Tags }) {
  const qc = useQueryClient()
  const toast = useToast()
  const cards = useCards().data
  const members = useMembers().data ?? []
  const usage = useMemo(() => usageCounts(cards, 'zones'), [cards])
  const m = useTagMutations('zones')
  const merge = useMutation({
    mutationFn: ({ source, target }: { source: number; target: number }) => mergeZones(source, target),
    onSuccess: () => {
      toast('Zones fusionnées : les cartes ont été mises à jour')
      qc.invalidateQueries({ queryKey: qk.tags })
      qc.invalidateQueries({ queryKey: qk.cards })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  return (
    <Section title={`Zones proposées à valider (${pending.length})`} hint="Créées par des membres depuis le formulaire. Valide, renomme, fusionne avec une zone existante ou archive.">
      <ul className="divide-y divide-slate-800 rounded-xl bg-amber-500/5 ring-1 ring-amber-500/30">
        {pending.map((z) => {
          const mapName = tags.maps.find((mm) => mm.id === z.map_id)?.name
          const author = members.find((mb) => mb.id === z.created_by)
          const similar = tags.zones
            .filter((o) => o.map_id === z.map_id && o.id !== z.id && !o.archived)
            .sort((a, b) => Number(normalize(b.name).includes(normalize(z.name).slice(0, 3))) - Number(normalize(a.name).includes(normalize(z.name).slice(0, 3))))
          return (
            <TagRow
              key={z.id}
              tag={z}
              table="zones"
              usage={usage.get(z.id) ?? 0}
              m={m}
              extra={
                <>
                  <span className="text-xs text-slate-400">
                    {mapName}
                    {author && ` · par ${author.display_name || author.email}`}
                  </span>
                  <select
                    value=""
                    onChange={(e) => {
                      const target = Number(e.target.value)
                      const t = similar.find((s) => s.id === target)
                      if (t && window.confirm(`Fusionner « ${z.name} » dans « ${t.name} » ? Les cartes concernées seront mises à jour.`))
                        merge.mutate({ source: z.id, target })
                    }}
                    className={cx(inputClass, 'w-auto! py-1 text-xs')}
                    aria-label="Fusionner avec"
                  >
                    <option value="">Fusionner avec…</option>
                    {similar.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="primary" onClick={() => m.update.mutate({ id: z.id, values: { pending: false } })}>
                    ✓ Valider
                  </Button>
                </>
              }
            />
          )
        })}
      </ul>
    </Section>
  )
}

// ---------------------------------------------------------------- membres

function MembersAdmin() {
  const me = useMember()
  const qc = useQueryClient()
  const toast = useToast()
  const members = useMembers()
  const allow = useQuery({ queryKey: ['allowlist'], queryFn: fetchAllowlist })
  const [ident, setIdent] = useState('')
  const [role, setRole] = useState<MemberRole>('member')
  const [note, setNote] = useState('')

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['allowlist'] })
    qc.invalidateQueries({ queryKey: qk.members })
  }
  const onError = (e: unknown) => toast(errorMessage(e), 'error')

  const invite = useMutation({
    mutationFn: () => {
      const v = ident.trim()
      const isDiscord = /^\d{15,21}$/.test(v)
      return addAllowlist({ email: isDiscord ? null : v, discord_id: isDiscord ? v : null, role, note })
    },
    onSuccess: () => {
      toast('Invitation ajoutée : la personne peut se connecter')
      setIdent('')
      setNote('')
      refresh()
    },
    onError,
  })
  const setMemberRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: MemberRole }) => updateMember(id, { role }),
    onSuccess: refresh,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => removeMember(id),
    onSuccess: () => {
      toast('Membre retiré')
      refresh()
    },
    onError,
  })
  const revoke = useMutation({ mutationFn: (id: number) => deleteAllowlist(id), onSuccess: refresh, onError })
  const setInviteRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: MemberRole }) => updateAllowlist(id, { role }),
    onSuccess: refresh,
    onError,
  })

  const memberEmails = new Set((members.data ?? []).map((m) => m.email))
  const validIdent = /^\d{15,21}$/.test(ident.trim()) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ident.trim())

  return (
    <div className="space-y-10">
      <Section title="Inviter" hint="Email (lien magique ou email du compte Discord) ou identifiant Discord numérique (Paramètres Discord › Avancés › Mode développeur › Copier l'identifiant).">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (validIdent) invite.mutate()
          }}
          className="flex flex-wrap gap-2"
        >
          <input value={ident} onChange={(e) => setIdent(e.target.value)} placeholder="email@exemple.com ou 123456789012345678" className={cx(inputClass, 'min-w-60 flex-1')} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pseudo (note)" className={cx(inputClass, 'w-40!')} />
          <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className={cx(inputClass, 'w-auto!')}>
            <option value="member">Membre</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit" variant="primary" disabled={!validIdent || invite.isPending}>
            Inviter
          </Button>
        </form>
      </Section>

      <Section title={`Membres (${members.data?.length ?? 0})`}>
        <ul className="divide-y divide-slate-800 rounded-xl ring-1 ring-slate-800">
          {(members.data ?? []).map((m: Member) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              {m.avatar_url ? (
                <img src={m.avatar_url} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="grid size-8 place-items-center rounded-full bg-slate-700 text-sm">{(m.display_name || '?')[0]}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {m.display_name || '—'} {m.id === me.id && <span className="text-xs text-slate-500">(toi)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {m.email} · depuis le {formatDay(m.created_at)}
                </p>
              </div>
              <select
                value={m.role}
                disabled={m.id === me.id}
                onChange={(e) => setMemberRole.mutate({ id: m.id, role: e.target.value as MemberRole })}
                className={cx(inputClass, 'w-auto! py-1')}
              >
                <option value="member">Membre</option>
                <option value="admin">Admin</option>
              </select>
              {m.id !== me.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300"
                  onClick={() => window.confirm(`Retirer ${m.display_name || m.email} ? Ses cartes sont conservées.`) && remove.mutate(m.id)}
                >
                  Retirer
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Liste blanche" hint="Les comptes autorisés à se connecter. Une invitation devient un membre à la première connexion.">
        <ul className="divide-y divide-slate-800 rounded-xl ring-1 ring-slate-800">
          {(allow.data ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {a.email ?? <span>Discord {a.discord_id}</span>}
                {a.note && <span className="text-slate-500"> · {a.note}</span>}
              </span>
              {a.email && memberEmails.has(a.email) ? (
                <Badge className="bg-emerald-500/15 text-emerald-200 ring-emerald-500/30">connecté</Badge>
              ) : (
                <Badge>en attente</Badge>
              )}
              <select
                value={a.role}
                onChange={(e) => setInviteRole.mutate({ id: a.id, role: e.target.value as MemberRole })}
                className={cx(inputClass, 'w-auto! py-1')}
              >
                <option value="member">Membre</option>
                <option value="admin">Admin</option>
              </select>
              <Button size="sm" variant="ghost" className="text-red-400" onClick={() => window.confirm('Révoquer cette invitation ?') && revoke.mutate(a.id)}>
                Révoquer
              </Button>
            </li>
          ))}
          {allow.data?.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Aucune invitation.</li>}
        </ul>
      </Section>
    </div>
  )
}
