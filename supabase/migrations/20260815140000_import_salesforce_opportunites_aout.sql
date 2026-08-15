-- ============================================================================================
-- IMPORT SALESFORCE -> KIMATCH : les opportunites d'aout, en recommandations
-- ============================================================================================
-- Deuxieme volet de la reprise du 15/08/2026. Le premier (20260815130000) a ramene les mandats ;
-- celui-ci ramene le travail commercial qui les accompagne.
--
-- Douze opportunites ont ete creees dans Salesforce en aout. Une seule etait deja dans Kimatch
-- (CABINET ROUMILHAC JOURDAN, reprise le 13/08 avec le lot Marie). Sont ecartees :
--   - « TEST KIMATCH CIRCUIT - SITE TEST CIRCUIT » : jeu d'essai.
--   - « KIWEE ENERGIE FRANCE - STADE DE FRANCE » : compte interne, ecartee comme l'a ete son
--     mandat 001734. A confirmer par Naoelle si c'etait une vraie affaire.
--
-- CORRESPONDANCE DES ETAPES. Elle suit la reunion du 12/08/2026 citee par la migration
-- 20260812090000 : « Negociation, contractualisation, tout ca, c'etait decision ».
--   Negociation, Contractualisation -> DECISION
--   Instruction, Nouvelle           -> DIAGNOSTIC
--
-- RESERVE A LEVER PAR NAOELLE sur « Instruction ». La meme reunion dit aussi « Consultation, ca
-- correspondait a En instruction », ce qui menerait a CONSULTATION plutot qu'a DIAGNOSTIC.
-- On retient DIAGNOSTIC parce que c'est ce qu'a fait le lot Marie du 13/08, seul precedent posterieur
-- au remappage, pour une opportunite « Instruction » : CABINET ROUMILHAC JOURDAN, aujourd'hui en
-- DIAGNOSTIC. C'est un choix de coherence avec le precedent, pas une lecture du stock : la
-- repartition actuelle (CLOTURE 1573, CONSULTATION 93, DIAGNOSTIC 24, DECISION 4) ne permet pas de
-- retrouver de quel StageName chaque ligne venait, l'origine Salesforce n'etant conservee nulle part
-- sur les recommandations.
-- Si l'intention metier est bien CONSULTATION, c'est l'ensemble du stock qu'il faut reprendre et pas
-- seulement ces neuf lignes : d'ou le choix de ne rien faire d'exceptionnel ici.
--
-- L'energie est lue dans l'emoji que Salesforce met en tete du nom de l'opportunite
-- (⚡ electricite, 🔥 gaz), qui est la seule marque d'energie portee par l'objet.
-- ============================================================================================

begin;

insert into public.recommandations (id, compte_id, nom, etape_id, type_energie_id,
                                    responsable_profil_id, date_ouverture, actif,
                                    date_creation, date_modification, proprietaire_id, cree_par_id)
