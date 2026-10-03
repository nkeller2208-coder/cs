import { Hono } from 'hono'
import { requireAdmin } from './auth'
import { sqlError } from './tags'
import { type AppEnv, type Me, all, fail, first, randomToken, sha256 } from './env'

export type TeamRole = 'captain' | 'coach' | 'player'
export const TEAM_ROLES: TeamRole[] = ['captain', 'coach', 'player']
const INVITE_DAYS = 7

export async function teamRole(db: D1Database, teamId: number, memberId: string): Promise<TeamRole | null> {
  return (await first<{ role: TeamRole }>(db, 'SELECT role FROM team_members WHERE team_id = ? AND member_id = ?', teamId, memberId))?.role ?? null
}

/** Admin du site, ou capitaine / coach de l'équipe. */
export async function canManageTeam(db: D1Database, teamId: number, me: Me): Promise<boolean> {
  if (me.role === 'admin') return true
  const r = await teamRole(db, teamId, me.id)
  return r === 'captain' || r === 'coach'
}

async function requireManager(db: D1Database, teamId: number, me: Me) {
  if (!(await first(db, 'SELECT id FROM teams WHERE id = ?', teamId))) fail(404, 'Équipe introuvable')
  if (!(await canManageTeam(db, teamId, me))) fail(403, "Réservé aux capitaines et coachs de l'équipe")
}

function role(v: unknown): TeamRole {
  if (!TEAM_ROLES.includes(v as TeamRole)) fail(400, 'Rôle invalide')
  return v as TeamRole
}

async function makeLink(db: D1Database, entryId: number, url: string) {
  const token = randomToken()
  const expires = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString()
  await db.prepare('UPDATE allowlist SET invite_hash = ?, invite_expires_at = ? WHERE id = ?').bind(await sha256(token), expires, entryId).run()
  return { url: new URL(`/api/auth/invite/${token}`, url).toString(), expires_at: expires }
}

export const teams = new Hono<AppEnv>()

/** Toutes les équipes, leurs membres, et les invitations en attente des équipes que je gère. */
teams.get('/', async (c) => {
  const db = c.env.DB
  const me = c.get('me')
  const [list, members, invites] = await db.batch([
    db.prepare('SELECT id, name, created_at FROM teams ORDER BY name COLLATE NOCASE'),
    db.prepare(`SELECT tm.team_id, tm.member_id, tm.role, tm.joined_at, m.display_name, m.avatar_url, m.email
                  FROM team_members tm JOIN members m ON m.id = tm.member_id
                 ORDER BY CASE tm.role WHEN 'captain' THEN 0 WHEN 'coach' THEN 1 ELSE 2 END, m.display_name COLLATE NOCASE`),
    db.prepare(`SELECT a.id, a.team_id, a.team_role, a.note, a.email, a.discord_id, a.invite_expires_at, a.created_at
                  FROM allowlist a LEFT JOIN members m ON m.allowlist_id = a.id
                 WHERE a.team_id IS NOT NULL AND m.id IS NULL`),
  ])
  const managed = new Set<number>()
  for (const t of list.results as { id: number }[]) if (await canManageTeam(db, t.id, me)) managed.add(t.id)
  return c.json(
    (list.results as { id: number; name: string; created_at: string }[]).map((t) => ({
      ...t,
      can_manage: managed.has(t.id),
      members: (members.results as { team_id: number }[]).filter((m) => m.team_id === t.id),
      invites: managed.has(t.id) ? (invites.results as { team_id: number }[]).filter((i) => i.team_id === t.id) : [],
    })),
  )
})

/** Créer une équipe (admin), avec éventuellement son capitaine. */
teams.post('/', requireAdmin, async (c) => {
  const { name, captain_id } = await c.req.json<{ name?: string; captain_id?: string }>()
  const n = String(name ?? '').trim()
  if (!n || n.length > 60) fail(400, "Nom d'équipe invalide (60 caractères max)")
  const row = await first<{ id: number }>(c.env.DB, 'INSERT INTO teams (name) VALUES (?) RETURNING id', n).catch(sqlError)
  if (captain_id) {
    await c.env.DB.prepare("INSERT INTO team_members (team_id, member_id, role, added_by) VALUES (?, ?, 'captain', ?)")
      .bind(row!.id, captain_id, c.get('me').id).run().catch(sqlError)
  }
  return c.json(row)
})

teams.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await requireManager(c.env.DB, id, c.get('me'))
  const n = String((await c.req.json<{ name?: string }>()).name ?? '').trim()
  if (!n || n.length > 60) fail(400, "Nom d'équipe invalide (60 caractères max)")
  await c.env.DB.prepare('UPDATE teams SET name = ? WHERE id = ?').bind(n, id).run().catch(sqlError)
  return c.json({ ok: true })
})

teams.delete('/:id', requireAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(Number(c.req.param('id'))).run()
  return c.json({ ok: true })
})

