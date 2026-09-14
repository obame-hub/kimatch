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

## Une décision qui t'attend

Les 5 131 pistes reprises sont **toutes datées du 01/09/2026** dans `date_creation` — le jour de
l'import. La vraie date est dans `date_creation_salesforce` (454 en 2025, 4 685 en 2026) et
s'affiche dans Détails.

Basculer `date_creation` dessus changerait l'ordre de toutes les listes et les anciennetés.
C'est une décision, pas un effet de bord : **dis-moi si je la fais.**

---

## Vérifié avant de partir

`npm run build` · 135 tests · `npx eslint src/ api/` — tout vert.
Six migrations appliquées, chacune avec son garde-fou exécuté en production.
