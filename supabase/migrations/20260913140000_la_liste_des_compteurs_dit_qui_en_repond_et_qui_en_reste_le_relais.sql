-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA LISTE DES COMPTEURS DIT QUI EN RÉPOND, ET QUI EN RESTE LE RELAIS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- La zone « Qui reste » de l'onglet Contacts a besoin, par compteur : le responsable, le relais de
-- conseil syndical, le libellé du lieu — et la nature de l'échéance, qui dit si le compteur est
-- sous contrat. Les trois premiers vivent sur `compteurs`, la quatrième ne vit que dans cette vue.
--
-- LES PRENDRE À DEUX ENDROITS COÛTERAIT DEUX REQUÊTES. La fiche compte vient d'être ramenée de onze
-- lectures à cinq (11/09/2026) ; on n'en rajoute pas une pour trois colonnes qui sont déjà dans la
-- table que la vue balaye. Trois colonnes de plus dans le `select`, zéro jointure de plus.
--
-- ══ POURQUOI `nature_echeance` EST LE BON DÉNOMINATEUR DE LA COUVERTURE ══
--
-- « Sous contrat » se compte ici comme PROUVEE, c'est-à-dire un contrat ACTIF dont la date de fin
-- n'est pas passée — la règle posée dans src/lib/echeance.ts le 24/08/2026 : « un contrat terminé
-- ne prouve rien sur l'échéance à venir ». Compter tous les liens `contrats_compteurs` donnerait
-- 1 454 compteurs au lieu de 1 033, et gonflerait le dénominateur de 40 % avec des contrats morts.
--
-- `create or replace` conserve les colonnes existantes dans leur ordre — les ajouts se font donc en
-- fin de liste, sans quoi PostgreSQL refuse le remplacement.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace view v_compteurs_liste as
 SELECT c.id,
    c.numero_point,
    c.site_id,
    c.actif,
    c.consommation_annuelle_mwh,
    c.localisation_site,
    c.date_echeance AS date_declaree,
    te.code AS type_energie_code,
    c.libelle_site AS site_nom,
    c.compte_id,
    p.date_preuve,
    COALESCE(p.date_preuve, c.date_echeance) AS date_echeance,
        CASE
            WHEN p.date_preuve IS NOT NULL THEN 'PROUVEE'::text
            WHEN c.date_echeance IS NOT NULL THEN 'ESTIMEE'::text
            ELSE 'ABSENTE'::text
        END AS nature_echeance,
    p.date_preuve IS NOT NULL AND c.date_echeance IS NOT NULL AND abs(p.date_preuve - c.date_echeance) > 31 AS contredit,
    c.responsable_contact_id,
    c.contact_conseil_syndical_id,
    c.adresse_site
   FROM compteurs c
     LEFT JOIN types_energies te ON te.id = c.type_energie_id
     LEFT JOIN LATERAL ( SELECT max(ct.date_fin) AS date_preuve
           FROM contrats_compteurs cc
             JOIN contrats ct ON ct.id = cc.contrat_id
          WHERE cc.compteur_id = c.id AND ct.actif AND ct.date_fin >= CURRENT_DATE) p ON true;

commit;

-- ══ CONTRÔLE APRÈS APPLICATION ══
--
--   select count(*) filter (where nature_echeance = 'PROUVEE')                              as sous_contrat,
--          count(*) filter (where nature_echeance = 'PROUVEE'
--                             and contact_conseil_syndical_id is not null)                  as couverts
--     from v_compteurs_liste where actif;
--   -- appliqué le 13/09/2026 : sous_contrat = 1033, couverts = 43 (4,2 % de couverture)
