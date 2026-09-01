-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES DATES DE CLÔTURE INVENTÉES REVIENNENT À CELLES DE SALESFORCE
--
-- Michel, 01/09/2026, sur la recommandation « CAPTA - SDC 152 154 RUE DAMREMONT - 2026-04-24 » :
-- « peux-tu m'expliquer pourquoi cette reco a été clôturée le 3 août ». Réponse : elle ne l'a pas
-- été. Salesforce dit Closed Won au 20/05/2026. Le 3 août est un bouche-trou.
--
-- ══ D'OÙ VIENT LE 3 AOÛT ══
--
-- La migration 20260812090000_statuts_cycles_de_vie a introduit finalite_cloture et rempli les dates
-- manquantes ainsi :
--
--     date_cloture = coalesce(r.date_cloture, r.date_modification)
--
-- Faute de vraie date, elle a donc écrit la date de DERNIÈRE MODIFICATION de la ligne. Le journal
-- d'audit le montre à la seconde : le 12/08/2026 à 15 h 29, « date_cloture : null → 2026-08-03 »,
-- origine « système ». Aucun événement commercial n'a eu lieu ce jour-là — c'est simplement le jour
-- où un traitement avait touché ces lignes pour la dernière fois. 92 dossiers portent cette date,
-- contre 9 pour la date suivante la plus fréquente : le pic est un artefact, pas un fait.
--
-- ══ POURQUOI LA RÉPARATION DU 30/08 NE LES A PAS RATTRAPÉS ══
--
-- 20260830180000_identifiant_salesforce_manquant rapprochait sur COMPTE + NOM, et ne gardait que les
-- rapprochements uniques des deux côtés — 11 sur 114. Elle écartait, en le disant, « 92 dossiers dont
-- le nom revient plusieurs fois dans Kimatch pour le même compte ». C'était la bonne prudence : deux
-- opportunités Salesforce peuvent porter exactement le même nom sur le même compte. DAMREMONT en est
-- l'exemple — deux opportunités créées à 52 secondes d'intervalle, l'une gagnée le 20/05, l'autre
-- abandonnée le 28/04.
--
-- ══ CE QUI LÈVE L'AMBIGUÏTÉ : LA DATE DE CRÉATION ══
--
-- La reprise a conservé date_creation à la milliseconde depuis Opportunity.CreatedDate. Sur
-- DAMREMONT : 09:42:34 et 09:43:26 des deux côtés. Le rapprochement se fait donc sur
-- NOM + DATE DE CRÉATION À LA SECONDE, le nom étant normalisé (casse, ponctuation, et l'emoji
-- d'énergie que Salesforce met en tête et que 20260831290000 a retiré de Kimatch).
--
-- Résultat mesuré sur les 109 recommandations sans identifiant :
--
--     83  rapprochement unique des deux côtés          → identifiant + date rendus
--      6  plusieurs opportunités identiques candidates → date seule (voir plus bas)
--     20  aucune correspondance                        → dossiers nés dans Kimatch après le 18/08,
--                                                        ils n'ont pas d'origine Salesforce
--
-- Zéro conflit : aucune opportunité n'est réclamée par deux recommandations.
--
-- ══ LES 6 SANS IDENTIFIANT, ET POURQUOI ON S'ARRÊTE À LA DATE ══
--
-- Quatre recommandations « Electricité-DUHAMEL LOGISTIQUE-2024-2 » face à quatre opportunités
-- Salesforce portant le même nom, la même date de création et le même stade ; deux « ASAV » face à
-- deux. Leurs DATES DE CLÔTURE sont identiques dans chaque groupe (14/02/2024 et 09/02/2024) : la
-- date est donc certaine, quel que soit l'appariement.
--
-- LEURS MONTANTS, EUX, DIFFÈRENT (1 620 / 5 880 / 2 340 / 3 120 €, et 315 / 135 €), et les
-- recommandations Kimatch n'en portent aucun. L'appariement n'est donc PAS indifférent : poser les
-- identifiants au hasard collerait un jour le mauvais montant sur le mauvais dossier. On rend ce qui
-- est certain — la date — et on laisse l'identifiant vide, qui dira à la prochaine vérification qu'il
-- reste une décision humaine à prendre.
--
-- ══ ET 10 DOSSIERS DÉJÀ LIÉS PORTAIENT AUSSI UN BOUCHE-TROU ══
--
-- Ce sont ceux à qui 20260830180000 avait rendu leur identifiant sans relire leur date. Audit complet
-- des 1 594 recommandations liées, mené contre l'org Salesforce le 01/09/2026 :
--
--     identifiant introuvable dans l'org      0
--     finalité en désaccord                   0
--     date de clôture en désaccord           10   ← corrigées ici
--
-- ══ CE QU'ON NE TOUCHE PAS, ET POURQUOI ══
--
-- 20 recommandations sont clôturées dans Kimatch alors que Salesforce les montre encore en
-- Négociation ou Instruction. Vérification faite dans le journal d'audit : Matthieu Bruere les a
-- clôturées À LA MAIN, une par une, le 25/08/2026 entre 13 h 04 et 15 h 34, chacune avec son motif.
-- Ce n'est pas un défaut : c'est Kimatch qui est à jour et Salesforce qui ne l'est plus. Les rouvrir
-- effacerait le travail de quelqu'un.
--
-- Une recommandation (SYNDIC & CO - SDC RESIDENCE INCANDESCENCE) est Closed Lost dans Salesforce et
-- active dans Kimatch, modifiée aujourd'hui même. Même raison : on ne l'écrase pas.
--
-- AUCUN DES 99 DOSSIERS CORRIGÉS ICI N'A ÉTÉ CLÔTURÉ À LA MAIN — date_cloture_manuelle est nulle sur
-- les 99. C'est la condition qui rend cette migration sûre : elle ne remplace que des dates
-- calculées, jamais une décision.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Les 83 rapprochements sûrs : identifiant Salesforce et vraie date de clôture ──
update recommandations r
   set id_salesforce = v.sf,
       date_cloture = v.cloture
  from (values
  ('2d7ce43e-cb85-41d2-b957-674dd41c0c00'::uuid, '006bR00000DCTYDQA5', '2024-01-03'::date),
  ('abde0681-1ede-4f12-b618-c08c317a9e94'::uuid, '006bR00000DJDrhQAH', '2025-04-30'::date),
  ('1528a62e-66c2-49e8-b70a-9b8ac18c2696'::uuid, '006bR00000DJGklQAH', '2025-03-31'::date),
  ('82e4b9af-7b27-4989-b6ac-2ceb7fc6a361'::uuid, '006bR00000DjfPLQAZ', '2024-02-16'::date),
  ('175d3e6a-d4aa-4703-8db3-c2c2f192a199'::uuid, '006bR00000DjoRpQAJ', '2024-01-03'::date),
  ('3e263c26-a642-476e-acdb-06674667d007'::uuid, '006bR00000DjoR9QAJ', '2024-02-16'::date),
  ('64f68755-d5c1-42bc-a966-16bcccb69922'::uuid, '006bR00000EHlnJQAT', '2025-02-21'::date),
  ('cad06bca-d262-4edf-ae26-2625ed7ae32c'::uuid, '006bR00000EIXIPQA5', '2025-02-17'::date),
  ('1a623b7b-21b3-43a6-934a-ec2b0970e41e'::uuid, '006bR00000EawYTQAZ', '2025-04-08'::date),
  ('e84c3dea-ea86-4648-bd17-423ae230b86e'::uuid, '006bR00000EawqDQAR', '2025-06-02'::date),
  ('c71ca9cb-ea91-4638-851e-71031faa5a58'::uuid, '006bR00000EjMQyQAN', '2025-03-31'::date),
  ('1823f8e6-a4ab-4b4c-bee4-15b209d3eeea'::uuid, '006bR00000EjINOQA3', '2025-03-31'::date),
  ('d4023ab8-c696-44ac-944d-a532a43f8491'::uuid, '006bR00000GOL25QAH', '2025-05-12'::date),
  ('7d7d4dd3-4903-4574-a1db-1e5e91e2812c'::uuid, '006bR00000GOCOcQAP', '2025-06-04'::date),
  ('cefda6e2-4dab-4a5a-9a03-0233d26ae094'::uuid, '006bR00000IRt65QAD', '2025-07-01'::date),
  ('c0bde187-d966-4dfa-9fa1-978a7df09b99'::uuid, '006bR00000IRtXVQA1', '2025-07-01'::date),
  ('34dbdd75-f537-4cf4-b696-91bf9dd445dc'::uuid, '006bR00000JE7ujQAD', '2025-07-31'::date),
  ('6260172f-659e-4045-a913-0f7579a2d0ed'::uuid, '006bR00000JE8QzQAL', '2025-07-31'::date),
  ('2baec88f-608e-4401-b3d7-23e7961309e0'::uuid, '006bR00000K4qqvQAB', '2025-06-27'::date),
  ('8475978c-85a2-4824-9892-ae6e5ac8bfd2'::uuid, '006bR00000K43iHQAR', '2025-06-26'::date),
  ('41fc6c8f-1832-4317-88fe-3d8ba2ed8c4b'::uuid, '006bR00000K5tA1QAJ', '2025-06-11'::date),
  ('6a855340-2a82-4b67-9f99-232d99ddd508'::uuid, '006bR00000K5td3QAB', '2025-06-23'::date),
  ('9480131e-c417-4663-a362-cdd042c63ab2'::uuid, '006bR00000KbJbFQAV', '2025-07-31'::date),
  ('89574bae-9e08-4d76-a29f-3194df33b350'::uuid, '006bR00000KbJszQAF', '2025-07-31'::date),
  ('cda60c75-fe2e-45a7-a4dd-14e8d8998d4f'::uuid, '006bR00000KtBlhQAF', '2025-08-29'::date),
  ('dd7343a3-395e-45ad-8252-b2fe6ac27fe9'::uuid, '006bR00000KtCGLQA3', '2025-09-08'::date),
  ('7a9f7f00-9b47-416c-b1e4-6853ace713c1'::uuid, '006bR00000L3tdNQAR', '2025-06-25'::date),
  ('78115e6f-07b1-4d37-a308-a8e6137222f5'::uuid, '006bR00000L3uHhQAJ', '2025-06-25'::date),
  ('30166438-03b3-44b9-939b-441cacb7b7df'::uuid, '006bR00000LUdcXQAT', '2025-07-23'::date),
  ('35a2ac30-62a6-4351-a3b4-2ceb76b097d9'::uuid, '006bR00000LUVByQAP', '2025-07-21'::date),
  ('af7172c5-60a0-4c7b-bdc5-293b23d111f8'::uuid, '006bR00000LZZuuQAH', '2025-07-29'::date),
  ('2d080535-bdde-4c14-bd2b-2c443cf4dbdf'::uuid, '006bR00000La8J7QAJ', '2025-07-29'::date),
  ('255585b6-ce41-433f-8c53-113ec3ffb2bd'::uuid, '006bR00000LlGlBQAV', '2025-07-31'::date),
  ('cc269cd2-a729-425d-895e-10f44508dccd'::uuid, '006bR00000LlH1JQAV', '2025-07-31'::date),
  ('d23ff7c6-be3f-42a4-a991-85009351c9b3'::uuid, '006bR00000Ln6wFQAR', '2025-10-30'::date),
  ('c6770f43-83a5-45fa-9e3d-4eceab0913ae'::uuid, '006bR00000LmxBOQAZ', '2025-10-30'::date),
  ('e1b6ec82-677f-4446-8275-8eed95487993'::uuid, '006bR00000Lqt5xQAB', '2025-07-16'::date),
  ('6683f077-56bd-470e-8ec3-bb979bf0614c'::uuid, '006bR00000LqttxQAB', '2025-07-31'::date),
  ('2a89067b-b03f-4aa1-af3e-a4bb0c63f78f'::uuid, '006bR00000M1vaiQAB', '2025-07-31'::date),
  ('d5c3d6f2-d279-4ab1-a48b-0c775cc1db35'::uuid, '006bR00000M2pBRQAZ', '2025-07-31'::date),
  ('b4e791d5-265f-4f99-b297-b21e0024a1b6'::uuid, '006bR00000McQ1dQAF', '2025-08-26'::date),
  ('95063b48-9204-42e1-95e1-9f1a774d1b62'::uuid, '006bR00000Md0Y9QAJ', '2025-08-26'::date),
  ('a3aac8a4-bf9a-418e-9fca-dfec9c8cf42d'::uuid, '006bR00000Mhg5lQAB', '2025-08-31'::date),
  ('448681a8-c36c-4290-9536-228b27822f28'::uuid, '006bR00000MhgTxQAJ', '2025-08-31'::date),
  ('46a5ee45-6677-47c9-ab97-ff03439e5f73'::uuid, '006bR00000MhiZ0QAJ', '2025-07-25'::date),
  ('5cab408b-4934-41f7-b91e-0cb022d5dc44'::uuid, '006bR00000MiGpCQAV', '2025-07-23'::date),
  ('d3e323d3-6410-4a57-9821-7a3a0f168d7d'::uuid, '006bR00000NciFhQAJ', '2025-10-07'::date),
  ('1a8b7b2c-55fd-4744-883c-6726d982e1f4'::uuid, '006bR00000NcifVQAR', '2025-10-07'::date),
  ('3ca612b8-3b15-4a54-937b-5c30fe3a0e9a'::uuid, '006bR00000OGwrpQAD', '2025-09-26'::date),
  ('e02f1b00-7f63-4770-b81b-a6b6b72facff'::uuid, '006bR00000OGx6LQAT', '2025-09-26'::date),
  ('8bee35e0-0d77-460c-8888-af2709444c19'::uuid, '006bR00000QoqyvQAB', '2025-10-03'::date),
  ('1be5ddd0-c752-4555-8b3e-c268fcc638c8'::uuid, '006bR00000QomH0QAJ', '2025-10-03'::date),
  ('2e944629-d0ed-4a83-b402-6bc5076d8d48'::uuid, '006bR00000R8worQAB', '2026-02-05'::date),
  ('cfd28d0e-f7ed-452e-a842-85ee3d0bd8ac'::uuid, '006bR00000R8ZPHQA3', '2026-02-05'::date),
  ('6278cfc6-a5c1-4033-83f0-f03c2d1c5ef1'::uuid, '006bR00000RDlMYQA1', '2025-10-31'::date),
  ('092e7c8f-3b8a-442e-a6a9-c1df47f8aceb'::uuid, '006bR00000ROjkPQAT', '2025-10-09'::date),
  ('77c65432-c93d-4bf7-8c9c-26523044751b'::uuid, '006bR00000ROkq9QAD', '2025-10-15'::date),
  ('7b337546-db7b-4ae3-a3dc-e35f82306640'::uuid, '006bR00000Ri5kPQAR', '2025-11-14'::date),
  ('b7ae6ac3-ad2f-414f-a696-bd580cb8aeb8'::uuid, '006bR00000RhuM0QAJ', '2025-11-14'::date),
  ('206f94b6-96cf-4dee-be26-3f7642deae9c'::uuid, '006bR00000RxX21QAF', '2025-10-22'::date),
  ('4f8e1d0e-345e-4d48-bd9e-64508b63552b'::uuid, '006bR00000SGghVQAT', '2025-10-15'::date),
  ('0f8538a4-6d2e-4eb9-8a95-17186ba91da7'::uuid, '006bR00000SGTdqQAH', '2025-10-17'::date),
  ('61dc65ff-72f9-4349-baa9-07cb53f269c0'::uuid, '006bR00000Sn9MzQAJ', '2025-12-01'::date),
  ('56e37053-bde1-49c1-b701-3b7af887389e'::uuid, '006bR00000Sn9zhQAB', '2025-12-01'::date),
  ('c4067ca6-1196-43d7-897f-6ca9a965c5b7'::uuid, '006bR00000SnAVxQAN', '2025-12-01'::date),
  ('c5487ad8-e3e2-4068-99b8-d7e994cdd245'::uuid, '006bR00000SnAsXQAV', '2025-12-01'::date),
  ('96a37be9-b3f5-47d7-93ce-0349d7451f43'::uuid, '006bR00000TPxIjQAL', '2025-10-28'::date),
  ('e4dfca74-0a7a-45f7-8029-e88f0ffc610c'::uuid, '006bR00000TPy1tQAD', '2025-12-03'::date),
  ('58ef0290-f131-480d-8383-cdb2cd363ae8'::uuid, '006bR00000WCegoQAD', '2026-01-15'::date),
  ('0a23118c-db77-406b-a331-68a0a660017c'::uuid, '006bR00000WD4zSQAT', '2025-12-09'::date),
  ('c48cbee8-c386-45b0-9d37-a137e0c6211c'::uuid, '006bR00000YwmgbQAB', '2026-02-05'::date),
  ('57e1b857-20d7-4f69-86b1-4510f5a814e2'::uuid, '006bR00000YwLGdQAN', '2026-02-05'::date),
  ('82433441-aa24-4735-bae3-d56665c9b65e'::uuid, '006bR00000YwbOcQAJ', '2026-02-05'::date),
  ('d053e54b-e2dc-4fdc-b65b-7b55a8ded686'::uuid, '006bR00000a5rF3QAI', '2026-04-24'::date),
  ('9398e8c8-6b69-4be4-9481-1c14dd19f9c9'::uuid, '006bR00000a5eGGQAY', '2026-02-06'::date),
  ('ea0c9453-fd4a-491b-b600-ac14bccd7f1c'::uuid, '006bR00000eH179QAC', '2026-05-26'::date),
  ('6c64fc19-0189-4376-8a61-7e43086dc5f5'::uuid, '006bR00000eHBhaQAG', '2026-05-26'::date),
  ('11ad17c4-5069-41ac-85ea-e24269dd7982'::uuid, '006bR00000erOTNQA2', '2026-04-28'::date),
  ('fe1cf0ee-2d32-4ba8-90ea-1d22ef43a0ed'::uuid, '006bR00000er1beQAA', '2026-05-20'::date),
  ('588f528b-b8ff-4dac-8c34-ae08ea70f6b4'::uuid, '006bR00000erQBpQAM', '2026-05-13'::date),
  ('b6e2fbae-62ce-41ed-afed-4d11bc115cb6'::uuid, '006bR00000eqyKQQAY', '2026-05-05'::date),
  ('a8309c7d-b2ef-4299-827b-fa60999b8701'::uuid, '006bR00000g8m8wQAA', '2026-07-13'::date),
  ('29a75116-09b7-40b6-9fb6-774bfb5a127a'::uuid, '006bR00000lY1JaQAK', '2026-07-29'::date)
) as v(reco, sf, cloture)
 where r.id = v.reco
   and r.id_salesforce is null
   and r.date_cloture_manuelle is null;

-- ── 2. Les 6 ambigus : la date seule, l'identifiant reste à trancher ──
update recommandations r
   set date_cloture = v.cloture
  from (values
  ('54eee4eb-4f02-4de9-9b68-e49b97a46143'::uuid, '2024-02-14'::date),
  ('f3809db4-8cb7-4c29-ae83-63774c5cf3b3'::uuid, '2024-02-09'::date),
  ('37040c0e-45f0-41ab-81fb-dd1a95d186fa'::uuid, '2024-02-14'::date),
  ('4fdc67dd-6f09-4ea8-8eb1-f8eb8915daa4'::uuid, '2024-02-09'::date),
  ('866a2e2c-676d-4c09-a233-b9f3cbf7689a'::uuid, '2024-02-14'::date),
  ('fd4e8415-2efd-4c9e-8421-b2c3b5e0f01c'::uuid, '2024-02-14'::date)
) as v(reco, cloture)
 where r.id = v.reco
   and r.date_cloture_manuelle is null;

-- ── 3. Les 10 déjà liés dont la date n'avait jamais été relue ──
update recommandations r
   set date_cloture = v.cloture
  from (values
  ('5cb2e022-d03f-4dc2-b1ec-9ef51b42d4b6'::uuid, '2025-11-11'::date),
  ('e67e42d5-5b35-4d53-b7b4-eefd7820120f'::uuid, '2026-07-29'::date),
  ('a4afa648-d262-44c5-a260-a994cd61eadb'::uuid, '2024-10-08'::date),
  ('d77ba400-aae3-456f-8e67-496ac0bf366e'::uuid, '2024-12-16'::date),
  ('513818c6-6a04-4c67-9b89-7e941dd554d4'::uuid, '2025-10-06'::date),
  ('0a2dca23-39f7-413e-80ce-14e4ffef15ea'::uuid, '2024-12-11'::date),
  ('83fc38ff-c553-40c6-a103-b29fa428be99'::uuid, '2024-12-16'::date),
  ('f545a1a1-92b7-470a-83f2-88decf6cc41b'::uuid, '2024-01-03'::date),
  ('09e97096-3d0a-4197-a56a-1763ff4bbd8f'::uuid, '2026-03-25'::date),
  ('be514e2f-ec25-41e9-a0af-6810b4fca876'::uuid, '2025-07-15'::date)
) as v(reco, cloture)
 where r.id = v.reco
   and r.date_cloture_manuelle is null;

-- ── Le garde-fou ──
do $$
declare
  v_bouchon integer;
  v_sans_id integer;
  v_doublon integer;
begin
  -- Il doit rester EXACTEMENT une recommandation au 03/08/2026 : « MULTISITE - 2026-05-30 - SAS TVPJ »,
  -- dont Salesforce dit que c'est la vraie date. Les 91 autres viennent d'être rendues.
  select count(*) into v_bouchon from recommandations where date_cloture = date '2026-08-03';
  if v_bouchon <> 1 then
    raise exception 'Attendu 1 recommandation au 03/08/2026 apres reparation, trouve %', v_bouchon;
  end if;

  select count(*) into v_sans_id from recommandations where id_salesforce is null;
  raise notice 'Recommandations sans identifiant Salesforce : % (attendu 26 : 6 ambigus + 20 nees dans Kimatch)', v_sans_id;

  -- L'index unique l'interdit déjà ; on le vérifie quand même, une contrainte peut être retirée.
  select count(*) into v_doublon from (
    select id_salesforce from recommandations where id_salesforce is not null
     group by 1 having count(*) > 1) d;
  if v_doublon > 0 then
    raise exception 'Identifiant Salesforce partage par plusieurs recommandations : %', v_doublon;
  end if;
end;
$$;

commit;
