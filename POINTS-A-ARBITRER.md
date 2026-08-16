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

---

## 9. Édition en place — les trois fiches non converties

**Ce que j'ai fait le 16/08/2026.** Huit fiches sur onze n'ont plus aucune modale « Modifier » :
site, contrat, tâche, mandat, recommandation, signal, interaction, document. Les champs s'éditent
là où ils s'affichent, et les champs vides apparaissent en pointillé cliquable au lieu de
disparaître — c'était le vrai problème : sur la recommandation, le contrat, l'interaction et le
signal, plusieurs champs n'étaient **pas affichés tant qu'ils étaient vides**, donc rien n'invitait
à les remplir et il fallait ouvrir la modale pour découvrir qu'ils existaient.

**Ce qui reste.** Compte (4 modales, une par type de compte), Compteur et Contact. Ces trois fiches
ont déjà de l'édition en place sur une partie de leurs champs ; leurs modales couvrent le reste.

**À décider.** Sur la fiche compte, les quatre variantes (client, fournisseur, partenaire, générique)
ne montrent pas les mêmes champs. Faut-il quatre blocs d'édition en place distincts, ou un seul bloc
qui masque les champs hors sujet ? C'est une question de maquette, pas de technique.

---

## 10. Finalités de clôture — cinq dans la maquette, trois en base

**Le conflit.** La maquette « Fiche Opportunité » propose cinq qualifications finales :
**Convertie, Non qualifiée, Perdue, Reportée, Annulée**.

La base en utilise trois, sur 1573 recommandations closes :

| `finalite_cloture` | lignes |
|---|---|
| ACCEPTEE | 867 |
| EXPIREE | 386 |
| REFUSEE | 320 |
| (vide) | 130 |

**Pourquoi je n'ai pas tranché.** Les deux vocabulaires ne se recouvrent pas. « Convertie » n'est
pas la même chose qu'« ACCEPTEE » — une reco acceptée par le client n'est convertie qu'une fois le
contrat signé. Et surtout, **ni « Reportée » ni « Annulée » n'ont d'équivalent** : ce sont deux
états nouveaux. Choisir une correspondance reviendrait à réécrire le sens de 1573 recommandations
closes sur une hypothèse, exactement le travers qui a produit les 1471 dates de clôture fausses du
12/08.

**Ce que ça bloque.** La règle « la date de réactivation est obligatoire » ne se déclenche que sur
la finalité *Reportée*. Tant que cette finalité n'existe pas, la colonne
`recommandations.date_reactivation` reste sans usage.

**En attendant.** Migration `20260816170000` livrée : elle ajoute `motif_cloture` (le motif
obligatoire, qu'on ne savait pas stocker — on ferme aujourd'hui une recommandation sans que
personne ne puisse savoir pourquoi) et `date_reactivation`. Elle **ne touche à aucune des 1573
lignes** et ne remappe rien.

**La question pour William.** Garde-t-on les trois finalités actuelles en y ajoutant Reportée et
Annulée ? Ou bascule-t-on sur les cinq de la maquette, avec une table de correspondance explicite
pour l'existant ?

---

## 11. « Opportunité » et « Recommandation » : un écran ou deux ?

**Le constat.** Les maquettes contiennent **deux fiches distinctes** : `Fiche Opportunite` (onglets
Opportunité / Fichiers / Historique, périmètre de compteurs, flux de clôture, création de mandat) et
`Fiche Recommandation` (versions, stratégie, proposition commerciale, lien vers l'étude client).

Kimatch n'a qu'une seule entité, `recommandations`, avec ses `versions_recommandation`.

**La question.** Est-ce que William décrit deux objets métier réellement différents — l'opportunité
étant l'affaire, la recommandation étant la proposition qu'on lui adresse — ou deux vues du même
objet ? La réponse change le modèle de données, pas seulement l'écran.

**En attendant.** Rien n'est scindé. C'est le premier point à trancher avant d'aller plus loin dans
les maquettes Opportunité et Recommandation.
