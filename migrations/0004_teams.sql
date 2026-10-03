-- =====================================================================
-- Plusieurs équipes et rôles d'équipe
--   captain (capitaine) : joue et gère l'équipe
--   coach              : gère l'équipe, ne joue pas (pas de compétences)
--   player (joueur)    : joue
-- Capitaines et coachs gèrent les compétences de l'équipe et invitent des joueurs.
-- L'admin du site garde tous les droits. (members.team_id n'est plus utilisé.)
-- =====================================================================

CREATE TABLE team_members (
  team_id    INTEGER NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  member_id  TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('captain', 'coach', 'player')),
  added_by   TEXT REFERENCES members (id) ON DELETE SET NULL,
  joined_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (team_id, member_id)
);
CREATE INDEX team_members_member_idx ON team_members (member_id);

-- Reprise de l'existant : chaque membre rejoint son équipe (les admins en capitaines).
INSERT OR IGNORE INTO team_members (team_id, member_id, role)
SELECT team_id, id, CASE WHEN role = 'admin' THEN 'captain' ELSE 'player' END FROM members
 WHERE team_id IN (SELECT id FROM teams);

-- Invitation dans une équipe : à la première connexion, la personne rejoint l'équipe.
ALTER TABLE allowlist ADD COLUMN team_id INTEGER REFERENCES teams (id) ON DELETE SET NULL;
ALTER TABLE allowlist ADD COLUMN team_role TEXT CHECK (team_role IN ('captain', 'coach', 'player'));
ALTER TABLE allowlist ADD COLUMN invited_by TEXT REFERENCES members (id) ON DELETE SET NULL;
