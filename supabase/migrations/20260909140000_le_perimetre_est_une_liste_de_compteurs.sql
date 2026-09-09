-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE PÉRIMÈTRE EST UNE LISTE DE COMPTEURS — ÉTAPE 2 DU RETRAIT DE L'OBJET SITE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 09/09/2026 : « il faut pouvoir relier toutes les recommandations à leurs compteurs vu
-- qu'on va supprimer les sites. »
--
-- ══ CE QUE LA MESURE A RÉPONDU AVANT D'ÉCRIRE QUOI QUE CE SOIT ═════════════════════════════════
--
-- Les recommandations SONT DÉJÀ toutes reliées à leurs compteurs. Vérifié le 09/09/2026 :
--
--   1 912  paires (recommandation, site) déclarées dans `recommandations_sites`
--   1 912  paires déductibles des compteurs de `recommandations_compteurs`
--       0  paire déclarée mais non déductible
--       0  recommandation portant un site sans aucun compteur
--
-- `recommandations_sites` est donc INTÉGRALEMENT REDONDANT : chaque site du périmètre est le site
-- d'un compteur du périmètre. Il n'y a rien à rebasculer, rien à reconstruire — ce qu'une migration
-- de déplacement aurait fait, c'est réécrire ce qui existe déjà.
--
-- Cette migration ne touche donc PAS aux recommandations. Elle ne comble que le seul trou réel, et
-- elle prouve la redondance plutôt que de la supposer : le garde-fou refait le calcul.
--
-- ══ LE SEUL TROU RÉEL : DEUX OPPORTUNITÉS ══════════════════════════════════════════════════════
--
--   OPP-2026-018   deux sites déclarés, aucun compteur au périmètre
--   OPP-2026-029   les deux mêmes sites, aucun compteur non plus
--
-- Chacun de ces deux sites — SDC 45 VOIE DE LA VALLÉE AUX LOUPS et SDC 56 AVENUE VICTOR CRESSON —
-- porte exactement un compteur. Le périmètre voulu par le commercial est donc sans ambiguïté : ces
-- compteurs-là. Quatre lignes à écrire.
--
-- SANS ELLES, CES DEUX OPPORTUNITÉS PERDRAIENT LEUR PÉRIMÈTRE le jour où `opportunites_sites`
-- disparaît — silencieusement, puisqu'une opportunité sans compteur s'affiche simplement vide.
-- C'est exactement la perte que Naoëlle a demandé d'éviter.
--
-- ══ CE QUE CETTE MIGRATION NE FAIT PAS ═════════════════════════════════════════════════════════
--
-- Elle ne supprime NI `recommandations_sites` NI `opportunites_sites`. Le code les lit encore —
-- `recommandations.ts` ligne 238, `opportunites.ts` ligne 70 — et supprimer une table qu'un écran
-- interroge casse l'écran, pas la table. Le retrait viendra quand le code aura basculé, et
-- `npm run carte:verifier` dira quand plus rien ne les lit.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── LES QUATRE LIGNES MANQUANTES ────────────────────────────────────────────────────────────────
--
-- On dérive le compteur du site déclaré, sans le nommer en dur : si un compteur avait bougé de site
-- entre-temps, la requête suivrait le déplacement au lieu d'écrire une valeur périmée.
insert into opportunites_compteurs (opportunite_id, compteur_id)
select distinct os.opportunite_id, cp.id
  from opportunites_sites os
  join compteurs cp on cp.site_id = os.site_id
 where not exists (
   select 1 from opportunites_compteurs oc where oc.opportunite_id = os.opportunite_id
 )
on conflict (opportunite_id, compteur_id) do nothing;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES GARDE-FOUS
--
-- Celui de la migration précédente m'a menti : il ne vérifiait que les quatre tables qu'il venait
-- d'écrire, et annonçait « 0 CASCADE restante » alors qu'il en restait deux. La leçon est appliquée
-- ici — chaque contrôle REFAIT le calcul depuis les données, sans se fier à ce qui vient d'être
-- inséré, et le dernier compte ce qui reste en dehors de ce qu'on a touché.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_reco_orphelines integer;
  v_reco_ecart      integer;
  v_opp_orphelines  integer;
  v_opp_ecart       integer;
  v_ajoutees        integer;
begin
  -- ① AUCUNE RECOMMANDATION NE PERD SON PÉRIMÈTRE. Un site déclaré doit être le site d'un compteur
  --   déclaré. C'est la condition exacte pour que `recommandations_sites` puisse disparaître.
  select count(*) into v_reco_ecart from (
    select recommandation_id, site_id from recommandations_sites
    except
    select rc.recommandation_id, cp.site_id
      from recommandations_compteurs rc join compteurs cp on cp.id = rc.compteur_id
  ) x;
  if v_reco_ecart > 0 then
    raise exception 'Garde-fou : % paire(s) (reco, site) ne se retrouvent pas dans le perimetre compteur', v_reco_ecart;
  end if;

  select count(distinct rs.recommandation_id) into v_reco_orphelines
    from recommandations_sites rs
   where not exists (
     select 1 from recommandations_compteurs rc where rc.recommandation_id = rs.recommandation_id
   );
  if v_reco_orphelines > 0 then
    raise exception 'Garde-fou : % recommandation(s) ont un site mais aucun compteur', v_reco_orphelines;
  end if;

  -- ② MÊME EXIGENCE POUR LES OPPORTUNITÉS, après l'insertion.
  select count(distinct os.opportunite_id) into v_opp_orphelines
    from opportunites_sites os
   where not exists (
     select 1 from opportunites_compteurs oc where oc.opportunite_id = os.opportunite_id
   );
  if v_opp_orphelines > 0 then
    raise exception 'Garde-fou : % opportunite(s) ont un site mais aucun compteur', v_opp_orphelines;
  end if;

  /* ③ L'ÉCART SUR LES OPPORTUNITÉS EST TOLÉRÉ, ET LA RAISON EST DITE.
     Un site déclaré peut ne porter AUCUN compteur — c'est le cas d'un des deux « SDC KER LANN »,
     deux sites homonymes dont un seul est équipé. Le périmètre de l'opportunité reste couvert par
     l'autre, mais la paire (opportunité, site vide) n'est déductible d'aucun compteur : elle
     n'apporte rien et disparaîtra avec la table. On la compte sans échouer, plutôt que de la taire. */
  select count(*) into v_opp_ecart from (
    select os.opportunite_id, os.site_id from opportunites_sites os
    except
    select oc.opportunite_id, cp.site_id
      from opportunites_compteurs oc join compteurs cp on cp.id = oc.compteur_id
  ) y;

  select count(*) into v_ajoutees from opportunites_compteurs;

  raise notice 'Garde-fou passe : 0 recommandation orpheline, 0 opportunite orpheline, % lignes de perimetre compteur sur les opportunites', v_ajoutees;
  if v_opp_ecart > 0 then
    raise notice 'Note : % paire(s) (opportunite, site) portent un site sans compteur — sans effet sur le perimetre', v_opp_ecart;
  end if;
end $$;

commit;

analyze opportunites_compteurs;
