-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- APPEL, MAIL, LIVRABLE : LES TROIS TYPES D'UNE TÂCHE CRÉÉE À LA MAIN
--
-- William, 07/09/2026 : « le champ type doit avoir uniquement 3 valeurs possibles : Appel / Mail /
-- Livrable et doit être obligatoire ».
--
-- ══ POURQUOI LE RÉFÉRENTIEL N'EST PAS RAMENÉ À TROIS LIGNES ══
--
-- Il en compte 22, et douze sont en usage. Relevé le 07/09/2026 :
--
--     Confirmer l'envoi de résiliation      56 tâches
--     Anticiper le renouvellement           53
--     Contrôler la bascule fournisseur      20
--     Appeler le contact                    17
--     Contrôler la première facture          5
--     (et sept autres types, 8 tâches)
--
-- Ce ne sont pas des étiquettes décoratives : ce sont les ÉTAPES du suivi de contrat, et la fonction
-- `creer_suivi_contrat` les lit pour générer ses tâches à la signature. Vérifié — c'est la seule
-- fonction de la base qui référence `types_actions`. Les désactiver arrêterait cette création
-- automatique et laisserait 142 tâches pointer un type inactif.
--
-- LA RESTRICTION EST DONC CELLE DU FORMULAIRE, PAS CELLE DE LA BASE : `DialogNouvelleTache` n'offre
-- que ces trois codes, l'automatisation garde les dix-neuf autres. Un humain choisit entre trois
-- gestes, une machine suit son processus en vingt-deux étapes, et les deux écrivent dans la même
-- table sans se gêner.
--
-- ══ CE QUE CETTE MIGRATION FAIT ══
--
-- Deux libellés raccourcis, un type ajouté. Les CODES ne changent pas — c'est par eux que la
-- fonction de suivi et le formulaire désignent un type, et les renommer aurait cassé les deux.
--
--     APPELER        « Appeler le contact »  →  « Appel »
--     ENVOYER_EMAIL  « Envoyer un email »    →  « Mail »
--     LIVRABLE       (nouveau)                  « Livrable »
--
-- « LIVRABLE » EST UN DOCUMENT À PRODUIRE ET À ENVOYER — une étude, un comparatif, un rapport. C'est
-- la définition donnée par William le 07/09/2026, et elle est écrite ici parce qu'aucun autre type
-- ne la porte : les dix-neuf autres décrivent des étapes de processus, pas la nature du travail.
--
-- Les 17 tâches « Appeler le contact » afficheront désormais « Appel ». Aucune ligne d'`actions`
-- n'est modifiée : c'est le libellé du référentiel qui change, pas le rattachement.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

update public.types_actions set libelle = 'Appel' where code = 'APPELER';
update public.types_actions set libelle = 'Mail'  where code = 'ENVOYER_EMAIL';

-- Ordre 25 : juste après Mail (20) et avant « Relancer le contact » (30), pour que les trois choix
-- du formulaire se suivent dans les listes qui affichent tout le référentiel.
insert into public.types_actions (code, libelle, ordre, actif)
values ('LIVRABLE', 'Livrable', 25, true)
on conflict (code) do update set libelle = excluded.libelle, actif = true;

comment on table public.types_actions is
  'Types de tache. APPELER, ENVOYER_EMAIL et LIVRABLE sont les trois seuls proposes a la creation manuelle ; les autres sont les etapes du suivi de contrat, ecrites par creer_suivi_contrat.';

-- ── Le garde-fou ──
do $$
declare
  v_trois integer;
  v_autres integer;
begin
  select count(*) into v_trois
    from public.types_actions
   where code in ('APPELER', 'ENVOYER_EMAIL', 'LIVRABLE') and actif;
  if v_trois <> 3 then
    raise exception 'Les trois types du formulaire devraient etre actifs, il y en a % : le formulaire serait vide', v_trois;
  end if;

  if not exists (select 1 from public.types_actions where code = 'APPELER' and libelle = 'Appel') then
    raise exception 'Le libelle d APPELER n a pas ete raccourci';
  end if;
  if not exists (select 1 from public.types_actions where code = 'LIVRABLE' and libelle = 'Livrable') then
    raise exception 'Le type LIVRABLE est absent';
  end if;

  -- ET LES DIX-NEUF AUTRES SONT INTACTS : c'est la condition pour que le suivi de contrat continue
  -- de fonctionner. Les compter ici évite qu'une reprise de cette migration les emporte un jour.
  select count(*) into v_autres
    from public.types_actions
   where code not in ('APPELER', 'ENVOYER_EMAIL', 'LIVRABLE') and actif;
  if v_autres < 19 then
    raise exception 'Il ne reste que % types actifs hors formulaire : le suivi de contrat est en peril', v_autres;
  end if;

  raise notice 'Trois types au formulaire, % types conserves pour l automatisation', v_autres;
end;
$$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--   select code, libelle, ordre from public.types_actions
--    where code in ('APPELER','ENVOYER_EMAIL','LIVRABLE') order by ordre;
--   -- Attendu : Appel (10), Mail (20), Livrable (25).
--
--   select count(*) from public.types_actions where actif;
--   -- Attendu : 23.
