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
-- version_actuelle est vrai puisqu'il n'y en a pas d'autre. Le nom de la cotation Salesforce est
-- conserve dans le champ nom, pour retrouver l'origine.
-- ============================================================================================

begin;

-- --------------------------------------------------------------------------------------------
-- 1. Les versions
-- --------------------------------------------------------------------------------------------
insert into public.versions_recommandation
  (id, recommandation_id, numero_version, statut_version_id, date_creation, version_actuelle, nom)
values
  ('38c56b1b-dca2-4062-88da-732b27dba8da'::uuid, '9d06d5bd-5826-4ffc-a10c-6e84945f5d34'::uuid, 1, '254e33da-e185-4534-ac72-9e9989d386c2'::uuid, '2026-08-04T07:23:33.000+0000'::timestamptz, true, 'COT-GAZ-LEMANOIR-20260804-765'),
  ('3e9ebe59-b7f6-4388-923f-1fbf15719387'::uuid, 'c6c5b53b-d5bf-4406-aecc-7e0f20a032a7'::uuid, 1, 'ff5586e0-91c1-4d20-b519-c3b5a1564960'::uuid, '2026-08-05T15:41:51.000+0000'::timestamptz, true, 'COT-ÉLE-ERHAIMMOBI-20260805-712'),
  ('272fcf35-3e15-409b-92f3-aa94c3a306a5'::uuid, '53eb43e4-6232-4a4a-a87c-2ccc74c50a79'::uuid, 1, '254e33da-e185-4534-ac72-9e9989d386c2'::uuid, '2026-08-05T15:44:10.000+0000'::timestamptz, true, 'COT-GAZ-ERHAIMMOBI-20260805-276'),
  ('b22cbee8-7896-4595-afeb-3a622d8e3db8'::uuid, 'aec66e3b-76e7-4342-bbe6-36dca156e8a9'::uuid, 1, '254e33da-e185-4534-ac72-9e9989d386c2'::uuid, '2026-08-05T15:46:19.000+0000'::timestamptz, true, 'COT-ÉLE-ETUDECARAU-20260805-167'),
  ('8fe39b72-9789-4ebb-b678-632830136c33'::uuid, 'e141960c-5749-430d-915d-dc0bb406c465'::uuid, 1, 'ff5586e0-91c1-4d20-b519-c3b5a1564960'::uuid, '2026-08-05T15:50:52.000+0000'::timestamptz, true, 'COT-GAZ-SYNDCOPRDU-20260805-772'),
  ('79fc3861-2924-427d-846d-c6530b37b155'::uuid, 'c2174136-dcad-4ee8-9158-2496291a534e'::uuid, 1, '254e33da-e185-4534-ac72-9e9989d386c2'::uuid, '2026-08-06T05:33:59.000+0000'::timestamptz, true, 'COT-GAZ-SASTVPJ-20260806-494'),
  ('b9a002aa-d550-44a4-bd20-9830224eb879'::uuid, 'dca6e74c-a858-4544-a1bd-de95011387a1'::uuid, 1, 'ff5586e0-91c1-4d20-b519-c3b5a1564960'::uuid, '2026-08-10T08:18:38.000+0000'::timestamptz, true, 'COT-GAZ-PLISSONIMM-20260810-950'),
  ('f402d7e5-8fcd-460a-ae9b-b4e5f9e5f312'::uuid, '31895129-f8e7-4eac-b1e8-8689a5b8fced'::uuid, 1, '254e33da-e185-4534-ac72-9e9989d386c2'::uuid, '2026-08-10T13:18:39.000+0000'::timestamptz, true, 'COT-ÉLE-CABINETIMM-20260810-445'),
  ('039a0a9d-1af8-42e8-84be-ff647a19eb85'::uuid, '8deb0671-5df4-4c4f-b798-9b45945a4ebd'::uuid, 1, 'ff5586e0-91c1-4d20-b519-c3b5a1564960'::uuid, '2026-08-14T12:45:38.000+0000'::timestamptz, true, 'COT-GAZ-CABINETMOL-20260814-364')
on conflict (id) do nothing;

-- --------------------------------------------------------------------------------------------
-- 2. Les PDL portes par ces versions
-- --------------------------------------------------------------------------------------------
-- Repris des compteurs de la recommandation : une version couvre les memes points de livraison.
insert into public.versions_recommandation_compteurs (id, version_recommandation_id, compteur_id)
values
  ('4646df56-9e71-4b72-a5d2-690ea29de611'::uuid, '38c56b1b-dca2-4062-88da-732b27dba8da'::uuid, '1d721c03-b7b6-479e-8a45-6e027519fb8e'::uuid),
  ('26f476d4-4a1a-4fc2-b02c-a1b95216a680'::uuid, '3e9ebe59-b7f6-4388-923f-1fbf15719387'::uuid, '11a43efa-b231-442b-98e9-d0e7311dbaf2'::uuid),
  ('9c4904d8-7fc4-4d31-8c67-5e0ba08cb0d7'::uuid, '3e9ebe59-b7f6-4388-923f-1fbf15719387'::uuid, 'd3c30dc5-ba99-4335-b614-955f45896df0'::uuid),
  ('58f4d1de-1bdb-4f38-855c-df5569a1431f'::uuid, '3e9ebe59-b7f6-4388-923f-1fbf15719387'::uuid, 'f86b6081-8b24-46d9-9f9e-4b82edf958fe'::uuid),
  ('4e6b1a6b-4d1c-4a72-ae55-5e880a915a37'::uuid, '272fcf35-3e15-409b-92f3-aa94c3a306a5'::uuid, '53814f35-34c8-44e0-9d45-db3882c6450e'::uuid),
  ('835e05ab-a0c0-4907-ab2c-7b6d812fabe0'::uuid, 'b22cbee8-7896-4595-afeb-3a622d8e3db8'::uuid, '24dd978b-3de6-45c1-aa13-092e2086c0c7'::uuid),
  ('63b3bcb9-ab1a-4c0a-9421-6296638982fb'::uuid, '8fe39b72-9789-4ebb-b678-632830136c33'::uuid, 'bc704a0c-b754-4e8b-9b3b-c4f2c39f3335'::uuid),
  ('f8f7c4d1-74f1-4ede-8ecc-44b6183ab419'::uuid, '79fc3861-2924-427d-846d-c6530b37b155'::uuid, 'c705cf02-a2ef-477f-8842-d0ea7ae98273'::uuid),
  ('397681fd-8fe4-464a-a2a3-2891d4d676f2'::uuid, 'b9a002aa-d550-44a4-bd20-9830224eb879'::uuid, '39740ac3-55bc-40ba-b825-1677873968dc'::uuid),
  ('f3553e52-f8dd-42c8-95c5-8a599259f62d'::uuid, 'f402d7e5-8fcd-460a-ae9b-b4e5f9e5f312'::uuid, '4250a65e-f414-4195-b11a-a7fec626ba00'::uuid),
  ('d7a004d9-c57f-452c-ae4d-046312523d8f'::uuid, '039a0a9d-1af8-42e8-84be-ff647a19eb85'::uuid, '36546ecc-4bf7-4f13-a842-8ff1f5f5f26e'::uuid)
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
