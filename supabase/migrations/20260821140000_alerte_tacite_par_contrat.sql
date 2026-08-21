-- Le délai d'alerte avant reconduction tacite, saisi par le commercial, contrat par contrat.
--
-- RÉPONSES DE MICHEL, 21/08/2026, à trois questions posées le même jour :
--
--   « C'est une règle par fournisseur ou contrat par contrat ? »
--     → « par contrat »
--   « Où trouve-t-on l'information ? »
--     → « sur le contrat ou l'ancien contrat en cours »
--   « Combien de jours avant la date limite faut-il être prévenu ? »
--     → « dépend du fournisseur, on peut pas calculer, c'est le commercial qui le met »
--
-- CE QUE ÇA TRANCHE. Les 90 jours que j'avais posés en dur étaient une supposition, et la réponse la
-- contredit : le délai ne se déduit ni du préavis ni du fournisseur. Il devient donc une donnée du
-- contrat, saisie par la personne qui suit le dossier — elle seule sait combien de temps il lui faut
-- pour reconsulter chez CE fournisseur-là.
--
-- ET ÇA CONFIRME QU'ON NE DEVINE RIEN. « Par contrat » ferme la porte au remplissage par déduction :
-- on aurait pu être tenté de marquer tacites les 106 contrats GAZ EUROPEEN inconnus, puisque 94 % de
-- ses contrats connus le sont. C'eût été inventer une échéance de résiliation — la pire des données à
-- inventer. La migration du 21/08 (20260821130000) n'avait déjà posé que les 465 dates que Salesforce
-- portait vraiment ; celle-ci n'en ajoute aucune.
--
-- NULLE PAR DÉFAUT, ET C'EST VOULU. Une valeur par défaut serait la même supposition qu'avant, écrite
-- ailleurs. L'application se replie sur 90 jours quand la case est vide, en le disant à l'écran, de
-- sorte qu'un contrat non renseigné alerte quand même plutôt que de rester muet.

begin;

alter table public.contrats
  add column if not exists jours_alerte_tacite integer;

alter table public.contrats
  drop constraint if exists contrats_jours_alerte_tacite_check;

-- Un délai négatif alerterait après l'échéance, un délai de plusieurs années alerterait toujours :
-- ni l'un ni l'autre n'est un délai.
alter table public.contrats
  add constraint contrats_jours_alerte_tacite_check
  check (jours_alerte_tacite is null or (jours_alerte_tacite >= 0 and jours_alerte_tacite <= 730));

comment on column public.contrats.jours_alerte_tacite is
  'Nombre de jours avant date_declenchement_tacite à partir desquels le contrat est signalé. Saisi par le commercial : le délai dépend du fournisseur et ne se calcule pas (Michel OBAME, 21/08/2026). Vide, l''application se replie sur 90 jours en le signalant.';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='contrats' and column_name='jours_alerte_tacite';
--   -- attendu : une ligne, integer
--
--   select count(*) from public.contrats where jours_alerte_tacite is not null;
--   -- attendu : 0 — personne n'a encore rien saisi, c'est normal
