-- ============================================================================================
-- Compléter les propriétaires : compteurs, mandats, et les personnes sans compte Kimatch
-- ============================================================================================
-- Suite de 20260813170000. Après celle-ci :
--   contacts 3380/3380, sites 6346/6346, recommandations 1681/1693, contrats 1068/1598.
--
-- Restaient deux trous, de natures différentes.
-- ============================================================================================

begin;

-- ── 1. COMPTEURS ET MANDATS : le propriétaire du compte ──────────────────────────────────────
-- Ni Point_de_livraison__c ni Mandat__c n'ont de champ Owner dans Salesforce : ce sont des objets
-- en master-detail, dont la propriété est celle de leur parent. Il n'y a donc rien à reprendre, et
-- le propriétaire du compte est le seul choix défendable — c'est déjà celui retenu pour les sites,
-- pour la même raison.
--
-- Le créateur, lui, est repris de Salesforce (7860 compteurs, 1335 mandats) : c'est une information
-- distincte, et c'est celle que William a demandé d'afficher sur le mandat.

update public.compteurs cp
   set proprietaire_id = c.proprietaire_id, date_modification = now()
  from public.sites s
  join public.comptes c on c.id = s.compte_id
 where s.id = cp.site_id
   and cp.proprietaire_id is null
   and c.proprietaire_id is not null;

update public.mandats m
   set proprietaire_id = c.proprietaire_id, date_modification = now()
  from public.comptes c
 where c.id = m.compte_id
   and m.proprietaire_id is null
   and c.proprietaire_id is not null;

-- ── 2. LES PERSONNES QUI N'ONT PAS ENCORE DE COMPTE KIMATCH ──────────────────────────────────
-- 450 contrats appartiennent à Franck EYOA, plus quelques dizaines d'objets à Adeline HADEY,
-- Lauren TOURREAU et un compte technique force.com. Aucun n'a de profil Kimatch.
--
-- On ne peut PAS écrire leur identifiant dans proprietaire_id : la colonne référence profils.id,
-- qui référence auth.users. Sans compte d'authentification, la contrainte refuse la ligne — ce
-- n'est pas un choix de conception, c'est un mur.
--
-- Décision de Naoëlle (13/08/2026) : garder l'information de côté et rattacher le jour où la
-- personne aura un compte. D'où cette table d'attente, qui conserve l'e-mail Salesforce et de quoi
-- retrouver la ligne concernée. Elle n'est pas une seconde source de vérité : dès qu'un profil
-- existe, la requête de résolution en fin de fichier vide les lignes correspondantes.

create table if not exists public.proprietaires_en_attente (
  id uuid primary key default gen_random_uuid(),
  -- Table visée, et comment y retrouver la ligne. On stocke une clé métier et non l'uuid Kimatch :
  -- le rapprochement doit rester rejouable même si les données sont réimportées.
  table_nom text not null,
  cle_type text not null,
  cle_valeur text not null,
  compte_id uuid references public.comptes(id) on delete cascade,
  /** E-mail Salesforce de la personne, seule trace de son identité tant qu'elle n'a pas de profil. */
  email text not null,
  /** 'proprietaire' ou 'createur' — les deux se reprennent séparément. */
  role text not null check (role in ('proprietaire', 'createur')),
  date_creation timestamptz not null default now(),
  unique (table_nom, cle_type, cle_valeur, compte_id, email, role)
);

comment on table public.proprietaires_en_attente is
  'Propriétaires et créateurs repris de Salesforce dont la personne n''a pas encore de profil Kimatch. À résoudre puis vider dès qu''un compte est créé — voir la requête en fin de 20260813180000.';

create index if not exists proprietaires_en_attente_email_idx on public.proprietaires_en_attente (lower(email));

alter table public.proprietaires_en_attente enable row level security;

-- Même politique que les tables voisines. Sans elle, la table serait muette : Supabase active RLS
-- d'office à la création, et une table sous RLS sans politique refuse toute lecture — l'erreur
-- commise sur contacts_comptes le 13/08 au matin.
drop policy if exists authenticated_all on public.proprietaires_en_attente;
create policy authenticated_all on public.proprietaires_en_attente
  for all to authenticated using (true) with check (true);

commit;

-- ============================================================================================
-- RÉSOUDRE UNE PERSONNE, LE JOUR OÙ ELLE A UN COMPTE
-- ============================================================================================
-- Remplacer l'adresse ci-dessous, exécuter le bloc, et les lignes traitées disparaissent de la
-- table d'attente. Rejouable : ce qui est déjà rattaché n'est pas retouché.
--
-- begin;
--
-- update public.contrats c set proprietaire_id = p.id, date_modification = now()
--   from public.proprietaires_en_attente a
--   join public.profils p on lower(p.email) = lower(a.email)
--  where a.table_nom = 'contrats' and a.role = 'proprietaire' and a.cle_type = 'id_salesforce'
--    and c.id_salesforce = a.cle_valeur and c.proprietaire_id is null
--    and lower(a.email) = 'e.eyoa@kiwee-energie.fr';
--
-- update public.contrats c set cree_par_id = p.id, date_modification = now()
--   from public.proprietaires_en_attente a
--   join public.profils p on lower(p.email) = lower(a.email)
--  where a.table_nom = 'contrats' and a.role = 'createur' and a.cle_type = 'id_salesforce'
--    and c.id_salesforce = a.cle_valeur and c.cree_par_id is null
--    and lower(a.email) = 'e.eyoa@kiwee-energie.fr';
--
-- update public.recommandations r set proprietaire_id = p.id, date_modification = now()
--   from public.proprietaires_en_attente a
--   join public.profils p on lower(p.email) = lower(a.email)
--  where a.table_nom = 'recommandations' and a.role = 'proprietaire'
--    and r.nom = a.cle_valeur and r.compte_id = a.compte_id and r.proprietaire_id is null
--    and lower(a.email) = 'e.eyoa@kiwee-energie.fr';
--
-- update public.compteurs cp set cree_par_id = p.id, date_modification = now()
--   from public.proprietaires_en_attente a
--   join public.profils p on lower(p.email) = lower(a.email)
--  where a.table_nom = 'compteurs' and a.role = 'createur'
--    and cp.numero_point = a.cle_valeur and cp.cree_par_id is null
--    and lower(a.email) = 'e.eyoa@kiwee-energie.fr';
--
-- -- Puis purger ce qui a trouvé preneur.
-- delete from public.proprietaires_en_attente a
--  using public.profils p
--  where lower(p.email) = lower(a.email)
--    and lower(a.email) = 'e.eyoa@kiwee-energie.fr';
--
-- commit;
--
-- CONTRÔLE
--   select email, table_nom, role, count(*) from public.proprietaires_en_attente
--    group by 1,2,3 order by 4 desc;
