-- ============================================================================================
-- LISTES : des VUES pour que la base filtre, trie et pagine
-- ============================================================================================
-- Suite du chantier commence le 15/08 avec la liste des sites. Chaque page de liste charge encore
-- sa table entiere avant de filtrer dans le navigateur : 6459 documents, 3384 contacts,
-- 2762 comptes, 1703 recommandations, 1598 contrats, 1440 mandats.
--
-- POURQUOI DES VUES, ET NON DES FONCTIONS COMME liste_sites.
--
-- liste_sites meritait une fonction : elle calcule un agregat metier parametre — la sante d'un
-- site, cinq tables croisees, des malus et des bonus. Rien de tel ici : ces pages ne font
-- qu'aplatir des jointures pour afficher un nom de compte a cote d'un contrat. Pour cela une vue
-- est strictement superieure :
--
--   - aucun SQL dynamique, donc aucune surface d'injection et un plan d'execution stable ;
--   - PostgREST pagine, trie et filtre une vue EXACTEMENT comme une table (range, order, or) :
--     il n'y a rien a reinventer cote application, et un seul crochet React suffit pour toutes ;
--   - le planner « inline » une vue simple, donc les index des tables de base servent — verifie le
--     16/08/2026 : une recherche sur comptes a travers la vue passe bien par idx_comptes_nom_trgm ;
--   - une vue se lit et se corrige sans toucher au front, la ou une fonction a cinq parametres
--     impose de synchroniser les deux.
--
-- CE QUE CES VUES NE FONT PAS. Aucun agregat lourd, aucun sous-select correle par ligne : ce sont
-- des jointures a plat. C'est la condition pour que le planner puisse les inliner et se servir des
-- index. Le seul comptage present (le nombre de sites d'un compte) remplace une colonne fausse,
-- voir plus bas.
--
-- LIMITE ASSUMEE. Une recherche portant sur plusieurs tables jointes se traduit par un OR
-- inter-tables, que Postgres ne peut pas satisfaire par index : mesure a 573 ms sur les contrats
-- et leurs trois jointures. C'est sans commune mesure avec le chargement des 1598 lignes qu'on
-- evite, et cela ne concerne que la frappe d'une recherche. Si cela devenait genant, l'etape
-- suivante serait une colonne de recherche materialisee sur la table de base — pas un retour au
-- chargement complet.
--
-- SECURITY INVOKER : la RLS des tables sous-jacentes continue de s'appliquer, une vue n'ouvre rien.
-- ============================================================================================

begin;

-- --------------------------------------------------------------------------------------------
-- 1. COMPTES
-- --------------------------------------------------------------------------------------------
-- nb_sites EST RECALCULE, et ce n'est pas un detail : la colonne comptes.nb_sites est fausse sur
-- 2642 des 2762 comptes (mesure du 16/08/2026). C'est une valeur figee a l'import, jamais reprise
-- depuis, et c'est elle que la liste affichait dans la colonne « Sites ». La vue compte les sites
-- reels ; la colonne de la table n'est plus lue par la liste.
create or replace view public.v_comptes_liste
with (security_invoker = true) as
select
  c.id,
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
  tc.libelle as type_compte_libelle,
  coalesce(s.nb, 0) as nb_sites
from public.comptes c
left join public.types_comptes tc on tc.id = c.type_compte_id
left join (select compte_id, count(*)::int nb from public.sites group by compte_id) s
       on s.compte_id = c.id;

comment on view public.v_comptes_liste is
  'Liste des comptes, jointures aplaties. nb_sites est recalcule : la colonne comptes.nb_sites est fausse sur 96 % des lignes.';

-- --------------------------------------------------------------------------------------------
-- 2. CONTACTS
-- --------------------------------------------------------------------------------------------
create or replace view public.v_contacts_liste
with (security_invoker = true) as
select
  ct.id,
  ct.prenom,
  ct.nom,
  ct.civilite,
  ct.fonction,
  ct.email,
  ct.telephone,
  ct.telephone_mobile,
  ct.role,
  ct.contact_principal,
  ct.compte_id,
  ct.proprietaire_id,
  ct.date_creation,
  cp.nom as compte_nom
from public.contacts ct
left join public.comptes cp on cp.id = ct.compte_id;

-- --------------------------------------------------------------------------------------------
-- 3. CONTRATS
-- --------------------------------------------------------------------------------------------
create or replace view public.v_contrats_liste
with (security_invoker = true) as
select
  ct.id,
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
  cp.nom as compte_nom,
  s.nom as site_nom,
  f.nom as fournisseur_nom,
  te.code as type_energie,
  sc.code as statut
from public.contrats ct
left join public.comptes cp on cp.id = ct.compte_id
left join public.sites s on s.id = ct.site_id
left join public.comptes f on f.id = ct.fournisseur_compte_id
left join public.types_energies te on te.id = ct.type_energie_id
left join public.statuts_contrats sc on sc.id = ct.statut_id;

-- --------------------------------------------------------------------------------------------
-- 4. MANDATS
-- --------------------------------------------------------------------------------------------
-- nb_pdl vient de la table de liaison : c'est le nombre de points de livraison couverts, celui
-- qu'affiche la liste.
create or replace view public.v_mandats_liste
with (security_invoker = true) as
select
  m.id,
  m.reference,
  m.numero,
  m.id_salesforce,
  m.date_envoi,
  m.date_signature,
  m.date_debut_validite,
  m.date_fin_validite,
  m.duree_mois,
  m.compte_id,
  m.proprietaire_id,
  m.cree_par_id,
  m.date_creation,
  cp.nom as compte_nom,
  sm.code as statut,
  coalesce(mc.nb, 0) as nb_pdl
from public.mandats m
left join public.comptes cp on cp.id = m.compte_id
left join public.statuts_mandats sm on sm.id = m.statut_id
left join (select mandat_id, count(*)::int nb from public.mandats_compteurs group by mandat_id) mc
       on mc.mandat_id = m.id;

-- --------------------------------------------------------------------------------------------
-- 5. DOCUMENTS
-- --------------------------------------------------------------------------------------------
-- La plus grosse des listes : 6459 lignes chargees pour en montrer vingt.
create or replace view public.v_documents_liste
with (security_invoker = true) as
select
  d.id,
  d.nom,
  d.nom_fichier,
  d.url,
  d.mime_type,
  d.taille_octets,
  d.entite_type,
  d.entite_id,
  d.proprietaire_id,
  d.date_creation,
  td.libelle as type_document,
  coalesce(p.prenom || ' ' || p.nom, '') as auteur
from public.documents d
left join public.types_documents td on td.id = d.type_document_id
left join public.profils p on p.id = d.auteur_profil_id;

-- --------------------------------------------------------------------------------------------
-- 6. RECOMMANDATIONS
-- --------------------------------------------------------------------------------------------
-- Les versions et les sites restent hors de la vue : la page de liste n'affiche qu'un en-tete, et
-- les compter par ligne empecherait le planner d'inliner la vue.
create or replace view public.v_recommandations_liste
with (security_invoker = true) as
select
  r.id,
  r.nom,
  r.priorite,
  r.date_ouverture,
  r.date_cloture,
  r.finalite_cloture,
  r.type_opportunite,
  r.compte_id,
  r.proprietaire_id,
  r.date_creation,
  cp.nom as compte_nom,
  e.code as etape,
  o.libelle as origine,
  te.code as type_energie,
  coalesce(pr.prenom || ' ' || pr.nom, '') as conseiller
from public.recommandations r
left join public.comptes cp on cp.id = r.compte_id
left join public.etapes_recommandation e on e.id = r.etape_id
left join public.types_origines o on o.id = r.origine_id
left join public.types_energies te on te.id = r.type_energie_id
left join public.profils pr on pr.id = r.responsable_profil_id;

-- --------------------------------------------------------------------------------------------
-- 7. Droits et index de tri
-- --------------------------------------------------------------------------------------------
-- Reserve aux utilisateurs connectes, comme les fonctions du 15/08. La RLS des tables reste seule
-- juge des lignes visibles.
grant select on public.v_comptes_liste, public.v_contacts_liste, public.v_contrats_liste,
                public.v_mandats_liste, public.v_documents_liste, public.v_recommandations_liste
  to authenticated;

-- Le tri par defaut de chaque page : sans index, trier 6459 documents ou 3384 contacts impose un
-- tri complet a chaque page demandee.
create index if not exists idx_comptes_nom on public.comptes (nom);
create index if not exists idx_contacts_nom on public.contacts (nom);
create index if not exists idx_documents_date_creation on public.documents (date_creation desc);
create index if not exists idx_contrats_date_debut on public.contrats (date_debut desc);
create index if not exists idx_mandats_date_creation on public.mandats (date_creation desc);
create index if not exists idx_recommandations_date_ouverture on public.recommandations (date_ouverture desc);

-- Recherche « contient » sur les colonnes cherchees qui n'avaient pas encore de trigramme.
create index if not exists idx_contacts_prenom_trgm on public.contacts using gin (prenom gin_trgm_ops);
create index if not exists idx_contacts_nom_trgm on public.contacts using gin (nom gin_trgm_ops);
create index if not exists idx_contacts_email_trgm on public.contacts using gin (email gin_trgm_ops);
create index if not exists idx_documents_nom_trgm on public.documents using gin (nom gin_trgm_ops);
create index if not exists idx_recommandations_nom_trgm on public.recommandations using gin (nom gin_trgm_ops);

commit;

-- ============================================================================================
-- CONTROLE APRES APPLICATION
-- ============================================================================================
--   select 'comptes' t, count(*) from v_comptes_liste
--   union all select 'contacts', count(*) from v_contacts_liste
--   union all select 'contrats', count(*) from v_contrats_liste
--   union all select 'mandats', count(*) from v_mandats_liste
--   union all select 'documents', count(*) from v_documents_liste
--   union all select 'recommandations', count(*) from v_recommandations_liste;
--
-- Attendu : 2762, 3384, 1598, 1440, 6459, 1703.
--
-- Et le nombre de sites, enfin juste :
--   select count(*) from v_comptes_liste v join comptes c on c.id = v.id
--   where v.nb_sites is distinct from c.nb_sites;   -- attendu : environ 2642
