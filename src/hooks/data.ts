import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchCards, fetchLastValues, fetchMembers, fetchPrinciples, fetchProfile, fetchTags } from '../lib/api'
import type { Card, Member, Tags } from '../lib/types'
import { useMember } from './auth'

export const qk = {
  tags: ['tags'] as const,
  cards: ['cards'] as const,
  members: ['members'] as const,
  lastValues: (id: string) => ['lastValues', id] as const,
  history: (id: number) => ['history', id] as const,
  principles: ['principles'] as const,
  profile: (id: string) => ['profile', id] as const,
  learning: (cardId: number) => ['learning', 'card', cardId] as const,
  teamLearning: (teamId: number) => ['learning', 'team', teamId] as const,
}

export const EMPTY_TAGS: Tags = {
  maps: [], zones: [], roles: [], categories: [], risks: [], utilities: [], economies: [], round_types: [], role_actions: [], sources: [], principle_themes: [], skill_groups: [],
}

export function useTags() {
  return useQuery({ queryKey: qk.tags, queryFn: fetchTags, staleTime: 60_000 })
}

export function useCards() {
  return useQuery({ queryKey: qk.cards, queryFn: fetchCards, staleTime: 15_000 })
}

export function usePrinciples() {
  return useQuery({ queryKey: qk.principles, queryFn: fetchPrinciples, staleTime: 30_000 })
}

export function useMembers() {
  return useQuery({ queryKey: qk.members, queryFn: fetchMembers, staleTime: 5 * 60_000 })
}

/** Espace perso du membre connecté (rôles en jeu, équipes, compétences). */
export function useProfile() {
  const me = useMember()
  return useQuery({ queryKey: qk.profile(me.id), queryFn: fetchProfile, staleTime: 60_000 })
}

/** Mes rôles en jeu (Pivot B, AWP…) : mise en avant de « mon » action sur les stratégies. */
export function useMyRoleIds(): number[] {
  const data = useProfile().data
  return useMemo(() => data?.role_ids ?? [], [data])
}

export function useLastValues() {
  const me = useMember()
  return useQuery({ queryKey: qk.lastValues(me.id), queryFn: () => fetchLastValues(me.id) })
}

/** Index id → étiquette, pour afficher rapidement les badges. */
export function useTagIndex(tags: Tags | undefined) {
  return useMemo(() => {
    const t = tags ?? EMPTY_TAGS
    const index = <T extends { id: number }>(list: T[]) => new Map(list.map((x) => [x.id, x]))
    return {
      maps: index(t.maps),
      zones: index(t.zones),
      roles: index(t.roles),
      categories: index(t.categories),
      risks: index(t.risks),
      utilities: index(t.utilities),
      economies: index(t.economies),
      round_types: index(t.round_types),
      role_actions: index(t.role_actions),
      sources: index(t.sources),
      principle_themes: index(t.principle_themes),
      skill_groups: index(t.skill_groups),
    }
  }, [tags])
}
export type TagIndex = ReturnType<typeof useTagIndex>

export function useMemberIndex() {
  const { data } = useMembers()
  return useMemo(() => new Map<string, Member>((data ?? []).map((m) => [m.id, m])), [data])
}

export function useInvalidateCards() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: qk.cards })
}

export function canEditCard(card: Pick<Card, 'author_id'>, me: Member) {
  return me.role === 'admin' || card.author_id === me.id
}
