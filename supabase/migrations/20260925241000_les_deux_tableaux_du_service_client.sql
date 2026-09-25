-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES DEUX TABLEAUX DU SERVICE CLIENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 25/09/2026 : « le tableau doit montrer l'ensemble des tâches ouvertes ou en retard liées
-- aux requêtes (compte, nom de la tâche, contact, échéance) », et pour la fidélisation « (contrat,
-- nom de la tâche, contact, échéance, statut du suivi de contrat) ».
--
-- ══ LES JOINTURES VIVENT ICI, PAS DANS L'ÉCRAN ══
--
-- Le compte d'une tâche de requête se lit à travers la requête ; le contrat d'une tâche de suivi, à
-- travers le suivi. Fait au navigateur, cela demandait de rapatrier les requêtes, les suivis, les
-- contrats et les contacts pour recoudre 284 lignes — et de refaire le même assemblage sur les deux
-- tableaux, avec deux occasions de diverger.
--
-- ══ EN RETARD D'ABORD ══
--
-- L'ordre n'est pas une commodité d'affichage : ces tableaux servent à savoir par quoi commencer.
-- Une échéance dépassée passe devant, puis la plus proche. Une tâche sans échéance ferme la marche
-- plutôt que d'ouvrir le tableau, ce que ferait un `order by` naïf sur une colonne nulle.
--
-- Aucune de ces fonctions n'est `security definer` : elles s'exécutent avec les droits de
-- l'appelant, donc les policies de `actions`, `requetes` et `suivis_contrats` s'appliquent.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.taches_ouvertes_des_requetes()
returns table(
  id uuid, titre text, echeance timestamptz, en_retard boolean,
  requete_id uuid, requete_reference text, requete_objet text,
  compte_id uuid, compte_nom text,
  contact_id uuid, contact_nom text
)
language sql
stable
set search_path to 'public'
as $fn$
  select
    a.id, a.titre, a.date_prevue,
    (a.date_prevue at time zone 'Europe/Paris')::date < (now() at time zone 'Europe/Paris')::date,
    r.id, r.reference, r.objet,
    cp.id, cp.nom,
    ct.id, trim(concat_ws(' ', ct.prenom, ct.nom))
  from actions a
  join requetes r  on r.id = a.requete_id
  left join comptes  cp on cp.id = coalesce(a.compte_id, r.compte_id)
  left join contacts ct on ct.id = coalesce(a.contact_id, r.contact_id)
  where a.actif
    and exists (select 1 from statuts_actions s where s.id = a.statut_id and s.code not in ('TERMINEE','ANNULEE'))
  order by a.date_prevue asc nulls last;
$fn$;

create or replace function public.taches_ouvertes_des_suivis()
returns table(
  id uuid, titre text, echeance timestamptz, en_retard boolean,
  suivi_id uuid, contrat_id uuid, contrat_reference text,
  compte_nom text,
  contact_id uuid, contact_nom text,
  etape_libelle text, etape_ordre integer
)
language sql
stable
set search_path to 'public'
as $fn$
  select
    a.id, a.titre, a.date_prevue,
    (a.date_prevue at time zone 'Europe/Paris')::date < (now() at time zone 'Europe/Paris')::date,
    s.id, c.id, c.reference,
    cp.nom,
    ct.id, trim(concat_ws(' ', ct.prenom, ct.nom)),
    e.libelle, e.ordre
  from actions a
  join suivis_contrats s on s.id = a.suivi_contrat_id
  left join contrats c  on c.id = s.contrat_id
  left join comptes  cp on cp.id = s.compte_id
  left join contacts ct on ct.id = coalesce(a.contact_id, s.contact_principal_id)
  left join etapes_suivis_contrats e on e.id = s.etape_id
  where a.actif
    and exists (select 1 from statuts_actions s2 where s2.id = a.statut_id and s2.code not in ('TERMINEE','ANNULEE'))
  order by a.date_prevue asc nulls last;
$fn$;

comment on function public.taches_ouvertes_des_requetes() is
  'Les taches ouvertes rattachees a une requete, en retard d''abord. Vue d''ensemble du service client.';
comment on function public.taches_ouvertes_des_suivis() is
  'Les taches ouvertes rattachees a un suivi de contrat, en retard d''abord, avec l''etape du suivi.';
