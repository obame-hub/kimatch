-- La colonne « Conseiller » de la liste des recommandations etait vide 1 703 fois sur 1 713.
--
-- CE QUI SE PASSAIT. La vue construisait le nom depuis `recommandations.responsable_profil_id`.
-- Cette colonne est renseignee sur DIX lignes. La reprise Salesforce n'a jamais rempli le
-- responsable ; elle a rempli le PROPRIETAIRE, qui l'est sur 1 701 lignes. La colonne affichait
-- donc un tiret pour 99,4 % des dossiers, et la recherche par conseiller ne trouvait rien.
--
-- Mesure du 28/08/2026, qui rend le choix evident :
--   proprietaire seul     1 691
--   responsable seul          0   <- jamais
--   les deux                 10
--   aucun des deux           12
--
-- POURQUOI UN COALESCE PLUTOT QU'UN SIMPLE REMPLACEMENT. `responsable_profil_id` n'est jamais
-- seul aujourd'hui, mais rien n'interdit qu'on s'en serve demain pour designer quelqu'un d'autre
-- que le proprietaire — c'est meme sa raison d'etre. Le coalesce prend le proprietaire par defaut
-- et laisse la place a un responsable explicite le jour ou il y en aura un, sans qu'il faille
-- retoucher la vue.
--
-- Le reste de la vue est repris a l'identique : meme ordre de colonnes, meme LATERAL, meme
-- definition de « derniere version » (version_actuelle d'abord, plus grand numero a defaut) que
-- `recalculer_statut_recommandation`. Les deux doivent rester d'accord.

begin;

create or replace view public.v_recommandations_liste
with (security_invoker = true) as
 SELECT r.id,
    r.nom,
    r.priorite,
    r.date_ouverture,
    r.date_cloture,
    r.finalite_cloture,
    r.type_opportunite,
    r.compte_id,
    r.proprietaire_id,
    r.date_creation,
    cp.nom AS compte_nom,
    e.code AS etape,
    o.libelle AS origine,
    te.code AS type_energie,
    COALESCE((pr.prenom || ' '::text) || pr.nom, ''::text) AS conseiller,
    COALESCE(v.nb, 0) AS nb_versions,
    COALESCE(s.sites, '[]'::jsonb) AS sites,
    cp.proprietaire_id AS compte_proprietaire_id,
    r.marge_nette,
    r.montant,
    d.statut_version,
    d.resultat_version,
    d.numero_version,
        CASE
            WHEN e.code = 'CLOTUREE'::text THEN 'CLOTUREE'::text
            WHEN d.statut_version IS NULL THEN 'BROUILLON'::text
            WHEN d.statut_version = ANY (ARRAY['EN_CONSTRUCTION'::text, 'DISPONIBLE'::text, 'EN_DECISION'::text]) THEN d.statut_version
            ELSE 'A_REACTIVER'::text
        END AS colonne_travail
   FROM recommandations r
     LEFT JOIN comptes cp ON cp.id = r.compte_id
     LEFT JOIN etapes_recommandation e ON e.id = r.etape_id
     LEFT JOIN types_origines o ON o.id = r.origine_id
     LEFT JOIN types_energies te ON te.id = r.type_energie_id
     -- LA SEULE LIGNE QUI CHANGE : le responsable explicite s'il existe, le proprietaire sinon.
     LEFT JOIN profils pr ON pr.id = COALESCE(r.responsable_profil_id, r.proprietaire_id)
     LEFT JOIN ( SELECT versions_recommandation.recommandation_id,
            count(*)::integer AS nb
           FROM versions_recommandation
          GROUP BY versions_recommandation.recommandation_id) v ON v.recommandation_id = r.id
     LEFT JOIN ( SELECT rs.recommandation_id,
            jsonb_agg(jsonb_build_object('id', si.id, 'nom', si.nom) ORDER BY si.nom) AS sites
           FROM recommandations_sites rs
             JOIN sites si ON si.id = rs.site_id
          GROUP BY rs.recommandation_id) s ON s.recommandation_id = r.id
     LEFT JOIN LATERAL ( SELECT sv.code AS statut_version,
            ver.resultat AS resultat_version,
            ver.numero_version
           FROM versions_recommandation ver
             LEFT JOIN statuts_versions_recommandation sv ON sv.id = ver.statut_version_id
          WHERE ver.recommandation_id = r.id
          ORDER BY ver.version_actuelle DESC NULLS LAST, ver.numero_version DESC NULLS LAST
         LIMIT 1) d ON true;

commit;
