-- ============================================================================================
-- Un contact peut appartenir à plusieurs comptes — reprise des relations perdues
-- ============================================================================================
-- Réunion du 13/08/2026 : « faire en sorte qu'un contact puisse être lié à plusieurs comptes et
-- bien vérifier qu'on ne perd aucune data Salesforce à ce sujet » (William).
--
-- L'objet Salesforce est AccountContactRelation. Il porte 3531 relations pour 3386 contacts :
-- une relation « directe » par contact (son compte de rattachement) plus 145 relations
-- supplémentaires. Kimatch ne stockait que la directe, dans contacts.compte_id — les 145 autres
-- n'ont jamais été reprises. 76 contacts sont concernés, jusqu'à 11 comptes pour un seul d'entre
-- eux (Paul-alexandre RAPENEAU ; Romain HEBRARD en a 10).
--
-- Conséquence concrète, celle que William a montrée : sur la fiche DUHAMEL LOGISTIQUE, Romain
-- HEBRARD n'apparaît pas dans les contacts alors qu'il y est signataire et décisionnaire.
--
-- À RELIRE AVANT EXÉCUTION.
-- ============================================================================================

begin;

-- ── La table de liaison ──────────────────────────────────────────────────────────────────────
-- Calquée sur contacts_sites, qui règle déjà le même problème entre contacts et sites.
create table if not exists public.contacts_comptes (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  compte_id uuid not null references public.comptes(id) on delete cascade,
  fonction_sur_compte text,
  -- Vrai pour le compte de rattachement principal, celui que porte contacts.compte_id. C'est
  -- l'équivalent de IsDirect côté Salesforce.
  relation_directe boolean not null default false,
  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now(),
  unique (contact_id, compte_id)
);

comment on table public.contacts_comptes is
  'Rattachement d''un contact à un ou plusieurs comptes (équivalent de AccountContactRelation). contacts.compte_id reste le compte principal, repris ici avec relation_directe = true.';

create index if not exists contacts_comptes_compte_idx on public.contacts_comptes (compte_id);
create index if not exists contacts_comptes_contact_idx on public.contacts_comptes (contact_id);

-- ── 1. Les relations directes, reprises depuis la base et non depuis Salesforce ───────────────
-- contacts.compte_id EST déjà la relation directe : la relire dans Salesforce n'apporterait rien
-- et risquerait d'introduire un écart entre les deux sources.
insert into public.contacts_comptes (contact_id, compte_id, relation_directe, date_creation)
select c.id, c.compte_id, true, c.date_creation
  from public.contacts c
 where c.compte_id is not null
on conflict (contact_id, compte_id) do nothing;

