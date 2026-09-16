# Cockpit — centraliser la prospection dans Kimatch

> Document à coller tel quel comme premier message d'une session Claude Code sur le dépôt Kimatch.
> Il ne demande **aucune reprise de code** d'un outil extérieur : la spec de l'outil voisin (Cockpit
> sur Lovable) a servi de source d'idées, pas de source de vérité. Tout ce qui suit est écrit dans
> les objets, les colonnes et les conventions de Kimatch, **vérifiés en base le 15/09/2026**.
>
> Cadré avec William les 14 et 15/09/2026. Les arbitrages sont pris ; ce qui reste ouvert est
> signalé comme tel au §10 et ne se tranche pas seul.

---

## 1. Ce qu'on demande

Un écran **Cockpit** (`/cockpit`), qui devient le seul endroit où un conseiller prospecte. Deux
zones, et elles ne font pas le même travail :

| Zone | Ce qu'on y fait | Plafond |
|---|---|---|
| **Le pipe du jour** | on exécute, dans l'ordre, sans choisir | 60 actions, figées le matin |
| **Le vivier** | on transforme du portefeuille qui dort en opportunités | aucun |

Le vivier ne se compose pas : il se **transforme**. Mais il n'est pas une annexe qu'on visite quand
on a le temps — **c'est la première source de complétion du pipe** (§4.2). Quand les rappels et les
leads entrants ne suffisent pas à remplir les 60, ce sont ses lignes qui complètent, avant toute
piste froide.

La zone garde donc deux rôles : la liste complète qu'on peut parcourir et mesurer, et le réservoir
où le pipe puise chaque matin.

---

## 2. Le problème réel, avant la solution

Un conseiller doit aujourd'hui reconstituer sa journée d'appels à partir de **cinq écrans** :

| Où il regarde | Ce qu'il y trouve | Le code |
|---|---|---|
| Les cartes du jour | 7 compteurs : appels, mails, livrables, pistes à prospecter… | `compter_cartes_du_jour`, `src/lib/data/cartesDuJour.ts` |
| Les tâches du jour | ses tâches en retard / du jour / programmées | `lister_taches_du_jour`, `src/lib/data/tachesDuJour.ts` |
| Les pistes | celles que personne n'a appelées | `src/lib/data/prospection.ts` |
| Les échéances à traiter | **541 comptes** portent une échéance que personne ne travaille | `lister_echeances_a_traiter`, migration `20260911150000` |
| Les appels non rattachés | 1 439 numéros orphelins | `src/lib/data/fileAppels.ts` |

Chacun répond bien à sa question. **Aucun ne répond à « qui j'appelle maintenant, et après lui
qui ? »** — la seule qui compte entre 9 h et 18 h.

Cockpit n'ajoute donc pas une sixième source : il **ordonne les existantes**. S'il se met à produire
des chiffres que les cartes du jour ne donnent pas déjà, ou à lire les tâches autrement que
`lister_taches_du_jour`, c'est qu'il a dérivé.

---

## 3. La base éligible

### 3.0 L'unité de travail est l'objet, jamais le contact

Le pipe manipule **deux types d'objets et deux seulement** : la **piste** et l'**opportunité**. Le
contact n'est pas une ligne du pipe — il est seulement l'endroit où l'on lit le numéro à composer,
et cet endroit diffère selon le type :

| `cible_type` | Identité et numéro lus sur |
|---|---|
| `PISTE` | **la piste elle-même** — `civilite`, `prenom`, `nom`, `societe`, `fonction`, `telephone`, `telephone_mobile`, `email` (migration `20260914170000`) |
| `OPPORTUNITE` | **le contact lié** — `opportunites.contact_id` → `contacts.telephone`, `telephone_mobile`, puis le compte pour la société |

Il n'y a **pas de troisième type**, et c'est ce qui rend le vivier propre : une ligne de vivier est
un contact, mais elle **devient une opportunité avant d'entrer dans le pipe** (§3.3). Le pipe ne
contient jamais un contact nu.

Ce choix n'est pas une commodité d'affichage, il porte trois conséquences :

- **La règle de fer devient vraie par construction.** « Une action de prospection est toujours
  rattachée à une piste ou à une opportunité » n'est plus un contrôle à écrire : c'est le type de la
  ligne. Aucun chemin ne mène à une action sur un contact nu.
- **Un contact portant deux opportunités donne deux lignes**, chacune avec son périmètre et sa
  prochaine action. Avec le contact pour unité, il aurait fallu choisir laquelle afficher, et perdre
  l'autre.
- **`contacts.proprietaire_id` n'est jamais consulté**, pas même en repli (§3.5).

Sur une piste, le numéro se lit en retenant le premier renseigné entre `telephone` et
`telephone_mobile` : 56 pistes n'ont qu'un mobile, et il passait pour un fixe avant la reprise du
14/09. La normalisation passe par `src/lib/telephone.ts`, qui existe.

### 3.1 Les pistes

Entrent :
- les **leads entrants** : `pistes.source` valant `Google Ads sans facture (Inbound)` ou
  `Google Ads avec facture (Inbound)` ;
