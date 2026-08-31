# KiMatch — état des lieux face à la cible

*Comparaison entre le dossier de transmission du 31 août 2026 et l'application telle qu'elle
fonctionne aujourd'hui. Tous les chiffres proviennent d'un relevé sur la base de production du
31 août 2026.*

---

## Résumé en cinq lignes

Le modèle de données n'est pas à refaire : les objets de la chaîne commerciale existent tous.
Un objet de la cible, en revanche, n'existe pas du tout : **le suivi de contrat**.
Le **recalcul horaire des signaux** est techniquement impossible en l'état — la plateforme actuelle
ne le permet pas.
La **sandbox n'est pas anonymisée**, ce qui bloque toute recette faite en dehors de l'équipe.
Et trois obstacles n'ont rien de technique : **des données que personne ne saisit**.

---

## 1. Ce qui est déjà conforme à la cible

### Les statuts se calculent, ils ne se choisissent plus

Le dossier demande que les statuts « résultent des données réellement présentes, et non d'un choix
manuel arbitraire ». C'est déjà le cas sur les deux objets qui comptent.

**Pour une recommandation :** son état suit automatiquement sa version active. Concrètement, quand
quelqu'un change le statut d'une version, la base met à jour le dossier toute seule — personne ne
peut les désynchroniser. *Huit scénarios de test vérifient cette mécanique, et les huit passent.*

**Pour un contrat :** son état (à venir, en cours, expiré) est **déduit de ses deux dates** au moment
où on l'affiche, au lieu d'être stocké dans une case.

> **Pourquoi c'est important.** Une valeur stockée vieillit en silence. Un contrat dont la date de
> fin est passée hier continuait d'annoncer « En cours » jusqu'à ce que quelqu'un modifie la ligne —
> et rien ne la modifiait. Déduite à l'affichage, l'information ne peut plus être en retard.
> *La règle a été vérifiée sur 1 565 contrats sur 1 565, sans une seule exception.*

### L'historique dit qui a fait quoi, et distingue les humains des automatismes

Le dossier exige un historique où « l'auteur ou l'origine système » est visible.

**20 tables sont tracées**, et sur **122 683 modifications enregistrées, aucune n'est anonyme**.
Quand ce n'est pas une personne mais un traitement automatique, l'historique le dit explicitement —
il n'affiche jamais un nom de logiciel comme s'il s'agissait d'un collègue.

### La bascule « Mes dossiers / Équipe »

Elle est en place sur **les 16 listes** de l'application, avec un tri et des filtres sur les quatre
vues en colonnes. Ce travail était fait avant réception du dossier.

### La palette n'est pas à réinventer

Le vert d'action du dossier — `#0D7A5F` — **est déjà celui de KiMatch**. Les onze autres couleurs
diffèrent des nôtres, mais la couleur d'identité est commune.

---

## 2. Le plus gros écart : le suivi de contrat n'existe pas

Les chapitres 7 et 8 du dossier décrivent un objet entier :

- **8 étapes** — à préparer, résiliation à confirmer, en attente d'activation, contrat actif, suivi
  client, renouvellement à anticiper, en renouvellement, terminé
- **11 automatisations datées** — dossier de bienvenue, relances de résiliation, alerte anti-double
  signature, contrôle de bascule, contrôle de première facture, suivi à M+4/M+6, bilan annuel, alerte
  de renouvellement à échéance moins douze mois
- **10 rattachements obligatoires**
- Un **indicateur de santé** : sain, à surveiller, à risque, opportunité

**Rien de tout cela n'existe aujourd'hui.** Ni la table qui stockerait ces suivis, ni les étapes, ni
l'indicateur.

Dans le plan du dossier, ce sujet est rangé au lot 4, en compagnie du Pricing et des Requêtes.
**C'est un lot à lui seul :** un objet métier complet, avec son cycle de vie et sa mécanique
d'automatisation.

---

## 3. Le recalcul horaire des signaux : impossible en l'état

### Ce qui existe

Les signaux **sont** créés automatiquement — c'est vérifié : **1 456 signaux, aucun créé par une
personne**.

Mais le recalcul tourne **une fois par jour, à 3 h 30 du matin**, et non chaque heure.

### Pourquoi

L'application fait tourner ses tâches automatiques chez Vercel, son hébergeur. **Le plan actuel
limite ces tâches à une exécution par jour.** Ce n'est pas un oubli de programmation : c'est une
limite de l'abonnement.

*Trois tâches tournent ainsi aujourd'hui : rafraîchissement des sessions DocuSign à 3 h,
expiration des mandats à 3 h 15, calcul des échéances de signaux à 3 h 30.*

### Les trois façons d'y arriver

