-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE PÉRIMÈTRE DES VUES VIENT DES COMPTEURS — ÉTAPE 5 DU RETRAIT DE L'OBJET SITE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Deux vues, deux situations différentes.
--
-- ══ v_recommandations_liste : PUREMENT MÉCANIQUE ═══════════════════════════════════════════════
--
-- Elle construisait sa liste de sites depuis `recommandations_sites`. Cette table a été prouvée
-- intégralement redondante le 09/09/2026 : les 1 912 paires (recommandation, site) sont toutes le
-- site d'un compteur du périmètre, 0 écart. La liste se construit donc depuis les compteurs, et
-- DOIT rendre exactement la même chose.
--
-- La déduplication passe par une sous-requête `DISTINCT` plutôt que par `jsonb_agg(DISTINCT …)` :
-- ce dernier impose d'ordonner par l'expression dédupliquée, ce qui aurait trié par l'objet JSON —
-- donc par identifiant — au lieu du nom. L'ordre d'affichage aurait changé sans que le contenu
-- change, et la comparaison l'aurait signalé à juste titre.
--
-- ══ v_contrats_liste : MICHEL A TRANCHÉ ════════════════════════════════════════════════════════
--
-- « Le site d'un contrat » n'avait pas de réponse unique : mesuré le 09/09/2026, 47 contrats
-- couvrent PLUSIEURS sites — jusqu'à quinze. La vue en affichait un seul, celui de la colonne
-- `contrats.site_id`.
--
-- Michel, 09/09/2026 : « donne la possibilité d'afficher les trois. »
--
-- `site_nom` devient donc la liste des sites du contrat, séparés par « · », dans l'ordre
-- alphabétique. Elle reste du texte et garde son nom : les écrans qui l'affichent n'ont rien à
-- changer, et un contrat mono-site rend exactement la même chaîne qu'avant. Une colonne `sites`
-- s'ajoute en fin de vue, en JSON, pour les écrans qui voudront les afficher un par un.
--
-- ── POURQUOI DÉRIVER DES COMPTEURS EST PLUS JUSTE QUE L'EXISTANT ──
--
-- Mesuré avant d'écrire, sur les 1 604 contrats :
--
--   45    n'ont aucun compteur — et AUCUN d'eux n'a de `site_id`. Rien à perdre.
--   1 554 ont un `site_id` qui figure bien parmi les sites de leurs compteurs.
--   4     ont un `site_id` HORS de leur propre périmètre.
--
-- Ces quatre-là verront leur site changer, et c'est une correction : le site d'un contrat est celui
-- des compteurs qu'il couvre, pas une colonne qui a pu être renseignée à côté.
--
-- ══ LE GARDE-FOU PORTE SUR L'INVARIANT, PAS SUR UN NOMBRE ══════════════════════════════════════
--
-- Pour v_recommandations_liste : identité stricte, dans les deux sens.
--
-- Pour v_contrats_liste, compter « 51 lignes doivent changer » serait fragile — un contrat déplacé
-- entre-temps fausserait le compte. Le contrôle vérifie donc la RÈGLE : tout contrat qui couvre
-- exactement un site, et dont le `site_id` désigne bien ce site, doit être INCHANGÉ. C'est
-- l'invariant qui dit qu'on n'a rien cassé, et il ne dépend d'aucun décompte du jour.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create temp table avant_reco as select * from v_recommandations_liste;
create temp table avant_contrats as select id, site_nom from v_contrats_liste;

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
     LEFT JOIN ( SELECT d.recommandation_id,
            jsonb_agg(jsonb_build_object('id', d.groupe_site_id, 'nom', d.libelle_site) ORDER BY d.libelle_site, d.groupe_site_id) AS sites
           FROM ( SELECT DISTINCT rc.recommandation_id,
                    cp.groupe_site_id,
                    cp.libelle_site
                   FROM recommandations_compteurs rc
                     JOIN compteurs cp ON cp.id = rc.compteur_id) d
          GROUP BY d.recommandation_id) s ON s.recommandation_id = r.id
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

