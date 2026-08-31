# Lot 0 — Écarts entre la cible et KiMatch existant

*Réponse au dossier de transmission du 31/08/2026. Chiffres relevés le 31/08/2026 sur la base de
production.*

Michel demande six livrables et pose sept questions. Ce document couvre le **livrable 1** (audit des
écarts) et répond aux **quatre questions dont je suis responsable**. Les cinq autres livrables
découlent de celui-ci et ne peuvent pas être chiffrés avant qu'il soit validé.

---

## En une page

**La bonne nouvelle.** Les objets de la chaîne existent tous, avec leurs tables, leurs statuts et
leurs liaisons. Le modèle de données n'est pas à refaire. Trois des « principes non négociables »
sont même déjà en place et vérifiés : les statuts se calculent depuis les données, l'historique
distingue les événements humains des traitements automatiques, et la traçabilité avant/après est
complète sur 20 tables.

**Le point dur.** Un objet entier de la cible **n'existe pas** : le **suivi de contrat**, avec ses
huit étapes, ses onze automatisations et son indicateur de santé. C'est le chapitre 7-8 du dossier,
et c'est à lui seul un lot de développement.

**Le point à trancher avant de coder.** Le dossier suppose que les signaux sont *« créés
automatiquement, recalculés chaque heure »*. Ils sont bien créés automatiquement — **1 456 signaux,
zéro auteur humain** — mais le recalcul tourne **une fois par jour à 3 h 30**, pas chaque heure. Ce
n'est pas un oubli technique, c'est une contrainte de plateforme (voir Q3).

---

## Écart par chapitre du dossier

Légende : ✅ conforme · 🟡 partiel · 🔴 absent

### Chapitre 2 — Architecture de navigation

| Exigence | État | Écart précis |
|---|---|---|
| Quatre zones : Pilotage / Référentiel / Développement / Production | 🟡 | Trois zones aujourd'hui (Pilotage, Cycle commercial, Production). « Référentiel » n'existe pas comme zone — Patrimoine est rangé dans Pilotage. Renommage + déplacement, sans impact données. |
| Bascule « Mes dossiers / Équipe » sur les listes | ✅ | Posée sur **les 16 listes** le 30/08. Libellés « Mes X / Tous les X » à aligner sur le vocabulaire « Équipe » du dossier. |
| Fiche en trois colonnes : rattachements à gauche, objet au centre, activité à droite | 🟡 | La fiche compte respecte déjà ce modèle. Les **11 autres fiches** ne l'appliquent pas, et certaines gardent un onglet « Activité » que le dossier interdit explicitement. |
| Quatre indicateurs maximum par liste | 🟡 | Respecté sauf Requêtes (3) et Vue d'ensemble, qui porte un bloc performance **entièrement vide** (0 €, 0 %, « — »). |
| Chaque ligne ouvre la fiche | ✅ | Fait le 30/08 : les cartes et tuiles sont redevenues des liens (clic milieu, Ctrl+clic). Restent les lignes de tableau `<tr>`, qui ne peuvent pas être des liens en HTML. |

### Chapitre 3 — Système de design

| Exigence | État | Écart précis |
|---|---|---|
| Palette 12 couleurs | 🟡 | Le vert d'action `#0D7A5F` est **déjà celui de KiMatch**. Les 11 autres valeurs diffèrent de nos jetons actuels. Deux espaces de jetons cohabitent (`kw-*` récent, `navy-*` ancien) : la refonte doit être l'occasion d'en supprimer un. |
| Trame d'espacement 4/8/12/16/24/32 | 🟡 | Tailwind par défaut, donc compatible, mais l'app porte des valeurs en dur (`text-[11.5px]`, `px-[17px]`) à normaliser. |
| Texte courant 13–14 px, rien sous 11 px | 🔴 | **Non respecté** : la fiche compte descend à `10.5px` et `10px` sur l'historique et les pastilles. À corriger écran par écran. |
| Mode sombre | ⚠️ | **Absent du dossier**, mais présent dans l'app et fonctionnel (34 jetons, vérifié le 29/08). Question pour Michel : on le garde ou on l'abandonne ? Le dossier ne le mentionne pas. |

### Chapitres 4–5 — Pilotage, Patrimoine, Signaux, Pistes, Opportunités

