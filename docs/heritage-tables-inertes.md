# Les tables qui ne servent à rien (et pourquoi on les garde)

*Relevé du 30/08/2026. Constat ARC-01 de l'audit.*

Le schéma de Kimatch porte **39 tables entièrement vides**. Ce document existe pour une raison
précise : en lisant le schéma, on croit qu'il existe un moteur de calcul tarifaire, un moteur de
règles d'expertise, un second modèle de permissions et un suivi des rémunérations. **Rien de tout
cela n'existe.** Ce sont des coquilles, créées au moment de la conception et jamais remplies.

Quelqu'un qui découvre la base peut y perdre plusieurs jours — soit en cherchant le code qui les
alimente, soit en construisant par-dessus quelque chose qui n'a pas de fondation.

**On ne supprime rien pour l'instant.** Une suppression se décide table par table avec Michel, et
certaines de ces coquilles correspondent à des besoins réels encore à venir. Le but ici est
seulement qu'on ne les prenne plus pour du fonctionnel.

---

## 1. Le moteur de calcul qui n'a jamais tourné — 21 tables

Aucune ligne, **aucune référence dans le code de l'application**. Elles ne sont citées que par le
script de recopie de la sandbox (`api/admin/refresh-sandbox.ts`), qui les liste parce qu'il liste
toutes les tables.

**Calculs et algorithmes** (8) — `algorithmes_parametres`, `algorithmes_resultats`,
`parametres_algorithmes`, `resultats_algorithmes`, `decisions_algorithmes`, `executions_calculs`,
`types_calculs`, `types_parametres_calcul`.

**Moteur de règles d'expertise** (6) — `expertises`, `regles_expertise`, `sessions_expertise`,
`executions_regles_expertise`, `executions_domaines_expertise`, `executions_composants_expertise`.

**Analyses** (2) — `analyses`, `types_analyses`.

**Tarification réseau (TURPE)** (3) — `coefficients_turpe`, `composantes_tarifaires`,
`formules_tarifaires_turpe`. Le TURPE existe bel et bien dans Kimatch, mais il est saisi à la main
sur les grilles tarifaires : ces trois tables devaient le calculer, elles ne l'ont jamais fait.

**Événements** (2) — `evenements_metier`, `traitements_evenements`. Un bus d'événements prévu, jamais
branché. Ce qui trace réellement les changements, c'est `historique_modifications`.

> **À retenir :** il n'y a pas de moteur de calcul dans Kimatch. Les prix, les gains et les marges
> sont saisis ou importés, jamais calculés par la base.

## 2. Le second modèle de permissions — 7 tables

`organisations`, `profils_organisations`, `equipes`, `profils_equipes`, `perimetres_acces`,
`postes`, `postes_permissions`, `profils_postes`.

Un modèle complet — organisation, équipe, poste, périmètre — a été prévu **en plus** de celui qui
fonctionne. Celui qui fonctionne, c'est `roles_acces` + `profils_roles_acces`, avec quatre rôles :
`SUPER_ADMIN`, `ADMIN`, `CONSEILLER`, `LECTEUR`. C'est lui qu'interrogent les politiques RLS via
`has_role_acces()`.

Attention à une subtilité : `handle_new_user` **écrit** dans `profils_organisations` et
`profils_postes` à la création d'un compte, et `profils_autorises` porte une colonne `poste_id`.
Ces écritures n'ont aucun effet sur les droits — mais elles expliquent que ces tables se
remplissent un jour sans que personne l'ait décidé. La colonne « Poste » de l'écran Administration
est vide pour cette raison (constat UI-08).

## 3. Les liaisons prévues, jamais utilisées — 6 tables

- `contacts_sites` — un contact rattaché à plusieurs sites. Aujourd'hui le rattachement passe par le
  compte.
- `opportunites_sites` — même idée pour les opportunités. La base ne compte qu'**une** opportunité.
- `comptes_partenaires` — l'apporteur d'affaires passe par `comptes.apporteur_partenaire_id`.
- `contrats_compteurs_tarifs` — les tarifs par compteur vivent dans `grilles_tarifaires`.
- `recommandations_objectifs` — les objectifs sont du texte libre dans la recommandation.
- `partages_etude_client` — le partage d'une étude au client. Prévu, jamais ouvert.

## 4. Les fonctionnalités annoncées mais absentes — 3 tables

- **`remunerations`** — l'écran a été retiré du menu le 25/08/2026 ; la table n'a jamais eu de ligne.
  Sujet à reprendre avec Michel.
- **`listes`** — les listes de prospection en amont des pistes. L'onglet existe dans le code mais est
  désactivé (`AFFICHER_LES_LISTES = false` dans `src/pages/Prospection.tsx`).
- **`historiques_entites`** — un premier essai d'historique, remplacé par `historique_modifications`,
  qui porte lui 122 683 lignes et alimente l'onglet Historique des fiches.

## 5. Le cas à part : `profils_autorises`

Elle figurait dans ce relevé le matin du 30/08/2026 — **vide, alors que c'est la liste des accès**.
Elle porte désormais les dix personnes actives, et un déclencheur sur `auth.users` doit s'appuyer
dessus pour refuser toute adresse non autorisée (migration `20260830130000`, à appliquer).

Ce cas illustre pourquoi ce document est utile : une table vide n'est pas toujours une table
inutile. Parfois c'est une sécurité qui ne fait rien.

---

## Trois fonctions SQL qu'aucune politique n'appelle

`a_permission(code_permission text)`, `a_perimetre_global()` et `est_super_admin()` — écrites pour
le modèle de permissions du §2. Vérifié le 30/08/2026 : **zéro politique RLS et zéro appel dans le
code** pour chacune des trois.

Ce sont les 110 politiques appelant `has_role_acces()` qui décident réellement des droits.

> L'audit annonçait « cinq fonctions », en citant `peut_voir_compte`, `peut_modifier_compte`,
> `est_dans_perimetre` et `profil_organisation`. Ces quatre-là **n'existent pas dans la base** —
> le constat était faux, il est corrigé ici.

## Comment vérifier que ce document est encore vrai

```sql
select relname, n_live_tup
from pg_stat_user_tables
where schemaname = 'public' and n_live_tup = 0
order by relname;
```

Si une table de la liste ci-dessus se met à contenir des lignes, quelqu'un a commencé à s'en
servir — ou un déclencheur écrit à son insu. Dans les deux cas, ce document est à corriger.
