# CS2 Playbook – base de connaissances d'équipe

Application web privée pour stocker, étiqueter et retrouver les contenus tactiques de l'équipe
(vidéos YouTube, images, textes) sous forme de cartes filtrables.

**Stack** : React 19 + TypeScript + Tailwind 4 (Vite) · Supabase (Postgres + Auth + RLS) · hébergement Vercel ou Netlify.

---

## Fonctionnalités

| Cahier des charges | Où |
|---|---|
| Accès restreint, Discord OAuth ou lien magique, liste blanche | `src/pages/LoginPage.tsx`, RPC `claim_membership` |
| Rôles Admin / Membre, RLS sur toutes les tables | `supabase/migrations/…_init.sql` |
| Grille responsive, badges colorés (CT bleu, T orange, risque vert → rouge) | `src/components/CardTile.tsx` |
| Vue détaillée en modale, URL propre `/c/:id` partageable | `src/pages/CardDetail.tsx` |
| Filtres ET entre familles / OU dans une famille, compteurs par option, filtres conditionnels (rôles ← side, zones ← map), recherche plein texte, tri, filtres dans l'URL | `src/lib/filters.ts`, `src/components/FilterPanel.tsx` |
| Formulaire en clics : détection YouTube/image/lien, aperçu, titre YouTube (oEmbed), « début à mm:ss », anti-doublon, réordonnancement | `src/pages/CardFormPage.tsx`, `src/components/MediaField.tsx` |
| « + Ajouter » (en-tête, bouton flottant mobile, touche **N**), pré-rempli depuis les filtres actifs | `src/components/Layout.tsx` |
| « + Nouvelle zone » depuis le formulaire (marquée « à valider ») ; validation / renommage / fusion par l'admin | `ZonePicker`, `src/pages/AdminPage.tsx`, RPC `merge_zones` |
| « Enregistrer et en créer une autre », Dupliquer, dernières valeurs mémorisées | `src/lib/cardForm.ts`, table `member_prefs` |
| Sauvegarde auto (locale immédiate + brouillon serveur), statuts Brouillon / Publié / À revoir | `CardFormPage`, RPC `flag_card_for_review` |
| Validation en ligne sans perte de saisie | `validate()` dans `src/lib/cardForm.ts` + contrôle serveur dans `save_card` |
| Import CSV avec prévisualisation et modèle téléchargeable | `src/pages/ImportPage.tsx`, `src/lib/csvImport.ts` |
| Historique des modifications | table `card_history`, diff lisible dans `src/lib/history.ts` |
| Administration des listes (ajouter, renommer, réordonner, archiver) et des membres | `src/pages/AdminPage.tsx` |
| **Tableau de bord** : indicateurs, activité, couverture map × rôle (trous cliquables), catégories, types de contenu, risque, contributeurs, file « À revoir » | `src/pages/DashboardPage.tsx`, `src/lib/stats.ts` |
| **Rounds lancés** : catégorie « Round lancé » avec sous-choix Rush / Déclic / Strat / Default / Exé / Fake / Split / Contact (liste éditable), catégorie « Post-plant » | `20261002000000_rounds_principles.sql`, formulaire, filtres |
| **Principes de jeu** : fiches de doctrine classées par thème, rattachées à des étiquettes (side, map, rôle, catégorie, type de round) et/ou à des cartes précises ; affichées sur les cartes concernées | `src/pages/PrinciplesPage.tsx`, `src/lib/principles.ts` |
| **Cartes de démo** : 13 cartes et 4 principes de test chargées / supprimées en un clic (Admin → Démo) | `src/lib/demo.ts` |

Raccourcis : **N** nouvelle carte · **← / →** carte précédente / suivante dans la vue détaillée · **Ctrl/⌘ + Entrée** publier · **Ctrl/⌘ + B / I** gras / italique.

---

## Mise en route

### 1. Projet Supabase

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Applique les migrations dans l'ordre, au choix :
   - **SQL Editor** : colle et exécute, dans l'ordre, `20260930000000_init.sql`, `20260930000100_seed_tags.sql`
     `20261001000000_hardening.sql` puis `20261002000000_rounds_principles.sql` (dossier `supabase/migrations/`) ;
   - **CLI** : `supabase link --project-ref <ref>` puis `supabase db push`.