- toutes les pistes au statut **Nouvelle** ou **En cours de qualification**.

`pistes.source` est un **texte libre** (11 valeurs distinctes en base), et c'est accepté : les
valeurs viennent d'une liste de sélection Salesforce, elles ne se saisissent pas à la main.
Les deux entrantes sont à **priorité égale** — « avec facture » ne passe pas devant.

Sortent : dès que `statuts_pistes.est_cloture` est vrai — vrai exactement sur **Convertie** et
**Disqualifiée**. Écris la condition sur `est_cloture`, **jamais sur la liste des deux codes** : un
troisième statut de clôture ajouté demain sortira tout seul.

### 3.2 Les opportunités

Entrent : toute opportunité **non close**, au sens factuel —

```sql
o.date_cloture is null and o.qualification_fin is null and o.actif
```

**N'utilise pas les paliers.** « Nouvelle / En qualification / Couverture mandat / Prête à
convertir » sont **calculés dans le front** (`src/lib/data/opportunites.ts`) à partir des objets
réunis — Michel : « le palier se déduit des objets réunis, il ne se choisit pas dans une liste ». Il
existe *en plus* une colonne stockée `opportunites.statut_id` avec les mêmes codes, sur laquelle le
tableau de bord filtre : deux vérités qui peuvent diverger. La condition factuelle ci-dessus est
l'union exacte des quatre paliers ouverts, sans en créer une troisième.

Sortent : à la **clôture de l'opportunité**, et à rien d'autre. En particulier, **aucun calcul de
couverture par mandat** n'entre dans ce lot (`prerequisOpportunite` reste où il est).

Une opportunité ouverte **doit** avoir un contact joignable — règle posée par William, pas
hypothèse. Mais ne la présume pas en silence : `opportunites.contact_id` est nullable en base, et un
contact peut perdre son numéro après coup. Un contrôle compte et **affiche** les opportunités
ouvertes sans numéro joignable, au lieu de les faire disparaître du pipe sans un mot. C'est la
différence entre une règle tenue et une règle supposée.

### 3.3 Le vivier — des contacts, et eux seuls

**L'unité du vivier est le contact**, et ce n'est pas une exception à la règle du §3.0 : un contact
du vivier n'a, par définition, aucun objet de travail — s'il en avait un, il serait déjà dans le
pipe. Le vivier existe pour lui en donner un.

**Qui entre.** Les contacts actifs dont `roles` contient **`DECISIONNAIRE`**, **`SIGNATAIRE`** ou
**`DECISIONNAIRE_POTENTIEL`** (§3.6). Sont donc exclus les `ADMINISTRATIF` — ils ne contractualisent
pas — et les `CONSEIL_SYNDICAL`, dont l'aide en base dit déjà « représente les copropriétaires — ne
contractualise pas ».

**À quel titre.** Un critère d'éligibilité, et un seul par ligne :

| Critère affiché | Ce qu'il veut dire |
|---|---|
| **Échéance < 18 mois** | le contact est `compteurs.responsable_contact_id` sur au moins un compteur actif dont l'échéance est **vide, dépassée, ou à moins de 18 mois**, et sur lequel rien n'est lancé — ni opportunité non close, ni recommandation non clôturée (§5.2) |
| **Sans périmètre** | le contact n'a **aucun compteur** rattaché. On l'a identifié comme décisionnaire ou signataire, et on ne sait rien de ce qu'il consomme |

Un contact dont tous les compteurs ont une échéance au-delà de 18 mois ne relève d'aucun des deux :
il n'entre pas.

**Exclusion supplémentaire** : un contact portant déjà une opportunité non close n'est pas dans le
vivier — il est dans le pipe par la voie du §3.2.

**Sortie du vivier** : au moment où l'opportunité est créée. Le contact quitte le vivier et entre
dans le pipe le même jour (§5.5).

### 3.4 Ce qui est exclu partout

- `comptes.type_compte_id` ≠ **Consommateur**. Un seul filtre : Partenaire, Fournisseur et le compte
  KiWee lui-même sortent d'eux-mêmes.
- les lignes inactives (`actif = false`) et la corbeille.

### 3.5 Qui voit quoi — le propriétaire se lit sur l'objet de travail

| Population | Le propriétaire fait foi sur |
|---|---|
| Piste | `pistes.proprietaire_id` |
| Contact d'opportunité | `opportunites.proprietaire_id` |
| Contact du vivier | `comptes.proprietaire_id` |

**Ne lis jamais `contacts.proprietaire_id`.** Vérifié le 15/09/2026 : aucune propagation n'existe en
base. Le seul automatisme est dans le déclencheur d'historique (`20260828190000`) —
`new.proprietaire_id := coalesce(new.proprietaire_id, qui)` — soit « le propriétaire est celui qui
crée la ligne », pas celui du compte. Les propriétaires de contacts actuels viennent d'une reprise
Salesforce en un coup (`20260813170000`), pas d'une règle vivante. Un contact saisi par Marie sur un
compte de Thomas appartient donc à Marie.

