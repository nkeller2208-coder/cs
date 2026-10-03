# CS2 Playbook – base de connaissances d'équipe

Application web privée pour stocker, étiqueter et retrouver les contenus tactiques de l'équipe
(vidéos YouTube, images, textes) sous forme de cartes filtrables, avec des principes de jeu et un suivi
des compétences par joueur et par équipe.

**Stack** : React 19 + TypeScript + Tailwind 4 (Vite) · **Cloudflare Workers** (API + hébergement) · **D1** (base SQLite).
Tout tient dans l'offre gratuite de Cloudflare : 5 Go de base, pas de mise en pause.

---

## Démarrer en local (5 minutes)

Prérequis : [Node.js](https://nodejs.org) version LTS.

```bash
npm install
npm run dev
```

Au premier lancement, le terminal affiche un **lien d'inscription admin** :

```
═══════════════════════════════════════════════════════
  Premier lancement : ouvre ce lien pour créer ton compte admin
  http://localhost:5173/inscription/xxxxxxxx
═══════════════════════════════════════════════════════
```

Ouvre-le, choisis ton email et ton mot de passe : tu es connecté en admin. Pour charger des données de test : **Admin → Démo**.
Besoin d'un nouveau lien plus tard : `npm run admin-link`.

> Sous Windows, si PowerShell bloque `npm` (« l'exécution de scripts est désactivée »), lance une fois
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, ou utilise l'Invite de commandes (`cmd`).

La base locale est dans `.wrangler/state` (supprime ce dossier pour repartir de zéro).

## Mettre en ligne (gratuit, une seule fois)

Le site est relié au dépôt GitHub : **chaque modification envoyée sur la branche `main` est mise en ligne
automatiquement** (1 à 2 minutes). Aucune commande n'est nécessaire.

1. Crée un compte sur [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) (aucune carte bancaire requise).
2. Menu de gauche **Compute (Workers)** → **Workers & Pages** → **Create** → onglet **Workers** →
   **Import a repository** → **Connect GitHub** : autorise Cloudflare sur le dépôt `cs`.
3. Choisis le dépôt `cs`, puis vérifie les réglages :
   - **Project name** : `cs2-playbook` (doit correspondre au `name` de `wrangler.jsonc`) ;
   - **Build command** : `npm run build` ;
   - **Deploy command** : `npx wrangler deploy` ;
   - **Production branch** : `main`.
4. **Create and deploy**. Le site est relié à la base D1 indiquée dans `wrangler.jsonc` (`cs2-playbook-v2`,
   identifiant fixe) et crée ses tables tout seul à la première visite. L'adresse s'affiche :
   `https://cs2-playbook.<ton-sous-domaine>.workers.dev`.
   (Si Cloudflare demande de choisir un sous-domaine `workers.dev`, choisis-en un.)
5. Lien d'inscription admin (choix de l'email et du mot de passe) :
   `npm run admin-link -- --remote https://cs2-playbook.<ton-sous-domaine>.workers.dev`.

Site actuel : **https://cs2-playbook.cs2-kb.workers.dev** (Worker `cs2-playbook`, base `cs2-playbook-v2`).
L'ancienne base `cs2-playbook` (schéma de la version précédente) n'est plus utilisée et peut être supprimée.

Alternative depuis un PC : `npm run deploy` (connexion à Cloudflare dans le navigateur, puis construction et déploiement).

## Modifier le site

| Je veux… | Comment |
|---|---|
| Ajouter / changer des cartes, étiquettes, équipes, compétences, membres | Directement dans le site (menus et **Admin**) : rien à déployer |
| Changer le code (nouvelle fonction, texte, couleur…) | Demande-le à Claude Code sur ce dépôt : il prépare une *pull request* ; tu cliques **Merge** sur GitHub → en ligne 1 à 2 minutes après |
| Une petite retouche de texte | Sur GitHub, ouvre le fichier, icône crayon, modifie, **Commit changes** sur `main` → mis en ligne automatiquement |
| Voir avant de publier | Chaque branche autre que `main` est construite par Cloudflare avec une adresse d'aperçu (visible dans la *pull request*) |
| Annuler une mise en ligne | Cloudflare → ton Worker → **Deployments** → **Rollback** sur la version précédente |
| Tester sur ton PC | `npm install` puis `npm run dev` (voir plus haut) |

Ajouter une table ou une colonne : crée `migrations/000X_nom.sql` ; le site l'applique tout seul après le déploiement.

Sauvegarde de la base : Cloudflare → **Storage & Databases** → **D1** → `cs2-playbook-v2` → **Time Travel** (retour
dans le temps jusqu'à 30 jours, inclus dans l'offre gratuite), ou `npx wrangler d1 export cs2-playbook-v2 --remote --output sauvegarde.sql`.

## Connexion

Aucune page n'est visible sans connexion. Seules les personnes de la **liste blanche** (Admin → Membres) entrent.

1. **Inviter** : dans Admin → Membres (ou Équipes → « Inviter un nouveau joueur » pour un capitaine), saisis un
   pseudo (et l'email si tu le connais) puis « Inviter ». Un **lien d'inscription** est généré : envoie-le à la
   personne en message privé.
2. **S'inscrire** : en ouvrant le lien, la personne choisit son pseudo, son **email** et son **mot de passe**
   (8 caractères minimum). Le lien ne sert **qu'une fois** et expire au bout de 7 jours ; en générer un nouveau
   remplace l'ancien. Ouvrir le lien ne le consomme pas (seul l'envoi du formulaire l'utilise).
3. **Se connecter** ensuite, sur n'importe quel appareil : email + mot de passe sur la page d'accueil.
   Une session dure 30 jours.

**Mot de passe oublié** : dans Admin → Membres → Liste blanche, « 🔑 Lien nouveau mot de passe » sur la personne.
Le lien lui permet d'en choisir un nouveau ; ses autres appareils sont déconnectés.

Sécurité : mots de passe hachés (PBKDF2-SHA256, 100 000 itérations, sel aléatoire), compte bloqué 15 minutes
après 5 mots de passe erronés, message d'erreur identique que l'email existe ou non, cookie de session `HttpOnly` /
`Secure` / `SameSite=Lax`, jetons stockés hachés (SHA-256), en-tête anti-CSRF exigé sur toute modification,
droits vérifiés par l'API à chaque requête, en-têtes CSP/anti-iframe/noindex.

---

## Fonctionnalités

| Fonctionnalité | Où |
|---|---|
| Inscription par lien (usage unique), connexion email + mot de passe, liste blanche, rôles Admin / Membre | `worker/auth.ts`, `worker/password.ts`, `worker/admin.ts`, `src/pages/LoginPage.tsx`, `src/pages/RegisterPage.tsx` |
| Grille responsive, badges colorés (CT bleu, T orange, risque vert → rouge) | `src/components/CardTile.tsx` |
| Vue détaillée en modale, URL `/c/:id` partageable, carte précédente / suivante | `src/pages/CardDetail.tsx` |
| Filtres ET entre familles / OU dans une famille, compteurs, filtres conditionnels, recherche, tri, filtres dans l'URL | `src/lib/filters.ts`, `src/components/FilterPanel.tsx` |
| Formulaire en clics : détection YouTube/image/lien, titre YouTube, « début à mm:ss », anti-doublon | `src/pages/CardFormPage.tsx`, `src/components/MediaField.tsx` |
| « + Ajouter » (touche **N**, bouton flottant mobile), pré-rempli depuis les filtres actifs | `src/components/Layout.tsx` |
| Zones proposées par les membres, validation / fusion par l'admin | `worker/tags.ts`, `src/pages/AdminPage.tsx` |
| Saisie en série, Dupliquer, dernières valeurs mémorisées | `src/lib/cardForm.ts` |
| Sauvegarde auto, statuts Brouillon / Publié / À revoir, historique des modifications | `worker/cards.ts`, `src/lib/history.ts` |
| Rounds lancés (Rush, Déclic, Strat…), Post-plant | catégories + liste « Types de round » |
| **Principes de jeu** rattachés à des étiquettes et/ou à des cartes | `src/pages/PrinciplesPage.tsx`, `worker/principles.ts` |
| **Compétences** par joueur et par équipe (voir ci-dessous) | `src/pages/SkillsPage.tsx`, `worker/skills.ts` |
| Tableau de bord analytique | `src/pages/DashboardPage.tsx`, `src/lib/stats.ts` |
| Import CSV avec prévisualisation | `src/pages/ImportPage.tsx`, `src/lib/csvImport.ts` |
| Données de démo (13 cartes, 4 principes) en un clic | Admin → Démo, `src/lib/demo.ts` |

Raccourcis : **N** nouvelle carte · **← / →** carte précédente / suivante · **Ctrl/⌘ + Entrée** publier · **Ctrl/⌘ + B / I** gras / italique.

### Équipes et rôles

Menu **Équipes**. Le site peut accueillir plusieurs équipes ; un joueur peut appartenir à plusieurs équipes.

| Rôle | Où | Droits |
|---|---|---|
| **Admin** | site | Tout : membres du site, listes d'étiquettes, création / suppression d'équipes, toutes les équipes |
| **Capitaine** | équipe | Joue ; fixe les compétences de l'équipe ; modifie celles de ses joueurs ; invite, ajoute, retire des membres, nomme capitaines et coachs ; renomme l'équipe |
| **Coach** | équipe | Comme un capitaine (sauf nommer un capitaine / coach), mais ne joue pas : pas de compétences personnelles |
| **Joueur** | équipe | Consulte tout ; met à jour ses propres compétences ; peut quitter l'équipe |

- L'admin crée une équipe et choisit son capitaine (Équipes → Nouvelle équipe).
- Le capitaine **invite un nouveau joueur** (pseudo + email facultatif) : un lien d'inscription est créé ; le
  joueur y choisit son email et son mot de passe, puis rejoint l'équipe. Il peut aussi **ajouter un membre du site**
  déjà existant (par exemple un joueur d'une autre équipe).
- Un capitaine ne peut pas se rétrograder s'il est le dernier à gérer l'équipe.

### Compétences

Menu **Compétences** (avec un sélecteur d'équipe si tu en as plusieurs). Chaque compétence a trois statuts : **○ Non travaillé**, **◐ À travailler**, **● Acquis**.

- **À travailler** : la vue d'ensemble de tout ce qu'on travaille. Les objectifs d'équipe, avec la progression
  de chaque joueur, puis les objectifs individuels de chacun.
- **Équipe & joueurs** : tableau compétences × (équipe + chaque joueur). Passer une compétence « à travailler »
  dans la colonne **Équipe** la passe **« à travailler » chez tous les joueurs** (après confirmation). Les joueurs
  la passent ensuite « acquis » à leur rythme. Mettre l'équipe sur « acquis » ou « non travaillé » ne modifie pas
  les joueurs.
- **Fiche joueur** : les compétences d'un joueur en trois colonnes, avec sa progression.

Droits : capitaines et coachs (et l'admin) fixent le statut d'équipe et peuvent modifier les joueurs de leur
équipe ; chaque joueur modifie ses propres statuts. La liste des compétences est commune à toutes les équipes et
se gère dans **Admin → Compétences** (ou « + Compétence »). Les statuts d'un joueur le suivent d'une équipe à l'autre.

---

## Architecture

```
navigateur ──► Cloudflare Worker (worker/)
                 ├─ /api/*   API Hono : connexion, droits, cartes, principes, compétences…
                 ├─ le reste : site React (dist/client) servi en fichiers statiques
                 └─ D1 (SQLite) : migrations/*.sql
```

La base n'est jamais exposée au navigateur : toute lecture et écriture passe par l'API, qui vérifie la session
et les droits (auteur ou admin pour modifier, brouillons privés, cohérence zones ↔ map et rôles ↔ side, limites
de taille…). En local, le plugin Cloudflare pour Vite exécute le même Worker et une copie locale de D1.

### Modèle de données (`migrations/`)

```
allowlist (lien d'inscription) ─ members (role, mot de passe haché) ─ sessions          teams
maps ─< zones   roles (CT/T)   categories   risks   utilities   economies   round_types
cards ─< card_media · card_roles · card_categories · card_zones · card_utilities · card_economies
      ─< card_round_types · card_history
principle_themes ─< principles ─< principle_maps · principle_roles · principle_categories
                                ─< principle_round_types · principle_cards >─ cards
teams ─< team_members (captain | coach | player) >─ members
skill_groups ─< skills ─< team_skills (statut d'équipe) · member_skills (statut par joueur)
```

Ajouter une migration : crée `migrations/000X_xxx.sql` ; `npm run dev` (local) ou le prochain déploiement (en ligne)
l'appliquent automatiquement.

---

## Tests

```bash
npm test          # tests unitaires (logique : médias, filtres, Markdown/XSS, formulaire, CSV, stats, principes, compétences)
npm run typecheck
npm run e2e       # base jetable + serveur local : 78 tests de droits de l'API puis scénario navigateur complet
```

`npm run e2e` utilise Playwright (`CHROMIUM_PATH` pour choisir le navigateur, `SHOTS` pour le dossier des captures).

## Hors périmètre V1

Carte interactive de la map, favoris / playlists, commentaires, export PDF, compétences propres à une équipe.
