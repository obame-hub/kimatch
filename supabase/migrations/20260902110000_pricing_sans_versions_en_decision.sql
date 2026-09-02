-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE PRICING NE MONTRE PLUS LES VERSIONS PARTIES EN DÉCISION
--
-- Naoëlle, 02/09/2026 : « dans la vue du pricing, il faudrait ne pas afficher les versions en
-- décision, car ça veut dire qu'Erwan a déjà traité et il va les voir ».
--
-- L'écran répond à « qu'est-ce que j'attends d'un fournisseur ». Une version en décision est
-- présentée au client : le travail de cotation est fini, et la laisser sur le tableau demande à
-- Erwan de relire chaque jour des lignes sur lesquelles il n'a plus rien à faire.
--
-- Mesuré avant d'écrire, sur les 51 consultations aujourd'hui affichées : 11 portent une version en
-- décision — 8 en « demande disponible », 2 en « demande envoyée », 1 en « demande acceptée ». Il en
-- reste 40 ouvertes et 2 refusées.
--
-- ══ UN BOOLÉEN DANS LA VUE, PAS UN FILTRE DANS L'ÉCRAN ══
--
-- `useKanbanServeur` n'applique que des ÉGALITÉS, et il les applique deux fois : une fois pour
-- lister les cartes de chaque colonne, une fois pour sommer les montants. Un `<>` écrit dans l'écran
-- aurait demandé d'étendre le crochet partagé pour un seul cas. La vue porte déjà deux booléens
-- construits pour exactement cette raison — `reco_en_cours` et `version_vivante` — et ce troisième
-- suit le même motif.
--
-- ══ CE QUE J'AI VU EN MESURANT, ET QUI MÉRITE UNE VÉRIFICATION ══
--
-- Deux des onze consultations retirées sont en « demande envoyée » : le fournisseur n'a pas encore
-- répondu, alors que la version est déjà chez le client. Ces deux demandes n'ont plus de destination
-- — la version qu'elles devaient chiffrer est partie sans elles. La règle de Naoëlle les retire de
-- l'écran, ce qui est juste pour Erwan ; reste à savoir s'il faut les annuler côté fournisseur. Ce
-- n'est pas une décision de migration.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace view public.v_pricing_consultations
with (security_invoker = true) as
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
            WHEN d.statut_code = 'DISPONIBLE'::text THEN 'DISPONIBLE'::text
            WHEN d.statut_code = 'REFUSEE'::text THEN 'REFUSEE'::text
            ELSE 'EN_ATTENTE'::text
        END AS colonne,
    cp.proprietaire_id AS compte_proprietaire_id,
    -- ── LA VERSION EST PARTIE CHEZ LE CLIENT ──
    -- Un booléen plutôt qu'un filtre d'inégalité dans l'écran : `reco_en_cours` et
    -- `version_vivante` juste au-dessus suivent déjà ce motif, et `useKanbanServeur` ne sait
    -- appliquer que des égalités — sur les colonnes ET sur la somme des montants.
    COALESCE(sv.code, ''::text) = 'EN_DECISION'::text AS version_en_decision
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
     LEFT JOIN offre_du_fournisseur od ON od.optimisation_fournisseur_id = ofr.id;

-- ── Le garde-fou ──
do $$
declare
  v_en_decision integer;
  v_restantes integer;
begin
  select count(*) filter (where version_en_decision),
         count(*) filter (where not version_en_decision)
    into v_en_decision, v_restantes
    from public.v_pricing_consultations
   where reco_en_cours and version_courante and version_vivante;

  -- Le booléen doit correspondre exactement au statut : s'il s'en écarte, l'écran cacherait ou
  -- montrerait les mauvaises lignes sans que rien ne le signale.
  if exists (
    select 1 from public.v_pricing_consultations
     where version_en_decision <> (coalesce(version_statut, '') = 'EN_DECISION')
  ) then
    raise exception 'version_en_decision ne suit pas version_statut';
  end if;

  raise notice 'Pricing : % consultations retirees (version en decision), % restantes',
    v_en_decision, v_restantes;
end;
$$;

commit;
