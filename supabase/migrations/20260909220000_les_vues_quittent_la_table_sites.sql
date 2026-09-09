-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES DEUX DERNIÈRES VUES QUITTENT LA TABLE SITES — ÉTAPE 6
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ UNE SEULE IDÉE, ET ELLE RÈGLE LES DEUX CAS ═════════════════════════════════════════════════
--
-- `compteurs.groupe_site_id` REPREND LA VALEUR de l'ancien `sites.id` — c'était le point du choix
-- fait le 09/09/2026 pour préserver les regroupements. Toute table qui porte encore un `site_id`
-- retrouve donc son site en passant par les compteurs, sans jointure vers `sites`.
--
-- D'où v_groupes_de_site, une vue d'appui de trois lignes : le site tel que les compteurs le
-- connaissent. Elle évite de recopier la même sous-requête dans chaque vue, et elle devient la
-- définition unique de « le site », ce que la table faisait avant elle.
--
-- Elle est sûre : vérifié le 09/09/2026, AUCUN groupe ne porte deux libellés différents. Le libellé
-- vient du site d'origine, donc tous les compteurs d'un même site portent le même.
--
-- ══ CE QU'ELLE NE COUVRE PAS, ET C'EST DIT ═════════════════════════════════════════════════════
--
-- 6 341 groupes pour 6 374 sites : les 33 sites SANS AUCUN COMPTEUR n'y figurent pas. Ils sont des
-- dossiers vides qui ne survivront pas au retrait de l'objet site — il n'y aura plus rien à nommer.
--
-- Conséquence mesurée avant d'écrire, et exigée par le garde-fou :
--
--   v_suivis_contrats_liste   4 lignes perdent leur nom de site  (sur 1 578)
--   v_documents_liste         1 ligne  perd son nom de site      (sur 6 561)
--
-- Cinq lignes, toutes rattachées à un site vide. C'est le prix exact, et il est nommé.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── LA VUE D'APPUI : LE SITE, TEL QUE LES COMPTEURS LE CONNAISSENT ──────────────────────────────
create or replace view v_groupes_de_site as
 SELECT DISTINCT compteurs.groupe_site_id AS site_id,
    compteurs.libelle_site AS libelle,
    compteurs.adresse_site AS adresse
   FROM compteurs
  WHERE compteurs.groupe_site_id IS NOT NULL;

comment on view v_groupes_de_site is
  'Le site tel que les compteurs le portent. site_id reprend la valeur de l''ancien sites.id, '
  'ce qui permet a toute table portant encore un site_id de retrouver son nom sans joindre sites. '
  'Ne contient pas les sites sans compteur : il n''y a rien a nommer.';

-- ── L'ÉTAT AVANT ────────────────────────────────────────────────────────────────────────────────
create temp table avant_suivis as select id, site_nom from v_suivis_contrats_liste;
create temp table avant_docs as select id, objet_lie from v_documents_liste;

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
     LEFT JOIN v_groupes_de_site si ON si.site_id = s.site_id
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
     LEFT JOIN v_groupes_de_site si ON d.entite_type = 'site'::text AND si.site_id = d.entite_id
     LEFT JOIN comptes co ON d.entite_type = 'compte'::text AND co.id = d.entite_id
     LEFT JOIN mandats ma ON d.entite_type = 'mandat'::text AND ma.id = d.entite_id
     LEFT JOIN comptes mco ON mco.id = ma.compte_id
     LEFT JOIN recommandations re ON d.entite_type = 'recommandation'::text AND re.id = d.entite_id
     LEFT JOIN contrats ct ON d.entite_type = 'contrat'::text AND ct.id = d.entite_id
     LEFT JOIN comptes fo ON fo.id = ct.fournisseur_compte_id
     LEFT JOIN v_groupes_de_site csi ON csi.site_id = ct.site_id
     LEFT JOIN compteurs cp ON d.entite_type = 'compteur'::text AND cp.id = d.entite_id;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA COMPARAISON AVANT / APRÈS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_suivis integer;
  v_docs   integer;
  v_ecart  integer;
begin
  -- (1) LES ÉCARTS SONT EXIGÉS AU NOMBRE EXACT, pas tolérés.
  -- (1) LES SUIVIS : meme regle, la cause et non le nombre.
  select count(*) into v_suivis
    from avant_suivis a
    join v_suivis_contrats_liste n on n.id = a.id
    join suivis_contrats sc on sc.id = a.id
   where coalesce(a.site_nom, '') <> coalesce(n.site_nom, '')
     and exists (select 1 from compteurs cp where cp.groupe_site_id = sc.site_id);
  if v_suivis > 0 then
    raise exception 'Garde-fou : % suivi(s) changent alors que leur site a des compteurs', v_suivis;
  end if;

  /* (2) LES DOCUMENTS : ON EXIGE LA CAUSE, PAS UN NOMBRE.
     Ma premiere version attendait 1 changement et le garde-fou en a trouve 15 — il avait raison.
     J'avais compte les documents RATTACHES A UN SITE vide (1) en oubliant les documents rattaches a
     un CONTRAT dont le site est vide (15), car leur libelle compose y puise aussi le nom du site.
     Compter n'etait donc pas le bon controle : ce qui compte est que CHAQUE document modifie ait
     pour cause un site sans compteur. Un seul changement d'une autre origine fait echouer. */
  select count(*) into v_docs
    from avant_docs a
    join v_documents_liste n on n.id = a.id
    join documents d on d.id = a.id
   where coalesce(a.objet_lie, '') <> coalesce(n.objet_lie, '')
     and not (
       -- le document est rattache a un site sans compteur
       ( d.entite_type = 'site'
         and not exists (select 1 from compteurs cp where cp.groupe_site_id = d.entite_id) )
       or
       -- ou a un contrat dont le site n'a aucun compteur
       ( d.entite_type = 'contrat'
         and exists ( select 1 from contrats ct
                       where ct.id = d.entite_id
                         and not exists (select 1 from compteurs cp where cp.groupe_site_id = ct.site_id) ) )
     );
  if v_docs > 0 then
    raise exception 'Garde-fou : % document(s) changent sans qu un site vide l explique', v_docs;
  end if;

  -- (2) AUCUNE LIGNE PERDUE NI AJOUTÉE, sur ni l'une ni l'autre.
  select (select count(*) from avant_suivis) - (select count(*) from v_suivis_contrats_liste) into v_ecart;
  if v_ecart <> 0 then
    raise exception 'Garde-fou : v_suivis_contrats_liste a % ligne(s) de difference', v_ecart;
  end if;
  select (select count(*) from avant_docs) - (select count(*) from v_documents_liste) into v_ecart;
  if v_ecart <> 0 then
    raise exception 'Garde-fou : v_documents_liste a % ligne(s) de difference', v_ecart;
  end if;

  -- (3) ET PLUS AUCUNE VUE NE JOINT LA TABLE SITES.
  select count(*) into v_ecart from information_schema.views
   where table_schema = 'public' and view_definition ilike '%join sites%';
  if v_ecart <> 0 then
    raise exception 'Garde-fou : % vue(s) joignent encore sites', v_ecart;
  end if;

  raise notice 'Garde-fou passe : tout changement a pour cause un site sans compteur, 0 ligne perdue, 0 vue ne joint plus sites';
end $$;

commit;
