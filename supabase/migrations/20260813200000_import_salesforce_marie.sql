-- ============================================================================================
-- IMPORT SALESFORCE -> KIMATCH : les enregistrements saisis par Marie THONNARD le 13/08/2026
-- ============================================================================================
-- Contexte : la creation de mandat depuis Kimatch echouait a l'ouverture de DocuSign (consentement
-- d'impersonation jamais donne). Marie a d'abord essaye trois fois dans Kimatch (12:47, 12:48,
-- 12:49 UTC), puis a tout ressaisi dans Salesforce a partir de 14:34 UTC et a fait signer le
-- mandat. Cet import ramene la saisie Salesforce dans Kimatch.
--
-- Source (org KiweeOrg, interrogee le 13/08/2026 via sf data query) :
--   Mandat__c                            a03bR000012L6QYQA0  « Mandat 001745 »
--   Relation_Mandat_Point_de_livraison__c a04bR00000s9f6TQAQ
--   Point_de_livraison__c                a01bR000013e3cyQAA  « GI155378 », site SDC AMPLITUDE 2
--   Opportunity                          006bR00000ngTmBQAU  « CABINET ROUMILHAC JOURDAN - SDC AMPLITUDE 2 »
--   Cotation__c                          a07bR00001kGbUzQAK  « COT-GAZ-CABINETROU-20260813-166 »
--   Suivi_cotation__c                    4 lignes (PICOTY 36/46 mois, GAZ EUROPEEN 36/46 mois)
--   ContentDocument                      3 PDF signes (mandat KiWee, mandat Energix, certificat)
--
-- Correspondances de statuts : celles de transform.js, PUIS le remappage des cycles de vie du
-- 12/08/2026 (migration 20260812090000), sinon on ecrirait dans les anciens referentiels :
--   Mandat Statut « Actif » + Signature « Signé »  -> statuts_mandats.ACTIF
--   Opportunity StageName « Instruction »          -> EN_ANALYSE -> etapes_recommandation.DIAGNOSTIC
--   Cotation Statut « Nouvelle », offre non envoyee -> BROUILLON -> statuts_versions.EN_CONSTRUCTION
--   Suivi_cotation « Nouvelle demande »            -> statuts_consultations_fournisseurs.ENVOYEE
--
-- L'ENVELOPPE DOCUSIGN : Salesforce ne la stocke nulle part pour les mandats
-- (dfsle__EnvelopeStatus__c ne couvre que les objets Contract, dernier enregistrement 24/07/2026,
-- et les champs DS_* du mandat sont vides). L'identifiant a ete lu dans les PDF eux-memes, ou
-- DocuSign inscrit un verrou de champ de signature « ENVELOPEID_<32 hex> » : les trois fichiers
-- portent le meme, d3c0290a-e67f-8876-83e0-c0a4c4069f2c — une seule enveloppe contenant les deux
-- mandats (Mandat_Kiwee__c et mandat_Energix__c sont tous les deux vrais cote Salesforce).
-- ============================================================================================

begin;

