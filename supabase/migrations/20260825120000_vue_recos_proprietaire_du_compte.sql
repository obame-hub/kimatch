-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA VUE DES RECOMMANDATIONS EXPOSE LE PROPRIÉTAIRE DU COMPTE
--
-- Michel, appel du 25/08/2026, « là en urgence » : « chaque commercial ne voit que les
-- recommandations sur lesquelles il est propriétaire du compte », avec son exemple — « Matthieu veut
-- regarder ses recommandations, mais il a les recommandations de tout le monde ». Accordé par Naoëlle
-- dans le même appel.
--
-- POURQUOI CETTE MIGRATION EXISTE : MON PREMIER CORRECTIF NE COUVRAIT PAS LA PAGE VISÉE. J'ai
-- d'abord filtré `fetchRecommandations`, qui sert les fiches et le tableau de bord. Or la page
-- /recommandations — celle dont il parle — ne passe pas par elle : elle lit cette vue directement,
-- par `useListeServeur`. Le filtre était donc en place partout SAUF à l'endroit du reproche.
--
-- POURQUOI UNE COLONNE ET NON UN FILTRE CÔTÉ CLIENT. La vue portait `compte_id` mais pas le
-- propriétaire du compte — `proprietaire_id` y désigne celui de la RECOMMANDATION, ce qui n'est pas
-- la même chose. Filtrer depuis le navigateur exigerait un `in()` sur la liste de mes comptes, soit
-- environ 300 identifiants par personne : au-delà d'à peu près 150, l'URL PostgREST devient trop
-- longue et la requête échoue entièrement. C'est le piège qui avait fait disparaître 677 sites du
-- périmètre de Marie Thonnard le 13/08/2026. Une colonne dans la vue, et le filtre tient en un `eq`.
--
-- `cp.proprietaire_id` VIENT DE LA JOINTURE QUI EXISTAIT DÉJÀ — `LEFT JOIN comptes cp` était là pour
-- le nom du compte. La vue ne coûte donc pas une jointure de plus.
--
-- Le reste de la définition est repris à l'identique de `pg_get_viewdef`, sans une virgule changée.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace view v_recommandations_liste as
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
    -- LA SEULE ADDITION, ET ELLE EST EN DERNIER PAR OBLIGATION. `create or replace view` ne sait
    -- qu'AJOUTER des colonnes à la fin : glissée au milieu, elle renomme la colonne qui occupait sa
    -- place et Postgres refuse — « cannot change name of view column date_creation to
    -- compte_proprietaire_id ». Les consommateurs lisent `*`, l'ordre leur est indifférent.
    --
    -- Nommée sans ambiguïté : `proprietaire_id` plus haut est celui de la RECOMMANDATION. Confondre
    -- les deux ferait filtrer sur la mauvaise personne.
    cp.proprietaire_id AS compte_proprietaire_id
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
