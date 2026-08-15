-- ============================================================================================
-- ANCIENS COLLABORATEURS : leur rendre les mandats qu'ils ont crees
-- ============================================================================================
-- 95 mandats sur 1440 n'affichent aucun createur. On a d'abord cru a un import bacle ; c'est autre
-- chose. Leurs auteurs sont Franck EYOA, Lauren TOURREAU et Adeline HADEY — d'anciens
-- collaborateurs qui n'ont AUCUN profil dans Kimatch. Les dix profils existants sont tous actifs et
-- tous en poste : l'import n'avait simplement personne a qui rattacher ces mandats.
--
-- Decision de Naoelle du 15/08/2026 : creer un profil inactif pour chacun, marque « ancien
-- utilisateur », plutot que de laisser le champ vide. L'historique redevient lisible.
--
-- POURQUOI PASSER PAR auth.users. profils.id est une cle etrangere vers auth.users(id) : il est
-- impossible de creer un profil sans compte d'authentification. On en cree donc un, mais inerte :
--   - l'adresse est en « @ancien.kiwee-energie.invalid ». Le domaine de premier niveau .invalid est
--     reserve par la RFC 2606 et n'est routable nulle part : aucun lien magique ne peut arriver.
--   - aucun mot de passe (encrypted_password reste nul) et le compte n'est pas confirme.
--   - le role d'acces que le declencheur handle_new_user() attribue par defaut (CONSEILLER) est
--     retire juste apres : un ancien collaborateur ne doit porter aucun droit.
-- Ces trois comptes ne peuvent donc pas servir a se connecter. Ils n'existent que pour signer
-- l'historique.
--
-- CE QUE CELA COUVRE. 18 des 95 mandats, ceux dont l'id_salesforce permet de retrouver
-- l'auteur cote Salesforce. Les 77 autres n'ont aucune reference exploitable : leur createur
-- reste inconnu, et il faudra un rapprochement par compte et par date pour aller plus loin.
-- Le proprietaire, lui, est deja renseigne sur les 95 : ils ont ete repris par les commerciaux en
-- poste, et cette migration n'y touche pas.
-- ============================================================================================

begin;

-- --------------------------------------------------------------------------------------------
-- 1. Les comptes d'authentification, inertes
-- --------------------------------------------------------------------------------------------
-- instance_id et les valeurs de aud/role reprennent ce que porte deja un utilisateur existant.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, is_sso_user, is_anonymous)
values
  ('7f0cd295-a071-4c7f-b334-20404f7667e0', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'franck.eyoa@ancien.kiwee-energie.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Franck","nom":"EYOA (ancien utilisateur)"}'::jsonb,
   now(), now(), false, false),
  ('a59cf98c-9681-4fd9-a289-14a352257405', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lauren.tourreau@ancien.kiwee-energie.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Lauren","nom":"TOURREAU (ancien utilisateur)"}'::jsonb,
   now(), now(), false, false),
  ('740d315d-2013-4943-a298-31994a8e03c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'adeline.hadey@ancien.kiwee-energie.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{"prenom":"Adeline","nom":"HADEY (ancien utilisateur)"}'::jsonb,
   now(), now(), false, false)
on conflict (id) do nothing;

-- --------------------------------------------------------------------------------------------
-- 2. Les profils, inactifs et sans droits
-- --------------------------------------------------------------------------------------------
-- handle_new_user() vient de les creer avec actif = true : on corrige. Le suffixe « (ancien
-- utilisateur) » est porte par le nom pour se voir partout ou l'app affiche un auteur, sans avoir
-- a modifier chaque ecran.
update public.profils set
  prenom = v.prenom,
  nom    = v.nom || ' (ancien utilisateur)',
  actif  = false,
  date_modification = now()
from (values
  ('7f0cd295-a071-4c7f-b334-20404f7667e0'::uuid, 'Franck', 'EYOA'),
  ('a59cf98c-9681-4fd9-a289-14a352257405'::uuid, 'Lauren', 'TOURREAU'),
  ('740d315d-2013-4943-a298-31994a8e03c4'::uuid, 'Adeline', 'HADEY')
) as v(id, prenom, nom)
where profils.id = v.id;

-- Aucun droit d'acces pour un ancien collaborateur : on retire le role attribue par defaut.
delete from public.profils_roles_acces
 where profil_id in ('7f0cd295-a071-4c7f-b334-20404f7667e0', 'a59cf98c-9681-4fd9-a289-14a352257405', '740d315d-2013-4943-a298-31994a8e03c4');

