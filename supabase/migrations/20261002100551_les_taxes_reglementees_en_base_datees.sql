-- ══ LES TAXES ET CONTRIBUTIONS RÉGLEMENTÉES, EN BASE, DATÉES — William, 02/10/2026 ══
-- « Dans Pricing, je dispose de plusieurs onglets (TURPE étant un de ces onglets). Les autres onglets
-- seront AE, AG, CPB, CTA, TQD. » Chacune est datée (versionnée) ; la base choisit la bonne valeur
-- pour chaque compteur de version, la note, et la reporte sur les offres — comme le TURPE.
--
--   AE   accise sur l'électricité      €/MWh, une valeur par période          électricité
--   AG   accise sur le gaz             €/MWh, une valeur par période          gaz
--   TQD  terme de quantité de distrib. €/MWh, par tarif T1 à T4               gaz
--   CTA  contribution tarifaire d'ach. €/an, par tarif et profil (T4 : seul)  gaz — TVA 5,5 %
--   CPB  certificats de production de biogaz  €/MWh par ANNÉE CIVILE          gaz
--        moyenne des années couvertes par la fourniture ; une année « en projet » (décret non
--        paru) vaut la dernière année en vigueur.
--
-- LA DATE QUI CHOISIT LA VALEUR — William, 02/10/2026 : « les dates de début de fourniture sont
-- calculées en fonction des échéances de chaque compteur ». Le début de fourniture est donc le
-- lendemain de l'échéance du compteur (dernier contrat connu, sinon échéance déclarée) ; à défaut
-- (échéance passée, indéterminée ou inconnue) le début de fourniture saisi sur la version ; à défaut
-- le 1er du mois prochain. Au-delà des périodes connues, la dernière connue s'applique — et le calcul
-- le dit (`derniere_valeur_connue`).

-- 1. LES PÉRIODES ET LEURS VALEURS ──────────────────────────────────────────────────────────────
create table public.taxes_reglementees_versions (
  id uuid primary key default gen_random_uuid(),
  taxe text not null check (taxe in ('AE', 'AG', 'TQD', 'CTA')),
  libelle text not null,
  date_debut date not null,
  date_fin date,
  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now(),
  check (date_fin is null or date_fin >= date_debut)
);
comment on table public.taxes_reglementees_versions is 'Périodes de validité des taxes réglementées (AE, AG, TQD, CTA) : une seule en vigueur à la fois par taxe.';
-- Deux périodes d'une même taxe ne se chevauchent pas (une contrainte par taxe : pas d'extension).
alter table public.taxes_reglementees_versions add constraint taxes_ae_sans_chevauchement exclude using gist (daterange(date_debut, date_fin, '[]') with &&) where (actif and taxe = 'AE');
alter table public.taxes_reglementees_versions add constraint taxes_ag_sans_chevauchement exclude using gist (daterange(date_debut, date_fin, '[]') with &&) where (actif and taxe = 'AG');
alter table public.taxes_reglementees_versions add constraint taxes_tqd_sans_chevauchement exclude using gist (daterange(date_debut, date_fin, '[]') with &&) where (actif and taxe = 'TQD');
alter table public.taxes_reglementees_versions add constraint taxes_cta_sans_chevauchement exclude using gist (daterange(date_debut, date_fin, '[]') with &&) where (actif and taxe = 'CTA');

create table public.taxes_reglementees_valeurs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.taxes_reglementees_versions(id) on update cascade on delete cascade,
  tarif text check (tarif in ('T1', 'T2', 'T3', 'T4')),
  profil text,
  valeur numeric,
  date_modification timestamptz not null default now()
);
create unique index uq_taxes_reglementees_valeurs on public.taxes_reglementees_valeurs (version_id, tarif, profil) nulls not distinct;
comment on table public.taxes_reglementees_valeurs is 'Valeurs d''une période : une seule (AE, AG), par tarif (TQD), par tarif et profil (CTA, T4 sans profil).';

create table public.cpb_coefficients (
  annee integer primary key check (annee between 2020 and 2100),
  valeur_mwh numeric not null,
  statut text not null default 'EN_VIGUEUR' check (statut in ('EN_VIGUEUR', 'PROJET')),
  commentaire text,
  date_modification timestamptz not null default now()
);
comment on table public.cpb_coefficients is 'CPB par année civile (€/MWh). Une année PROJET (décret non paru) vaut la dernière année EN_VIGUEUR.';

