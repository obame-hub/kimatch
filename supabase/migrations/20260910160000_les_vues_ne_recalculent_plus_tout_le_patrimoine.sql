-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- TROIS VUES CESSENT DE RECALCULER TOUT LE PATRIMOINE POUR RENDRE CINQUANTE LIGNES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE QUE J'AI CASSÉ CE MATIN, ET COMMENT ÇA S'EST VU ═════════════════════════════════════════
--
-- Naoëlle, 09/09/2026 : « on a encore des problèmes de chargement. » Relevé pendant la panne, dans
-- `pg_stat_activity` : deux connexions PostgREST en `idle in transaction (aborted)`, toutes deux
-- sur `v_suivis_contrats_liste`, après onze secondes de requête. Chronométrage direct :
--
--   v_suivis_contrats_liste  LIMIT 50   ->   5 500 ms
--   v_contrats_liste         LIMIT 50   ->  10 109 ms
--   v_documents_liste        LIMIT 50   ->  11 597 ms
--   v_compteurs_liste        LIMIT 50   ->     515 ms   (non touchée ce matin)
--   v_groupes_de_site        LIMIT 50   ->     134 ms
--
-- Les trois lentes sont exactement les trois que j'ai réécrites ce matin (migrations 20260909200000
-- et 20260909220000) pour qu'elles cessent de joindre la table `sites`.
--
-- ══ LA CAUSE, LUE DANS LE PLAN ET NON DEVINÉE ══════════════════════════════════════════════════
--
-- `explain (analyze, buffers) select * from v_contrats_liste limit 50` :
--
--   Seq Scan on compteurs  (rows=7920)  actual time=0.105..1588.378   Buffers: shared hit=776
--   HashAggregate  Group Key: cc.contrat_id, cp_1.groupe_site_id, cp_1.libelle_site
--   GroupAggregate  ->  Sort  ->  ...                actual time=2172.414
--
-- LE `LIMIT 50` NE DESCEND PAS DANS UN `GROUP BY`. J'avais écrit le nom de site comme une
-- sous-requête agrégée jointe au contrat :
--
--   left join (select contrat_id, string_agg(libelle_site …) from contrats_compteurs
--              join compteurs … group by contrat_id) s on s.contrat_id = ct.id
--
-- PostgreSQL doit donc calculer l'agrégat pour LES 1 603 CONTRATS avant de pouvoir en jeter
-- 1 553. Cinquante lignes coûtent le patrimoine entier.
--
-- Même faute pour les deux autres, sous une autre forme : elles joignent `v_groupes_de_site`, qui
-- est un `select distinct … from compteurs`. Un `distinct` sur 7 920 lignes, refait à chaque
-- requête, sans qu'aucun index puisse aider — et `v_documents_liste` le fait DEUX FOIS.
--
-- ══ ET LA CAUSE DERRIÈRE LA CAUSE : L'INSTANCE EST BRIDÉE ══════════════════════════════════════
--
-- Ces vues étaient déjà lourdes ce matin et personne ne s'en plaignait. Ce qui a changé, c'est la
-- puissance disponible. Mesure sans disque ni table — `select count(*) from generate_series(1,3e6)`,
-- répété trois fois : 2 520 ms, 900 ms, 919 ms. Une instance saine fait ça en 200 à 400 ms.
--
-- Le plan le confirme : `Buffers: shared hit=776, read=0` — RIEN n'est lu sur disque, tout est en
-- cache (taux de cache 100 %), et pourtant parcourir ces 776 pages déjà en mémoire prend 1,6 s.
-- Ce n'est ni un verrou (aucun), ni la concurrence (4 connexions actives sur 60), ni des
-- statistiques périmées (à jour). C'est le processeur.
--
-- CETTE MIGRATION NE RÈGLE PAS ÇA — c'est une décision de dimensionnement, pas de code. Elle règle
-- ce qui est de mon ressort : que l'application n'exige pas quatre fois la puissance nécessaire.
-- Un facteur 20 sur ces vues, c'est la différence entre « ça rame » et « ça ne charge plus ».
--
-- ══ LA CORRECTION : `LATERAL`, C'EST-À-DIRE « POUR CETTE LIGNE-LÀ » ════════════════════════════
--
-- Un `left join lateral (…) on true` est corrélé à la ligne courante. L'agrégat n'est donc calculé
-- que pour les lignes que la requête garde vraiment, et le filtre `where groupe_site_id = …`
-- devient une recherche par index (`idx_compteurs_groupe_site`, posé ce matin) au lieu d'un
-- parcours complet.
--
-- Le résultat rendu doit être IDENTIQUE : les garde-fous ci-dessous comparent l'empreinte md5 de
-- la sortie complète de chaque vue, avant et après, dans la même transaction. C'est la méthode qui
-- a rattrapé quatre de mes prédictions fausses ce matin ; je ne change pas de méthode parce que je
-- suis pressé.
--
-- ══ UN EFFET DE BORD QUI PROTÈGE ═══════════════════════════════════════════════════════════════
--
-- `v_groupes_de_site` est un `select distinct (groupe_site_id, libelle_site, adresse_site,
-- compte_id)`. Si un jour deux compteurs du MÊME groupe portaient des libellés différents — ce que
-- le déclencheur de la migration 20260910140000 autorise explicitement, un libellé saisi à la main
-- survit à un déplacement — la vue rendrait DEUX lignes pour un site, et le `left join` dupliquerait
-- silencieusement le document ou le suivi. Le `limit 1` des `lateral` ci-dessous ferme ce piège
-- avant qu'il ne s'ouvre. Vérifié aujourd'hui : 6 342 lignes pour 6 342 groupes réels, aucun
-- doublon — donc la sortie ne change pas, seule la garantie s'ajoute.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── L'EMPREINTE D'AVANT, prise dans la transaction pour comparer à l'identique ──────────────────
create temporary table avant_contrats on commit drop as select * from v_contrats_liste;
create temporary table avant_documents on commit drop as select * from v_documents_liste;
create temporary table avant_suivis on commit drop as select * from v_suivis_contrats_liste;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ① v_contrats_liste — l'agrégat des sites devient corrélé au contrat
-- ════════════════════════════════════════════════════════════════════════════════════════════════
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
     /* AVANT : une sous-requête `group by contrat_id` sur TOUS les contrats, que le `limit 50` ne
        pouvait pas traverser. MAINTENANT : corrélée à `ct.id`, donc calculée cinquante fois. Le
        `where cc.contrat_id = ct.id` attaque l'index unique `(contrat_id, compteur_id)`. */
     /* `ORDER BY libelle_site, groupe_site_id` ET NON `libelle_site` SEUL. Le garde-fou de cette
        migration a refusé la première version en signalant 5 contrats dont la sortie changeait.
        Vérification : sur ces 5, `site_nom` est identique au caractère près — seul l'ORDRE du
        tableau `sites` diffère, et uniquement là où DEUX sites portent le MÊME nom
        (« MAISON LHEUREUX » deux fois, « PRODECRAN - SIEGE » deux fois…). Trier sur le seul
        libellé laisse alors l'ordre au bon vouloir du plan d'exécution : ces 5 contrats
        pouvaient déjà rendre leurs sites dans un ordre différent d'un chargement à l'autre.
        Le second critère lève l'ambiguïté pour de bon. C'est le même piège que ce matin
        (migration 20260909200000) : 170 noms de site sont partagés dans la base. */
     LEFT JOIN LATERAL ( SELECT string_agg(d.libelle_site, ' · '::text ORDER BY d.libelle_site, d.groupe_site_id) AS site_nom,
            jsonb_agg(jsonb_build_object('id', d.groupe_site_id, 'nom', d.libelle_site) ORDER BY d.libelle_site, d.groupe_site_id) AS sites
           FROM ( SELECT DISTINCT cp_1.groupe_site_id,
                    cp_1.libelle_site
                   FROM contrats_compteurs cc
                     JOIN compteurs cp_1 ON cp_1.id = cc.compteur_id
                  WHERE cc.contrat_id = ct.id) d) s ON true
     LEFT JOIN comptes f ON f.id = ct.fournisseur_compte_id
     LEFT JOIN types_energies te ON te.id = ct.type_energie_id
     LEFT JOIN statuts_contrats sc ON sc.id = ct.statut_id;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ② v_documents_liste — deux `distinct` sur 7 920 compteurs deviennent deux recherches par index
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create or replace view v_documents_liste as
 SELECT d.id,
    d.nom,
    d.nom_fichier,
    d.url,
    d.mime_type,
    d.taille_octets,
    d.entite_type,
    d.entite_id,
    d.proprietaire_id,
    d.date_creation,
    td.libelle AS type_document,
    COALESCE((p.prenom || ' '::text) || p.nom, ''::text) AS auteur,
        CASE d.entite_type
            WHEN 'site'::text THEN si.libelle
            WHEN 'compte'::text THEN co.nom
            WHEN 'mandat'::text THEN mco.nom
            WHEN 'recommandation'::text THEN re.nom
            WHEN 'contrat'::text THEN COALESCE(fo.nom || ' — '::text, ''::text) || COALESCE(csi.libelle, ''::text)
            WHEN 'compteur'::text THEN COALESCE(NULLIF(cp.libelle, ''::text), cp.numero_point)
            ELSE ''::text
        END AS objet_lie
   FROM documents d
     LEFT JOIN types_documents td ON td.id = d.type_document_id
     LEFT JOIN profils p ON p.id = d.auteur_profil_id
     /* LE LIBELLÉ DU GROUPE D'ADRESSE, cherché par index. `limit 1` : tous les compteurs d'un
        groupe portent le même libellé, et si un jour l'un d'eux en portait un autre, on veut UNE
        ligne de document et pas deux. */
     LEFT JOIN LATERAL ( SELECT c1.libelle_site AS libelle
           FROM compteurs c1
          WHERE d.entite_type = 'site'::text AND c1.groupe_site_id = d.entite_id
          LIMIT 1) si ON true
     LEFT JOIN comptes co ON d.entite_type = 'compte'::text AND co.id = d.entite_id
     LEFT JOIN mandats ma ON d.entite_type = 'mandat'::text AND ma.id = d.entite_id
     LEFT JOIN comptes mco ON mco.id = ma.compte_id
     LEFT JOIN recommandations re ON d.entite_type = 'recommandation'::text AND re.id = d.entite_id
     LEFT JOIN contrats ct ON d.entite_type = 'contrat'::text AND ct.id = d.entite_id
     LEFT JOIN comptes fo ON fo.id = ct.fournisseur_compte_id
     LEFT JOIN LATERAL ( SELECT c2.libelle_site AS libelle
           FROM compteurs c2
          WHERE c2.groupe_site_id = ct.site_id
          LIMIT 1) csi ON true
     LEFT JOIN compteurs cp ON d.entite_type = 'compteur'::text AND cp.id = d.entite_id;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ③ v_suivis_contrats_liste — celle qui plantait pour de vrai
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create or replace view v_suivis_contrats_liste as
 SELECT s.id,
    s.reference,
    s.contrat_id,
    s.compte_id,
    s.site_id,
    s.fournisseur_compte_id,
    s.contact_principal_id,
    s.recommandation_id,
    s.responsable_profil_id,
    s.proprietaire_id,
    s.date_ouverture,
    s.date_cloture,
    s.finalite,
    s.commentaire,
    s.sante_forcee,
    s.motif_sante_forcee,
    s.date_creation,
    e.code AS etape,
    e.libelle AS etape_libelle,
    e.finalite AS etape_finalite,
    e.ordre AS etape_ordre,
    cp.nom AS compte_nom,
    si.libelle AS site_nom,
    fo.nom AS fournisseur_nom,
    ct.reference AS contrat_reference,
    ct.date_debut,
    ct.date_fin,
    stc.code AS contrat_statut,
    COALESCE((pr.prenom || ' '::text) || pr.nom, ''::text) AS responsable,
    COALESCE((cc.prenom || ' '::text) || cc.nom, ''::text) AS contact_principal_nom,
        CASE
            WHEN ct.date_fin IS NULL THEN NULL::integer
            ELSE ct.date_fin - CURRENT_DATE
        END AS jours_avant_echeance,
    COALESCE(act.ouvertes, 0) AS actions_ouvertes,
    COALESCE(act.en_retard, 0) AS actions_en_retard,
    act.prochaine_action,
    act.prochaine_echeance,
    act.prochain_responsable,
    COALESCE(req.ouvertes, 0) AS requetes_ouvertes,
    COALESCE(req.en_retard, 0) AS requetes_en_retard,
        CASE
            WHEN s.sante_forcee IS NOT NULL THEN s.sante_forcee
            WHEN COALESCE(act.retard_max, 0) > 7 OR COALESCE(req.en_retard, 0) > 0 OR ct.date_fin IS NOT NULL AND ct.date_fin < CURRENT_DATE AND e.code <> 'CLOTURE'::text THEN 'A_RISQUE'::text
            WHEN COALESCE(act.en_retard, 0) > 0 OR COALESCE(req.ouvertes, 0) > 0 THEN 'A_SURVEILLER'::text
            WHEN e.code <> 'CLOTURE'::text AND ct.date_fin IS NOT NULL AND ct.date_fin <= (CURRENT_DATE + '1 year'::interval) THEN 'OPPORTUNITE'::text
            ELSE 'SAIN'::text
        END AS sante
   FROM suivis_contrats s
     JOIN etapes_suivis_contrats e ON e.id = s.etape_id
     JOIN contrats ct ON ct.id = s.contrat_id
     LEFT JOIN statuts_contrats stc ON stc.id = ct.statut_id
     LEFT JOIN comptes cp ON cp.id = s.compte_id
     LEFT JOIN comptes fo ON fo.id = s.fournisseur_compte_id
     /* C'ÉTAIT CETTE JOINTURE QUI TENAIT LES DEUX TRANSACTIONS AVORTÉES. */
     LEFT JOIN LATERAL ( SELECT c1.libelle_site AS libelle
           FROM compteurs c1
          WHERE c1.groupe_site_id = s.site_id
          LIMIT 1) si ON true
     LEFT JOIN profils pr ON pr.id = s.responsable_profil_id
     LEFT JOIN contacts cc ON cc.id = s.contact_principal_id
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS ouvertes,
            count(*) FILTER (WHERE a.date_prevue::date < CURRENT_DATE)::integer AS en_retard,
            max(
                CASE
                    WHEN a.date_prevue::date < CURRENT_DATE THEN CURRENT_DATE - a.date_prevue::date
                    ELSE 0
                END) AS retard_max,
            (array_agg(a.titre ORDER BY a.date_prevue))[1] AS prochaine_action,
            (array_agg(a.date_prevue ORDER BY a.date_prevue))[1] AS prochaine_echeance,
            (array_agg(COALESCE((p2.prenom || ' '::text) || p2.nom, ''::text) ORDER BY a.date_prevue))[1] AS prochain_responsable
           FROM actions a
             LEFT JOIN profils p2 ON p2.id = a.responsable_profil_id
          WHERE a.suivi_contrat_id = s.id AND a.date_realisation IS NULL) act ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS ouvertes,
            count(*) FILTER (WHERE r.date_echeance IS NOT NULL AND r.date_echeance::date < CURRENT_DATE)::integer AS en_retard
           FROM requetes r
             JOIN statuts_requetes sr ON sr.id = r.statut_id
          WHERE r.contrat_id = s.contrat_id AND r.actif AND (sr.code = ANY (ARRAY['NOUVELLE'::text, 'EN_TRAITEMENT'::text]))) req ON true
  WHERE s.actif;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES GARDE-FOUS — la sortie doit être IDENTIQUE, et plus rapide
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_av    text;
  v_ap    text;
  v_n_av  integer;
  v_n_ap  integer;
  v_debut timestamptz;
  v_ms    integer;
