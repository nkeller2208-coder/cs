import { Hono } from 'hono'
import { canManageTeam, myTeams } from './teams'
import { type AppEnv, fail, first, fixBools, now } from './env'

export const STATUSES = ['not_worked', 'to_work', 'acquired'] as const
type Status = (typeof STATUSES)[number]

function status(v: unknown): Status {
  if (!STATUSES.includes(v as Status)) fail(400, 'Statut invalide')
  return v as Status
}

export const skills = new Hono<AppEnv>()

/**
 * Données d'une équipe (?team=ID, par défaut la première de l'utilisateur) :
 * liste des compétences, statut d'équipe, statut de chaque joueur (capitaines et joueurs ; pas les coachs).
 */
skills.get('/', async (c) => {
  const db = c.env.DB
  const me = c.get('me')
  const teams = await myTeams(db, me)
  const groupsAndSkills = await db.batch([db.prepare('SELECT * FROM skill_groups'), db.prepare('SELECT * FROM skills')])
  const base = {
    teams,
    groups: (groupsAndSkills[0].results as Record<string, unknown>[]).map(fixBools),
    skills: (groupsAndSkills[1].results as Record<string, unknown>[]).map(fixBools),
  }
  const wanted = Number(c.req.query('team') ?? 0)
  const team = teams.find((t) => t.id === wanted) ?? teams[0]
  if (!team) return c.json({ ...base, team: null, can_manage: false, my_role: null, teamStatus: [], memberStatus: [], players: [] })

  const [teamStatus, memberStatus, players] = await db.batch([
    db.prepare('SELECT skill_id, status, updated_by, updated_at FROM team_skills WHERE team_id = ?').bind(team.id),
    db.prepare(`SELECT ms.member_id, ms.skill_id, ms.status, ms.updated_by, ms.updated_at
                  FROM member_skills ms JOIN team_members tm ON tm.member_id = ms.member_id
                 WHERE tm.team_id = ? AND tm.role <> 'coach'`).bind(team.id),
    db.prepare(`SELECT m.id, m.display_name, m.email, m.avatar_url, tm.role AS team_role
                  FROM team_members tm JOIN members m ON m.id = tm.member_id
                 WHERE tm.team_id = ? AND tm.role <> 'coach'
                 ORDER BY CASE tm.role WHEN 'captain' THEN 0 ELSE 1 END, m.display_name COLLATE NOCASE`).bind(team.id),
  ])
  const myRole = (await first<{ role: string }>(db, 'SELECT role FROM team_members WHERE team_id = ? AND member_id = ?', team.id, me.id))?.role ?? null
  return c.json({
    ...base,
    team,
    my_role: myRole,
    can_manage: await canManageTeam(db, team.id, me),
    teamStatus: teamStatus.results,
    memberStatus: memberStatus.results,
    players: players.results,
  })
})

/**
 * Statut d'équipe (capitaine, coach ou admin). Passer une compétence « à travailler »
 * la passe « à travailler » chez tous les joueurs de l'équipe.
 */
skills.put('/:id/team', async (c) => {
  const db = c.env.DB
  const me = c.get('me')
  const skillId = Number(c.req.param('id'))
  const body = await c.req.json<{ status: unknown; team_id: unknown }>()
  const s = status(body.status)
  const teamId = Number(body.team_id)
  if (!(await first(db, 'SELECT id FROM teams WHERE id = ?', teamId))) fail(404, 'Équipe introuvable')
  if (!(await canManageTeam(db, teamId, me))) fail(403, "Réservé aux capitaines et coachs de l'équipe")
  if (!(await first(db, 'SELECT id FROM skills WHERE id = ?', skillId))) fail(404, 'Compétence introuvable')
  const ts = now()
  const stmts = [
    db.prepare(`INSERT INTO team_skills (team_id, skill_id, status, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (team_id, skill_id) DO UPDATE SET status = excluded.status, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
      .bind(teamId, skillId, s, me.id, ts),
  ]
  let propagated = 0
  if (s === 'to_work') {
    const players = (await db.prepare("SELECT member_id FROM team_members WHERE team_id = ? AND role <> 'coach'").bind(teamId).all<{ member_id: string }>()).results
    propagated = players.length
    for (const p of players) {
      stmts.push(
        db.prepare(`INSERT INTO member_skills (member_id, skill_id, status, updated_by, updated_at) VALUES (?, ?, 'to_work', ?, ?)
                    ON CONFLICT (member_id, skill_id) DO UPDATE SET status = 'to_work', updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
          .bind(p.member_id, skillId, me.id, ts),
      )
    }
  }
  await db.batch(stmts)
  return c.json({ ok: true, propagated })
})

/** Statut d'un joueur : lui-même, un capitaine/coach d'une de ses équipes, ou l'admin. */
skills.put('/:id/members/:memberId', async (c) => {
  const db = c.env.DB
  const me = c.get('me')
  const memberId = c.req.param('memberId')
  if (memberId !== me.id && me.role !== 'admin') {
    const shared = await first(db,
      `SELECT 1 FROM team_members mine JOIN team_members theirs ON theirs.team_id = mine.team_id
        WHERE mine.member_id = ? AND mine.role IN ('captain', 'coach') AND theirs.member_id = ?`, me.id, memberId)
    if (!shared) fail(403, 'Tu ne peux modifier que tes compétences (ou celles des joueurs de ton équipe si tu es capitaine)')
  }
  const s = status((await c.req.json<{ status: unknown }>()).status)
  const skillId = Number(c.req.param('id'))
  if (!(await first(db, 'SELECT id FROM skills WHERE id = ?', skillId))) fail(404, 'Compétence introuvable')
  if (!(await first(db, 'SELECT id FROM members WHERE id = ?', memberId))) fail(404, 'Joueur introuvable')
  await db.prepare(`INSERT INTO member_skills (member_id, skill_id, status, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT (member_id, skill_id) DO UPDATE SET status = excluded.status, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(memberId, skillId, s, me.id, now()).run()
  return c.json({ ok: true })
})
