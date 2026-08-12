-- =============================================================================================
-- Créateur des mandats — reprise depuis Salesforce
-- =============================================================================================
-- « Connaître qui a créé et envoyé le mandat est plus important que le propriétaire »
-- (William, 12/08/2026). Décision de Naoëlle : c'est le créateur qu'on affiche.
--
-- Pourquoi cette donnée manquait : l'extraction d'origine (extract_batch.js) sélectionnait
-- CreatedDate mais pas CreatedById, d'où les 1429 cree_par_id vides. Réextrait le 12/08/2026
-- depuis l'org KiweeOrg avec `sf data query`.
--
-- À noter : Mandat__c n'a PAS de champ OwnerId — c'est un objet en master-detail sous le
-- compte. Il n'a donc jamais existé de propriétaire de mandat dans Salesforce, ce qui
-- confirme que le créateur est la seule information de responsabilité disponible.
--
-- La clé de rapprochement est mandats.id_salesforce, qui contient en réalité le NOM du
-- mandat (« Mandat 000007 ») et non un identifiant Salesforce technique. Le rapprochement
-- des personnes se fait par e-mail, pas par nom : les casses diffèrent entre les deux
-- systèmes (« Marie THONNARD » côté Salesforce, « Marie Thonnard » côté Kimatch).
--
-- Couverture : 1420 mandats sur 1438 rattachés à un profil Kimatch.
-- Les 18 autres ont été créés par des personnes absentes de Kimatch :
--   a.hadey@kiwee-energie.fr         9 mandats
--   e.eyoa@kiwee-energie.fr          6 mandats
--   l.tourreau@kiwee-energie.fr      3 mandats
-- Elles restent sans créateur : profils.id porte une clé étrangère (profils_id_fkey), on ne
-- peut donc pas créer un profil sans compte d'authentification. Ces mandats retombent sur
-- le propriétaire du compte dans le tableau de bord, ce qui reste correct.

begin;