/** Ajouter un membre existant du site à l'équipe, ou changer son rôle. */
teams.put('/:id/members/:memberId', async (c) => {
  const db = c.env.DB
  const me = c.get('me')
  const id = Number(c.req.param('id'))
  const memberId = c.req.param('memberId')
  await requireManager(db, id, me)
  const r = role((await c.req.json<{ role?: string }>()).role ?? 'player')
  if (!(await first(db, 'SELECT id FROM members WHERE id = ?', memberId))) fail(404, 'Membre introuvable')
  // Un capitaine ne peut pas se rétrograder s'il est le dernier à gérer l'équipe.
  if (memberId === me.id && r === 'player' && me.role !== 'admin') {
    const others = await first<{ n: number }>(db, "SELECT COUNT(*) AS n FROM team_members WHERE team_id = ? AND member_id <> ? AND role IN ('captain', 'coach')", id, me.id)
    if (!others?.n) fail(400, "Nomme d'abord un autre capitaine ou coach")
  }
  await db.prepare(`INSERT INTO team_members (team_id, member_id, role, added_by) VALUES (?, ?, ?, ?)
                    ON CONFLICT (team_id, member_id) DO UPDATE SET role = excluded.role`).bind(id, memberId, r, me.id).run()
  return c.json({ ok: true })
})

/** Retirer quelqu'un de l'équipe (gestionnaire), ou la quitter soi-même. */
teams.delete('/:id/members/:memberId', async (c) => {
  const db = c.env.DB
  const me = c.get('me')
  const id = Number(c.req.param('id'))
  const memberId = c.req.param('memberId')
  if (memberId !== me.id) await requireManager(db, id, me)
  await db.prepare('DELETE FROM team_members WHERE team_id = ? AND member_id = ?').bind(id, memberId).run()
  return c.json({ ok: true })
})

/**
 * Inviter un nouveau joueur dans l'équipe : il est ajouté à la liste blanche du site et
 * rejoint l'équipe à sa première connexion. Renvoie son lien de connexion personnel.
 * S'il est déjà membre du site (même ID Discord / email), il est ajouté directement.
 */
teams.post('/:id/invites', async (c) => {
  const db = c.env.DB
  const me = c.get('me')
  const id = Number(c.req.param('id'))
  await requireManager(db, id, me)
  const b = await c.req.json<{ note?: string; email?: string; discord_id?: string; role?: string }>()
  const r = role(b.role ?? 'player')
  if (r !== 'player' && me.role !== 'admin' && (await teamRole(db, id, me.id)) !== 'captain') fail(403, 'Seul un capitaine peut nommer un capitaine ou un coach')
  const note = b.note?.trim().slice(0, 60) || null
  const email = b.email?.trim().toLowerCase() || null
  const discord = b.discord_id?.trim() || null
  if (!note && !email && !discord) fail(400, 'Indique au moins un pseudo')
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Email invalide')
  if (discord && !/^\d{15,21}$/.test(discord)) fail(400, 'Identifiant Discord invalide (15 à 21 chiffres)')

  const existing = await first<{ id: number; member_id: string | null }>(
    db,
    `SELECT a.id, m.id AS member_id FROM allowlist a LEFT JOIN members m ON m.allowlist_id = a.id
      WHERE (? IS NOT NULL AND a.email = ? COLLATE NOCASE) OR (? IS NOT NULL AND a.discord_id = ?) LIMIT 1`,
    email, email, discord, discord,
  )
  if (existing?.member_id) {
    await db.prepare(`INSERT INTO team_members (team_id, member_id, role, added_by) VALUES (?, ?, ?, ?)
                      ON CONFLICT (team_id, member_id) DO UPDATE SET role = excluded.role`).bind(id, existing.member_id, r, me.id).run()
    return c.json({ added: true })
  }
  let entryId = existing?.id
  if (entryId) {
    await db.prepare('UPDATE allowlist SET team_id = ?, team_role = ?, note = COALESCE(?, note) WHERE id = ?').bind(id, r, note, entryId).run()
  } else {
    const row = await first<{ id: number }>(db,
      "INSERT INTO allowlist (email, discord_id, note, role, team_id, team_role, invited_by) VALUES (?, ?, ?, 'member', ?, ?, ?) RETURNING id",
      email, discord, note, id, r, me.id).catch(sqlError)
    entryId = row!.id
  }
  return c.json({ added: false, entry_id: entryId, ...(await makeLink(db, entryId, c.req.url)) })
})

/** Nouveau lien pour une invitation en attente de l'équipe. */
teams.post('/:id/invites/:entryId/link', async (c) => {
  const db = c.env.DB
  const id = Number(c.req.param('id'))
  await requireManager(db, id, c.get('me'))
  const entryId = Number(c.req.param('entryId'))
  if (!(await first(db, 'SELECT id FROM allowlist WHERE id = ? AND team_id = ?', entryId, id))) fail(404, 'Invitation introuvable')
  return c.json(await makeLink(db, entryId, c.req.url))
})

/** Annuler une invitation en attente (la personne n'a pas encore rejoint). */
teams.delete('/:id/invites/:entryId', async (c) => {
  const db = c.env.DB
  const id = Number(c.req.param('id'))
  await requireManager(db, id, c.get('me'))
  await db.prepare(`DELETE FROM allowlist WHERE id = ? AND team_id = ?
                      AND NOT EXISTS (SELECT 1 FROM members WHERE allowlist_id = allowlist.id)`).bind(Number(c.req.param('entryId')), id).run()
  return c.json({ ok: true })
})

export async function myTeams(db: D1Database, me: Me) {
  return me.role === 'admin'
    ? all<{ id: number; name: string }>(db, 'SELECT id, name FROM teams ORDER BY name COLLATE NOCASE')
    : all<{ id: number; name: string }>(db, 'SELECT t.id, t.name FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE tm.member_id = ? ORDER BY t.name COLLATE NOCASE', me.id)
}