Lire le propriétaire de l'objet de travail est aussi plus juste : celui qui doit appeler est celui à
qui la piste ou l'opportunité est confiée, pas celui qui a saisi une fiche contact un jour. Le
contact n'est que le numéro à composer.

Le filtre se pose **dans la fonction SQL, sur `auth.uid()`** — jamais en paramètre depuis le
navigateur, qui se change dans la console (même motif que `compter_cartes_du_jour`, migration
`20260910290000`).

---

### 3.6 Le nouveau rôle « Décisionnaire potentiel »

William, 15/09/2026 : un cinquième rôle de contact, pour « tous les contacts que le commercial
identifie comme un potentiel décisionnaire mais pour lequel nous ne disposons actuellement d'aucun
périmètre ». C'est un **choix du commercial**, par un bouton de conversion sur chaque fiche de
contact `ADMINISTRATIF`.

**Ce rôle doit être écrit dans `fn_roles_contact`, sinon il ne survivra pas une journée.** La
fonction (migration `20260914154155`) **reconstruit `roles` de zéro** à chaque écriture sur
`compteurs`, `mandats` ou `contrats`. Un rôle posé par un simple `update` serait effacé au premier
compteur réaffecté du compte, sans le moindre message.

Le seul rôle qui survit à ce recalcul est `ADMINISTRATIF`, par une clause qui **se relit
elle-même** :

```sql
case when 'ADMINISTRATIF' = any(coalesce(roles, '{}'))
      and not exists (select 1 from compteurs where responsable_contact_id = …)
      and not exists (select 1 from mandats  where contact_signataire_id = …)
      and not exists (select 1 from contrats where contact_signataire_id = …)
      and not exists (select 1 from compteurs where contact_conseil_syndical_id = …)
     then 'ADMINISTRATIF' end
```

`DECISIONNAIRE_POTENTIEL` suit **exactement ce motif** : il se conserve tant qu'il est déjà là, et
il **ne survit à aucun fait contraire** — le jour où un compteur désigne ce contact responsable, il
devient décisionnaire pour de vrai, et le « potentiel » disparaît de lui-même. Un potentiel qui
s'est réalisé n'a plus à être annoncé.

**La conversion remplace `ADMINISTRATIF`, elle ne s'y ajoute pas.** Toute la migration du 14/09 est
née de votre phrase — « les contacts sont renseignés en double s'ils sont à la fois signataire et
administratif, ce n'est pas possible » — et elle a ramené 598 incohérences à zéro. Cumuler les deux
rôles rouvrirait le double affichage qu'elle vient de fermer : le contact apparaîtrait dans deux
zones de l'onglet Contacts, et chaque décompte de bande mentirait.

Le bouton de conversion est donc **réversible dans un seul sens** : Administratif →
Décisionnaire potentiel. Le retour se fait en reposant Administratif, qui obéit à la même règle.

À ajouter aussi : le libellé et l'aide dans `src/lib/contactRoles.ts` (`ROLES_CONTACT`,
`LIBELLE_ROLE`, `AIDE_ROLE`), et la table de référence `types_roles` si elle porte cette liste.

## 4. Le pipe du jour

### 4.1 Soixante lignes, figées, qui ne se rechargent jamais

Le pipe est construit **au premier chargement de la journée** et ne se réalimente pas. Une ligne
appelée, reportée ou écartée **sort sans être remplacée**. La journée se vide.

**Pourquoi.** Une file qui se réalimente n'a pas de fond : le conseiller n'atteint jamais rien et la
fin de journée n'arrive pas. Une pile de 60 qui descend à 12 se termine. C'est le seul endroit de
Kimatch où la rareté est fabriquée exprès, et elle doit rester visible : l'en-tête affiche
**« 12 restantes sur 60 »**, jamais un total qui reste à 60.

Un conseiller dont la base éligible compte moins de 60 lignes a une journée courte, et c'est tout.
**On ne complète jamais avec les fiches d'un collègue.** Avec le vivier dans la cascade (§4.2), ce
cas devient rare : une journée courte veut alors dire que tout le portefeuille dont il répond est
travaillé, ce qui est une information et non une panne.

### 4.2 Quatre seaux, dans cet ordre

1. **`INBOUND`** — les leads entrants dont l'utilisateur est propriétaire et que **personne n'a
   encore appelés**. Priorité absolue : on bat le fer tant qu'il est chaud.
   *Ordre interne : les plus anciens d'abord.* Entre un lead reçu ce matin et un d'hier, c'est celui
   d'hier qui refroidit et qui risque de ne jamais être appelé.
2. **`RAPPEL_HEURE`** — les tâches du jour **avec** une heure de rappel, par heure croissante.
3. **`RAPPEL_JOUR`** — les tâches du jour **sans** heure, et les tâches **en retard**.
   Une tâche en retard portant l'heure d'hier n'a plus d'heure utile aujourd'hui : elle rejoint ce
   seau plutôt que de réclamer un créneau qui n'existe plus.
