-- ══ LE TURPE SE CALCULE EN BASE, À TOUT MOMENT — William, 02/10/2026 ══
-- « Le plus important c'est que tous les pricers élec que l'on doit calculer puissent utiliser un
-- TURPE (versionné car il change tous les ans). Le TURPE est le même pour chaque ligne du comparatif,
-- raison pour laquelle on ne le montre pas, mais il doit être noté en base. »
--
-- Fusion du cahier des charges venu de Lovable (prompts-turpe.md) avec le modèle déjà en place :
--   · les grilles restent `versions_turpe`, datées ; on interdit qu'elles se chevauchent ;
--   · le périmètre est celui du cahier : BT > 36 kVA et HTA, courte et longue utilisation, pointe
--     fixe. Les formules BT ≤ 36 kVA et pointe mobile restent en base, désactivées (« au pire, je
--     l'ajouterai plus tard ») ;
--   · le soutirage (b, c) reste par formule et par poste dans `coefficients_turpe` ; c s'exprime en
--     c€/kWh, comme la CRE le publie ;
--   · gestion et comptage (CG, CC) dépendent du domaine et du cadre (contrat unique / CARD), pas de
--     la formule : ils ont leur table, `composantes_fixes_turpe` ;
--   · `fn_calculer_turpe` applique la formule, `fn_turpe_version_compteur` l'écrit sur le compteur
--     de la version AVEC la grille utilisée — un dossier se recalcule toujours avec sa grille.
--
--   TURPE annuel HT = CG + CC + b₁·P₁ + Σ bᵢ·(Pᵢ − Pᵢ₋₁) + Σ (cᵢ / 100) · Eᵢ(kWh)
--   Puissances : arrondies à l'entier supérieur, et jamais en dessous du poste précédent.

-- 1. LE PÉRIMÈTRE DU CALCUL ─────────────────────────────────────────────────────────────────────
update public.formules_tarifaires_turpe set actif = false, date_modification = now()
where domaine_tension = 'BT_INF_36' or code like '%PM%';

-- CG et CC quittent les coefficients par formule : ils vont dans leur table (aucune valeur saisie).
delete from public.composantes_tarifaires c
where c.code in ('TURPE_CG', 'TURPE_CC')
  and not exists (select 1 from public.coefficients_turpe x where x.composante_tarifaire_id = c.id);
update public.composantes_tarifaires set unite = 'c€/kWh', ordre = 2, date_modification = now() where code = 'TURPE_CS_ENERGIE';
update public.composantes_tarifaires set unite = '€/kVA/an', ordre = 1, date_modification = now(),
  description = 'CS, part fixe : coefficient b par poste, en €/kVA/an en BT (€/kW/an en HTA), sur les tranches de puissance souscrite.'
where code = 'TURPE_CS_PUISSANCE';

-- 2. UNE SEULE GRILLE EN VIGUEUR À LA FOIS ──────────────────────────────────────────────────────
alter table public.versions_turpe
  add constraint versions_turpe_sans_chevauchement
  exclude using gist (daterange(date_debut, date_fin, '[]') with &&) where (actif);

create or replace function public.fn_version_turpe_active(p_date date default current_date)
returns uuid language sql stable set search_path = public as $$
  select id from public.versions_turpe
  where actif and date_debut <= p_date and (date_fin is null or date_fin >= p_date)
  order by date_debut desc limit 1
$$;

-- 3. GESTION ET COMPTAGE, PAR DOMAINE ET PAR CADRE ──────────────────────────────────────────────
create table if not exists public.composantes_fixes_turpe (
  id uuid primary key default gen_random_uuid(),
  version_turpe_id uuid not null references public.versions_turpe(id) on update cascade on delete cascade,
  domaine_tension text not null check (domaine_tension in ('BT_SUP_36', 'HTA')),
  cadre text not null check (cadre in ('CONTRAT_UNIQUE', 'CARD')),
  cg_annuel numeric,
  cc_annuel numeric,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now(),
  unique (version_turpe_id, domaine_tension, cadre)
);
comment on table public.composantes_fixes_turpe is
  'TURPE : composantes annuelles de gestion (CG) et de comptage (CC), par grille, domaine de tension et cadre (contrat unique / CARD).';
grant select, insert, update, delete on public.composantes_fixes_turpe to authenticated;
grant all on public.composantes_fixes_turpe to service_role;
alter table public.composantes_fixes_turpe enable row level security;
create policy composantes_fixes_turpe_lecture on public.composantes_fixes_turpe for select to authenticated using (true);
create policy composantes_fixes_turpe_ecriture on public.composantes_fixes_turpe for insert to authenticated
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN', 'PRICING']));
create policy composantes_fixes_turpe_modification on public.composantes_fixes_turpe for update to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN', 'PRICING']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN', 'PRICING']));
create policy composantes_fixes_turpe_suppression on public.composantes_fixes_turpe for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));
create policy composantes_fixes_turpe_pas_aux_partenaires on public.composantes_fixes_turpe as restrictive for all to authenticated
  using (not est_partenaire()) with check (not est_partenaire());

