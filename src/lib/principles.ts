import type { Card, Principle } from './types'
import { normalize } from './text'

/** Un principe sans aucune étiquette est « général » : il ne se rattache aux cartes qu'explicitement. */
export function isGeneral(p: Principle): boolean {
  return !p.sides.length && !p.map_ids.length && !p.role_ids.length && !p.category_ids.length && !p.round_type_ids.length
}

const hits = (wanted: (number | string)[], have: (number | string)[]) => !wanted.length || wanted.some((w) => have.includes(w))

/** Même logique que les filtres : ET entre familles, OU au sein d'une famille. */
export function principleMatchesCard(p: Principle, c: Card): boolean {
  if (isGeneral(p)) return false
  return (
    hits(p.sides, c.side ? [c.side] : []) &&
    hits(p.map_ids, c.map_id != null ? [c.map_id] : []) &&
    hits(p.role_ids, c.role_ids) &&
    hits(p.category_ids, c.category_ids) &&
    hits(p.round_type_ids, c.round_type_ids)
  )
}

/** Principes d'une carte : rattachés explicitement, puis concernés par ses étiquettes. */
export function principlesForCard(card: Card, principles: Principle[]) {
  const linked = principles.filter((p) => p.card_ids.includes(card.id))
  const matching = principles.filter((p) => !p.card_ids.includes(card.id) && principleMatchesCard(p, card))
  return { linked, matching }
}

/** Cartes d'un principe (hors brouillons des autres, déjà filtrés par la RLS). */
export function cardsForPrinciple(p: Principle, cards: Card[]) {
  const visible = cards.filter((c) => c.status !== 'draft')
  const linked = visible.filter((c) => p.card_ids.includes(c.id))
  const matching = visible.filter((c) => !p.card_ids.includes(c.id) && principleMatchesCard(p, c))
  return { linked, matching }
}

/** Lien vers la grille filtrée sur les étiquettes du principe. */
export function principleFilterHref(p: Principle): string {
  const q = new URLSearchParams()
  if (p.map_ids.length) q.set('map', p.map_ids.join(','))
  if (p.sides.length) q.set('side', p.sides.join(','))
  if (p.role_ids.length) q.set('role', p.role_ids.join(','))
  if (p.category_ids.length) q.set('cat', p.category_ids.join(','))
  if (p.round_type_ids.length) q.set('round', p.round_type_ids.join(','))
  return `/?${q}`
}

export function searchPrinciple(p: Principle, q: string): boolean {
  const terms = normalize(q).split(' ').filter(Boolean)
  const hay = normalize(`${p.title} ${p.summary} ${p.body}`)
  return terms.every((t) => hay.includes(t))
}
