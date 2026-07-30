# PROMPT — Recréer la « Fiche Compte » KiWee OS en React + Tailwind (pixel-perfect)

> Colle ce fichier entier dans Claude Code, à la racine du dépôt, avec le dossier
> `handoff-fiche-compte/` présent dans le repo.

---

## Ta mission

Recréer **à l'identique** la page « Fiche Compte » du CRM KiWee OS dans notre application
React + Tailwind, et la brancher sur nos vraies API.

**La référence visuelle absolue est le fichier `handoff-fiche-compte/01-REFERENCE-fiche-compte.html`.**
Ouvre-le dans un navigateur. C'est un fichier autonome, sans dépendance : il s'affiche exactement
comme la page doit s'afficher en prod. **Tout écart visuel est un bug.**

Le code source lisible de cette page est dans `handoff-fiche-compte/04-source/` :
- `Fiche Compte.dc.html` — le markup + la logique d'origine (styles inline, valeurs exactes)
- `support.js` — le runtime maison (à NE PAS porter : c'est juste pour que la référence tourne)

**Méthode de travail imposée : ne devine aucune valeur.** Chaque couleur, taille de police,
padding, border-radius, gap, épaisseur de bordure et ombre doit être **lue dans le source**
(`04-source/Fiche Compte.dc.html`) ou mesurée dans la référence via l'inspecteur. Si tu hésites
entre 11 px et 11,5 px, va lire.

---

## Contexte produit (indispensable pour comprendre l'écran)

KiWee est un courtier en énergie. Son CRM propriétaire est organisé autour du **patrimoine
énergétique**, pas du compte client. La hiérarchie des objets est :

```
Compte  →  Site  →  Compteur
(le cabinet)  (l'immeuble)  (le PDL / PCE)
```

Un **Compte** est un cabinet / syndic / entreprise qui gère un portefeuille de **Sites**.
Chaque Site porte des **Compteurs** (électricité ou gaz), qui portent des **Contrats**,
sont couverts par des **Mandats**, et font l'objet de **Recommandations** et de **Signaux**.

L'utilisateur est le **commercial KiWee**. C'est son outil de travail toute la journée :
la vitesse d'exécution primaire sur la pédagogie. Il vient de Salesforce qu'il trouve lourd et laid.

---

## Charte iconographique — À RESPECTER SUR TOUT LE CRM

Chaque type d'objet a **une couleur et une icône propres**, identiques partout dans le produit.
C'est ce qui permet une navigation reconnaissable sans texte. Les valeurs exactes sont dans
`02-design-tokens.ts` (`objectTypes`).

| Objet | Couleur | Icône |
|---|---|---|
| Comptes | bleu `#3b5f8a` | immeuble |
| Sites | vert `#0d7a5f` | pin de carte |
| Contacts | violet `#7c5bb0` | personne |
| Compteurs élec | doré `#c8940a` | éclair |
| Compteurs gaz | bleuté `#4a7fa5` | flamme |
| Recommandations | ambre `#b57a24` | étoile |
| Mandats | or `#8a6420` | bouclier |
| Signaux | rouge `#c2452d` | éclair d'alerte |
| Tâches | doré `#9a7b1f` | coche |
| Marché | teal `#0f7a72` | courbe |

Les icônes sont des **SVG inline** (stroke-width 2 à 2,2, strokeLinecap/Join `round`, viewBox 0 0 24 24).
Récupère-les telles quelles depuis le source — **ne les remplace pas** par une librairie d'icônes.

---

## Structure de la page (3 colonnes, hauteur d'écran fixe, pas de scroll global)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ NAVBAR verticale réduite (56 px) │ fil d'Ariane · recherche · ticker marché  │
│  icônes colorées par objet       ├───────────────────────────────────────────┤
│                                  │ HEADER : nom du compte · badges · actions │
│                                  │          + carte méta (propriétaire…)     │
│                                  ├───────────────────────────────────────────┤
│                                  │ BARRE D'ONGLETS avec badges numériques    │
│                                  ├───────────┬──────────────────┬────────────┤
│                                  │ VOLET     │ CONTENU DE       │ ACTIVITÉ   │
│                                  │ GAUCHE    │ L'ONGLET         │ (colonne   │
│                                  │ (contacts,│ (scroll propre)  │  droite,   │
│                                  │ commentaire)                 │  scroll)   │
└──────────────────────────────────┴───────────┴──────────────────┴────────────┘
```

Grille : `grid-template-columns: 300px minmax(0,1fr) 340px` sur desktop.
Chaque colonne scrolle indépendamment (`overflow-y:auto`), le document ne scrolle pas.

### Onglets (dans cet ordre, avec leurs badges)

1. **Compte** (défaut) — identité éditable, scoring commercial, carte multi-pins, frise de relation
2. **Contrats** `22` — regroupés par site puis par compteur, frises chronologiques
3. **Compteurs** `16` — héro de ventilation + liste hiérarchisée par site
4. **Recommandations** `2`
5. **Signaux** `n`
6. **Mandats** `!`
7. **Fichiers** — avec drag & drop
8. **Historique** — journal des modifications de champs

Raccourcis clavier **1 à 8** pour basculer d'onglet (indiqué en bout de barre).

---

## Les 12 exigences non négociables

1. **Pixel-perfect.** Mêmes hex, mêmes px, mêmes rayons, mêmes ombres. Lis les valeurs, ne les invente pas.
2. **Polices** : `Instrument Sans` (400/500/600/700) pour l'UI, `JetBrains Mono` (400/500/600/700)
   pour **toute donnée chiffrée** (SIRET, montants, dates, PDL, kVA, MWh). Chargées via Google Fonts.
   Cette distinction typographique est structurante — respecte-la partout.
3. **Édition inline partout.** Tout champ est éditable au clic, sans modale. Voir la section « Édition » ci-dessous.
4. **Indicateur de champ vide** : un champ sans valeur affiche un placeholder cliquable en pointillés
   (« ＋ ajouter »), jamais un blanc muet.
5. **Copie en un clic** sur toute donnée technique (SIRET, SIREN, PDL, adresse, email, téléphone),
   avec toast de confirmation.
6. **Aucune modale pour les actions courantes.** Note, tâche, clôture de signal se font en place.
7. **Micro-interactions** : hover, transitions 130–200 ms, toast « ✓ enregistré », animations
   d'apparition (`fadeSlide`, `floatUp`) — jamais décoratives, toujours au service du feedback.
8. **Zones tactiles ≥ 44 px** sur mobile.
9. **Mode sombre** : clair par défaut, sombre en option.
10. **Responsive natif** : desktop ET mobile au même niveau de finition (voir section Mobile).
11. **Liens croisés** : toute référence à un Site / Compteur / Contact ouvre sa fiche.
12. **Drag & drop de fichiers** dans l'onglet Fichiers, avec catégorisation (contrat, facture, mail, photo…).

---

## Détail des blocs de l'onglet « Compte »

### En-tête
- Nom du compte sur **2 lignes maximum** (jamais plus, partout dans le CRM)
- Badges : type de compte (**distinction graphique forte** entre Client / Partenaire / Fournisseur),
  statut Client/Prospect, nombre de sites gérés
- Boutons d'action à gauche, puis **carte méta compacte en haut à droite** :
  propriétaire de l'enregistrement (modifiable en un clic), date+heure de création,
  date+heure de dernière modification

### Bloc « Valeur du compte » (haut gauche)
Anneau de score SVG + détail des critères qui le composent (ancienneté de la relation,
taux de sites client vs prospect, potentiel de conversion). Code couleur **distinct** du score
de santé technique pour éviter toute confusion.

### Bloc « Identité » — champs exacts, tous éditables
Nom du compte · Type de compte · Note Ellipro (sur 10, code couleur : < 3 très mauvais,
> 7 très bien) · SIRET (14 chiffres) · SIREN (9 premiers chiffres du SIRET, dérivé) ·
Code NAF (format `68.32A`) · Libellé APE · Adresse · Département (numéro + nom) · Statut

**Comportement de l'adresse** (identique sur la fiche Site) : en lecture, un seul champ
« Adresse » concaténé. Au clic, il éclate en **Rue / Code postal / Ville** éditables
séparément, **plus un champ de recherche d'adresse Google** qui standardise le format et
remplit les trois champs d'un coup. À la validation, retour à l'affichage concaténé.

### Carte multi-pins
Un pin par site du compte, **navigable** (déplacement + zoom), avec cadrage automatique sur
l'ensemble de la zone couverte. Implémentée avec **Leaflet + tuiles CARTO** dans la référence.

### Frise « Historique de la relation »
Timeline verticale consolidée tous sites confondus (signature de mandat, renouvellement,
litige, AG). Icône + couleur par type d'événement, chaque entrée est un **accordéon**
qui déroule son détail.

---

## Volet gauche

- **Carte Contacts**, groupés avec **distinction graphique** entre contacts du **cabinet**
  et membres du **conseil syndical** (cas d'un compte « Syndic de copropriété »).
  Chaque contact : nom, rôle en **icône** (jamais en texte long), email, téléphone fixe,
  mobile — le tout sur 2 lignes max. Actions Appeler / Envoyer un mail en un clic.
  **Maximum 3 contacts affichés**, puis « voir tous les contacts » vers une vue liste dédiée.
- **Carte Commentaire** du compte, sous les contacts : texte long éditable en place.

---

## Colonne Activité (droite)

Flux consolidé, **filtrable par site** ET **par contact**.
Types d'activité avec un **design nettement différenciant** (icône + dalle de couleur propre) :
note / compte-rendu d'appel · email · appel · tâche · événement système.

- **Séparateurs de date très visibles** (« À venir », « Aujourd'hui », « Hier », puis les dates),
  plus proche en premier — ces séparateurs doivent se lire au premier coup d'œil, pas être discrets.
- Chaque activité est **cliquable et dépliable** : résumé IA d'un appel, contenu d'un mail,
  commentaires d'une tâche.
- **Les tâches à venir se distinguent visuellement des tâches accomplies**, et **changent d'état
  visuel quand on les coche** (transition d'« à faire » vers « accompli »).
- Composeur de note directement dans le fil.

---

## Système d'édition inline (à porter fidèlement)

C'est le cœur de l'expérience. Comportement exact :

- **Un seul clic** sur une valeur → passage en édition, focus automatique, texte présélectionné
- `Entrée` valide · `Échap` annule · `blur` valide
- Bordure verte `#0d7a5f` sur le champ en édition
- Après validation : toast « ✓ enregistré » + mise à jour de la date de dernière modification
- Les données **formatées** (type de compte, tarif, profil, segment, tension, utilisation…)
  s'éditent en **liste de sélection**, jamais en saisie libre
