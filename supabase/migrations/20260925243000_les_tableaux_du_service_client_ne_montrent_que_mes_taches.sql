-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CHACUN NE VOIT QUE SES TÂCHES, ET PEUT S'ARRÊTER SUR UN JOUR
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 25/09/2026 : « seules les tâches appartenant à l'utilisateur visualisateur sont
-- visibles », et « quand Fabien clique sur une card de la charge à venir, alors les tableaux se
-- mettent à jour avec les tâches prévues pour ce jour précis ».
--
-- ══ LA COHÉRENCE AVEC LA CHARGE L'EXIGEAIT DÉJÀ ══
--
-- `compter_charge_a_venir` ne compte QUE les tâches dont on est responsable. Les tableaux, eux,
-- montraient tout : la barre d'un jour annonçait trois tâches, le tableau en listait 284. Deux
-- chiffres côte à côte qui ne parlent pas du même ensemble finissent toujours par être lus comme
-- s'ils le faisaient.
--
-- ══ LE JOUR EST UN PARAMÈTRE, PAS UN FILTRE D'ÉCRAN ══
--
-- Rapatrier 284 lignes pour n'en garder que celles d'un mardi serait payer le transport de tout
-- pour afficher trois lignes — et le refaire à chaque clic dans la matrice. `null` rend tout ce qui
-- est ouvert, une date rend ce jour-là.
--
-- ══ À SAVOIR EN RELISANT CES CHIFFRES ══
--
-- Interrogées hors d'une session connectée — un outil SQL, une console d'administration — ces
-- fonctions rendent ZÉRO : `auth.uid()` y est nul. Ce n'est pas une panne, c'est le filtre qui
-- fait son travail.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.taches_ouvertes_des_requetes(p_jour date default null)
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
    and a.responsable_profil_id = auth.uid()
    and exists (select 1 from statuts_actions s where s.id = a.statut_id and s.code not in ('TERMINEE','ANNULEE'))
    and (p_jour is null or (a.date_prevue at time zone 'Europe/Paris')::date = p_jour)
  order by a.date_prevue asc nulls last;
$fn$;

create or replace function public.taches_ouvertes_des_suivis(p_jour date default null)
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
    and a.responsable_profil_id = auth.uid()
    and exists (select 1 from statuts_actions s2 where s2.id = a.statut_id and s2.code not in ('TERMINEE','ANNULEE'))
    and (p_jour is null or (a.date_prevue at time zone 'Europe/Paris')::date = p_jour)
  order by a.date_prevue asc nulls last;
$fn$;

-- ══ LES CHIFFRES SUIVENT LA MÊME RÈGLE ══
--
-- Les deux compteurs « tâches en retard » comptaient celles de tout le monde, sous des tableaux qui
-- ne montrent désormais que les miennes. Un chiffre et le tableau qu'il coiffe doivent parler du
-- même ensemble, sans quoi l'écart se lit comme une panne.
--
-- Les autres restent globaux, et c'est voulu : « nouvelles requêtes aujourd'hui », « contrats
-- validés aujourd'hui » et « en attente d'activation » décrivent l'activité du service, pas la
-- charge d'une personne. Leur libellé le dit.

create or replace function public.chiffres_service_client()
returns jsonb
language sql
stable
set search_path to 'public'
as $fn$
  with aujourdhui as (select (now() at time zone 'Europe/Paris')::date as j),
  miennes as (
    select a.* from actions a
    where a.actif
      and a.responsable_profil_id = auth.uid()
      and exists (select 1 from statuts_actions s where s.id = a.statut_id and s.code not in ('TERMINEE','ANNULEE'))
  )
  select jsonb_build_object(
    'requetes_du_jour',
      (select count(*) from requetes r, aujourdhui
        where r.actif and (r.date_creation at time zone 'Europe/Paris')::date = aujourdhui.j),
    'taches_requetes_en_retard',
      (select count(*) from miennes a, aujourdhui
        where a.requete_id is not null and (a.date_prevue at time zone 'Europe/Paris')::date < aujourdhui.j),
    /* Le délai ne compte que les requêtes résolues depuis le 25/09/2026 : date fixe, pour ne pas
       traîner les 645 reprises de Salesforce. `null` tant que rien ne l'a été — « 0 jour » se
       lirait comme une performance parfaite. */
    'jours_moyens_resolution',
      (select round(avg(extract(epoch from (r.date_resolution - r.date_creation)) / 86400)::numeric, 1)
         from requetes r
        where r.actif and r.date_resolution is not null
          and (r.date_resolution at time zone 'Europe/Paris')::date >= date '2026-09-25'),
    'resolutions_comptees',
      (select count(*) from requetes r
        where r.actif and r.date_resolution is not null
          and (r.date_resolution at time zone 'Europe/Paris')::date >= date '2026-09-25'),
    'contrats_valides_du_jour',
      (select count(*) from contrats c, aujourdhui
        where (c.date_validation at time zone 'Europe/Paris')::date = aujourdhui.j),
    'taches_suivis_en_retard',
      (select count(*) from miennes a, aujourdhui
        where a.suivi_contrat_id is not null and (a.date_prevue at time zone 'Europe/Paris')::date < aujourdhui.j),
    'contrats_en_attente_activation',
      (select count(*) from suivis_contrats s
         join etapes_suivis_contrats e on e.id = s.etape_id
        where e.ordre < (select ordre from etapes_suivis_contrats where code = 'CONTRAT_ACTIF')
          and s.date_cloture is null)
  );
$fn$;