-- Les lignes vides des grilles existantes : quatre cases à remplir par grille.
insert into public.composantes_fixes_turpe (version_turpe_id, domaine_tension, cadre)
select v.id, d.domaine, c.cadre
from public.versions_turpe v
cross join (values ('BT_SUP_36'), ('HTA')) d(domaine)
cross join (values ('CONTRAT_UNIQUE'), ('CARD')) c(cadre)
on conflict do nothing;

-- 4. LE TURPE DE CHAQUE COMPTEUR DE VERSION, ET SA GRILLE ──────────────────────────────────────
alter table public.versions_recommandation_compteurs
  add column if not exists turpe_annuel_ht numeric,
  add column if not exists version_turpe_id uuid references public.versions_turpe(id) on update cascade on delete restrict,
  add column if not exists turpe_detail jsonb,
  add column if not exists date_calcul_turpe timestamptz;
comment on column public.versions_recommandation_compteurs.turpe_annuel_ht is
  'TURPE annuel HT du compteur pour cette version (le même pour toutes les offres), calculé par fn_turpe_version_compteur.';
comment on column public.versions_recommandation_compteurs.version_turpe_id is
  'La grille TURPE utilisée : un dossier se recalcule toujours avec elle, même après une nouvelle grille.';

-- 5. LE CALCUL ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_calculer_turpe(p_compteur_id uuid, p_version_turpe_id uuid, p_cadre text default 'CONTRAT_UNIQUE')
returns jsonb language plpgsql stable set search_path = public as $$
declare
  e public.compteurs_electricite%rowtype;
  j jsonb;
  f record;
  v_postes text[];
  v_cols text[];
  v_noms text[];
  v_manques text[] := '{}';
  v_p numeric; v_prec numeric := 0; v_b numeric; v_c numeric; v_e numeric;
  v_cs_fixe numeric := 0; v_cs_var numeric := 0; v_energie_totale numeric := 0;
  v_cg numeric; v_cc numeric;
  v_puissances jsonb := '{}';
  i int;
