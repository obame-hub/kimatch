# KiWee OS

Plateforme métier interne de KiWee Énergie (conseil en énergie), qui remplace Salesforce. Logique **patrimoine énergétique** : Site → Signal → Mandat → Recommandation → Versions → Objectifs → Stratégies → Offres fournisseurs. Le **site** (pas le compte) est l'objet central : le compte est la relation contractuelle, le site porte la valeur.

Déployé en production sur **https://kiwee-os.vercel.app**.

---

## 1. Stack technique

| Couche | Techno |
|---|---|
| Front-end | Vite + React 18 + TypeScript + Tailwind CSS + composants maison (style shadcn) |
| Routing | React Router |
| Données / cache | TanStack Query (React Query) |
| Graphiques | Recharts |
| Backend | Supabase (Postgres + Auth + Row Level Security) |
| API serverless | Fonctions Vercel (`/api/*`, Node.js, TypeScript) |
| Hébergement | Vercel (déploiement automatique à chaque push sur `master`) |
| Dépôt de code | GitHub (privé) |

Pas de framework backend séparé : toute la donnée métier vit dans Supabase, le front ne fait qu'afficher/manipuler via l'API Supabase (clé anon + RLS) ou via les fonctions `/api/*` quand un secret ne doit jamais toucher le navigateur (Ellisphere, DocuSign, Gmail, Slack).

## 2. Démarrer en local

```bash
npm install
npm run dev
```

L'app tourne en **mode démo** sans aucune configuration (bouton "Continuer en mode démo" sur l'écran de connexion) — données d'exemple dans `src/lib/mockData.ts`, aucun compte requis. Utile pour William ou tout nouveau contributeur qui veut juste voir/tester l'UI sans toucher à Supabase.

Pour se connecter à la vraie base, créer un fichier `.env.local` (jamais commité) avec :

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Ces deux valeurs sont dans Supabase → Project Settings → API. Le reste des secrets (clés Ellisphere, DocuSign, Gmail, Slack, service role) ne sont utilisés que côté serveur (fonctions `/api/*`) et vivent uniquement dans les variables d'environnement Vercel — jamais en local, jamais dans le code.

## 3. Déploiement

Push sur `master` → déploiement automatique Vercel (`vercel git connect` déjà configuré). Pas de branches/PR — workflow volontairement simple tant que l'équipe reste petite.

`vercel.json` contient un rewrite obligatoire pour que le routing React (SPA) fonctionne sur les rechargements de page et les URLs tapées à la main (sans lui, Vercel renvoie un vrai 404 serveur au lieu de laisser React Router gérer la route) :

```json
{ "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }] }
```

## 4. Authentification & rôles

- **Connexion par lien magique** (pas de mot de passe) : l'utilisateur saisit son email, reçoit un lien, clique dessus — son compte se crée automatiquement à la première connexion (trigger Postgres `on_auth_user_created`), avec le rôle `CONSEILLER` par défaut.
- **Liste blanche d'accès** : seuls les emails présents dans la table `profils_autorises` peuvent créer un compte — appliqué via un Auth Hook Supabase ("Before User Created") qui rejette toute inscription hors liste. Un SUPER_ADMIN/ADMIN gère cette liste depuis `/administration` → onglet "Accès autorisés".
- **Rôles & permissions (RBAC)** : `roles_acces` (SUPER_ADMIN, ADMIN, DIRECTEUR, MANAGER, CONSEILLER, SERVICE_CLIENT, + rôles externes PARTENAIRE/FOURNISSEUR/CLIENT réservés à un futur portail) × `permissions` (module + action, ex. `RECOMMANDATION_VALIDATE`). Un SUPER_ADMIN/ADMIN gère l'attribution des rôles et la matrice de permissions depuis `/administration`.
- **Mode démo** : bypass complet de Supabase Auth (`enterDemoMode()`), conservé volontairement pendant le MVP pour les démos/tests sans compte.

Voir `src/lib/auth.tsx`, `src/lib/data/roles.ts`, `src/pages/Administration.tsx`.

## 5. Intégrations externes

| Intégration | Usage | Où sont les credentials |
|---|---|---|
| **Ellisphere (EliPro)** | Recherche d'entreprise (SIREN/SIRET) + scoring de solvabilité | Vercel env vars, jamais exposées côté front (`api/ellisphere/*`) |
| **DocuSign** | Envoi de mandats pour signature électronique (JWT Grant, compte partagé) + webhook Connect qui met à jour le statut du mandat | Clé RSA + Integration Key dans Vercel env vars ; webhook HMAC vérifié côté serveur (`api/docusign/*`) |
| **Gmail** | Envoi d'emails **depuis le compte Gmail propre de chaque conseiller** (OAuth par utilisateur, pas un compte partagé) | `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET` en Vercel ; le refresh token de chaque utilisateur est stocké chiffré dans `profils_gmail_tokens` (jamais exposé côté client) — connexion depuis `/parametres` |
| **Slack** | Notifications automatiques (nouveaux comptes, nouveaux contrats) | Token bot en Vercel env vars (`api/slack/*`) ; canaux configurables depuis `/parametres` |