-- g.gilles@kiwee-energie.fr — 420 mandats
update public.mandats m
   set cree_par_id = (select id from public.profils where lower(email) = 'g.gilles@kiwee-energie.fr'),
       date_modification = now()
 where m.cree_par_id is null
   and m.id_salesforce in (
     'Mandat 000117', 'Mandat 000118', 'Mandat 000119', 'Mandat 000120', 'Mandat 000121', 'Mandat 000122', 'Mandat 000123', 'Mandat 000124',
     'Mandat 000126', 'Mandat 000137', 'Mandat 000140', 'Mandat 000143', 'Mandat 000145', 'Mandat 000146', 'Mandat 000148', 'Mandat 000149',
     'Mandat 000152', 'Mandat 000153', 'Mandat 000154', 'Mandat 000155', 'Mandat 000156', 'Mandat 000157', 'Mandat 000158', 'Mandat 000159',
     'Mandat 000165', 'Mandat 000166', 'Mandat 000167', 'Mandat 000169', 'Mandat 000170', 'Mandat 000172', 'Mandat 000173', 'Mandat 000177',
     'Mandat 000185', 'Mandat 000187', 'Mandat 000191', 'Mandat 000195', 'Mandat 000196', 'Mandat 000197', 'Mandat 000203', 'Mandat 000205',
     'Mandat 000206', 'Mandat 000207', 'Mandat 000208', 'Mandat 000209', 'Mandat 000210', 'Mandat 000214', 'Mandat 000216', 'Mandat 000218',
     'Mandat 000224', 'Mandat 000226', 'Mandat 000228', 'Mandat 000232', 'Mandat 000234', 'Mandat 000236', 'Mandat 000237', 'Mandat 000245',
     'Mandat 000260', 'Mandat 000261', 'Mandat 000263', 'Mandat 000265', 'Mandat 000266', 'Mandat 000268', 'Mandat 000271', 'Mandat 000291',
     'Mandat 000293', 'Mandat 000296', 'Mandat 000297', 'Mandat 000302', 'Mandat 000303', 'Mandat 000311', 'Mandat 000312', 'Mandat 000316',
     'Mandat 000318', 'Mandat 000319', 'Mandat 000320', 'Mandat 000327', 'Mandat 000332', 'Mandat 000335', 'Mandat 000336', 'Mandat 000349',
     'Mandat 000350', 'Mandat 000351', 'Mandat 000352', 'Mandat 000356', 'Mandat 000357', 'Mandat 000358', 'Mandat 000360', 'Mandat 000362',
     'Mandat 000363', 'Mandat 000365', 'Mandat 000366', 'Mandat 000376', 'Mandat 000379', 'Mandat 000393', 'Mandat 000398', 'Mandat 000400',
     'Mandat 000401', 'Mandat 000407', 'Mandat 000408', 'Mandat 000409', 'Mandat 000410', 'Mandat 000418', 'Mandat 000422', 'Mandat 000423',
     'Mandat 000425', 'Mandat 000426', 'Mandat 000429', 'Mandat 000430', 'Mandat 000431', 'Mandat 000432', 'Mandat 000436', 'Mandat 000438',
     'Mandat 000442', 'Mandat 000443', 'Mandat 000444', 'Mandat 000446', 'Mandat 000447', 'Mandat 000448', 'Mandat 000449', 'Mandat 000450',
     'Mandat 000451', 'Mandat 000452', 'Mandat 000453', 'Mandat 000454', 'Mandat 000457', 'Mandat 000459', 'Mandat 000460', 'Mandat 000462',
     'Mandat 000463', 'Mandat 000464', 'Mandat 000478', 'Mandat 000480', 'Mandat 000485', 'Mandat 000487', 'Mandat 000488', 'Mandat 000498',
     'Mandat 000500', 'Mandat 000502', 'Mandat 000503', 'Mandat 000504', 'Mandat 000505', 'Mandat 000507', 'Mandat 000508', 'Mandat 000512',
     'Mandat 000518', 'Mandat 000540', 'Mandat 000546', 'Mandat 000552', 'Mandat 000561', 'Mandat 000562', 'Mandat 000563', 'Mandat 000567',
     'Mandat 000568', 'Mandat 000571', 'Mandat 000576', 'Mandat 000586', 'Mandat 000588', 'Mandat 000593', 'Mandat 000605', 'Mandat 000607',
     'Mandat 000611', 'Mandat 000612', 'Mandat 000618', 'Mandat 000620', 'Mandat 000630', 'Mandat 000654', 'Mandat 000688', 'Mandat 000689',
     'Mandat 000695', 'Mandat 000704', 'Mandat 000709', 'Mandat 000714', 'Mandat 000715', 'Mandat 000717', 'Mandat 000718', 'Mandat 000721',
     'Mandat 000724', 'Mandat 000726', 'Mandat 000736', 'Mandat 000737', 'Mandat 000739', 'Mandat 000740', 'Mandat 000741', 'Mandat 000745',
     'Mandat 000758', 'Mandat 000759', 'Mandat 000760', 'Mandat 000766', 'Mandat 000771', 'Mandat 000774', 'Mandat 000781', 'Mandat 000788',
     'Mandat 000805', 'Mandat 000816', 'Mandat 000820', 'Mandat 000821', 'Mandat 000822', 'Mandat 000823', 'Mandat 000825', 'Mandat 000833',
     'Mandat 000838', 'Mandat 000844', 'Mandat 000846', 'Mandat 000855', 'Mandat 000860', 'Mandat 000865', 'Mandat 000866', 'Mandat 000868',
     'Mandat 000870', 'Mandat 000891', 'Mandat 000893', 'Mandat 000897', 'Mandat 000898', 'Mandat 000901', 'Mandat 000903', 'Mandat 000907',
     'Mandat 000914', 'Mandat 000915', 'Mandat 000917', 'Mandat 000920', 'Mandat 000922', 'Mandat 000925', 'Mandat 000942', 'Mandat 000943',
     'Mandat 000947', 'Mandat 000955', 'Mandat 000967', 'Mandat 000968', 'Mandat 000969', 'Mandat 000982', 'Mandat 000989', 'Mandat 000997',
     'Mandat 000998', 'Mandat 000999', 'Mandat 001002', 'Mandat 001005', 'Mandat 001013', 'Mandat 001021', 'Mandat 001022', 'Mandat 001023',
     'Mandat 001027', 'Mandat 001029', 'Mandat 001033', 'Mandat 001034', 'Mandat 001037', 'Mandat 001039', 'Mandat 001042', 'Mandat 001044',
     'Mandat 001051', 'Mandat 001052', 'Mandat 001053', 'Mandat 001070', 'Mandat 001073', 'Mandat 001074', 'Mandat 001075', 'Mandat 001076',
     'Mandat 001077', 'Mandat 001078', 'Mandat 001091', 'Mandat 001093', 'Mandat 001098', 'Mandat 001099', 'Mandat 001101', 'Mandat 001106',
     'Mandat 001107', 'Mandat 001115', 'Mandat 001116', 'Mandat 001117', 'Mandat 001121', 'Mandat 001123', 'Mandat 001129', 'Mandat 001131',
     'Mandat 001137', 'Mandat 001138', 'Mandat 001144', 'Mandat 001145', 'Mandat 001146', 'Mandat 001155', 'Mandat 001160', 'Mandat 001161',
     'Mandat 001165', 'Mandat 001170', 'Mandat 001173', 'Mandat 001176', 'Mandat 001178', 'Mandat 001184', 'Mandat 001188', 'Mandat 001190',
     'Mandat 001191', 'Mandat 001198', 'Mandat 001199', 'Mandat 001205', 'Mandat 001206', 'Mandat 001208', 'Mandat 001215', 'Mandat 001219',
     'Mandat 001220', 'Mandat 001221', 'Mandat 001222', 'Mandat 001225', 'Mandat 001226', 'Mandat 001246', 'Mandat 001247', 'Mandat 001267',
     'Mandat 001275', 'Mandat 001280', 'Mandat 001281', 'Mandat 001282', 'Mandat 001283', 'Mandat 001295', 'Mandat 001296', 'Mandat 001300',
     'Mandat 001302', 'Mandat 001310', 'Mandat 001311', 'Mandat 001312', 'Mandat 001314', 'Mandat 001315', 'Mandat 001320', 'Mandat 001324',
     'Mandat 001325', 'Mandat 001329', 'Mandat 001330', 'Mandat 001331', 'Mandat 001334', 'Mandat 001335', 'Mandat 001336', 'Mandat 001337',
     'Mandat 001338', 'Mandat 001339', 'Mandat 001342', 'Mandat 001348', 'Mandat 001352', 'Mandat 001354', 'Mandat 001359', 'Mandat 001361',
     'Mandat 001363', 'Mandat 001366', 'Mandat 001376', 'Mandat 001377', 'Mandat 001378', 'Mandat 001380', 'Mandat 001383', 'Mandat 001385',
     'Mandat 001386', 'Mandat 001389', 'Mandat 001393', 'Mandat 001400', 'Mandat 001410', 'Mandat 001411', 'Mandat 001412', 'Mandat 001418',
     'Mandat 001420', 'Mandat 001421', 'Mandat 001426', 'Mandat 001427', 'Mandat 001433', 'Mandat 001440', 'Mandat 001441', 'Mandat 001443',
     'Mandat 001448', 'Mandat 001449', 'Mandat 001455', 'Mandat 001456', 'Mandat 001457', 'Mandat 001458', 'Mandat 001459', 'Mandat 001461',
     'Mandat 001467', 'Mandat 001471', 'Mandat 001474', 'Mandat 001475', 'Mandat 001481', 'Mandat 001482', 'Mandat 001483', 'Mandat 001485',
     'Mandat 001486', 'Mandat 001507', 'Mandat 001525', 'Mandat 001529', 'Mandat 001553', 'Mandat 001556', 'Mandat 001565', 'Mandat 001567',
     'Mandat 001575', 'Mandat 001578', 'Mandat 001579', 'Mandat 001580', 'Mandat 001581', 'Mandat 001590', 'Mandat 001591', 'Mandat 001593',
     'Mandat 001597', 'Mandat 001599', 'Mandat 001600', 'Mandat 001602', 'Mandat 001606', 'Mandat 001607', 'Mandat 001614', 'Mandat 001618',
     'Mandat 001631', 'Mandat 001633', 'Mandat 001634', 'Mandat 001638', 'Mandat 001639', 'Mandat 001644', 'Mandat 001654', 'Mandat 001655',
     'Mandat 001656', 'Mandat 001677', 'Mandat 001678', 'Mandat 001680', 'Mandat 001695', 'Mandat 001705', 'Mandat 001706', 'Mandat 001707',
     'Mandat 001708', 'Mandat 001709', 'Mandat 001725', 'Mandat 001744'
   );