- Les données libres s'éditent en saisie texte
- Les **unités sont fixes** (MWh, kVA, €) : seul le nombre est éditable
- Toute modification de champ alimente l'**onglet Historique** : champ, ancienne valeur,
  nouvelle valeur, auteur, date + heure

Implémente ça comme **un seul hook réutilisable** (`useInlineEdit`) + un composant
`<InlineField>` décliné en variantes (texte, select, nombre+unité, adresse, texte long),
utilisé partout sur toutes les fiches — pas de duplication par champ.

---

## Mobile

Même niveau de finition que le desktop, pensé nativement :
- Les 3 colonnes deviennent des **sections navigables** (bandeau de navigation bas ou swipe)
- Le fil d'activité et les onglets restent accessibles en 1 tap
- Zones tactiles ≥ 44 px
- Le ticker marché (PEG / BASE) reste visible en toute circonstance

---

## Branchement aux vraies API

Le contrat de données attendu par la page est décrit dans `03-API-CONTRACT.md`.

- Mets en place une couche `api/accounts.ts` (ou l'équivalent dans nos conventions existantes)
  avec des types stricts, et **adapte le contrat à nos endpoints réels** — ne change pas la forme
  attendue par les composants, écris un mapper.
- Les mutations d'édition inline doivent être **optimistes** : l'UI se met à jour immédiatement,
  rollback + toast d'erreur en cas d'échec. La perception de vitesse est un critère de qualité.
- États de chargement : **squelettes** aux dimensions exactes des blocs finaux, jamais de spinner
  plein écran ni de saut de mise en page.

---

## Ordre de travail recommandé

1. Lis `02-design-tokens.ts`, étends la config Tailwind, charge les polices.
2. Construis la coquille : navbar, fil d'Ariane, header + carte méta, barre d'onglets, grille 3 colonnes.
3. Construis `useInlineEdit` + `<InlineField>` — tout le reste en dépend.
4. Onglet Compte (identité, score, carte, frise), puis volet gauche, puis colonne Activité.
5. Les autres onglets dans l'ordre de la barre.
6. Responsive mobile.
7. Mode sombre.
8. Branchement API + mutations optimistes.

À chaque étape : **compare ton rendu à `01-REFERENCE-fiche-compte.html` côte à côte** et corrige
les écarts avant de passer à la suite. Ne considère pas une étape terminée s'il reste un écart visible.

---

## Ce qu'il ne faut PAS faire

- Ne porte pas `support.js` ni le format `.dc.html` : c'est notre outil de design, pas la cible.
- N'introduis pas de librairie de composants (MUI, shadcn, Ant…) : les styles sont sur mesure.
- Ne « modernise » pas, ne simplifie pas, ne réinterprète pas. Toute amélioration se propose,
  elle ne s'applique pas.
- Ne remplace pas les SVG inline par des icônes de librairie.
- Pas de dégradés agressifs ni d'emoji décoratifs ajoutés.