values
  ('9d06d5bd-5826-4ffc-a10c-6e84945f5d34', '4c5e1a59-c5de-4e3f-b274-a3420521703f', '🔥 LE MANOIR - SDC 85 FAIDHERBE', '971f0585-0f7b-45b2-abb9-5246c747780a', '759d3897-9c8b-4fdc-ba6f-ce6dc330f4fc', '9106d955-5b85-40d5-adc9-26f03495079a', '2026-08-04T07:21:48.000+0000', true, '2026-08-04T07:21:48.000+0000', '2026-08-04T07:21:48.000+0000', '9106d955-5b85-40d5-adc9-26f03495079a', '9106d955-5b85-40d5-adc9-26f03495079a'),
  ('c6c5b53b-d5bf-4406-aecc-7e0f20a032a7', 'ea160a11-563e-4afd-8b12-fe423c6c4807', '⚡ MULTISITE - 2026-08-31 - ERHA IMMOBILIER', '7cbe39a7-1cc5-4c0e-af3e-c9b471269de1', '332311d3-6006-4660-9c8d-b4176331e0b0', 'eae76279-6014-4043-8a35-19bce2429e75', '2026-08-05T15:41:01.000+0000', true, '2026-08-05T15:41:01.000+0000', '2026-08-05T15:41:01.000+0000', 'eae76279-6014-4043-8a35-19bce2429e75', 'eae76279-6014-4043-8a35-19bce2429e75'),
  ('53eb43e4-6232-4a4a-a87c-2ccc74c50a79', 'ea160a11-563e-4afd-8b12-fe423c6c4807', '🔥 ERHA IMMOBILIER - Vichy', '7cbe39a7-1cc5-4c0e-af3e-c9b471269de1', '759d3897-9c8b-4fdc-ba6f-ce6dc330f4fc', 'eae76279-6014-4043-8a35-19bce2429e75', '2026-08-05T15:43:56.000+0000', true, '2026-08-05T15:43:56.000+0000', '2026-08-05T15:43:56.000+0000', 'eae76279-6014-4043-8a35-19bce2429e75', 'eae76279-6014-4043-8a35-19bce2429e75'),
  ('aec66e3b-76e7-4342-bbe6-36dca156e8a9', 'fd3b0d9d-6974-4240-8754-bca028f334f4', '⚡ ETUDE CARAUDREY TRANSACTIONS ET GESTION E.C.T.G - SDC 99 AVENUE MAURICE THOREZ', '7cbe39a7-1cc5-4c0e-af3e-c9b471269de1', '332311d3-6006-4660-9c8d-b4176331e0b0', 'eae76279-6014-4043-8a35-19bce2429e75', '2026-08-05T15:46:05.000+0000', true, '2026-08-05T15:46:05.000+0000', '2026-08-05T15:46:05.000+0000', 'eae76279-6014-4043-8a35-19bce2429e75', 'eae76279-6014-4043-8a35-19bce2429e75'),
  ('e141960c-5749-430d-915d-dc0bb406c465', '45026ae6-fb84-4f9a-a85f-2e922a020521', '🔥 SYND.COPR. DU 17 RUE PAUL FEVAL PARIS 18 - SDC 17 RUE PAUL FEVAL', '7cbe39a7-1cc5-4c0e-af3e-c9b471269de1', '759d3897-9c8b-4fdc-ba6f-ce6dc330f4fc', 'eae76279-6014-4043-8a35-19bce2429e75', '2026-08-05T15:50:16.000+0000', true, '2026-08-05T15:50:16.000+0000', '2026-08-05T15:50:16.000+0000', 'eae76279-6014-4043-8a35-19bce2429e75', 'eae76279-6014-4043-8a35-19bce2429e75'),
  ('c2174136-dcad-4ee8-9158-2496291a534e', '26ba8917-70f5-4042-9600-35b8b237d6cc', '🔥 SAS TVPJ - SDC 13B RUE DE LA CLOCHE', '971f0585-0f7b-45b2-abb9-5246c747780a', '759d3897-9c8b-4fdc-ba6f-ce6dc330f4fc', '9106d955-5b85-40d5-adc9-26f03495079a', '2026-08-06T05:32:24.000+0000', true, '2026-08-06T05:32:24.000+0000', '2026-08-06T05:32:24.000+0000', '9106d955-5b85-40d5-adc9-26f03495079a', '9106d955-5b85-40d5-adc9-26f03495079a'),
  ('dca6e74c-a858-4544-a1bd-de95011387a1', '010dcbe6-1b4c-4082-83ca-e8c9a03bc14d', '🔥 PLISSON IMMOBILIER - SDC 176 BOULEVARD BINEAU', '7cbe39a7-1cc5-4c0e-af3e-c9b471269de1', '759d3897-9c8b-4fdc-ba6f-ce6dc330f4fc', '9106d955-5b85-40d5-adc9-26f03495079a', '2026-08-10T08:18:04.000+0000', true, '2026-08-10T08:18:04.000+0000', '2026-08-10T08:18:04.000+0000', '9106d955-5b85-40d5-adc9-26f03495079a', '9106d955-5b85-40d5-adc9-26f03495079a'),
  ('31895129-f8e7-4eac-b1e8-8689a5b8fced', '52ffe374-9ba1-4e8b-a61c-a3970ae9c02b', '⚡ CABINET IMMOBILIER RIVET-LENOBLE - SDC 35BRANLY', '7cbe39a7-1cc5-4c0e-af3e-c9b471269de1', '332311d3-6006-4660-9c8d-b4176331e0b0', '9106d955-5b85-40d5-adc9-26f03495079a', '2026-08-10T13:18:02.000+0000', true, '2026-08-10T13:18:02.000+0000', '2026-08-10T13:18:02.000+0000', '9106d955-5b85-40d5-adc9-26f03495079a', '9106d955-5b85-40d5-adc9-26f03495079a'),
  ('8deb0671-5df4-4c4f-b798-9b45945a4ebd', 'ea100783-ac16-44bf-b5aa-7a8083c02239', '🔥 CABINET MOLINIER - SDC LE FONTENAY', '7cbe39a7-1cc5-4c0e-af3e-c9b471269de1', '759d3897-9c8b-4fdc-ba6f-ce6dc330f4fc', '14483439-27d3-4e48-b0db-b074b4fe2f4a', '2026-08-14T12:44:59.000+0000', true, '2026-08-14T12:44:59.000+0000', '2026-08-14T12:44:59.000+0000', '14483439-27d3-4e48-b0db-b074b4fe2f4a', '14483439-27d3-4e48-b0db-b074b4fe2f4a')
