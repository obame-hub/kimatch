-- ══ LA LISTE DES COMPTEURS SE COMPTE EN UN PASSAGE, ET « MES COMPTEURS » PAR LE COMPTE ══
-- William, 07/10/2026 : Patrimoine › Compteurs « se charge beaucoup trop lentement ».
--
-- 1. LES SEPT NOMBRES DES ONGLETS (tous, sans échéance, dépassées, six mois, prouvées, estimées,
--    contredites) partaient en SEPT requêtes `count` sur `v_compteurs_liste`, et chacune
--    recalculait l'échéance des 7 957 compteurs (`v_echeance_compteur`). Une fonction les rend en
--    un seul passage. Les bornes de dates viennent du navigateur, comme avant (`jourIso`).
--
-- 2. « MES COMPTEURS » envoyait dans l'adresse de la requête la liste des sites du portefeuille :
--    1 274 identifiants pour un commercial à 919 comptes, après les avoir lus par lots. La vue porte
--    désormais le propriétaire du compte du compteur ; le filtre devient une égalité. Vérifié le
--    07/10/2026 : 0 compteur dont le site appartient à un autre compte que le sien, et le même
--    total (1 591) par les sites ou par le compte.
--
-- La colonne est AJOUTÉE EN FIN de vue : `create or replace view` exige que les colonnes
-- existantes gardent leur place.
create or replace view public.v_compteurs_liste with (security_invoker = true) as
 select c.id,
    c.numero_point,
    c.site_id,
    c.actif,
    c.consommation_annuelle_mwh,
    c.localisation_site,
    c.date_echeance as date_declaree,
    te.code as type_energie_code,
    c.libelle_site as site_nom,
    c.compte_id,
    e.date_preuve,
    e.date_echeance,
    e.nature as nature_echeance,
    e.date_preuve is not null and c.date_echeance is not null and abs(e.date_preuve - c.date_echeance) > 31 as contredit,
    c.responsable_contact_id,
    c.contact_conseil_syndical_id,
    c.adresse_site,
    e.indeterminee as echeance_indeterminee,
    cp.proprietaire_id as compte_proprietaire_id
   from compteurs c
     left join types_energies te on te.id = c.type_energie_id
     left join v_echeance_compteur e on e.compteur_id = c.id
     left join comptes cp on cp.id = c.compte_id;

create or replace function public.fn_decompte_echeances_compteurs(p_aujourdhui date, p_dans_six_mois date)
returns table (tous bigint, absente bigint, depassee bigint, six_mois bigint, prouvee bigint, estimee bigint, contredit bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select count(*),
         count(*) filter (where nature_echeance = 'ABSENTE'),
         count(*) filter (where date_echeance < p_aujourdhui),
         count(*) filter (where date_echeance >= p_aujourdhui and date_echeance <= p_dans_six_mois),
         count(*) filter (where nature_echeance = 'PROUVEE'),
         count(*) filter (where nature_echeance = 'ESTIMEE'),
         count(*) filter (where contredit)
    from v_compteurs_liste
   where actif
$$;

revoke execute on function public.fn_decompte_echeances_compteurs(date, date) from public, anon;
grant execute on function public.fn_decompte_echeances_compteurs(date, date) to authenticated;
