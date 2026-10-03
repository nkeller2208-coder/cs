-- =====================================================================
-- CS2 Playbook – schéma D1 (SQLite)
-- Les droits sont vérifiés par l'API (worker/) : la base n'est jamais
-- exposée directement au navigateur.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------ Accès

-- Liste blanche : une entrée = une personne autorisée (email et/ou id Discord).
CREATE TABLE allowlist (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT UNIQUE COLLATE NOCASE,
  discord_id   TEXT UNIQUE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  note         TEXT,
  -- Lien de connexion personnel (haché), pour se connecter sans Discord.
  invite_hash  TEXT UNIQUE,
  invite_expires_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (email IS NOT NULL OR discord_id IS NOT NULL OR note IS NOT NULL)
);

-- Une seule équipe pour l'instant ; le modèle permet d'en ajouter d'autres plus tard.
CREATE TABLE teams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE members (
  id            TEXT PRIMARY KEY,                    -- uuid
  allowlist_id  INTEGER UNIQUE REFERENCES allowlist (id) ON DELETE SET NULL,
  email         TEXT COLLATE NOCASE,
  discord_id    TEXT UNIQUE,
  display_name  TEXT NOT NULL DEFAULT '',
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  team_id       INTEGER NOT NULL DEFAULT 1 REFERENCES teams (id),
  last_values   TEXT NOT NULL DEFAULT '{}',          -- JSON : dernières valeurs du formulaire
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  member_id   TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX sessions_member_idx ON sessions (member_id);

-- ------------------------------------------------------------ Étiquettes

CREATE TABLE maps (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL REFERENCES maps (id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
  pending INTEGER NOT NULL DEFAULT 0,       -- « à valider » : proposée par un membre
  created_by TEXT REFERENCES members (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (map_id, name)
);
CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT, side TEXT NOT NULL CHECK (side IN ('CT', 'T')),
  name TEXT NOT NULL COLLATE NOCASE, sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (side, name)
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  shows_utility INTEGER NOT NULL DEFAULT 0,     -- « Stuff » : affiche le type d'utilitaire
  shows_round_type INTEGER NOT NULL DEFAULT 0,  -- « Round lancé » : affiche le type de round
  sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE risks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL DEFAULT '#64748b',
  sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE utilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE economies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE round_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE principle_themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ------------------------------------------------------------ Cartes

CREATE TABLE cards (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 100),
  description     TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 20000),
  map_id          INTEGER REFERENCES maps (id) ON DELETE RESTRICT,
  side            TEXT CHECK (side IN ('CT', 'T')),
  risk_id         INTEGER REFERENCES risks (id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'review')),
  review_comment  TEXT,
  review_by       TEXT REFERENCES members (id) ON DELETE SET NULL,
  author_id       TEXT REFERENCES members (id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by      TEXT REFERENCES members (id) ON DELETE SET NULL,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (status = 'draft' OR (trim(title) <> '' AND map_id IS NOT NULL AND side IS NOT NULL))
);
CREATE INDEX cards_status_idx ON cards (status);

CREATE TABLE card_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  url TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('youtube', 'image', 'link')),
  url_key TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX card_media_card_idx ON card_media (card_id);
CREATE INDEX card_media_key_idx ON card_media (url_key);

CREATE TABLE card_roles (card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE, role_id INTEGER NOT NULL REFERENCES roles (id) ON DELETE RESTRICT, PRIMARY KEY (card_id, role_id));
CREATE TABLE card_categories (card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE, category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT, PRIMARY KEY (card_id, category_id));
CREATE TABLE card_zones (card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE, zone_id INTEGER NOT NULL REFERENCES zones (id) ON DELETE CASCADE, PRIMARY KEY (card_id, zone_id));
CREATE TABLE card_utilities (card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE, utility_id INTEGER NOT NULL REFERENCES utilities (id) ON DELETE RESTRICT, PRIMARY KEY (card_id, utility_id));
CREATE TABLE card_economies (card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE, economy_id INTEGER NOT NULL REFERENCES economies (id) ON DELETE RESTRICT, PRIMARY KEY (card_id, economy_id));
CREATE TABLE card_round_types (card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE, round_type_id INTEGER NOT NULL REFERENCES round_types (id) ON DELETE RESTRICT, PRIMARY KEY (card_id, round_type_id));
CREATE INDEX card_roles_idx ON card_roles (role_id);
CREATE INDEX card_categories_idx ON card_categories (category_id);
CREATE INDEX card_zones_idx ON card_zones (zone_id);
CREATE INDEX card_utilities_idx ON card_utilities (utility_id);
CREATE INDEX card_economies_idx ON card_economies (economy_id);
CREATE INDEX card_round_types_idx ON card_round_types (round_type_id);

CREATE TABLE card_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  action TEXT NOT NULL,                                      -- create | update | status
  changed_by TEXT REFERENCES members (id) ON DELETE SET NULL,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  note TEXT,
  snapshot TEXT NOT NULL                                     -- JSON
);
CREATE INDEX card_history_card_idx ON card_history (card_id, changed_at);

-- ------------------------------------------------------------ Principes de jeu

CREATE TABLE principles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL CHECK (trim(title) <> '' AND length(title) <= 120),
  summary     TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 280),
  body        TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 20000),
  theme_id    INTEGER REFERENCES principle_themes (id) ON DELETE SET NULL,
  sides       TEXT NOT NULL DEFAULT '[]',                    -- JSON : ["CT","T"]
  pinned      INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  author_id   TEXT REFERENCES members (id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by  TEXT REFERENCES members (id) ON DELETE SET NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE principle_maps (principle_id INTEGER NOT NULL REFERENCES principles (id) ON DELETE CASCADE, map_id INTEGER NOT NULL REFERENCES maps (id) ON DELETE CASCADE, PRIMARY KEY (principle_id, map_id));
CREATE TABLE principle_roles (principle_id INTEGER NOT NULL REFERENCES principles (id) ON DELETE CASCADE, role_id INTEGER NOT NULL REFERENCES roles (id) ON DELETE CASCADE, PRIMARY KEY (principle_id, role_id));
CREATE TABLE principle_categories (principle_id INTEGER NOT NULL REFERENCES principles (id) ON DELETE CASCADE, category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE, PRIMARY KEY (principle_id, category_id));
CREATE TABLE principle_round_types (principle_id INTEGER NOT NULL REFERENCES principles (id) ON DELETE CASCADE, round_type_id INTEGER NOT NULL REFERENCES round_types (id) ON DELETE CASCADE, PRIMARY KEY (principle_id, round_type_id));
CREATE TABLE principle_cards (
  principle_id INTEGER NOT NULL REFERENCES principles (id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  linked_by TEXT REFERENCES members (id) ON DELETE SET NULL,
  linked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (principle_id, card_id)
);
CREATE INDEX principle_cards_card_idx ON principle_cards (card_id);