Intégrations **volontairement différées** (décision de Naoëlle, à traiter en fin de projet) : Allo (softphone), GRDF/gaz, extraction de factures par IA, moteur TURPE.

## 6. Modèle de données

Base Postgres gérée par Michel Obame — plus de 100 tables. Grandes familles :

- **Cœur métier** : `comptes` (+ sous-tables `comptes_clients`/`fournisseurs`/`partenaires`), `sites`, `compteurs` (+ `compteurs_electricite`/`gaz`), `contacts`, `contrats`, `signaux`, `mandats`, `actions` (tâches), `documents`, `interactions`, `consommations`.
- **Recommandations** (le vrai "produit" KiWee, jamais réécrit — on crée une nouvelle version) : `recommandations` → `versions_recommandation` → `objectifs_version` → `strategies_objectif` → `offres_fournisseurs` (+ détail par compteur/énergie : `offres_fournisseurs_compteurs`, `offres_compteurs_electricite`/`gaz`).
- **Rôles & accès** (voir section 4) : `organisations`, `equipes`, `postes`, `profils`, `roles_acces`, `permissions`, `profils_autorises`, + tables de liaison.
- **Tables de référence** (`statuts_*`, `types_*`, `etapes_*`) : toujours peuplées en base, jamais codées en dur côté front — voir `useReferenceTable()` dans `src/lib/data/referenceTables.ts`, avec repli statique (`src/lib/referenceFallbacks.ts`) uniquement pour le mode démo.
- **Mis de côté pour l'instant** (schéma présent mais non branché, en attente de décision produit) : le moteur d'expertise/analyses (`analyses`, `domaines_expertise`, `executions_*`, `moteurs_calcul`...), le moteur tarifaire TURPE (`formules_tarifaires_turpe`, `coefficients_turpe`...), et une table `solutions` dont le rôle par rapport à la chaîne Objectif/Stratégie/Offre reste à clarifier avec Michel.

⚠️ Le schéma change souvent sans préavis (Michel travaille dessus en parallèle). **Avant de faire confiance à une requête existante après une pause, vérifier que les colonnes utilisées existent toujours** (`select column_name from information_schema.columns where table_name = '...'` dans le SQL Editor Supabase) — un renommage silencieux fait retomber l'app sur les données de démo sans erreur visible.

**Toute modification de schéma (nouvelle table, colonne, policy RLS) se rédige en SQL clair et se fait valider/appliquer par Naoëlle ou Michel — jamais exécutée à l'aveugle.** Voir section 6bis pour la procédure exacte (sandbox → prod).

## 6bis. Faire évoluer le schéma : sandbox → prod (migrations)

Deux projets Supabase distincts existent :

| Environnement | Ref projet | Usage |
|---|---|---|
| **Sandbox** (`kimatch-staging`) | `uxutkjjcyhtosyecsjdy` | Tester tout changement avant la prod |
| **Production** (`kiwee-mvp`) | `llktvzbbfadmnhfjatrh` | La vraie donnée, ne jamais tester dessus en premier |

Depuis le 03/08/2026, tout changement de schéma passe par le **CLI Supabase et des fichiers de migration versionnés** (`supabase/migrations/`) — l'équivalent des *Change Sets* Salesforce (outbound/inbound). But : ne plus jamais exécuter du SQL à la main sans trace, et avoir un historique relisible de ce qui a été poussé en prod et quand.

**Pourquoi pas un bouton "pousser en prod" directement dans l'app Kimatch ?** Parce que ça obligerait à exposer une clé avec les pleins pouvoirs d'écriture (`service_role`) depuis une application web — un bug ou un clic malheureux pourrait alors écrire n'importe quoi en prod, sans étape de relecture ni historique. Le CLI, lancé depuis un poste de dev, évite ce risque.

### Procédure

1. **Se placer dans le dossier du projet** (le CLI a besoin du dossier `supabase/` — ne fonctionne pas depuis un autre dossier comme `sf_import`) :
   ```bash
   cd C:\Users\nghou\kiwee-os
   ```

2. **Écrire le changement** dans un nouveau fichier SQL sous `supabase/migrations/` (nom horodaté, ex. `20260810120000_ajoute_colonne_x.sql`) — Claude s'en charge habituellement.