-- m.thonnard@kiwee-energie.fr — 372 mandats
update public.mandats m
   set cree_par_id = (select id from public.profils where lower(email) = 'm.thonnard@kiwee-energie.fr'),
       date_modification = now()
 where m.cree_par_id is null
   and m.id_salesforce in (
     'Mandat 000010', 'Mandat 000011', 'Mandat 000012', 'Mandat 000132', 'Mandat 000134', 'Mandat 000135', 'Mandat 000136', 'Mandat 000138',
     'Mandat 000141', 'Mandat 000142', 'Mandat 000150', 'Mandat 000160', 'Mandat 000162', 'Mandat 000171', 'Mandat 000174', 'Mandat 000178',
     'Mandat 000180', 'Mandat 000181', 'Mandat 000182', 'Mandat 000183', 'Mandat 000184', 'Mandat 000186', 'Mandat 000188', 'Mandat 000189',
     'Mandat 000190', 'Mandat 000217', 'Mandat 000219', 'Mandat 000223', 'Mandat 000225', 'Mandat 000227', 'Mandat 000229', 'Mandat 000235',
     'Mandat 000238', 'Mandat 000239', 'Mandat 000241', 'Mandat 000242', 'Mandat 000243', 'Mandat 000244', 'Mandat 000246', 'Mandat 000248',
     'Mandat 000250', 'Mandat 000251', 'Mandat 000252', 'Mandat 000254', 'Mandat 000256', 'Mandat 000262', 'Mandat 000269', 'Mandat 000272',
     'Mandat 000279', 'Mandat 000283', 'Mandat 000288', 'Mandat 000289', 'Mandat 000301', 'Mandat 000304', 'Mandat 000305', 'Mandat 000307',
     'Mandat 000308', 'Mandat 000309', 'Mandat 000313', 'Mandat 000321', 'Mandat 000323', 'Mandat 000324', 'Mandat 000325', 'Mandat 000326',
     'Mandat 000328', 'Mandat 000329', 'Mandat 000330', 'Mandat 000333', 'Mandat 000334', 'Mandat 000337', 'Mandat 000338', 'Mandat 000339',
     'Mandat 000340', 'Mandat 000341', 'Mandat 000342', 'Mandat 000343', 'Mandat 000344', 'Mandat 000353', 'Mandat 000354', 'Mandat 000359',
     'Mandat 000361', 'Mandat 000364', 'Mandat 000367', 'Mandat 000368', 'Mandat 000370', 'Mandat 000372', 'Mandat 000373', 'Mandat 000374',
     'Mandat 000375', 'Mandat 000377', 'Mandat 000378', 'Mandat 000382', 'Mandat 000383', 'Mandat 000384', 'Mandat 000385', 'Mandat 000387',
     'Mandat 000388', 'Mandat 000389', 'Mandat 000391', 'Mandat 000392', 'Mandat 000394', 'Mandat 000395', 'Mandat 000397', 'Mandat 000402',
     'Mandat 000404', 'Mandat 000405', 'Mandat 000406', 'Mandat 000413', 'Mandat 000414', 'Mandat 000424', 'Mandat 000427', 'Mandat 000437',
     'Mandat 000439', 'Mandat 000445', 'Mandat 000456', 'Mandat 000458', 'Mandat 000461', 'Mandat 000465', 'Mandat 000466', 'Mandat 000469',
     'Mandat 000474', 'Mandat 000475', 'Mandat 000481', 'Mandat 000482', 'Mandat 000494', 'Mandat 000495', 'Mandat 000499', 'Mandat 000513',
     'Mandat 000514', 'Mandat 000538', 'Mandat 000539', 'Mandat 000551', 'Mandat 000560', 'Mandat 000575', 'Mandat 000579', 'Mandat 000581',
     'Mandat 000585', 'Mandat 000591', 'Mandat 000600', 'Mandat 000602', 'Mandat 000613', 'Mandat 000614', 'Mandat 000615', 'Mandat 000627',
     'Mandat 000629', 'Mandat 000631', 'Mandat 000632', 'Mandat 000635', 'Mandat 000657', 'Mandat 000658', 'Mandat 000659', 'Mandat 000701',
     'Mandat 000705', 'Mandat 000707', 'Mandat 000711', 'Mandat 000712', 'Mandat 000713', 'Mandat 000716', 'Mandat 000719', 'Mandat 000720',
     'Mandat 000727', 'Mandat 000730', 'Mandat 000731', 'Mandat 000732', 'Mandat 000743', 'Mandat 000746', 'Mandat 000802', 'Mandat 000806',
     'Mandat 000808', 'Mandat 000826', 'Mandat 000830', 'Mandat 000831', 'Mandat 000832', 'Mandat 000834', 'Mandat 000842', 'Mandat 000845',
     'Mandat 000852', 'Mandat 000853', 'Mandat 000861', 'Mandat 000871', 'Mandat 000874', 'Mandat 000880', 'Mandat 000882', 'Mandat 000887',
     'Mandat 000892', 'Mandat 000894', 'Mandat 000899', 'Mandat 000900', 'Mandat 000905', 'Mandat 000908', 'Mandat 000909', 'Mandat 000916',
     'Mandat 000924', 'Mandat 000944', 'Mandat 000956', 'Mandat 000957', 'Mandat 000962', 'Mandat 000963', 'Mandat 000964', 'Mandat 000966',
     'Mandat 000971', 'Mandat 000972', 'Mandat 000974', 'Mandat 000975', 'Mandat 000976', 'Mandat 000979', 'Mandat 000980', 'Mandat 000981',
     'Mandat 000984', 'Mandat 000986', 'Mandat 000987', 'Mandat 000990', 'Mandat 000991', 'Mandat 000992', 'Mandat 000995', 'Mandat 000996',
     'Mandat 001000', 'Mandat 001001', 'Mandat 001011', 'Mandat 001015', 'Mandat 001031', 'Mandat 001048', 'Mandat 001050', 'Mandat 001057',
     'Mandat 001061', 'Mandat 001065', 'Mandat 001067', 'Mandat 001092', 'Mandat 001100', 'Mandat 001102', 'Mandat 001104', 'Mandat 001105',
     'Mandat 001108', 'Mandat 001109', 'Mandat 001113', 'Mandat 001118', 'Mandat 001119', 'Mandat 001120', 'Mandat 001126', 'Mandat 001127',
     'Mandat 001132', 'Mandat 001133', 'Mandat 001134', 'Mandat 001135', 'Mandat 001136', 'Mandat 001139', 'Mandat 001141', 'Mandat 001147',
     'Mandat 001148', 'Mandat 001156', 'Mandat 001159', 'Mandat 001166', 'Mandat 001177', 'Mandat 001180', 'Mandat 001181', 'Mandat 001183',
     'Mandat 001193', 'Mandat 001200', 'Mandat 001202', 'Mandat 001204', 'Mandat 001209', 'Mandat 001213', 'Mandat 001217', 'Mandat 001224',
     'Mandat 001227', 'Mandat 001228', 'Mandat 001231', 'Mandat 001232', 'Mandat 001241', 'Mandat 001243', 'Mandat 001245', 'Mandat 001251',
     'Mandat 001254', 'Mandat 001255', 'Mandat 001257', 'Mandat 001258', 'Mandat 001259', 'Mandat 001260', 'Mandat 001261', 'Mandat 001262',
     'Mandat 001263', 'Mandat 001264', 'Mandat 001265', 'Mandat 001273', 'Mandat 001284', 'Mandat 001287', 'Mandat 001294', 'Mandat 001298',
     'Mandat 001307', 'Mandat 001308', 'Mandat 001309', 'Mandat 001313', 'Mandat 001319', 'Mandat 001327', 'Mandat 001344', 'Mandat 001349',
     'Mandat 001351', 'Mandat 001356', 'Mandat 001357', 'Mandat 001358', 'Mandat 001365', 'Mandat 001367', 'Mandat 001379', 'Mandat 001381',
     'Mandat 001382', 'Mandat 001392', 'Mandat 001399', 'Mandat 001403', 'Mandat 001406', 'Mandat 001409', 'Mandat 001428', 'Mandat 001429',
     'Mandat 001430', 'Mandat 001432', 'Mandat 001434', 'Mandat 001435', 'Mandat 001436', 'Mandat 001437', 'Mandat 001438', 'Mandat 001442',
     'Mandat 001447', 'Mandat 001462', 'Mandat 001469', 'Mandat 001473', 'Mandat 001477', 'Mandat 001479', 'Mandat 001490', 'Mandat 001494',
     'Mandat 001497', 'Mandat 001510', 'Mandat 001513', 'Mandat 001518', 'Mandat 001520', 'Mandat 001521', 'Mandat 001522', 'Mandat 001523',
     'Mandat 001524', 'Mandat 001530', 'Mandat 001532', 'Mandat 001534', 'Mandat 001568', 'Mandat 001571', 'Mandat 001572', 'Mandat 001576',
     'Mandat 001577', 'Mandat 001582', 'Mandat 001587', 'Mandat 001589', 'Mandat 001592', 'Mandat 001595', 'Mandat 001596', 'Mandat 001603',
     'Mandat 001604', 'Mandat 001605', 'Mandat 001613', 'Mandat 001615', 'Mandat 001620', 'Mandat 001623', 'Mandat 001624', 'Mandat 001630',
     'Mandat 001668', 'Mandat 001669', 'Mandat 001671', 'Mandat 001674', 'Mandat 001681', 'Mandat 001682', 'Mandat 001690', 'Mandat 001693',
     'Mandat 001696', 'Mandat 001699', 'Mandat 001742', 'Mandat 001743'
   );