begin
  if p_version_turpe_id is null then
    return jsonb_build_object('total', null, 'manques', jsonb_build_array('Aucune grille TURPE en vigueur à cette date'));
  end if;
  select * into e from public.compteurs_electricite where compteur_id = p_compteur_id;
  if not found then
    return jsonb_build_object('version_turpe_id', p_version_turpe_id, 'total', null, 'manques', jsonb_build_array('Compteur électrique introuvable'));
  end if;
  select * into f from public.formules_tarifaires_turpe
  where version_turpe_id = p_version_turpe_id and code = e.tarif_distribution and actif;
  if not found then
    return jsonb_build_object('version_turpe_id', p_version_turpe_id, 'formule', e.tarif_distribution, 'total', null,
      'manques', jsonb_build_array(case when e.tarif_distribution is null
        then 'Formule tarifaire (FTA) du compteur inconnue'
        else 'Formule ' || e.tarif_distribution || ' hors du calcul (BT > 36 kVA et HTA seulement)' end));
  end if;

  if f.domaine_tension = 'HTA' then
    v_postes := array['PTE', 'HPH', 'HCH', 'HPE', 'HCE'];
    v_cols := array['pointe', 'hph', 'hch', 'hpe', 'hce'];
    v_noms := array['Pointe', 'HPH', 'HCH', 'HPE', 'HCE'];
  else
    v_postes := array['HPH', 'HCH', 'HPE', 'HCE'];
    v_cols := array['hph', 'hch', 'hpe', 'hce'];
    v_noms := array['HPH', 'HCH', 'HPE', 'HCE'];
  end if;

  j := to_jsonb(e);
  for i in 1 .. array_length(v_postes, 1) loop
    v_p := nullif(j ->> ('puissance_' || v_cols[i] || '_kva'), '')::numeric;
    v_e := coalesce(nullif(j ->> ('conso_' || v_cols[i] || '_mwh'), '')::numeric, 0);
    if v_p is null or v_p <= 0 then
      v_manques := v_manques || ('Puissance souscrite ' || v_noms[i]);
      v_p := v_prec;
    end if;
    -- Arrondi à l'entier supérieur, et jamais en dessous du poste précédent (max cumulatif).
    v_p := greatest(ceil(v_p), v_prec);

    select c.valeur into v_b from public.coefficients_turpe c
      join public.composantes_tarifaires k on k.id = c.composante_tarifaire_id
      join public.postes_tarifaires pt on pt.id = c.poste_tarifaire_id
    where c.formule_tarifaire_id = f.id and k.code = 'TURPE_CS_PUISSANCE' and pt.code = v_postes[i] and c.actif;
    select c.valeur into v_c from public.coefficients_turpe c
      join public.composantes_tarifaires k on k.id = c.composante_tarifaire_id
      join public.postes_tarifaires pt on pt.id = c.poste_tarifaire_id
    where c.formule_tarifaire_id = f.id and k.code = 'TURPE_CS_ENERGIE' and pt.code = v_postes[i] and c.actif;
    if v_b is null then v_manques := v_manques || ('Coefficient b ' || v_noms[i] || ' de ' || f.code); end if;
    if v_c is null then v_manques := v_manques || ('Coefficient c ' || v_noms[i] || ' de ' || f.code); end if;

    v_cs_fixe := v_cs_fixe + coalesce(v_b, 0) * (v_p - v_prec);
    -- c en c€/kWh, énergie en MWh : (c / 100) × (MWh × 1 000) = c × 10 × MWh.
    v_cs_var := v_cs_var + coalesce(v_c, 0) * 10 * v_e;
    v_energie_totale := v_energie_totale + v_e;
    v_puissances := v_puissances || jsonb_build_object(v_postes[i], v_p);
    v_prec := v_p;
  end loop;
  if v_energie_totale <= 0 then v_manques := v_manques || 'Consommation par poste'::text; end if;

  select cg_annuel, cc_annuel into v_cg, v_cc from public.composantes_fixes_turpe
  where version_turpe_id = p_version_turpe_id and domaine_tension = f.domaine_tension and cadre = p_cadre;
  if v_cg is null then v_manques := v_manques || ('Composante de gestion ' || f.domaine_tension); end if;
  if v_cc is null then v_manques := v_manques || ('Composante de comptage ' || f.domaine_tension); end if;

  return jsonb_build_object(
    'version_turpe_id', p_version_turpe_id, 'formule', f.code, 'domaine', f.domaine_tension, 'cadre', p_cadre,
    'cg', v_cg, 'cc', v_cc, 'cs_fixe', round(v_cs_fixe, 2), 'cs_variable', round(v_cs_var, 2),
    'puissances', v_puissances,
    'total', case when cardinality(v_manques) = 0 then round(coalesce(v_cg, 0) + coalesce(v_cc, 0) + v_cs_fixe + v_cs_var, 2) end,
    'manques', to_jsonb(v_manques));
end $$;