do $$
declare t text;
begin
  foreach t in array array['taxes_reglementees_versions', 'taxes_reglementees_valeurs', 'cpb_coefficients'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_lecture', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (has_role_acces(auth.uid(), array[''SUPER_ADMIN'', ''ADMIN'', ''PRICING'']))', t || '_ecriture', t);
    execute format('create policy %I on public.%I for update to authenticated using (has_role_acces(auth.uid(), array[''SUPER_ADMIN'', ''ADMIN'', ''PRICING''])) with check (has_role_acces(auth.uid(), array[''SUPER_ADMIN'', ''ADMIN'', ''PRICING'']))', t || '_modification', t);
    execute format('create policy %I on public.%I for delete to authenticated using (has_role_acces(auth.uid(), array[''SUPER_ADMIN'', ''ADMIN'']))', t || '_suppression', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (not est_partenaire()) with check (not est_partenaire())', t || '_pas_aux_partenaires', t);
  end loop;
end $$;

-- 2. LES VALEURS DONNÉES PAR WILLIAM LE 02/10/2026 ──────────────────────────────────────────────
with v as (
  insert into public.taxes_reglementees_versions (taxe, libelle, date_debut, date_fin) values
    ('AE', 'Accise électricité — février 2026', '2026-02-01', '2026-07-31'),
    ('AE', 'Accise électricité — août 2026', '2026-08-01', null),
    ('AG', 'Accise gaz — février 2026', '2026-02-01', '2026-07-31'),
    ('AG', 'Accise gaz — août 2026', '2026-08-01', null),
    ('TQD', 'TQD — janvier 2025', '2025-01-01', '2025-06-30'),
    ('TQD', 'TQD — juillet 2025', '2025-07-01', '2026-06-30'),
    ('TQD', 'TQD — juillet 2026', '2026-07-01', '2027-06-30'),
    ('CTA', 'CTA gaz — juillet 2026', '2026-07-01', '2027-06-30')
  returning id, taxe, date_debut
)
insert into public.taxes_reglementees_valeurs (version_id, tarif, profil, valeur)
select v.id, x.tarif, x.profil, x.valeur
from v join (values
  ('AE', '2026-02-01'::date, null, null, 26.58), ('AE', '2026-08-01', null, null, 26.35),
  ('AG', '2026-02-01', null, null, 16.39), ('AG', '2026-08-01', null, null, 16.66),
  ('TQD', '2025-01-01', 'T1', null, 42.37), ('TQD', '2025-01-01', 'T2', null, 11.39), ('TQD', '2025-01-01', 'T3', null, 8.19), ('TQD', '2025-01-01', 'T4', null, 1.11),
  ('TQD', '2025-07-01', 'T1', null, 44.94), ('TQD', '2025-07-01', 'T2', null, 12.08), ('TQD', '2025-07-01', 'T3', null, 8.69), ('TQD', '2025-07-01', 'T4', null, 1.18),
  ('TQD', '2026-07-01', 'T1', null, 47.57), ('TQD', '2026-07-01', 'T2', null, 12.79), ('TQD', '2026-07-01', 'T3', null, 7.57), ('TQD', '2026-07-01', 'T4', null, 1.25),
  ('CTA', '2026-07-01', 'T1', 'P011', 14.21), ('CTA', '2026-07-01', 'T1', 'P012', 14.21),
  ('CTA', '2026-07-01', 'T2', 'P012', 48.62), ('CTA', '2026-07-01', 'T2', 'P013', 46.28), ('CTA', '2026-07-01', 'T2', 'P014', 46.92), ('CTA', '2026-07-01', 'T2', 'P015', 47.55),
  ('CTA', '2026-07-01', 'T2', 'P016', 48.62), ('CTA', '2026-07-01', 'T2', 'P017', 49.11), ('CTA', '2026-07-01', 'T2', 'P018', 49.83), ('CTA', '2026-07-01', 'T2', 'P019', 50.22),
  ('CTA', '2026-07-01', 'T3', 'P013', 455.10), ('CTA', '2026-07-01', 'T3', 'P014', 456.80), ('CTA', '2026-07-01', 'T3', 'P015', 458.20), ('CTA', '2026-07-01', 'T3', 'P016', 459.45),
  ('CTA', '2026-07-01', 'T3', 'P017', 459.90), ('CTA', '2026-07-01', 'T3', 'P018', 460.41), ('CTA', '2026-07-01', 'T3', 'P019', 460.95),
  ('CTA', '2026-07-01', 'T4', null, 5679.05)
) as x(taxe, debut, tarif, profil, valeur) on x.taxe = v.taxe and x.debut = v.date_debut;

insert into public.cpb_coefficients (annee, valeur_mwh, statut, commentaire) values
  (2026, 0.41, 'EN_VIGUEUR', null),
  (2027, 1.82, 'EN_VIGUEUR', null),
  (2028, 4.15, 'EN_VIGUEUR', null),
  (2029, 6.33, 'PROJET', 'Projet de décret : 4,15 €/MWh appliqués en attendant.'),
  (2030, 9.00, 'PROJET', 'Projet de décret : 4,15 €/MWh appliqués en attendant.');

-- 3. LES FONCTIONS DE LECTURE ───────────────────────────────────────────────────────────────────
create or replace function public.fn_taxe_en_vigueur(p_taxe text, p_date date)
returns uuid language sql stable set search_path = public as $$
  select id from public.taxes_reglementees_versions
  where actif and taxe = p_taxe and date_debut <= p_date and (date_fin is null or date_fin >= p_date)
  order by date_debut desc limit 1
$$;

-- L'ÉCHÉANCE D'UN COMPTEUR, comme la fiche compteur la lit (`lib/echeance.ts`) : la fin du dernier
-- contrat connu — contrat client encore en cours ou contrat prospect ; un contrat sans fin, que rien
-- ne remplace ensuite, la rend indéterminée (null) ; sans aucun contrat, l'échéance déclarée.
create or replace function public.fn_echeance_compteur(p_compteur uuid)
returns date language sql stable set search_path = public as $$
  with tous as (
    select c.date_debut, c.date_fin
    from public.contrats_compteurs cc join public.contrats c on c.id = cc.contrat_id
    where cc.compteur_id = p_compteur and cc.actif and c.actif and (c.date_fin is null or c.date_fin >= current_date)
    union all
    select p.date_debut, p.date_fin from public.contrats_prospects p where p.compteur_id = p_compteur
  )
  select case
    when not exists (select 1 from tous) then (select date_echeance from public.compteurs where id = p_compteur)
    when exists (
      select 1 from tous o where o.date_fin is null
        and not exists (select 1 from tous t where t.date_fin is not null and t.date_debut is not null and o.date_debut is not null and t.date_debut >= o.date_debut)
    ) then null
    else (select max(date_fin) from tous)
  end
$$;

-- LA VALEUR APPLICABLE À UNE DATE : celle en vigueur ; à défaut (date au-delà des périodes connues),
-- la dernière période commencée avant elle ; à défaut, la première. Le calcul dit laquelle il a prise.
create or replace function public.fn_taxe_applicable(p_taxe text, p_date date)
returns uuid language sql stable set search_path = public as $$
  select coalesce(
    public.fn_taxe_en_vigueur(p_taxe, p_date),
    (select id from public.taxes_reglementees_versions where actif and taxe = p_taxe and date_debut <= p_date order by date_debut desc limit 1),
    (select id from public.taxes_reglementees_versions where actif and taxe = p_taxe order by date_debut limit 1))
$$;

-- Même règle pour la grille TURPE.
create or replace function public.fn_version_turpe_applicable(p_date date)
returns uuid language sql stable set search_path = public as $$
  select coalesce(
    public.fn_version_turpe_active(p_date),
    (select id from public.versions_turpe where actif and date_debut <= p_date order by date_debut desc limit 1),
    (select id from public.versions_turpe where actif order by date_debut limit 1))
$$;

-- CPB : la moyenne des années civiles couvertes, de l'année du début à celle de la veille de la fin.
-- Une année en projet, ou absente, vaut la dernière année en vigueur qui la précède.
create or replace function public.fn_cpb_moyen(p_debut date, p_duree_mois integer)
returns numeric language sql stable set search_path = public as $$
  select avg((
    select c.valeur_mwh from public.cpb_coefficients c
    where c.statut = 'EN_VIGUEUR' and c.annee <= a.annee
    order by c.annee desc limit 1
  ))
  from generate_series(
    extract(year from p_debut)::int,
    extract(year from (p_debut + make_interval(months => p_duree_mois) - interval '1 day'))::int
  ) as a(annee)
  where p_debut is not null and p_duree_mois > 0
$$;

-- 4. CE QUE LA BASE NOTE SUR CHAQUE COMPTEUR DE VERSION ──────────────────────────────────────────
alter table public.versions_recommandation_compteurs
  add column if not exists accise_mwh numeric,
  add column if not exists tqd_mwh numeric,
  add column if not exists cta_annuel_ht numeric,
  add column if not exists reglementaire_detail jsonb,
  add column if not exists date_calcul_reglementaire timestamptz;
comment on column public.versions_recommandation_compteurs.accise_mwh is 'Accise (AE ou AG) en vigueur pour ce dossier, €/MWh — calculée par fn_reglementaire_version_compteur.';
comment on column public.versions_recommandation_compteurs.tqd_mwh is 'Gaz : TQD du tarif du compteur, €/MWh — calculé.';
comment on column public.versions_recommandation_compteurs.cta_annuel_ht is 'Gaz : CTA du tarif et du profil du compteur, €/an — calculée.';
comment on column public.versions_recommandation_compteurs.reglementaire_detail is 'Ce qui a été retenu (périodes, date de référence, CPB par durée, manques) au dernier calcul.';

-- 5. LA TVA RÉDUITE DE LA CTA ───────────────────────────────────────────────────────────────────
-- « Dispose d'une TVA réduite à 5,5 % contre 20 % pour tout le reste. » La part à 5,5 % est notée
-- sur la ligne ; le TTC s'en déduit.
alter table public.offres_fournisseurs_compteurs add column if not exists cout_tva_reduite_annuel_ht numeric;
comment on column public.offres_fournisseurs_compteurs.cout_tva_reduite_annuel_ht is 'Part du budget HT soumise à la TVA de 5,5 % (la CTA), le reste étant à 20 %.';
alter table public.offres_fournisseurs_compteurs drop column if exists cout_total_annuel_estime_ttc;
alter table public.offres_fournisseurs_compteurs
  add column cout_total_annuel_estime_ttc numeric
  generated always as (round((cout_total_annuel_estime_ht - coalesce(cout_tva_reduite_annuel_ht, 0)) * 1.2 + coalesce(cout_tva_reduite_annuel_ht, 0) * 1.055, 2)) stored;
comment on column public.offres_fournisseurs_compteurs.cout_total_annuel_estime_ttc is
  'Budget annuel TTC : TVA 20 % sur tout, sauf la part à 5,5 % (CTA), au centime.';

-- 6. LE CALCUL DE TOUT CE QUI EST RÉGLEMENTÉ, POUR UN COMPTEUR DE VERSION ─────────────────────────
-- Remplace `fn_turpe_version_compteur` (02/10/2026, matin) : le TURPE suit désormais la même date de
-- référence que les taxes. Écrit le résultat sur le compteur de la version, puis sur les lignes
-- d'offres déjà chiffrées (leur part fournisseur reste celle saisie) :
--   électricité  acheminement = TURPE ; taxes = conso × AE
--   gaz          acheminement = CAR × TQD ; taxes = CAR × (AG + CPB de la durée de l'offre) + CTA
drop function if exists public.fn_turpe_version_compteur(uuid);

create or replace function public.fn_reglementaire_version_compteur(p_vc uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  g public.compteurs_gaz%rowtype;
  e public.compteurs_electricite%rowtype;
  v_debut date; v_source text;
  v_gaz boolean;
  v_manques text[] := '{}';
  v_turpe jsonb; v_turpe_total numeric; v_version_turpe uuid;
  v_acc numeric; v_tqd numeric; v_cta numeric;
  v_acc_v uuid; v_tqd_v uuid; v_cta_v uuid;
  v_cpb jsonb := '{}'; d integer; v_conso numeric;
  v_approx text[] := '{}';
  v_res jsonb;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  select vrc.id, vrc.compteur_id, v.id as version_id, v.date_debut_fourniture, public.fn_echeance_compteur(c.id) as date_echeance, upper(te.code) as energie
    into r
  from public.versions_recommandation_compteurs vrc
  join public.versions_recommandation v on v.id = vrc.version_recommandation_id
  join public.compteurs c on c.id = vrc.compteur_id
  left join public.types_energies te on te.id = c.type_energie_id
  where vrc.id = p_vc;
  if not found then raise exception 'Compteur de version introuvable.'; end if;

  if r.date_echeance is not null and r.date_echeance >= current_date then
    v_debut := r.date_echeance + 1; v_source := 'ECHEANCE';
  elsif r.date_debut_fourniture is not null then
    v_debut := r.date_debut_fourniture; v_source := 'DEBUT_FOURNITURE';
  else
    v_debut := (date_trunc('month', current_date) + interval '1 month')::date; v_source := 'MOIS_PROCHAIN';
  end if;
  v_gaz := r.energie = 'GAZ';

  if v_gaz then
    select * into g from public.compteurs_gaz where compteur_id = r.compteur_id;
    v_acc_v := public.fn_taxe_applicable('AG', v_debut);
    v_tqd_v := public.fn_taxe_applicable('TQD', v_debut);
    v_cta_v := public.fn_taxe_applicable('CTA', v_debut);
    if public.fn_taxe_en_vigueur('AG', v_debut) is distinct from v_acc_v then v_approx := v_approx || 'AG'::text; end if;
    if public.fn_taxe_en_vigueur('TQD', v_debut) is distinct from v_tqd_v then v_approx := v_approx || 'TQD'::text; end if;
    if public.fn_taxe_en_vigueur('CTA', v_debut) is distinct from v_cta_v then v_approx := v_approx || 'CTA'::text; end if;
    select valeur into v_acc from public.taxes_reglementees_valeurs where version_id = v_acc_v and tarif is null and profil is null;
    if v_acc is null then v_manques := v_manques || 'Accise gaz (AG) à cette date'::text; end if;
    if g.tarif_distribution is null then
      v_manques := v_manques || 'Tarif du compteur (T1 à T4) inconnu'::text;
    else
      select valeur into v_tqd from public.taxes_reglementees_valeurs where version_id = v_tqd_v and tarif = g.tarif_distribution and profil is null;
      select valeur into v_cta from public.taxes_reglementees_valeurs
      where version_id = v_cta_v and tarif = g.tarif_distribution and (profil = g.profil_consommation or profil is null)
      order by profil nulls last limit 1;
      if v_tqd is null then v_manques := v_manques || ('TQD ' || g.tarif_distribution || ' à cette date'); end if;
      if v_cta is null then v_manques := v_manques || ('CTA ' || g.tarif_distribution || coalesce(' ' || g.profil_consommation, ' (profil inconnu)') || ' à cette date'); end if;
    end if;
    for d in
      select distinct o.duree_mois from public.offres_fournisseurs o
      join public.optimisations op on op.id = o.optimisation_id
      where op.version_recommandation_id = r.version_id and o.actif and o.duree_mois > 0
    loop
      v_cpb := v_cpb || jsonb_build_object(d::text, public.fn_cpb_moyen(v_debut, d));
    end loop;
  else
    select * into e from public.compteurs_electricite where compteur_id = r.compteur_id;
    v_version_turpe := public.fn_version_turpe_applicable(v_debut);
    if public.fn_version_turpe_active(v_debut) is distinct from v_version_turpe then v_approx := v_approx || 'TURPE'::text; end if;
    v_turpe := public.fn_calculer_turpe(r.compteur_id, v_version_turpe);
    v_turpe_total := nullif(v_turpe ->> 'total', '')::numeric;
    if v_turpe_total is null then v_manques := v_manques || ('TURPE : ' || coalesce((select string_agg(x, ', ') from jsonb_array_elements_text(v_turpe -> 'manques') x), 'incomplet')); end if;
    v_acc_v := public.fn_taxe_applicable('AE', v_debut);
    if public.fn_taxe_en_vigueur('AE', v_debut) is distinct from v_acc_v then v_approx := v_approx || 'AE'::text; end if;
    select valeur into v_acc from public.taxes_reglementees_valeurs where version_id = v_acc_v and tarif is null and profil is null;
    if v_acc is null then v_manques := v_manques || 'Accise électricité (AE) à cette date'::text; end if;
    v_conso := coalesce(e.conso_base_mwh, 0) + coalesce(e.conso_hp_mwh, 0) + coalesce(e.conso_hc_mwh, 0) + coalesce(e.conso_pointe_mwh, 0)
             + coalesce(e.conso_hph_mwh, 0) + coalesce(e.conso_hch_mwh, 0) + coalesce(e.conso_hpe_mwh, 0) + coalesce(e.conso_hce_mwh, 0);
  end if;

  v_res := jsonb_build_object(
    'energie', case when v_gaz then 'gaz' else 'electricite' end,
    'date_reference', v_debut, 'source_date', v_source, 'echeance', r.date_echeance,
    'accise', v_acc, 'accise_version_id', v_acc_v,
    'tqd', v_tqd, 'tqd_version_id', v_tqd_v, 'tarif', g.tarif_distribution, 'profil', g.profil_consommation,
    'cta', v_cta, 'cta_version_id', v_cta_v,
    'cpb', v_cpb,
    'turpe', v_turpe, 'turpe_version_id', v_version_turpe,
    'derniere_valeur_connue', to_jsonb(v_approx),
    'manques', to_jsonb(v_manques));

  update public.versions_recommandation_compteurs set
    accise_mwh = v_acc, tqd_mwh = v_tqd, cta_annuel_ht = v_cta,
    turpe_annuel_ht = v_turpe_total, version_turpe_id = v_version_turpe, turpe_detail = v_turpe,
    reglementaire_detail = v_res, date_calcul_reglementaire = now(), date_calcul_turpe = case when v_gaz then date_calcul_turpe else now() end
  where id = p_vc;

  -- LE REPORT SUR LES LIGNES DÉJÀ CHIFFRÉES : seules celles dont la part fournisseur est connue.
  if v_gaz then
    update public.offres_compteurs_gaz ocg
    set prix_atrd_mwh = v_tqd, prix_agn_mwh = v_acc, cta_annuel_ht = v_cta,
        prix_cpb_mwh = nullif(v_cpb ->> o.duree_mois::text, '')::numeric, date_modification = now()
    from public.offres_fournisseurs_compteurs ofc
    join public.offres_fournisseurs o on o.id = ofc.offre_fournisseur_id
    where ocg.offre_compteur_id = ofc.id and ofc.version_recommandation_compteur_id = p_vc;

    with maj as (
      update public.offres_fournisseurs_compteurs ofc set
        cout_acheminement_annuel_ht = round(coalesce(ofc.consommation_annuelle_reference_mwh, g.car_mwh, 0) * coalesce(v_tqd, 0), 2),
        cout_taxes_annuel = round(coalesce(ofc.consommation_annuelle_reference_mwh, g.car_mwh, 0)
                                  * (coalesce(v_acc, 0) + coalesce(nullif(v_cpb ->> o.duree_mois::text, '')::numeric, 0)) + coalesce(v_cta, 0), 2),
        cout_tva_reduite_annuel_ht = v_cta,
        cout_total_annuel_estime_ht = round(ofc.cout_fourniture_annuel_ht
          + coalesce(ofc.consommation_annuelle_reference_mwh, g.car_mwh, 0) * (coalesce(v_tqd, 0) + coalesce(v_acc, 0) + coalesce(nullif(v_cpb ->> o.duree_mois::text, '')::numeric, 0))
          + coalesce(v_cta, 0), 2),
        date_modification = now()
      from public.offres_fournisseurs o
      where o.id = ofc.offre_fournisseur_id and ofc.version_recommandation_compteur_id = p_vc and ofc.cout_fourniture_annuel_ht is not null
      returning ofc.offre_fournisseur_id
    )
    update public.offres_fournisseurs o
    set montant_annuel_ht = (select sum(x.cout_total_annuel_estime_ht) from public.offres_fournisseurs_compteurs x where x.offre_fournisseur_id = o.id),
        date_modification = now()
    where o.id in (select offre_fournisseur_id from maj);
  else
    update public.offres_compteurs_electricite oce
    set prix_turpe_annuel_ht = v_turpe_total,
        turpe_gestion_annuel_ht = nullif(v_turpe ->> 'cg', '')::numeric,
        turpe_comptage_annuel_ht = nullif(v_turpe ->> 'cc', '')::numeric,
        turpe_soutirage_fixe_annuel_ht = nullif(v_turpe ->> 'cs_fixe', '')::numeric,
        turpe_soutirage_variable_annuel_ht = nullif(v_turpe ->> 'cs_variable', '')::numeric,
        accise_annuel_ht = case when v_acc is null then null else round(v_conso * v_acc, 2) end,
        date_modification = now()
    from public.offres_fournisseurs_compteurs ofc
    where oce.offre_compteur_id = ofc.id and ofc.version_recommandation_compteur_id = p_vc;

    with maj as (
      update public.offres_fournisseurs_compteurs ofc set
        cout_acheminement_annuel_ht = v_turpe_total,
        cout_taxes_annuel = round(v_conso * coalesce(v_acc, 0), 2),
        cout_tva_reduite_annuel_ht = null,
        cout_total_annuel_estime_ht = round(ofc.cout_fourniture_annuel_ht + coalesce(v_turpe_total, 0) + v_conso * coalesce(v_acc, 0), 2),
        date_modification = now()
      where ofc.version_recommandation_compteur_id = p_vc and ofc.cout_fourniture_annuel_ht is not null
      returning ofc.offre_fournisseur_id
    )
    update public.offres_fournisseurs o
    set montant_annuel_ht = (select sum(x.cout_total_annuel_estime_ht) from public.offres_fournisseurs_compteurs x where x.offre_fournisseur_id = o.id),
        date_modification = now()
    where o.id in (select offre_fournisseur_id from maj);
  end if;

  return v_res;
end $$;

-- 7. UNE NOUVELLE PÉRIODE POUR UNE TAXE ─────────────────────────────────────────────────────────
-- Recopie les valeurs de la période source, à partir d'une date ; la période en cours se clôt la
-- veille. On ne ressaisit que ce qui change.
create or replace function public.fn_nouvelle_periode_taxe(p_taxe text, p_source uuid, p_libelle text, p_debut date)
returns uuid language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  if exists (select 1 from public.taxes_reglementees_versions where actif and taxe = p_taxe and date_debut >= p_debut) then
    raise exception 'Une période % commence déjà le % ou après : la nouvelle doit commencer après elle.', p_taxe, to_char(p_debut, 'DD/MM/YYYY');
  end if;
  update public.taxes_reglementees_versions set date_fin = p_debut - 1, date_modification = now()
  where actif and taxe = p_taxe and date_debut < p_debut and (date_fin is null or date_fin >= p_debut);
  insert into public.taxes_reglementees_versions (taxe, libelle, date_debut) values (p_taxe, p_libelle, p_debut) returning id into v_id;
  insert into public.taxes_reglementees_valeurs (version_id, tarif, profil, valeur)
  select v_id, tarif, profil, valeur from public.taxes_reglementees_valeurs where version_id = p_source;
  return v_id;
end $$;

-- 8. QUI PEUT APPELER QUOI ──────────────────────────────────────────────────────────────────────
revoke all on function public.fn_taxe_en_vigueur(text, date) from public, anon;
revoke all on function public.fn_cpb_moyen(date, integer) from public, anon;
revoke all on function public.fn_taxe_applicable(text, date) from public, anon;
revoke all on function public.fn_echeance_compteur(uuid) from public, anon;
grant execute on function public.fn_echeance_compteur(uuid) to authenticated;
revoke all on function public.fn_version_turpe_applicable(date) from public, anon;
grant execute on function public.fn_taxe_applicable(text, date) to authenticated;
grant execute on function public.fn_version_turpe_applicable(date) to authenticated;
revoke all on function public.fn_reglementaire_version_compteur(uuid) from public, anon;
revoke all on function public.fn_nouvelle_periode_taxe(text, uuid, text, date) from public, anon;
grant execute on function public.fn_taxe_en_vigueur(text, date) to authenticated;
grant execute on function public.fn_cpb_moyen(date, integer) to authenticated;
grant execute on function public.fn_reglementaire_version_compteur(uuid) to authenticated;
grant execute on function public.fn_nouvelle_periode_taxe(text, uuid, text, date) to authenticated;