4. **`COMPLETION`** — ce qui reste pour atteindre 60, et **dans cet ordre strict** :

   | Rang | Ce qu'on prend | `source` | Pourquoi ce rang |
   |---|---|---|---|
   | 4a | les **opportunités ouvertes sans aucune tâche** | `OPPORTUNITE_DORMANTE` | un dossier déjà qualifié que personne ne pousse : rien n'est plus près de l'argent, et rien ne coûte moins cher à relancer |
   | 4b | le **vivier**, tiré **au hasard** et transformé à l'entrée (§5.5) | `VIVIER` | la seule source qui *crée* du pipeline, sur du portefeuille qu'on est en train de perdre |
   | 4c | les **pistes sans activité ouverte** | `PISTE_FROIDE` | le froid, en dernier |

   Le rang 4c ne se sert que **quand le vivier est entièrement transformé** (William, 15/09/2026).
   Conséquence à assumer : tant qu'il reste du vivier, aucune piste froide n'est travaillée — seuls
   les leads entrants continuent d'arriver par-dessus, par le seau 1. **Relever le volume du vivier
   par conseiller avant de lancer** : à moins d'un an il pesait 541 comptes et 969 compteurs le
   11/09/2026, et la fenêtre de Cockpit est bien plus large (18 mois, dépassées et vides incluses).
   C'est ce chiffre qui dit si le rang 4c est atteint en une semaine ou jamais.

Toutes les tâches comptent, **tous types confondus** (`APPELER`, `ENVOYER_EMAIL`, livrables…), dès
lors qu'elles sont rattachées à un objet éligible. C'est ce qui fait de Cockpit l'écran unique de la
prospection plutôt qu'un écran d'appels de plus.

**Une tâche à minuit n'a pas d'heure.** C'est la convention de toute l'application depuis le
08/09/2026 (`src/lib/heureTache.ts`) : 443 tâches ouvertes sont à minuit, 14 portent une vraie
heure. Et **la frontière du jour est minuit à Paris**, pas en UTC, où elle tombe deux heures trop
tôt — le piège est déjà documenté dans `20260910330000`.

### 4.3 Deux ordres, et les confondre casse tout

- **L'ordre du snapshot** (`position`) est calculé une fois, au premier chargement, et ne bouge plus
  de la journée. C'est lui qui fait que rafraîchir la page ne rebat pas les cartes.
- **L'ordre d'affichage** se recalcule à chaque lecture par-dessus : ce dont **l'heure n'est pas
  encore venue part en fin de pile**, trié par heure croissante. Inutile de proposer à 10 h un
  contact à rappeler à 17 h. L'ordre manuel du conseiller (glisser-déposer) l'emporte sur tout.

### 4.4 Ce qui est chaud s'insère juste après la ligne en cours

Un lead entrant arrivé à 14 h, un rappel dont l'heure vient de sonner : la ligne se place en
position **n+1**, pas en tête. Interrompre un appel en cours fait perdre les deux ; le placer en
second le rend prioritaire sans rien casser. Et **un lead entrant dépasse les 60** : priorité
absolue veut dire qu'il n'attend pas demain.

### 4.5 Rien ne sort sans trace

| Sortie | Ce qui est écrit | Où |
|---|---|---|
| Appelé | l'interaction de l'appel | `interactions`, via le webhook Allo — **déjà en place** |
| Transformé | l'opportunité, créée **avant** l'entrée dans le pipe — ce n'est donc pas une sortie mais une entrée | `opportunites`, avec `source = VIVIER` sur la ligne du pipe (§5.5) |
| Reporté | une tâche avec date, heure facultative, commentaire | `actions` — **table existante**, et `MenuReport` tel quel |
| Écarté | le statut Disqualifiée + son motif | `pistes.statut_id` + `motif_disqualification` — **colonnes existantes** |

Une ligne qui disparaît sans trace, c'est un conseiller qui se demande le lendemain s'il l'a
appelée. Et c'est la seule façon de savoir, dans trois mois, pourquoi 300 pistes n'ont jamais été
travaillées.

---

## 5. Le schéma à ajouter

### 5.1 Une table : le snapshot du jour

```
pipe_du_jour
  profil_id      uuid          -- à qui appartient cette journée
  jour           date          -- la date du snapshot (Europe/Paris)
  cible_type     text          -- PISTE | OPPORTUNITE   (contrainte CHECK)
  cible_id       uuid          -- la piste ou l'opportunité, jamais un contact (§3.0)
  position       int           -- l'ordre figé, calculé une fois
  source         text          -- INBOUND | RAPPEL_HEURE | RAPPEL_JOUR | VIVIER
                               -- | OPPORTUNITE_DORMANTE | PISTE_FROIDE | INBOUND_LIVE
  ajoute_le      timestamptz
  sorti_le       timestamptz null   -- la ligne n'est JAMAIS supprimée
  motif_sortie   text null          -- APPELE | REPORTE | ECARTE | PURGE
```

