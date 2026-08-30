begin;

-- UN CONTRAT PORTAIT TROIS STATUTS, ET L'ECRAN MONTRAIT LE MAUVAIS.
--
-- Les trois ne font pas doublon, contrairement a ce que dit le constat DAT-02 :
--
--   statut_id            l'ancien. Il MELANGE les deux notions : « Actif / Termine / A venir »
--                        (1 565 contrats) et « A signer / Signe / Nouveau / En preparation »
--                        (35). C'est lui, le probleme.
--   statut_avancement_id ou en est la SIGNATURE : Signe 1 578, Envoye 17, Demande 2,
--                        Brouillon 1.
--   statut_vie_id        ou en est le CONTRAT : En cours 793, Expire 541, A venir 231.
--
-- Les 35 contrats sans statut de vie sont exactement ceux en phase de signature : ils n'ont pas
-- encore de vie. C'est coherent, il n'y a rien a inventer pour eux.
--
-- La vue expose desormais le statut de vie, CALCULE. Naoelle a tranche : on garde statut_vie.

create or replace view public.v_contrats_liste as
SELECT ct.id,
    ct.reference,
    ct.reference_fournisseur,
    ct.id_salesforce,
    ct.date_debut,
    ct.date_fin,
    ct.duree_mois,
    ct.compte_id,
    ct.site_id,
    ct.proprietaire_id,
    ct.date_creation,
    cp.nom AS compte_nom,
    s.nom AS site_nom,
    f.nom AS fournisseur_nom,
    te.code AS type_energie,
    sc.code AS statut,
    -- LE STATUT DE VIE, CALCULE ICI ET NON LU DANS LA COLONNE.
    --
    -- La regle est celle que porte deja `contrats.statut_vie_id` : verifiee le 30/08/2026 sur
    -- 1 565 contrats sur 1 565, sans un contre-exemple. Mais une valeur STOCKEE vieillit en
    -- silence : un contrat dont la date de fin est passee hier continue d'annoncer « En cours »
    -- jusqu'a ce que quelqu'un reecrive la ligne. Rien ne le reecrit.
    --
    -- Calculee a la lecture, elle ne peut pas deriver. La colonne reste, tenue a jour par un
    -- declencheur, pour qui veut filtrer dessus en base.
    CASE
        WHEN ct.date_debut IS NULL THEN NULL::text
        WHEN ct.date_debut > CURRENT_DATE THEN 'A_VENIR'::text
        WHEN ct.date_fin IS NOT NULL AND ct.date_fin < CURRENT_DATE THEN 'EXPIRE'::text
        ELSE 'EN_COURS'::text
    END AS statut_vie
   FROM contrats ct
     LEFT JOIN comptes cp ON cp.id = ct.compte_id
     LEFT JOIN sites s ON s.id = ct.site_id
     LEFT JOIN comptes f ON f.id = ct.fournisseur_compte_id
     LEFT JOIN types_energies te ON te.id = ct.type_energie_id
     LEFT JOIN statuts_contrats sc ON sc.id = ct.statut_id
;

commit;