-- ── 2. Les 145 relations supplémentaires, reprises de Salesforce ──────────────────────────────
-- Les contacts n'ont ni id_salesforce ni registre de correspondance persistant : la migration
-- leur a attribué un uuid en mémoire, perdu depuis. Le rapprochement se fait donc sur le triplet
-- (prénom, nom, compte de rattachement), vérifié à blanc sur les 76 contacts concernés :
-- 75 identifiés une seule fois, aucun introuvable, et un doublon connu (voir la note finale).
with source(prenom, nom, compte_direct, compte_a_lier, nom_compte) as (values
  ('stephane','dutoit','d2d66303-85a3-43fc-8c80-362e8b8c2196','a9af3cba-8c8f-4825-bc48-dff37c73ef31','COVI ARDENNES'),
  ('stephane','dutoit','d2d66303-85a3-43fc-8c80-362e8b8c2196','5f90b66e-dd11-4866-981b-b2cd7708d638','CAMBRAI V.I.COQUIDE'),
  ('stephane','dutoit','d2d66303-85a3-43fc-8c80-362e8b8c2196','5b78fe81-1e5d-4ea9-a578-6bc71b19b8f7','VALENCIENNES POIDS LOURDS'),
  ('stephane','dutoit','d2d66303-85a3-43fc-8c80-362e8b8c2196','14e6c857-9df6-4c18-9209-f1074e1ff58e','SOCIETE FINANCIERE COQUIDE'),
  ('stephane','dutoit','d2d66303-85a3-43fc-8c80-362e8b8c2196','60aa9c1f-2449-4403-8807-92a81d74a1e6','LENS BETHUNE VEHICULES INDUSTRIELS'),
  ('stephane','dutoit','d2d66303-85a3-43fc-8c80-362e8b8c2196','4a37ea20-adec-470a-828b-647715483f47','COVI CAMIONS ET BUS'),
  ('alexandre','moeneclaey','d5af95c7-9ea8-41ba-8d04-cfd66ec35496','9465193c-afcf-4f8a-8b3a-998f81e258fa','CITYA VAL D''OUEST'),
  ('patrick','regy','8751d486-5c32-497e-b705-276e94c53177','324a6e68-de81-4acf-969d-c9909c790ca7','CENTENNIAL GESTION'),
  ('cédric','bocket','324a6e68-de81-4acf-969d-c9909c790ca7','8751d486-5c32-497e-b705-276e94c53177','REGY'),
  ('nicolas','porcheron','ab5ab0bc-edeb-46e8-bbbb-cd09f9e7c036','8ddd5e5a-3a97-4b4d-a14f-3529c4eb7311','MAVILLE IMMOBILIER'),
  ('armelle','vin','64b1aeff-fc7c-46ec-8d88-ada538d25dd3','0b33adfe-44e0-40da-897f-bd135e3995a3','ZAVANI & COMPAGNIE'),
  ('anne audrey','menanteau','607460a9-b885-472e-b0ee-b17961fb519f','b21b5d01-c24c-4d11-b8d2-0bf6016fd5aa','NOUVELLE ACMIF'),
  ('johan','bazin','d9da3888-b785-493f-93c4-2b74422444fc','411d1ae2-d878-4fbe-bf19-1753ac800a53','L''UNIVERS'),
  ('mickael','azria','12f1b60a-3719-4720-b885-af427cb9f8c7','37d60b81-3018-4d4e-a50d-f3655a29144e','MEMPHIS BLOIS'),
  ('mickael','azria','12f1b60a-3719-4720-b885-af427cb9f8c7','dfd1fa30-07a9-404f-9834-bb954dd4243f','MEMPHIS CLERMONT-FERRAND'),
  ('rodolphe','wallgren','6050305e-de58-4167-81d1-5d8adc587dc0','ef1bb355-8a15-4953-9d9e-ba0a44448ae9','MEMPHIS COMPIEGNE'),
  ('rodolphe','wallgren','6050305e-de58-4167-81d1-5d8adc587dc0','0732d94d-021f-4ab0-9a15-5ff5a535c351','MEMPHIS CAGNES SUR MER'),
  ('rodolphe','wallgren','6050305e-de58-4167-81d1-5d8adc587dc0','b7817c23-280d-45b5-a2c9-37a566b7048a','MEMPHIS HERON PARC'),
  ('rodolphe','wallgren','6050305e-de58-4167-81d1-5d8adc587dc0','05eabbd2-4dfd-425f-918b-11611601030e','KING MEMPHIS'),
  ('rodolphe','wallgren','6050305e-de58-4167-81d1-5d8adc587dc0','a0b54299-b69b-4864-8108-eb3f80ac9a0f','MEMPHIS LES SABLES D''OLONNE'),
  ('christine','pozzera','a52f2873-1e3a-49da-aaa0-928ec8cda8e9','b09b5647-2fed-41b7-b0a5-0ae1fc19786a','FRITADINE JAURES'),
  ('christine','pozzera','a52f2873-1e3a-49da-aaa0-928ec8cda8e9','ab8a057f-6a64-4118-843d-ee9a2c6998ed','ADCP Design'),
  ('edith','dablanc','469b4174-2fdc-4ee9-b535-cf52a8275445','944dfc1e-53b1-4f8c-bddd-2a46760ce1d1','MEMPHIS BESANCON'),
  ('edith','dablanc','469b4174-2fdc-4ee9-b535-cf52a8275445','77332c77-8763-4611-a4a2-066c4cb59cfe','MEMPHIS EVREUX'),
  ('edith','dablanc','469b4174-2fdc-4ee9-b535-cf52a8275445','05eabbd2-4dfd-425f-918b-11611601030e','KING MEMPHIS'),
  ('edith','dablanc','469b4174-2fdc-4ee9-b535-cf52a8275445','ef1bb355-8a15-4953-9d9e-ba0a44448ae9','MEMPHIS COMPIEGNE'),
  ('edith','dablanc','469b4174-2fdc-4ee9-b535-cf52a8275445','b7817c23-280d-45b5-a2c9-37a566b7048a','MEMPHIS HERON PARC'),
  ('edith','dablanc','469b4174-2fdc-4ee9-b535-cf52a8275445','d51849c6-df11-42f2-ae1a-9228aee36c53','NEWSIES'),
  ('edith','dablanc','469b4174-2fdc-4ee9-b535-cf52a8275445','6050305e-de58-4167-81d1-5d8adc587dc0','MEMPHIS CAEN'),
  ('edith','dablanc','469b4174-2fdc-4ee9-b535-cf52a8275445','0732d94d-021f-4ab0-9a15-5ff5a535c351','MEMPHIS CAGNES SUR MER'),
  ('johnny','okaro','27e91864-0c92-4cca-b9e9-1cabb8961304','2c52067b-ee32-40bb-b442-ce0933da076b','MEMPHIS COFFEE DREUX'),
  ('arnaud','schrotter','d71803b8-7d77-4918-bb61-e73e165a61f9','48d48530-b46c-47a7-b0ae-5b4266ecafbe','MEMPHIS RONCQ'),
  ('arnaud','schrotter','d71803b8-7d77-4918-bb61-e73e165a61f9','3ae9bfbf-b102-4b62-abf6-27216f9877a2','MEMPHIS BRUAY-LA-BUISSIERE'),
  ('gaspard','neyraud','66098b9e-9591-4ab1-908b-178b9bab2d10','c7bd1090-3c11-4771-aada-93e68b65b82e','LOCATION OISANS LINGE'),
  ('paul-alexandre','rapeneau','3879f616-20ad-438a-88eb-1d36cc254761','78f505dd-1475-42fa-9a0e-cc89437eba1c','FINANCIERE MOULIN DES TROIS FRERES'),
  ('paul-alexandre','rapeneau','3879f616-20ad-438a-88eb-1d36cc254761','bb35cad2-4777-479f-8e08-821df5b9e1a7','SUMMUM'),
  ('paul-alexandre','rapeneau','3879f616-20ad-438a-88eb-1d36cc254761','7fe8836b-29c2-4407-9e85-ada5107499b8','SOCIETE CIVILE VITICOLE DE CRUGNY'),
  ('paul-alexandre','rapeneau','3879f616-20ad-438a-88eb-1d36cc254761','99200be9-12c3-420e-afa5-69b75b368739','CHAMPAGNE CHARLES ORBAN'),
  ('paul-alexandre','rapeneau','3879f616-20ad-438a-88eb-1d36cc254761','bd4e190a-b83e-4368-89bc-e566243d306e','LES CHAMPS RENIERS'),
  ('paul-alexandre','rapeneau','3879f616-20ad-438a-88eb-1d36cc254761','ef3333e5-16d1-4dbb-b8ac-2304561129e9','CHAMPAGNE P. LOUIS MARTIN'),
  ('paul-alexandre','rapeneau','3879f616-20ad-438a-88eb-1d36cc254761','59dd951c-54be-46e3-abb2-9fcc9aa1e2ad','E.R LA MAISON DU CHAMPAGNE'),
  ('paul-alexandre','rapeneau','3879f616-20ad-438a-88eb-1d36cc254761','5e485c63-0046-46e9-af94-8af34edce71d','SAS DU CHATEAU DE BLIGNY'),
  ('paul-alexandre','rapeneau','3879f616-20ad-438a-88eb-1d36cc254761','4e1381b0-cd00-41e6-9d92-2fd935a0ec83','SCEA DE LA VIEILLE FRANCE'),
  ('paul-alexandre','rapeneau','3879f616-20ad-438a-88eb-1d36cc254761','6fb2cc88-1994-45c4-8bda-d91bc56b869f','LOUIS LEVANT SAS'),
  ('christophe','magniez','aa91385d-7ae1-4610-9e7f-ad8b74c9088c','04705079-e7db-4e4d-8679-86c404b92f29','TACOS LONGUENESSE'),
  ('romain','hebrard','fe85aa25-2f90-4729-bf2c-3c9512dfdd63','0c4ec897-025f-4665-968b-3be65a50f1dd','ALL SOLUTIONS'),
  ('romain','hebrard','fe85aa25-2f90-4729-bf2c-3c9512dfdd63','2d99f92c-0e7f-4f03-a077-ae0c34b00b76','DUHAMEL LOGISTIQUE'),
  ('romain','hebrard','fe85aa25-2f90-4729-bf2c-3c9512dfdd63','40fbc355-69f6-4e8e-aa3c-d347e2bbde2e','QUALITAIR&SEA (DIMOTRANS)'),
  ('romain','hebrard','fe85aa25-2f90-4729-bf2c-3c9512dfdd63','227bd71f-a5a1-41c2-8a10-c23f530ca9ad','ALIS INTERNATIONAL'),
  ('romain','hebrard','fe85aa25-2f90-4729-bf2c-3c9512dfdd63','31e4c982-69bc-49bd-bd11-5cf7ea4f5654','DT PROJECT'),
  ('romain','hebrard','fe85aa25-2f90-4729-bf2c-3c9512dfdd63','fb1f8caa-68f4-42f4-8115-4bcdbf401539','DIMOTRANS GLOBAL TRANSPORT'),
  ('romain','hebrard','fe85aa25-2f90-4729-bf2c-3c9512dfdd63','24d5d075-4fb8-4718-a54f-b7fa5e34d440','ALL''S PARTICIPATIONS'),
  ('romain','hebrard','fe85aa25-2f90-4729-bf2c-3c9512dfdd63','79c24f7b-6153-4ca8-b698-c8c95514805d','DIMOTRANS LOGISTICS'),
  ('romain','hebrard','fe85aa25-2f90-4729-bf2c-3c9512dfdd63','f90cb6a1-f673-4e7f-a637-c753980b1335','BRETAGNE SERVICES LOGISTIQUES'),
  ('myriam','legendre','467284ce-8161-4dac-9831-72a55fdabbf2','5dc78a74-c74a-4f1c-ae82-78e4223d81af','MEDIA-PARTICIPATIONS PARIS'),
  ('myriam','legendre','467284ce-8161-4dac-9831-72a55fdabbf2','8f53705b-09f8-4f8b-b694-9b2ab0ad0120','PLASTOY'),
  ('ludovic','pierre','17f1f379-4cc7-46ae-813a-77e74fc83e1a','66bbb60f-6c6f-42c0-8e75-007f875b7b48','CHANNEL SEA FOOD'),
  ('jean-marie','deshayes','e794d8e2-ae3f-4232-9c6d-fa0faa7d4dff','25fb0916-8264-4ae1-9b5e-317df203ef09','LA BERCOISIERE'),
  ('jean-marie','deshayes','e794d8e2-ae3f-4232-9c6d-fa0faa7d4dff','0f48ed24-0651-4006-8ab0-189ff6b376e9','HBC'),
  ('jean-marie','deshayes','e794d8e2-ae3f-4232-9c6d-fa0faa7d4dff','b848d9e7-60b8-4e4c-8373-2c25d551fe24','SCEA BTN'),
  ('jean-marie','deshayes','e794d8e2-ae3f-4232-9c6d-fa0faa7d4dff','56483135-75f4-4840-817a-5a9705c6146f','AUX CO ''PAINS GOURMANDS'),
  ('xavier','belaigues','68aa0872-1f47-4fcb-9307-0924004c62fe','8753e2fb-2a83-43b7-9c8f-486f693be77f','LIBRAIRIE BELLEVILLOISE'),
  ('karine','galienne','c31ec367-aabd-4090-a71a-cf2d48173a76','cd6dbf70-ddc0-4b24-a29e-42edcb8472cb','TECUMSEH La Mure'),
  ('karine','galienne','c31ec367-aabd-4090-a71a-cf2d48173a76','62fc76f4-8b46-4b03-8f3c-f41f4911cec0','TECUMSEH Cessieu'),
  ('laure','guilmet','36f2b4b0-4c21-41cf-ae33-1e9f78b9555b','dd45596d-c944-4864-b827-3e8934391dc9','CHER JEUMINA'),
  ('michel','daligny','36f2b4b0-4c21-41cf-ae33-1e9f78b9555b','7142f03b-d1da-4695-827b-fbddc3d97002','CONGREGATION MARIE IMMACULEE'),
  ('stephane','cozic','1bd8d760-dabd-4de9-b5b6-774347ddff77','3d839246-44d5-481c-9b89-6c2ae2fe5d3f','LOIR SA'),
  ('','fanny','987267fc-2ca6-458b-a0e3-725aa0ed7e1e','f21fd73b-6a1c-4199-9698-6e475b3e6763','AUTO DEPANNAGE - GARAGE IEMMOLO SARL'),
  ('stéphane','iemmolo','987267fc-2ca6-458b-a0e3-725aa0ed7e1e','f21fd73b-6a1c-4199-9698-6e475b3e6763','AUTO DEPANNAGE - GARAGE IEMMOLO SARL'),
  ('xavier','moraga','9c60e568-4747-45ee-8b23-3d8077ef25f0','cb520b89-b8b0-4d65-aab4-e41bef48f43c','HOTEL GAVARNI'),
  ('sofia','panarieilo','c5f8a4e0-5d01-44a9-bed9-683ddd1c06b8','d74c1c10-0bf9-432f-a1e0-ee614c9364a0','SCI LA JARRIE'),
  ('sophie','legrand','e75fccfc-9bf2-44e3-9702-00871ca587fb','987b2792-ed12-4335-8819-5692f0702077','GENECO'),
  ('sophie','legrand','e75fccfc-9bf2-44e3-9702-00871ca587fb','9ffcfe47-1493-44ed-bafc-dd54057e835d','MEYDES'),
  ('stephane','boivin','bc9bc279-44cb-4be8-9a0c-59e6ed6ebb95','396dcc0c-28c7-4ad9-8a8f-969490256e17','OKEENEA BATIMENT'),
  ('véronique','flick','e249f4ae-b77e-42b5-99e7-f504830682b7','18fac538-127b-4f59-b47e-d95a2e9920d0','BEAUMONT'),
  ('véronique','flick','e249f4ae-b77e-42b5-99e7-f504830682b7','f15c6e0c-59c3-4f90-ba2b-3a0251a41a55','SCEA DU HARAS DE LA PLANCHARDERIE'),
  ('véronique','flick','e249f4ae-b77e-42b5-99e7-f504830682b7','12702350-4d41-418d-b39a-592025b3ba3c','NANCY CHEVAL'),
  ('jean louis','krafft','5dee21cf-2107-45ee-943d-65a9a5bcb79e','4da808ea-c521-473b-aa03-a8411d398ffb','FINANCIERE STIC'),
  ('brigitte','roulier','45bb5ce4-ea2b-44d2-b87c-82c0a5dcaf8b','2a76baa4-8093-4828-91c6-d07fddd897c6','CABINET CSJC'),
  ('gregory','vey','79005baa-6096-4350-8479-03fb79e05aa0','0d8aeeba-868b-4828-906c-8c4ace491ee1','G.A.S.'),
  ('patrick','soquet','421074a7-b8de-48f9-9c43-727a58f275e7','8c410118-f524-4a82-a075-a4234b2b10cd','LA BRASSERIE D''ATRIUM'),
  ('edouard','damidot','df731bf2-e84e-46fe-8aa7-a4c29a3e485b','9315059d-5261-4fa8-a620-b35a7e1e6df0','CHRONO FRET'),
  ('christian','vigezzi','63ee5bb1-a504-485e-9139-91902b7d30d6','21b22935-a5a0-4552-b368-57823026c8b6','EMERAUDE EXPERIENCE'),
  ('nathalie','defreixo','8d30aefa-530c-45cf-a20a-6b0ed169deea','cf1a7801-fb30-4d33-b792-69e7174b63f6','SCI DE FREIXO 2'),
  ('geoffroy','cornudet','19214dd5-defd-4687-b0ad-c8c767ec12fa','9eeb7a59-b893-450b-b759-1fbe0f182c00','SAS SOREF1 RIVES D''ARCINS'),
  ('philippe','thureau','6b7bd1cf-bd09-4979-88a9-ff2ba66e9140','7ff9b9a5-5a42-4e91-8a69-2d1f21d27ff9','LE FOURNIL DE SAUBION'),
  ('remi','deheunynck','d68ade34-cd2e-4036-a075-e249174b2560','aebde6d1-66f5-49ff-8f9b-6fa9e24f6452','REVA'),
  ('emmanuel','laureau','31c1a792-e17d-4c73-aca5-3732f05803f9','a689a250-873d-4ae7-87ac-4589eefb4da4','EARL LAUREAU'),
  ('pascal','naessens','d8e88566-6768-4925-94f9-7dffa970b137','c13c4b62-9f7d-4a20-ae29-9fe6653b3de1','BLAISE DECOUPAGE INDUSTRIELLES'),
  ('anaïs','dossal verdi','bc4924bd-8e96-4994-a70a-10ada9c430f4','2c155c7c-f116-4ae7-8c25-f5fd3c68cf24','CONSERVES STEPHAN'),
  ('anaïs','dossal verdi','bc4924bd-8e96-4994-a70a-10ada9c430f4','fc88bd7e-ed9b-4190-be8a-3a6913c81830','FIDELE'),
  ('anaïs','dossal verdi','bc4924bd-8e96-4994-a70a-10ada9c430f4','4ef9171d-856a-4904-9bd0-9f0d8156b3fb','PECHERIES D''ARMORIQUE'),
  ('anaïs','dossal verdi','bc4924bd-8e96-4994-a70a-10ada9c430f4','eae09fde-15d3-4143-995f-253279aceb1b','HALIOS'),
  ('anaïs','dossal verdi','bc4924bd-8e96-4994-a70a-10ada9c430f4','617d1de0-f1de-4f7b-b9de-1c224e406ece','GROUPE LE GRAET'),
  ('anaïs','dossal verdi','bc4924bd-8e96-4994-a70a-10ada9c430f4','0f44230f-4b2e-4555-a3e7-c179aeea199e','CELTARMOR'),
  ('ugo','mounier','33f077ab-7b1c-47c1-9ec8-af80f8c4b975','acfa578c-cbf8-498e-b5e6-f0f14450156b','UGAR SARL'),
  ('corinne','durdan','33f077ab-7b1c-47c1-9ec8-af80f8c4b975','acfa578c-cbf8-498e-b5e6-f0f14450156b','UGAR SARL'),
  ('vanessa','le troquer charvin','c1f23e94-8d8b-40e1-9a25-a89ea054f8f5','f55f6ae8-59a0-4463-abf9-44ebd526a075','LYSIPACK'),
  ('pascal','sagardia','5702eeb3-fe02-425d-8c2b-00e32233c26c','4c5eabd6-ddbd-47ba-acf7-8a3a16de75a3','CAMPISTRON'),
  ('barbara','ventura','f1c93800-7af9-407c-a83b-7ec562f48f36','230cea8c-f784-4d72-92dc-d2da689b7494','PRECICULTURE'),
  ('barbara','ventura','f1c93800-7af9-407c-a83b-7ec562f48f36','41e64f36-fa13-4985-946b-2d1d531ba290','NICOLAS SPRAYERS'),
  ('barbara','ventura','f1c93800-7af9-407c-a83b-7ec562f48f36','9bbac398-00e0-4231-b82e-02b6d7051254','SUPRAY Technologies'),
  ('barbara','ventura','f1c93800-7af9-407c-a83b-7ec562f48f36','de16536a-f50c-45df-aa12-8d1a57436544','HOLMER EXXACT'),
  ('barbara','ventura','f1c93800-7af9-407c-a83b-7ec562f48f36','ae18eabb-2cf5-4241-aaf3-62574f5de379','SAMES'),
  ('barbara','ventura','f1c93800-7af9-407c-a83b-7ec562f48f36','9c061dc5-98e1-4d96-afd8-d0aa02ef6996','API SCM'),
  ('barbara','ventura','f1c93800-7af9-407c-a83b-7ec562f48f36','6abdc1bb-7467-4710-bbbe-9a8febcda923','EXEL INDUSTRIES'),
  ('barbara','ventura','f1c93800-7af9-407c-a83b-7ec562f48f36','ec577c73-6aa2-49f8-abe7-0f737f8f4ab1','HOZELOCK EXEL'),
  ('jerome','delbos','5e1b34c8-b6c4-4676-bdd9-6a35d6ec708b','ce4f58f6-f4f9-4bf9-9e57-549fff296ed8','MONKY LAVAL'),
  ('melanie','delest','84e9996e-b98b-41e1-8f74-64ffadeb2fca','8e61c483-afac-433e-bc4a-848a7a8ef328','HOLDING LMTD'),
  ('melanie','delest','84e9996e-b98b-41e1-8f74-64ffadeb2fca','34e16f58-8ed0-4417-98ed-40ca3de2f9e1','SCEA DE YREYE'),
  ('benoit','cornec','f747a1b7-7f21-4d73-a680-c422825d71b5','27da8c44-9bfb-491f-bb4d-df7ccd04e91f','SCEA CORNEC'),
  ('alain','bernard','10dc0590-0694-4f48-874e-113fa4334cde','b8f60c5e-b8de-4a7a-a3bd-8a2aa990a192','DE L HENT MEUR'),
  ('frederic','peltier','19214dd5-defd-4687-b0ad-c8c767ec12fa','cf0ca2dc-ba78-4265-bb5b-5d6443678923','SCI CTRE COMMERCIAL BORDEAUX PREFECTURE'),
  ('frederic','peltier','19214dd5-defd-4687-b0ad-c8c767ec12fa','9eeb7a59-b893-450b-b759-1fbe0f182c00','SAS SOREF1 RIVES D''ARCINS'),
  ('frederic','peltier','19214dd5-defd-4687-b0ad-c8c767ec12fa','a188f527-8284-4e0a-8474-c149c38eb61f','SYND COPROPRIETE CTRE COMMERCI MERIADECK'),
  ('romain','ciolfi','57a5f1ed-61fb-45cc-b05e-3c45ffbdb884','284c715a-d141-47ea-917f-5e1aaeb8914c','ASADO'),
  ('jean-','popihn','4101b1cd-05c5-4dd6-825a-214e31041a10','2dbeb5d4-c653-4203-9753-86fb77954ce0','SOCIETE D EXPLOITATION ET DE DISTRIBUTION D ENERGIE PARISIENNE'),
  ('sebastien','armoogum','e06baf01-d53d-4531-9700-670d5774a8bb','7091a00e-d14f-4dc9-960d-96e65746e1c8','H8 COLLECTION'),
  ('','connort','ea561e3d-065b-426a-9025-a31ac3061386','6fb24645-d8ed-4b6f-830a-923fb72f3f39','AGENCE METAYER/ORPI'),
  ('isabelle','le breton','509f716f-9970-479b-b5e9-3bef85893bb2','4c8abc5d-6e69-4365-ada8-e9125591b9e5','M&ML'),
  ('','cekleov','60e83e0f-40a8-4a55-b284-974d9b6f86f1','9465193c-afcf-4f8a-8b3a-998f81e258fa','CITYA VAL D''OUEST'),
  ('pascal','giorgi','b4ad3f6b-95b5-4c7a-a239-49401383b30a','fcd03900-6de9-4583-bc08-2a81222f3ee7','SCI PVJL'),
  ('stephane','plantier','6af8cdd1-e764-4f5c-ade3-ea03e911adc3','83a8d6da-e0af-4b6c-b470-f8febb74bbc7','LABORATOIRE OXENA'),
  ('stephane','plantier','6af8cdd1-e764-4f5c-ade3-ea03e911adc3','acb21802-ac72-4345-a272-f8bf15a06daf','LABORATOIRE SOLUTIO'),
  ('aline','jouin','e903c5a5-4850-4e6f-b88a-aa987975f171','b32c7ff8-51c0-4553-bf41-cff03cfa46f1','APHRODITE'),
  ('aline','jouin','e903c5a5-4850-4e6f-b88a-aa987975f171','d65d4bdb-0b22-41ea-8385-823e0e7f4e2a','ATHENA'),
  ('stephane','randi','ebb768a2-67ff-4086-a460-4b6cd9ea0e1e','c4cbf6c6-28de-4b5b-b18c-6459d3890112','SARL LA P TITE CHARLY'),
  ('stephane','randi','ebb768a2-67ff-4086-a460-4b6cd9ea0e1e','51aa9553-3c93-4d5a-875f-e20d19e204f8','LA P''TITE CHARLY 3'),
  ('stephane','randi','ebb768a2-67ff-4086-a460-4b6cd9ea0e1e','a389172a-9c1e-446c-b010-1dc6e18ea4d0','LA P TITE CHARLY FAMILY'),
  ('tanguy','michel','473c3f61-c012-4ba9-9b4c-bef72185af36','8b699726-51fe-449c-b70f-396fb973afb4','KTM'),
  ('gerard','kapousouzian','96b5f3e0-706a-4b62-9d4a-5655cd6428bf','37e24179-942c-4382-b21a-5de4612deb10','MONTILIA'),
  ('gerard','kapousouzian','96b5f3e0-706a-4b62-9d4a-5655cd6428bf','10ac5133-4ef2-4e64-addc-48c7bf236fe4','VALIMMONIA'),
  ('benoit','riou','e4bc7c31-dc52-4f26-a45b-aab9624afcb3','180caea7-245d-49a1-ac7b-7212d0057170','VALORG ELORN'),
  ('marine','anton','3531f11a-d241-40b4-8d96-7d78b3664dd9','8d09bd05-923f-42e9-816a-f4465156eb8f','Une histoire de femme BY Xara Confection'),
  ('marine','anton','3531f11a-d241-40b4-8d96-7d78b3664dd9','5b9ecf63-0869-48fc-b97e-08f9c206a333','HAASE INNOVATION'),
  ('ameur zaimeche','zeineb','e8dbe42b-8cd4-495a-8ad5-e2d39dff2c92','44a2b856-c5af-47b8-9c82-daca210ebbe5','SCI SOUGY'),
  ('yannick','loubiere','4f5bc9ea-c2c8-45b9-bb78-2a3b7ad83e3e','da491e1f-db5e-4b6f-9d83-6be3be8ce225','AMETIS'),
  ('yannick','loubiere','4f5bc9ea-c2c8-45b9-bb78-2a3b7ad83e3e','fcf190fd-78d0-47d7-a98d-8e9b7019021c','AUDIT EXPERTISE COMPTABLE 47'),
  ('yannick','loubiere','4f5bc9ea-c2c8-45b9-bb78-2a3b7ad83e3e','13876e33-2448-4006-ab8b-872b87f75beb','SOCIETE FIDUCIAIRE DE GESTION COMPTABLE'),
  ('gildas','guillard','18375c53-de26-4082-866c-9f8cdd9b69e6','07d6e44d-0dc7-4109-b966-8a1c6227eb24','SAMATAL ENTERTAINMENT'),
  ('michael','sterckeman','4435b53c-552e-424f-a883-fa7077d4d6b9','13f04e72-9e1d-4296-a3ab-9840b391dfc2','EARL STERCKEMAN'),
  ('nicolas','saliou','ea86fb2f-299e-4541-8a16-6abe9a97a8ae','2ea69f8a-9171-4672-abe4-0f7d795b2485','FERME AVICOLE DE KERROUX'),
  ('nicolas','saliou','ea86fb2f-299e-4541-8a16-6abe9a97a8ae','1320ea83-51c2-41ca-b276-49636b822ec3','OEUF D''ARMOR'),
  ('nicolas','saliou','ea86fb2f-299e-4541-8a16-6abe9a97a8ae','a2730234-68f4-48ab-83d7-2902e7ba87ae','UIOU MAD'),
  ('thomas','saulnier','fe056e06-222e-42f0-9c16-eb70983d4b88','a9648f6c-9966-4cbc-a165-e4b39d12cd22','CITYA IMMOBILIER ETOILE (CITYA URBANIA ETOILE)')
)
insert into public.contacts_comptes (contact_id, compte_id, relation_directe)
select ct.id, s.compte_a_lier::uuid, false
  from source s
  join public.contacts ct
    on lower(coalesce(ct.prenom, '')) = s.prenom
   and lower(ct.nom) = s.nom
   and ct.compte_id = s.compte_direct::uuid
