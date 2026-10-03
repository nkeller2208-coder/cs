import { describe, expect, it } from 'vitest'
import { groupSkills, memberCounts, playerCounts, toWorkOverview } from './skills'
import type { SkillsData } from './types'

const skill = (id: number, group_id: number | null, extra = {}) => ({
  id, name: `S${id}`, group_id, description: '', sort_order: id, archived: false, created_by: null, ...extra,
})
const data: SkillsData = {
  teams: [{ id: 1, name: 'Équipe' }],
  team: { id: 1, name: 'Équipe' },
  my_role: 'captain',
  can_manage: true,
  groups: [
    { id: 1, name: 'Utilitaire', sort_order: 2, archived: false },
    { id: 2, name: 'Mécaniques', sort_order: 1, archived: false },
  ],
  skills: [skill(1, 1), skill(2, 2), skill(3, 2), skill(4, null), skill(5, 1, { archived: true })],
  teamStatus: [{ skill_id: 1, status: 'to_work', updated_by: null, updated_at: '' }],
  memberStatus: [
    { member_id: 'a', skill_id: 1, status: 'acquired', updated_by: null, updated_at: '' },
    { member_id: 'b', skill_id: 1, status: 'to_work', updated_by: null, updated_at: '' },
    { member_id: 'b', skill_id: 2, status: 'to_work', updated_by: null, updated_at: '' },
    { member_id: 'a', skill_id: 5, status: 'to_work', updated_by: null, updated_at: '' },
  ],
  players: [
    { id: 'a', display_name: 'A', email: null, avatar_url: null, team_role: 'captain' },
    { id: 'b', display_name: 'B', email: null, avatar_url: null, team_role: 'player' },
    { id: 'c', display_name: 'C', email: null, avatar_url: null, team_role: 'player' },
  ],
}

describe('compétences', () => {
  it('compte les joueurs par statut (non travaillé par défaut)', () => {
    expect(playerCounts(data, 1)).toEqual({ not_worked: 1, to_work: 1, acquired: 1 })
  })
  it('compte les compétences actives d’un joueur', () => {
    expect(memberCounts(data, 'b')).toEqual({ not_worked: 2, to_work: 2, acquired: 0 })
  })
  it('sépare objectifs d’équipe et objectifs individuels, sans compétences archivées', () => {
    const o = toWorkOverview(data)
    expect(o.team.map((t) => t.skill.id)).toEqual([1])
    expect(o.individual.map((i) => [i.player.id, i.skills.map((s) => s.id)])).toEqual([['b', [2]]])
  })
  it('regroupe dans l’ordre des groupes, « Autres » à la fin', () => {
    expect(groupSkills(data).map((g) => [g.name, g.skills.map((s) => s.id)])).toEqual([
      ['Mécaniques', [2, 3]],
      ['Utilitaire', [1]],
      ['Autres', [4]],
    ])
  })
})
