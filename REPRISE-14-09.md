# Ce qui t'attend au retour — 14/09/2026

Tout est sur **master** et poussé. Il faut **redéployer Vercel** : rien de ce qui suit n'est
visible en ligne tant que ce n'est pas fait.

---

## ⚠️ Deux choses que toi seule peux faire

### 1. Chacun doit refaire sa connexion Gmail (une fois)

Le suivi des réponses demande un droit de **lecture** que les connexions précédentes n'accordaient
pas — elles ne portaient que l'envoi, et un jeton ne gagne pas un droit après coup.

**Où :** Mon Profil → un encadré orange apparaît → « Reconnecter mon compte Gmail ».

L'encadré ne s'affiche qu'après le premier passage de la tâche de rapatriement (toutes les heures
entre 7 h et 20 h), pour ne pas réclamer une reconnexion sur une supposition.

En attendant : les envois partent normalement, seules les réponses n'entrent pas.

Une nouveauté l'annonce déjà à l'équipe.

### 2. Le rattrapage des 1 082 conversations Salesforce attend

Le script est écrit et simulé (`npm exec -- node scripts/retrouver-fils-gmail.cjs`), mais il ne
peut pas s'exécuter avant que **quelqu'un ait refait sa connexion** — et il lui faut
`GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` en local, qui ne vivent que dans Vercel.

Une fois ces deux conditions réunies :

```
node scripts/retrouver-fils-gmail.cjs                 # simulation, n'écrit rien
node scripts/retrouver-fils-gmail.cjs --appliquer     # les 1 013 fils à boîte connue
node scripts/retrouver-fils-gmail.cjs --appliquer --orphelins   # + les 69 restants
```

Réversible d'une instruction — l'ancien identifiant est gardé dans `fil_origine_salesforce`.

---

## Ce qui est fait

### Les pistes ont tout Salesforce
- **26 champs** ajoutés (civilité, prénom/nom séparés, adresse, copropriétés, LinkedIn, échéance…)
- Segment, SIREN, SIRET, origine, activité **étaient déjà en base** — le type `Piste` ne les
  déclarait pas, donc aucun écran ne pouvait les lire
- « Créé par » et « Dernière modification par » : 5 113 et 5 139
- Section **Détails** sur la fiche piste, groupée par question
- Les 9 pistes manquantes, 429 tâches, 1 341 mails, 296 échanges de pistes converties

### Les contacts ont une règle qui tient
- Déclencheur en base : nom en MAJUSCULES, prénom en Capitale, civilité rangée — à **chaque**
  écriture, d'où qu'elle vienne
- 1 823 civilités reprises de Salesforce (33 avant, 1 856 après)
- Le nom se lit entier et se modifie en trois champs

### Les recherches trouvent
- La barre du haut (⌘K) **ne connaissait pas les pistes du tout** — ajoutées
- La liste cherchait la phrase entière dans 3 champs — maintenant mot à mot dans 14

### Les mails
- Le fil de conversation, à l'import comme à l'envoi
- Les réponses rapatriées toutes les heures ouvrées
- L'ouverture comptée par pixel — écrit « ouvert », **jamais « lu »** (Gmail précharge les images,
  un client qui les bloque ne compte jamais, l'expéditeur qui se relit compte aussi)

---

## Les dates et les références — sujet clos

`date_creation` porte la vraie date Salesforce : du 24/02/2025 à aujourd'hui, avec **4 539 pistes
en juin 2026** (le gros lot de prospection), 250 en octobre 2025. Les six pistes saisies à la main
gardent la leur.

Les références suivent maintenant cette chronologie, avec la bonne année :

```
PST-2025-001   SCI LA JARRIE                24/02/2025   la plus ancienne
…
PST-2026-5145  FONCIA MONTPELIER            14/09/2026   la plus récente
```

**Une ancienne référence mène encore à sa piste.** `PST-2026-10102` trouve `PST-2026-3887`,
IMMOBILIER GESTION CONSULTANT. Le résultat porte la mention « ancienne réf. » pour qu'on sache
pourquoi il sort — 485 anciens numéros sont aujourd'hui la référence courante d'une autre piste,
donc la recherche en rend parfois deux, et la mention dit laquelle répond à la note.

**Vérifié sur tout le CRM, aucun doublon nulle part :**

```
pistes 5 145 · mandats 1 489 · opportunités 114 · requêtes 884     0 doublon
ordre chronologique respecté sur les trois objets numérotés
```

Rien ne reste ouvert sur ce sujet.

---

## Vérifié avant de partir

`npm run build` · 135 tests · `npx eslint src/ api/` — tout vert.
Six migrations appliquées, chacune avec son garde-fou exécuté en production.
