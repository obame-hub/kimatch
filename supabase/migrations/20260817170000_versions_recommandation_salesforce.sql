-- Versions de recommandation : la traçabilité Salesforce et le lien Eneo.
--
-- CONSTAT DU 17/08/2026, en interrogeant l'org KiweeOrg directement. L'objet `Cotation__c` — qui est
-- notre `versions_recommandation` — porte **39 champs personnalisés**. L'extraction de reprise n'en
-- avait pris que cinq : Id, Name, Opportunit__c, Statut__c, CreatedDate. Tout le reste existe côté
-- Salesforce depuis toujours et n'est nulle part chez nous :
--
--   Lien_Eneo__c              1069 cotations renseignées
--   Livraison_attendue_le__c  1989
--   Prix_nergie__c            1740
--   Dur_e_d_engagement__c     1517
--
-- `date_souhaitee` et `types_prix` existent déjà sur la table (migration du 06/08) : cette migration
-- n'ajoute que les deux colonnes qui manquent vraiment.
--
-- ── 1. `id_salesforce` : le préalable à tout réimport ──────────────────────────────────────────
-- Nos versions n'ont AUCUN identifiant Salesforce. L'appariement doit donc se faire par ordre de
-- création — ce qui marche aujourd'hui (1423 opportunités sur 1504 ont le même nombre de cotations
-- des deux côtés) mais ne marchera plus dès qu'une version sera créée dans Kimatch sans exister dans
-- Salesforce. Sans cette colonne, chaque réimport futur devient un rapprochement approximatif.
--
-- La leçon est déjà écrite ailleurs dans ce schéma : `mandats.id_salesforce` contenait le NOM et non
-- l'Id, ce qui a coûté une reprise entière. On stocke donc l'Id Salesforce, pas le libellé.
--
-- ── 2. `lien_eneo` : l'étude client existe déjà ────────────────────────────────────────────────
-- L'« étude client » de la maquette de William n'est pas à inventer : c'est **Eneo**, un outil
-- externe, avec un lien par cotation (`https://my.eneo.app/etude/appel-offres/<uuid>`). J'avais créé
-- la veille une table `partages_etude_client` avec son propre jeton et son compteur de visites — un
-- lien maison à côté d'un lien qui existait déjà. Décision de Naoëlle du 17/08/2026 : on importe et
-- on affiche le lien Eneo ; l'étude maison viendra plus tard, et la table de partage reste en place
-- pour ce jour-là.
--
-- Quatre formes d'URL cohabitent dans Salesforce (`/etude/appel-offres/`, `/etude/consultation/`,
-- sur `my.eneo.app` comme sur `fr.eneo.app`, et quelques `/compte/`). On importe l'URL telle quelle
-- sans la normaliser : ces liens sont des adresses réelles ouvertes par des humains, les réécrire
-- risquerait de les casser.

begin;

alter table public.versions_recommandation
  add column if not exists id_salesforce text,
  add column if not exists lien_eneo text;

comment on column public.versions_recommandation.id_salesforce is
  'Id de la Cotation__c d''origine (l''Id, jamais le nom — voir la reprise des mandats). Permet de réimporter sans rapprocher par ordre de création.';
comment on column public.versions_recommandation.lien_eneo is
  'Lien Eneo de la cotation : l''étude client, dans l''outil externe. Importé de Cotation__c.Lien_Eneo__c, non normalisé.';

-- Unicité de l'identifiant Salesforce, mais seulement là où il est renseigné : deux versions ne
-- peuvent pas venir de la même cotation, et les versions nées dans Kimatch n'en ont pas.
create unique index if not exists idx_versions_recommandation_id_salesforce
  on public.versions_recommandation (id_salesforce)
  where id_salesforce is not null;

commit;

-- Vérification après application (à coller tel quel) :
--
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='versions_recommandation'
--     and column_name in ('id_salesforce','lien_eneo');
--   -- attendu : 2 lignes
--
--   select count(*) from public.versions_recommandation;
--   -- attendu : 2011, inchangé (cette migration n'écrit aucune donnée)
--
-- Les données arrivent avec la migration suivante, 20260817180000_import_cotations_salesforce.sql.
