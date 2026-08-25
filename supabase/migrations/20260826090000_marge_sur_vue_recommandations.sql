-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA MARGE REJOINT LA VUE DES RECOMMANDATIONS
--
-- Michel, PDF « toutes les pages » du 25/08/2026, page 6 : la page Recommandations reçoit un bandeau
-- « Marge totale des recommandations » découpé selon les colonnes du tableau qui est en dessous —
-- à envoyer, à présenter, décision attendue, acceptées. C'est le motif commun de ses six pages : un
-- total en haut, réparti sur les colonnes.
--
-- POURQUOI PASSER PAR LA VUE. Le tableau lit déjà `v_recommandations_liste`, une colonne par étape,
-- comptée en base et paginée à dix cartes. Sommer la marge côté navigateur donnerait le total des DIX
-- cartes reçues et non des 648 dossiers de la colonne — le même piège que les totaux du 24/08, où une
-- colonne annonçait « 10 » sur six cents. La marge doit donc être une colonne de la vue pour que la
-- base puisse l'additionner.
--
-- DEUX COLONNES, AJOUTÉES À LA FIN. `create or replace view` n'autorise que l'ajout en queue : tout
-- le reste de la définition est reproduit à l'identique, y compris ce que je n'aurais pas écrit
-- ainsi. Ce n'est pas le fichier où rediscuter cette vue.
--
--   `marge_nette` — ce que l'affaire rapporte à Kiwee. C'est le chiffre du bandeau.
--   `montant`     — le montant de l'affaire, pour la mention portée par chaque carte.
--
-- CE QUE CES DEUX COLONNES NE SONT PAS : un calcul de Kimatch. Vérifié le 25/08 — aucun écran ne les
-- écrit, elles viennent de la reprise Salesforce. Renseignées sur 1 608 et 1 599 lignes sur 1 708,
-- donc le bandeau sera juste sur les dossiers repris et vide sur les nouveaux, tant que Michel n'aura
-- pas tranché si Kimatch doit les produire depuis les offres.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace view public.v_recommandations_liste as
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
    -- ── Ajout du 26/08/2026 : le bandeau de marge de la page 6 ──
    r.marge_nette,
    r.montant
   FROM recommandations r
     LEFT JOIN comptes cp ON cp.id = r.compte_id
     LEFT JOIN etapes_recommandation e ON e.id = r.etape_id
     LEFT JOIN types_origines o ON o.id = r.origine_id
     LEFT JOIN types_energies te ON te.id = r.type_energie_id
     LEFT JOIN profils pr ON pr.id = r.responsable_profil_id
     LEFT JOIN ( SELECT versions_recommandation.recommandation_id,
            count(*)::integer AS nb
           FROM versions_recommandation
          GROUP BY versions_recommandation.recommandation_id) v ON v.recommandation_id = r.id
     LEFT JOIN ( SELECT rs.recommandation_id,
            jsonb_agg(jsonb_build_object('id', si.id, 'nom', si.nom) ORDER BY si.nom) AS sites
           FROM recommandations_sites rs
             JOIN sites si ON si.id = rs.site_id
          GROUP BY rs.recommandation_id) s ON s.recommandation_id = r.id;

commit;