Unicité sur `(profil_id, jour, cible_type, cible_id)` : c'est elle qui rend la construction
idempotente. On insère en `on conflict do nothing`, et recharger la page deux fois ne double rien.

**Le snapshot ne pointe jamais un contact** (§3.0). Un contact qui change
d'opportunité, qui fusionne avec un doublon ou qui perd son numéro n'invalide donc aucune ligne du
pipe — la ligne reste, et c'est son numéro manquant qui s'affiche.

**Le snapshot ne stocke aucune copie de la donnée** — ni le nom, ni la société, ni le numéro, ni le
statut. Il ne porte que la **décision** : qui, dans quel ordre, et pourquoi. La lecture joint
toujours la donnée vivante. Conséquence directe : **il n'y a rien à synchroniser**. Une piste
renommée est renommée dans la pile ; une piste disqualifiée par un collègue disparaît au prochain
tick, sans job de purge, parce que la jointure ne la ramène plus.

**Et pourquoi une table et non une simple vue**, puisque la donnée est déjà sur place ? Quatre
raisons, dont trois rédhibitoires : le seau de complétion ne serait jamais deux fois le même d'un
rafraîchissement à l'autre ; une vue se réalimente par construction, donc le pipe ne se viderait
jamais ; le glisser-déposer n'aurait aucune ligne pour se persister ; et « tu as appelé 28 fiches
aujourd'hui » se lit dans `sorti_le`, qu'une vue n'a pas.

`sorti_le` plutôt qu'un `delete`, pour la même raison.

### 5.2 Une vue : l'échéance à traiter, définie une seule fois

`lister_echeances_a_traiter` existe déjà et fait presque ce qu'il faut. **Ne la modifie pas dans son
comportement** : elle sert la fiche compte, où l'absence de filtre propriétaire est un choix assumé
(« tous les commerciaux voient tous les comptes », Naoëlle, 14/08/2026).

Extrais ses critères dans une vue `v_echeances_a_traiter`, avec trois corrections vérifiées le
15/09/2026 :

| Aujourd'hui dans la fonction | Dans la vue | Pourquoi |
|---|---|---|
| `date_echeance <= today + 1 year` | fenêtre en paramètre, **18 mois** pour Cockpit | la demande de William |
| `date_echeance is not null and >= today` | **dépassées et vides incluses** | les 588 compteurs sans échéance et tous les dépassés en sont exclus aujourd'hui |
| `join opportunites o on … and o.actif` | opportunité **non close** | `o.actif` est le drapeau de corbeille, pas « ouverte » : un compteur dont l'opportunité a été perdue il y a deux ans est exclu **pour toujours** |

La fonction existante lit ensuite la vue et garde son comportement exact. Cockpit la lit aussi,
filtrée par propriétaire et à 18 mois. Une seule définition de « échéance à traiter », deux usages.

Utile au passage : `src/lib/echeance.ts` distingue déjà **prouvée / estimée / absente** —
1 036 / 6 275 / 588 sur 7 899 compteurs, mesuré le 24/08/2026. Le vivier affiche cette nature : une
échéance estimée et une échéance prouvée ne se travaillent pas avec le même aplomb.

### 5.3 Un réglage

`profils.plafond_pipe_du_jour int default 60`.

### 5.4 Un prérequis, qui n'est pas Cockpit et qui ne le bloque pas

William, 15/09/2026 : changer le propriétaire d'un compte **doit** redescendre sur ses contacts et
ses compteurs. Ça n'existe pas aujourd'hui (§3.5).

À traiter comme un lot à part, et à ne pas écrire à l'aveugle :

- un déclencheur `after update of proprietaire_id on comptes` qui recopie sur `contacts` et
  `compteurs` du compte **volerait aussi les lignes attribuées exprès à quelqu'un d'autre**. Poser
  la question avant de choisir entre « tout recopier » et « ne recopier que ce qui suivait l'ancien
  propriétaire du compte » — la seconde option est plus sûre et reste conforme à l'intention.
- il ne règle que l'avenir. Les divergences déjà en base demandent un réalignement en masse :
  **mesurer d'abord** combien de contacts et de compteurs divergent, puis l'accord de Michel.

Cockpit n'attend pas ce lot, puisqu'il lit le propriétaire de l'objet de travail.

---

### 5.5 Transformer le vivier : l'opportunité se crée automatiquement

**Cette règle renverse une décision du 15/09 au matin** (« aucune opportunité créée
automatiquement »), et le renversement est volontaire : William, 15/09/2026, sur les deux fonctions
ci-dessous — « on crée alors automatiquement les opportunités ». Ce qui reste vrai de la décision
initiale, c'est qu'**aucune opportunité ne naît d'un appel, d'une horloge ou d'un traitement de
nuit** : il faut toujours un geste humain, celui qui remplit le pipe ou qui choisit des lignes.

Deux fonctions, deux gestes :

| Où | Geste | Ce qu'il fait |
|---|---|---|
| **Dans le pipe** | « Compléter » | tire **au hasard** dans le vivier éligible, crée les opportunités, insère les lignes jusqu'à 60 |
| **Dans le vivier** | sélection puis « Ajouter au pipe » | crée les opportunités des lignes choisies et les insère. **Passe outre le plafond** : un choix explicite ne se fait pas refuser par un compteur |