on conflict (id) do nothing;

-- Sites couverts, deduits des PDL rattaches a l'opportunite.
insert into public.recommandations_sites (id, recommandation_id, site_id, actif, date_creation, date_modification)
values
  ('139d79f1-8fdd-4388-bca0-86811642f737', '9d06d5bd-5826-4ffc-a10c-6e84945f5d34', 'd9f3bb10-e6a7-4125-9b36-88513f9241fd', true, '2026-08-04T07:21:48.000+0000', '2026-08-04T07:21:48.000+0000'),
  ('8f38b303-2f08-4d38-836c-a3f8dbffbd12', 'c6c5b53b-d5bf-4406-aecc-7e0f20a032a7', '0b2f9f1b-9aa4-4f36-acb2-35e0594b8167', true, '2026-08-05T15:41:01.000+0000', '2026-08-05T15:41:01.000+0000'),
  ('b66e6c7e-d993-4129-9b3f-2dd7845e1495', 'c6c5b53b-d5bf-4406-aecc-7e0f20a032a7', '055e1556-ba11-4a87-b172-e3da72934ddd', true, '2026-08-05T15:41:01.000+0000', '2026-08-05T15:41:01.000+0000'),
  ('3473818d-555f-4e8a-9e48-9e80c5163f3a', 'c6c5b53b-d5bf-4406-aecc-7e0f20a032a7', '1732878d-4c16-4f13-b8ac-7672bea5c2c8', true, '2026-08-05T15:41:01.000+0000', '2026-08-05T15:41:01.000+0000'),
  ('d42b85ff-1ca1-4b85-896d-ae9151c18c42', '53eb43e4-6232-4a4a-a87c-2ccc74c50a79', '055e1556-ba11-4a87-b172-e3da72934ddd', true, '2026-08-05T15:43:56.000+0000', '2026-08-05T15:43:56.000+0000'),
  ('a35ff2c8-326b-440a-aca3-67ace7edb825', 'aec66e3b-76e7-4342-bbe6-36dca156e8a9', '8955a305-d0bf-4dee-8c9b-a3fbe22e600c', true, '2026-08-05T15:46:05.000+0000', '2026-08-05T15:46:05.000+0000'),
  ('a491328d-c106-4520-83c1-a7a4651bda64', 'e141960c-5749-430d-915d-dc0bb406c465', '02f15b2a-8208-41a9-b698-31cc4037d805', true, '2026-08-05T15:50:16.000+0000', '2026-08-05T15:50:16.000+0000'),
  ('2805aee1-d360-45bc-82a3-78574d135256', 'c2174136-dcad-4ee8-9158-2496291a534e', '688a2214-44f1-4630-8042-e2fb7a4f6a67', true, '2026-08-06T05:32:24.000+0000', '2026-08-06T05:32:24.000+0000'),
  ('f8474379-903f-4dd5-85ee-8ce26c06b6ab', 'dca6e74c-a858-4544-a1bd-de95011387a1', 'acd8e15b-c85e-4e19-9427-f1a89580c0bf', true, '2026-08-10T08:18:04.000+0000', '2026-08-10T08:18:04.000+0000'),
  ('41d6c9be-e207-4585-a25f-596785648e88', '31895129-f8e7-4eac-b1e8-8689a5b8fced', '0ec4ca0a-f078-4a65-9e1a-f7f7af22fd92', true, '2026-08-10T13:18:02.000+0000', '2026-08-10T13:18:02.000+0000'),
  ('d5aea25c-be69-4478-a32c-460f60f6e3c4', '8deb0671-5df4-4c4f-b798-9b45945a4ebd', 'dc64508a-14d7-439b-a2f3-c842a5480c76', true, '2026-08-14T12:44:59.000+0000', '2026-08-14T12:44:59.000+0000')
