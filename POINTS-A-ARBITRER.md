# Points à arbitrer avec William et Michel

Questions soulevées par les briefs de maquette et par l'état des données, que je n'ai pas tranchées
seul parce qu'elles engagent une règle métier ou une décision de schéma.

Chaque point indique **ce qui se passe aujourd'hui**, **ce que le design ou le constat demande**, et
**ce que j'ai fait en attendant**.

Mis à jour le 16/08/2026.

---

## 1. `CoverageMatrix` — « Mandat requis » masque tout le reste

**Aujourd'hui.** `src/components/site/CoverageMatrix.tsx` affiche « Mandat requis » dès que
`mandatActif` est faux, et **court-circuite toute autre évaluation** : le `if` est en premier, donc
l'échéance du contrat et la couverture par une recommandation ne sont même pas regardées.

**Ce que demande le design.** Dans l'onglet Contrats, l'absence de mandat n'est pas un problème :
on peut parfaitement connaître un contrat sans être mandaté. Le mandat conditionne la capacité à
*travailler* le compteur, pas la validité de l'information contractuelle. L'échéance et la
couverture devraient s'évaluer **indépendamment**, et l'absence de mandat devenir une information
secondaire — un badge discret, pas un statut bloquant.

**Pourquoi je n'ai pas tranché.** C'est un changement de règle métier, pas d'apparence. Le brief de
William le signale lui-même comme devant être arbitré.

**En attendant.** Comportement inchangé.

---

## 2. Statut « client / non client » d'un site

**Aujourd'hui.** `Site.statut` vaut `actif` ou `inactif`, dérivé de la colonne `sites.actif`.

**Ce que demande le design.** Un statut **client / non client**, qui est une notion différente :
un site est client s'il porte au moins un compteur client.

**La question.** Calculé à la volée depuis les compteurs, ou colonne dédiée maintenue en base ?
Le calcul à la volée est juste par construction mais coûte une jointure sur chaque affichage ; la
colonne est rapide mais peut se désynchroniser — c'est exactement ce qui est arrivé à
`comptes.nb_sites`, faux sur 2642 des 2762 comptes.

**En attendant.** `actif` n'est pas détourné pour cet usage : le brief l'interdit explicitement, et
les deux notions ne veulent pas dire la même chose.

---

## 3. Contrats client vs prospect

**Aujourd'hui.** La table `contrats` ne porte aucune notion permettant de distinguer un contrat
**signé par KiWee** d'un contrat **dont on connaît seulement les informations** sans le gérer.

**Ce que demande le design.** L'onglet Contrats les distingue visuellement.

**La question.** Colonne dédiée sur `contrats` ? Ou déduction à partir d'autre chose — la présence
d'un mandat actif sur le compteur, ou le fait que KiWee soit l'intermédiaire ? Une règle de
déduction serait plus fragile qu'une colonne, mais éviterait une saisie de plus.

**En attendant.** La distinction n'est pas affichée.

---

## 4. Mapping de l'étape « Instruction » (Salesforce → Kimatch)

**Le conflit.** Le compte rendu de la réunion du 12/08/2026, cité par la migration
`20260812090000`, dit : « Consultation, ça correspondait à En instruction ». Mais le lot Marie du
13/08 a rendu une opportunité « Instruction » en **DIAGNOSTIC**, et c'est ce précédent que j'ai
suivi le 15/08 pour les 9 opportunités importées.

**Pourquoi ça compte.** Si l'intention est bien CONSULTATION, ce n'est pas 9 lignes qu'il faut
reprendre mais **tout le stock**. L'origine Salesforce n'étant conservée sur aucune recommandation,
la répartition actuelle (CLOTURE 1573, CONSULTATION 93, DIAGNOSTIC 24, DECISION 4) ne permet pas de
retrouver de quel `StageName` chaque ligne venait.

**En attendant.** DIAGNOSTIC, par cohérence avec le seul précédent postérieur au remappage.

---

## 5. Doublons de mandats CABINET MOLINIER et KIWEE ENERGIE

**Le constat.** Kimatch porte 2 mandats CABINET MOLINIER créés le 14/08 (un SIGNE, un A_PREPARER)
et 1 mandat KIWEE ENERGIE du 15/08, tous sans `id_salesforce`. Salesforce porte de son côté
`Mandat 001746` (MOLINIER, signé le 14/08) et `Mandat 001734` (KIWEE, Inactif).

**La question.** Lequel fait foi ? Et le mandat MOLINIER « A_PREPARER » en trop est-il à supprimer ?

**En attendant.** Les trois mandats Salesforce ont été **écartés** de l'import du 15/08 pour ne pas
créer de doublon sur une fiche déjà sensible. Rien n'a été supprimé côté Kimatch.

---

## 6. Anciens collaborateurs — comptes d'authentification techniques

**Ce que j'ai fait.** Pour rendre aux 95 mandats sans créateur les noms de Franck EYOA, Lauren
TOURREAU et Adeline HADEY, il a fallu créer des profils — or `profils.id` référence
`auth.users(id)`, un profil ne peut donc pas exister sans compte d'authentification.

Les trois comptes créés sont **inertes** : adresse en `@ancien.kiwee-energie.invalid` (le domaine
`.invalid` est réservé par la RFC 2606 et n'est routable nulle part, aucun lien magique ne peut y
arriver), sans mot de passe, non confirmés, et le rôle CONSEILLER attribué par défaut est retiré.

**À valider.** Cette approche convient-elle, ou préfère-t-on une colonne texte `cree_par_nom` sans
compte du tout ? Seuls 18 des 95 mandats ont pu être rattachés ; les 77 autres n'ont aucune
référence exploitable.

---

## 7. `comptes.nb_sites` est faux sur 96 % des lignes

**Le constat.** La colonne vaut autre chose que le nombre réel de sites sur **2642 des 2762
comptes**. C'est une valeur figée à l'import, jamais reprise depuis.

**Ce que j'ai fait.** La vue `v_comptes_liste` recalcule le nombre réel, et la liste des comptes ne
lit plus la colonne.

**Ce qui reste à décider.** Faut-il corriger la colonne elle-même — d'autres écrans ou exports
pourraient la lire — ou la supprimer pour éviter qu'elle ne réinduise en erreur ?

---

## 8. Frise PEG / BASE — source de données

**Le constat.** `useMarketTicker()` (`src/lib/data/marche.ts`) renvoie `null` volontairement : aucun
flux de cotation n'est branché. Le bandeau affiche des tirets. Le brief de William est explicite —
« n'invente pas de cotations ».

**À décider.** Quel fournisseur de données de marché, à quelle fréquence de rafraîchissement, et
faut-il conserver un historique pour tracer la frise ?

**En attendant.** Le bandeau reste en tirets. Rien n'est simulé.