-- --------------------------------------------------------------------------------------------
-- 3. Les mandats retrouvent leur createur
-- --------------------------------------------------------------------------------------------
update public.mandats m set
  cree_par_id = v.profil_id,
  date_modification = now()
from (values
  ('b28f7c4e-f5f5-454a-909b-ee9d0693e596'::uuid, '7f0cd295-a071-4c7f-b334-20404f7667e0'::uuid)  -- Mandat 000018,
  ('0fdbba9d-32d4-4d16-8979-e6fdcbe60562'::uuid, '7f0cd295-a071-4c7f-b334-20404f7667e0'::uuid)  -- Mandat 000019,
  ('57e27251-8b47-4ade-9a61-9303c1dc5691'::uuid, '7f0cd295-a071-4c7f-b334-20404f7667e0'::uuid)  -- Mandat 000090,
  ('ac93d289-5e6b-4f2a-b2eb-3c3d56b77ebf'::uuid, '7f0cd295-a071-4c7f-b334-20404f7667e0'::uuid)  -- Mandat 000093,
  ('26c3039f-bf5e-44ec-aaad-cc08e0dfeb5c'::uuid, '7f0cd295-a071-4c7f-b334-20404f7667e0'::uuid)  -- Mandat 000129,
  ('369f3dec-0fdd-47e1-8ba7-251b5c51cf97'::uuid, '7f0cd295-a071-4c7f-b334-20404f7667e0'::uuid)  -- Mandat 000131,
  ('2c5e4555-9fa3-4ce6-9e4b-497aab17b32b'::uuid, 'a59cf98c-9681-4fd9-a289-14a352257405'::uuid)  -- Mandat 000147,
  ('0b9af602-0498-4468-a3dd-8d1f97535bcf'::uuid, 'a59cf98c-9681-4fd9-a289-14a352257405'::uuid)  -- Mandat 000193,
  ('040a2db3-ab2d-45b3-b0c9-cb391c674a3d'::uuid, 'a59cf98c-9681-4fd9-a289-14a352257405'::uuid)  -- Mandat 000199,
  ('60706a5d-e0f1-4aea-ab27-0fcb46d82c36'::uuid, '740d315d-2013-4943-a298-31994a8e03c4'::uuid)  -- Mandat 000619,
  ('5c658964-00dd-4c76-b8ac-8ab2221488e0'::uuid, '740d315d-2013-4943-a298-31994a8e03c4'::uuid)  -- Mandat 000636,
  ('ba2365f5-ef5f-466c-83d7-0a0ddb5dfb06'::uuid, '740d315d-2013-4943-a298-31994a8e03c4'::uuid)  -- Mandat 000653,
  ('adc7942f-30bb-4de7-b53c-daa778a20f36'::uuid, '740d315d-2013-4943-a298-31994a8e03c4'::uuid)  -- Mandat 000687,
  ('972320ba-e26a-44b4-8d36-c28726e64077'::uuid, '740d315d-2013-4943-a298-31994a8e03c4'::uuid)  -- Mandat 000763,
  ('d031f62b-17c8-438e-9746-78cabd278110'::uuid, '740d315d-2013-4943-a298-31994a8e03c4'::uuid)  -- Mandat 000770,
  ('5297f322-8996-4593-a0ed-6df5df799e44'::uuid, '740d315d-2013-4943-a298-31994a8e03c4'::uuid)  -- Mandat 000791,
  ('7d0d2d7b-5862-49ca-b278-b088d22484e1'::uuid, '740d315d-2013-4943-a298-31994a8e03c4'::uuid)  -- Mandat 000879,
  ('77ea57ba-afe8-433f-aa59-f4cbd47572de'::uuid, '740d315d-2013-4943-a298-31994a8e03c4'::uuid)  -- Mandat 000912
) as v(mandat_id, profil_id)
where m.id = v.mandat_id
  and m.cree_par_id is null;

commit;

-- ============================================================================================
-- CONTROLE APRES APPLICATION
-- ============================================================================================
--   select p.prenom, p.nom, p.actif, count(m.id) mandats
--   from profils p left join mandats m on m.cree_par_id = p.id
--   where p.nom like '%ancien utilisateur%'
--   group by 1,2,3 order by p.nom;
--
-- Attendu : 3 profils inactifs portant ensemble 18 mandats.
--
-- Et le compte de ceux qui restent sans createur :
--   select count(*) from mandats where cree_par_id is null;   -- attendu : 77
--
-- Verifier enfin qu'aucun de ces comptes ne peut se connecter :
--   select email, encrypted_password is null sans_mdp, confirmed_at is null non_confirme
--   from auth.users where email like '%@ancien.kiwee-energie.invalid';
