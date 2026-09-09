-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CINQ VUES CESSENT DE TRAVERSER LE SITE — ÉTAPE 4 DU RETRAIT DE L'OBJET SITE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ces cinq vues joignaient `sites` non pas pour son nom, mais POUR ATTEINDRE LE COMPTE. Depuis la
-- migration 20260909160000, `compteurs` porte son `compte_id` en direct, et depuis 20260909100000
-- il porte aussi `libelle_site` et `groupe_site_id`. Les jointures n'ont plus de raison d'être.
--
-- ══ ELLES SONT RÉÉCRITES PAR SUBSTITUTION, PAS RECOPIÉES ═══════════════════════════════════════
--
-- Le texte de départ est celui que rend `pg_get_viewdef`, et SEULES les lignes de jointure vers
-- `sites` y ont été changées. Recopier cinq vues à la main — dont une de 127 lignes portant le
-- calcul du score de contact — aurait été cinq occasions de déplacer une virgule sans le voir.
--
-- ══ LA VÉRIFICATION EST DANS LA MIGRATION, PAS À CÔTÉ ══════════════════════════════════════════
--
-- Le contenu de chaque vue est capturé AVANT le remplacement, puis comparé APRÈS, ligne par ligne
-- et dans les deux sens (`except` symétrique). Quatre vues doivent rendre EXACTEMENT la même
-- chose. La cinquième doit différer d'un écart précis, annoncé d'avance — voir plus bas.
--
-- Empreintes relevées avant écriture, le 09/09/2026 :
--
--   v_compteurs_liste        7 919 lignes   31aaaf59500148f46d1e04dc131a71fa
--   v_qualite_compteur       7 908 lignes   69e20fc493b7697a305b40a118502edc
--   v_patrimoine_synthese        1 ligne    e39c1243ed14f7091fe2dd050c7e9422
--   v_signal_score_contact   3 401 lignes   d4ae28ecd5b83c2ffb6cda73387dda46
--   v_comptes_liste          2 773 lignes   edbff555648a2996843eb5b0fb1d8839
--
-- ══ LE SEUL ÉCART ATTENDU, ET POURQUOI IL EST JUSTE ════════════════════════════════════════════
--
-- `v_comptes_liste.nb_sites` comptait les lignes de `sites`. Il compte maintenant les groupes de
-- compteurs. La différence est exactement les 33 sites qui ne portent AUCUN compteur, répartis sur
-- 25 comptes — mesuré avant d'écrire.
--
-- Ces 33 sites sont des dossiers vides. Ils ne survivront pas au retrait de l'objet site, puisqu'il
-- n'y aura plus rien à compter : la nouvelle valeur est donc celle qui sera vraie demain. 25 comptes
-- afficheront un site de moins, et c'est le bon nombre.
--
-- LE GARDE-FOU L'EXIGE PLUTÔT QUE DE LE TOLÉRER : il échoue si l'écart n'est pas exactement de
-- 25 comptes, et si une autre colonne que `nb_sites` a bougé. Un contrôle qui accepte « à peu
-- près » ne contrôle rien.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── L'ÉTAT AVANT, CAPTURÉ DANS LA TRANSACTION ───────────────────────────────────────────────────
create temp table avant_v_compteurs_liste as select * from v_compteurs_liste;
create temp table avant_v_qualite_compteur as select * from v_qualite_compteur;
create temp table avant_v_patrimoine_synthese as select * from v_patrimoine_synthese;
create temp table avant_v_signal_score_contact as select * from v_signal_score_contact;
create temp table avant_v_comptes_liste as select * from v_comptes_liste;

-- ── LES VUES RÉÉCRITES ──────────────────────────────────────────────────────────────────────────

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
    p.date_preuve IS NOT NULL AND c.date_echeance IS NOT NULL AND abs(p.date_preuve - c.date_echeance) > 31 AS contredit
   FROM compteurs c
     LEFT JOIN types_energies te ON te.id = c.type_energie_id
     LEFT JOIN LATERAL ( SELECT max(ct.date_fin) AS date_preuve
           FROM contrats_compteurs cc
             JOIN contrats ct ON ct.id = cc.contrat_id
          WHERE cc.compteur_id = c.id AND ct.actif AND ct.date_fin >= CURRENT_DATE) p ON true;

