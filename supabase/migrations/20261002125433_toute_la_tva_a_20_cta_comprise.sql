-- ══ TOUTE LA TVA À 20 %, CTA COMPRISE — 02/10/2026 ══
-- William : « en fait mets toute la TVA à 20 % ». La part à 5,5 % (la CTA) disparaît : le TTC est le
-- HTVA × 1,2, au centime, pour toutes les lignes — l'existant compris, la colonne étant calculée.
create or replace function public.fn_reglementaire_version_compteur(p_vc uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  r record;
  g public.compteurs_gaz%rowtype;
  e public.compteurs_electricite%rowtype;
  v_debut date; v_source text; v_envoi date;
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
  select vrc.id, vrc.compteur_id, v.id as version_id, v.date_debut_fourniture, v.date_publication_comparatif, public.fn_echeance_compteur(c.id) as date_echeance, upper(te.code) as energie
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
  v_envoi := coalesce(r.date_publication_comparatif::date, current_date);
  v_gaz := r.energie = 'GAZ';

  if v_gaz then
    select * into g from public.compteurs_gaz where compteur_id = r.compteur_id;
    v_acc_v := public.fn_taxe_applicable('AG', v_envoi);
    v_tqd_v := public.fn_taxe_applicable('TQD', v_envoi);
    v_cta_v := public.fn_taxe_applicable('CTA', v_envoi);
    if public.fn_taxe_en_vigueur('AG', v_envoi) is distinct from v_acc_v then v_approx := v_approx || 'AG'::text; end if;
    if public.fn_taxe_en_vigueur('TQD', v_envoi) is distinct from v_tqd_v then v_approx := v_approx || 'TQD'::text; end if;
    if public.fn_taxe_en_vigueur('CTA', v_envoi) is distinct from v_cta_v then v_approx := v_approx || 'CTA'::text; end if;
    select valeur into v_acc from public.taxes_reglementees_valeurs where version_id = v_acc_v and tarif is null and profil is null;
    if v_acc is null then v_manques := v_manques || 'Accise gaz (AG)'::text; end if;
    if g.tarif_distribution is null then
      v_manques := v_manques || 'Tarif du compteur (T1 à T4) inconnu'::text;
    else
      select valeur into v_tqd from public.taxes_reglementees_valeurs where version_id = v_tqd_v and tarif = g.tarif_distribution and profil is null;
      select valeur into v_cta from public.taxes_reglementees_valeurs
      where version_id = v_cta_v and tarif = g.tarif_distribution and (profil = g.profil_consommation or profil is null)
      order by profil nulls last limit 1;
      if v_tqd is null then v_manques := v_manques || ('TQD ' || g.tarif_distribution); end if;
      if v_cta is null then v_manques := v_manques || ('CTA ' || g.tarif_distribution || coalesce(' ' || g.profil_consommation, ' (profil inconnu)')); end if;
    end if;
    for d in
      select distinct coalesce(o.duree_mois, 12) from public.offres_fournisseurs o
      join public.optimisations op on op.id = o.optimisation_id
      where op.version_recommandation_id = r.version_id and o.actif and coalesce(o.duree_mois, 12) > 0
    loop
      v_cpb := v_cpb || jsonb_build_object(d::text, public.fn_cpb_moyen(v_debut, d));
    end loop;
  else
    select * into e from public.compteurs_electricite where compteur_id = r.compteur_id;
    v_version_turpe := public.fn_version_turpe_applicable(v_envoi);
    if public.fn_version_turpe_active(v_envoi) is distinct from v_version_turpe then v_approx := v_approx || 'TURPE'::text; end if;
    v_turpe := public.fn_calculer_turpe(r.compteur_id, v_version_turpe);
    v_turpe_total := nullif(v_turpe ->> 'total', '')::numeric;
    if v_turpe_total is null then v_manques := v_manques || ('TURPE : ' || coalesce((select string_agg(x, ', ') from jsonb_array_elements_text(v_turpe -> 'manques') x), 'incomplet')); end if;
    v_acc_v := public.fn_taxe_applicable('AE', v_envoi);
    if public.fn_taxe_en_vigueur('AE', v_envoi) is distinct from v_acc_v then v_approx := v_approx || 'AE'::text; end if;
    select valeur into v_acc from public.taxes_reglementees_valeurs where version_id = v_acc_v and tarif is null and profil is null;
    if v_acc is null then v_manques := v_manques || 'Accise électricité (AE)'::text; end if;
    v_conso := coalesce(e.conso_base_mwh, 0) + coalesce(e.conso_hp_mwh, 0) + coalesce(e.conso_hc_mwh, 0) + coalesce(e.conso_pointe_mwh, 0)
             + coalesce(e.conso_hph_mwh, 0) + coalesce(e.conso_hch_mwh, 0) + coalesce(e.conso_hpe_mwh, 0) + coalesce(e.conso_hce_mwh, 0);
  end if;

  v_res := jsonb_build_object(
    'energie', case when v_gaz then 'gaz' else 'electricite' end,
    'date_reference', v_debut, 'source_date', v_source, 'echeance', r.date_echeance, 'date_envoi', v_envoi,
    'envoi_fige', r.date_publication_comparatif is not null,
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
        prix_cpb_mwh = nullif(v_cpb ->> coalesce(o.duree_mois, 12)::text, '')::numeric, date_modification = now()
    from public.offres_fournisseurs_compteurs ofc
    join public.offres_fournisseurs o on o.id = ofc.offre_fournisseur_id
    where ocg.offre_compteur_id = ofc.id and ofc.version_recommandation_compteur_id = p_vc;

    with maj as (
      update public.offres_fournisseurs_compteurs ofc set
        cout_acheminement_annuel_ht = round(coalesce(ofc.consommation_annuelle_reference_mwh, g.car_mwh, 0) * coalesce(v_tqd, 0), 2),
        cout_taxes_annuel = round(coalesce(ofc.consommation_annuelle_reference_mwh, g.car_mwh, 0)
                                  * (coalesce(v_acc, 0) + coalesce(nullif(v_cpb ->> coalesce(o.duree_mois, 12)::text, '')::numeric, 0)) + coalesce(v_cta, 0), 2),
        cout_total_annuel_estime_ht = round(ofc.cout_fourniture_annuel_ht
          + coalesce(ofc.consommation_annuelle_reference_mwh, g.car_mwh, 0) * (coalesce(v_tqd, 0) + coalesce(v_acc, 0) + coalesce(nullif(v_cpb ->> coalesce(o.duree_mois, 12)::text, '')::numeric, 0))
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
end $function$;

alter table public.offres_fournisseurs_compteurs drop column if exists cout_total_annuel_estime_ttc;
-- La colonne de la part à 5,5 % reste le temps que le Kimatch en ligne cesse d'y écrire (le code
-- déployé l'envoie encore : la supprimer ferait échouer chaque saisie). Elle n'entre plus dans rien.
comment on column public.offres_fournisseurs_compteurs.cout_tva_reduite_annuel_ht is
  'OBSOLÈTE depuis le 02/10/2026 (toute la TVA à 20 %) : n''entre plus dans le TTC. À supprimer.';
alter table public.offres_fournisseurs_compteurs
  add column cout_total_annuel_estime_ttc numeric generated always as (round(cout_total_annuel_estime_ht * 1.2, 2)) stored;
comment on column public.offres_fournisseurs_compteurs.cout_total_annuel_estime_ttc is
  'Budget annuel TTC : TVA 20 % sur tout, CTA comprise (William, 02/10/2026), au centime.';