| Solution | Ce que ça implique | Coût |
|---|---|---|
| **Déplacer le calcul dans la base** (`pg_cron` chez Supabase) | Le calcul est réécrit en langage de base de données et s'exécute là où vivent les données. Plus aucune dépendance à l'hébergeur, aucune limite de durée. | Temps de développement |
| **Passer à l'abonnement Vercel supérieur** | Les tâches deviennent libres, rien à réécrire. | Abonnement mensuel récurrent |
| **Un déclencheur externe** (GitHub, Cloudflare) | Un service tiers appelle l'application toutes les heures. | Gratuit, mais une dépendance de plus à surveiller |

**Solution recommandée : la première.** Le calcul vit à côté des données qu'il lit, et l'application
ne dépend plus de son hébergeur pour une fonction métier.

### Une question à trancher avant de choisir

Un signal naît d'une **échéance de contrat** : une donnée qui change quand quelqu'un la saisit, pas
au rythme du marché.

Passer de 24 heures à 1 heure demande un chantier. Passer à 4 heures demande le même chantier. **Si
le besoin réel est « que ce soit à jour quand le commercial arrive le matin », c'est déjà le cas.**

Il est utile de savoir ce que l'heure apporte concrètement avant d'engager le développement.

---

## 4. Les écarts fonctionnels, écran par écran

### Pricing — le statut « disponible » manque

Le dossier insiste sur une distinction : *« acceptée ne veut pas dire disponible »*. Une demande
acceptée signifie que le fournisseur accepte de faire une offre ; une offre disponible signifie que
les prix sont là et comparables.

**Ce second statut n'existe pas dans KiMatch.** Il est simple à créer.

### Versions de recommandation — rien ne les protège

Le dossier demande qu'une nouvelle version « ne supprime ni ne réécrive les précédentes ».

La colonne prévue pour verrouiller une version s'appelle `est_figee`. Elle **vaut « non » sur les
2 030 versions de la base** : rien n'empêche donc aujourd'hui de modifier une version déjà présentée
à un client.

> C'est un petit développement, mais l'enjeu est réel : il s'agit de ce qu'on a montré au client et
> de ce qu'on peut encore prouver.

### Pistes — quatre validations sur cinq, et pas les mêmes

Le dossier demande cinq validations avant de convertir une piste : compte identifié, contact utile,
besoin énergétique compris, potentiel estimé, **motif commercial confirmé**.

KiMatch en a quatre : société validée, contact validé, e-mail validé, portable validé.

**Les deux listes ne se recouvrent qu'à moitié.** Ce n'est pas une colonne à ajouter, c'est une
refonte du modèle de la piste.

### Signaux — ni source, ni niveau de confiance

Le dossier demande d'afficher « pourquoi le signal existe, sur quelles sources et avec quel niveau de
confiance ». Un signal porte aujourd'hui un type et une gravité — les deux autres informations
n'existent pas et sont à créer.

Par ailleurs, le motif d'écartement d'un signal **n'est pas obligatoire**, alors que le dossier
l'exige.

### Requêtes — aucune règle obligatoire

Le dossier exige qu'une requête en traitement ait un responsable et une prochaine action, et qu'une
requête clôturée ait une résolution écrite ou un motif d'abandon. **Aucune de ces contraintes n'est
en place.**

Les quatre types (demande, réclamation, contrôle contractuel, contrôle tarifaire) correspondent en
revanche exactement à la cible.

### Design — deux règles non respectées

- **Aucune information sous 11 px** : la fiche compte descend à 10 px sur l'historique et les
  pastilles de statut.
- **Deux systèmes de couleurs cohabitent** dans le code (un récent, un ancien). La refonte devrait
  être l'occasion d'en supprimer un.

### Le mode sombre : présent dans l'application, absent du dossier

KiMatch fonctionne en mode sombre, et cela marche. Le dossier ne le mentionne nulle part.
**À trancher : on le conserve, ou on l'abandonne ?**

---

## 5. L'environnement de test

Une copie de la base existe (« sandbox »), alimentée depuis la production, toujours dans ce sens et
jamais l'inverse.

### Elle n'était pas utilisable, c'est réparé

La liste des tables à recopier est écrite à la main dans le code. Elle en nommait **107 sur 133**.
Les 24 manquantes n'étaient pas copiées — **sans message d'erreur, sans avertissement**.

Ce qui manquait n'était pas anecdotique : 3 535 rattachements entre contacts et comptes, 2 098 liens
entre recommandations et compteurs, 1 907 durées de version, et **quatre jeux de statuts entiers**.

> **Pourquoi c'était grave.** Une sandbox sert à répéter une manipulation avant de la faire pour de
> vrai. Répéter dans une copie qui a perdu ses tables de liaison ne prouve rien : le test réussit
> parce que les données problématiques ne sont pas là.

Un contrôle automatique empêche désormais cette dérive de se reproduire.

