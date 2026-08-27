-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES TÂCHES EXISTANTES RETROUVENT UN RESPONSABLE
--
-- Naoëlle, 27/08/2026 : « tu ne m'as toujours pas expliqué pourquoi je vois rien dans Ma journée ».
--
-- HIER J'AI CORRIGÉ LA CAUSE POUR L'AVENIR SEULEMENT — la création rattache désormais la tâche à son
-- auteur — mais je n'ai rien fait pour les lignes déjà en base, et c'est là que se trouvait le vrai
-- problème. Les trois seules tâches de la base ont `responsable_profil_id` vide, alors que
-- `proprietaire_id` est renseigné : le propriétaire existait, le responsable non.
--
-- LE PROPRIÉTAIRE DEVIENT DONC LE RESPONSABLE, faute de mieux et parce que c'est la seule information
-- dont on dispose sur qui doit s'en occuper. Ce n'est pas une équivalence de principe — un
-- propriétaire peut confier une tâche — mais sur ces trois lignes, laisser le responsable vide
-- garantit que personne ne les verra jamais.
--
-- ON NE TOUCHE QUE CE QUI EST VIDE : `where responsable_profil_id is null`. Une tâche déjà assignée
-- ne se réassigne pas au propriétaire du dossier, ce serait la retirer à celui qui la fait.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

update public.actions
set responsable_profil_id = proprietaire_id,
    date_modification = now()
where responsable_profil_id is null
  and proprietaire_id is not null;

commit;