-- --------------------------------------------------------------------------------------------
-- 1. SITE « SDC AMPLITUDE 2 »
-- --------------------------------------------------------------------------------------------
-- Salesforce distingue bien deux sites du meme syndic a Bezons : SDC AMPLITUDE (110 et 112-116 rue
-- Rouget de Lisle, PDL GI155710 et 50007602955799) et SDC AMPLITUDE 2 (6 avenue Charles, PDL
-- GI155378, cree aujourd'hui). C'est aussi ce que produirait transform.js, qui groupe les sites par
-- compte + libelle + code postal.
-- Le compteur GI155378 avait ete rattache a SDC AMPLITUDE dans Kimatch a 12:13 UTC (avant que le
-- site 2 n'existe) : l'etape 2 le deplace. Les mandats et contrats sont lies au compteur, pas au
-- site, donc ce deplacement ne casse aucun rattachement.
insert into public.sites (id, compte_id, nom, adresse, code_postal, ville, pays, actif,
                          date_creation, date_modification, proprietaire_id, cree_par_id)
values ('a3c68670-98f3-49b2-a9d4-0a25d65c2cc4',
        'c2a50343-c448-42b0-b7c2-0dc9ac90563a',
        'SDC AMPLITUDE 2', '6 AVENUE CHARLES', '95870', 'BEZONS', 'France', true,
        '2026-08-13T14:34:31Z', '2026-08-13T14:34:31Z',
        '9106d955-5b85-40d5-adc9-26f03495079a', '9106d955-5b85-40d5-adc9-26f03495079a')
on conflict (id) do nothing;

-- --------------------------------------------------------------------------------------------
-- 2. COMPTEUR GI155378 : rattachement au bon site + champs saisis dans Salesforce
-- --------------------------------------------------------------------------------------------
-- Le compteur existe deja (cree dans Kimatch a 12:13 UTC par William, proprietaire Marie). Il n'est
-- pas recree : numero_point est unique, et trois mandats y sont deja rattaches.
-- Le profil de consommation passe de P012 a P016 : P012 avait ete saisi dans Kimatch a 12:13,
-- P016 est ce que Marie a saisi dans Salesforce a 14:34 — la saisie la plus recente, et Salesforce
-- est la source de cet import. A confirmer par elle si le doute subsiste.
update public.compteurs set
  site_id = 'a3c68670-98f3-49b2-a9d4-0a25d65c2cc4',
  libelle = 'SDC AMPLITUDE 2',
  consommation_annuelle_mwh = 422.145,
  responsable_contact_id = '814124ae-81c8-45e5-bbc0-cb06f7de2535',   -- Clélia DEBONNAIRE
  fournisseur_actuel_compte_id = '197d02d1-71a1-4d10-a056-98ba2ef14659', -- EDF
  date_echeance = '2027-02-14',
  date_modification = '2026-08-13T14:45:26Z',
  modifie_par_id = '9106d955-5b85-40d5-adc9-26f03495079a'
where id = 'b5c99c18-0c71-421f-8b7b-f7423a4fcea4';

update public.compteurs_gaz set
  car_mwh = 422.145,
  profil_consommation = 'P016',
  tarif_distribution = 'T2',
  date_modification = '2026-08-13T14:45:26Z'
where compteur_id = 'b5c99c18-0c71-421f-8b7b-f7423a4fcea4';

-- --------------------------------------------------------------------------------------------
-- 3. MANDAT 001745 : signe, actif, avec son enveloppe
-- --------------------------------------------------------------------------------------------
-- Consolide sur la 3e tentative de Marie (ef74f90d, 12:49 UTC) : meme compte, meme compteur
-- GI155378, meme signataire Clélia DEBONNAIRE, meme duree de 36 mois — c'est le meme mandat, saisi
-- deux fois faute de DocuSign. Rien n'est recree, sinon la fiche compte afficherait un doublon.
-- Les deux premieres tentatives (4401c5b5 sans signataire, 555a7193) restent en base : voir le
-- bloc commente en fin de fichier.
update public.mandats set
  statut_id = 'c7892c9e-0064-4fe9-b9c1-7a3cf3a262d3',                -- ACTIF
  numero = 1745,
  id_salesforce = 'a03bR000012L6QYQA0',
  date_envoi = '2026-08-13T14:34:51Z',                               -- creation du mandat dans Salesforce
  date_signature = '2026-08-13T14:41:35Z',                           -- depot des PDF signes (DS_Date_de_signature__c ne porte que la date)
  date_debut_validite = '2026-08-13',
  date_fin_validite = '2029-08-13',
  duree_mois = 36,
  docusign_envelope_id = 'd3c0290a-e67f-8876-83e0-c0a4c4069f2c',
  document_url = 'https://connect-agility-4114.lightning.force.com/lightning/r/ContentDocument/069bR00000ttQn5QAE/view',
  date_modification = '2026-08-13T14:45:27Z',
  modifie_par_id = '9106d955-5b85-40d5-adc9-26f03495079a'
where id = 'ef74f90d-cec0-4793-8827-5d71bf3273c6';

-- mandats_courtiers : KIWI et ENERGIX sont deja tous les deux presents sur ce mandat, conformement
-- a Mandat_Kiwee__c = true et mandat_Energix__c = true cote Salesforce. Rien a ajouter.

-- --------------------------------------------------------------------------------------------
-- 4. LES TROIS PDF SIGNES
-- --------------------------------------------------------------------------------------------
-- Les URL pointent vers Salesforce, comme toutes les lignes de cette table (documents ne stocke que
-- des liens ; le bucket Storage « documents » n'a aucune politique et n'est ecrit par personne
-- aujourd'hui). Les fichiers ont ete telecharges et conserves hors base en attendant de pouvoir les
-- rapatrier — voir la note en fin de fichier.
insert into public.documents (id, type_document_id, nom, nom_fichier, url, mime_type, taille_octets,
                              entite_type, entite_id, auteur_profil_id, actif,
                              date_creation, date_modification, proprietaire_id, cree_par_id)
values
  ('06662158-b5a5-48c7-ba36-e1d42c5679a8', 'd014f3df-926e-48cc-ae56-7746ed900fbb',
   'Mandat KiWee signé', 'Mandat_KiWee_CABINET_ROUMILHAC_JOURDAN_signe.pdf',
   'https://connect-agility-4114.lightning.force.com/lightning/r/ContentDocument/069bR00000ttQn5QAE/view',
   'application/pdf', 1405138, 'mandat', 'ef74f90d-cec0-4793-8827-5d71bf3273c6',
   '9106d955-5b85-40d5-adc9-26f03495079a', true,
   '2026-08-13T14:41:35Z', '2026-08-13T14:41:35Z',
   '9106d955-5b85-40d5-adc9-26f03495079a', '9106d955-5b85-40d5-adc9-26f03495079a'),
  ('9b3bd5aa-245f-46f9-84f8-303dbe90a399', 'd014f3df-926e-48cc-ae56-7746ed900fbb',
   'Mandat Energix signé', 'Mandat_Energix_CABINET_ROUMILHAC_JOURDAN_signe.pdf',
   'https://connect-agility-4114.lightning.force.com/lightning/r/ContentDocument/069bR00000tt4L6QAI/view',
   'application/pdf', 116496, 'mandat', 'ef74f90d-cec0-4793-8827-5d71bf3273c6',
   '9106d955-5b85-40d5-adc9-26f03495079a', true,
   '2026-08-13T14:41:34Z', '2026-08-13T14:41:34Z',
   '9106d955-5b85-40d5-adc9-26f03495079a', '9106d955-5b85-40d5-adc9-26f03495079a'),
  ('84c48b0a-adc8-4ddb-b548-99e7d7e70492', 'd014f3df-926e-48cc-ae56-7746ed900fbb',
   'Certificat de signature DocuSign', 'Certificat_signature_CABINET_ROUMILHAC_JOURDAN.pdf',
   'https://connect-agility-4114.lightning.force.com/lightning/r/ContentDocument/069bR00000tsaesQAA/view',
   'application/pdf', 249414, 'mandat', 'ef74f90d-cec0-4793-8827-5d71bf3273c6',
   '9106d955-5b85-40d5-adc9-26f03495079a', true,
   '2026-08-13T14:41:34Z', '2026-08-13T14:41:34Z',
   '9106d955-5b85-40d5-adc9-26f03495079a', '9106d955-5b85-40d5-adc9-26f03495079a')
on conflict (id) do nothing;

-- --------------------------------------------------------------------------------------------
-- 5. RECOMMANDATION (Opportunity)
-- --------------------------------------------------------------------------------------------
-- marge_brute <- Amount, marge_nette <- Montant_commission_nette_kiwee__c : meme correspondance que
-- transform.js. Remuneration_partenaire__c (-4855) n'est pas repris : marge_apporteur suit
-- R_mun_ration_ap__c, vide ici, et une remuneration negative n'aurait pas de sens dans ce champ.
-- reference reste nul : les 1693 recommandations de la base n'en ont aucune.
insert into public.recommandations (id, compte_id, etape_id, nom, priorite, date_ouverture, actif,
                                   date_creation, date_modification, contact_principal_id,
                                   contact_signataire_id, marge_brute, marge_nette,
                                   type_energie_id, type_opportunite,
                                   proprietaire_id, cree_par_id, responsable_profil_id)
values ('fea54ec7-d563-413c-a56d-6ed12021f713',
        'c2a50343-c448-42b0-b7c2-0dc9ac90563a',
        '7cbe39a7-1cc5-4c0e-af3e-c9b471269de1',                       -- DIAGNOSTIC
        '🔥 CABINET ROUMILHAC JOURDAN - SDC AMPLITUDE 2', 2,
        '2026-08-13T14:44:44Z', true,
        '2026-08-13T14:44:44Z', '2026-08-13T14:45:27Z',
        '814124ae-81c8-45e5-bbc0-cb06f7de2535',
        '814124ae-81c8-45e5-bbc0-cb06f7de2535',
        4855, 4855,
        '759d3897-9c8b-4fdc-ba6f-ce6dc330f4fc',                       -- GAZ
        'Captation',
        '9106d955-5b85-40d5-adc9-26f03495079a', '9106d955-5b85-40d5-adc9-26f03495079a',
        '9106d955-5b85-40d5-adc9-26f03495079a')
on conflict (id) do nothing;

insert into public.recommandations_sites (id, recommandation_id, site_id, actif, date_creation, date_modification)
values ('42bd8643-e53a-4426-a13f-cfd08a69db17',
        'fea54ec7-d563-413c-a56d-6ed12021f713',
        'a3c68670-98f3-49b2-a9d4-0a25d65c2cc4', true,
        '2026-08-13T14:44:44Z', '2026-08-13T14:44:44Z')
on conflict (id) do nothing;

-- --------------------------------------------------------------------------------------------
-- 6. VERSION DE RECOMMANDATION (Cotation)
-- --------------------------------------------------------------------------------------------
-- Statut EN_CONSTRUCTION : Cotation.Statut__c = « Nouvelle » et Offre_envoy_e__c = false, donc
-- l'offre n'a pas encore ete presentee au client — date_presentation_client reste nulle.
-- Le nom suit la convention des 1789 versions deja en base (« Version 1 ») ; le numero Salesforce
-- de la cotation est conserve dans commentaire_interne pour ne pas perdre la trace.
insert into public.versions_recommandation (id, recommandation_id, numero_version, motif_version_id,
                                           statut_version_id, auteur_profil_id, nom,
                                           version_actuelle, est_figee, date_souhaitee, types_prix,
                                           contact_id, commentaire_interne,
                                           date_creation, date_modification)
values ('9b052b45-24e4-4861-aa1d-f190f54e4cee',
        'fea54ec7-d563-413c-a56d-6ed12021f713', 1,
        'c08e98eb-2724-4525-b16d-bdb6b793249e',                       -- CREATION_INITIALE
        'ff5586e0-91c1-4d20-b519-c3b5a1564960',                       -- EN_CONSTRUCTION
        '9106d955-5b85-40d5-adc9-26f03495079a',
        'Version 1', true, false,
        '2026-08-18',                                                 -- Livraison_attendue_le__c
        array['Fixe'],                                                -- Prix_nergie__c
        null,                                                         -- Cotation.Contact__c est vide
        'Cotation Salesforce COT-GAZ-CABINETROU-20260813-166 (a07bR00001kGbUzQAK)',
        '2026-08-13T14:45:24Z', '2026-08-13T14:45:24Z')
on conflict (id) do nothing;

insert into public.versions_recommandation_compteurs (id, version_recommandation_id, compteur_id, actif,
                                                     date_creation, date_modification)
values ('290a2607-da03-4746-9d47-7e5f5867ae11',
        '9b052b45-24e4-4861-aa1d-f190f54e4cee',
        'b5c99c18-0c71-421f-8b7b-f7423a4fcea4', true,
        '2026-08-13T14:45:24Z', '2026-08-13T14:45:24Z')
on conflict (id) do nothing;

-- --------------------------------------------------------------------------------------------
-- 7. MISE EN CONCURRENCE : 2 fournisseurs, 4 demandes
-- --------------------------------------------------------------------------------------------
-- Les 4 Suivi_cotation__c sont deux fournisseurs x deux durees (36 et 46 mois).
-- optimisations_fournisseurs n'a pas de colonne de duree : une ligne par fournisseur, et la duree
-- est portee par le commentaire de chaque suivi — c'est la seule facon de ne pas perdre
-- l'information avec le schema actuel.
insert into public.optimisations (id, version_recommandation_id, type_optimisation_id, nom, priorite,
                                  statut, est_retenue, ordre, date_creation, date_modification)
values ('3cde53a2-8e45-473a-8d45-62fb41a0eded',
        '9b052b45-24e4-4861-aa1d-f190f54e4cee',
        '502d8b05-749a-4840-8219-78b0e0d7fe8b',                       -- MISE_EN_CONCURRENCE
        'Mise en concurrence', 1, 'EN_COURS', false, 1,
        '2026-08-13T14:45:29Z', '2026-08-13T14:45:29Z')
on conflict (id) do nothing;

insert into public.optimisations_fournisseurs (id, optimisation_id, fournisseur_compte_id, date_creation)
values
  ('8d0ded10-2a46-44b6-81ea-6e87797eb219', '3cde53a2-8e45-473a-8d45-62fb41a0eded',
   '0e63b95e-0674-4269-811e-29099fd9bbb0', '2026-08-13T14:45:29Z'),   -- PICOTY
  ('b65f62cd-84b6-4c23-a1ae-e2645613a38d', '3cde53a2-8e45-473a-8d45-62fb41a0eded',
   '9980bebe-338d-4176-9501-4d8a57b304e1', '2026-08-13T14:45:29Z')    -- GAZ EUROPEEN
on conflict (id) do nothing;

insert into public.suivis_consultations_fournisseurs (id, optimisation_fournisseur_id, statut_id,
                                                      date_evenement, commentaire, auteur_profil_id)
values
  ('523bee19-ffb0-44c4-aff4-aec99ad93204', '8d0ded10-2a46-44b6-81ea-6e87797eb219',
   'f5326953-e1a3-44dd-85ed-7d95557a4dbd', '2026-08-13T14:45:29Z',
   'PICOTY - 36 MOIS', '9106d955-5b85-40d5-adc9-26f03495079a'),
  ('0924d589-4cf3-4f40-bc63-ad53631559a0', '8d0ded10-2a46-44b6-81ea-6e87797eb219',
   'f5326953-e1a3-44dd-85ed-7d95557a4dbd', '2026-08-13T14:45:29Z',
   'PICOTY - 46 MOIS', '9106d955-5b85-40d5-adc9-26f03495079a'),
  ('338ccf8f-33f0-43f7-8645-7a232c1bec88', 'b65f62cd-84b6-4c23-a1ae-e2645613a38d',
   'f5326953-e1a3-44dd-85ed-7d95557a4dbd', '2026-08-13T14:45:29Z',
   'GAZ EUROPEEN - 36 MOIS', '9106d955-5b85-40d5-adc9-26f03495079a'),
  ('6be13988-5935-4103-8430-3755ab3a8c19', 'b65f62cd-84b6-4c23-a1ae-e2645613a38d',
   'f5326953-e1a3-44dd-85ed-7d95557a4dbd', '2026-08-13T14:45:29Z',
   'GAZ EUROPEEN - 46 MOIS', '9106d955-5b85-40d5-adc9-26f03495079a')
on conflict (id) do nothing;

commit;

-- ============================================================================================
-- CE QUI RESTE A DECIDER (rien de bloquant, aucune de ces lignes n'est executee ici)
-- ============================================================================================
-- (a) Les deux premieres tentatives de mandat de Marie, restees « À préparer », sans signataire
--     pour la premiere, sans enveloppe ni signature pour les deux. Ce sont des doublons de
--     ef74f90d, pas des mandats reels. A supprimer quand elle le confirme :
--
--     delete from public.mandats_compteurs where mandat_id in
--       ('4401c5b5-ae1e-4896-88dd-8354fa078121', '555a7193-1a2e-49d1-be6a-bc19bc67ce5e');
--     delete from public.mandats_courtiers where mandat_id in
--       ('4401c5b5-ae1e-4896-88dd-8354fa078121', '555a7193-1a2e-49d1-be6a-bc19bc67ce5e');
--     delete from public.mandats where id in
--       ('4401c5b5-ae1e-4896-88dd-8354fa078121', '555a7193-1a2e-49d1-be6a-bc19bc67ce5e');
--
-- (b) Les huit mandats de test crees sur KIWEE ENERGIE FRANCE pendant le depannage DocuSign
--     (13:46 -> 14:57 UTC, tous sur le compteur GI081353, signataire Michel OBAME). Le dernier
--     (ade16f66) porte une vraie enveloppe DocuSign : c'est celui qui prouve que la chaine
--     fonctionne, a garder le temps de verifier, les sept autres sont a jeter.
--
-- (c) Les trois PDF signes sont conserves hors base, telecharges depuis Salesforce :
--       Downloads/../scratchpad/pdf/Mandat_KiWee_CABINET_ROUMILHAC_JOURDAN_signe.pdf   (1,4 Mo)
--       ...                        /Mandat_Energix_CABINET_ROUMILHAC_JOURDAN_signe.pdf (116 Ko)
--       ...                        /Certificat_signature_CABINET_ROUMILHAC_JOURDAN.pdf (249 Ko)
--     Les rapatrier dans Supabase Storage demande d'abord des politiques sur le bucket
--     « documents » : il existe depuis le 28/07/2026, il est public en lecture, mais storage.objects
--     n'a aucune politique le concernant — personne ne peut y ecrire depuis l'application. C'est le
--     meme genre d'angle mort que l'audit RLS du 13/08 a corrige sur les tables.
-- ============================================================================================
