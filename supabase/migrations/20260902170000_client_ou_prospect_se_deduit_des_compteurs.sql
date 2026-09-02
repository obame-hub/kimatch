-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- « BEAUCOUP D'OBJETS CLIENT QUI NE LE SONT PAS »
--
-- Naoëlle, 02/09/2026. Constat exact, et la cause tenait en une ligne de `CompteDetail.tsx` :
--
--     const statutClient = useMemo(() => true, [])   // « câblé une fois l'onglet Sites aligné »
--
-- Le badge « Client / Prospect » de la fiche compte était écrit en dur à `true`. Les 2 765 comptes
-- de la base s'affichaient donc « Client ». Juste en dessous, la liste des sites du compte peignait
-- « Client » ou « Prospect » d'après `site.statut === 'actif'` — le statut actif/inactif d'un site
-- n'a aucun rapport avec le fait d'être fourni, et aucun compteur actif ne pend sous un site
-- inactif : tous les sites s'affichaient « Client » eux aussi.
--
-- ══ LA RÈGLE, DE MICHEL, 02/09/2026 18 h 10 ══
--
-- « Un compte est considéré comme Client dès lors qu'AU MOINS UN DE SES COMPTEURS est rattaché à un
-- contrat. À l'inverse, si aucun compteur du compte n'est rattaché à un contrat, le compte reste
-- Prospect. »
--
-- C'est le compteur qui décide, pas le compte. La distinction n'est pas théorique : `contrats`
-- porte aussi un `compte_id`, et les deux lectures divergent sur 43 comptes — 26 ont un contrat
-- rattaché au compte sans qu'aucun compteur n'y soit lié (45 contrats actifs ne couvrent aucun
-- compteur), 17 l'inverse. La règle de Michel tranche : on suit les compteurs.
--
-- ══ « RATTACHÉ À UN CONTRAT » = LE MÊME CONTRAT QUE LE BARÈME ══
--
-- Michel ne précise pas quel contrat, et trois lectures cohabitaient déjà dans l'application :
--
--     contrat actif, non terminé (le barème du score)     1 033 compteurs → 392 comptes
--     contrat actif, terminé compris                      1 454 compteurs → 502 comptes
--     statut ACTIF ou A_RENOUVELER (l'assistant de reco)              ? → 320 comptes
--
-- On retient LA PREMIÈRE, parce que c'est déjà celle de `v_qualite_compteur.a_contrat`, que Michel
-- vient de valider dans le même message (« le score du compteur peut donc RESTER basé sur la
-- logique suivante »). Un compte est Client parce que ses compteurs sont fournis AUJOURD'HUI ; un
-- contrat terminé ne dit rien de qui les fournit maintenant — c'est le raisonnement déjà écrit
-- dans la migration du barème et dans `echeance.ts`.
--
-- Une seule notion de « sous contrat » dans toute l'application, donc : le badge de la fiche, le
-- score du compteur et le décompte du patrimoine ne peuvent plus se contredire.
--
-- ══ MESURÉ LE 02/09/2026 ══
--
--     2 706 comptes consommateurs actifs
--       392 Clients      (au moins un compteur sous contrat en cours)
--     2 314 Prospects
--
-- L'écran en annonçait 2 765 sur 2 765. C'est l'écart que Naoëlle a vu.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ 1. LE COMPTE : Client dès qu'un seul de ses compteurs est sous contrat ══
--
-- `bool_or` sur `a_contrat` dit exactement « au moins un » — et rend `false` (jamais NULL) grâce au
-- `coalesce`, pour qu'un compte sans aucun compteur soit Prospect plutôt qu'indéterminé. C'est la
-- même convention que le score, qui vaut 0 dans ce cas.
--
-- ══ LES DEUX COLONNES SONT AJOUTÉES À LA FIN, ET CE N'EST PAS UN DÉTAIL DE STYLE ══
--
-- `create or replace view` refuse de renommer ou de réordonner une colonne existante : il n'accepte
-- que des ajouts EN QUEUE. Une première rédaction glissait `est_client` en neuvième position, là où
-- la vue en production porte déjà `compte_proprietaire_id` (ajoutée par la migration
-- 20260902150000), et Postgres a répondu :
--
--     42P16 — cannot change name of view column "compte_proprietaire_id" to "est_client"
--
-- L'ordre ci-dessous reprend donc EXACTEMENT celui de `pg_get_viewdef` en base, avec les deux
-- nouvelles colonnes après. Même raison pour `tcp.code = 'CLIENT'` : c'est ce que la vue teste
-- aujourd'hui (le libellé est « Consommateur »), et un `create or replace` n'a pas à en changer.
create or replace view public.v_qualite_compte
with (security_invoker = true) as
select
  cp.id                                        as compte_id,
  cp.nom                                       as compte_nom,
  count(q.compteur_id)                         as nb_compteurs,
  coalesce(round(avg(q.score)), 0)::integer    as score,
  count(*) filter (where q.compteur_id is not null and not q.a_contrat)       as sans_contrat,
  count(*) filter (where q.compteur_id is not null and not q.echeance_future) as echeance_a_revoir,
  count(*) filter (where q.compteur_id is not null and not q.a_responsable)   as sans_responsable,
  count(*) filter (where q.score = 100)                                       as parfaits,
  cp.proprietaire_id                                                          as compte_proprietaire_id,
  -- ── La règle de Michel, en une ligne ──
  coalesce(bool_or(q.a_contrat), false)                                       as est_client,
  count(*) filter (where q.a_contrat)                                         as compteurs_sous_contrat
from public.comptes cp
join public.types_comptes tcp on tcp.id = cp.type_compte_id
left join public.v_qualite_compteur q on q.compte_id = cp.id
where cp.actif
  -- La qualité ne mesure que les comptes consommateurs (migration 20260902150000) : un fournisseur
  -- n'est ni client ni prospect, la question ne se pose pas pour lui.
  and tcp.code = 'CLIENT'
group by cp.id, cp.nom, cp.proprietaire_id;

comment on view public.v_qualite_compte is
  'Score de qualité d''un compte consommateur = moyenne des scores de ses compteurs actifs (0 s''il n''en a aucun), et son statut commercial : Client dès qu''au moins un compteur est sous contrat en cours, Prospect sinon (règle de Michel du 02/09/2026).';

-- ══ 2. LE SITE : la même règle, un cran plus bas ══
--
-- La fiche compte liste ses sites avec un badge Client/Prospect par ligne. Michel n'a énoncé la
-- règle que pour le compte, mais la décliner au site est la seule lecture qui ne se contredit pas :
-- un compte est Client parce qu'un de ses sites l'est, et un site parce qu'un de ses compteurs
-- l'est. Le badge du compte reste donc toujours vrai si un seul de ses sites porte le sien.
create or replace view public.v_statut_commercial_site
with (security_invoker = true) as
select
  q.site_id,
  q.compte_id,
  count(*)                                     as nb_compteurs,
  count(*) filter (where q.a_contrat)          as compteurs_sous_contrat,
  bool_or(q.a_contrat)                         as est_client
from public.v_qualite_compteur q
group by q.site_id, q.compte_id;

comment on view public.v_statut_commercial_site is
  'Statut commercial d''un site : Client dès qu''au moins un de ses compteurs est sous contrat en cours. Un site sans compteur n''y figure pas — il est Prospect par absence.';

-- Les privilèges par défaut du rôle qui applique les migrations les accordent déjà, mais une vue
-- que l'application ne peut pas lire est un écran vide sans message d'erreur : on l'écrit.
grant select on public.v_statut_commercial_site to anon, authenticated, service_role;

-- ══ 3. LE PATRIMOINE COMPTAIT AUTREMENT ══
--
-- `v_patrimoine_synthese.nb_avec_contrat` lisait `contrats.compte_id` — un contrat rattaché au
-- compte suffisait, même s'il ne couvrait aucun compteur. Les deux blocs de la page Patrimoine
-- annonçaient donc un nombre de clients que la fiche compte ne confirmait pas. On les aligne sur
-- la règle de Michel ; le reste de la vue est reconduit à l'identique.
create or replace view public.v_patrimoine_synthese
with (security_invoker = true) as
with comptes_consommateurs as (
  select c.id, c.segment
    from public.comptes c
    join public.types_comptes tc on tc.id = c.type_compte_id
   where c.actif and tc.libelle = 'Consommateur'
), clients as (  -- le libellé, comme la vue d'origine le testait ; les douze colonnes gardent leur ordre
  -- « Au moins un compteur rattaché à un contrat » — la définition de Michel, celle du barème.
  select distinct s.compte_id
    from public.compteurs cm
    join public.sites s on s.id = cm.site_id
   where cm.actif
     and exists (
       select 1 from public.contrats_compteurs cc
         join public.contrats c on c.id = cc.contrat_id
        where cc.compteur_id = cm.id
          and c.actif
          and (c.date_fin is null or c.date_fin >= current_date)
     )
)
select
  (select count(*) from comptes_consommateurs) as nb_comptes,
  (select count(*) from comptes_consommateurs cc
     where exists (select 1 from clients a where a.compte_id = cc.id)) as nb_avec_contrat,
  (select count(*) from comptes_consommateurs cc
     where not exists (select 1 from clients a where a.compte_id = cc.id)) as nb_sans_contrat,
  (select count(*) from public.v_compteurs_liste
    where actif and nature_echeance = 'ABSENTE') as nb_echeance_vide,
  (select count(*) from public.v_compteurs_liste
    where actif and nature_echeance <> 'ABSENTE' and date_echeance < current_date) as nb_echeance_depassee,
  (select count(*) from public.compteurs where actif and responsable_contact_id is null) as nb_sans_responsable,
  (select count(*) from public.compteurs where actif) as nb_compteurs,
  (select count(*) from public.v_compteurs_liste
    where actif and nature_echeance <> 'ABSENTE' and date_echeance >= current_date) as nb_echeance_valide,
  (select count(*) from public.v_compteurs_liste
    where actif and nature_echeance <> 'ABSENTE' and date_echeance >= current_date
      and date_echeance < current_date + interval '3 months') as nb_0_3_mois,
  (select count(*) from public.v_compteurs_liste
    where actif and nature_echeance <> 'ABSENTE' and date_echeance >= current_date + interval '3 months'
      and date_echeance < current_date + interval '6 months') as nb_4_6_mois,
  (select count(*) from public.v_compteurs_liste
    where actif and nature_echeance <> 'ABSENTE' and date_echeance >= current_date + interval '6 months'
      and date_echeance < current_date + interval '1 year') as nb_7_12_mois,
  (select count(*) from public.v_compteurs_liste
    where actif and nature_echeance <> 'ABSENTE' and date_echeance >= current_date + interval '1 year') as nb_plus_12_mois;

comment on view public.v_patrimoine_synthese is
  'Les douze nombres de la page Patrimoine. « Avec contrat » suit la règle de Michel du 02/09/2026 : au moins un compteur du compte sous contrat en cours (auparavant : un contrat rattaché au compte, ce qui comptait 26 comptes de plus).';

-- ── Le garde-fou : les trois lectures doivent désormais concorder ──
do $$
declare
  v_clients integer;
  v_prospects integer;
  v_synthese integer;
  v_incoherents integer;
begin
  select count(*) filter (where est_client), count(*) filter (where not est_client)
    into v_clients, v_prospects from public.v_qualite_compte;

  select nb_avec_contrat into v_synthese from public.v_patrimoine_synthese;
  if v_synthese <> v_clients then
    raise exception 'Le patrimoine compte % clients, la fiche compte en compte % — les deux vues se contredisent',
      v_synthese, v_clients;
  end if;

  -- Un compte Client sans aucun compteur sous contrat serait une contradiction dans les termes.
  select count(*) into v_incoherents
    from public.v_qualite_compte where est_client and compteurs_sous_contrat = 0;
  if v_incoherents > 0 then
    raise exception '% comptes sont Client sans compteur sous contrat', v_incoherents;
  end if;

  -- Un compte Client doit avoir au moins un site Client, et réciproquement.
  select count(*) into v_incoherents
    from public.v_qualite_compte q
   where q.est_client <> coalesce((select bool_or(v.est_client)
                                     from public.v_statut_commercial_site v
                                    where v.compte_id = q.compte_id), false);
  if v_incoherents > 0 then
    raise exception '% comptes ne s''accordent pas avec le statut de leurs sites', v_incoherents;
  end if;

  raise notice 'Statut commercial : % clients, % prospects sur % comptes consommateurs',
    v_clients, v_prospects, v_clients + v_prospects;
end;
$$;

commit;
