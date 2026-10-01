-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- L'OFFRE ACTUELLE ET LA PUBLICATION DU COMPARATIF — étape 1 du moteur du pricing
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ L'OFFRE ACTUELLE ══
-- La référence du comparatif (« Offre actuelle · ENGIE », PDF de William) est une offre de nature
-- EN_COURS sous la version, marquée référence. `fn_offre_actuelle` la trouve ou la crée — avec la
-- fiche fournisseur et l'optimisation qui peuvent manquer (220 versions n'en ont aucune) — pour que
-- l'écran n'ait jamais à enchaîner trois écritures qui pourraient s'arrêter au milieu.
--
-- ══ PUBLIER ══
-- William : un comparatif ne part aux commerciaux que complet — « risque d'erreur nul ». La règle
-- est tenue ICI, pas seulement par le bouton grisé de l'écran : une publication passe ou échoue en
-- base, d'un bloc.
--   · chaque offre commandée (hors indexées, qui ne vont pas au comparatif — William, 01/10/2026)
--     est DISPONIBLE ou INDISPONIBLE ;
--   · au moins une est DISPONIBLE ;
--   · l'offre actuelle est chiffrée sur chaque compteur de la version.
-- La version passe alors « Disponible » et porte la date et l'auteur de la publication.

create or replace function public.fn_offre_actuelle(p_version uuid, p_fournisseur uuid, p_duree integer default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opt uuid;
  v_offre uuid;
  v_gaz boolean;
  v_type uuid;
begin
  select o.id into v_opt from public.optimisations o where o.version_recommandation_id = p_version order by o.ordre limit 1;
  if v_opt is null then
    select id into v_type from public.types_optimisations where code = 'MISE_EN_CONCURRENCE';
    insert into public.optimisations (version_recommandation_id, nom, priorite, est_retenue, type_optimisation_id)
    values (p_version, 'Mise en concurrence', 1, false, v_type)
    returning id into v_opt;
  end if;

  select te.code = 'GAZ' into v_gaz
  from public.versions_recommandation v
  join public.recommandations r on r.id = v.recommandation_id
  left join public.types_energies te on te.id = r.type_energie_id
  where v.id = p_version;
  insert into public.comptes_fournisseurs (compte_id, fournit_gaz, fournit_electricite)
  values (p_fournisseur, coalesce(v_gaz, false), not coalesce(v_gaz, false))
  on conflict (compte_id) do nothing;

  select id into v_offre from public.offres_fournisseurs
  where optimisation_id = v_opt and nature_offre = 'EN_COURS' and actif
  order by date_creation limit 1;

  if v_offre is null then
    insert into public.offres_fournisseurs
      (optimisation_id, compte_fournisseur_id, nom, statut, nature_offre, est_offre_reference, duree_mois, type_prix)
    values (v_opt, p_fournisseur, 'Offre actuelle', 'DISPONIBLE', 'EN_COURS', true, p_duree, 'Fixe')
    returning id into v_offre;
  else
    update public.offres_fournisseurs
       set compte_fournisseur_id = p_fournisseur, duree_mois = coalesce(p_duree, duree_mois), date_modification = now()
     where id = v_offre;
  end if;
  return v_offre;
end;
$$;

create or replace function public.fn_publier_comparatif(p_version uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_en_attente integer;
  v_dispo integer;
  v_compteurs integer;
  v_actuel_chiffre integer;
  v_disponible uuid;
begin
  select count(*) filter (where o.statut not in ('DISPONIBLE', 'INDISPONIBLE')),
         count(*) filter (where o.statut = 'DISPONIBLE')
    into v_en_attente, v_dispo
  from public.offres_fournisseurs o
  join public.optimisations op on op.id = o.optimisation_id
  where op.version_recommandation_id = p_version and o.actif and o.nature_offre = 'PROPOSEE'
    and coalesce(o.type_prix, '') not ilike 'index%';

  if v_en_attente > 0 then
    raise exception 'Publication impossible : % offre(s) encore à chiffrer ou à déclarer indisponible.', v_en_attente;
  end if;
  if v_dispo = 0 then
    raise exception 'Publication impossible : aucune offre n''est disponible.';
  end if;

  select count(*) into v_compteurs from public.versions_recommandation_compteurs
  where version_recommandation_id = p_version and actif;
  select count(distinct c.version_recommandation_compteur_id) into v_actuel_chiffre
  from public.offres_fournisseurs o
  join public.optimisations op on op.id = o.optimisation_id
  join public.offres_fournisseurs_compteurs c on c.offre_fournisseur_id = o.id
  where op.version_recommandation_id = p_version and o.actif and o.nature_offre = 'EN_COURS'
    and c.cout_total_annuel_estime_ht is not null;
  if v_actuel_chiffre < v_compteurs or v_compteurs = 0 then
    raise exception 'Publication impossible : l''offre actuelle n''est pas chiffrée sur chaque compteur.';
  end if;

  select id into v_disponible from public.statuts_versions_recommandation where code = 'DISPONIBLE';
  update public.versions_recommandation
     set date_publication_comparatif = now(),
         publie_par_id = auth.uid(),
         statut_version_id = coalesce(v_disponible, statut_version_id),
         date_modification = now()
   where id = p_version;
end;
$$;

revoke all on function public.fn_offre_actuelle(uuid, uuid, integer) from public, anon;
revoke all on function public.fn_publier_comparatif(uuid) from public, anon;
grant execute on function public.fn_offre_actuelle(uuid, uuid, integer) to authenticated;
grant execute on function public.fn_publier_comparatif(uuid) to authenticated;
