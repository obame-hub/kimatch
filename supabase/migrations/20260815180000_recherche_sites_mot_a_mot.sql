-- ============================================================================================
-- RECHERCHE : chercher mot a mot, et non la saisie entiere dans chaque champ
-- ============================================================================================
-- Meme defaut que celui corrige le meme jour dans la recherche globale et dans les listes du
-- navigateur : le filtre comparait la saisie ENTIERE a chaque champ pris isolement.
--
-- Sur la liste des sites, chercher « amplitude bezons » ne rendait rien : « SDC AMPLITUDE » est
-- dans le nom, « BEZONS » dans la ville, et aucun des deux champs ne contient les deux mots. Le
-- probleme se posait des que la saisie melangeait un nom et une ville, ou un site et son compte.
--
-- Desormais chaque mot doit se retrouver dans au moins un des champs, et les mots se combinent par
-- ET. L'ordre devient indifferent : « bezons amplitude » trouve autant que « amplitude bezons ».
--
-- LE COALESCE N'EST PAS DECORATIF. bool_and ignore les NULL, et `ts.libelle ilike m` vaut NULL —
-- non pas false — quand le site n'a pas de type. Sans coalesce, un mot dont AUCUN champ renseigne
-- ne parlait disparaissait purement et simplement de la condition : « molinier fontenay » rendait
-- 85 sites, tous ceux de Fontenay, y compris ceux d'autres cabinets. Mesure faite avant correction.
--
-- Les fonctions sont remplacees telles quelles ; index et droits poses par la migration
-- 20260815120000 restent valables et ne sont pas retouches.
-- ============================================================================================

begin;

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
  v_motifs text[];
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

  -- Recherche « contient », insensible a la casse, MOT A MOT : chaque mot de la saisie devra se
  -- retrouver dans au moins un des champs. Chercher « amplitude bezons » ne rendait rien tant que
  -- la saisie entiere etait comparee a chaque champ pris isolement — le nom du site ne contient
  -- pas la ville. Les jokers de LIKE presents dans la saisie sont neutralises : chercher
  -- « 100 % » ne doit pas devenir un joker.
  v_motifs := case
    when p_recherche is null or btrim(p_recherche) = '' then null
    else (
      select array_agg('%' || replace(replace(replace(mot, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      from unnest(regexp_split_to_array(btrim(p_recherche), '\s+')) as mot
      where btrim(mot) <> ''
    )
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
      -- `$2::text[]` : sans ce cast, le premier usage du paramètre est un `is null` qui ne dit
      -- rien de son type et Postgres refuse la requête.
      where $2::text[] is null
         or (select bool_and(coalesce(s.nom ilike m or c.nom ilike m
                                      or s.ville ilike m or ts.libelle ilike m, false))
             from unnest($2::text[]) as m)
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
  using p_decalage, v_motifs, p_limite;
end;
$$;

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
  v_motifs text[];
begin
  -- Meme decoupage mot a mot que dans liste_sites.
  v_motifs := case
    when p_recherche is null or btrim(p_recherche) = '' then null
    else (
      select array_agg('%' || replace(replace(replace(mot, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      from unnest(regexp_split_to_array(btrim(p_recherche), '\s+')) as mot
      where btrim(mot) <> ''
    )
  end;

  return query
  with retenus as (
    select s.id, s.nom, s.compte_id, c.nom as compte_nom, s.ville, s.latitude, s.longitude
    from sites s
    left join comptes c on c.id = s.compte_id
    left join types_sites ts on ts.id = s.type_site_id
    where s.latitude is not null
      and s.longitude is not null
      and (v_motifs is null
           or (select bool_and(coalesce(s.nom ilike m or c.nom ilike m
                                        or s.ville ilike m or ts.libelle ilike m, false))
               from unnest(v_motifs) as m))
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

commit;

-- ============================================================================================
-- CONTROLE APRES APPLICATION
-- ============================================================================================
--   select count(*) from liste_sites('amplitude bezons', 'nom', 'asc', 100, 0);   -- attendu : 1 ou 2
--   select count(*) from liste_sites('amplitude', 'nom', 'asc', 100, 0);          -- inchange
--   select count(*) from liste_sites(null, 'nom', 'asc', 100, 0);                 -- 100
