-- ══ LA ZONE D'UN FOURNISSEUR DANS LA LISTE DES COMPTES — William, 05/10/2026 ══
-- « Si je choisis de voir les comptes fournisseurs, que le filtre d'affichage soit Kiwee, Energix,
-- OBD et non partenaire. » Une seule colonne ajoutée, en fin : `zone_fournisseur`, nulle pour les
-- comptes qui ne sont pas fournisseurs.
--   kiwee          partenariat « kiwee » (en direct)
--   energix / obd  partenariat « intermediaire » via cet intermédiaire
--   non_partenaire tout le reste — dont un ancien partenaire (ENDESA, « aucun », ex-OBD)
create or replace view public.v_comptes_liste with (security_invoker = true) as
 SELECT c.id,
    c.nom,
    c.ville,
    c.segment,
    c.siren,
    c.siret,
    c.code_postal,
    c.score_ellipro,
    c.type_compte,
    c.proprietaire_id,
    c.date_creation,
    tc.libelle AS type_compte_libelle,
    COALESCE(s.nb, 0) AS nb_sites,
    cl.compte_id IS NOT NULL AS est_client,
    CASE
      WHEN c.type_compte <> 'fournisseur' THEN NULL
      WHEN lower(cf.partnership) = 'kiwee' THEN 'kiwee'
      WHEN lower(cf.partnership) = 'intermediaire' AND lower(cf.intermediary) = 'energix' THEN 'energix'
      WHEN lower(cf.partnership) = 'intermediaire' AND lower(cf.intermediary) = 'obd' THEN 'obd'
      ELSE 'non_partenaire'
    END AS zone_fournisseur
   FROM comptes c
     LEFT JOIN types_comptes tc ON tc.id = c.type_compte_id
     LEFT JOIN comptes_fournisseurs cf ON cf.compte_id = c.id
     LEFT JOIN ( SELECT compteurs.compte_id,
            count(DISTINCT compteurs.groupe_site_id)::integer AS nb
           FROM compteurs
          GROUP BY compteurs.compte_id) s ON s.compte_id = c.id
     LEFT JOIN ( SELECT DISTINCT cm.compte_id
           FROM compteurs cm
             JOIN contrats_compteurs cc ON cc.compteur_id = cm.id
             JOIN contrats ct ON ct.id = cc.contrat_id
          WHERE cm.actif AND fn_contrat_compte(ct.*) AND (ct.date_fin IS NULL OR ct.date_fin >= CURRENT_DATE)) cl ON cl.compte_id = c.id;
