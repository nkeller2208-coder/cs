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

Raccourcis : **N** nouvelle carte · **Ctrl/⌘ + Entrée** publier · **Ctrl/⌘ + B / I** gras / italique.

---

## Mise en route

### 1. Projet Supabase

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Applique les migrations dans l'ordre, au choix :
   - **SQL Editor** : colle et exécute `supabase/migrations/20260930000000_init.sql`, puis `…000100_seed_tags.sql` ;
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

---

## Modèle de données

```
maps ─┬─< zones                       roles (side CT/T)   categories (shows_utility)
      │                               risks (color)       utilities     economies
cards ┼─< card_media (url, kind, url_key, position)
      ├─< card_roles >─ roles          ├─< card_zones >─ zones
      ├─< card_categories >─ categories├─< card_utilities >─ utilities
      ├─< card_economies >─ economies  └─< card_history (instantané JSON par modification)
members (role admin|member) ─ member_prefs (dernières valeurs)      allowlist (email | discord_id)
```

- Les listes d'étiquettes ont `sort_order` et `archived` : une valeur archivée reste sur les cartes mais n'est plus proposée.
- `cards.status` : `draft` (visible par l'auteur seul, via RLS), `published`, `review` (+ `review_comment`).
- Une carte publiée doit avoir titre, map et side (contrainte SQL) ; `save_card` vérifie aussi catégorie et média/description.
- Aucun média n'est hébergé : seules les URLs sont stockées. `url_key` (ex. `yt:<id>`) sert à l'anti-doublon.

### Fonctions (RPC)

| Fonction | Rôle |
|---|---|
| `claim_membership()` | À la connexion : crée la fiche membre si l'email ou l'id Discord est sur la liste blanche |
| `save_card(p jsonb)` | Création / mise à jour atomique d'une carte et de toutes ses étiquettes + historique + dernières valeurs |
| `flag_card_for_review(id, comment)` / `resolve_card_review(id)` | Statut « À revoir » (tout membre peut signaler) |
| `merge_zones(source, target)` | Fusion de zones (admin), met à jour toutes les cartes |
| `reorder_tags(table, ids)` | Réordonnancement (admin) |
| `remove_member(id)` | Retire un membre et son entrée de liste blanche (ses cartes sont conservées) |

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