-- m.bruere@kiwee-energie.fr — 317 mandats
update public.mandats m
   set cree_par_id = (select id from public.profils where lower(email) = 'm.bruere@kiwee-energie.fr'),
       date_modification = now()
 where m.cree_par_id is null
   and m.id_salesforce in (
     'Mandat 000386', 'Mandat 000390', 'Mandat 000396', 'Mandat 000403', 'Mandat 000415', 'Mandat 000416', 'Mandat 000419', 'Mandat 000421',
     'Mandat 000433', 'Mandat 000435', 'Mandat 000440', 'Mandat 000467', 'Mandat 000468', 'Mandat 000470', 'Mandat 000471', 'Mandat 000479',
     'Mandat 000483', 'Mandat 000493', 'Mandat 000496', 'Mandat 000497', 'Mandat 000506', 'Mandat 000509', 'Mandat 000511', 'Mandat 000515',
     'Mandat 000516', 'Mandat 000517', 'Mandat 000519', 'Mandat 000521', 'Mandat 000523', 'Mandat 000524', 'Mandat 000525', 'Mandat 000526',
     'Mandat 000527', 'Mandat 000528', 'Mandat 000529', 'Mandat 000530', 'Mandat 000531', 'Mandat 000533', 'Mandat 000534', 'Mandat 000535',
     'Mandat 000536', 'Mandat 000537', 'Mandat 000541', 'Mandat 000543', 'Mandat 000544', 'Mandat 000545', 'Mandat 000547', 'Mandat 000548',
     'Mandat 000549', 'Mandat 000554', 'Mandat 000555', 'Mandat 000556', 'Mandat 000557', 'Mandat 000558', 'Mandat 000559', 'Mandat 000564',
     'Mandat 000565', 'Mandat 000569', 'Mandat 000570', 'Mandat 000574', 'Mandat 000582', 'Mandat 000590', 'Mandat 000592', 'Mandat 000594',
     'Mandat 000595', 'Mandat 000596', 'Mandat 000597', 'Mandat 000598', 'Mandat 000601', 'Mandat 000603', 'Mandat 000604', 'Mandat 000606',
     'Mandat 000608', 'Mandat 000609', 'Mandat 000610', 'Mandat 000616', 'Mandat 000624', 'Mandat 000625', 'Mandat 000628', 'Mandat 000634',
     'Mandat 000637', 'Mandat 000641', 'Mandat 000644', 'Mandat 000645', 'Mandat 000646', 'Mandat 000647', 'Mandat 000648', 'Mandat 000649',
     'Mandat 000651', 'Mandat 000652', 'Mandat 000656', 'Mandat 000666', 'Mandat 000667', 'Mandat 000682', 'Mandat 000683', 'Mandat 000684',
     'Mandat 000685', 'Mandat 000691', 'Mandat 000697', 'Mandat 000706', 'Mandat 000708', 'Mandat 000725', 'Mandat 000733', 'Mandat 000738',
     'Mandat 000744', 'Mandat 000747', 'Mandat 000748', 'Mandat 000749', 'Mandat 000753', 'Mandat 000754', 'Mandat 000755', 'Mandat 000756',
     'Mandat 000757', 'Mandat 000761', 'Mandat 000762', 'Mandat 000767', 'Mandat 000772', 'Mandat 000773', 'Mandat 000775', 'Mandat 000785',
     'Mandat 000787', 'Mandat 000790', 'Mandat 000794', 'Mandat 000796', 'Mandat 000797', 'Mandat 000798', 'Mandat 000807', 'Mandat 000819',
     'Mandat 000824', 'Mandat 000839', 'Mandat 000840', 'Mandat 000841', 'Mandat 000843', 'Mandat 000847', 'Mandat 000850', 'Mandat 000851',
     'Mandat 000854', 'Mandat 000859', 'Mandat 000862', 'Mandat 000864', 'Mandat 000867', 'Mandat 000869', 'Mandat 000875', 'Mandat 000883',
     'Mandat 000884', 'Mandat 000889', 'Mandat 000890', 'Mandat 000910', 'Mandat 000911', 'Mandat 000919', 'Mandat 000921', 'Mandat 000923',
     'Mandat 000926', 'Mandat 000927', 'Mandat 000928', 'Mandat 000929', 'Mandat 000930', 'Mandat 000935', 'Mandat 000936', 'Mandat 000938',
     'Mandat 000939', 'Mandat 000940', 'Mandat 000941', 'Mandat 000946', 'Mandat 000948', 'Mandat 000949', 'Mandat 000950', 'Mandat 000951',
     'Mandat 000952', 'Mandat 000953', 'Mandat 000954', 'Mandat 000958', 'Mandat 000959', 'Mandat 000960', 'Mandat 000961', 'Mandat 000965',
     'Mandat 000970', 'Mandat 000973', 'Mandat 000977', 'Mandat 000978', 'Mandat 000983', 'Mandat 001003', 'Mandat 001007', 'Mandat 001009',
     'Mandat 001010', 'Mandat 001014', 'Mandat 001016', 'Mandat 001028', 'Mandat 001030', 'Mandat 001032', 'Mandat 001035', 'Mandat 001038',
     'Mandat 001041', 'Mandat 001054', 'Mandat 001059', 'Mandat 001060', 'Mandat 001063', 'Mandat 001064', 'Mandat 001068', 'Mandat 001069',
     'Mandat 001072', 'Mandat 001083', 'Mandat 001084', 'Mandat 001085', 'Mandat 001086', 'Mandat 001088', 'Mandat 001124', 'Mandat 001143',
     'Mandat 001149', 'Mandat 001150', 'Mandat 001151', 'Mandat 001152', 'Mandat 001162', 'Mandat 001163', 'Mandat 001164', 'Mandat 001167',
     'Mandat 001168', 'Mandat 001169', 'Mandat 001182', 'Mandat 001185', 'Mandat 001189', 'Mandat 001192', 'Mandat 001197', 'Mandat 001210',
     'Mandat 001216', 'Mandat 001233', 'Mandat 001234', 'Mandat 001236', 'Mandat 001240', 'Mandat 001248', 'Mandat 001249', 'Mandat 001250',
     'Mandat 001252', 'Mandat 001266', 'Mandat 001268', 'Mandat 001269', 'Mandat 001271', 'Mandat 001272', 'Mandat 001279', 'Mandat 001285',
     'Mandat 001286', 'Mandat 001297', 'Mandat 001299', 'Mandat 001304', 'Mandat 001305', 'Mandat 001317', 'Mandat 001318', 'Mandat 001321',
     'Mandat 001322', 'Mandat 001323', 'Mandat 001332', 'Mandat 001341', 'Mandat 001343', 'Mandat 001345', 'Mandat 001347', 'Mandat 001350',
     'Mandat 001353', 'Mandat 001368', 'Mandat 001369', 'Mandat 001371', 'Mandat 001372', 'Mandat 001388', 'Mandat 001394', 'Mandat 001395',
     'Mandat 001407', 'Mandat 001408', 'Mandat 001414', 'Mandat 001415', 'Mandat 001416', 'Mandat 001423', 'Mandat 001425', 'Mandat 001431',
     'Mandat 001450', 'Mandat 001451', 'Mandat 001454', 'Mandat 001466', 'Mandat 001476', 'Mandat 001487', 'Mandat 001517', 'Mandat 001535',
     'Mandat 001536', 'Mandat 001537', 'Mandat 001538', 'Mandat 001539', 'Mandat 001546', 'Mandat 001557', 'Mandat 001559', 'Mandat 001562',
     'Mandat 001563', 'Mandat 001564', 'Mandat 001569', 'Mandat 001573', 'Mandat 001574', 'Mandat 001583', 'Mandat 001584', 'Mandat 001616',
     'Mandat 001617', 'Mandat 001619', 'Mandat 001629', 'Mandat 001640', 'Mandat 001649', 'Mandat 001650', 'Mandat 001661', 'Mandat 001665',
     'Mandat 001683', 'Mandat 001686', 'Mandat 001687', 'Mandat 001701', 'Mandat 001702', 'Mandat 001703', 'Mandat 001704', 'Mandat 001711',
     'Mandat 001714', 'Mandat 001719', 'Mandat 001720', 'Mandat 001721', 'Mandat 001722'
   );

