-- Premier accès admin du site en ligne : un lien de connexion personnel valable jusqu'au 2 novembre 2026.
-- Seul le haché (SHA-256) du jeton figure ici ; le lien lui-même a été transmis au propriétaire.
-- Sans effet si un admin existe déjà. Une fois connecté, Admin → Membres permet de le révoquer.
INSERT INTO allowlist (note, role, invite_hash, invite_expires_at)
SELECT 'Admin', 'admin', 'aaa46ffcfb49cd65a5b1c25b4205839f9066e734dccbd4f51e200e8403fd9804', '2026-11-02T23:59:59.000Z'
 WHERE NOT EXISTS (SELECT 1 FROM allowlist WHERE role = 'admin');
