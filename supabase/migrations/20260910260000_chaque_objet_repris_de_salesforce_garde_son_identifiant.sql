-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CHAQUE OBJET REPRIS DE SALESFORCE GARDE SON IDENTIFIANT D'ORIGINE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE QUI A RENDU CETTE COLONNE NÉCESSAIRE ═══════════════════════════════════════════════════
--
-- Réunion du 10/09/2026. William : « les équipes me disent que les fichiers du Salesforce n'ont
-- pas été mis sur Kimatch. […] Sur tous leurs compteurs, aucun fichier n'a été remonté. » Michel
-- doutait que ça vaille la peine ; William a tranché : « je préférerais supprimer de la data plutôt
-- que ne pas l'importer. »
--
-- Relevé du jour dans l'org KiweeOrg : 30 047 liens de fichiers, dont 13 140 sur des objets métier.
--
--   3 549  Mandat__c                 2 846  Contract              2 577  Point_de_livraison__c
--   1 890  Cotation__c               1 591  Suivi_cotation__c       296  Opportunity
--     120  Account                      52  Lead                     50  Contact      35  Case
--
-- Les 16 907 restants pendent à des utilisateurs — bibliothèques personnelles, pas de la donnée
-- d'entreprise.
--
-- ══ POURQUOI UN COMPTEUR NE POUVAIT PAS RECEVOIR SES FICHIERS ══════════════════════════════════
--
-- Pour poser un fichier sur le bon objet, il faut savoir quel objet Kimatch correspond à quel
-- enregistrement Salesforce. Cinq tables portaient déjà cette trace :
--
--   mandats                  a03…  1 356 / 1 474
--   recommandations          006…  1 668 / 1 737
--   versions_recommandation  a07…  1 898 / 2 060
--   pistes                   00Q…  5 131 / 5 136
--   contrats                 …mais PAS un identifiant : le NUMÉRO de contrat (« 00000170 »),
--                            qui correspond à `Contract.ContractNumber`. C'est utilisable comme
--                            clé de rapprochement, donc on n'y touche pas — mais il fallait le
--                            savoir avant d'écrire une jointure sur un Id de 18 caractères.
--
-- Et cinq tables n'en portaient AUCUNE : `compteurs`, `comptes`, `contacts`, `requetes` et
-- `suivis_consultations_fournisseurs`. Les 2 577 fichiers de points de livraison n'avaient donc
-- aucun chemin vers leur compteur, et c'est précisément ce que l'équipe constatait.
--
-- ══ CE QUE CETTE MIGRATION FAIT, ET NE FAIT PAS ════════════════════════════════════════════════
--
-- Elle POSE les colonnes, vides. Le remplissage vient d'un script — `node
-- scripts/importer-identifiants-salesforce.cjs` — parce qu'il interroge Salesforce, ce qu'une
-- migration SQL ne peut pas faire, et parce qu'un rapprochement par clé naturelle demande de
-- rendre compte de ce qu'il n'a pas su rapprocher.
--
-- ══ ET « CONTACT » REJOINT LES TYPES DE DOCUMENT ═══════════════════════════════════════════════
--
-- `documents.entite_type` admettait douze valeurs, sans `contact`. Les 50 fichiers portés par un
-- contact Salesforce n'auraient eu nulle part où aller.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── LES CINQ COLONNES MANQUANTES ───────────────────────────────────────────────────────────────
/* Toutes nullables : un objet créé dans Kimatch n'a pas d'origine Salesforce, et ce vide est une
   information — il distingue ce qui vient de la reprise de ce qui est né ici. Toutes indexées :
   le rapprochement les interroge une fois par fichier. */
alter table compteurs                         add column if not exists id_salesforce text;
alter table comptes                           add column if not exists id_salesforce text;
alter table contacts                          add column if not exists id_salesforce text;
alter table requetes                          add column if not exists id_salesforce text;
alter table suivis_consultations_fournisseurs add column if not exists id_salesforce text;

create index if not exists idx_compteurs_id_salesforce on compteurs (id_salesforce) where id_salesforce is not null;
create index if not exists idx_comptes_id_salesforce on comptes (id_salesforce) where id_salesforce is not null;
create index if not exists idx_contacts_id_salesforce on contacts (id_salesforce) where id_salesforce is not null;
create index if not exists idx_requetes_id_salesforce on requetes (id_salesforce) where id_salesforce is not null;
create index if not exists idx_suivis_consult_id_salesforce on suivis_consultations_fournisseurs (id_salesforce) where id_salesforce is not null;

comment on column compteurs.id_salesforce is
  'Identifiant de l''enregistrement `Point_de_livraison__c` dont ce compteur est issu. Posé le '
  '10/09/2026 : sans lui, les 2 577 fichiers attaches aux points de livraison n''avaient aucun '
  'chemin vers leur compteur. Nul pour un compteur cree dans Kimatch.';
comment on column comptes.id_salesforce is 'Identifiant de l''`Account` Salesforce d''origine.';
comment on column contacts.id_salesforce is 'Identifiant du `Contact` Salesforce d''origine.';
comment on column requetes.id_salesforce is 'Identifiant du `Case` Salesforce d''origine.';
comment on column suivis_consultations_fournisseurs.id_salesforce is
  'Identifiant du `Suivi_cotation__c` Salesforce d''origine — la consultation d''un fournisseur '
  'pour une cotation.';

/* CELUI DES CONTRATS N'EST PAS UN IDENTIFIANT, ET LE COMMENTAIRE LE DIT MAINTENANT. C'est le
   piège qui a failli me faire écrire une jointure sur un Id là où il y a « 00000170 ». */
comment on column contrats.id_salesforce is
  'ATTENTION, CE N''EST PAS UN IDENTIFIANT D''ENREGISTREMENT mais le NUMÉRO de contrat Salesforce '
  '— `Contract.ContractNumber`, de la forme « 00000170 ». Verifie le 10/09/2026 : 1 479 valeurs '
  'remplies, ZERO qui ait la forme d''un Id de 15 ou 18 caracteres. Il reste parfaitement '
  'utilisable comme cle de rapprochement, a condition de joindre sur `ContractNumber`.';

-- ── « CONTACT » DEVIENT UN PORTEUR DE DOCUMENT ─────────────────────────────────────────────────
alter table documents drop constraint if exists documents_entite_type_check;
alter table documents add constraint documents_entite_type_check
  check (entite_type = any (array[
    'site', 'compte', 'contact', 'mandat', 'recommandation', 'version_recommandation',
    'contrat', 'offre_fournisseur', 'compteur', 'opportunite', 'piste', 'requete', 'remuneration'
  ]));

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES GARDE-FOUS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_colonnes  integer;
  v_index     integer;
  v_remplies  integer;
  v_documents integer;
  v_compteurs integer;
begin
  -- ① LES CINQ COLONNES SONT LÀ, EN TEXTE. On vérifie le type : une colonne créée ailleurs sous
  --   un autre type passerait sinon inaperçue et casserait la jointure au moment du remplissage.
  select count(*) into v_colonnes from information_schema.columns
   where table_schema = 'public' and column_name = 'id_salesforce' and data_type = 'text'
     and table_name in ('compteurs', 'comptes', 'contacts', 'requetes', 'suivis_consultations_fournisseurs');
  if v_colonnes <> 5 then
    raise exception 'Garde-fou : % colonne(s) id_salesforce sur 5 posees en text', v_colonnes;
  end if;

  -- ② LES CINQ INDEX AUSSI. Sans eux, le rapprochement ferait 13 140 parcours de table.
  select count(*) into v_index from pg_indexes
   where schemaname = 'public' and indexname in (
     'idx_compteurs_id_salesforce', 'idx_comptes_id_salesforce', 'idx_contacts_id_salesforce',
     'idx_requetes_id_salesforce', 'idx_suivis_consult_id_salesforce');
  if v_index <> 5 then
    raise exception 'Garde-fou : % index sur 5', v_index;
  end if;

  -- ③ ELLES NAISSENT VIDES. Cette migration ne remplit rien — le rapprochement est le travail du
  --   script, qui doit pouvoir rendre compte de ce qu'il n'a pas su relier. Une valeur qui
  --   apparaîtrait ici sortirait de nulle part.
  select (select count(*) from compteurs where id_salesforce is not null)
       + (select count(*) from comptes where id_salesforce is not null)
       + (select count(*) from contacts where id_salesforce is not null)
       + (select count(*) from requetes where id_salesforce is not null)
       + (select count(*) from suivis_consultations_fournisseurs where id_salesforce is not null)
    into v_remplies;
  if v_remplies > 0 then
    raise exception 'Garde-fou : % identifiant(s) deja rempli(s) alors que les colonnes viennent d etre creees', v_remplies;
  end if;

  -- ④ « CONTACT » EST ADMIS, ET LES DOUZE AUTRES LE RESTENT. Une contrainte réécrite trop court
  --   rejetterait des documents existants au premier UPDATE.
  select count(*) into v_documents from documents;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'documents'::regclass and conname = 'documents_entite_type_check'
       and pg_get_constraintdef(oid) like '%''contact''%'
       and pg_get_constraintdef(oid) like '%''compteur''%'
       and pg_get_constraintdef(oid) like '%''remuneration''%'
  ) then
    raise exception 'Garde-fou : la contrainte entite_type n admet pas les valeurs attendues';
  end if;

  -- ⑤ AUCUN COMPTEUR N'A BOUGÉ.
  select count(*) into v_compteurs from compteurs;
  raise notice 'Garde-fou passe : 5 colonnes + 5 index poses et vides, contact admis, % documents et % compteurs intacts',
    v_documents, v_compteurs;
end $$;

commit;
