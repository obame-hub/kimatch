-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- AU GAZ, LE CPB EST DANS L'ÉNERGIE — William, 06/10/2026
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- « Dans le calcul des prix gaz, il faut inclure les CPB dans le budget énergie et non pas le budget
-- taxes. » Le Pricer (`budgetGaz`) compte désormais le CPB dans l'énergie, donc dans la fourniture
-- (`cout_fourniture_annuel_ht`) ; les taxes ne gardent que l'accise AG et la CTA. Le total ne bouge pas.
--
-- Le report sur les lignes déjà chiffrées (`fn_reglementaire_version_compteur`) suit : la fourniture
-- porte le CPB, et quand le CPB d'une ligne change (date de fourniture, durée), seule la différence
-- s'y reporte ; les taxes et le total se recalculent sans lui. Chaque remplacement est vérifié.
--
-- L'EXISTANT : les lignes gaz dont les taxes comprenaient le CPB (celles passées par le report)
-- voient le montant du CPB passer des taxes à la fourniture, au centime ; leur total est inchangé.

do $$
declare
  v_def text;
  v_neuf text;
  v_avant text;
begin
  v_def := pg_get_functiondef('public.fn_reglementaire_version_compteur'::regproc);

  v_avant := '  -- LE REPORT SUR LES LIGNES DÉJÀ CHIFFRÉES : seules celles dont la part fournisseur est connue.
  if v_gaz then
';
  v_neuf := replace(v_def, v_avant, v_avant || '    -- LE CPB EST DANS LA FOURNITURE (06/10/2026) : quand il change, seule la différence s''y reporte.
    update public.offres_fournisseurs_compteurs ofc
    set cout_fourniture_annuel_ht = ofc.cout_fourniture_annuel_ht
          + round(coalesce(ofc.consommation_annuelle_reference_mwh, g.car_mwh, 0)
              * (case when ''CPB'' = any(ofc.p0_inclut) then 0 else coalesce(nullif(v_cpb ->> coalesce(o.duree_mois, 12)::text, '''')::numeric, 0) end), 2)
          - round(coalesce(ofc.consommation_annuelle_reference_mwh, g.car_mwh, 0)
              * (case when ''CPB'' = any(ofc.p0_inclut) then 0 else coalesce(ocg.prix_cpb_mwh, 0) end), 2)
    from public.offres_compteurs_gaz ocg, public.offres_fournisseurs o
    where ocg.offre_compteur_id = ofc.id and o.id = ofc.offre_fournisseur_id
      and ofc.version_recommandation_compteur_id = p_vc and ofc.cout_fourniture_annuel_ht is not null
      and not (''CPB'' = any(ofc.p0_inclut))
      and coalesce(ocg.prix_cpb_mwh, 0) is distinct from coalesce(nullif(v_cpb ->> coalesce(o.duree_mois, 12)::text, '''')::numeric, 0);

');
  if v_neuf = v_def then raise exception 'report : point d''insertion introuvable'; end if;

  -- Les taxes, sans le CPB.
  v_avant := '        cout_taxes_annuel = round(coalesce(ofc.consommation_annuelle_reference_mwh, g.car_mwh, 0)
          * ((case when ''ACCISE'' = any(ofc.p0_inclut) then 0 else coalesce(v_acc, 0) end)
             + (case when ''CPB'' = any(ofc.p0_inclut) then 0 else coalesce(nullif(v_cpb ->> coalesce(o.duree_mois, 12)::text, '''')::numeric, 0) end))
          + coalesce(v_cta, 0), 2),';
  if position(v_avant in v_neuf) = 0 then raise exception 'taxes : formule introuvable'; end if;
  v_neuf := replace(v_neuf, v_avant, '        cout_taxes_annuel = round(coalesce(ofc.consommation_annuelle_reference_mwh, g.car_mwh, 0)
          * (case when ''ACCISE'' = any(ofc.p0_inclut) then 0 else coalesce(v_acc, 0) end)
          + coalesce(v_cta, 0), 2),');

  -- Le total : la fourniture (CPB compris) + TQD + AG + CTA.
  v_avant := '               + (case when ''ACCISE'' = any(ofc.p0_inclut) then 0 else coalesce(v_acc, 0) end)
               + (case when ''CPB'' = any(ofc.p0_inclut) then 0 else coalesce(nullif(v_cpb ->> coalesce(o.duree_mois, 12)::text, '''')::numeric, 0) end))';
  if position(v_avant in v_neuf) = 0 then raise exception 'total : formule introuvable'; end if;
  v_neuf := replace(v_neuf, v_avant, '               + (case when ''ACCISE'' = any(ofc.p0_inclut) then 0 else coalesce(v_acc, 0) end))');

  execute v_neuf;
end $$;

-- L'EXISTANT : le CPB passe des taxes à la fourniture, sur les lignes dont les taxes le comprenaient.
-- Les taxes sont recalculées comme le fait le report (accise + CTA, arrondies une fois) et la
-- fourniture reçoit exactement ce qu'elles perdent : le total reste au centime près.
with lignes as (
  select ofc.id,
         round(coalesce(ofc.consommation_annuelle_reference_mwh, g.car_mwh, 0)
           * (case when 'ACCISE' = any(ofc.p0_inclut) then 0 else coalesce(ocg.prix_agn_mwh, 0) end)
           + coalesce(ocg.cta_annuel_ht, 0), 2) as taxes_sans_cpb
    from public.offres_fournisseurs_compteurs ofc
    join public.offres_compteurs_gaz ocg on ocg.offre_compteur_id = ofc.id
    join public.versions_recommandation_compteurs vrc on vrc.id = ofc.version_recommandation_compteur_id
    left join public.compteurs_gaz g on g.compteur_id = vrc.compteur_id
   where ofc.cout_fourniture_annuel_ht is not null
     and ofc.cout_taxes_annuel is not null
     and not ('CPB' = any(ofc.p0_inclut))
     and coalesce(ocg.prix_cpb_mwh, 0) <> 0
     and ofc.cout_taxes_annuel = round(coalesce(ofc.consommation_annuelle_reference_mwh, g.car_mwh, 0)
           * ((case when 'ACCISE' = any(ofc.p0_inclut) then 0 else coalesce(ocg.prix_agn_mwh, 0) end) + coalesce(ocg.prix_cpb_mwh, 0))
           + coalesce(ocg.cta_annuel_ht, 0), 2)
)
update public.offres_fournisseurs_compteurs ofc
   set cout_fourniture_annuel_ht = ofc.cout_fourniture_annuel_ht + (ofc.cout_taxes_annuel - l.taxes_sans_cpb),
       cout_taxes_annuel = l.taxes_sans_cpb,
       date_modification = now()
  from lignes l
 where l.id = ofc.id;