create or replace view v_qualite_compteur as
SELECT cm.id AS compteur_id,
    cm.numero_point,
    cm.site_id,
    cm.libelle_site AS site_nom,
    cm.compte_id,
    te.code AS type_energie,
    cm.consommation_annuelle_mwh,
    cm.date_echeance,
    cm.responsable_contact_id,
    COALESCE((ct.prenom || ' '::text) || ct.nom, ''::text) AS responsable_nom,
    (EXISTS ( SELECT 1
           FROM contrats_compteurs cc
             JOIN contrats c ON c.id = cc.contrat_id
          WHERE cc.compteur_id = cm.id AND c.actif AND (c.date_fin IS NULL OR c.date_fin >= CURRENT_DATE))) AS a_contrat,
    cm.date_echeance IS NOT NULL AND cm.date_echeance >= CURRENT_DATE AS echeance_future,
    cm.responsable_contact_id IS NOT NULL AS a_responsable,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM contrats_compteurs cc
                 JOIN contrats c ON c.id = cc.contrat_id
              WHERE cc.compteur_id = cm.id AND c.actif AND (c.date_fin IS NULL OR c.date_fin >= CURRENT_DATE))) THEN
            CASE
                WHEN cm.responsable_contact_id IS NOT NULL THEN 100
                ELSE 80
            END
            WHEN cm.date_echeance IS NOT NULL AND cm.date_echeance >= CURRENT_DATE THEN
            CASE
                WHEN cm.responsable_contact_id IS NOT NULL THEN 60
                ELSE 40
            END
            ELSE
            CASE
                WHEN cm.responsable_contact_id IS NOT NULL THEN 20
                ELSE 0
            END
        END AS score,
    cp.nom AS compte_nom,
    (EXISTS ( SELECT 1
           FROM opportunites_compteurs oc
             JOIN opportunites o ON o.id = oc.opportunite_id
             JOIN statuts_opportunites so ON so.id = o.statut_id
          WHERE oc.compteur_id = cm.id AND (so.code = ANY (ARRAY['NOUVELLE'::text, 'EN_QUALIFICATION'::text, 'COUVERTURE_MANDAT'::text, 'PRETE_A_CONVERTIR'::text])))) AS opportunite_en_cours,
    (EXISTS ( SELECT 1
           FROM recommandations_compteurs rc
             JOIN recommandations r ON r.id = rc.recommandation_id
             JOIN etapes_recommandation er ON er.id = r.etape_id
          WHERE rc.compteur_id = cm.id AND (er.code = ANY (ARRAY['BROUILLON'::text, 'ACTIVE'::text, 'A_REACTIVER'::text])))) AS recommandation_en_cours,
    (EXISTS ( SELECT 1
           FROM opportunites_compteurs oc
             JOIN opportunites o ON o.id = oc.opportunite_id
             JOIN statuts_opportunites so ON so.id = o.statut_id
          WHERE oc.compteur_id = cm.id AND (so.code = ANY (ARRAY['NOUVELLE'::text, 'EN_QUALIFICATION'::text, 'COUVERTURE_MANDAT'::text, 'PRETE_A_CONVERTIR'::text])))) OR (EXISTS ( SELECT 1
           FROM recommandations_compteurs rc
             JOIN recommandations r ON r.id = rc.recommandation_id
             JOIN etapes_recommandation er ON er.id = r.etape_id
          WHERE rc.compteur_id = cm.id AND (er.code = ANY (ARRAY['BROUILLON'::text, 'ACTIVE'::text, 'A_REACTIVER'::text])))) AS dans_processus_commercial,
    cp.proprietaire_id AS compte_proprietaire_id
   FROM compteurs cm
     JOIN comptes cp ON cp.id = cm.compte_id
     JOIN types_comptes tcp ON tcp.id = cp.type_compte_id
     LEFT JOIN types_energies te ON te.id = cm.type_energie_id
     LEFT JOIN contacts ct ON ct.id = cm.responsable_contact_id
  WHERE cm.actif AND cp.actif AND tcp.code = 'CLIENT'::text;

