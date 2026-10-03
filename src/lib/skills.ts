import type { Skill, SkillsData, SkillStatus } from './types'

export const STATUS_ORDER: SkillStatus[] = ['not_worked', 'to_work', 'acquired']

export const STATUS_LABEL: Record<SkillStatus, string> = {
  not_worked: 'Non travaillé',
  to_work: 'À travailler',
  acquired: 'Acquis',
}

/** Icône associée : le statut ne repose jamais sur la couleur seule. */
export const STATUS_ICON: Record<SkillStatus, string> = { not_worked: '○', to_work: '◐', acquired: '●' }

export type Counts = Record<SkillStatus, number>
const zero = (): Counts => ({ not_worked: 0, to_work: 0, acquired: 0 })

/** Index de lecture rapide des statuts. */
export function indexSkills(d: SkillsData) {
  const team = new Map(d.teamStatus.map((s) => [s.skill_id, s.status]))
  const member = new Map(d.memberStatus.map((s) => [`${s.member_id}:${s.skill_id}`, s.status]))
  return {
    teamStatus: (skillId: number): SkillStatus => team.get(skillId) ?? 'not_worked',
    memberStatus: (memberId: string, skillId: number): SkillStatus => member.get(`${memberId}:${skillId}`) ?? 'not_worked',
  }
}

export function activeSkills(d: SkillsData): Skill[] {
  return d.skills.filter((s) => !s.archived)
}

/** Répartition des joueurs pour une compétence. */
export function playerCounts(d: SkillsData, skillId: number): Counts {
  const ix = indexSkills(d)
  const c = zero()
  for (const p of d.players) c[ix.memberStatus(p.id, skillId)]++
  return c
}

/** Répartition des compétences (actives) pour un joueur. */
export function memberCounts(d: SkillsData, memberId: string): Counts {
  const ix = indexSkills(d)
  const c = zero()
  for (const s of activeSkills(d)) c[ix.memberStatus(memberId, s.id)]++
  return c
}

/**
 * Vue « À travailler » :
 * - les objectifs d'équipe (statut d'équipe « à travailler »), avec la progression des joueurs ;
 * - les objectifs individuels : ce qu'un joueur a « à travailler » en dehors des objectifs d'équipe.
 */
export function toWorkOverview(d: SkillsData) {
  const ix = indexSkills(d)
  const skills = activeSkills(d)
  const team = skills
    .filter((s) => ix.teamStatus(s.id) === 'to_work')
    .map((skill) => ({ skill, counts: playerCounts(d, skill.id) }))
  const teamIds = new Set(team.map((t) => t.skill.id))
  const individual = d.players
    .map((player) => ({
      player,
      skills: skills.filter((s) => !teamIds.has(s.id) && ix.memberStatus(player.id, s.id) === 'to_work'),
    }))
    .filter((x) => x.skills.length)
  return { team, individual }
}

/** Compétences regroupées par groupe (ordre des groupes, puis ordre interne). */
export function groupSkills(d: SkillsData, skills: Skill[] = activeSkills(d)) {
  const order = (a: { sort_order: number; name: string }, b: { sort_order: number; name: string }) =>
    a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'fr')
  const groups = [...d.groups].sort(order)
  const out = groups
    .map((g) => ({ id: g.id as number | null, name: g.name, skills: skills.filter((s) => s.group_id === g.id).sort(order) }))
    .filter((g) => g.skills.length)
  const known = new Set(groups.map((g) => g.id))
  const orphans = skills.filter((s) => s.group_id == null || !known.has(s.group_id)).sort(order)
  if (orphans.length) out.push({ id: null, name: 'Autres', skills: orphans })
  return out
}
