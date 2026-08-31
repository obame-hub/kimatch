# Refonte design sur la sandbox — ce qu'il faut fournir

*Préparé le 31 août 2026, pour un travail de refonte mené avec un assistant externe.*

---

## ⚠️ À régler avant de commencer : la sandbox n'est pas anonymisée

**C'est le point le plus important de ce document.**

La sandbox est une **copie fidèle de la production** : vrais noms de clients, vraies adresses
e-mail, vrais numéros de téléphone, vrais montants de contrats. 2 767 comptes, 3 389 contacts,
1 600 contrats.

Travailler dessus avec un assistant externe signifie donc que **des données de clients réels
peuvent lui être transmises** — dans une capture d'écran, un extrait de requête, un jeu de test
collé dans la conversation.

Le dossier de transmission de Michel l'interdit d'ailleurs explicitement :

> « Travailler par lots démontrables, avec des données fictives ou anonymisées. »
> « Ne jamais tester les scénarios d'écriture avec de vraies données clients. »

### Trois façons de s'en sortir

| Option | Ce que ça demande | Quand la choisir |
|---|---|---|
| **Anonymiser la sandbox** | Ajouter une étape de brouillage des noms, e-mails et téléphones dans la recopie. Un développement à part entière. | C'est la bonne solution, et de toute façon nécessaire pour la recette |
| **Travailler sans données** | La refonte design n'a pas besoin de vrais clients : des données inventées suffisent, et c'est même plus lisible pour juger d'une maquette | Pour démarrer tout de suite |
| **Ne jamais sortir de données de l'écran** | L'assistant reçoit le code et les règles, jamais un extrait de base ni une capture non floutée | Faisable, mais repose sur la vigilance à chaque échange |

**Recommandation : commencer par l'option 2.** Une refonte visuelle se juge aussi bien — mieux, même
— sur des données inventées. Cela permet de démarrer sans attendre l'anonymisation, qui reste à
faire pour la suite.

---

## Ce qu'il faut lui donner

### 1. Le code, en lecture

Le dépôt : `github.com/obame-hub/kimatch`, branche `master`.

Une branche de travail existe déjà pour ce genre de sujet : `design-tableau-de-bord`.

**À créer : une branche dédiée à la refonte**, pour que rien ne parte sur `master` par accident.

### 2. Le dossier de cadrage de Michel

Le document du 31 août 2026. C'est la spécification de référence : architecture de navigation,
palette, composants, modèle commun des pages, critères de recette.

Sa maquette interactive est jointe :
`Downloads/KiMatch-maquette (1)/KiMatch-maquette.html`

### 3. L'état des lieux

`docs/etat-des-lieux-face-a-la-cible.md` — la comparaison entre la cible et l'existant, avec les
écarts chiffrés. Cela évite qu'il redécouvre par lui-même ce qui manque.

### 4. Les fichiers qui portent le design

Ce sont les seuls endroits où une couleur ou une taille doit être décidée :

| Fichier | Ce qu'il contient |
|---|---|
| `tailwind.config.js` | Les jetons de design : **98 entrées**, deux familles (`kw-*` récente, `navy-*` ancienne) |
| `src/index.css` | Les variables CSS, dont les **34 jetons du mode sombre** |
| `src/components/ui/` | Les briques réutilisables : boutons, cartes, badges, barre de liste, formulaires |
| `src/components/layout/` | La navigation latérale, la barre du haut, les bandeaux |

### 5. Les accès à la sandbox

Ils vivent **uniquement dans Vercel**, pas dans le dépôt :

- `SANDBOX_SUPABASE_URL`
- `SANDBOX_SUPABASE_SERVICE_ROLE_KEY`
- `VITE_ENV_LABEL=sandbox` — c'est cette variable qui affiche le bandeau permanent « sandbox », pour
  qu'on ne confonde jamais les deux environnements

---

## Ce qu'il ne faut jamais lui transmettre