on conflict (id) do nothing;

-- PDL couverts.
insert into public.recommandations_compteurs (recommandation_id, compteur_id)
values
  ('9d06d5bd-5826-4ffc-a10c-6e84945f5d34', '1d721c03-b7b6-479e-8a45-6e027519fb8e'),
  ('c6c5b53b-d5bf-4406-aecc-7e0f20a032a7', 'f86b6081-8b24-46d9-9f9e-4b82edf958fe'),
  ('c6c5b53b-d5bf-4406-aecc-7e0f20a032a7', 'd3c30dc5-ba99-4335-b614-955f45896df0'),
  ('c6c5b53b-d5bf-4406-aecc-7e0f20a032a7', '11a43efa-b231-442b-98e9-d0e7311dbaf2'),
  ('53eb43e4-6232-4a4a-a87c-2ccc74c50a79', '53814f35-34c8-44e0-9d45-db3882c6450e'),
  ('aec66e3b-76e7-4342-bbe6-36dca156e8a9', '24dd978b-3de6-45c1-aa13-092e2086c0c7'),
  ('e141960c-5749-430d-915d-dc0bb406c465', 'bc704a0c-b754-4e8b-9b3b-c4f2c39f3335'),
  ('c2174136-dcad-4ee8-9158-2496291a534e', 'c705cf02-a2ef-477f-8842-d0ea7ae98273'),
  ('dca6e74c-a858-4544-a1bd-de95011387a1', '39740ac3-55bc-40ba-b825-1677873968dc'),
  ('31895129-f8e7-4eac-b1e8-8689a5b8fced', '4250a65e-f414-4195-b11a-a7fec626ba00'),
  ('8deb0671-5df4-4c4f-b798-9b45945a4ebd', '36546ecc-4bf7-4f13-a842-8ff1f5f5f26e')
on conflict do nothing;

commit;

-- ============================================================================================
-- CONTROLE APRES APPLICATION
-- ============================================================================================
--   select r.nom, cp.nom compte, e.code etape, count(rc.compteur_id) pdl
--   from recommandations r
--   left join comptes cp on cp.id = r.compte_id
--   left join etapes_recommandation e on e.id = r.etape_id
--   left join recommandations_compteurs rc on rc.recommandation_id = r.id
--   where r.date_creation >= '2026-08-01' and r.date_creation < '2026-08-15'
--   group by 1,2,3 order by r.nom;
--
-- Attendu : 9 nouvelles lignes, plus les deux qui existaient deja (AMETIS et ROUMILHAC).