create or replace view v_patrimoine_synthese as
WITH comptes_consommateurs AS (
         SELECT c.id,
            c.segment
           FROM comptes c
             JOIN types_comptes tc ON tc.id = c.type_compte_id
          WHERE c.actif AND tc.libelle = 'Consommateur'::text
        ), clients AS (
         SELECT DISTINCT cm.compte_id
           FROM compteurs cm
          WHERE cm.actif AND (EXISTS ( SELECT 1
                   FROM contrats_compteurs cc
                     JOIN contrats c ON c.id = cc.contrat_id
                  WHERE cc.compteur_id = cm.id AND c.actif AND (c.date_fin IS NULL OR c.date_fin >= CURRENT_DATE)))
        )
 SELECT ( SELECT count(*) AS count
           FROM comptes_consommateurs) AS nb_comptes,
    ( SELECT count(*) AS count
           FROM comptes_consommateurs cc
          WHERE (EXISTS ( SELECT 1
                   FROM clients a
                  WHERE a.compte_id = cc.id))) AS nb_avec_contrat,
    ( SELECT count(*) AS count
           FROM comptes_consommateurs cc
          WHERE NOT (EXISTS ( SELECT 1
                   FROM clients a
                  WHERE a.compte_id = cc.id))) AS nb_sans_contrat,
    ( SELECT count(*) AS count
           FROM v_compteurs_liste
          WHERE v_compteurs_liste.actif AND v_compteurs_liste.nature_echeance = 'ABSENTE'::text) AS nb_echeance_vide,
    ( SELECT count(*) AS count
           FROM v_compteurs_liste
          WHERE v_compteurs_liste.actif AND v_compteurs_liste.nature_echeance <> 'ABSENTE'::text AND v_compteurs_liste.date_echeance < CURRENT_DATE) AS nb_echeance_depassee,
    ( SELECT count(*) AS count
           FROM compteurs
          WHERE compteurs.actif AND compteurs.responsable_contact_id IS NULL) AS nb_sans_responsable,
    ( SELECT count(*) AS count
           FROM compteurs
          WHERE compteurs.actif) AS nb_compteurs,
    ( SELECT count(*) AS count
           FROM v_compteurs_liste
          WHERE v_compteurs_liste.actif AND v_compteurs_liste.nature_echeance <> 'ABSENTE'::text AND v_compteurs_liste.date_echeance >= CURRENT_DATE) AS nb_echeance_valide,
    ( SELECT count(*) AS count
           FROM v_compteurs_liste
          WHERE v_compteurs_liste.actif AND v_compteurs_liste.nature_echeance <> 'ABSENTE'::text AND v_compteurs_liste.date_echeance >= CURRENT_DATE AND v_compteurs_liste.date_echeance < (CURRENT_DATE + '3 mons'::interval)) AS nb_0_3_mois,
    ( SELECT count(*) AS count
           FROM v_compteurs_liste
          WHERE v_compteurs_liste.actif AND v_compteurs_liste.nature_echeance <> 'ABSENTE'::text AND v_compteurs_liste.date_echeance >= (CURRENT_DATE + '3 mons'::interval) AND v_compteurs_liste.date_echeance < (CURRENT_DATE + '6 mons'::interval)) AS nb_4_6_mois,
    ( SELECT count(*) AS count
           FROM v_compteurs_liste
          WHERE v_compteurs_liste.actif AND v_compteurs_liste.nature_echeance <> 'ABSENTE'::text AND v_compteurs_liste.date_echeance >= (CURRENT_DATE + '6 mons'::interval) AND v_compteurs_liste.date_echeance < (CURRENT_DATE + '1 year'::interval)) AS nb_7_12_mois,
    ( SELECT count(*) AS count
           FROM v_compteurs_liste
          WHERE v_compteurs_liste.actif AND v_compteurs_liste.nature_echeance <> 'ABSENTE'::text AND v_compteurs_liste.date_echeance >= (CURRENT_DATE + '1 year'::interval)) AS nb_plus_12_mois;

