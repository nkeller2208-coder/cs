-- =====================================================================
-- Acquis des compétences, par joueur et par équipe
-- Trois statuts : not_worked (non travaillé), to_work (à travailler), acquired (acquis).
-- Passer une compétence « à travailler » au niveau de l'équipe la passe
-- « à travailler » chez tous les joueurs de l'équipe (géré par l'API).
-- =====================================================================

CREATE TABLE skill_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE skills (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id    INTEGER REFERENCES skill_groups (id) ON DELETE SET NULL,
  name        TEXT NOT NULL COLLATE NOCASE CHECK (trim(name) <> '' AND length(name) <= 100),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT REFERENCES members (id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (group_id, name)
);

CREATE TABLE team_skills (
  team_id     INTEGER NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  skill_id    INTEGER NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('not_worked', 'to_work', 'acquired')),
  updated_by  TEXT REFERENCES members (id) ON DELETE SET NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (team_id, skill_id)
);

CREATE TABLE member_skills (
  member_id   TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  skill_id    INTEGER NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('not_worked', 'to_work', 'acquired')),
  updated_by  TEXT REFERENCES members (id) ON DELETE SET NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (member_id, skill_id)
);
CREATE INDEX member_skills_skill_idx ON member_skills (skill_id);

-- Point de départ (modifiable par l'admin).
INSERT INTO skill_groups (name, sort_order) VALUES
  ('Mécaniques', 1), ('Utilitaire', 2), ('Communication', 3), ('Jeu d''équipe', 4), ('Connaissance des maps', 5);

INSERT INTO skills (group_id, name, description, sort_order) VALUES
  ((SELECT id FROM skill_groups WHERE name = 'Mécaniques'), 'Crosshair placement', 'Viser à hauteur de tête, pré-placer sur les angles probables.', 1),
  ((SELECT id FROM skill_groups WHERE name = 'Mécaniques'), 'Spray AK-47', 'Maîtriser les 10 premières balles du spray.', 2),
  ((SELECT id FROM skill_groups WHERE name = 'Mécaniques'), 'Counter-strafe', 'S''arrêter net avant de tirer.', 3),
  ((SELECT id FROM skill_groups WHERE name = 'Utilitaire'), 'Smokes d''exé de chaque map', 'Connaître les smokes d''exécution du map pool.', 1),
  ((SELECT id FROM skill_groups WHERE name = 'Utilitaire'), 'Pop-flash pour soi et pour un coéquipier', '', 2),
  ((SELECT id FROM skill_groups WHERE name = 'Communication'), 'Calls courts et précis', 'Nombre, position, état (« 2 B Apps, un lit »).', 1),
  ((SELECT id FROM skill_groups WHERE name = 'Jeu d''équipe'), 'Trade kill', 'Être en position de trader son coéquipier en moins de 2 s.', 1),
  ((SELECT id FROM skill_groups WHERE name = 'Jeu d''équipe'), 'Retakes à 3 et plus', 'Synchroniser l''utilitaire et l''entrée.', 2),
  ((SELECT id FROM skill_groups WHERE name = 'Connaissance des maps'), 'Callouts de toutes les maps', '', 1);