### Ce qui manque encore : l'anonymisation

La sandbox est une **copie fidèle** : vrais clients, vrais contacts, vrais e-mails, vrais numéros.

Le dossier exige de « travailler avec des données fictives ou anonymisées » et de « ne jamais tester
les scénarios d'écriture avec de vraies données clients ».

Il faut donc ajouter une étape qui remplace les noms, e-mails et téléphones par des valeurs
inventées. **C'est un chantier à part entière, et c'est la condition de toute recette faite en dehors
de l'équipe.**

---

## 6. Les trois obstacles qui ne sont pas techniques

Ce sont, de loin, les plus importants.

### Les offres fournisseurs ne sont presque jamais saisies

Sur **22 versions de recommandation en attente de décision, 21 n'ont aucune offre enregistrée**. Sur
les versions clôturées : 1 975 sur 1 983.

Le dossier décrit un pricing riche — comparatif d'offres, offres disponibles, offres expirées. Le
schéma de base de données pour tout cela existe déjà. **Les données, non.**

> Un écran de comparaison d'offres, aussi bien conçu soit-il, ne servira à personne tant que les
> offres ne sont pas saisies. La question n'est pas technique.

### 549 contrats n'ont aucun fournisseur

Vérification faite dans Salesforce : **il ne le connaît pas non plus** pour 511 d'entre eux. Ce n'est
donc pas une perte lors de la reprise des données — **l'information n'a jamais été saisie nulle
part.**

### Trois objets spécifiés en détail sont pratiquement vides

| Objet | Lignes en base |
|---|---:|
| Pistes | **4** |
| Opportunités | **1** |
| Requêtes | **2** |

Ce sont trois des objets que le dossier spécifie le plus finement. Développer finement un parcours
que personne n'emprunte encore présente un risque : produire des écrans exacts et vides.

---

## 7. Les volumes réels de la base

Utile pour dimensionner les travaux.

| Objet | Lignes | Conformité à la cible |
|---|---:|---|
| Comptes | 2 767 | conforme |
| Sites | 6 364 | conforme |
| Compteurs | 7 905 | conforme |
| Contrats | 1 600 | trois jeux de statuts, dont un qui en mélange deux notions |
| Signaux | 1 456 | source et niveau de confiance manquants |
| Recommandations | 1 712 | conforme |
| Versions | 2 030 | verrouillage jamais utilisé |
| Consultations pricing | 3 533 | statut « disponible » manquant |
| Pistes | 4 | 4 validations sur 5, axes différents |
| Opportunités | 1 | conforme, mais jamais éprouvé |
| Requêtes | 2 | aucune contrainte obligatoire |
| **Suivis de contrat** | **—** | **inexistant** |

La base compte **133 tables, dont 39 entièrement vides**. En lisant le schéma, on croit qu'il existe
un moteur de calcul tarifaire et un second système de permissions : **ni l'un ni l'autre n'existe**.
Ces tables sont documentées comme héritage, pour éviter que quelqu'un construise par-dessus.

---

## 8. Ajustements proposés au plan de réalisation

Le découpage en sept lots du dossier est solide. Trois ajustements :

**Un lot dédié au suivi de contrat.** Il est actuellement noyé au lot 4 alors qu'il n'existe pas du
tout.

**Traiter la question de la saisie avant celle des écrans**, pour les trois obstacles du point 6.

**Démarrer le lot 1 « Fondations UI » immédiatement.** Il ne dépend d'aucune décision métier :
navigation en quatre zones, palette, trame d'espacement, gabarits de liste et de fiche en trois
colonnes. C'est aussi ce qui permet la première démonstration demandée dans le dossier.

### Pourquoi le chiffrage n'est pas encore possible

Le dossier demande un découpage avec charges et calendrier. Un lot dont on ne connaît pas le contenu
ne s'estime pas de façon fiable — et le suivi de contrat est exactement dans ce cas : son ampleur
dépend du nombre d'automatisations réellement retenues.

Les quatre livrables restants (schéma d'architecture, découpage chiffré, liste des migrations, plan de
tests et de retour arrière) découlent des arbitrages ci-dessous.

---

## 9. Points à trancher

Par ordre d'impact sur le chiffrage :

1. **Le suivi de contrat** — objet entier à créer. Quelle priorité par rapport au reste ?
2. **Le recalcul horaire** — l'heure est-elle le besoin réel ? Trois solutions, dont une payante.
3. **Les trois obstacles de saisie** — offres fournisseurs, fournisseurs de contrats, objets vides.
4. **Les cinq validations de piste** — refondre le modèle, ou aligner la cible sur l'existant ?
5. **L'anonymisation de la sandbox** — condition de toute recette externe.
6. **Le mode sombre** — présent dans l'application, absent du dossier. Conservé ou abandonné ?