-- f.dubarry@kiwee-energie.fr — 130 mandats
update public.mandats m
   set cree_par_id = (select id from public.profils where lower(email) = 'f.dubarry@kiwee-energie.fr'),
       date_modification = now()
 where m.cree_par_id is null
   and m.id_salesforce in (
     'Mandat 000477', 'Mandat 000484', 'Mandat 000489', 'Mandat 000491', 'Mandat 000492', 'Mandat 000501', 'Mandat 000573', 'Mandat 000577',
     'Mandat 000578', 'Mandat 000583', 'Mandat 000599', 'Mandat 000617', 'Mandat 000670', 'Mandat 000671', 'Mandat 000672', 'Mandat 000673',
     'Mandat 000674', 'Mandat 000675', 'Mandat 000676', 'Mandat 000677', 'Mandat 000680', 'Mandat 000686', 'Mandat 000710', 'Mandat 000723',
     'Mandat 000742', 'Mandat 000750', 'Mandat 000752', 'Mandat 000812', 'Mandat 000815', 'Mandat 000835', 'Mandat 000858', 'Mandat 000863',
     'Mandat 000872', 'Mandat 000873', 'Mandat 000885', 'Mandat 000896', 'Mandat 000904', 'Mandat 000931', 'Mandat 000932', 'Mandat 000933',
     'Mandat 000934', 'Mandat 000937', 'Mandat 000945', 'Mandat 001006', 'Mandat 001008', 'Mandat 001012', 'Mandat 001025', 'Mandat 001045',
     'Mandat 001046', 'Mandat 001056', 'Mandat 001058', 'Mandat 001079', 'Mandat 001090', 'Mandat 001097', 'Mandat 001110', 'Mandat 001111',
     'Mandat 001112', 'Mandat 001114', 'Mandat 001187', 'Mandat 001212', 'Mandat 001214', 'Mandat 001223', 'Mandat 001229', 'Mandat 001230',
     'Mandat 001237', 'Mandat 001238', 'Mandat 001242', 'Mandat 001301', 'Mandat 001374', 'Mandat 001375', 'Mandat 001384', 'Mandat 001387',
     'Mandat 001390', 'Mandat 001396', 'Mandat 001398', 'Mandat 001402', 'Mandat 001405', 'Mandat 001413', 'Mandat 001478', 'Mandat 001484',
     'Mandat 001495', 'Mandat 001500', 'Mandat 001519', 'Mandat 001555', 'Mandat 001558', 'Mandat 001560', 'Mandat 001608', 'Mandat 001609',
     'Mandat 001610', 'Mandat 001612', 'Mandat 001622', 'Mandat 001625', 'Mandat 001626', 'Mandat 001628', 'Mandat 001635', 'Mandat 001642',
     'Mandat 001643', 'Mandat 001647', 'Mandat 001648', 'Mandat 001652', 'Mandat 001659', 'Mandat 001660', 'Mandat 001664', 'Mandat 001666',
     'Mandat 001670', 'Mandat 001672', 'Mandat 001673', 'Mandat 001675', 'Mandat 001676', 'Mandat 001685', 'Mandat 001688', 'Mandat 001689',
     'Mandat 001691', 'Mandat 001694', 'Mandat 001700', 'Mandat 001710', 'Mandat 001712', 'Mandat 001713', 'Mandat 001715', 'Mandat 001716',
     'Mandat 001717', 'Mandat 001718', 'Mandat 001724', 'Mandat 001726', 'Mandat 001727', 'Mandat 001730', 'Mandat 001732', 'Mandat 001735',
     'Mandat 001736', 'Mandat 001737'
   );