| Exigence | État | Écart précis |
|---|---|---|
| Signaux créés automatiquement | ✅ | **1 456 signaux, 0 créé par une personne.** |
| Deux décisions seulement : créer une opportunité, ou écarter avec motif obligatoire | 🟡 | Les deux existent. Le motif d'écartement **n'est pas obligatoire** aujourd'hui. |
| Recalcul **horaire** et classement par priorité | 🔴 | Recalcul **quotidien à 3 h 30** (`/api/signaux/echeances`). Voir Q3. |
| Explication visible : pourquoi, sources, niveau de confiance | 🔴 | Le signal porte un type et une gravité, **pas de source ni de niveau de confiance**. Colonnes à créer. |
| Cinq validations de piste | 🟡 | **Quatre existent** : `societe_validee`, `contact_valide`, `email_valide`, `portable_valide`. Le dossier demande : compte, contact, besoin énergétique, potentiel, **motif commercial**. Les axes ne se recouvrent qu'à moitié — c'est une refonte du modèle, pas un ajout de colonne. |
| Quatre étapes d'opportunité dérivées automatiquement | ✅ | Les quatre existent (`NOUVELLE`, `EN_QUALIFICATION`, `COUVERTURE_MANDAT`, `PRETE_A_CONVERTIR`) et sont dérivées. **Mais la base ne contient qu'UNE opportunité** : la mécanique n'a jamais tourné en vrai. |
| Blocage : pas de recommandation sans périmètre, mandat et accord | 🟡 | Le contrôle existe côté écran. **Rien ne l'empêche en base.** |

### Chapitre 6 — Recommandations et Pricing

| Exigence | État | Écart précis |
|---|---|---|
| La version active détermine l'état du dossier | ✅ | Déclencheur SQL, **8 scénarios sur 8 testés** le 31/08. |
| Une nouvelle version ne réécrit pas les précédentes | 🟡 | 2 030 versions sur 1 514 dossiers (1,89 en moyenne), chacune avec sa version courante. **Mais `est_figee` vaut `false` sur les 2 030** : rien n'empêche techniquement de modifier une version présentée. |
| Statut pricing « Demande disponible » | 🔴 | **N'existe pas.** Nos statuts sont `ENVOYEE`, `ACCEPTEE`, `RECUE`, `REFUSEE` + 4 intermédiaires. Le dossier insiste : *« acceptée ne veut pas dire disponible »* — c'est précisément la distinction qui manque. |
| Offres expirées clairement identifiées | 🔴 | `date_validite` existe, **rien ne l'exploite à l'écran**. |
| Demandes refusées masquées par défaut mais consultables | ✅ | Fait. |

> **⚠️ Le point qui conditionne tout le chapitre 6.** Le dossier décrit un pricing riche — comparatif,
> offres disponibles, offres expirées. Or **21 versions « En décision » sur 22 n'ont aucune offre
> saisie**, et 1 975 sur 1 983 des clôturées. Le schéma existe, les données non. Construire un écran
> de comparaison ne servira personne tant que cette question-là n'est pas réglée, et elle n'est pas
> technique.

### Chapitres 7–8 — Requêtes et Suivi de contrat

| Exigence | État | Écart précis |
|---|---|---|
| Requêtes : 4 types | ✅ | Les quatre exacts du dossier. |
| Requêtes : 3 statuts Nouvelle → En traitement → Clôturée | 🟡 | Nous en avons **quatre** : `NOUVELLE`, `EN_TRAITEMENT`, `RESOLUE`, `ABANDONNEE`. Le dossier réunit les deux dernières sous « Clôturée » — c'est déjà ce que fait l'écran (3 colonnes pour 4 statuts). |
| Responsable et prochaine action obligatoires en traitement | 🔴 | Aucune contrainte. |
| Résolution écrite / motif d'abandon obligatoires à la clôture | 🔴 | Aucune contrainte. |
| **Suivi de contrat : 8 étapes, 11 automatisations, indicateur de santé** | 🔴 | **AUCUNE TABLE N'EXISTE.** Ni `suivis_contrats`, ni étapes, ni indicateur. C'est le plus gros écart du dossier : un objet métier entier, avec son cycle de vie, ses onze automatisations datées et ses dix rattachements obligatoires. |

### Chapitre 9 — Règles transverses

| Exigence | État |
|---|---|
| Statuts calculés depuis les données | ✅ Vérifié : recommandations (déclencheur testé), contrats (règle vérifiée 1 565/1 565 le 30/08). |
| Historique : événements humains **et** automatiques datés, auteur ou origine visible | ✅ Fait le 29/08. 20 tables tracées, **0 ligne muette sur 122 683**, colonne `origine` qui nomme le traitement quand ce n'est personne. |
| Aucune perte ni écrasement silencieux, traçabilité avant/après | ✅ Fait. |
| Prochaine action toujours visible | 🟡 Existe sur les opportunités, absente ailleurs. |
| Suggestions contextuelles et actionnables | 🔴 Rien de tel aujourd'hui. |
| Salesforce en lecture seule | ✅ Respecté sans exception. |

---

