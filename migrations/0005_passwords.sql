-- =====================================================================
-- Connexion par email + mot de passe ; fin de la connexion Discord.
--   * Le lien d'invitation (allowlist.invite_hash) devient un lien d'INSCRIPTION à usage unique :
--     la personne y choisit son pseudo, son email et son mot de passe.
--     Pour un membre déjà inscrit, le même lien sert à choisir un nouveau mot de passe.
--   * Les colonnes discord_id restent en base (SQLite ne supprime pas une colonne UNIQUE)
--     mais ne sont plus utilisées.
-- =====================================================================

-- Format : pbkdf2-sha256$<itérations>$<sel base64>$<hash base64>
ALTER TABLE members ADD COLUMN password_hash TEXT;
-- Anti force brute : verrouillage temporaire après plusieurs échecs.
ALTER TABLE members ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN locked_until TEXT;

CREATE INDEX members_email_idx ON members (email COLLATE NOCASE);
