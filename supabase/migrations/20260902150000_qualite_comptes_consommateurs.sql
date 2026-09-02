-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA QUALITÉ NE MESURE QUE LES COMPTES CONSOMMATEURS
--
-- Naoëlle m'a demandé la liste des comptes sans propriétaire le 02/09/2026. Ce n'était pas ce que je
-- croyais : les vingt sont TOUS des fournisseurs d'énergie — ALSEN, EKWATEUR, ELMY, PICOTY,
-- VATTENFALL, SYNELVA… Aucun compteur, aucun SIRET, dix-sept créés le 03/08/2026 par l'import du
-- référentiel des fournisseurs.
--
-- J'AVAIS TORT DE PARLER D'UN TROU DE DONNÉE. Un fournisseur n'a aucune raison d'avoir un
-- propriétaire commercial : personne ne « détient » Vattenfall dans son portefeuille. L'absence est
-- normale, et c'est la MESURE qui était mal cadrée.
--
-- ══ CE QUE LA LISTE A RÉVÉLÉ ══
--
-- Les comptes de Kimatch mélangent trois natures, et les trois entraient dans le scoring :
--
--     Consommateur   2 706 comptes   score moyen 50,4   7 904 compteurs
--     Fournisseur       52                        1,5         1
--     Partenaire         7                        0,0         0
--
-- Les 59 fournisseurs et partenaires n'ont rien à qualifier — sans compteur, le barème leur donne 0
-- par construction, pas par négligence. Ils tiraient la moyenne du portefeuille de 50,3 à 49,4 :
-- presque un point perdu sur un artefact de modèle. Et le décompte annonçait 2 765 comptes là où le
-- portefeuille en compte 2 706.
--
-- L'écran s'appelle « qualité du PORTEFEUILLE ». Un fournisseur n'est pas un portefeuille à tenir :
-- les deux vues se restreignent donc au type `CLIENT` (libellé « Consommateur »).
--
-- CONSÉQUENCE VOULUE : plus aucun compte sans propriétaire dans ces vues. Les vingt disparaissent
-- d'eux-mêmes, non parce qu'on les cache, mais parce qu'ils n'avaient rien à y faire. La somme des
-- périmètres des commerciaux fait désormais exactement le total.
--
-- CE QUI RESTE HORS DE CETTE VUE EXISTE TOUJOURS. Les 52 fournisseurs et 7 partenaires sont des
-- comptes à part entière — ce sont eux qui portent les offres et les contrats. Ils sortent d'une
-- MESURE, pas de la base.
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
  -- ══ AJOUT DU 02/09/2026 : le propriétaire du COMPTE, pas celui du compteur ══
  -- « les comptes dont je suis propriétaire et leur donnée » : le périmètre d'un commercial se
  -- définit par ses comptes, et tout ce qui pend en dessous suit. `compteurs.proprietaire_id` existe
  -- aussi, mais il désigne qui gère le point de livraison — deux notions différentes, et c'est celle
  -- du compte qu'elle demande.
  cp.proprietaire_id                                             as compte_proprietaire_id
from public.compteurs cm
join public.sites s on s.id = cm.site_id
-- LA JOINTURE DEVIENT FERME : un compteur dont le site n'a pas de compte n'a pas de portefeuille
-- auquel appartenir, et il ne pouvait de toute façon jamais apparaître dans un périmètre.
join public.comptes cp on cp.id = s.compte_id
join public.types_comptes tcp on tcp.id = cp.type_compte_id
left join public.types_energies te on te.id = cm.type_energie_id
left join public.contacts ct on ct.id = cm.responsable_contact_id
where cm.actif
  and cp.actif
  -- ══ SEULS LES COMPTES CONSOMMATEURS ══ voir l'en-tête de cette migration.
  and tcp.code = 'CLIENT';

comment on view public.v_qualite_compteur is
  'Le score de qualité d''un compteur (0 à 100), les trois faits qui le décident, son rattachement à un processus commercial ouvert, et le propriétaire de son compte. Cadrage Naoëlle du 02/09/2026.';

create or replace view public.v_qualite_compte
with (security_invoker = true) as
select
  cp.id                                        as compte_id,
  cp.nom                                       as compte_nom,
  count(q.compteur_id)                         as nb_compteurs,
  coalesce(round(avg(q.score)), 0)::integer    as score,
  count(*) filter (where q.compteur_id is not null and not q.a_contrat)      as sans_contrat,
  count(*) filter (where q.compteur_id is not null and not q.echeance_future) as echeance_a_revoir,
  count(*) filter (where q.compteur_id is not null and not q.a_responsable)  as sans_responsable,
  count(*) filter (where q.score = 100)                                     as parfaits,
  cp.proprietaire_id                           as compte_proprietaire_id
from public.comptes cp
join public.types_comptes tcp on tcp.id = cp.type_compte_id
left join public.v_qualite_compteur q on q.compte_id = cp.id
where cp.actif
  and tcp.code = 'CLIENT'
group by cp.id, cp.nom, cp.proprietaire_id;

comment on view public.v_qualite_compte is
  'Score de qualité d''un compte = moyenne des scores de ses compteurs actifs, 0 s''il n''en a aucun. Porte le propriétaire pour la bascule de périmètre.';


-- ── Le garde-fou ──
do $$
declare
  v_comptes integer;
  v_compteurs integer;
  v_sans_proprietaire integer;
  v_intrus integer;
  v_score numeric;
begin
  if exists (select 1 from public.v_qualite_compteur where score not in (0, 30, 50, 70, 80, 100)) then
    raise exception 'Le bareme rend des scores hors des six valeurs prevues';
  end if;

  -- Aucun compte non consommateur ne doit subsister dans la vue.
  select count(*) into v_intrus
    from public.v_qualite_compte q
    join public.comptes cp on cp.id = q.compte_id
    join public.types_comptes tc on tc.id = cp.type_compte_id
   where tc.code <> 'CLIENT';
  if v_intrus > 0 then
    raise exception 'La vue contient % comptes non consommateurs', v_intrus;
  end if;

  -- Et plus aucun compte sans proprietaire : c'etait la consequence attendue de la restriction, pas
  -- un effet de bord. Si ce compte n'est pas nul, un compte consommateur a perdu son proprietaire et
  -- il sortira du perimetre de tous les commerciaux — la, ce serait un vrai trou de donnee.
  select count(*) into v_sans_proprietaire
    from public.v_qualite_compte where compte_proprietaire_id is null;

  select count(*), round(avg(score), 1) into v_comptes, v_score from public.v_qualite_compte;
  select count(*) into v_compteurs from public.v_qualite_compteur;

  raise notice 'Qualite du portefeuille : % comptes, % compteurs, scoring global %',
    v_comptes, v_compteurs, v_score;
  raise notice 'Comptes consommateurs sans proprietaire : % (0 attendu)', v_sans_proprietaire;
end;
$$;

commit;