3. **Tester sur la sandbox d'abord** :
   ```bash
   npx supabase db push --db-url "postgresql://postgres.uxutkjjcyhtosyecsjdy:<mot-de-passe-sandbox>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
   ```
   Vérifier dans l'app (ou en base) que tout fonctionne comme prévu.

4. **Une fois validé, pousser le même fichier sur la prod** :
   ```bash
   npx supabase db push --db-url "postgresql://postgres.llktvzbbfadmnhfjatrh:<mot-de-passe-prod>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
   ```
   Le CLI demande confirmation avant d'appliquer — bien relire la liste des fichiers proposés avant de valider.

**Limite connue** : la comparaison *automatique* sandbox vs prod (`supabase db diff`, pour générer un fichier de migration à partir d'un changement déjà fait à la main dans le Dashboard) nécessite Docker Desktop, non installé au 03/08/2026 — à installer si ce besoin se présente. En attendant, les migrations s'écrivent à la main (largement suffisant pour l'usage actuel).

## 7. Conventions de code

- Pas de règle métier dans le front : statuts, calculs, droits d'accès pilotés par Supabase (tables de référence, RLS, triggers).
- Toujours passer par `useReferenceTable()` pour les statuts/types plutôt que coder les libellés en dur.
- Chaque écran de liste a une page de détail cliquable ; toute donnée liée (compte, site, contact...) est un lien (`<EntityLink>`) vers sa propre fiche.
- Mutations optimistes : on met à jour le cache React Query immédiatement, sans refetch agressif (`staleTime` de 5 min sur le `QueryClient`, voir `src/main.tsx`) — évite qu'une création locale soit écrasée par un refetch avant que Supabase ait confirmé.
- Commentaires en français dans le code, comme le reste du projet.

## 8. Sécurité, sauvegardes & continuité — état des lieux (20/07/2026)

Point important avant l'arrêt définitif de Salesforce :

- **Code** : dépôt GitHub privé, poussé à chaque commit → récupérable n'importe où par `git clone`, même si le dossier local est supprimé.
- **Secrets** (clés API, tokens) : stockés uniquement dans les variables d'environnement Vercel (chiffrées), jamais dans le code ni en local → pas perdus si le PC est supprimé.
- **Données** : hébergées dans Supabase (AWS eu-west-1), indépendantes de tout poste local.
- **Sauvegardes automatiques Supabase : actives.** L'organisation Supabase (`obame@kiwee-energie.fr`) est en plan Pro, et le projet `kiwee-mvp` a bien des sauvegardes quotidiennes planifiées (confirmé le 20/07/2026 sur Database → Backups), restaurables à tout moment.
- **⚠️ Comptes personnels vs comptes KiWee.** Le dépôt GitHub (`naoelleghouma/kiwee-os`) et le projet Vercel (`naoelle-s-projects`) sont sur les comptes **personnels** de Naoëlle, pas sur une organisation KiWee. Risque de continuité business : si l'accès à ces comptes personnels est perdu (départ, oubli, etc.), KiWee peut perdre l'accès au code/déploiement. **Recommandé : transférer le repo GitHub et le projet Vercel vers une organisation KiWee dès que possible.**
- **Recommandé également** : conserver une copie des secrets critiques (clé RSA DocuSign, clés Ellisphere, etc.) dans un coffre-fort partagé de l'équipe (password manager professionnel), pas uniquement dans Vercel — pour ne pas dépendre d'un seul accès en cas de perte.

### Nom de domaine

`kiwee-os.vercel.app` fonctionne très bien pour l'usage actuel, mais pour un passage en production définitif (remplacement de Salesforce), un **nom de domaine dédié est recommandé** (ex. `os.kiwee-energie.fr` ou `crm.kiwee-energie.fr` si KiWee possède déjà `kiwee-energie.fr`) :
- image professionnelle vis-à-vis des clients/fournisseurs qui reçoivent des emails ou liens depuis l'app,
- portabilité (changer d'hébergeur un jour sans changer l'URL que tout le monde utilise),
- meilleur contrôle de la configuration email (SPF/DKIM) si l'app envoie un jour des emails depuis son propre domaine.

Vercel permet d'ajouter un domaine personnalisé gratuitement (Project Settings → Domains) — reste juste à pointer les DNS depuis le registrar du domaine (OVH, etc.).

## 9. Reste à faire / points ouverts

- Champs `sites` en attente côté Michel (année de construction, surface, AG, coordonnées carte).
- Extraction de factures par IA (via Claude) — pas commencée.
- Modèle `solutions` vs chaîne Objectif/Stratégie/Offre — à trancher avec Michel.
- Moteur TURPE + écosystème expertise/analyses — reporté à la fin, avec l'accord de William.
- Allo (softphone) et GRDF/gaz — non prioritaires.
