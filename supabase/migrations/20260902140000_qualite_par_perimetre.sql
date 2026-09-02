-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA QUALITÉ DU PORTEFEUILLE SE LIT AUSSI PAR COMMERCIAL
--
-- Naoëlle, 02/09/2026 : « j'aimerais avoir un genre de toggle qui montre les données de tout le
-- patrimoine Kimatch, et un toggle comme si j'étais commercial et je veux voir les données de mon
-- patrimoine à moi, donc les comptes dont je suis propriétaire et leur donnée. Le toggle sera par
-- défaut dans les données du commercial. »
--
-- LES DEUX VUES N'EXPOSENT PAS LE PROPRIÉTAIRE. Elles partent du compte pour le nom, mais pas pour
-- `proprietaire_id` : impossible de filtrer sur « mes comptes » sans lire la table des comptes une
-- seconde fois côté navigateur. La colonne est donc ajoutée aux deux — une seule au bout de chaque
-- vue, ce que `create or replace view` accepte.
--
-- ══ POURQUOI LE FILTRE PART EN BASE, ICI, ALORS QUE LES TROIS AUTRES SONT DANS LE NAVIGATEUR ══
--
-- Les trois filtres du cadrage — échéance, scoring, processus — se combinent en permanence et
-- doivent recalculer deux graphiques et des totaux à chaque clic : les garder en mémoire rend la
-- page instantanée.
--
-- Le périmètre est d'une autre nature. Il ne change qu'une fois de temps en temps, et il RÉDUIT le
-- volume au lieu de le trancher : un commercial qui ne voit que ses comptes n'a aucune raison de
-- télécharger les 7 915 compteurs du portefeuille. Le filtrer en base fait donc deux choses à la
-- fois — il respecte la demande et il allège le chargement, qui est le seul vrai coût de cette page.
--
-- ══ LE PAR DÉFAUT EST « MOI », ET C'EST LA RÈGLE DE TOUS LES ÉCRANS ══
--
-- `usePerimetre` est en place depuis le 28/08 sur les recommandations, les opportunités, les
-- mandats, les requêtes. Sa règle : « Mes dossiers » par défaut pour tout le monde, administrateurs
-- compris, avec la bascule à côté. C'est exactement ce que Naoëlle demande ici, donc rien de neuf à
-- écrire — l'écran réutilise le même composant et la même mémoire de choix.
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
left join public.comptes cp on cp.id = s.compte_id
left join public.types_energies te on te.id = cm.type_energie_id
left join public.contacts ct on ct.id = cm.responsable_contact_id
where cm.actif;

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
left join public.v_qualite_compteur q on q.compte_id = cp.id
left join public.profils pr on pr.id = cp.proprietaire_id
where cp.actif
group by cp.id, cp.nom, cp.proprietaire_id;

comment on view public.v_qualite_compte is
  'Score de qualité d''un compte = moyenne des scores de ses compteurs actifs, 0 s''il n''en a aucun. Porte le propriétaire pour la bascule de périmètre.';

-- ── Le garde-fou ──
do $$
declare
  v_sans_proprietaire integer;
  v_comptes integer;
  v_repartition text;
begin
  -- Le barème ne doit pas avoir bougé en réécrivant la vue.
  if exists (select 1 from public.v_qualite_compteur where score not in (0, 30, 50, 70, 80, 100)) then
    raise exception 'Le bareme rend des scores hors des six valeurs prevues';
  end if;

  -- Un compte sans propriétaire n'apparaîtra dans AUCUN périmètre « moi ». Ce n'est pas un défaut de
  -- la vue, c'est un trou de donnée — mais il faut le savoir, sinon on cherche pourquoi les totaux
  -- de tous les commerciaux ne font pas celui du portefeuille.
  select count(*) filter (where compte_proprietaire_id is null), count(*)
    into v_sans_proprietaire, v_comptes
    from public.v_qualite_compte;

  -- Le decompte par commercial, pour lire d'un coup ce que chaque perimetre contiendra.
  -- Le `group by` porte sur le NOM, pas sur l'expression qui contient l'agregat : Postgres refuse
  -- « group by 1 » quand la premiere colonne est batie avec count(*).
  select string_agg(x.nom || ' : ' || x.n, ' · ' order by x.n desc) into v_repartition
    from (
      select coalesce(pr.prenom || ' ' || pr.nom, '(sans proprietaire)') as nom, count(*) as n
        from public.v_qualite_compte q
        left join public.profils pr on pr.id = q.compte_proprietaire_id
       group by 1
    ) x;

  raise notice 'Comptes : % dont % sans proprietaire', v_comptes, v_sans_proprietaire;
  raise notice 'Repartition : %', v_repartition;
end;
$$;

commit;
