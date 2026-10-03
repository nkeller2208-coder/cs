-- =====================================================================
-- Stratégies et stuff, actions par rôle, rôles des joueurs
--   * Chaque carte est une STRATÉGIE ou un STUFF (cards.kind).
--     La catégorie « Stuff » (shows_utility) devient inutile : ses cartes passent en stuff.
--   * Dans une stratégie, chaque rôle reçoit une action (Support, Lurk, Fight…) + une note.
--   * Une stratégie peut rattacher des cartes stuff (éventuellement lancées par un rôle donné).
--   * Chaque membre indique ses rôles en jeu (mise en avant de « son » action sur les stratégies).
-- =====================================================================

ALTER TABLE cards ADD COLUMN kind TEXT NOT NULL DEFAULT 'strategy' CHECK (kind IN ('strategy', 'stuff'));
CREATE INDEX cards_kind_idx ON cards (kind);

-- Reprise de l'existant : une carte dont la seule catégorie est « Stuff » devient un stuff.
-- (Une carte « Stuff + Routine », par exemple, reste une stratégie.)
UPDATE cards SET kind = 'stuff'
 WHERE id IN (SELECT card_id FROM card_categories WHERE category_id IN (SELECT id FROM categories WHERE shows_utility = 1))
   AND id NOT IN (SELECT card_id FROM card_categories WHERE category_id IN (SELECT id FROM categories WHERE shows_utility = 0));
DELETE FROM card_categories WHERE category_id IN (SELECT id FROM categories WHERE shows_utility = 1);
UPDATE categories SET archived = 1 WHERE shows_utility = 1;

-- ------------------------------------------------------------ Actions des rôles (liste éditable par l'admin)

CREATE TABLE role_actions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- 0 : « Non concerné » (le rôle ne participe pas à la stratégie).
  involved    INTEGER NOT NULL DEFAULT 1,
  color       TEXT NOT NULL DEFAULT '#64748b',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO role_actions (name, involved, color, sort_order) VALUES
  ('Entry', 1, '#ef4444', 1), ('Fight', 1, '#f97316', 2), ('Trade', 1, '#f59e0b', 3), ('Support', 1, '#22c55e', 4),
  ('Lurk', 1, '#a855f7', 5), ('Ancre', 1, '#3b82f6', 6), ('Rotation', 1, '#06b6d4', 7), ('Info', 1, '#14b8a6', 8),
  ('Non concerné', 0, '#64748b', 9);

CREATE TABLE card_role_actions (
  card_id    INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  role_id    INTEGER NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  action_id  INTEGER NOT NULL REFERENCES role_actions (id) ON DELETE RESTRICT,
  note       TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  PRIMARY KEY (card_id, role_id)
);
CREATE INDEX card_role_actions_action_idx ON card_role_actions (action_id);

-- ------------------------------------------------------------ Stuffs d'une stratégie

CREATE TABLE strategy_stuff (
  strategy_id  INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  stuff_id     INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  -- Rôle qui lance ce stuff dans la stratégie (facultatif).
  role_id      INTEGER REFERENCES roles (id) ON DELETE SET NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (strategy_id, stuff_id)
);
CREATE INDEX strategy_stuff_stuff_idx ON strategy_stuff (stuff_id);

-- ------------------------------------------------------------ Rôles en jeu de chaque membre

CREATE TABLE member_roles (
  member_id  TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  role_id    INTEGER NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  PRIMARY KEY (member_id, role_id)
);
