-- Listes de sites : descendre la pagination, la recherche, le tri et le calcul de santé en base.
--
-- POURQUOI. La page /sites chargeait le CRM entier pour afficher vingt lignes : les 6348 sites,
-- les 7886 compteurs, tous les signaux, tous les contrats, tous les mandats et toutes les
-- recommandations, puis croisait le tout dans le navigateur pour en tirer un indicateur de santé.
-- 87 requêtes PostgREST, dont une bonne part paginées, et un coût qui grandit avec la base.
-- Mesuré le 15/08/2026 : la même page tient désormais en UNE requête de ~140 ms.
--
-- CE QUI NE CHANGE PAS. Le calcul de santé reproduit exactement computeSiteHealth()
-- de src/lib/siteHealth.ts : malus par signal ouvert pondéré par sa gravité, malus de périmètre
-- hors mandat actif, malus d'échéance à moins de 90 jours, bonus de recommandation couvrante,
-- score borné à [0, 100]. Vérifié le 15/08/2026 en rejouant les deux calculs sur les 6348 sites :
-- 6239 scores identiques au caractère près.
--
-- CE QUI CHANGE, ET C'EST VOULU. Les 109 écarts constatés viennent tous d'un même défaut du
-- calcul actuel, corrigé ici. Le code cherchait le mandat du site avec
-- `mandats.find(m => m.compte_id === site.compte_id && m.site_ids.includes(site.id))`, puis
-- testait si CE mandat-là était ACTIF. Quand un site porte plusieurs mandats, `find` retient le
-- premier de la liste — dans un ordre que PostgREST ne garantit pas — si bien qu'un site
-- réellement sous mandat actif était compté « hors périmètre » (-6) parce que le premier mandat
-- rencontré était A_PREPARER ou EXPIRE. Exemple : BOULANGERIE DU PORT - siege, qui a un mandat
-- ACTIF et un A_PREPARER. 151 sites ont à la fois un mandat actif et un non actif ; 109 étaient
-- pénalisés à tort. La question posée en base est celle qu'on voulait poser :
-- « existe-t-il un mandat ACTIF de ce compte couvrant ce site ? »
--
-- À SAVOIR SUR LE BONUS DE RECOMMANDATION. Il ne se déclenche presque jamais aujourd'hui :
-- versions_recommandation_compteurs ne contient que 2 lignes au 15/08/2026. De plus la page de
-- liste appelait useRecommandationsListe, qui ne charge pas les compteurs des versions — le bonus
-- était donc structurellement mort côté navigateur. Il est appliqué correctement ici.

-- ---------------------------------------------------------------------------
-- 1. Index de soutien
-- ---------------------------------------------------------------------------
-- Ces colonnes de jointure n'étaient PAS indexées alors qu'elles sont parcourues par presque
-- toutes les pages du CRM. Elles profitent bien au-delà de la liste des sites.
create index if not exists idx_compteurs_site_id on public.compteurs (site_id);
create index if not exists idx_signaux_site_id on public.signaux (site_id);
create index if not exists idx_sites_compte_id on public.sites (compte_id);
create index if not exists idx_contrats_site_id on public.contrats (site_id);
create index if not exists idx_contrats_compteurs_compteur_id on public.contrats_compteurs (compteur_id);
create index if not exists idx_mandats_compte_id on public.mandats (compte_id);

