-- LA CAPACITÉ, 2 €/MWh POUR TOUT LE MONDE — William, 06/10/2026 : « les CAPA c'est un peu spécial et
-- les prix par API ne retranscrivent pas exactement la réalité ; pour l'instant, les CAPA sont fixées
-- à 2 €/MWh par défaut, pour tout le monde ». Le Pricer le fait pour les saisies à venir
-- (`CAPACITE_DEFAUT_MWH`). Ici, l'existant : les offres fournisseurs d'électricité des versions NON
-- publiées dont la capacité est renseignée et différente de 2 passent à 2 — hors capacité comprise
-- dans le P0, hors offre de référence. Leur fourniture et leur total suivent de la différence
-- (consommation × écart). Le montant de l'offre est recalculé par la migration suivante (le calcul
-- d'ici lisait les totaux d'avant la mise à jour).
with lignes as (
  select oce.offre_compteur_id as id, ofc.offre_fournisseur_id as offre,
         coalesce(oce.prix_hph_capacite_mwh, oce.prix_hpe_capacite_mwh, oce.prix_hch_capacite_mwh, oce.prix_hce_capacite_mwh,
                  oce.prix_pointe_capacite_mwh, oce.prix_base_capacite_mwh, oce.prix_hp_capacite_mwh, oce.prix_hc_capacite_mwh) as ancienne,
         ofc.consommation_annuelle_reference_mwh as conso
    from public.offres_compteurs_electricite oce
    join public.offres_fournisseurs_compteurs ofc on ofc.id = oce.offre_compteur_id
    join public.offres_fournisseurs o on o.id = ofc.offre_fournisseur_id
    join public.optimisations op on op.id = o.optimisation_id
    join public.versions_recommandation v on v.id = op.version_recommandation_id
   where v.date_publication_comparatif is null
     and o.nature_offre = 'PROPOSEE'
     and not ('CAPACITE' = any(coalesce(ofc.p0_inclut, '{}')))
), a_changer as (
  select * from lignes where ancienne is not null and ancienne <> 2
), capa as (
  update public.offres_compteurs_electricite oce set
    prix_hph_capacite_mwh = case when prix_hph_capacite_mwh is null then null else 2 end,
    prix_hpe_capacite_mwh = case when prix_hpe_capacite_mwh is null then null else 2 end,
    prix_hch_capacite_mwh = case when prix_hch_capacite_mwh is null then null else 2 end,
    prix_hce_capacite_mwh = case when prix_hce_capacite_mwh is null then null else 2 end,
    prix_pointe_capacite_mwh = case when prix_pointe_capacite_mwh is null then null else 2 end,
    prix_base_capacite_mwh = case when prix_base_capacite_mwh is null then null else 2 end,
    prix_hp_capacite_mwh = case when prix_hp_capacite_mwh is null then null else 2 end,
    prix_hc_capacite_mwh = case when prix_hc_capacite_mwh is null then null else 2 end,
    date_modification = now()
  from a_changer a where oce.offre_compteur_id = a.id
  returning oce.offre_compteur_id
), budgets as (
  update public.offres_fournisseurs_compteurs ofc set
    cout_fourniture_annuel_ht = ofc.cout_fourniture_annuel_ht + round(coalesce(a.conso, 0) * (2 - a.ancienne), 2),
    cout_total_annuel_estime_ht = ofc.cout_total_annuel_estime_ht + round(coalesce(a.conso, 0) * (2 - a.ancienne), 2),
    date_modification = now()
  from a_changer a where ofc.id = a.id and ofc.cout_fourniture_annuel_ht is not null
  returning ofc.offre_fournisseur_id
)
update public.offres_fournisseurs o
   set montant_annuel_ht = (select sum(x.cout_total_annuel_estime_ht) + coalesce(sum(case when x.id in (select offre_fournisseur_id from budgets) then 0 end), 0)
                              from public.offres_fournisseurs_compteurs x where x.offre_fournisseur_id = o.id),
       date_modification = now()
 where o.id in (select offre_fournisseur_id from budgets);
