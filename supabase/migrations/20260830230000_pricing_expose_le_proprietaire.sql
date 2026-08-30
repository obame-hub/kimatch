begin;

-- « MES CONSULTATIONS » OU « TOUTES », SUR L'ECRAN PRICING.
--
-- Le tableau du Pricing est pagine et somme PAR LA BASE : dix cartes par colonne, et un montant
-- total calcule sur l'ensemble. Filtrer dans le navigateur n'aurait filtre que les dix cartes
-- visibles, en laissant le montant total compter tout le monde — les deux se seraient dementis.
--
-- La vue expose donc le proprietaire du compte, comme le fait deja v_recommandations_liste.
-- C'est le compte qui porte la notion : une consultation fournisseur n'a pas de proprietaire a
-- elle, elle appartient au conseiller qui suit le client pour qui on consulte.

create or replace view public.v_pricing_consultations as
WITH dernier_suivi AS (
         SELECT DISTINCT ON (f.optimisation_fournisseur_id) f.optimisation_fournisseur_id,
            s.code AS statut_code,
            s.libelle AS statut_libelle,
            f.date_evenement
           FROM suivis_consultations_fournisseurs f
             JOIN statuts_consultations_fournisseurs s ON s.id = f.statut_id
          ORDER BY f.optimisation_fournisseur_id, f.date_evenement DESC NULLS LAST, s.ordre DESC
        ), offre_du_fournisseur AS (
         SELECT o.optimisation_fournisseur_id,
            max(o.montant_annuel_ht) AS montant_annuel_ht,
            max(o.prix_moyen_mwh) AS prix_moyen_mwh,
            bool_or(COALESCE(o.est_offre_recommandee, false)) AS est_retenue,
            count(*) AS nb_offres
           FROM offres_fournisseurs o
          WHERE o.actif AND o.optimisation_fournisseur_id IS NOT NULL
          GROUP BY o.optimisation_fournisseur_id
        )
 SELECT ofr.id AS consultation_id,
    ofr.optimisation_id,
    r.id AS recommandation_id,
    r.nom AS recommandation_nom,
    cp.nom AS compte_nom,
    cp.id AS compte_id,
    fo.nom AS fournisseur_nom,
    te.code AS type_energie,
    d.statut_code,
    d.statut_libelle,
    d.date_evenement,
    COALESCE(od.nb_offres, 0::bigint) AS nb_offres,
    od.montant_annuel_ht,
    od.prix_moyen_mwh,
    COALESCE(od.est_retenue, false) AS est_retenue,
    et.code AS recommandation_etape,
    COALESCE(et.code, ''::text) <> 'CLOTUREE'::text AS reco_en_cours,
    v.id AS version_id,
    v.numero_version,
    COALESCE(v.version_actuelle, false) AS version_courante,
    sv.code AS version_statut,
    v.resultat AS version_resultat,
    COALESCE(sv.code, ''::text) = ANY (ARRAY['EN_CONSTRUCTION'::text, 'DISPONIBLE'::text, 'EN_DECISION'::text]) AS version_vivante,
    v.date_souhaitee AS date_cotation_souhaitee,
    v.date_souhaitee - CURRENT_DATE AS jours_avant_cotation,
        CASE
            WHEN d.statut_code IS NULL THEN 'A_DEMANDER'::text
            WHEN d.statut_code = 'ENVOYEE'::text THEN 'EN_ATTENTE'::text
            WHEN d.statut_code = 'ACCEPTEE'::text THEN 'RECUE'::text
            WHEN d.statut_code = 'REFUSEE'::text THEN 'REFUSEE'::text
            ELSE 'EN_ATTENTE'::text
        END AS colonne,
    cp.proprietaire_id AS compte_proprietaire_id
   FROM optimisations_fournisseurs ofr
     JOIN optimisations op ON op.id = ofr.optimisation_id
     JOIN versions_recommandation v ON v.id = op.version_recommandation_id
     LEFT JOIN statuts_versions_recommandation sv ON sv.id = v.statut_version_id
     JOIN recommandations r ON r.id = v.recommandation_id
     LEFT JOIN etapes_recommandation et ON et.id = r.etape_id
     LEFT JOIN comptes cp ON cp.id = r.compte_id
     LEFT JOIN comptes fo ON fo.id = ofr.fournisseur_compte_id
     LEFT JOIN types_energies te ON te.id = r.type_energie_id
     LEFT JOIN dernier_suivi d ON d.optimisation_fournisseur_id = ofr.id
     LEFT JOIN offre_du_fournisseur od ON od.optimisation_fournisseur_id = ofr.id
  WHERE r.actif
;

commit;