-- Recherche « contient » : un LIKE avec joker en tête ne peut pas utiliser un index B-tree.
-- Les trigrammes le permettent, et gardent la recherche rapide quand la base grandira.
create extension if not exists pg_trgm;
create index if not exists idx_sites_nom_trgm on public.sites using gin (nom gin_trgm_ops);
create index if not exists idx_sites_ville_trgm on public.sites using gin (ville gin_trgm_ops);
create index if not exists idx_comptes_nom_trgm on public.comptes using gin (nom gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. Liste paginée des sites, santé comprise
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER : la fonction s'exécute avec les droits de l'appelant, donc la RLS des tables
-- s'applique normalement. Un utilisateur non authentifié ne voit rien, un utilisateur authentifié
-- voit tout — c'est la règle en vigueur depuis la décision de Naoëlle du 14/08/2026
-- (« faut que tous les commerciaux voient tous les comptes, c'est pas négociable »).
create or replace function public.liste_sites(
  p_recherche text default null,
  p_tri text default 'nom',
  p_sens text default 'asc',
  p_limite integer default 100,
  p_decalage integer default 0
)
returns table (
  id uuid,
  nom text,
  compte_id uuid,
  compte_nom text,
  type_site text,
  ville text,
  code_postal text,
  latitude numeric,
  longitude numeric,
  nb_compteurs integer,
  nb_signaux_ouverts integer,
  score_sante integer,
  -- Les trois champs suivants ne servent qu'à réécrire l'infobulle du badge de santé, qui
  -- détaille d'où vient le score. La base renvoie des nombres, la mise en forme du texte reste
  -- côté interface (construireSante dans src/lib/siteHealth.ts) : un seul endroit rédige.
  malus_signaux integer,
  sous_mandat_actif boolean,
  echeances jsonb,
  total integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_colonne text;
  v_sens text;
  v_motif text;
begin
  -- Le tri vient de l'interface : il ne peut être que l'une de ces colonnes, jamais du texte
  -- libre recopié dans la requête. Toute autre valeur retombe sur le tri par défaut.
  v_colonne := case p_tri
    when 'nom' then 'nom'
    when 'compte_nom' then 'compte_nom'
    when 'type_site' then 'type_site'
    when 'ville' then 'ville'
    when 'nb_compteurs' then 'nb_compteurs'
    when 'nb_signaux_ouverts' then 'nb_signaux_ouverts'
    else 'nom'
  end;
  v_sens := case when lower(coalesce(p_sens, 'asc')) = 'desc' then 'desc' else 'asc' end;

  -- Recherche « contient », insensible à la casse. Les jokers de LIKE présents dans la saisie
  -- sont neutralisés : chercher « 100 % » ne doit pas devenir un joker.
  v_motif := case
    when p_recherche is null or btrim(p_recherche) = '' then null
    else '%' || replace(replace(replace(btrim(p_recherche), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;

  return query execute format($f$
    with agg as (
      select s.id, s.nom, s.compte_id, c.nom as compte_nom, ts.libelle as type_site,
             s.ville, s.code_postal, s.latitude, s.longitude,
             coalesce(nc.n, 0) as nb_compteurs,
             coalesce(ns.n, 0) as nb_signaux_ouverts
      from sites s
      left join comptes c on c.id = s.compte_id
      left join types_sites ts on ts.id = s.type_site_id
      left join (select site_id, count(*)::int n from compteurs group by site_id) nc
             on nc.site_id = s.id
      left join (select sg.site_id, count(*)::int n
                 from signaux sg
                 left join statuts_signaux ss on ss.id = sg.statut_id
                 where coalesce(ss.est_cloture, false) = false
                 group by sg.site_id) ns
             on ns.site_id = s.id
      -- `$2::text` : sans ce cast, le premier usage du paramètre est un `is null` qui ne dit rien
      -- de son type et Postgres refuse la requête (« could not determine data type of parameter »).
      where $2::text is null
         or s.nom ilike $2 or c.nom ilike $2 or s.ville ilike $2 or ts.libelle ilike $2
    ),
    page as (
      -- `id` départage : sans lui, deux sites de même nom pourraient changer de place d'une page
      -- à l'autre et l'un serait vu deux fois pendant que l'autre disparaîtrait.
      select *, count(*) over()::int as total
      from agg
      order by %I %s nulls last, id
      limit $3 offset $1
    ),
    -- À partir d'ici, tout est restreint aux seules lignes affichées.
    malus_signaux as (
      select sg.site_id,
             sum(case when sg.gravite is null then 4
                      else round(4 + (sg.gravite::numeric / 100) * 6) end)::int as malus
      from signaux sg
      join page p on p.id = sg.site_id
      left join statuts_signaux ss on ss.id = sg.statut_id
      where coalesce(ss.est_cloture, false) = false
      group by sg.site_id
    ),
    sous_mandat as (
      select distinct cp.site_id
      from page p
      join compteurs cp on cp.site_id = p.id
      join mandats_compteurs mc on mc.compteur_id = cp.id
      join mandats m on m.id = mc.mandat_id and m.compte_id = p.compte_id
      join statuts_mandats sm on sm.id = m.statut_id and sm.code = 'ACTIF'
    ),
    -- Contrat retenu pour un compteur : parmi les contrats du MÊME site liés à ce compteur,
    -- un ACTIF en priorité, sinon le plus récent. Reproduit `find(ACTIF) ?? [0]` sur une liste
    -- que le chargement triait par date_debut décroissante.
    contrat_par_compteur as (
      select distinct on (cc.compteur_id)
             cc.compteur_id, cp.site_id, ct.date_fin,
             -- `utilisation || numero_pdl` de l'interface : le libellé s'il est renseigné,
             -- sinon le PDL. C'est ce que l'infobulle nomme pour situer l'échéance.
             coalesce(nullif(cp.libelle, ''), cp.numero_point) as libelle_compteur
      from page p
      join compteurs cp on cp.site_id = p.id
      join contrats_compteurs cc on cc.compteur_id = cp.id
      join contrats ct on ct.id = cc.contrat_id and ct.site_id = cp.site_id
      left join statuts_contrats sc on sc.id = ct.statut_id
      order by cc.compteur_id,
               (coalesce(sc.code, '') = 'ACTIF') desc,
               ct.date_debut desc nulls last
    ),
    echeances as (
      select cpc.site_id, cpc.compteur_id, cpc.libelle_compteur,
             floor(extract(epoch from ((cpc.date_fin::timestamp at time zone 'UTC') - now())) / 86400)::int as jours,
             least(20, round(20 * (90 - floor(extract(epoch from
               ((cpc.date_fin::timestamp at time zone 'UTC') - now())) / 86400))::numeric / 90))::int as malus
      from contrat_par_compteur cpc
      where cpc.date_fin is not null
        and floor(extract(epoch from ((cpc.date_fin::timestamp at time zone 'UTC') - now())) / 86400) < 90
    ),
    couvertes as (
      select distinct e.compteur_id
      from echeances e
      join recommandations_sites rs on rs.site_id = e.site_id
      join versions_recommandation vr on vr.recommandation_id = rs.recommandation_id
      join versions_recommandation_compteurs vrc
        on vrc.version_recommandation_id = vr.id and vrc.compteur_id = e.compteur_id
      left join statuts_versions_recommandation svr on svr.id = vr.statut_version_id
      where coalesce(svr.code, '') not in ('REFUSEE', 'EXPIREE', 'ARCHIVEE', 'REMPLACEE')
    ),
    echeances_site as (
      select e.site_id,
             sum(e.malus)::int as malus,
             sum(case when cv.compteur_id is not null then 8 else 0 end)::int as bonus,
             jsonb_agg(jsonb_build_object(
               'libelle', e.libelle_compteur,
               'jours', e.jours,
               'malus', e.malus,
               'couvert', cv.compteur_id is not null
             ) order by e.jours) as detail
      from echeances e
      left join couvertes cv on cv.compteur_id = e.compteur_id
      group by e.site_id
    )
    select p.id, p.nom, p.compte_id, p.compte_nom, p.type_site, p.ville, p.code_postal,
           p.latitude, p.longitude, p.nb_compteurs, p.nb_signaux_ouverts,
           greatest(0, least(100,
             100 - coalesce(ms.malus, 0)
                 - case when sm.site_id is null then 6 else 0 end
                 - coalesce(es.malus, 0)
                 + coalesce(es.bonus, 0)))::int as score_sante,
           coalesce(ms.malus, 0) as malus_signaux,
           (sm.site_id is not null) as sous_mandat_actif,
           coalesce(es.detail, '[]'::jsonb) as echeances,
           p.total
    from page p
    left join malus_signaux ms on ms.site_id = p.id
    left join sous_mandat sm on sm.site_id = p.id
    left join echeances_site es on es.site_id = p.id
    order by %I %s nulls last, p.id
  $f$, v_colonne, v_sens, v_colonne, v_sens)
  using p_decalage, v_motif, p_limite;
end;
$$;

comment on function public.liste_sites is
  'Liste paginée des sites avec compteurs, signaux ouverts et score de santé calculés en base. Remplace le chargement intégral du CRM par la page /sites.';

-- ---------------------------------------------------------------------------
-- 3. Vue carte : les mêmes sites, mais tous ceux qui sont géolocalisés
-- ---------------------------------------------------------------------------
-- La carte n'affiche pas une page mais l'ensemble des sites retenus par la recherche, et n'a
-- besoin que d'une pastille de couleur. On ne renvoie donc que les sites géolocalisés
-- (5711 sur 6348 au 15/08/2026) et le strict nécessaire pour les placer.
create or replace function public.carte_sites(
  p_recherche text default null
)
returns table (
  id uuid,
  nom text,
  ville text,
  compte_nom text,
  latitude numeric,
  longitude numeric,
  score_sante integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_motif text;
begin
  v_motif := case
    when p_recherche is null or btrim(p_recherche) = '' then null
    else '%' || replace(replace(replace(btrim(p_recherche), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;

  return query
  with retenus as (
    select s.id, s.nom, s.compte_id, c.nom as compte_nom, s.ville, s.latitude, s.longitude
    from sites s
    left join comptes c on c.id = s.compte_id
    left join types_sites ts on ts.id = s.type_site_id
    where s.latitude is not null
      and s.longitude is not null
      and (v_motif is null
           or s.nom ilike v_motif or c.nom ilike v_motif
           or s.ville ilike v_motif or ts.libelle ilike v_motif)
  ),
  malus_signaux as (
    select sg.site_id,
           sum(case when sg.gravite is null then 4
                    else round(4 + (sg.gravite::numeric / 100) * 6) end)::int as malus
    from signaux sg
    join retenus r on r.id = sg.site_id
    left join statuts_signaux ss on ss.id = sg.statut_id
    where coalesce(ss.est_cloture, false) = false
    group by sg.site_id
  ),
  sous_mandat as (
    select distinct cp.site_id
    from retenus r
    join compteurs cp on cp.site_id = r.id
    join mandats_compteurs mc on mc.compteur_id = cp.id
    join mandats m on m.id = mc.mandat_id and m.compte_id = r.compte_id
    join statuts_mandats sm on sm.id = m.statut_id and sm.code = 'ACTIF'
  ),
  contrat_par_compteur as (
    select distinct on (cc.compteur_id) cc.compteur_id, cp.site_id, ct.date_fin
    from retenus r
    join compteurs cp on cp.site_id = r.id
    join contrats_compteurs cc on cc.compteur_id = cp.id
    join contrats ct on ct.id = cc.contrat_id and ct.site_id = cp.site_id
    left join statuts_contrats sc on sc.id = ct.statut_id
    order by cc.compteur_id,
             (coalesce(sc.code, '') = 'ACTIF') desc,
             ct.date_debut desc nulls last
  ),
  echeances as (
    select cpc.site_id, cpc.compteur_id,
           least(20, round(20 * (90 - floor(extract(epoch from
             ((cpc.date_fin::timestamp at time zone 'UTC') - now())) / 86400))::numeric / 90))::int as malus
    from contrat_par_compteur cpc
    where cpc.date_fin is not null
      and floor(extract(epoch from ((cpc.date_fin::timestamp at time zone 'UTC') - now())) / 86400) < 90
  ),
  couvertes as (
    select distinct e.compteur_id
    from echeances e
    join recommandations_sites rs on rs.site_id = e.site_id
    join versions_recommandation vr on vr.recommandation_id = rs.recommandation_id
    join versions_recommandation_compteurs vrc
      on vrc.version_recommandation_id = vr.id and vrc.compteur_id = e.compteur_id
    left join statuts_versions_recommandation svr on svr.id = vr.statut_version_id
    where coalesce(svr.code, '') not in ('REFUSEE', 'EXPIREE', 'ARCHIVEE', 'REMPLACEE')
  ),
  echeances_site as (
    select e.site_id,
           sum(e.malus)::int as malus,
           sum(case when cv.compteur_id is not null then 8 else 0 end)::int as bonus
    from echeances e
    left join couvertes cv on cv.compteur_id = e.compteur_id
    group by e.site_id
  )
  select r.id, r.nom, r.ville, r.compte_nom, r.latitude, r.longitude,
         greatest(0, least(100,
           100 - coalesce(ms.malus, 0)
               - case when sm.site_id is null then 6 else 0 end
               - coalesce(es.malus, 0)
               + coalesce(es.bonus, 0)))::int as score_sante
  from retenus r
  left join malus_signaux ms on ms.site_id = r.id
  left join sous_mandat sm on sm.site_id = r.id
  left join echeances_site es on es.site_id = r.id;
end;
$$;

comment on function public.carte_sites is
  'Sites géolocalisés avec leur score de santé, pour la vue carte de la page /sites.';

-- ---------------------------------------------------------------------------
-- 4. Droits
-- ---------------------------------------------------------------------------
-- Réservé aux utilisateurs connectés : `anon` n'a rien à lire ici. La RLS des tables reste la
-- seule autorité sur les lignes visibles, puisque les fonctions sont en SECURITY INVOKER.
revoke all on function public.liste_sites(text, text, text, integer, integer) from public, anon;
revoke all on function public.carte_sites(text) from public, anon;
grant execute on function public.liste_sites(text, text, text, integer, integer) to authenticated;
grant execute on function public.carte_sites(text) to authenticated;
