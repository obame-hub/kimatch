-- ══ UN APPEL D'OFFRES PEUT SE PASSER DE RÉFÉRENCE — 02/10/2026 ══
-- William : « on n'a pas toujours d'offre de référence. Si ce n'est pas le cas, je dois avoir la
-- possibilité de supprimer la ligne de référence et alors ce sera un appel d'offre sans comparatif.
-- Stocke cette info quelque part car j'en aurai besoin pour savoir quel modèle d'offre sera à générer. »
alter table public.versions_recommandation
  add column if not exists modele_offre text not null default 'AVEC_COMPARATIF'
  check (modele_offre in ('AVEC_COMPARATIF', 'SANS_COMPARATIF'));
comment on column public.versions_recommandation.modele_offre is
  'Le modèle d''offre à générer : AVEC_COMPARATIF (une offre de référence, l''offre actuelle, sert d''étalon) ou SANS_COMPARATIF (aucune référence : appel d''offres sans comparatif). Posé depuis le Pricer.';

-- Retirer la référence la DÉSACTIVE (rien n'est perdu) ; la rétablir réactive la plus récente.
create or replace function public.fn_definir_modele_offre(p_version uuid, p_sans_comparatif boolean)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  update public.versions_recommandation
     set modele_offre = case when p_sans_comparatif then 'SANS_COMPARATIF' else 'AVEC_COMPARATIF' end,
         date_modification = now()
   where id = p_version;
  if not found then raise exception 'Version introuvable.'; end if;

  if p_sans_comparatif then
    update public.offres_fournisseurs o set actif = false, date_modification = now()
    from public.optimisations op
    where op.id = o.optimisation_id and op.version_recommandation_id = p_version and o.nature_offre = 'EN_COURS' and o.actif;
  else
    update public.offres_fournisseurs set actif = true, date_modification = now()
    where id = (
      select o.id from public.offres_fournisseurs o join public.optimisations op on op.id = o.optimisation_id
      where op.version_recommandation_id = p_version and o.nature_offre = 'EN_COURS'
      order by o.date_modification desc nulls last limit 1)
      and not exists (
        select 1 from public.offres_fournisseurs o join public.optimisations op on op.id = o.optimisation_id
        where op.version_recommandation_id = p_version and o.nature_offre = 'EN_COURS' and o.actif);
  end if;
end $$;
revoke all on function public.fn_definir_modele_offre(uuid, boolean) from public, anon;
grant execute on function public.fn_definir_modele_offre(uuid, boolean) to authenticated;

-- La publication n'exige plus la référence d'un appel d'offres sans comparatif.
create or replace function public.fn_publier_comparatif(p_version uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_en_attente integer;
  v_dispo integer;
  v_compteurs integer;
  v_actuel_chiffre integer;
  v_disponible uuid;
  v_sans boolean;
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

  select modele_offre = 'SANS_COMPARATIF' into v_sans from public.versions_recommandation where id = p_version;
  if not coalesce(v_sans, false) then
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
  end if;

  select id into v_disponible from public.statuts_versions_recommandation where code = 'DISPONIBLE';
  update public.versions_recommandation
     set date_publication_comparatif = now(),
         publie_par_id = auth.uid(),
         statut_version_id = coalesce(v_disponible, statut_version_id),
         date_modification = now()
   where id = p_version;
end $$;
