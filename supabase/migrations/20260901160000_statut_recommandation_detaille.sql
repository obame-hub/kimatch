-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE STATUT D'UNE RECOMMANDATION, LA CLÔTURE DÉPLIÉE PAR SA FINALITÉ
--
-- Michel, 01/09/2026 : « il aimerait voir les différents types de clôturé ».
--
-- L'écran /recommandations ne connaissait qu'un seul axe : `colonne_travail`, l'état de la DERNIÈRE
-- VERSION — en construction, disponible, en décision, en contractualisation, à réactiver, clôturée.
-- Le statut du dossier lui-même (Brouillon, Active, À réactiver, Clôturée) n'était nulle part, et la
-- finalité d'une clôture — acceptée, refusée, expirée — encore moins : elle existait en base sur
-- 1 592 dossiers clos et ne servait qu'en pied de carte.
--
-- ══ POURQUOI UNE COLONNE ET NON UN CALCUL DANS L'ÉCRAN ══
--
-- Le tableau kanban répartit ses colonnes EN BASE, une requête par colonne, avec `count: exact` et
-- la somme des marges. C'est ce qui lui permet d'annoncer « 860 » sur une colonne dont il n'a chargé
-- que cinquante cartes. Un statut recalculé dans le navigateur ne pourrait ni répartir, ni compter,
-- ni sommer : il ne saurait classer que les cartes déjà reçues.
--
-- ══ CE QUE LA COLONNE DIT ══
--
--     BROUILLON            le dossier n'est pas encore lancé
--     ACTIVE               le dossier est vivant
--     A_REACTIVER          le dossier dort, il faut le relancer
--     CLOTUREE_ACCEPTEE    clos sur un oui        (856 dossiers)
--     CLOTUREE_REFUSEE     clos sur un non        (311)
--     CLOTUREE_EXPIREE     clos par le temps      (402)
--     CLOTUREE             clos sans finalité renseignée (aucun — voir la note ci-dessous)
--
-- Les quatre premiers reprennent `etapes_recommandation.code` sans le réinterpréter. Les trois
-- suivants ne sont pas un nouveau vocabulaire : ce sont les valeurs réelles de
-- `recommandations.finalite_cloture`, préfixées pour qu'un seul champ porte l'axe entier.
--
-- ══ NOTE DE CORRECTION, écrite après vérification (01/09/2026) ══
--
-- J'avais annoncé 111 dossiers « clos sans finalité ». C'était faux, et l'erreur vient d'avoir lu
-- une colonne sans la croiser : `finalite_cloture` est bien nulle sur 111 lignes, mais AUCUNE de ces
-- 111 n'est close. Le croisement réel :
--
--     etape CLOTUREE    · finalité présente     1 569     ← tous les clos ont leur finalité
--     etape CLOTUREE    · finalité absente          0
--     etape ACTIVE      · finalité absente         28
--     etape ACTIVE      · finalité PRÉSENTE        23     ← des dossiers rouverts après clôture
--     etape A_REACTIVER · finalité absente         83
--
-- LA COLONNE « SANS FINALITÉ » RESTE, ET VIDE. Aucune contrainte n'oblige à renseigner la finalité en
-- clôturant (`recommandations_finalite_cloture_check` n'impose que le vocabulaire, pas la présence) :
-- le jour où un dossier sera clos sans elle, il aura une colonne où apparaître au lieu de disparaître
-- de l'écran. Une colonne vide qui garde la porte vaut mieux qu'un dossier introuvable.
--
-- LES 23 ROUVERTS SONT LA VRAIE TROUVAILLE de cette vérification. Une recommandation rouverte garde
-- la finalité de sa clôture précédente — c'est légitime, c'est son historique. Mais l'écran s'en
-- servait pour choisir son vocabulaire (« Clôturée le » si une finalité existe) et écrivait donc
-- « Clôturée le 31/10/2028 » sur des dossiers actifs. Corrigé dans `Recommandations.tsx` : le mot
-- suit l'ÉTAPE, jamais la finalité.
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
    r.marge_nette,
    r.montant,
    d.statut_version,
    d.resultat_version,
    d.numero_version,
    ctr.contrat_id AS contrat_en_signature_id,
    ctr.contrat_id IS NOT NULL AS en_contractualisation,
        CASE
            WHEN e.code = 'CLOTUREE'::text THEN 'CLOTUREE'::text
            WHEN ctr.contrat_id IS NOT NULL THEN 'EN_CONTRACTUALISATION'::text
            WHEN d.statut_version IS NULL THEN 'BROUILLON'::text
            WHEN d.statut_version = ANY (ARRAY['EN_CONSTRUCTION'::text, 'DISPONIBLE'::text, 'EN_DECISION'::text]) THEN d.statut_version
            ELSE 'A_REACTIVER'::text
        END AS colonne_travail,
    -- ── L'AXE « STATUT DU DOSSIER », clôture dépliée ──
        CASE
            WHEN e.code <> 'CLOTUREE'::text OR e.code IS NULL THEN e.code
            WHEN r.finalite_cloture IS NULL THEN 'CLOTUREE'::text
            ELSE 'CLOTUREE_'::text || r.finalite_cloture
        END AS statut_recommandation
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
          GROUP BY rs.recommandation_id) s ON s.recommandation_id = r.id
     LEFT JOIN LATERAL ( SELECT sv.code AS statut_version,
            ver.resultat AS resultat_version,
            ver.numero_version
           FROM versions_recommandation ver
             LEFT JOIN statuts_versions_recommandation sv ON sv.id = ver.statut_version_id
          WHERE ver.recommandation_id = r.id
          ORDER BY ver.version_actuelle DESC NULLS LAST, ver.numero_version DESC NULLS LAST
         LIMIT 1) d ON true
     LEFT JOIN LATERAL ( SELECT ct.id AS contrat_id
           FROM contrats ct
          WHERE ct.recommandation_id = r.id AND ct.actif AND ct.date_signature IS NULL
          ORDER BY ct.date_creation DESC
         LIMIT 1) ctr ON true;

-- ── Le garde-fou : aucun dossier ne doit sortir de la nomenclature ──
do $$
declare
  v_hors_liste integer;
  v_perdus integer;
begin
  select count(*) into v_hors_liste
    from public.v_recommandations_liste
   where statut_recommandation is not null
     and statut_recommandation not in ('BROUILLON', 'ACTIVE', 'A_REACTIVER',
                                       'CLOTUREE', 'CLOTUREE_ACCEPTEE', 'CLOTUREE_REFUSEE',
                                       'CLOTUREE_EXPIREE');
  if v_hors_liste > 0 then
    raise exception 'statut_recommandation hors nomenclature sur % lignes', v_hors_liste;
  end if;

  -- La somme des sept colonnes doit égaler le nombre de recommandations : une colonne oubliée
  -- ferait disparaître des dossiers de l'écran sans que rien ne le dise.
  select count(*) into v_perdus
    from public.v_recommandations_liste where statut_recommandation is null;
  raise notice 'Recommandations sans statut (étape non renseignée) : %', v_perdus;
end;
$$;

commit;
