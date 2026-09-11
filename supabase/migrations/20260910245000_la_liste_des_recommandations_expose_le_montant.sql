-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA LISTE DES RECOMMANDATIONS EXPOSE LE MONTANT QUI FAIT FOI
--
-- William, 10/09/2026 : « partout dans Kimatch où on marque le montant d'une recommandation, c'est
-- le champ marge_nette_coeff qui doit être pris en compte ».
--
-- La vue rendait déjà `marge_nette` et `montant`. La première est la marge AVANT le coefficient de
-- commission de l'intermédiaire, la seconde le chiffre d'affaires — ni l'une ni l'autre n'est ce
-- que l'on doit lire dans une liste de dossiers. `marge_nette_coeff` est le dernier étage de la
-- cascade, celui que Salesforce appelle « Montant » et celui qui a servi de référence à l'import
-- des 725 recommandations de 2025 et 2026.
--
-- ── LES DEUX AUTRES COLONNES RESTENT ──
--
-- Elles ne sont pas fausses, elles répondent à d'autres questions, et `RecommandationDetail` les
-- affiche toutes les trois dans sa cascade. Les retirer aurait cassé un écran pour corriger un
-- autre.
--
-- ── LE CORPS DE LA VUE EST CELUI DE NAOËLLE, MOT POUR MOT ──
--
-- Une vue se remplace en entier : il n'existe pas d'« ajouter une colonne ». Le corps est donc
-- repris tel que la base le rendait (`pg_get_viewdef`), la colonne ajoutée EN DERNIÈRE POSITION.
-- Réordonner ou reformuler aurait produit un diff illisible et, surtout, aurait risqué d'effacer
-- une subtilité — le `LEFT JOIN LATERAL … LIMIT 1` qui choisit la version actuelle, par exemple.
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
        CASE
            WHEN e.code <> 'CLOTUREE'::text OR e.code IS NULL THEN e.code
            WHEN r.finalite_cloture IS NULL THEN 'CLOTUREE'::text
            ELSE 'CLOTUREE_'::text || r.finalite_cloture
        END AS statut_recommandation,
    -- LA SEULE NOUVEAUTÉ DE CETTE MIGRATION, ajoutée en dernier pour ne rien décaler.
    r.marge_nette_coeff
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
     LEFT JOIN ( SELECT d_1.recommandation_id,
            jsonb_agg(jsonb_build_object('id', d_1.groupe_site_id, 'nom', d_1.libelle_site) ORDER BY d_1.libelle_site, d_1.groupe_site_id) AS sites
           FROM ( SELECT DISTINCT rc.recommandation_id,
                    cp_1.groupe_site_id,
                    cp_1.libelle_site
                   FROM recommandations_compteurs rc
                     JOIN compteurs cp_1 ON cp_1.id = rc.compteur_id) d_1
          GROUP BY d_1.recommandation_id) s ON s.recommandation_id = r.id
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

grant select on public.v_recommandations_liste to authenticated, anon, service_role;

-- ── Le garde-fou : la vue doit rendre la colonne, et le même nombre de lignes qu'avant ──
do $$
declare
  v_vue    integer;
  v_table  integer;
begin
  perform 1
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'v_recommandations_liste'
     and column_name  = 'marge_nette_coeff';
  if not found then
    raise exception 'La colonne marge_nette_coeff est absente de v_recommandations_liste';
  end if;

  select count(*) into v_vue   from public.v_recommandations_liste;
  select count(*) into v_table from public.recommandations;
  if v_vue <> v_table then
    raise exception 'La vue rend % lignes pour % recommandations — une jointure a changé de nature', v_vue, v_table;
  end if;
end;
$$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   select count(*) filter (where marge_nette_coeff is not null) as avec_montant,
--          round(sum(marge_nette_coeff)::numeric, 2)             as total
--     from public.v_recommandations_liste;
--
--   -- Le total doit être RIGOUREUSEMENT ÉGAL à celui de la table :
--   --   select round(sum(marge_nette_coeff)::numeric, 2) from public.recommandations;
-- ════════════════════════════════════════════════════════════════════════════════════════════════
