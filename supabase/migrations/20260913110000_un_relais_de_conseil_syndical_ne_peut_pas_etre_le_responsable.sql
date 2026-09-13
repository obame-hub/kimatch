-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN RELAIS DE CONSEIL SYNDICAL NE PEUT PAS ÊTRE LE RESPONSABLE DU COMPTEUR
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 13/09/2026 : « Les 389 recopies : vide directement. »
--
-- ══ CE QUE MESURAIT LA COLONNE ══
--
-- 435 compteurs portaient un `contact_conseil_syndical_id`. Sur 389 d'entre eux, c'était
-- EXACTEMENT le même identifiant que `responsable_contact_id` — la même personne dans les deux
-- fentes. Un artefact de reprise, pas une désignation.
--
-- LA PREUVE EST DANS LE SEGMENT : 388 de ces 389 recopies sont posées sur des comptes de segment
-- « Entreprise », où un conseil syndical n'existe pas. Les 31 comptes qui portent un relais
-- réellement distinct sont tous des « Syndic professionnel ». La recopie n'a donc jamais été une
-- saisie métier.
--
-- Conséquence chiffrée avant correction : la couverture affichée aurait été de 30 % (colonne
-- remplie) là où elle est de 3 % (43 compteurs sous contrat sur 1 454 ont un relais distinct).
-- Un indicateur faux d'un facteur dix, et faux dans le sens rassurant.
--
-- ══ ET UNE GARDE POUR QUE ÇA NE REVIENNE PAS ══
--
-- Vider sans contraindre, c'est repousser le problème à la prochaine reprise. La contrainte dit la
-- règle métier de William au niveau où elle ne peut pas être contournée : « les membres CS ne
-- peuvent en aucun cas contractualiser » — ils ne sont donc jamais le responsable du compteur.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare recopies int;
begin
  select count(*) into recopies
    from compteurs
   where contact_conseil_syndical_id = responsable_contact_id;

  if recopies <> 389 then
    raise exception 'Attendu 389 recopies, trouvé % — la base a bougé depuis la mesure du 13/09/2026, on ne touche à rien.', recopies;
  end if;
end $$;

update compteurs
   set contact_conseil_syndical_id = null
 where contact_conseil_syndical_id = responsable_contact_id;

alter table compteurs
  add constraint compteurs_relais_distinct_du_responsable
  check (
    contact_conseil_syndical_id is null
    or contact_conseil_syndical_id is distinct from responsable_contact_id
  );

commit;

-- ══ CONTRÔLE APRÈS APPLICATION ══
--
--   select count(*) filter (where contact_conseil_syndical_id is not null)              as relais,
--          count(*) filter (where contact_conseil_syndical_id = responsable_contact_id) as recopies
--     from compteurs;
--   -- appliqué le 13/09/2026 : relais = 46, recopies = 0
