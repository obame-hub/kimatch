begin;

-- LE SITE DE 52 CONTRATS, RETROUVE PAR LEUR POINT DE LIVRAISON.
--
-- 98 contrats n'avaient aucun site. Salesforce ne relie pas directement un contrat a un site :
-- il passe par les points de livraison (Relation_Contrat_Point_de_livraison__c). Kimatch a bien
-- repris les compteurs avec leur numero de point et leur site, mais pas cette table de liaison,
-- et le site des contrats concernes est reste vide.
--
-- La chaine se refait donc entierement : numero de contrat -> point(s) de livraison cote
-- Salesforce -> compteur de meme numero dans Kimatch -> son site.
--
-- 52 contrats sur 98 en sortent, et uniquement ceux dont TOUS les points de livraison
-- designent un seul et meme site. Le contrat qui en designe deux est laisse tel quel : lui
-- attribuer l'un des deux serait inventer. Les 45 autres n'ont pas de reponse cote Salesforce
-- non plus (18 sans numero de contrat, 23 sans point de livraison, 4 dont le point de livraison
-- ne correspond a aucun compteur) — ils sont a completer a la main.

update contrats as c
set site_id = v.site
from (values
  ('8c71f3a7-6c99-486e-bfa9-9fbc6192aade'::uuid, 'e5e954d1-7bb9-466b-a122-39694b05b849'::uuid),
  ('695eae49-69f1-4bfe-b3ff-ff07f606c88c'::uuid, 'cd18c846-339d-4d20-a659-4e2bf4a87cce'::uuid),
  ('4d93f200-6bb8-4872-b60f-b82f8538ce9d'::uuid, '66b626da-ad97-4dd9-961c-7e956a25dd08'::uuid),
  ('3cea6279-46e0-4a86-8d60-e82aa5140656'::uuid, '66b626da-ad97-4dd9-961c-7e956a25dd08'::uuid),
  ('3bac98cd-3c1c-4708-9606-b3bf68eba6b3'::uuid, '8124a8fb-e6a7-4144-acc8-7792f151f873'::uuid),
  ('8cc82db3-b01f-47c2-81e3-ce1e0107e5f2'::uuid, 'ce5c6821-d8a0-49cf-b17f-888228feec1f'::uuid),
  ('5369ca03-96f5-4d53-8b07-505f890b526d'::uuid, 'bd922d27-8bcd-4ee8-a3bc-b9b293e6d00b'::uuid),
  ('26f962e8-9881-4224-89c0-86e62e643bbe'::uuid, '02b9fb8c-0686-4dfa-aac4-888fb1903d2a'::uuid),
  ('0ec80498-ae3b-4946-be98-632f527ba258'::uuid, '02b9fb8c-0686-4dfa-aac4-888fb1903d2a'::uuid),
  ('8f11029c-ef06-4a2a-8496-c323ac9df94a'::uuid, '367e227f-3eb3-4a8c-99be-2081e5026b95'::uuid),
  ('0eb48494-71f5-415e-b00c-72b5fcea22e7'::uuid, 'c1e0a1ca-af9c-42c0-8d6b-7d7e82776b20'::uuid),
  ('fbc85027-c818-49a2-9fe1-477c86aea121'::uuid, '86fc69ec-f6fa-4e8b-ac4e-fd88613313d3'::uuid),
  ('7a5303bb-bb79-4bf3-bd52-eb3a33fece38'::uuid, '990ebfd4-f29f-4803-8cfe-84621922c5a4'::uuid),
  ('96b43046-1a01-4c28-874b-cf160da40ded'::uuid, '2f2a7128-ede5-4fed-84be-6c4306946e3b'::uuid),
  ('5436dc93-fb69-4592-beab-58f9b23be880'::uuid, '9716de61-58a7-4430-90fc-fc219df18d25'::uuid),
  ('dfdfa59f-32fc-428b-bd75-3cc6ee7ff6c8'::uuid, '6160d62c-df3e-4e81-bbab-25b9d53e2ed6'::uuid),
  ('305d8451-9f3c-453b-bdb1-a81f160aad8a'::uuid, '88cd253a-9caa-4dd9-bff2-4e86e68610a0'::uuid),
  ('ec55a7e1-ce44-47ec-98d6-4ab96805c6a8'::uuid, '5f9564fa-a465-4221-a5ae-4c009c36a8db'::uuid),
  ('79660ebc-8df9-4679-8133-3822237f6f7b'::uuid, '0c713038-3519-443b-83c5-c549781c1d02'::uuid),
  ('47b653e0-0f22-425e-841d-08c6db34046d'::uuid, '9bc2fa94-222e-45e8-9747-c3c37682f989'::uuid),
  ('6fc94415-4897-41da-8e26-51ec573e3310'::uuid, '4925982c-c94b-434e-9159-d24b9a48efec'::uuid),
  ('be37e984-431f-4faf-9b82-0368d342c1b8'::uuid, 'ff2a5b9b-38c7-4a4f-98d6-bc3a052e93db'::uuid),
  ('9aa2e403-8940-4366-b617-b1d4976e2b4f'::uuid, 'aebe0725-7e74-44dc-813e-09a88818fbcb'::uuid),
  ('ef0d2e6f-9608-4c6e-8c28-6703a7ef9099'::uuid, '100cf247-e571-4d1a-a722-4ee7178abb40'::uuid),
  ('1fad5a3b-e28f-457a-bba7-96bc6b2529ec'::uuid, '45e5dddc-294c-43d5-965a-ae9286d23593'::uuid),
  ('283f86ae-5750-4c1f-9702-c2e1a7403fef'::uuid, '59da5a27-6632-440b-8cb4-e900dffcd201'::uuid),
  ('59a119e9-4c32-4e16-8629-b924a701e8c0'::uuid, 'edcc8141-863c-453d-87d2-396e76e59fc3'::uuid),
  ('afa08c17-1744-4e5c-873b-feb46fd2f210'::uuid, 'd0ebda37-321d-4e88-82b3-b9b9fdd16252'::uuid),
  ('433905fc-18a7-40c9-8503-7351e6def8e3'::uuid, 'a24efb9b-b73d-41ed-b9f7-1c8388574714'::uuid),
  ('b12e5d8f-9df9-45ac-89a9-d6e212af250e'::uuid, '9382934d-5351-41cb-87da-fb94403e9ad3'::uuid),
  ('02f714b3-1f8b-444c-9d1e-5893df5cc9fe'::uuid, '32814fff-e350-4d0f-957c-bd99f75fe057'::uuid),
  ('c540d653-e2f8-463a-85d5-f209b9407403'::uuid, 'e6b9cf61-a82e-4dd8-a129-64622021b731'::uuid),
  ('f86bdaa3-8015-43af-ae45-261ec38a0fd5'::uuid, 'a46ed183-7075-42cd-bc77-41802dfa3d19'::uuid),
  ('16586640-2486-4849-876e-f08b3e8e5cb8'::uuid, '6fa4c749-5859-445c-9565-d10fff462e32'::uuid),
  ('88066be4-84c7-4858-b39e-525cc8c44879'::uuid, 'e0a0b4aa-28b7-49b0-b26f-1d0348df15fd'::uuid),
  ('9e13f224-56db-4445-8cdc-a6e52229e559'::uuid, 'd026159f-a427-4a93-a6b9-c62d7df25399'::uuid),
  ('e5733b62-b9c5-4d36-b0fb-391be0eb7bfa'::uuid, 'a637d45d-2625-4573-94a3-619c305828e5'::uuid),
  ('2e70eaf4-6529-4389-a1d1-abd2d6519c27'::uuid, 'a2a903c1-f4c4-4eda-af1f-4f689163572a'::uuid),
  ('81b11f25-235f-45a1-af28-f3fce8cfad06'::uuid, 'a2a903c1-f4c4-4eda-af1f-4f689163572a'::uuid),
  ('204cf771-67a0-488d-8819-d153ad50804e'::uuid, '24269d22-2c6f-4bb5-abbe-1151eed596e1'::uuid),
  ('4d4fbaca-d5f0-4167-9348-e491901134a8'::uuid, 'c66d18bd-0831-49be-9508-a409f1727106'::uuid),
  ('4f60efa3-00e3-4573-8505-1018ffea19c2'::uuid, '3b08572f-bd70-4531-b243-36e616d298ae'::uuid),
  ('06cb6017-19bf-496e-9ce7-f5fc8398d02a'::uuid, '27a133e0-708e-40a0-8233-13f38833348e'::uuid),
  ('c1c5488d-ddc0-4069-9d5a-197f91f0cc08'::uuid, '367e227f-3eb3-4a8c-99be-2081e5026b95'::uuid),
  ('cdce6a35-9315-4e8a-b6fe-a77412dab5ea'::uuid, '5b6e9f04-0af4-4926-ab7e-14c0525ebbfc'::uuid),
  ('e42ed7ca-5c32-4ebd-bc48-b290a1cf13ad'::uuid, '090677ca-943a-4b9b-85ea-0a14cbd0a016'::uuid),
  ('095f9713-d439-45a5-a14c-26c6f017e6df'::uuid, 'fc4dc077-1df1-4bfd-9020-e373198186de'::uuid),
  ('6ddba08d-c1eb-4520-9ce8-6ea2cfcc001f'::uuid, '386a4a9e-2582-4e47-a669-5f10b59eb8a3'::uuid),
  ('f6d7e43d-c062-40a0-b34c-40e743fa51fc'::uuid, 'e3efb2b3-d8c4-4659-a513-5019904d2f91'::uuid),
  ('4ea07f7a-de66-43ca-b96e-3ff011dad053'::uuid, '02b9fb8c-0686-4dfa-aac4-888fb1903d2a'::uuid),
  ('c408ada5-3dde-43af-80e3-30e855176959'::uuid, 'd026159f-a427-4a93-a6b9-c62d7df25399'::uuid),
  ('6f0e6876-35a3-4974-9866-8ef463080f0d'::uuid, '94ddfb36-a16f-4730-8bfd-da3c42330c40'::uuid)
) as v(contrat, site)
where c.id = v.contrat and c.site_id is null;

commit;