-- t.leguen@kiwee-energie.fr — 108 mandats
update public.mandats m
   set cree_par_id = (select id from public.profils where lower(email) = 't.leguen@kiwee-energie.fr'),
       date_modification = now()
 where m.cree_par_id is null
   and m.id_salesforce in (
     'Mandat 000584', 'Mandat 000626', 'Mandat 000643', 'Mandat 000665', 'Mandat 000681', 'Mandat 000692', 'Mandat 000693', 'Mandat 000694',
     'Mandat 000703', 'Mandat 000765', 'Mandat 000768', 'Mandat 000782', 'Mandat 000784', 'Mandat 000786', 'Mandat 000799', 'Mandat 000804',
     'Mandat 000817', 'Mandat 000818', 'Mandat 000827', 'Mandat 000828', 'Mandat 000837', 'Mandat 000849', 'Mandat 000881', 'Mandat 000886',
     'Mandat 000888', 'Mandat 000895', 'Mandat 000902', 'Mandat 000913', 'Mandat 000918', 'Mandat 000988', 'Mandat 000993', 'Mandat 000994',
     'Mandat 001024', 'Mandat 001040', 'Mandat 001047', 'Mandat 001062', 'Mandat 001066', 'Mandat 001081', 'Mandat 001082', 'Mandat 001087',
     'Mandat 001089', 'Mandat 001094', 'Mandat 001095', 'Mandat 001096', 'Mandat 001125', 'Mandat 001128', 'Mandat 001130', 'Mandat 001142',
     'Mandat 001153', 'Mandat 001154', 'Mandat 001158', 'Mandat 001171', 'Mandat 001172', 'Mandat 001175', 'Mandat 001179', 'Mandat 001186',
     'Mandat 001203', 'Mandat 001207', 'Mandat 001211', 'Mandat 001218', 'Mandat 001235', 'Mandat 001239', 'Mandat 001253', 'Mandat 001256',
     'Mandat 001274', 'Mandat 001276', 'Mandat 001288', 'Mandat 001289', 'Mandat 001290', 'Mandat 001292', 'Mandat 001293', 'Mandat 001303',
     'Mandat 001306', 'Mandat 001326', 'Mandat 001355', 'Mandat 001360', 'Mandat 001362', 'Mandat 001364', 'Mandat 001391', 'Mandat 001397',
     'Mandat 001417', 'Mandat 001419', 'Mandat 001472', 'Mandat 001498', 'Mandat 001499', 'Mandat 001526', 'Mandat 001531', 'Mandat 001548',
     'Mandat 001561', 'Mandat 001566', 'Mandat 001570', 'Mandat 001585', 'Mandat 001586', 'Mandat 001588', 'Mandat 001598', 'Mandat 001601',
     'Mandat 001632', 'Mandat 001636', 'Mandat 001637', 'Mandat 001641', 'Mandat 001645', 'Mandat 001651', 'Mandat 001653', 'Mandat 001663',
     'Mandat 001667', 'Mandat 001684', 'Mandat 001692', 'Mandat 001697'
   );