begin
  -- ① CONTRATS : même nombre de lignes, même contenu.
  select count(*) into v_n_av from avant_contrats;
  select count(*) into v_n_ap from v_contrats_liste;
  if v_n_av <> v_n_ap then
    raise exception 'Garde-fou v_contrats_liste : % lignes avant, % apres', v_n_av, v_n_ap;
  end if;
  /* TOUTES LES COLONNES SAUF `sites` DOIVENT ÊTRE IDENTIQUES AU CARACTÈRE PRÈS — `site_nom`
     compris, c'est-à-dire le texte que l'écran affiche. */
  select md5(string_agg(t::text, '|' order by t::text)) into v_av
    from (select id, reference, reference_fournisseur, id_salesforce, date_debut, date_fin,
                 duree_mois, compte_id, site_id, proprietaire_id, date_creation, compte_nom,
                 site_nom, fournisseur_nom, type_energie, statut, statut_vie
            from avant_contrats) t;
  select md5(string_agg(t::text, '|' order by t::text)) into v_ap
    from (select id, reference, reference_fournisseur, id_salesforce, date_debut, date_fin,
                 duree_mois, compte_id, site_id, proprietaire_id, date_creation, compte_nom,
                 site_nom, fournisseur_nom, type_energie, statut, statut_vie
            from v_contrats_liste) t;
  if v_av is distinct from v_ap then
    raise exception 'Garde-fou v_contrats_liste : une colonne autre que `sites` a CHANGE';
  end if;

  /* LE TABLEAU `sites` SE COMPARE COMME UN ENSEMBLE, pas comme une liste ordonnée. L'ancienne vue
     triait sur le seul libellé : pour les contrats dont deux sites portent le même nom, l'ordre
     qu'elle rendait n'était pas défini. Comparer les tableaux tels quels ferait échouer un
     garde-fou sur du bruit, et surtout ferait passer pour une régression une correction — l'ordre
     est désormais déterministe. On compare donc les mêmes sites, recanonisés par identifiant. */
  select md5(string_agg(x::text, '|' order by x::text)) into v_av from (
    select t.id, (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(t.sites) e) as sites
      from avant_contrats t) x;
  select md5(string_agg(x::text, '|' order by x::text)) into v_ap from (
    select t.id, (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(t.sites) e) as sites
      from v_contrats_liste t) x;
  if v_av is distinct from v_ap then
    raise exception 'Garde-fou v_contrats_liste : l ensemble des sites d au moins un contrat a CHANGE';
  end if;

  /* ET ON DIT COMBIEN DE CONTRATS VOIENT LEUR ORDRE D'AFFICHAGE FIGÉ, plutôt que de le taire.
     Attendu : 5, tous avec deux sites de même nom. Un nombre plus grand voudrait dire que le tri
     a changé pour des sites de noms DIFFÉRENTS, ce qui serait une vraie régression. */
  select count(*) into v_n_ap
    from avant_contrats a join v_contrats_liste n on n.id = a.id
   where a.sites::text is distinct from n.sites::text;
  if v_n_ap > 5 then
    raise exception 'Garde-fou v_contrats_liste : % contrats changent d ordre, 5 attendus', v_n_ap;
  end if;
  raise notice 'Garde-fou : % contrat(s) voient l ordre de leurs sites fige (noms de site identiques)', v_n_ap;

  -- ② DOCUMENTS.
  select count(*) into v_n_av from avant_documents;
  select count(*) into v_n_ap from v_documents_liste;
  if v_n_av <> v_n_ap then
    raise exception 'Garde-fou v_documents_liste : % lignes avant, % apres', v_n_av, v_n_ap;
  end if;
  select md5(string_agg(t::text, '|' order by t::text)) into v_av from avant_documents t;
  select md5(string_agg(t::text, '|' order by t::text)) into v_ap from v_documents_liste t;
  if v_av is distinct from v_ap then
    raise exception 'Garde-fou v_documents_liste : la sortie a CHANGE';
  end if;

  -- ③ SUIVIS DE CONTRATS.
  select count(*) into v_n_av from avant_suivis;
  select count(*) into v_n_ap from v_suivis_contrats_liste;
  if v_n_av <> v_n_ap then
    raise exception 'Garde-fou v_suivis_contrats_liste : % lignes avant, % apres', v_n_av, v_n_ap;
  end if;
  select md5(string_agg(t::text, '|' order by t::text)) into v_av from avant_suivis t;
  select md5(string_agg(t::text, '|' order by t::text)) into v_ap from v_suivis_contrats_liste t;
  if v_av is distinct from v_ap then
    raise exception 'Garde-fou v_suivis_contrats_liste : la sortie a CHANGE';
  end if;

  raise notice 'Garde-fou : les trois vues rendent EXACTEMENT la meme chose qu avant';

  -- ④ ET C'EST PLUS RAPIDE. Le seuil est volontairement large — l'instance est bridée, et un
  --   garde-fou de performance qui échoue sur une seconde de bruit bloquerait une correction juste.
  --   Ce qu'on veut prouver, c'est que le `limit 50` ne coûte plus le patrimoine entier.
  v_debut := clock_timestamp();
  perform * from (select * from v_contrats_liste limit 50) x;
  perform * from (select * from v_documents_liste limit 50) x;
  perform * from (select * from v_suivis_contrats_liste limit 50) x;
  v_ms := extract(milliseconds from (clock_timestamp() - v_debut))
        + 1000 * extract(second from (clock_timestamp() - v_debut));
  raise notice 'Garde-fou : les trois LIMIT 50 en % ms au total (ils prenaient 27 000 ms avant)', v_ms;
  if v_ms > 8000 then
    raise exception 'Garde-fou : % ms pour trois LIMIT 50 — la correction n a pas eu l effet attendu', v_ms;
  end if;
end $$;

commit;