3. **Authentication → URL Configuration** : mets l'URL du site (ex. `https://playbook.vercel.app`) dans *Site URL*
   et ajoute-la (plus `http://localhost:5173` pour le dev) dans *Redirect URLs*.

### 2. Connexion Discord (recommandé)

1. [Discord Developer Portal](https://discord.com/developers/applications) → *New Application* → *OAuth2*.
2. Ajoute la *Redirect* : `https://<ref>.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Providers → Discord** : active-le avec le *Client ID* et le *Client Secret*.

Le lien magique par email fonctionne sans configuration supplémentaire (serveur SMTP Supabase par défaut,
limité en volume : configure ton propre SMTP pour un usage régulier). Pour n'utiliser que le lien magique,
mets `VITE_AUTH_DISCORD=false`.

### 3. Premier admin

La liste blanche est vide au départ. Dans le SQL Editor :

```sql
insert into public.allowlist (email, role) values ('ton.email@exemple.com', 'admin');
-- ou avec l'identifiant Discord (Mode développeur → clic droit sur ton profil → Copier l'identifiant)
insert into public.allowlist (discord_id, role) values ('123456789012345678', 'admin');
```

Connecte-toi : la fiche membre est créée automatiquement. Les invitations suivantes se font depuis **Admin → Membres**.

### 3 bis. Cartes de test

Sur une base vide, l'admin voit un bouton **« Charger les cartes de démo »** (aussi dans **Admin → Démo**).
Il crée 13 cartes et 4 principes « [Démo] … » qui couvrent chaque cas : vidéo YouTube avec début, Short vertical,
image directe, image cassée, lien externe, plusieurs médias, texte seul mis en forme, brouillon privé,
carte « À revoir », rounds lancés (rush, déclic), post-plant, principes généraux ou rattachés par étiquettes.
Un bouton les supprime tous une fois les vérifications faites.

### Principes de jeu

Menu **Principes** : la doctrine de l'équipe, classée par thème (liste éditable dans Admin → Thèmes).
Un principe peut :
- **porter des étiquettes** (side, maps, rôles, catégories, types de round) : il s'affiche alors automatiquement
  sur toutes les cartes qui correspondent (ET entre familles, OU dans une famille, comme les filtres) ;
- **être rattaché à des cartes précises**, depuis le principe ou depuis la vue détaillée d'une carte
  (« + Rattacher un principe », « Créer depuis cette carte ») ;
- rester **général** (aucune étiquette) : il n'apparaît que sur les cartes rattachées à la main.

L'auteur et les admins modifient un principe ; tout membre peut rattacher ou détacher une carte.

> Une personne absente de la liste blanche peut s'authentifier auprès de Supabase, mais n'a accès à rien :
> toutes les tables sont protégées par RLS (`is_member()`), et l'application affiche « Accès non autorisé ».

### 4. Lancer en local

```bash
cp .env.example .env.local   # renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (Settings → API)
npm install
npm run dev                  # http://localhost:5173
```

### 5. Déployer

- **Vercel** : importe le dépôt, framework *Vite*, ajoute les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
  `vercel.json` gère le routage SPA.
- **Netlify** : même principe ; `netlify.toml` contient la commande de build et la redirection SPA.

Pense à ajouter l'URL de production dans les *Redirect URLs* Supabase.

Les deux configurations envoient des en-têtes de sécurité (CSP, `X-Frame-Options`, `nosniff`, `noindex`).
La CSP autorise `*.supabase.co` : si tu utilises un domaine Supabase personnalisé, ajoute-le à `connect-src`.

---

## Modèle de données

```
maps ─┬─< zones                       roles (side CT/T)   categories (shows_utility)
      │                               risks (color)       utilities     economies
cards ┼─< card_media (url, kind, url_key, position)
      ├─< card_roles >─ roles          ├─< card_zones >─ zones
      ├─< card_categories >─ categories├─< card_utilities >─ utilities
      ├─< card_economies >─ economies  └─< card_history (instantané JSON par modification)
      └─< card_round_types >─ round_types     (si catégorie « Round lancé » : categories.shows_round_type)
