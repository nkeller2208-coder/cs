-- =====================================================================
-- Source d'une carte : d'où vient le contenu (chaîne, coach, site…).
-- Liste complétée au fur et à mesure : tout membre peut ajouter une source depuis le formulaire ;
-- l'admin la renomme, l'archive ou lui associe un lien (Admin → Sources).
-- =====================================================================

CREATE TABLE sources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- Lien facultatif (chaîne YouTube, site…).
  url         TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT REFERENCES members (id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO sources (name, sort_order) VALUES ('Devil', 1), ('Le Repère', 2);

ALTER TABLE cards ADD COLUMN source_id INTEGER REFERENCES sources (id) ON DELETE SET NULL;
CREATE INDEX cards_source_idx ON cards (source_id);
