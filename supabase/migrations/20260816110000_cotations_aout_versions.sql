-- ============================================================================================
-- COTATIONS D'AOUT : creer les versions de recommandation qui manquaient
-- ============================================================================================
-- Dix-sept cotations ont ete creees dans Salesforce en aout. La reprise du 15/08 s'est arretee aux
-- mandats et aux opportunites : les cotations, qui deviennent des VERSIONS de recommandation dans
-- Kimatch, n'ont pas suivi.
--
-- Etat constate le 16/08/2026, cotation par cotation :
--    6 portaient sur une recommandation qui a deja une version — rien a faire
--    9 portaient sur une recommandation existante SANS aucune version — c'est l'objet de ce fichier
--    2 portaient sur l'opportunite « KIWEE ENERGIE FRANCE - STADE DE FRANCE », ecartee de l'import
--      du 15/08 comme son mandat (compte interne). Elles restent ecartees, par coherence.
--
-- Une recommandation sans version, c'est une affaire qu'on ne peut pas faire avancer : c'est la
-- version qui porte les durees, les prix consultes et les offres.
--
-- CORRESPONDANCE DES STATUTS. « Nouvelle » suit le precedent du lot Marie (20260813200000), qui
-- l'avait rendue en EN_CONSTRUCTION. « En instruction » la rejoint : dans les deux cas l'offre
-- n'est pas encore sortie. « Disponible » devient DISPONIBLE.
--
-- Le numero de version vaut 1 : ce sont les premieres versions de ces recommandations, et
-- version_actuelle est vrai puisqu'il n'y en a pas d'autre.
--
-- MOTIF ET NOM suivent l'existant plutot qu'une invention : motif_version_id et nom sont NOT NULL,
-- les 1495 versions v1 deja en base portent toutes CREATION_INITIALE, et le lot Marie nommait la
-- sienne « Version 1 ». La reference de la cotation Salesforce va dans commentaire_interne, ou
-- elle sert a retrouver l'origine sans polluer le nom affiche.
-- ============================================================================================

begin;

-- --------------------------------------------------------------------------------------------
-- 1. Les versions
-- --------------------------------------------------------------------------------------------
insert into public.versions_recommandation
  (id, recommandation_id, numero_version, motif_version_id, statut_version_id, date_creation,
   version_actuelle, nom, commentaire_interne)