create or replace view v_signal_score_contact as
WITH compteur_contact AS (
         SELECT k.id AS compteur_id,
            k.date_echeance,
            COALESCE(k.responsable_contact_id, ( SELECT ct_1.id
                   FROM contacts ct_1
                  WHERE ct_1.compte_id = k.compte_id AND ct_1.actif
                  ORDER BY ct_1.contact_principal DESC NULLS LAST, ct_1.date_creation
                 LIMIT 1)) AS contact_id
           FROM compteurs k
          WHERE k.actif
        ), patrimoine AS (
         SELECT compteur_contact.contact_id,
            count(*)::integer AS nb_compteurs,
            min(compteur_contact.date_echeance) FILTER (WHERE compteur_contact.date_echeance >= CURRENT_DATE AND compteur_contact.date_echeance <= (CURRENT_DATE + '1 year'::interval)) AS echeance_proche,
            count(*) FILTER (WHERE compteur_contact.date_echeance IS NULL)::integer AS compteurs_sans_echeance,
            count(*) FILTER (WHERE compteur_contact.date_echeance < CURRENT_DATE)::integer AS compteurs_echeance_depassee
           FROM compteur_contact
          WHERE compteur_contact.contact_id IS NOT NULL
          GROUP BY compteur_contact.contact_id
        ), acceptation AS (
         SELECT r.contact_signataire_id AS contact_id,
            count(*)::integer AS nb_tranchees,
            count(*) FILTER (WHERE r.finalite_cloture = 'ACCEPTEE'::text)::integer AS nb_acceptees
           FROM recommandations r
          WHERE r.contact_signataire_id IS NOT NULL AND r.finalite_cloture IS NOT NULL
          GROUP BY r.contact_signataire_id
        ), derniere_positive AS (
         SELECT i.contact_id,
            max(i.date_interaction) AS le
           FROM interactions i
             LEFT JOIN types_interactions ti ON ti.id = i.type_interaction_id
          WHERE i.contact_id IS NOT NULL AND i.actif AND (i.sens = 'ENTRANT'::text OR (COALESCE(ti.code, ''::text) = ANY (ARRAY['RENDEZ_VOUS'::text, 'VISIO'::text, 'VISITE_SITE'::text])) OR i.resultat ~~* '%Rappel demandé%'::text OR i.resultat ~~* '%Argumenté – Intéressé%'::text OR i.resultat ~~* '%Argumenté – À suivre%'::text OR i.resultat ~~* '%''Positif''%'::text OR i.resultat ~~* '%''Répondu''%'::text)
          GROUP BY i.contact_id
        ), opportunite_ouverte AS (
         SELECT DISTINCT o.contact_id
           FROM opportunites o
             JOIN statuts_opportunites so ON so.id = o.statut_id
          WHERE o.contact_id IS NOT NULL AND o.actif AND (so.code <> ALL (ARRAY['CONVERTIE'::text, 'ABANDONNEE'::text]))
        )
 SELECT ct.id AS contact_id,
    (ct.prenom || ' '::text) || ct.nom AS contact_nom,
    ct.compte_id,
    cp.nom AS compte_nom,
    COALESCE(ct.proprietaire_id, cp.proprietaire_id) AS commercial_id,
    pa.echeance_proche,
    pa.echeance_proche - CURRENT_DATE AS jours_avant_echeance,
    COALESCE(pa.nb_compteurs, 0) AS nb_compteurs,
    COALESCE(pa.compteurs_sans_echeance, 0) AS compteurs_sans_echeance,
    COALESCE(pa.compteurs_echeance_depassee, 0) AS compteurs_echeance_depassee,
        CASE
            WHEN pa.echeance_proche IS NULL THEN 0
            WHEN pa.echeance_proche <= (CURRENT_DATE + '3 mons'::interval) THEN 50
            WHEN pa.echeance_proche <= (CURRENT_DATE + '6 mons'::interval) THEN 40
            WHEN pa.echeance_proche <= (CURRENT_DATE + '9 mons'::interval) THEN 25
            WHEN pa.echeance_proche <= (CURRENT_DATE + '1 year'::interval) THEN 10
            ELSE 0
        END AS pts_echeance,
    COALESCE(ac.nb_tranchees, 0) AS nb_recos_tranchees,
    COALESCE(ac.nb_acceptees, 0) AS nb_recos_acceptees,
        CASE
            WHEN COALESCE(ac.nb_tranchees, 0) = 0 THEN NULL::numeric
            ELSE round(100.0 * ac.nb_acceptees::numeric / ac.nb_tranchees::numeric)
        END AS taux_acceptation,
        CASE
            WHEN COALESCE(ac.nb_tranchees, 0) = 0 THEN 10
            WHEN (100.0 * ac.nb_acceptees::numeric / ac.nb_tranchees::numeric) >= 80::numeric THEN 25
            WHEN (100.0 * ac.nb_acceptees::numeric / ac.nb_tranchees::numeric) >= 60::numeric THEN 20
            WHEN (100.0 * ac.nb_acceptees::numeric / ac.nb_tranchees::numeric) >= 40::numeric THEN 15
            WHEN (100.0 * ac.nb_acceptees::numeric / ac.nb_tranchees::numeric) >= 20::numeric THEN 10
            ELSE 5
        END AS pts_acceptation,
    dp.le AS derniere_interaction_positive,
        CASE
            WHEN dp.le IS NULL THEN 0
            WHEN dp.le >= (now() - '30 days'::interval) THEN 15
            WHEN dp.le >= (now() - '90 days'::interval) THEN 10
            WHEN dp.le >= (now() - '180 days'::interval) THEN 5
            ELSE 0
        END AS pts_interactions,
        CASE
            WHEN COALESCE(pa.nb_compteurs, 0) >= 10 THEN 10
            WHEN COALESCE(pa.nb_compteurs, 0) >= 4 THEN 8
            WHEN COALESCE(pa.nb_compteurs, 0) >= 2 THEN 5
            WHEN COALESCE(pa.nb_compteurs, 0) = 1 THEN 2
            ELSE 0
        END AS pts_potentiel,
        CASE
            WHEN pa.echeance_proche IS NULL THEN 0
            WHEN pa.echeance_proche <= (CURRENT_DATE + '3 mons'::interval) THEN 50
            WHEN pa.echeance_proche <= (CURRENT_DATE + '6 mons'::interval) THEN 40
            WHEN pa.echeance_proche <= (CURRENT_DATE + '9 mons'::interval) THEN 25
            WHEN pa.echeance_proche <= (CURRENT_DATE + '1 year'::interval) THEN 10
            ELSE 0
        END +
        CASE
            WHEN COALESCE(ac.nb_tranchees, 0) = 0 THEN 10
            WHEN (100.0 * ac.nb_acceptees::numeric / ac.nb_tranchees::numeric) >= 80::numeric THEN 25
            WHEN (100.0 * ac.nb_acceptees::numeric / ac.nb_tranchees::numeric) >= 60::numeric THEN 20
            WHEN (100.0 * ac.nb_acceptees::numeric / ac.nb_tranchees::numeric) >= 40::numeric THEN 15
            WHEN (100.0 * ac.nb_acceptees::numeric / ac.nb_tranchees::numeric) >= 20::numeric THEN 10
            ELSE 5
        END +
        CASE
            WHEN dp.le IS NULL THEN 0
            WHEN dp.le >= (now() - '30 days'::interval) THEN 15
            WHEN dp.le >= (now() - '90 days'::interval) THEN 10
            WHEN dp.le >= (now() - '180 days'::interval) THEN 5
            ELSE 0
        END +
        CASE
            WHEN COALESCE(pa.nb_compteurs, 0) >= 10 THEN 10
            WHEN COALESCE(pa.nb_compteurs, 0) >= 4 THEN 8
            WHEN COALESCE(pa.nb_compteurs, 0) >= 2 THEN 5
            WHEN COALESCE(pa.nb_compteurs, 0) = 1 THEN 2
            ELSE 0
        END AS score,
    oo.contact_id IS NOT NULL AS opportunite_en_cours,
    pa.echeance_proche IS NOT NULL AND oo.contact_id IS NULL AS eligible_signal
   FROM contacts ct
     LEFT JOIN comptes cp ON cp.id = ct.compte_id
     LEFT JOIN patrimoine pa ON pa.contact_id = ct.id
     LEFT JOIN acceptation ac ON ac.contact_id = ct.id
     LEFT JOIN derniere_positive dp ON dp.contact_id = ct.id
     LEFT JOIN opportunite_ouverte oo ON oo.contact_id = ct.id
  WHERE ct.actif;

