import { Hono } from 'hono'
import { requireAdmin } from './auth'
import { type AppEnv, all, fail, first, fixBools, now } from './env'

export const STATUSES = ['not_worked', 'to_work', 'acquired'] as const
type Status = (typeof STATUSES)[number]

function status(v: unknown): Status {
  if (!STATUSES.includes(v as Status)) fail(400, 'Statut invalide')
  return v as Status
}

export const skills = new Hono<AppEnv>()

/** Tout ce qu'il faut pour les écrans de compétences : liste, statuts d'équipe et des joueurs. */
skills.get('/', async (c) => {
  const db = c.env.DB
  const me = c.get('me')
  const teamId = (await first<{ team_id: number }>(db, 'SELECT team_id FROM members WHERE id = ?', me.id))?.team_id ?? 1
  const [team, groups, list, teamStatus, memberStatus, players] = await db.batch([
    db.prepare('SELECT id, name FROM teams WHERE id = ?').bind(teamId),
    db.prepare('SELECT * FROM skill_groups'),
    db.prepare('SELECT * FROM skills'),
    db.prepare('SELECT skill_id, status, updated_by, updated_at FROM team_skills WHERE team_id = ?').bind(teamId),
    db.prepare(`SELECT ms.member_id, ms.skill_id, ms.status, ms.updated_by, ms.updated_at
                  FROM member_skills ms JOIN members m ON m.id = ms.member_id WHERE m.team_id = ?`).bind(teamId),
    db.prepare('SELECT id, display_name, email, avatar_url, role FROM members WHERE team_id = ? ORDER BY display_name COLLATE NOCASE').bind(teamId),
  ])
  return c.json({
    team: team.results[0] ?? { id: teamId, name: 'Équipe' },
    groups: (groups.results as Record<string, unknown>[]).map(fixBools),
    skills: (list.results as Record<string, unknown>[]).map(fixBools),
    teamStatus: teamStatus.results,
    memberStatus: memberStatus.results,
    players: players.results,
  })
})

/**
 * Statut d'équipe (admin). Passer une compétence « à travailler » la passe
 * « à travailler » chez tous les joueurs de l'équipe.
 */
skills.put('/:id/team', requireAdmin, async (c) => {
  const db = c.env.DB
  const me = c.get('me')
  const skillId = Number(c.req.param('id'))
  const s = status((await c.req.json<{ status: unknown }>()).status)
  if (!(await first(db, 'SELECT id FROM skills WHERE id = ?', skillId))) fail(404, 'Compétence introuvable')
  const teamId = (await first<{ team_id: number }>(db, 'SELECT team_id FROM members WHERE id = ?', me.id))?.team_id ?? 1
  const ts = now()
  const stmts = [
    db.prepare(`INSERT INTO team_skills (team_id, skill_id, status, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (team_id, skill_id) DO UPDATE SET status = excluded.status, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
      .bind(teamId, skillId, s, me.id, ts),
  ]
  let propagated = 0
  if (s === 'to_work') {
    const players = await all<{ id: string }>(db, 'SELECT id FROM members WHERE team_id = ?', teamId)
    propagated = players.length
    for (const p of players) {
      stmts.push(
        db.prepare(`INSERT INTO member_skills (member_id, skill_id, status, updated_by, updated_at) VALUES (?, ?, 'to_work', ?, ?)
                    ON CONFLICT (member_id, skill_id) DO UPDATE SET status = 'to_work', updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
          .bind(p.id, skillId, me.id, ts),
      )
    }
  }
  await db.batch(stmts)
  return c.json({ ok: true, propagated })
})

/** Statut d'un joueur : le joueur lui-même ou un admin. */
skills.put('/:id/members/:memberId', async (c) => {
  const db = c.env.DB
  const me = c.get('me')
  const memberId = c.req.param('memberId')
  if (memberId !== me.id && me.role !== 'admin') fail(403, 'Tu ne peux modifier que tes propres compétences')
  const s = status((await c.req.json<{ status: unknown }>()).status)
  const skillId = Number(c.req.param('id'))
  if (!(await first(db, 'SELECT id FROM skills WHERE id = ?', skillId))) fail(404, 'Compétence introuvable')
  if (!(await first(db, 'SELECT id FROM members WHERE id = ?', memberId))) fail(404, 'Joueur introuvable')
  await db.prepare(`INSERT INTO member_skills (member_id, skill_id, status, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT (member_id, skill_id) DO UPDATE SET status = excluded.status, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(memberId, skillId, s, me.id, now()).run()
  return c.json({ ok: true })
})