-- 6. L'ÉCRITURE SUR LE COMPTEUR DE LA VERSION, ET SUR SES OFFRES ─────────────────────────────────
-- La grille : celle déjà retenue pour ce compteur, sinon celle en vigueur à la création de la
-- version, sinon celle du jour. Le TURPE calculé se reporte sur les lignes d'offres déjà chiffrées :
-- c'est le même pour toutes, et un budget en base ne doit pas garder l'ancien.
create or replace function public.fn_turpe_version_compteur(p_vc uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_version uuid;
  v_res jsonb;
  v_total numeric;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  select vrc.id, vrc.compteur_id, vrc.version_turpe_id, v.date_creation
    into r
  from public.versions_recommandation_compteurs vrc
  join public.versions_recommandation v on v.id = vrc.version_recommandation_id
  where vrc.id = p_vc;
  if not found then raise exception 'Compteur de version introuvable.'; end if;

  v_version := coalesce(r.version_turpe_id, public.fn_version_turpe_active(r.date_creation::date), public.fn_version_turpe_active(current_date));
  v_res := public.fn_calculer_turpe(r.compteur_id, v_version);
  v_total := nullif(v_res ->> 'total', '')::numeric;

  update public.versions_recommandation_compteurs
  set turpe_annuel_ht = v_total, version_turpe_id = v_version, turpe_detail = v_res, date_calcul_turpe = now()
  where id = p_vc;

  if v_total is not null then
    update public.offres_compteurs_electricite oce
    set prix_turpe_annuel_ht = v_total, date_modification = now()
    from public.offres_fournisseurs_compteurs ofc
    where oce.offre_compteur_id = ofc.id and ofc.version_recommandation_compteur_id = p_vc
      and oce.prix_turpe_annuel_ht is distinct from v_total;

    with maj as (
      update public.offres_fournisseurs_compteurs ofc
      set cout_acheminement_annuel_ht = v_total,
          cout_total_annuel_estime_ht = round(ofc.cout_fourniture_annuel_ht + v_total + coalesce(ofc.cout_taxes_annuel, 0), 2),
          date_modification = now()
      where ofc.version_recommandation_compteur_id = p_vc
        and ofc.cout_fourniture_annuel_ht is not null
        and ofc.cout_acheminement_annuel_ht is distinct from v_total
      returning ofc.offre_fournisseur_id
    )
    update public.offres_fournisseurs o
    set montant_annuel_ht = (select sum(x.cout_total_annuel_estime_ht) from public.offres_fournisseurs_compteurs x where x.offre_fournisseur_id = o.id),
        date_modification = now()
    where o.id in (select offre_fournisseur_id from maj);
  end if;

  return v_res;
end $$;

-- 7. UNE NOUVELLE GRILLE CHAQUE ANNÉE ───────────────────────────────────────────────────────────
-- Copie la grille source (formules actives, coefficients, composantes fixes) à partir d'une date,
-- et clôt la grille en cours la veille. Droits de l'appelant : seuls l'administration et le pricing
-- peuvent écrire.
create or replace function public.fn_nouvelle_grille_turpe(p_source uuid, p_libelle text, p_debut date)
returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.versions_turpe where actif and date_debut >= p_debut) then
    raise exception 'Une grille commence déjà le % ou après : la nouvelle doit commencer après elle.', to_char(p_debut, 'DD/MM/YYYY');
  end if;
  update public.versions_turpe set date_fin = p_debut - 1, date_modification = now()
  where actif and date_debut < p_debut and (date_fin is null or date_fin >= p_debut);

  insert into public.versions_turpe (code, libelle, domaine_application, date_debut, numero_version, actif)
  values ('TURPE_' || to_char(p_debut, 'YYYYMMDD'), p_libelle, 'HTA_BT', p_debut,
          coalesce((select max(numero_version) from public.versions_turpe), 0) + 1, true)
  returning id into v_id;

  insert into public.formules_tarifaires_turpe (version_turpe_id, code, libelle, description, domaine_tension, segment_compteur, type_utilisation, nombre_postes_tarifaires, puissance_min_kva, puissance_max_kva, est_selectionnable, actif, ordre)
  select v_id, code, libelle, description, domaine_tension, segment_compteur, type_utilisation, nombre_postes_tarifaires, puissance_min_kva, puissance_max_kva, est_selectionnable, actif, ordre
  from public.formules_tarifaires_turpe where version_turpe_id = p_source;

  insert into public.coefficients_turpe (formule_tarifaire_id, composante_tarifaire_id, poste_tarifaire_id, code, libelle, unite, valeur, date_debut, actif)
  select nf.id, c.composante_tarifaire_id, c.poste_tarifaire_id, c.code, c.libelle, c.unite, c.valeur, p_debut, c.actif
  from public.coefficients_turpe c
  join public.formules_tarifaires_turpe af on af.id = c.formule_tarifaire_id and af.version_turpe_id = p_source
  join public.formules_tarifaires_turpe nf on nf.version_turpe_id = v_id and nf.code = af.code;

  insert into public.composantes_fixes_turpe (version_turpe_id, domaine_tension, cadre, cg_annuel, cc_annuel)
  select v_id, domaine_tension, cadre, cg_annuel, cc_annuel from public.composantes_fixes_turpe where version_turpe_id = p_source;

  return v_id;
end $$;

-- 8. QUI PEUT APPELER QUOI ──────────────────────────────────────────────────────────────────────
revoke all on function public.fn_version_turpe_active(date) from public, anon;
revoke all on function public.fn_calculer_turpe(uuid, uuid, text) from public, anon;
revoke all on function public.fn_turpe_version_compteur(uuid) from public, anon;
revoke all on function public.fn_nouvelle_grille_turpe(uuid, text, date) from public, anon;
grant execute on function public.fn_version_turpe_active(date) to authenticated;
grant execute on function public.fn_calculer_turpe(uuid, uuid, text) to authenticated;
grant execute on function public.fn_turpe_version_compteur(uuid) to authenticated;
grant execute on function public.fn_nouvelle_grille_turpe(uuid, text, date) to authenticated;