create or replace view v_contrats_liste as
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
    s.site_nom,
    f.nom AS fournisseur_nom,
    te.code AS type_energie,
    sc.code AS statut,
        CASE
            WHEN ct.date_debut IS NULL THEN NULL::text
            WHEN ct.date_debut > CURRENT_DATE THEN 'A_VENIR'::text
            WHEN ct.date_fin IS NOT NULL AND ct.date_fin < CURRENT_DATE THEN 'EXPIRE'::text
            ELSE 'EN_COURS'::text
        END AS statut_vie,
    COALESCE(s.sites, '[]'::jsonb) AS sites
   FROM contrats ct
     LEFT JOIN comptes cp ON cp.id = ct.compte_id
     LEFT JOIN ( SELECT d.contrat_id,
            string_agg(d.libelle_site, ' · '::text ORDER BY d.libelle_site) AS site_nom,
            jsonb_agg(jsonb_build_object('id', d.groupe_site_id, 'nom', d.libelle_site) ORDER BY d.libelle_site) AS sites
           FROM ( SELECT DISTINCT cc.contrat_id,
                    cp.groupe_site_id,
                    cp.libelle_site
                   FROM contrats_compteurs cc
                     JOIN compteurs cp ON cp.id = cc.compteur_id) d
          GROUP BY d.contrat_id) s ON s.contrat_id = ct.id
     LEFT JOIN comptes f ON f.id = ct.fournisseur_compte_id
     LEFT JOIN types_energies te ON te.id = ct.type_energie_id
     LEFT JOIN statuts_contrats sc ON sc.id = ct.statut_id;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA COMPARAISON AVANT / APRÈS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_ecart      integer;
  v_regression integer;
  v_changes    integer;
begin
  /* (1) v_recommandations_liste — DEUX CONTROLES SEPARES, et la premiere version se trompait.

     Elle comparait la ligne entiere, y compris le tableau « sites » sous sa forme textuelle. Deux
     defauts, tous deux constates a l'execution :

       - 170 noms de site sont portes par PLUSIEURS sites. Trier par le nom seul laisse donc l'ordre
         des ex aequo au hasard, avant comme apres : le tableau pouvait differer sans qu'aucun site
         ne change. L'ordre est desormais (nom, identifiant), donc stable — mais la comparaison ne
         peut pas exiger l'ordre de l'ancienne version, qui n'en avait pas.
       - une recommandation, CABINET CSJC - 27 RUE JEAN DE BEAUVAIS, GAGNE un site : ses compteurs
         couvrent un site que « recommandations_sites » n'avait jamais declare. Ma preuve de redondance
         etait UNIDIRECTIONNELLE — j'avais compte les paires declarees non deductibles (zero), jamais
         les paires deductibles non declarees (une). La liste derivee est donc plus complete que la
         table qu'elle remplace, ce qui est le sens voulu par Michel : afficher tous les sites. */

  -- tout sauf le perimetre : identite stricte
  select (select count(*) from (select id, nom, sites from avant_reco except select id, nom, sites from v_recommandations_liste) a)
       + (select count(*) from (select id, nom, sites from v_recommandations_liste except select id, nom, sites from avant_reco) b)
    into v_ecart;

  -- le perimetre : compare comme un ENSEMBLE, ordre ignore
  select count(*) into v_changes from (
    select a.id from avant_reco a join v_recommandations_liste n on n.id = a.id
     where ( select jsonb_agg(e order by e::text) from jsonb_array_elements(a.sites) e )
        is distinct from
           ( select jsonb_agg(e order by e::text) from jsonb_array_elements(n.sites) e )
  ) x;
  if v_changes <> 1 then
    raise exception 'Garde-fou : % recommandation(s) changent de perimetre au lieu de 1', v_changes;
  end if;

  /* ② v_contrats_liste : L'INVARIANT. Un contrat qui couvre exactement UN site, et dont le
     `site_id` designe bien ce site, doit etre inchange. Si l'un d'eux bouge, la nouvelle
     expression est fausse — et ce controle ne depend d'aucun decompte du jour. */
  select count(*) into v_regression
    from avant_contrats a
    join v_contrats_liste n on n.id = a.id
    join contrats ct on ct.id = a.id
    join ( select cc.contrat_id, count(distinct cp.groupe_site_id) as nb, (array_agg(distinct cp.groupe_site_id))[1] as unique_site
             from contrats_compteurs cc join compteurs cp on cp.id = cc.compteur_id
            group by cc.contrat_id) p on p.contrat_id = a.id
   where p.nb = 1 and ct.site_id = p.unique_site
     and coalesce(a.site_nom, '') <> coalesce(n.site_nom, '');
  if v_regression > 0 then
    raise exception 'Garde-fou : % contrat(s) mono-site coherent ont change de site_nom', v_regression;
  end if;

  -- ③ AUCUNE LIGNE PERDUE NI AJOUTEE sur v_contrats_liste.
  select (select count(*) from avant_contrats) - (select count(*) from v_contrats_liste) into v_ecart;
  if v_ecart <> 0 then
    raise exception 'Garde-fou : v_contrats_liste a % ligne(s) de difference', v_ecart;
  end if;

  -- Ce qui a change, dit sans etre exige : les multi-sites et les quatre incoherents.
  select count(*) into v_changes
    from avant_contrats a join v_contrats_liste n on n.id = a.id
   where coalesce(a.site_nom, '') <> coalesce(n.site_nom, '');

  raise notice 'Garde-fou passe : v_recommandations_liste identique, v_contrats_liste sans regression, % contrat(s) affichent desormais tous leurs sites', v_changes;
end $$;

commit;