values
  ('ec304aaa-9716-4214-a1f0-7f1a926c437d'::uuid, '9d06d5bd-5826-4ffc-a10c-6e84945f5d34'::uuid, 1, 'c08e98eb-2724-4525-b16d-bdb6b793249e'::uuid, '254e33da-e185-4534-ac72-9e9989d386c2'::uuid, '2026-08-04T07:23:33.000+0000'::timestamptz, true, 'Version 1', 'Reprise de la cotation Salesforce COT-GAZ-LEMANOIR-20260804-765'),
  ('abf6e6b0-9d38-438d-8e9e-2e97b616c328'::uuid, 'c6c5b53b-d5bf-4406-aecc-7e0f20a032a7'::uuid, 1, 'c08e98eb-2724-4525-b16d-bdb6b793249e'::uuid, 'ff5586e0-91c1-4d20-b519-c3b5a1564960'::uuid, '2026-08-05T15:41:51.000+0000'::timestamptz, true, 'Version 1', 'Reprise de la cotation Salesforce COT-ÉLE-ERHAIMMOBI-20260805-712'),
  ('ebc4c53f-104b-467f-8b7d-8e433016061a'::uuid, '53eb43e4-6232-4a4a-a87c-2ccc74c50a79'::uuid, 1, 'c08e98eb-2724-4525-b16d-bdb6b793249e'::uuid, '254e33da-e185-4534-ac72-9e9989d386c2'::uuid, '2026-08-05T15:44:10.000+0000'::timestamptz, true, 'Version 1', 'Reprise de la cotation Salesforce COT-GAZ-ERHAIMMOBI-20260805-276'),
  ('bcc56d2d-3b86-4bbf-bfc4-0419988d414e'::uuid, 'aec66e3b-76e7-4342-bbe6-36dca156e8a9'::uuid, 1, 'c08e98eb-2724-4525-b16d-bdb6b793249e'::uuid, '254e33da-e185-4534-ac72-9e9989d386c2'::uuid, '2026-08-05T15:46:19.000+0000'::timestamptz, true, 'Version 1', 'Reprise de la cotation Salesforce COT-ÉLE-ETUDECARAU-20260805-167'),
  ('1bbecc42-9808-4187-80f3-cdbd0f9ba990'::uuid, 'e141960c-5749-430d-915d-dc0bb406c465'::uuid, 1, 'c08e98eb-2724-4525-b16d-bdb6b793249e'::uuid, 'ff5586e0-91c1-4d20-b519-c3b5a1564960'::uuid, '2026-08-05T15:50:52.000+0000'::timestamptz, true, 'Version 1', 'Reprise de la cotation Salesforce COT-GAZ-SYNDCOPRDU-20260805-772'),
  ('812790f5-c0ca-4c00-94fc-0e8826f436f3'::uuid, 'c2174136-dcad-4ee8-9158-2496291a534e'::uuid, 1, 'c08e98eb-2724-4525-b16d-bdb6b793249e'::uuid, '254e33da-e185-4534-ac72-9e9989d386c2'::uuid, '2026-08-06T05:33:59.000+0000'::timestamptz, true, 'Version 1', 'Reprise de la cotation Salesforce COT-GAZ-SASTVPJ-20260806-494'),
  ('a054b54f-a48b-4a51-bffc-be986cf47b18'::uuid, 'dca6e74c-a858-4544-a1bd-de95011387a1'::uuid, 1, 'c08e98eb-2724-4525-b16d-bdb6b793249e'::uuid, 'ff5586e0-91c1-4d20-b519-c3b5a1564960'::uuid, '2026-08-10T08:18:38.000+0000'::timestamptz, true, 'Version 1', 'Reprise de la cotation Salesforce COT-GAZ-PLISSONIMM-20260810-950'),
  ('e0db4276-a5f8-43fa-83cb-33c272644907'::uuid, '31895129-f8e7-4eac-b1e8-8689a5b8fced'::uuid, 1, 'c08e98eb-2724-4525-b16d-bdb6b793249e'::uuid, '254e33da-e185-4534-ac72-9e9989d386c2'::uuid, '2026-08-10T13:18:39.000+0000'::timestamptz, true, 'Version 1', 'Reprise de la cotation Salesforce COT-ÉLE-CABINETIMM-20260810-445'),
  ('ca13b4b8-8d10-46a5-a643-c2c628f03bcd'::uuid, '8deb0671-5df4-4c4f-b798-9b45945a4ebd'::uuid, 1, 'c08e98eb-2724-4525-b16d-bdb6b793249e'::uuid, 'ff5586e0-91c1-4d20-b519-c3b5a1564960'::uuid, '2026-08-14T12:45:38.000+0000'::timestamptz, true, 'Version 1', 'Reprise de la cotation Salesforce COT-GAZ-CABINETMOL-20260814-364')
on conflict (id) do nothing;

