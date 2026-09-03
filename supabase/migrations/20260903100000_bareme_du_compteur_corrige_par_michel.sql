-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE BARÈME DU COMPTEUR, CORRIGÉ PAR MICHEL LUI-MÊME
--
-- Réunion « KiWee OS — Début de journée », 02/09/2026. Michel, sur ses propres chiffres de la
-- veille : « là où c'est faux, c'est parce que moi je t'ai donné des calculs faux. »
--
-- SON RAISONNEMENT, MOT POUR MOT : « sans contrat avec échéance future plus un responsable, j'avais
-- mis une note de 80. Ça devrait pas être ça, c'est trop fort en termes de scoring. Tu vois par
-- exemple un contrat sans responsable devrait être plus important. »
--
-- L'ancien barème plaçait « pas de contrat mais une échéance connue et un responsable » (80)
-- AU-DESSUS de « sous contrat sans responsable » (70). Un compteur qu'on ne fournit pas était donc
-- mieux noté qu'un compteur qu'on fournit. C'est ça qu'il corrige.
--
-- ══ LE NOUVEAU BARÈME, PAR PAS DE VINGT ══
--
--     Contrat + responsable                                      100    (inchangé)
--     Contrat + sans responsable                                  80    (était 70)
--     Sans contrat + échéance future + responsable                60    (était 80)
--     Sans contrat + échéance future + sans responsable           40    (était 50)
--     Sans contrat + échéance absente/dépassée + responsable      20    (était 30)
--     Sans contrat + échéance absente/dépassée + sans responsable   0    (inchangé)
--
-- Le contrat prend désormais les deux premières marches, et rien ne peut le dépasser sans lui. La
-- régularité du pas n'est pas cosmétique : elle rend l'écart entre deux compteurs lisible sans
-- avoir le barème sous les yeux.
--
-- ══ CE QUE ÇA CHANGE, MESURÉ AVANT APPLICATION ══
--
--     ancien → nouveau      compteurs
--        100 → 100              948
--         80 →  60            2 224      ← le gros du mouvement
--         70 →  80               85
--         50 →  40               192
--         30 →  20            3 553
--          0 →   0              902
--
-- Le scoring global du portefeuille passe de 51,7 à 40,7. C'est une baisse VOULUE : elle dit que
-- 6 671 compteurs sur 7 904 ne sont pas sous contrat, ce que l'ancien barème adoucissait.
--
-- ══ CE QUI NE BOUGE PAS ══
--
-- Ni la structure de la vue, ni les trois faits qu'elle expose, ni la moyenne du compte, ni la
-- règle Client/Prospect — Michel a confirmé les deux dans la même réunion (« le score du compte
-- c'est la moyenne des scores des compteurs », « sur le patrimoine c'est la moyenne des scores des
-- comptes »). Seules les six constantes du CASE changent.
--
-- Les dix-neuf colonnes sont reprises DANS L'ORDRE EXACT de `pg_get_viewdef` : `create or replace
-- view` refuse tout renommage ou réordonnancement (42P16, rencontré la veille sur
-- `v_qualite_compte`), et `v_qualite_compteur` en a accumulé plusieurs en trois migrations.
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
  -- ══ LE BARÈME DE MICHEL, VERSION DU 02/09/2026 ══
  case
    when exists (
      select 1 from public.contrats_compteurs cc
        join public.contrats c on c.id = cc.contrat_id
       where cc.compteur_id = cm.id and c.actif
         and (c.date_fin is null or c.date_fin >= current_date)
    ) then
      case when cm.responsable_contact_id is not null then 100 else 80 end
    when cm.date_echeance is not null and cm.date_echeance >= current_date then
      case when cm.responsable_contact_id is not null then 60 else 40 end
    else
      case when cm.responsable_contact_id is not null then 20 else 0 end
  end                                                            as score,
  cp.nom                                                         as compte_nom,
  exists (
    select 1 from public.opportunites_compteurs oc
      join public.opportunites o on o.id = oc.opportunite_id
      join public.statuts_opportunites so on so.id = o.statut_id
     where oc.compteur_id = cm.id
       and so.code in ('NOUVELLE', 'EN_QUALIFICATION', 'COUVERTURE_MANDAT', 'PRETE_A_CONVERTIR')
  )                                                              as opportunite_en_cours,
  exists (
    select 1 from public.recommandations_compteurs rc
      join public.recommandations r on r.id = rc.recommandation_id
      join public.etapes_recommandation er on er.id = r.etape_id
     where rc.compteur_id = cm.id
       and er.code in ('BROUILLON', 'ACTIVE', 'A_REACTIVER')
  )                                                              as recommandation_en_cours,
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
  )                                                              as dans_processus_commercial,
  cp.proprietaire_id                                             as compte_proprietaire_id
from public.compteurs cm
join public.sites s on s.id = cm.site_id
join public.comptes cp on cp.id = s.compte_id
join public.types_comptes tcp on tcp.id = cp.type_compte_id
left join public.types_energies te on te.id = cm.type_energie_id
left join public.contacts ct on ct.id = cm.responsable_contact_id
where cm.actif and cp.actif and tcp.code = 'CLIENT';

comment on view public.v_qualite_compteur is
  'Le score de qualité d''un compteur (0 à 100) et les trois faits qui le décident. Barème de Michel du 02/09/2026 : 100 / 80 contrat, 60 / 40 échéance future, 20 / 0 sinon — il corrige celui du 01/09, qui notait un compteur sans contrat au-dessus d''un compteur sous contrat sans responsable.';

-- ── Les garde-fous : les six valeurs, et le contrat qui prime ──
do $$
declare
  v_hors_bareme integer;
  v_moyenne numeric;
begin
  select count(*) into v_hors_bareme
    from public.v_qualite_compteur where score not in (0, 20, 40, 60, 80, 100);
  if v_hors_bareme > 0 then
    raise exception 'Le barème rend % scores hors des six valeurs prévues', v_hors_bareme;
  end if;

  -- Le correctif de Michel tient en une phrase : rien ne dépasse un compteur sous contrat.
  if exists (select 1 from public.v_qualite_compteur where a_contrat and score < 80) then
    raise exception 'Un compteur sous contrat score moins de 80 : l''ordre du barème est faux';
  end if;
  if exists (select 1 from public.v_qualite_compteur where not a_contrat and score > 60) then
    raise exception 'Un compteur sans contrat dépasse 60 : c''est exactement le défaut corrigé ici';
  end if;

  select round(avg(score), 1) into v_moyenne from public.v_qualite_compte;
  raise notice 'Scoring global du portefeuille après le nouveau barème : % (51,7 avant)', v_moyenne;
end;
$$;

commit;