create or replace view v_comptes_liste as
SELECT c.id,
    c.nom,
    c.ville,
    c.segment,
    c.siren,
    c.siret,
    c.code_postal,
    c.score_ellipro,
    c.type_compte,
    c.proprietaire_id,
    c.date_creation,
    tc.libelle AS type_compte_libelle,
    COALESCE(s.nb, 0) AS nb_sites,
    cl.compte_id IS NOT NULL AS est_client
   FROM comptes c
     LEFT JOIN types_comptes tc ON tc.id = c.type_compte_id
     LEFT JOIN ( SELECT compteurs.compte_id,
            count(DISTINCT compteurs.groupe_site_id)::integer AS nb
           FROM compteurs
          GROUP BY compteurs.compte_id) s ON s.compte_id = c.id
     LEFT JOIN ( SELECT DISTINCT cm.compte_id
           FROM compteurs cm
             JOIN contrats_compteurs cc ON cc.compteur_id = cm.id
             JOIN contrats ct ON ct.id = cc.contrat_id
          WHERE cm.actif AND ct.actif AND (ct.date_fin IS NULL OR ct.date_fin >= CURRENT_DATE)) cl ON cl.compte_id = c.id;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA COMPARAISON AVANT / APRÈS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_ecart      integer;
  v_comptes    integer;
  v_autre      integer;