-- w.goupil@kiwee-energie.fr — 40 mandats
update public.mandats m
   set cree_par_id = (select id from public.profils where lower(email) = 'w.goupil@kiwee-energie.fr'),
       date_modification = now()
 where m.cree_par_id is null
   and m.id_salesforce in (
     'Mandat 000099', 'Mandat 000198', 'Mandat 000222', 'Mandat 000231', 'Mandat 000233', 'Mandat 000255', 'Mandat 000257', 'Mandat 000274',
     'Mandat 000280', 'Mandat 000345', 'Mandat 000346', 'Mandat 000347', 'Mandat 000348', 'Mandat 000399', 'Mandat 000566', 'Mandat 000660',
     'Mandat 000661', 'Mandat 000662', 'Mandat 000663', 'Mandat 000678', 'Mandat 000722', 'Mandat 000734', 'Mandat 000735', 'Mandat 000795',
     'Mandat 000985', 'Mandat 001122', 'Mandat 001277', 'Mandat 001340', 'Mandat 001424', 'Mandat 001453', 'Mandat 001550', 'Mandat 001551',
     'Mandat 001611', 'Mandat 001646', 'Mandat 001728', 'Mandat 001729', 'Mandat 001731', 'Mandat 001733', 'Mandat 001734', 'Mandat 001741'
   );

