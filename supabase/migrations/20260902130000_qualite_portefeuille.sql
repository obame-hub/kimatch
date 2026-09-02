-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA QUALITÉ DU PORTEFEUILLE : LE PROCESSUS COMMERCIAL D'UN COMPTEUR
--
-- Cadrage validé transmis par Naoëlle le 02/09/2026 pour la page « Qualité du portefeuille », qui
-- remplace le contenu de l'onglet Synthèse du Patrimoine.
--
-- Le barème du compteur ne change pas — il est déjà en place depuis la migration 20260902100000, et
-- le cadrage le reprend à l'identique. Ce qu'il faut ajouter, c'est le troisième filtre :
--
--   « Un compteur est considéré dans un processus commercial s'il est rattaché :
--       · à une opportunité avec le statut Nouvelle, En qualification, Couverture mandat ou Prête à
--         convertir ;
--       · ou à une recommandation avec le statut Brouillon, Active ou À réactiver. »
--
-- LES CODES CORRESPONDENT EXACTEMENT, vérifié avant d'écrire : `statuts_opportunites` porte
-- NOUVELLE, EN_QUALIFICATION, COUVERTURE_MANDAT, PRETE_A_CONVERTIR (puis CONVERTIE et ABANDONNEE,
-- exclues), et `etapes_recommandation` porte BROUILLON, ACTIVE, A_REACTIVER (puis CLOTUREE, exclue).
-- Aucune traduction n'est nécessaire : les quatre et les trois statuts du cadrage sont les codes de
-- la base.
--
-- ══ CE QUE ÇA DONNE AUJOURD'HUI, ET IL FAUT LE DIRE ══
--
-- Mesuré sur les 7 915 compteurs actifs :
--
--     1     rattaché à une opportunité ouverte
--   173     rattachés à une recommandation ouverte
--   7 741   hors processus commercial
--
-- Le filtre « hors processus » montrera donc presque tout le portefeuille, et ce n'est pas un défaut
-- du filtre : c'est l'état réel du pipeline. `opportunites_compteurs` ne porte qu'UNE ligne — le
-- périmètre en points de livraison n'est presque jamais rempli sur les opportunités. Le filtre
-- « opportunité en cours » rendra donc un seul compteur tant que cette table restera vide, et c'est
-- une information sur la saisie, pas sur le code.
--
-- ══ QUATRE COLONNES AJOUTÉES, PAS UNE VUE DE PLUS ══
--
-- `dans_processus_commercial` est le OU des deux autres, calculé une fois ici. L'écran doit filtrer
-- sur « hors processus » — la négation de ce OU — et recalculer cette négation dans le navigateur
-- reviendrait à écrire la règle deux fois. `compte_nom` complète la vue pour la colonne « Compte »
-- du tableau, qui la demandait sans l'avoir.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace view public.v_qualite_compteur
with (security_invoker = true) as
select
  cm.id                        as compteur_id,
  cm.numero_point,
  cm.site_id,
  s.nom                        as site_nom,
  s.compte_id,
  te.code                      as type_energie,
  cm.consommation_annuelle_mwh,
  cm.date_echeance,
  cm.responsable_contact_id,
  coalesce(ct.prenom || ' ' || ct.nom, '') as responsable_nom,
  exists (
    select 1 from public.contrats_compteurs cc
      join public.contrats c on c.id = cc.contrat_id
     where cc.compteur_id = cm.id
       and c.actif
       and (c.date_fin is null or c.date_fin >= current_date)
  )                                                              as a_contrat,
  (cm.date_echeance is not null and cm.date_echeance >= current_date) as echeance_future,
  (cm.responsable_contact_id is not null)                        as a_responsable,
  case
    when exists (
      select 1 from public.contrats_compteurs cc
        join public.contrats c on c.id = cc.contrat_id
       where cc.compteur_id = cm.id and c.actif
         and (c.date_fin is null or c.date_fin >= current_date)
    ) then
      case when cm.responsable_contact_id is not null then 100 else 70 end
    when cm.date_echeance is not null and cm.date_echeance >= current_date then
      case when cm.responsable_contact_id is not null then 80 else 50 end
    else
      case when cm.responsable_contact_id is not null then 30 else 0 end
  end                                                            as score,
  -- ══ AJOUTS DU 02/09/2026 ══
  cp.nom                                                         as compte_nom,
  -- Les quatre statuts d'opportunité du cadrage : tout sauf Convertie et Abandonnée.
  exists (
    select 1 from public.opportunites_compteurs oc
      join public.opportunites o on o.id = oc.opportunite_id
      join public.statuts_opportunites so on so.id = o.statut_id
     where oc.compteur_id = cm.id
       and so.code in ('NOUVELLE', 'EN_QUALIFICATION', 'COUVERTURE_MANDAT', 'PRETE_A_CONVERTIR')
  )                                                              as opportunite_en_cours,
  -- Les trois étapes de recommandation du cadrage : tout sauf Clôturée.
  exists (
    select 1 from public.recommandations_compteurs rc
      join public.recommandations r on r.id = rc.recommandation_id
      join public.etapes_recommandation er on er.id = r.etape_id
     where rc.compteur_id = cm.id
       and er.code in ('BROUILLON', 'ACTIVE', 'A_REACTIVER')
  )                                                              as recommandation_en_cours,
  -- Le OU des deux, calculé UNE fois : « hors processus commercial » est sa négation, et la
  -- recalculer dans l'écran écrirait la règle deux fois.
  (
    exists (
      select 1 from public.opportunites_compteurs oc
        join public.opportunites o on o.id = oc.opportunite_id
        join public.statuts_opportunites so on so.id = o.statut_id
       where oc.compteur_id = cm.id
         and so.code in ('NOUVELLE', 'EN_QUALIFICATION', 'COUVERTURE_MANDAT', 'PRETE_A_CONVERTIR')
    )
    or exists (
      select 1 from public.recommandations_compteurs rc
        join public.recommandations r on r.id = rc.recommandation_id
        join public.etapes_recommandation er on er.id = r.etape_id
       where rc.compteur_id = cm.id
         and er.code in ('BROUILLON', 'ACTIVE', 'A_REACTIVER')
    )
  )                                                              as dans_processus_commercial