members (role admin|member) ─ member_prefs (dernières valeurs)      allowlist (email | discord_id)

principle_themes ─< principles (title, summary, body, sides[], pinned)
principles ─< principle_maps / principle_roles / principle_categories / principle_round_types
principles ─< principle_cards >─ cards   (rattachements explicites)
```

- Les listes d'étiquettes ont `sort_order` et `archived` : une valeur archivée reste sur les cartes mais n'est plus proposée.
- `cards.status` : `draft` (visible par l'auteur seul, via RLS), `published`, `review` (+ `review_comment`).
- Une carte publiée doit avoir titre, map et side (contrainte SQL) ; `save_card` vérifie aussi catégorie et média/description.
- Aucun média n'est hébergé : seules les URLs sont stockées. `url_key` (ex. `yt:<id>`) sert à l'anti-doublon.

### Fonctions (RPC)

| Fonction | Rôle |
|---|---|
| `claim_membership()` | À la connexion : crée la fiche membre si l'email ou l'id Discord est sur la liste blanche |
| `save_card(p jsonb)` | Seule voie d'écriture des cartes : création / mise à jour atomique avec toutes les étiquettes, contrôle des droits, cohérence (zones de la map, rôles du side), limites de taille, historique et dernières valeurs |
| `flag_card_for_review(id, comment)` / `resolve_card_review(id)` | Statut « À revoir » (tout membre peut signaler) |
| `merge_zones(source, target)` | Fusion de zones (admin), met à jour toutes les cartes |
| `reorder_tags(table, ids)` | Réordonnancement (admin) |
| `save_principle(p jsonb)` | Création / mise à jour atomique d'un principe et de ses étiquettes (auteur ou admin) |
| `remove_member(id)` | Retire un membre et son entrée de liste blanche (ses cartes sont conservées) |

Les clients n'ont aucun droit d'écriture direct sur `cards` (hors suppression) ni sur les tables de liaison
et l'historique : tout passe par ces fonctions.

---

## Choix techniques

- **Filtrage côté client.** Toutes les cartes visibles sont chargées une fois (quelques milliers de lignes au plus
  pour une équipe), ce qui rend les filtres, compteurs et recherche instantanés et simplifie le calcul des compteurs
  par option. Si la base dépasse ~10 000 cartes, déplacer le filtrage dans une vue/RPC Postgres.
- **Texte riche = Markdown restreint** (gras, italique, listes, liens) rendu par un petit moteur maison qui échappe
  tout le HTML (`src/lib/markdown.ts`) : pas de dépendance d'éditeur lourde, pas de XSS.
- **Sauvegarde auto** en deux temps : `localStorage` à chaque frappe (aucune perte si l'onglet se ferme),
  puis brouillon serveur après 2,5 s d'inactivité pour une nouvelle carte (visible dans « Mes brouillons »).
  Une carte déjà publiée n'est jamais modifiée silencieusement : ses changements restent locaux jusqu'à l'enregistrement.
- **Titre YouTube** via oEmbed (`youtube.com/oembed`, puis `noembed.com` en secours pour le CORS).

---

## Tests

```bash
npm test          # tests unitaires (Vitest) : détection des médias, filtres, Markdown, formulaire, import CSV
npm run typecheck
```

**Politiques RLS et RPC** (Postgres local, sans Supabase) :

```bash
PGHOST=/var/run/postgresql PGUSER=postgres ./supabase/tests/run.sh
```

**Bout en bout** (Postgres local + [PostgREST](https://github.com/PostgREST/postgrest/releases) + Vite + Playwright) :
connexion, refus d'un intrus, formulaire complet, saisie en série, filtres/URL, détail, signalement, duplication,
fusion de zones, import CSV, restauration après rechargement, vues mobiles.

```bash
PGHOST=/var/run/postgresql PGUSER=postgres npm run e2e   # captures dans e2e/screenshots
```

---

## Hors périmètre V1

Carte interactive de la map, favoris / playlists, commentaires, export PDF.