on conflict (contact_id, compte_id) do nothing;

commit;

-- ============================================================================================
-- CONTRÔLES APRÈS EXÉCUTION
-- ============================================================================================
--
-- Total attendu : 3380 relations directes + 145 supplémentaires, soit 3525 lignes. Le total peut
-- dépasser de un : Armelle VIN existe en double dans contacts, même compte et même e-mail
-- (a.vin@cabinetjourdan.com). Les deux exemplaires recevront la relation. Ce doublon est un
-- problème de données distinct, à traiter à part — il ne bloque pas cette reprise.
--
--   select count(*) filter (where relation_directe) as directes,
--          count(*) filter (where not relation_directe) as supplementaires,
--          count(*) as total
--     from public.contacts_comptes;
--
-- Le cas témoin de William — Romain HEBRARD doit ressortir avec 10 comptes,
-- dont DIMOTRANS en direct et DUHAMEL LOGISTIQUE parmi les autres :
--
--   select cp.nom, cc.relation_directe
--     from public.contacts_comptes cc
--     join public.contacts ct on ct.id = cc.contact_id
--     join public.comptes cp on cp.id = cc.compte_id
--    where lower(ct.nom) = 'hebrard' and lower(coalesce(ct.prenom,'')) = 'romain'
--    order by cc.relation_directe desc, cp.nom;
--
-- CE QUI RESTE À FAIRE APRÈS CETTE MIGRATION
-- 1. Le code lit encore contacts.compte_id pour afficher les contacts d'un compte : il doit
--    passer par contacts_comptes, sinon la donnée reprise ici reste invisible.
-- 2. contacts.compte_id est conservé comme compte principal. Le supprimer demanderait de
--    reprendre tous les écrans qui s'en servent, et il porte une information réelle.
-- 3. Le contact responsable doit aussi apparaître sur le compteur, pas seulement sur le site
--    (demande du 13/08) — c'est un autre chantier, sur une autre table.