-- --------------------------------------------------------------------------------------------
-- 2. Les PDL portes par ces versions
-- --------------------------------------------------------------------------------------------
-- Repris des compteurs de la recommandation : une version couvre les memes points de livraison.
insert into public.versions_recommandation_compteurs (id, version_recommandation_id, compteur_id)
values
  ('73053688-8559-4f78-b4bd-41b305a1acf0'::uuid, 'ec304aaa-9716-4214-a1f0-7f1a926c437d'::uuid, '1d721c03-b7b6-479e-8a45-6e027519fb8e'::uuid),
  ('c8480b6b-8d23-4003-9872-f291128b8573'::uuid, 'abf6e6b0-9d38-438d-8e9e-2e97b616c328'::uuid, '11a43efa-b231-442b-98e9-d0e7311dbaf2'::uuid),
  ('f8d37222-6fb6-4e90-bcd4-2d6c576c68c8'::uuid, 'abf6e6b0-9d38-438d-8e9e-2e97b616c328'::uuid, 'd3c30dc5-ba99-4335-b614-955f45896df0'::uuid),
  ('706eabe8-c0d6-4bb6-b6b8-1f5fdc369115'::uuid, 'abf6e6b0-9d38-438d-8e9e-2e97b616c328'::uuid, 'f86b6081-8b24-46d9-9f9e-4b82edf958fe'::uuid),
  ('55b841a3-5790-4636-9998-7730fc6319e6'::uuid, 'ebc4c53f-104b-467f-8b7d-8e433016061a'::uuid, '53814f35-34c8-44e0-9d45-db3882c6450e'::uuid),
  ('16bc2cd5-20bb-47ca-bad7-d1b87d6ca89d'::uuid, 'bcc56d2d-3b86-4bbf-bfc4-0419988d414e'::uuid, '24dd978b-3de6-45c1-aa13-092e2086c0c7'::uuid),
  ('8f38a303-7d61-426c-bace-66d09faa363e'::uuid, '1bbecc42-9808-4187-80f3-cdbd0f9ba990'::uuid, 'bc704a0c-b754-4e8b-9b3b-c4f2c39f3335'::uuid),
  ('31573c62-0f2d-49c3-bd12-5e69510a6659'::uuid, '812790f5-c0ca-4c00-94fc-0e8826f436f3'::uuid, 'c705cf02-a2ef-477f-8842-d0ea7ae98273'::uuid),
  ('17e60615-b160-44ef-a6ef-34e90ccda0a5'::uuid, 'a054b54f-a48b-4a51-bffc-be986cf47b18'::uuid, '39740ac3-55bc-40ba-b825-1677873968dc'::uuid),
  ('f031c67a-0454-4d81-b21f-a364ba0a6aa5'::uuid, 'e0db4276-a5f8-43fa-83cb-33c272644907'::uuid, '4250a65e-f414-4195-b11a-a7fec626ba00'::uuid),
  ('36dd9b00-7159-49f0-b8da-778191ae76f5'::uuid, 'ca13b4b8-8d10-46a5-a643-c2c628f03bcd'::uuid, '36546ecc-4bf7-4f13-a842-8ff1f5f5f26e'::uuid)
on conflict (id) do nothing;

-- --------------------------------------------------------------------------------------------
-- 3. ROUMILHAC : retablir le lien recommandation - compteur
-- --------------------------------------------------------------------------------------------
-- « CABINET ROUMILHAC JOURDAN - SDC AMPLITUDE 2 » etait la seule recommandation d'aout sans aucun
-- PDL rattache. Sa version en porte pourtant un (GI155378) : c'est la liaison au niveau de la
-- recommandation elle-meme qui n'avait pas ete ecrite par la migration du 13/08. On la deduit de
-- la version plutot que de la ressaisir, pour ne pas risquer de designer un autre compteur.
insert into public.recommandations_compteurs (recommandation_id, compteur_id)
select distinct r.id, vc.compteur_id
from recommandations r
join versions_recommandation v on v.recommandation_id = r.id
join versions_recommandation_compteurs vc on vc.version_recommandation_id = v.id
where r.nom ilike '%ROUMILHAC%'
  and not exists (
    select 1 from recommandations_compteurs rc
    where rc.recommandation_id = r.id and rc.compteur_id = vc.compteur_id
  );

commit;

-- ============================================================================================
-- CONTROLE APRES APPLICATION
-- ============================================================================================
--   select r.nom, count(distinct v.id) versions, count(distinct rc.compteur_id) pdl
--   from recommandations r
--   left join versions_recommandation v on v.recommandation_id = r.id
--   left join recommandations_compteurs rc on rc.recommandation_id = r.id
--   where r.date_creation >= '2026-08-01' and r.date_creation < '2026-08-15'
--   group by r.nom order by r.nom;
--
-- Attendu : plus aucune recommandation d'aout sans version, et ROUMILHAC avec 1 PDL.