## Réponses aux quatre questions dont je suis responsable

### Q1 — Quels objets et statuts existent déjà dans la base ?

**133 tables**, dont **39 entièrement vides** — j'ai documenté ces dernières le 30/08 dans
[docs/heritage-tables-inertes.md](heritage-tables-inertes.md), parce qu'en lisant le schéma on croit
qu'il existe un moteur de calcul tarifaire et un second modèle de permissions : **ni l'un ni l'autre
n'existe.**

Les objets de la chaîne, avec leur volume réel :

| Objet | Lignes | Statuts | Conforme à la cible ? |
|---|---:|---|---|
| Comptes | 2 767 | — | ✅ |
| Sites | 6 364 | — | ✅ |
| Compteurs | 7 905 | — | ✅ |
| Contrats | 1 600 | **trois jeux** (voir ci-dessous) | 🟡 |
| Signaux | 1 456 | 5 | 🟡 sources et confiance manquantes |
| Pistes | **4** | 3 colonnes dérivées | 🟡 4 validations sur 5 |
| Opportunités | **1** | 6 | ✅ mécanique jamais éprouvée |
| Recommandations | 1 712 | 11 étapes | ✅ |
| Versions | 2 030 | 4 | 🟡 `est_figee` inexploité |
| Pricing (consultations) | 3 533 | 8 | 🔴 « disponible » manquant |
| Requêtes | **2** | 4 | 🟡 contraintes absentes |
| **Suivis de contrat** | **—** | **—** | 🔴 **inexistant** |

**Le cas des contrats, à connaître avant de chiffrer.** Un contrat porte trois statuts. J'ai traité
le sujet le 31/08 : ils ne font pas doublon, l'ancien **mélange** deux notions (« Actif/Terminé/À
venir » sur 1 565 lignes et « À signer/Signé » sur 35). L'écran montre désormais le statut de vie,
**déduit des dates** et non lu en base — une valeur stockée vieillissait en silence dès que la date
de fin passait.

**Ce que les volumes disent, et qui compte plus que le schéma.** Pistes 4, opportunités 1,
requêtes 2. Ces trois objets sont spécifiés en détail dans le dossier alors qu'ils sont
**pratiquement inutilisés**. Le risque n'est pas technique : c'est de développer finement un
parcours que personne n'emprunte encore. Je recommande de traiter ces trois-là **après** avoir
compris pourquoi ils sont vides.

### Q2 — Comment versionner une recommandation aujourd'hui ?

Le mécanisme existe et il est **testé** :

- La recommandation est le dossier durable, la version l'unité de travail — exactement le modèle du
  dossier.
- **2 030 versions sur 1 514 dossiers**, soit 1,89 en moyenne. Chaque dossier a exactement une
  version marquée courante.
- Un déclencheur PostgreSQL recalcule l'étape du dossier depuis **la version courante** à chaque
  écriture. J'ai écrit le banc d'essai le 31/08 : **8 scénarios sur 8**, dont le piège du tri
  (`version_actuelle` avant `numero_version`). `npm run test:statuts`.

**Le seul écart réel : `est_figee` vaut `false` sur les 2 030 versions.** Le dossier demande qu'une
nouvelle version « ne supprime ni ne réécrive » les précédentes. La colonne existe pour ça, elle
n'est jamais posée — rien n'empêche donc de modifier une version déjà présentée au client. C'est un
petit développement, mais il touche à la valeur juridique de ce qu'on a montré.

### Q3 — Quel moteur exécute les recalculs horaires ?

**Aucun, et ce n'est pas un oubli.** Trois tâches planifiées tournent aujourd'hui, toutes en crons
Vercel, toutes **quotidiennes** :

| Tâche | Horaire |
|---|---|
| `/api/docusign/refresh-sessions` | 3 h 00 |
| `/api/mandats/expirer` | 3 h 15 |
| `/api/signaux/echeances` | 3 h 30 |

**Le plan Vercel actuel limite les crons à une exécution par jour.** Un recalcul horaire des signaux
demande donc l'un de ces trois chemins :

1. **`pg_cron` côté Supabase** — le recalcul devient une fonction SQL déclenchée en base, toutes les
   heures. C'est ma recommandation : pas de dépendance à Vercel, pas de limite de durée, et le calcul
   vit à côté des données qu'il lit. Coût : réécrire la logique de `/api/signaux/echeances` en SQL.
2. **Passer au plan Vercel Pro** — les crons deviennent libres. Coût mensuel, à arbitrer par Michel.
3. **Un ordonnanceur externe** (GitHub Actions, Cloudflare) qui appelle l'endpoint. Gratuit mais
   ajoute une dépendance de plus à surveiller.