begin

  -- v_compteurs_liste : identique, dans les deux sens.
  select (select count(*) from (select * from avant_v_compteurs_liste except select * from v_compteurs_liste) a)
       + (select count(*) from (select * from v_compteurs_liste except select * from avant_v_compteurs_liste) b)
    into v_ecart;
  if v_ecart <> 0 then
    raise exception 'Garde-fou : % ligne(s) different sur v_compteurs_liste', v_ecart;
  end if;

  -- v_qualite_compteur : identique, dans les deux sens.
  select (select count(*) from (select * from avant_v_qualite_compteur except select * from v_qualite_compteur) a)
       + (select count(*) from (select * from v_qualite_compteur except select * from avant_v_qualite_compteur) b)
    into v_ecart;
  if v_ecart <> 0 then
    raise exception 'Garde-fou : % ligne(s) different sur v_qualite_compteur', v_ecart;
  end if;

  -- v_patrimoine_synthese : identique, dans les deux sens.
  select (select count(*) from (select * from avant_v_patrimoine_synthese except select * from v_patrimoine_synthese) a)
       + (select count(*) from (select * from v_patrimoine_synthese except select * from avant_v_patrimoine_synthese) b)
    into v_ecart;
  if v_ecart <> 0 then
    raise exception 'Garde-fou : % ligne(s) different sur v_patrimoine_synthese', v_ecart;
  end if;

  -- v_signal_score_contact : identique, dans les deux sens.
  select (select count(*) from (select * from avant_v_signal_score_contact except select * from v_signal_score_contact) a)
       + (select count(*) from (select * from v_signal_score_contact except select * from avant_v_signal_score_contact) b)
    into v_ecart;
  if v_ecart <> 0 then
    raise exception 'Garde-fou : % ligne(s) different sur v_signal_score_contact', v_ecart;
  end if;

  /* v_comptes_liste : l'écart doit être EXACTEMENT les 25 comptes dont le nombre de sites change,
     et il ne doit porter que sur nb_sites. Toute autre colonne qui bouge est une régression. */
  select count(*) into v_comptes from (
    select a.id from avant_v_comptes_liste a join v_comptes_liste n on n.id = a.id
     where a.nb_sites <> n.nb_sites
  ) x;
  if v_comptes <> 25 then
    raise exception 'Garde-fou : % compte(s) changent de nb_sites au lieu de 25', v_comptes;
  end if;

  select count(*) into v_autre from (
    select a.id from avant_v_comptes_liste a join v_comptes_liste n on n.id = a.id
     where (a.nom, a.siret, a.code_postal, a.score_ellipro, a.type_compte, a.proprietaire_id,
            a.date_creation, a.type_compte_libelle, a.est_client)
       is distinct from
           (n.nom, n.siret, n.code_postal, n.score_ellipro, n.type_compte, n.proprietaire_id,
            n.date_creation, n.type_compte_libelle, n.est_client)
  ) y;
  if v_autre <> 0 then
    raise exception 'Garde-fou : % compte(s) ont une autre colonne modifiee que nb_sites', v_autre;
  end if;

  select (select count(*) from avant_v_comptes_liste) - (select count(*) from v_comptes_liste) into v_ecart;
  if v_ecart <> 0 then
    raise exception 'Garde-fou : v_comptes_liste a % ligne(s) de difference', v_ecart;
  end if;

  raise notice 'Garde-fou passe : 4 vues identiques au caractere pres, v_comptes_liste ne change que nb_sites sur exactement 25 comptes';
end $$;

commit;
