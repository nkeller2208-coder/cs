import { Hono } from 'hono'
import { canView } from './cards'
import { type AppEnv, type Me, all, fail, first, now } from './env'
import { canManageTeam, teamRole } from './teams'

/**
 * Apprentissage du Playbook :
 *   PUT  /learning/cards/:id/rating       ma note (1 à 5, 0 = effacer) sur une stratégie ou un stuff
 *   PUT  /learning/cards/:id/team         statut d'équipe d'une stratégie (capitaine, coach, admin)
 *   GET  /learning/cards/:id              statut par équipe + notes des joueurs (mes équipes ; toutes pour l'admin)
 *   GET  /learning/teams/:id              tableau de bord d'une équipe : stratégies suivies × notes des joueurs
 */
export const learning = new Hono<AppEnv>()

export type TeamCardStatus = 'to_learn' | 'learned'
const STATUSES: TeamCardStatus[] = ['to_learn', 'learned']

/** Équipes visibles pour l'apprentissage : les siennes, toutes pour l'admin. */
async function visibleTeams(db: D1Database, me: Me) {
  return me.role === 'admin'
    ? all<{ id: number; name: string }>(db, 'SELECT id, name FROM teams ORDER BY name COLLATE NOCASE')
    : all<{ id: number; name: string }>(
        db,
        'SELECT t.id, t.name FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE tm.member_id = ? ORDER BY t.name COLLATE NOCASE',
        me.id,
      )
}

/** Joueurs d'une équipe (les coachs ne jouent pas : ils ne sont pas notés). */
async function players(db: D1Database, teamId: number) {
  return all<{ id: string; display_name: string; email: string | null; team_role: string }>(
    db,
    `SELECT m.id, m.display_name, m.email, tm.role AS team_role FROM team_members tm JOIN members m ON m.id = tm.member_id
      WHERE tm.team_id = ? AND tm.role <> 'coach'
      ORDER BY CASE tm.role WHEN 'captain' THEN 0 ELSE 1 END, m.display_name COLLATE NOCASE`,
    teamId,
  )
}

learning.put('/cards/:id/rating', async (c) => {
  const me = c.get('me')
  const id = Number(c.req.param('id'))
  const card = await canView(c.env.DB, id, me)
  if (!card) fail(404, 'Carte introuvable')
  const rating = Number((await c.req.json<{ rating?: number }>()).rating)
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) fail(400, 'Note invalide (0 à 5)')
  if (rating === 0) {
    await c.env.DB.prepare('DELETE FROM card_ratings WHERE member_id = ? AND card_id = ?').bind(me.id, id).run()
  } else {
    await c.env.DB.prepare(
      `INSERT INTO card_ratings (member_id, card_id, rating, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (member_id, card_id) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at`,
    ).bind(me.id, id, rating, now()).run()
  }
  return c.json({ ok: true })
})

learning.put('/cards/:id/team', async (c) => {
  const me = c.get('me')
  const id = Number(c.req.param('id'))
  const { team_id, status } = await c.req.json<{ team_id?: number; status?: string }>()
  const teamId = Number(team_id)
  if (!(await first(c.env.DB, 'SELECT id FROM teams WHERE id = ?', teamId))) fail(404, 'Équipe introuvable')
  if (!(await canManageTeam(c.env.DB, teamId, me))) fail(403, "Réservé aux capitaines et coachs de l'équipe")
  const card = await canView(c.env.DB, id, me)
  if (!card) fail(404, 'Carte introuvable')
  if (card.kind !== 'strategy') fail(400, "Seules les stratégies se mettent « à apprendre »")
  if (card.status === 'draft') fail(400, 'Un brouillon ne peut pas être mis à apprendre')
  if (status === 'none') {
    await c.env.DB.prepare('DELETE FROM team_cards WHERE team_id = ? AND card_id = ?').bind(teamId, id).run()
  } else {
    if (!STATUSES.includes(status as TeamCardStatus)) fail(400, 'Statut invalide')
    await c.env.DB.prepare(
      `INSERT INTO team_cards (team_id, card_id, status, set_by, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (team_id, card_id) DO UPDATE SET status = excluded.status, set_by = excluded.set_by, updated_at = excluded.updated_at`,
    ).bind(teamId, id, status, me.id, now()).run()
  }
  return c.json({ ok: true })
})

learning.get('/cards/:id', async (c) => {
  const me = c.get('me')
  const db = c.env.DB
  const id = Number(c.req.param('id'))
  const card = await canView(db, id, me)
  if (!card) fail(404, 'Carte introuvable')
  const mine = await first<{ rating: number }>(db, 'SELECT rating FROM card_ratings WHERE member_id = ? AND card_id = ?', me.id, id)
  const teams = []
  for (const t of await visibleTeams(db, me)) {
    const status = await first<{ status: TeamCardStatus }>(db, 'SELECT status FROM team_cards WHERE team_id = ? AND card_id = ?', t.id, id)
    const list = await players(db, t.id)
    const ratings = list.length
      ? await all<{ member_id: string; rating: number }>(
          db,
          `SELECT member_id, rating FROM card_ratings WHERE card_id = ? AND member_id IN (${list.map(() => '?').join(',')})`,
          id, ...list.map((p) => p.id),
        )
      : []
    teams.push({
      ...t,
      status: status?.status ?? null,
      can_manage: await canManageTeam(db, t.id, me),
      players: list.map((p) => ({ ...p, rating: ratings.find((r) => r.member_id === p.id)?.rating ?? null })),
    })
  }
  return c.json({ my_rating: mine?.rating ?? null, teams })
})

learning.get('/teams/:id', async (c) => {
  const me = c.get('me')
  const db = c.env.DB
  const teamId = Number(c.req.param('id'))
  if (!(await first(db, 'SELECT id FROM teams WHERE id = ?', teamId))) fail(404, 'Équipe introuvable')
  if (me.role !== 'admin' && !(await teamRole(db, teamId, me.id))) fail(403, "Réservé aux membres de l'équipe")
  const [list, cards, ratings] = await Promise.all([
    players(db, teamId),
    all<{ card_id: number; status: TeamCardStatus; title: string; map_id: number | null; side: string | null }>(
      db,
      `SELECT tc.card_id, tc.status, c.title, c.map_id, c.side FROM team_cards tc JOIN cards c ON c.id = tc.card_id
        WHERE tc.team_id = ? AND c.status <> 'draft' ORDER BY tc.status DESC, c.title COLLATE NOCASE`,
      teamId,
    ),
    all<{ member_id: string; card_id: number; rating: number }>(
      db,
      `SELECT r.member_id, r.card_id, r.rating FROM card_ratings r
         JOIN team_cards tc ON tc.card_id = r.card_id AND tc.team_id = ?
         JOIN team_members tm ON tm.member_id = r.member_id AND tm.team_id = ?`,
      teamId, teamId,
    ),
  ])
  return c.json({ can_manage: await canManageTeam(db, teamId, me), players: list, cards, ratings })
})