L'opportunité créée porte :

| Champ | Valeur | Pourquoi |
|---|---|---|
| `contact_id` | le contact du vivier | — |
| `compte_id` | son compte principal (`contacts.compte_id`) | `contacts_comptes` porte les rattachements secondaires, le principal suffit ici |
| `proprietaire_id` | le conseiller qui déclenche | c'est lui qui va appeler |
| `origine` | `PORTEFEUILLE` | l'énumération existe déjà : PISTE / PORTEFEUILLE / DEMANDE_ENTRANTE / PARTENAIRE |
| `signal_libelle` | le **critère d'éligibilité** — « Échéance < 18 mois » ou « Sans périmètre » | **obligatoire** : créer une opportunité avec un contact exige `signal_id` **ou** `signal_libelle` (prérequis posé par Michel le 23/08/2026). Sans lui, la création échoue |
| périmètre | les compteurs qui ont déclenché l'éligibilité — **vide** pour « Sans périmètre » | un périmètre vide est légitime : le palier calculé dira « Nouvelle », ce qui est exact |

**Idempotence.** Un contact portant déjà une opportunité non close n'est plus dans le vivier
(§3.3) : deux clics rapides ne peuvent pas créer deux opportunités sur la même personne. Écris quand
même la garde côté SQL — le vivier se lit, puis on écrit, et entre les deux il y a un aller-retour.

## 6. Les écrans

Une entrée de menu **Cockpit**, au-dessus de « Pistes ».

### 6.1 Le pipe du jour

**En-tête** : « 12 restantes sur 60 », la barre qui descend, la date.

**Une ligne se lit exactement pareil qu'il s'agisse d'une piste ou d'une opportunité** — seul un tag
les distingue. Cinq colonnes, dans cet ordre :

| # | Colonne | Pour une `PISTE` | Pour une `OPPORTUNITE` |
|---|---|---|---|
| 1 | **Nom complet** | `civilite` + `prenom` + `nom` de la piste | idem, depuis le contact lié |
| 2 | **Fonction** | `pistes.fonction` | `contacts.fonction` |
| 3 | **Compte** | `pistes.societe` | le nom du compte (`opportunites.compte_id`) |
| 4 | **Tag** | « Piste » | « Opportunité » |
| 5 | **Segment** | `pistes.segment` | la **typologie** du compte |

⚠️ **La typologie d'un compte est stockée dans `comptes.segment`**, pas dans une colonne
`typologie` — ne la cherche pas, elle n'existe pas. Le libellé affiché est « Typologie », la colonne
s'appelle `segment`, et ses valeurs sont Entreprise / Syndic professionnel / Syndic non
professionnel / Courtier / Fournisseur / Partenaire (migration `20260914064932`). Le mot « segment »
désigne donc deux choses selon l'objet, et c'est déjà comme ça dans toute l'application.

**Le numéro en toutes lettres**, à côté du nom. Ce n'est pas cosmétique : c'est l'extension Chrome
d'Allo qui le détecte pour proposer l'appel. Un bouton avec le numéro caché dans une infobulle ne
lui donne rien à voir, et le conseiller conclut que ça ne marche pas (`src/lib/telephonie.tsx`).

**Les gestes** : appeler (pousse dans la file Allo — comportement existant), reporter (`MenuReport`,
tel quel), écarter (motif obligatoire). L'objet est cliquable vers sa fiche (`EntityLink`).

**Réordonnable au glisser-déposer**, ordre persisté.

**En pied** : la règle du pipe figé, en une phrase, et le bouton **« Compléter »** (§5.5), qui tire
au hasard dans le vivier jusqu'à 60. On se resert, on ne se fait pas resservir.

### 6.2 Le vivier

Une liste de **contacts**, non plafonnée. Cinq colonnes :