**Question pour Michel avant de choisir : l'heure est-elle le vrai besoin ?** Un signal naît d'une
échéance de contrat, donnée qui change au rythme d'une saisie humaine. Passer de 24 h à 1 h coûte un
chantier ; passer à 4 h coûte le même. Si le besoin réel est « avant que le commercial arrive le
matin », c'est déjà le cas.

### Q4 — Quel environnement de test et quelles données anonymisées ?

**Une sandbox Supabase existe**, alimentée par `/api/admin/refresh-sandbox`, déclenchée depuis
l'administration de la production, **toujours à sens unique**.

**Elle n'était pas utilisable, et je l'ai réparée le 31/08.** La liste des tables à recopier est
écrite à la main : elle nommait **107 tables sur 133**. Les 24 manquantes n'étaient pas recopiées,
sans erreur ni avertissement — 3 535 rattachements contact-compte, 2 098 liens
recommandation-compteur, 1 907 durées de version, et **quatre jeux de statuts entiers**. Répéter un
geste dans une sandbox qui a perdu ses tables de liaison ne prouve rien. `npm run verifier:sandbox`
empêche désormais la dérive.

**Deux manques subsistent, et ils bloquent la recette telle que Michel la décrit :**

1. **Les données ne sont pas anonymisées.** La sandbox est une copie fidèle : vrais clients, vrais
   contacts, vrais e-mails. Le dossier exige « des données fictives ou anonymisées » — il faut donc
   une étape de brouillage (noms, e-mails, téléphones) dans la recopie. Chantier à part entière, et
   c'est celui qui conditionne toute recette faite par des tiers.
2. **La sandbox date du 3 août.** Un rafraîchissement est nécessaire avant le lot 0 : ses
   identifiants ne vivent que côté Vercel, c'est un geste à faire depuis l'administration.

---

## Ce que je recommande pour le plan de lots

Le découpage de Michel (chapitre 10) est bon. Trois ajustements, tirés de ce qui précède :

**1. Ajouter un lot pour le suivi de contrat.** Il est aujourd'hui noyé dans le lot 4 avec Pricing et
Requêtes, alors qu'il n'existe pas du tout : table, huit étapes, onze automatisations datées, dix
rattachements, indicateur de santé. C'est le plus gros morceau du dossier et il mérite son lot.

**2. Traiter la question de la saisie avant celle des écrans.** Trois blocages du dossier ne sont pas
techniques :
- les offres fournisseurs ne sont presque jamais saisies (21 versions « En décision » sur 22 sans
  offre) ;
- 549 contrats n'ont pas de fournisseur — et **Salesforce ne le connaît pas non plus**, l'information
  n'a jamais été saisie ;
- pistes, opportunités et requêtes comptent 4, 1 et 2 lignes.

Développer les écrans de la cible sans réponse à cela produira des interfaces exactes et vides.

**3. Le lot 1 « Fondations UI » peut démarrer tout de suite.** Il ne dépend d'aucune décision métier :
navigation en quatre zones, palette, trame d'espacement, gabarits liste et fiche en trois colonnes.
C'est aussi ce qui rend la première démonstration possible avant tout le reste — le sixième livrable
que Michel demande.

---

## Les cinq autres livrables

Ils dépendent de la validation de ce document :

| Livrable | Prêt quand |
|---|---|
| Schéma d'architecture et impacts données | Après arbitrage sur le suivi de contrat et les statuts pricing |
| Découpage en lots, charges, calendrier | Après le point ci-dessus — un lot inconnu ne se chiffre pas |
| Liste des migrations et stratégie de reprise | Découle du schéma |
| Plan de tests, recette, retour arrière | Après la décision sur l'anonymisation (Q4) |
| Démonstration des fondations UI | **Peut commencer sans attendre** |

---

## Pour la réunion de lancement

Six questions à trancher, dans cet ordre :

1. **Le suivi de contrat** — c'est un objet entier à créer. Priorité par rapport au reste ?
2. **Le recalcul horaire des signaux** — l'heure est-elle le vrai besoin, ou « avant l'arrivée du
   commercial » suffit-il ? (Voir Q3 : trois chemins, dont un payant.)
3. **Le mode sombre** — présent et fonctionnel dans l'app, absent du dossier. On le garde ?
4. **Les cinq validations de piste** — les quatre existantes ne recouvrent pas les cinq demandées.
   On refond le modèle, ou on aligne le dossier sur ce qui existe ?
5. **L'anonymisation de la sandbox** — condition de toute recette faite hors de l'équipe.
6. **Les trois blocages de saisie** — offres fournisseurs, fournisseurs de contrats, objets vides.
   Ce sont les vrais points durs, et ils ne sont pas techniques.