Ces valeurs donnent un accès total en écriture, ou permettent de signer des documents au nom de
KiWee. Elles ne doivent apparaître ni dans une conversation, ni dans un fichier partagé, ni dans une
capture d'écran.

| Secret | Ce qu'il ouvre |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Écriture totale sur la production, sans aucune restriction |
| `SUPABASE_DB_URL` | Contient le mot de passe de la base de production |
| `SANDBOX_SUPABASE_SERVICE_ROLE_KEY` | Écriture totale sur la sandbox |
| `DOCUSIGN_INTEGRATION_KEY` | Signature électronique au nom de KiWee |
| `DOCUSIGN_CONNECT_HMAC_SECRET` | Permet de forger de fausses notifications de signature |
| `CRON_SECRET` | Déclenchement des tâches automatiques |
| Jeton d'accès Salesforce | Accès aux données Salesforce |

**En revanche, ces valeurs sont publiques et sans risque :** l'adresse `kimatch.fr`, l'adresse
Supabase `llktvzbbfadmnhfjatrh.supabase.co`, et la clé « anon » — elle est conçue pour vivre dans le
navigateur de chaque utilisateur.

---

## Les six choses à savoir pour ne rien casser

Ce sont les pièges qu'un assistant qui découvre le projet ne peut pas deviner seul.

### 1. Les couleurs et les tailles passent par des jetons, jamais en dur

Le projet a déjà son vocabulaire visuel : `kw-ink`, `kw-green`, `kw-border`, `kw-sm`… Écrire une
valeur en dur (`#0D7A5F`, `text-[13px]`) est une régression, même si le résultat est identique à
l'écran : la couleur cesse alors de suivre le thème.

**Deux familles de jetons cohabitent** — `kw-*` (récente) et `navy-*` (ancienne). La refonte devrait
être l'occasion d'en supprimer une, mais **pas au milieu d'un écran** : c'est un chantier à part.

### 2. L'application fonctionne en mode sombre

34 jetons sont définis en deux versions. Une couleur écrite en dur casse le mode sombre
silencieusement : le texte devient invisible sur le fond de l'autre thème.

*Le dossier de Michel ne mentionne pas le mode sombre. À trancher avant de commencer — le conserver
double le travail de vérification sur chaque écran.*

### 3. Les statuts se calculent, ils ne se choisissent pas

Deux exemples à ne pas défaire :

- **L'état d'une recommandation** suit sa version active, via un déclencheur en base. Huit tests le
  vérifient (`npm run test:statuts`).
- **L'état d'un contrat** (à venir / en cours / expiré) est **déduit de ses dates** à l'affichage, et
  non lu dans une colonne. Une valeur stockée vieillissait en silence dès que la date de fin passait.

Un écran qui proposerait de choisir ces statuts à la main annulerait ce travail.

### 4. Toute modification est tracée automatiquement

Un déclencheur enregistre chaque changement de champ sur 20 tables : quoi, par qui, quand, valeur
avant et après. **122 683 modifications enregistrées, aucune anonyme.**

Cela veut dire deux choses : ne pas construire un second historique par-dessus, et savoir que toute
manipulation faite sur la sandbox y laissera une trace.

### 5. Les règles d'accès sont côté base, pas côté écran

Chaque requête est filtrée par la base selon l'utilisateur connecté. Un écran ne peut pas contourner
ces règles — et ne doit pas essayer de les reproduire de son côté.

Le dossier de Michel est clair : **conserver les règles actuelles jusqu'à validation explicite d'une
nouvelle matrice de droits.**

### 6. Les listes volumineuses sont paginées par la base

Sites (6 364), compteurs (7 905), consultations pricing (3 533) et recommandations ne chargent
qu'une page à la fois, filtrée et triée **par la base**.

**Conséquence pratique :** un filtre ou un tri ajouté dans le navigateur ne porterait que sur la page
affichée. Sur les sites, cela signifierait filtrer parmi les cent premiers de l'alphabet et rien
au-delà — et le total affiché en haut de l'écran démentirait la liste.

---

## Le brief à lui donner

À copier tel quel.

---