-- a.boccone@kiwee-energie.fr — 24 mandats
update public.mandats m
   set cree_par_id = (select id from public.profils where lower(email) = 'a.boccone@kiwee-energie.fr'),
       date_modification = now()
 where m.cree_par_id is null
   and m.id_salesforce in (
     'Mandat 000151', 'Mandat 000163', 'Mandat 000176', 'Mandat 000215', 'Mandat 000247', 'Mandat 000259', 'Mandat 000267', 'Mandat 000275',
     'Mandat 000276', 'Mandat 000278', 'Mandat 000282', 'Mandat 000285', 'Mandat 000286', 'Mandat 000290', 'Mandat 000294', 'Mandat 000295',
     'Mandat 000298', 'Mandat 000300', 'Mandat 000317', 'Mandat 000322', 'Mandat 000428', 'Mandat 000621', 'Mandat 000623', 'Mandat 001316'
   );

-- obame@kiwee-energie.fr — 5 mandats
update public.mandats m
   set cree_par_id = (select id from public.profils where lower(email) = 'obame@kiwee-energie.fr'),
       date_modification = now()
 where m.cree_par_id is null
   and m.id_salesforce in (
     'Mandat 000007', 'Mandat 000009', 'Mandat 000014', 'Mandat 000015', 'Mandat 000089'
   );

-- n.ghouma@kiwee-energie.fr — 4 mandats
update public.mandats m
   set cree_par_id = (select id from public.profils where lower(email) = 'n.ghouma@kiwee-energie.fr'),
       date_modification = now()
 where m.cree_par_id is null
   and m.id_salesforce in (
     'Mandat 000133', 'Mandat 001244', 'Mandat 001452', 'Mandat 001738'
   );

commit;

-- Contrôle après exécution.
-- Le plafond réel est 1352, pas 1420 : seuls 1352 des 1429 mandats de Kimatch portent un
-- id_salesforce, les autres ayant été créés directement dans l'outil. Les noms du CSV qui ne
-- correspondent à aucune ligne sont simplement ignorés par le `in (...)`.
-- select count(*) filter (where cree_par_id is not null) || ' / ' || count(*) from public.mandats;
