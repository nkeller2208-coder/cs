-- =====================================================================
-- Apprentissage du Playbook
--   * Le capitaine (ou coach, ou admin) fixe le statut d'une STRATÉGIE pour son équipe :
--     « à apprendre » ou « maîtrisée » (aucune ligne = non travaillée).
--   * Chaque membre note sur 5 son niveau sur chaque stratégie et chaque stuff.
-- =====================================================================

CREATE TABLE team_cards (
  team_id     INTEGER NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  card_id     INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('to_learn', 'learned')),
  set_by      TEXT REFERENCES members (id) ON DELETE SET NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (team_id, card_id)
);
CREATE INDEX team_cards_card_idx ON team_cards (card_id);

CREATE TABLE card_ratings (
  member_id   TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  card_id     INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (member_id, card_id)
);
CREATE INDEX card_ratings_card_idx ON card_ratings (card_id);