Tu vas m'aider à refondre l'interface de **KiMatch**, le CRM de courtage en énergie de KiWee
Énergie. Le travail se fait **sur l'environnement de test (sandbox)**, jamais sur la production.

**Le métier, en une phrase :** KiWee négocie pour ses clients — surtout des syndics de copropriété —
leurs contrats d'électricité et de gaz auprès des fournisseurs.

**Le circuit, dans l'ordre :** un signal détecte un contrat qui arrive à échéance → une piste est
vérifiée → elle devient une opportunité → le client signe un mandat qui nous autorise à agir → on
construit une recommandation, versionnée → on consulte les fournisseurs (pricing) → un contrat est
signé.

**La technique :** React 18 + TypeScript + Vite, styles en Tailwind CSS, base PostgreSQL chez
Supabase, déploiement chez Vercel. 38 écrans, une dizaine d'utilisateurs quotidiens.

### Les règles à respecter

1. **Aucune couleur, aucune taille en dur.** Tout passe par les jetons de `tailwind.config.js` et
   `src/index.css`. Lis ces deux fichiers avant de proposer quoi que ce soit.
2. **Le mode sombre doit continuer de fonctionner** (34 jetons en deux versions). Une valeur en dur
   le casse en silence.
3. **Ne touche pas aux statuts calculés.** L'état d'une recommandation suit sa version active, celui
   d'un contrat se déduit de ses dates. Ne propose pas d'écran qui les ferait choisir à la main.
4. **Ne reproduis pas les règles d'accès côté écran.** Elles sont dans la base et y restent.
5. **Les grandes listes sont paginées par la base.** Un filtre ou un tri ajouté dans le navigateur ne
   porterait que sur la page affichée — il doit descendre dans la requête.
6. **Aucune donnée client réelle dans nos échanges.** Utilise des données inventées. Si tu as besoin
   d'un exemple, invente-le.
7. **Tu ne pousses rien sur `master`.** Une branche dédiée, et je relis avant de fusionner.

### Ce que je te donne

- Le dossier de cadrage : architecture de navigation, palette, composants, modèle commun des pages,
  critères de recette. C'est la spécification de référence.
- La maquette interactive qui l'accompagne.
- L'état des lieux : ce qui existe déjà, ce qui manque, avec les chiffres.

### Par quoi commencer

**Les fondations, avant les écrans.** Dans cet ordre :

1. La navigation en quatre zones : Pilotage · Référentiel · Développement · Production.
2. Les jetons de design alignés sur la palette du dossier.
3. Le gabarit commun des pages de liste.
4. Le gabarit commun des fiches, en trois colonnes : **rattachements à gauche · objet au centre ·
   activité à droite**. Cette règle vaut sans exception, et elle supprime les onglets « Activité » et
   « Objets liés » là où ils existent.

Puis **trois écrans seulement** — le tableau de bord, la fiche compte, le pricing — qu'on jugera
avant d'aller plus loin.

### Comment je veux que tu travailles

- **Ne devine pas.** Si un terme du métier de l'énergie t'est inconnu — TURPE, PEG, CAL+1, molécule,
  tacite reconduction — demande.
- **Vérifie avant d'affirmer.** Si tu dis qu'une donnée est absente, montre le fichier ou la requête
  qui le prouve.
- **Une proposition à la fois.** Montre un écran, écoute la réaction, continue.
- **Explique-moi en français**, sans jargon, et dis-moi quand tu n'es pas sûr.

Commence par lire `tailwind.config.js`, `src/index.css` et le dossier de cadrage, puis dis-moi ce
que tu comprends de l'écart entre les deux.

---

## Après, avant toute mise en production

Le dossier de Michel est explicite, et ces points ne sont pas négociables :

- Sauvegarde et retour arrière **testés** avant toute migration.
- Recette métier sur chaque objet avant de passer au suivant.
- Aucun déploiement direct : environnement de test, recette, puis décision.
- Salesforce reste **en lecture seule**.
- Aucune régression sur les droits, l'authentification, les historiques et les documents.
