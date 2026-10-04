-- ══ LE PRICER NE PROPOSE QUE LES DOSSIERS MONOSITES — William, 04/10/2026 ══
-- « Pour l'instant j'ai pas designé le multisite donc ne propose pas les offres en multisite dans le
-- pricer. » La vue dit combien de compteurs porte chaque version ; le Pricer écarte celles qui en ont
-- plus d'un (5 dossiers en construction ce jour-là). Seule colonne ajoutée : `nb_compteurs`, en fin.
create or replace view public.v_pricing_versions with (security_invoker = true) as
 WITH dernier_suivi AS (
         SELECT DISTINCT ON (f.optimisation_fournisseur_id) f.optimisation_fournisseur_id,
            s.code AS statut_code,
            s.libelle AS statut_libelle,
            f.date_evenement
           FROM suivis_consultations_fournisseurs f
             JOIN statuts_consultations_fournisseurs s ON s.id = f.statut_id
          ORDER BY f.optimisation_fournisseur_id, f.date_evenement DESC NULLS LAST, s.ordre DESC
        ), combinaisons AS (
         SELECT o.optimisation_fournisseur_id,
            jsonb_agg(jsonb_build_object('id', o.id, 'duree_mois', o.duree_mois, 'type_prix', o.type_prix, 'statut', o.statut) ORDER BY o.duree_mois, o.type_prix) AS combinaisons
           FROM offres_fournisseurs o
          WHERE o.actif AND o.optimisation_fournisseur_id IS NOT NULL
          GROUP BY o.optimisation_fournisseur_id
        ), consultations AS (
         SELECT op.version_recommandation_id AS version_id,
            ofr.id AS consultation_id,
            ofr.fournisseur_compte_id,
            COALESCE(fo.nom, 'Fournisseur inconnu'::text) AS fournisseur_nom,
            COALESCE(d.statut_code, 'A_TRAITER'::text) AS statut_code,
            COALESCE(d.statut_libelle, 'À traiter'::text) AS statut_libelle,
            d.date_evenement,
            COALESCE(cf.mode_consultation, 'EMAIL'::text) AS mode_consultation,
            cf.mode_reponse,
            COALESCE(cb.combinaisons, '[]'::jsonb) AS combinaisons
           FROM optimisations_fournisseurs ofr
             JOIN optimisations op ON op.id = ofr.optimisation_id
             LEFT JOIN comptes fo ON fo.id = ofr.fournisseur_compte_id
             LEFT JOIN comptes_fournisseurs cf ON cf.compte_id = ofr.fournisseur_compte_id
             LEFT JOIN dernier_suivi d ON d.optimisation_fournisseur_id = ofr.id
             LEFT JOIN combinaisons cb ON cb.optimisation_fournisseur_id = ofr.id
        ), par_version AS (
         SELECT consultations.version_id,
            count(*) AS nb_fournisseurs,
            count(*) FILTER (WHERE consultations.statut_code = 'DISPONIBLE'::text) AS nb_recues,
            count(*) FILTER (WHERE consultations.statut_code = 'REFUSEE'::text) AS nb_refusees,
            count(*) FILTER (WHERE consultations.statut_code <> ALL (ARRAY['DISPONIBLE'::text, 'REFUSEE'::text])) AS nb_attendus,
            jsonb_agg(jsonb_build_object('id', consultations.consultation_id, 'fournisseur_compte_id', consultations.fournisseur_compte_id, 'fournisseur_nom', consultations.fournisseur_nom, 'statut_code', consultations.statut_code, 'statut_libelle', consultations.statut_libelle, 'date_evenement', consultations.date_evenement, 'mode_consultation', consultations.mode_consultation, 'mode_reponse', consultations.mode_reponse, 'combinaisons', consultations.combinaisons) ORDER BY (
                CASE consultations.statut_code
                    WHEN 'DISPONIBLE'::text THEN 0
                    WHEN 'REFUSEE'::text THEN 2
                    ELSE 1
                END), consultations.fournisseur_nom) AS fournisseurs
           FROM consultations
          GROUP BY consultations.version_id
        )
 SELECT v.id AS version_id,
    v.numero_version,
    v.nom AS version_nom,
    sv.code AS version_statut,
    sv.libelle AS version_statut_libelle,
    v.date_souhaitee,
    v.date_souhaitee - CURRENT_DATE AS jours_avant_livraison,
    v.date_presentation_client,
    v.date_creation AS version_date_creation,
    r.id AS recommandation_id,
    r.nom AS recommandation_nom,
    r.montant,
    cp.id AS compte_id,
    cp.nom AS compte_nom,
    cp.proprietaire_id AS compte_proprietaire_id,
    r.proprietaire_id AS recommandation_proprietaire_id,
    te.code AS type_energie,
    et.code AS recommandation_etape,
    COALESCE(et.code, ''::text) <> 'CLOTUREE'::text AS reco_en_cours,
    COALESCE(v.version_actuelle, false) AS version_courante,
    COALESCE(pv.nb_fournisseurs, 0::bigint) AS nb_fournisseurs,
    COALESCE(pv.nb_recues, 0::bigint) AS nb_recues,
    COALESCE(pv.nb_refusees, 0::bigint) AS nb_refusees,
    COALESCE(pv.nb_attendus, 0::bigint) AS nb_attendus,
    COALESCE(pv.fournisseurs, '[]'::jsonb) AS fournisseurs,
    (SELECT count(*) FROM versions_recommandation_compteurs vc WHERE vc.version_recommandation_id = v.id) AS nb_compteurs
   FROM versions_recommandation v
     JOIN statuts_versions_recommandation sv ON sv.id = v.statut_version_id
     JOIN recommandations r ON r.id = v.recommandation_id
     LEFT JOIN etapes_recommandation et ON et.id = r.etape_id
     LEFT JOIN comptes cp ON cp.id = r.compte_id
     LEFT JOIN types_energies te ON te.id = r.type_energie_id
     LEFT JOIN par_version pv ON pv.version_id = v.id
  WHERE sv.code = ANY (ARRAY['EN_CONSTRUCTION'::text, 'DISPONIBLE'::text]);
