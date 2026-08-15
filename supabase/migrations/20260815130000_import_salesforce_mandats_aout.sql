-- ============================================================================================
-- IMPORT SALESFORCE -> KIMATCH : les mandats saisis dans Salesforce entre le 04 et le 14/08/2026
-- ============================================================================================
-- Contexte : Kimatch buguant sur l'envoi DocuSign, l'equipe a continue de saisir dans Salesforce.
-- La reprise precedente s'arrete a « Mandat 001732 » (31/07/2026) ; seul « Mandat 001745 » a ete
-- rattrape depuis, par la migration 20260813200000. Il restait dix mandats non repris.
--
-- PERIMETRE, arrete avec Naoelle le 15/08/2026 : sept mandats sur dix.
--   Importes  : 001735 ERHA IMMOBILIER, 001736 SYND.COPR. 17 RUE PAUL FEVAL,
--               001737 ETUDE CARAUDREY, 001741 M. OHAYON NISSIM, 001742 PLISSON IMMOBILIER,
--               001743 CABINET IMMOBILIER RIVET-LENOBLE, 001744 SCEA LE MONTAGNER
--   Ecartes   : 001738 (compte « TEST KIMATCH CIRCUIT », jeu d'essai)
--               001746 CABINET MOLINIER  -- Kimatch porte deja deux mandats MOLINIER crees le
--                                           14/08, dont un SIGNE : ce serait un doublon
--               001734 KIWEE ENERGIE FRANCE -- statut Inactif cote Salesforce, et Kimatch porte
--                                           deja un mandat KIWEE du 15/08
--
-- L'ENVELOPPE DOCUSIGN : il n'y en a aucune a reprendre, et c'est verifie et non suppose.
-- dfsle__EnvelopeStatus__c compte 2090 enregistrements mais son dernier date du 24/07/2026 :
-- l'objet n'est plus alimente depuis la bascule. Les champs DS_* des sept mandats sont vides et
-- aucune enveloppe ne porte leur Id en dfsle__SourceId__c. Le statut signe vient donc du seul
-- champ Statut_Signature__c du mandat.
--
-- Correspondance de statuts : Statut « Actif » + Signature « Signé » -> statuts_mandats.ACTIF,
-- comme pour le lot Marie.
--
-- Les identifiants Salesforce sont ecrits dans mandats.id_salesforce sous leur forme d'IDENTIFIANT
-- (a03...), et non sous forme de nom. A noter : 1352 des 1353 mandats deja repris y portent le NOM
-- (« Mandat 000296 ») — anomalie des imports anterieurs, signalee a Naoelle le 15/08/2026, non
-- corrigee ici pour ne pas melanger deux sujets.
-- ============================================================================================

begin;

-- --------------------------------------------------------------------------------------------
-- 1. COMPTES absents de Kimatch
-- --------------------------------------------------------------------------------------------
-- Les quatre autres comptes existaient deja et ne sont pas touches.
insert into public.comptes (id, nom, type_compte_id, siren, ville, code_postal, rue, telephone,
                            actif, date_creation, date_modification, proprietaire_id, cree_par_id)
values
  ('ea160a11-563e-4afd-8b12-fe423c6c4807', 'ERHA IMMOBILIER', '50d1a2c6-2f9a-4579-aa5d-3baaeb455030', '104476718', null, null, null, '0663515724', true, '2026-08-05T10:11:32.000+0000', '2026-08-15T12:00:00Z', 'eae76279-6014-4043-8a35-19bce2429e75', 'eae76279-6014-4043-8a35-19bce2429e75'),
  ('45026ae6-fb84-4f9a-a85f-2e922a020521', 'SYND.COPR. DU 17 RUE PAUL FEVAL PARIS 18', '50d1a2c6-2f9a-4579-aa5d-3baaeb455030', null, null, null, null, '0632155721', true, '2026-08-05T10:36:30.000+0000', '2026-08-15T12:00:00Z', 'eae76279-6014-4043-8a35-19bce2429e75', 'eae76279-6014-4043-8a35-19bce2429e75'),
  ('4baa8822-0a77-4f1c-9e29-a9f25b343c41', 'M. OHAYON NISSIM (CPIDF IMMOBILIER)', '50d1a2c6-2f9a-4579-aa5d-3baaeb455030', '332755792', 'PARIS 1', '75001', '5 RUE ETIENNE MARCEL', null, true, '2026-08-06T10:16:17.000+0000', '2026-08-15T12:00:00Z', '14483439-27d3-4e48-b0db-b074b4fe2f4a', '14483439-27d3-4e48-b0db-b074b4fe2f4a')
on conflict (id) do nothing;

-- --------------------------------------------------------------------------------------------
-- 2. CONTACTS signataires absents de Kimatch
-- --------------------------------------------------------------------------------------------
insert into public.contacts (id, compte_id, prenom, nom, email, telephone, telephone_mobile,
                             fonction, actif, date_creation, date_modification,
                             proprietaire_id, cree_par_id)
values
  ('e8bb656f-88a5-4468-a175-312ccd462f52', 'ea160a11-563e-4afd-8b12-fe423c6c4807', 'Lucas', 'ERTZSCHEID', 'erha.immobilier@gmail.com', '0663515724', '0663515724', 'Gérant', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z', 'eae76279-6014-4043-8a35-19bce2429e75', 'eae76279-6014-4043-8a35-19bce2429e75'),
  ('db853819-13d3-48b6-ac33-975e01aee3ce', '45026ae6-fb84-4f9a-a85f-2e922a020521', 'Bruno', 'TOULOUT', 'sdc.17ruepaulfeval@mail.matera.eu', '0632155721', null, 'Président du CS', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z', 'eae76279-6014-4043-8a35-19bce2429e75', 'eae76279-6014-4043-8a35-19bce2429e75'),
  ('3a451cfc-6fb9-4c42-9288-8109c055a8b4', '52ffe374-9ba1-4e8b-a61c-a3970ae9c02b', 'Zlatko', 'ZLATKOVIC', 'zlatko.zlatkovic@jmrivet.fr', null, null, 'Gestionnaire', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z', '9106d955-5b85-40d5-adc9-26f03495079a', '9106d955-5b85-40d5-adc9-26f03495079a'),
  ('69b33c59-49a8-4027-93b2-81ad8e6aa2d1', '010dcbe6-1b4c-4082-83ca-e8c9a03bc14d', 'Clara', 'LACELLE', 'ac6@plisson-immobilier.fr', '+33183818874', null, 'Assistante de copropriété', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z', '9106d955-5b85-40d5-adc9-26f03495079a', '9106d955-5b85-40d5-adc9-26f03495079a')
on conflict (id) do nothing;

-- Rattachement au compte dans la table de liaison (contacts_comptes, depuis le 13/08/2026).
insert into public.contacts_comptes (id, contact_id, compte_id, relation_directe, actif, date_creation, date_modification)
values
  ('23ec499b-8cde-4029-bd81-93774d117fc5', 'e8bb656f-88a5-4468-a175-312ccd462f52', 'ea160a11-563e-4afd-8b12-fe423c6c4807', true, true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('3ee9a48a-3086-43a7-ac14-1675ba1f2b7d', 'db853819-13d3-48b6-ac33-975e01aee3ce', '45026ae6-fb84-4f9a-a85f-2e922a020521', true, true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('e7f3b790-7a32-4084-8150-0cc1f192496b', '3a451cfc-6fb9-4c42-9288-8109c055a8b4', '52ffe374-9ba1-4e8b-a61c-a3970ae9c02b', true, true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('5298a3a3-ff1b-4b15-ac93-42ff6108a61d', '69b33c59-49a8-4027-93b2-81ad8e6aa2d1', '010dcbe6-1b4c-4082-83ca-e8c9a03bc14d', true, true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z')
on conflict (id) do nothing;

-- --------------------------------------------------------------------------------------------
-- 3. SITES portes par les PDL a creer
-- --------------------------------------------------------------------------------------------
-- Un site par couple (compte, libelle de site) tel que Salesforce le nomme, comme le fait
-- transform.js. Les sites deja presents dans Kimatch pour le meme compte et le meme libelle ont
-- ete reutilises et n'apparaissent pas ici.
insert into public.sites (id, compte_id, nom, adresse, rue, ville, code_postal, pays, actif,
                          date_creation, date_modification)
values
  ('02f15b2a-8208-41a9-b698-31cc4037d805', '45026ae6-fb84-4f9a-a85f-2e922a020521', 'SDC 17 RUE PAUL FEVAL', '17 RUE PAUL FEVAL', '17 RUE PAUL FEVAL', 'PARIS', '75018', 'France', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('0b2f9f1b-9aa4-4f36-acb2-35e0594b8167', 'ea160a11-563e-4afd-8b12-fe423c6c4807', 'COMBERTAULT', '7 RUE DE LA VILLEE', '7 RUE DE LA VILLEE', 'COMBERTAULT', '21200', 'France', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('055e1556-ba11-4a87-b172-e3da72934ddd', 'ea160a11-563e-4afd-8b12-fe423c6c4807', 'VICHY', '17 RUE DU CAPITAINE', '17 RUE DU CAPITAINE', 'VICHY', '03200', 'France', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('1732878d-4c16-4f13-b8ac-7672bea5c2c8', 'ea160a11-563e-4afd-8b12-fe423c6c4807', 'RUFFEY LES BEAUNE', '1 RUE DU BOUCHOT', '1 RUE DU BOUCHOT', 'RUFFEY LES BEAUNE', '21200', 'France', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('74fedb8f-68cf-4cf5-a3dc-e3f429a0500f', '4baa8822-0a77-4f1c-9e29-a9f25b343c41', 'IFC GARENNE COLOMBES', '11 RUE GABRIEL PERI', '11 RUE GABRIEL PERI', 'CLAMART', '92140', 'France', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('68d5cbb8-e8b6-410f-a7c7-5fdf22723f7d', '4baa8822-0a77-4f1c-9e29-a9f25b343c41', 'DOMAINE CHATEAU 21 ESC 1', '55 AVENUE MAZARIN', '55 AVENUE MAZARIN', 'CHILLY MAZARIN', '91380', 'France', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('acd8e15b-c85e-4e19-9427-f1a89580c0bf', '010dcbe6-1b4c-4082-83ca-e8c9a03bc14d', 'SDC 176 BOULEVARD BINEAU', '176 BOULEVARD BINEAU', '176 BOULEVARD BINEAU', 'NEUILLY SUR SEINE', '92200', 'France', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('0ec4ca0a-f078-4a65-9e1a-f7f7af22fd92', '52ffe374-9ba1-4e8b-a61c-a3970ae9c02b', 'SDC 35BRANLY', '31 AVENUE EDOUARD BRANLY', '31 AVENUE EDOUARD BRANLY', 'VILLEPINTE', '93420', 'France', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z')
on conflict (id) do nothing;

-- --------------------------------------------------------------------------------------------
-- 4. COMPTEURS (points de livraison)
-- --------------------------------------------------------------------------------------------
-- numero_point est l'identifiant metier : deux PDL deja connus de Kimatch (22315918826199 et
-- 50070876465564) ne sont pas recrees.
insert into public.compteurs (id, site_id, type_energie_id, numero_point, libelle,
                              consommation_annuelle_mwh, date_echeance, actif,
                              date_creation, date_modification)
values
  ('bc704a0c-b754-4e8b-9b3b-c4f2c39f3335', '02f15b2a-8208-41a9-b698-31cc4037d805', '759d3897-9c8b-4fdc-ba6f-ce6dc330f4fc', '07521128780532', 'SDC 17 RUE PAUL FEVAL', 97.088, '2026-12-31', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('f86b6081-8b24-46d9-9f9e-4b82edf958fe', '0b2f9f1b-9aa4-4f36-acb2-35e0594b8167', '332311d3-6006-4660-9c8d-b4176331e0b0', '12222431231105', 'COMBERTAULT', 0.021, '2026-09-30', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('d3c30dc5-ba99-4335-b614-955f45896df0', '055e1556-ba11-4a87-b172-e3da72934ddd', '332311d3-6006-4660-9c8d-b4176331e0b0', '17387409537674', 'VICHY', 2.1, '2026-09-30', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('11a43efa-b231-442b-98e9-d0e7311dbaf2', '1732878d-4c16-4f13-b8ac-7672bea5c2c8', '332311d3-6006-4660-9c8d-b4176331e0b0', '12227206911206', 'RUFFEY LES BEAUNE', 19.42, '2026-09-30', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('53814f35-34c8-44e0-9d45-db3882c6450e', '055e1556-ba11-4a87-b172-e3da72934ddd', '759d3897-9c8b-4fdc-ba6f-ce6dc330f4fc', '17387554255430', 'VICHY', 12.108, '2026-09-30', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('303fc066-9238-4557-8f37-635be8d54739', '74fedb8f-68cf-4cf5-a3dc-e3f429a0500f', '759d3897-9c8b-4fdc-ba6f-ce6dc330f4fc', '21321707538359', 'IFC GARENNE COLOMBES', 256.146, '2027-06-30', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('790e487b-ce8f-430f-af9e-00b2288bdc6c', '68d5cbb8-e8b6-410f-a7c7-5fdf22723f7d', '759d3897-9c8b-4fdc-ba6f-ce6dc330f4fc', 'GI036539', 'DOMAINE CHATEAU 21 ESC 1', 467.146, '2027-06-30', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('39740ac3-55bc-40ba-b825-1677873968dc', 'acd8e15b-c85e-4e19-9427-f1a89580c0bf', '759d3897-9c8b-4fdc-ba6f-ce6dc330f4fc', 'GI039658', 'SDC 176 BOULEVARD BINEAU', 512.271, '2026-11-30', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('4250a65e-f414-4195-b11a-a7fec626ba00', '0ec4ca0a-f078-4a65-9e1a-f7f7af22fd92', '332311d3-6006-4660-9c8d-b4176331e0b0', '50039308219810', 'SDC 35BRANLY', 15.973, '2027-01-01', true, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z')
on conflict (id) do nothing;

-- Caracteristiques electriques.
insert into public.compteurs_electricite (compteur_id, segment, tension, conso_base_mwh, date_creation, date_modification)
values
  ('f86b6081-8b24-46d9-9f9e-4b82edf958fe', 'C5', 'BT', 0.021, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('d3c30dc5-ba99-4335-b614-955f45896df0', 'C5', 'BT', 2.1, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('11a43efa-b231-442b-98e9-d0e7311dbaf2', 'C5', 'BT', 19.42, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('4250a65e-f414-4195-b11a-a7fec626ba00', 'C5', 'BT', 15.973, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z')
on conflict (compteur_id) do nothing;

-- Caracteristiques gaz.
insert into public.compteurs_gaz (compteur_id, car_mwh, date_creation, date_modification)
values
  ('bc704a0c-b754-4e8b-9b3b-c4f2c39f3335', 97.088, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('53814f35-34c8-44e0-9d45-db3882c6450e', 12.108, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('303fc066-9238-4557-8f37-635be8d54739', 256.146, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('790e487b-ce8f-430f-af9e-00b2288bdc6c', 467.146, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('39740ac3-55bc-40ba-b825-1677873968dc', 512.271, '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z')
on conflict (compteur_id) do nothing;

-- --------------------------------------------------------------------------------------------
-- 5. LES SEPT MANDATS
-- --------------------------------------------------------------------------------------------
-- numero reprend le numero Salesforce (« Mandat 001735 » -> 1735), comme pour le lot Marie.
-- date_envoi vaut la date de creation dans Salesforce et date_signature la date de signature
-- declaree (DS_Date_de_signature__c ne porte que la date, sans heure).
insert into public.mandats (id, compte_id, contact_signataire_id, statut_id, numero, id_salesforce,
                            date_envoi, date_signature, date_debut_validite, date_fin_validite,
                            duree_mois, actif, date_creation, date_modification,
                            proprietaire_id, cree_par_id)
values
  ('1a538749-0505-4c2e-9c05-36cdb52cd151', 'ea160a11-563e-4afd-8b12-fe423c6c4807', 'e8bb656f-88a5-4468-a175-312ccd462f52', 'c7892c9e-0064-4fe9-b9c1-7a3cf3a262d3', 1735, 'a03bR000011fRMZQA2', '2026-08-05T10:21:47.000+0000', '2026-08-05T00:00:00Z', '2026-08-05', '2029-08-05', 36, true, '2026-08-05T10:21:47.000+0000', '2026-08-11T12:22:48.000+0000', 'eae76279-6014-4043-8a35-19bce2429e75', 'eae76279-6014-4043-8a35-19bce2429e75'),
  ('b0117420-eda1-4ded-b47f-3783bf4a055a', '45026ae6-fb84-4f9a-a85f-2e922a020521', 'db853819-13d3-48b6-ac33-975e01aee3ce', 'c7892c9e-0064-4fe9-b9c1-7a3cf3a262d3', 1736, 'a03bR000011ecboQAA', '2026-08-05T10:40:24.000+0000', '2026-08-05T00:00:00Z', '2026-08-05', '2029-08-05', 36, true, '2026-08-05T10:40:24.000+0000', '2026-08-07T09:04:45.000+0000', 'eae76279-6014-4043-8a35-19bce2429e75', 'eae76279-6014-4043-8a35-19bce2429e75'),
  ('857c3312-9838-4051-9807-9db4c0e4df18', 'fd3b0d9d-6974-4240-8754-bca028f334f4', '3243bcbd-865d-430e-aba5-9698eac3715b', 'c7892c9e-0064-4fe9-b9c1-7a3cf3a262d3', 1737, 'a03bR000011hKonQAE', '2026-08-05T15:37:28.000+0000', '2026-08-05T00:00:00Z', '2026-08-05', '2029-08-05', 36, true, '2026-08-05T15:37:28.000+0000', '2026-08-11T08:35:04.000+0000', 'eae76279-6014-4043-8a35-19bce2429e75', 'eae76279-6014-4043-8a35-19bce2429e75'),
  ('3dbc7156-ca72-4220-b64e-347697bc71a0', '4baa8822-0a77-4f1c-9e29-a9f25b343c41', '1e638293-8690-44d2-886e-08512d978919', 'c7892c9e-0064-4fe9-b9c1-7a3cf3a262d3', 1741, 'a03bR000011rFJFQA2', '2026-08-07T10:02:09.000+0000', '2026-08-07T00:00:00Z', '2026-08-07', '2029-08-07', 36, true, '2026-08-07T10:02:09.000+0000', '2026-08-07T11:08:47.000+0000', '14483439-27d3-4e48-b0db-b074b4fe2f4a', '14483439-27d3-4e48-b0db-b074b4fe2f4a'),
  ('cbb378e8-fcac-4423-9e21-11ce6dbc66e5', '010dcbe6-1b4c-4082-83ca-e8c9a03bc14d', '69b33c59-49a8-4027-93b2-81ad8e6aa2d1', 'c7892c9e-0064-4fe9-b9c1-7a3cf3a262d3', 1742, 'a03bR0000122EreQAE', '2026-08-10T07:57:19.000+0000', '2026-08-10T00:00:00Z', '2026-08-10', '2029-08-10', 36, true, '2026-08-10T07:57:19.000+0000', '2026-08-12T09:11:14.000+0000', '9106d955-5b85-40d5-adc9-26f03495079a', '9106d955-5b85-40d5-adc9-26f03495079a'),
  ('591c4ab0-7745-4bc4-88e7-046cb6e2d276', '52ffe374-9ba1-4e8b-a61c-a3970ae9c02b', '3a451cfc-6fb9-4c42-9288-8109c055a8b4', 'c7892c9e-0064-4fe9-b9c1-7a3cf3a262d3', 1743, 'a03bR0000122kptQAA', '2026-08-10T08:37:34.000+0000', '2026-08-10T00:00:00Z', '2026-08-10', '2029-08-10', 36, true, '2026-08-10T08:37:34.000+0000', '2026-08-11T10:25:45.000+0000', '9106d955-5b85-40d5-adc9-26f03495079a', '9106d955-5b85-40d5-adc9-26f03495079a'),
  ('ec656860-1869-43a1-a6a3-8970d75472f3', 'c3ed3eba-89e7-4659-bc80-37fbd39f4ba8', '48b12643-e299-4760-b159-737ef0a04a24', 'c7892c9e-0064-4fe9-b9c1-7a3cf3a262d3', 1744, 'a03bR0000127eK2QAI', '2026-08-11T07:53:56.000+0000', '2026-08-11T00:00:00Z', '2026-08-11', '2027-08-11', 12, true, '2026-08-11T07:53:56.000+0000', '2026-08-11T07:57:34.000+0000', '83ff0265-966b-48f8-ad0a-e0050f6da695', '83ff0265-966b-48f8-ad0a-e0050f6da695')
on conflict (id) do nothing;

-- Rattachement des PDL aux mandats : c'est ce lien qui fait entrer un site dans le perimetre.
insert into public.mandats_compteurs (id, mandat_id, compteur_id, date_creation, date_modification)
values
  ('3f9916e9-abdb-463f-803b-1dababe0616f', 'b0117420-eda1-4ded-b47f-3783bf4a055a', 'bc704a0c-b754-4e8b-9b3b-c4f2c39f3335', '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('8d553bae-2113-411b-a877-e3746335897c', '1a538749-0505-4c2e-9c05-36cdb52cd151', 'f86b6081-8b24-46d9-9f9e-4b82edf958fe', '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('395b2151-393b-49a4-88a9-3c29990335b6', '1a538749-0505-4c2e-9c05-36cdb52cd151', 'd3c30dc5-ba99-4335-b614-955f45896df0', '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('7fc98eb9-0b2a-4dac-843b-74f3fa398828', '1a538749-0505-4c2e-9c05-36cdb52cd151', '11a43efa-b231-442b-98e9-d0e7311dbaf2', '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('3a22e757-1a3a-4eda-a5cf-7e60a78657cb', '1a538749-0505-4c2e-9c05-36cdb52cd151', '53814f35-34c8-44e0-9d45-db3882c6450e', '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('6491702f-ab82-4bb8-b6d4-6e1a568af05c', '857c3312-9838-4051-9807-9db4c0e4df18', '24dd978b-3de6-45c1-aa13-092e2086c0c7', '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('b3028b49-1a8a-468b-bd7a-7328ef35ce65', '3dbc7156-ca72-4220-b64e-347697bc71a0', '303fc066-9238-4557-8f37-635be8d54739', '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('43a8362f-ce15-4324-87d4-b0b08f57692a', '3dbc7156-ca72-4220-b64e-347697bc71a0', '790e487b-ce8f-430f-af9e-00b2288bdc6c', '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('229b0c40-6d3b-4206-be08-aa19bbb6f6e4', 'cbb378e8-fcac-4423-9e21-11ce6dbc66e5', '39740ac3-55bc-40ba-b825-1677873968dc', '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('da7a5fb7-76d0-442d-b164-bf16d0072369', '591c4ab0-7745-4bc4-88e7-046cb6e2d276', '4250a65e-f414-4195-b11a-a7fec626ba00', '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z'),
  ('2cb02cd3-9105-450a-94f7-17e9bac9db58', 'ec656860-1869-43a1-a6a3-8970d75472f3', '1c4f5ddd-4f47-42ce-a09c-d4945759691e', '2026-08-15T12:00:00Z', '2026-08-15T12:00:00Z')
on conflict (id) do nothing;

-- Courtiers portes par le mandat (Mandat_Kiwee__c / mandat_Energix__c cote Salesforce).
insert into public.mandats_courtiers (id, mandat_id, type_courtier_id)
values
  ('91b0a4a9-4d87-4a34-a82c-6698db578afa', '1a538749-0505-4c2e-9c05-36cdb52cd151', 'fe9a4fc6-25de-4ebe-9816-b7846516454b'),
  ('ca6f1de4-544b-4102-b161-82140ea8332b', '1a538749-0505-4c2e-9c05-36cdb52cd151', '9ac73dad-298b-4c0b-9fa2-d2dbd8975c17'),
  ('fab38924-246d-4663-b249-59d31dcc9a66', 'b0117420-eda1-4ded-b47f-3783bf4a055a', 'fe9a4fc6-25de-4ebe-9816-b7846516454b'),
  ('33c811bb-39c0-4975-b780-8121c3dcb7fa', 'b0117420-eda1-4ded-b47f-3783bf4a055a', '9ac73dad-298b-4c0b-9fa2-d2dbd8975c17'),
  ('fbead0fb-1833-4c9d-8185-fc5841980cc2', '857c3312-9838-4051-9807-9db4c0e4df18', 'fe9a4fc6-25de-4ebe-9816-b7846516454b'),
  ('85427d7e-45fa-4d8a-b9b6-365313f7a2c1', '857c3312-9838-4051-9807-9db4c0e4df18', '9ac73dad-298b-4c0b-9fa2-d2dbd8975c17'),
  ('d675b1c3-490e-4296-8349-2de614ce3183', '3dbc7156-ca72-4220-b64e-347697bc71a0', 'fe9a4fc6-25de-4ebe-9816-b7846516454b'),
  ('ad46d6cb-aaa4-4149-80b8-cb122b825164', '3dbc7156-ca72-4220-b64e-347697bc71a0', '9ac73dad-298b-4c0b-9fa2-d2dbd8975c17'),
  ('2a685286-9925-4ae9-bd07-f868471bd1f0', 'cbb378e8-fcac-4423-9e21-11ce6dbc66e5', 'fe9a4fc6-25de-4ebe-9816-b7846516454b'),
  ('45ad1249-315d-4249-bbe6-97b2d9d6c53c', 'cbb378e8-fcac-4423-9e21-11ce6dbc66e5', '9ac73dad-298b-4c0b-9fa2-d2dbd8975c17'),
  ('adb13d72-39b2-4d10-99d3-fa15d1092024', '591c4ab0-7745-4bc4-88e7-046cb6e2d276', 'fe9a4fc6-25de-4ebe-9816-b7846516454b'),
  ('8fcf526b-40e3-4309-950a-65ab29be1e6c', '591c4ab0-7745-4bc4-88e7-046cb6e2d276', '9ac73dad-298b-4c0b-9fa2-d2dbd8975c17'),
  ('2a6ed272-dd98-4d3b-a8ff-5dd6e68af486', 'ec656860-1869-43a1-a6a3-8970d75472f3', 'fe9a4fc6-25de-4ebe-9816-b7846516454b')
on conflict (id) do nothing;

commit;

-- ============================================================================================
-- CONTROLE APRES APPLICATION
-- ============================================================================================
-- Les sept mandats doivent apparaitre, chacun avec son compte, son signataire et ses PDL :
--
--   select m.numero, cp.nom compte, ct.prenom || ' ' || ct.nom signataire,
--          sm.code statut, count(mc.compteur_id) pdl
--   from mandats m
--   left join comptes cp on cp.id = m.compte_id
--   left join contacts ct on ct.id = m.contact_signataire_id
--   left join statuts_mandats sm on sm.id = m.statut_id
--   left join mandats_compteurs mc on mc.mandat_id = m.id
--   where m.id_salesforce like 'a03%' and m.numero between 1735 and 1744
--   group by 1,2,3,4 order by m.numero;
--
-- Attendu : 7 lignes, statut ACTIF, 11 PDL au total.