from public.compteurs cm
join public.sites s on s.id = cm.site_id
left join public.comptes cp on cp.id = s.compte_id
left join public.types_energies te on te.id = cm.type_energie_id
left join public.contacts ct on ct.id = cm.responsable_contact_id
where cm.actif;

comment on view public.v_qualite_compteur is
  'Le score de qualité d''un compteur (0 à 100), les trois faits qui le décident, et son rattachement à un processus commercial ouvert. Barème et définitions du cadrage Naoëlle du 02/09/2026.';

-- ── Le garde-fou ──
do $$
declare
  v_hors_bareme integer;
  v_incoherent integer;
  v_dans integer;
  v_total integer;
begin
  select count(*) into v_hors_bareme
    from public.v_qualite_compteur where score not in (0, 30, 50, 70, 80, 100);
  if v_hors_bareme > 0 then
    raise exception 'Le bareme rend % scores hors des six valeurs prevues', v_hors_bareme;
  end if;

  -- `dans_processus_commercial` doit être exactement le OU des deux drapeaux : s'il s'en écarte, le
  -- filtre « hors processus » montrerait des compteurs qui sont dans un processus, ou l'inverse.
  select count(*) into v_incoherent
    from public.v_qualite_compteur
   where dans_processus_commercial <> (opportunite_en_cours or recommandation_en_cours);
  if v_incoherent > 0 then
    raise exception 'dans_processus_commercial diverge du OU sur % lignes', v_incoherent;
  end if;

  select count(*) filter (where dans_processus_commercial), count(*)
    into v_dans, v_total from public.v_qualite_compteur;
  raise notice 'Compteurs dans un processus commercial : % sur % (hors processus : %)',
    v_dans, v_total, v_total - v_dans;
end;
$$;

commit;