| # | Colonne | Lue sur |
|---|---|---|
| 1 | **Nom complet** | `civilite` + `prenom` + `nom` |
| 2 | **Fonction** | `contacts.fonction` |
| 3 | **Compte principal rattaché** | `contacts.compte_id` (`contacts_comptes` porte les rattachements secondaires — ils ne s'affichent pas ici) |
| 4 | **Segment du compte** | la **typologie**, soit `comptes.segment` (voir l'avertissement du §6.1) |
| 5 | **Critère d'éligibilité** | « Échéance < 18 mois » ou « Sans périmètre » (§3.3) |

Tri par échéance puis par volume, comme `lister_echeances_a_traiter` — « à urgence égale, c'est le
montant en jeu qui départage ». Les lignes « Sans périmètre » n'ont ni échéance ni volume : elles
passent après, dans un ordre stable.

**Le geste** : une sélection (une ou plusieurs lignes) puis **« Ajouter au pipe »**, qui crée les
opportunités et insère les lignes — en passant outre le plafond (§5.5).

La zone reste consultable en entier, pour voir et mesurer ce qui dort. Mais **le travail du jour
passe par le pipe** : c'est là que la transformation est comptée, ordonnée et suivie d'un appel.

### 6.3 Ce qu'on n'écrit pas

Pas de nouveau composant d'UI : `Card`, `Badge`, `Button`, `ListToolbar`, `MenuReport`,
`EntityLink` existent et suffisent.

Et pas de compteurs de performance maison. Les chiffres d'appels viennent d'Allo, qui les calcule
déjà (`src/lib/data/kpiAllo.ts` : « On ne recompte rien »). Un second compteur divergerait, et ce
serait le nôtre le plus faux.

---

## 7. Le temps réel, sans websocket nouveau

`actions` et `pistes` sont **déjà** dans la publication temps réel (migrations `20260910270000` et
`20260910305000`) : une tâche créée ailleurs, une piste disqualifiée par un collègue, et la pile se
met à jour.

Pour le reste, une interrogation à intervalle **et seulement quand l'onglet est visible**. Le motif
est écrit dans `src/lib/data/appelEnCours.ts` et il tient : douze onglets oubliés dans une équipe de
treize personnes coûtent zéro.

Les jours ouvrés se calculent avec `src/lib/joursFeries.ts` (Meeus, fériés calculés et non listés).
**Ne le réimplémente pas en PL/pgSQL** : deux vérités sur « quel jour est ouvré » finissent par
diverger un lundi de Pentecôte — c'est déjà écrit dans `20260910330000`.

---

## 8. Les règles de la maison

- **Aucune règle métier dans le front.** Les seaux, les filtres, le périmètre, le propriétaire : en
  SQL. L'écran affiche et ordonne.
- **Aucun libellé en dur.** Statuts et types passent par `useReferenceTable()`. Un code ne se
  renomme pas, un libellé si.
- **Une migration, un fichier, un nom de phrase en français** :
  `supabase/migrations/AAAAMMJJHHMMSS_le_cockpit_tient_la_prospection_dans_une_pile.sql`.
- **Sandbox d'abord** (`uxutkjjcyhtosyecsjdy`), prod ensuite (`llktvzbbfadmnhfjatrh`), **et jamais
  sans que Naoëlle ou Michel ait relu le SQL.**
- **Ne présume rien du schéma**, il bouge sans préavis : `npm run carte:verifier`, et une requête
  ciblée sur `information_schema.columns` au moindre doute.
- **Avant tout push** : `npx tsc -b` (et non `tsc --noEmit`, qui laisse passer les variables
  inutilisées qui cassent le build Vercel), puis `npm run carte:verifier`.
- **Commentaires en français**, et ils disent *pourquoi*, pas *quoi*. Le dépôt est public : aucun
  secret, aucune donnée client, aucun extrait de base.

---

## 9. L'ordre de construction, et comment savoir que c'est fini

1. **Le rôle `DECISIONNAIRE_POTENTIEL`** (§3.6) : `fn_roles_contact` étendue sur le motif
   auto-préservant, l'exclusivité avec `ADMINISTRATIF`, les libellés dans `contactRoles.ts`, le
   bouton de conversion. Il vient **en premier** parce que le vivier se définit dessus — écrire le
   vivier avant, c'est écrire un filtre sur un rôle qui n'existe pas.
2. La vue `v_echeances_a_traiter` + le rebranchement de `lister_echeances_a_traiter` dessus, à
   comportement **inchangé** (c'est le contrôle : la fiche compte doit rendre les mêmes chiffres).
3. La vue du vivier — contacts, rôles, critère d'éligibilité, propriétaire du compte.
4. La table `pipe_du_jour`, son unicité, sa RLS (`auth.uid() = profil_id`), le réglage sur `profils`.
5. `construire_pipe_du_jour()` — les trois premiers seaux, le plafond, l'idempotence.
6. `lister_pipe_du_jour()` — le tri d'affichage.
7. `src/lib/data/cockpit.ts` — les crochets React Query, commentés comme leurs voisins.
8. L'écran `/cockpit`, zone « pipe du jour » avec ses cinq colonnes, + l'entrée de menu.
9. Les gestes d'appel, de report et d'écartement, branchés sur l'existant.
10. **La cascade de complétion** (§4.2 rangs 4a → 4c) et la création automatique d'opportunités
    (§5.5). Elle vient après les trois premiers seaux parce qu'elle en dépend : c'est ce qui manque
    pour atteindre 60 qu'elle comble, et il faut d'abord savoir compter ce qui manque.
11. La zone « vivier » et son geste « Ajouter au pipe ».
12. Le glisser-déposer, le bouton « Compléter », l'insertion à chaud.

**C'est fini quand, et seulement quand :**

- charger la page deux fois de suite donne exactement la même pile, dans le même ordre ;
- `lister_echeances_a_traiter` rend, sur un compte témoin, exactement ce qu'elle rendait avant ;
- une tâche reportée à demain quitte la pile et n'y revient pas aujourd'hui ;
- une piste disqualifiée par un collègue disparaît de ma pile sans que je recharge ;
- une ligne à rappeler à 17 h est en bas de pile à 10 h, et remonte à 17 h ;
- un lead entrant reçu en cours de journée apparaît en position n+1, même au-delà de 60 ;
- **aucune piste froide n'apparaît tant qu'il reste une ligne de vivier non transformée** — c'est le
  contrôle de la cascade, et il se vérifie sur un jeu d'essai où le vivier compte une seule ligne ;
- une ligne ajoutée depuis le vivier arrive dans le pipe **déjà porteuse de son opportunité**, avec
  son `signal_libelle` renseigné — et deux clics rapides n'en créent jamais deux ;
- un contact `DECISIONNAIRE_POTENTIEL` **garde son rôle** après une écriture sur un compteur, un
  mandat ou un contrat du même compte. C'est le contrôle qui prouve que `fn_roles_contact` a bien
  été étendue, et il ne se voit pas autrement qu'en le provoquant ;
- le jour où un compteur désigne ce contact responsable, il devient `DECISIONNAIRE` et le
  « potentiel » **disparaît tout seul** ;
- le compteur descend et ne remonte jamais tout seul ;
- le numéro de téléphone est lisible en texte sur chaque ligne ;
- le nombre d'opportunités ouvertes sans numéro joignable est **affiché**, pas absorbé ;
- `npx tsc -b` et `npm run carte:verifier` passent.

---

## 10. Ce que tu ne tranches pas seul

Tout le reste a été arbitré avec William les 14 et 15/09/2026. Restent :

1. **Le déclencheur de propagation du propriétaire** (§5.4) : tout recopier, ou seulement ce qui
   suivait l'ancien propriétaire ? Et le réalignement des divergences existantes, à mesurer avant.
2. **Les contacts et pistes sans aucun propriétaire** n'apparaîtront chez personne. Les exposer
   quelque part (une liste « non attribués » pour un manager), ou accepter qu'ils dorment ?
3. **L'heure de bascule du snapshot.** Il se construit au premier chargement — mais un conseiller qui
   ouvre Kimatch à 18 h 30 se voit construire une journée qu'il ne fera pas.
4. **Le tri interne du seau de complétion.** Aujourd'hui : rien d'inventé, ordre du seau. Le jour où
   un critère métier arrive — volume de consommation, nombre de compteurs, score de solvabilité — il
   arrivera avec sa règle. **N'en invente pas un.**
5. **Le tirage au hasard dans le vivier ignore l'urgence des échéances.** C'est la règle demandée
   (§4.2 rang 4b) et le document l'applique, mais elle a un coût : une échéance à deux mois a
   exactement la même chance de sortir qu'une à dix-sept. Or la liste du vivier, elle, est triée par
   urgence puis par volume. **Ma proposition** : hasard pour les lignes « Sans périmètre », où aucune
   urgence n'existe, et ordre d'urgence pour les « Échéance < 18 mois ». Si le hasard est voulu
   partout — pour éviter que tous les conseillers se ruent sur les mêmes comptes, par exemple — il
   suffit de le dire et la règle reste telle quelle.
6. **Le `signal_libelle` des opportunités créées automatiquement** (§5.5) : le document y écrit le
   critère d'éligibilité, faute de mieux. C'est un champ que les commerciaux liront — il vaut d'être
   formulé par vous plutôt que déduit par moi.
7. **Où apparaît un « Décisionnaire potentiel » dans l'onglet Contacts d'un compte ?** Cet onglet a
   trois zones depuis le 13/09, calées sur les rôles. Un quatrième rôle demande soit une quatrième
   zone, soit de rejoindre une existante. Non tranché.
8. **Le même interlocuteur sur deux opportunités ouvertes** donne deux lignes (§3.0), donc
   potentiellement deux appels le même jour. Faut-il les regrouper visuellement, n'en proposer
   qu'une et reporter l'autre, ou laisser les deux ? Mesurer d'abord combien de contacts portent
   plus d'une opportunité ouverte : si le cas est rare, un simple badge suffit.

---

## Annexe — Ce qui viendra peut-être après, et qu'il ne faut pas empêcher

Trois briques sont hors de ce lot. Elles ne sont pas à coder, mais les choix d'aujourd'hui ne
doivent pas les rendre impossibles :

- **Le mode plein écran** (une fiche à la fois, pile de cartes, façon sprint). Il lira la même pile.
  → Conséquence : `lister_pipe_du_jour()` rend un ordre complet et exploitable seul, pas une liste
  dont l'écran ferait le tri.
- **Un moteur de séquences** (plusieurs touches planifiées sur jours ouvrés). Il créera des
  `actions`, comme un humain.
  → Conséquence : `source` est un texte borné par un `CHECK`, pas une énumération figée dans le type
  TypeScript.
- **Le récapitulatif de la journée**. Il se lira dans `sorti_le` / `motif_sortie`, et dans Allo pour
  les appels.
  → Conséquence : c'est la raison pour laquelle une ligne sortie n'est jamais supprimée.
