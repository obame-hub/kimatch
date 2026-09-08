-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE ÉCHÉANCE IMPORTÉE DE SALESFORCE N'A PAS D'HEURE
--
-- William, 08/09/2026 : « l'heure de midi de l'import Salesforce doit être supprimée. »
--
-- ── CE QUE MONTRAIT L'ÉCRAN ──
--
-- 150 tâches annonçaient un rendez-vous « à 13:00 » ou « à 14:00 » — l'heure variant selon que
-- l'échéance tombe en heure d'hiver ou en heure d'été — alors que personne ne l'avait fixé. Sur les
-- 156 tâches ouvertes qui portaient une heure le 08/09/2026, SIX seulement avaient été posées à la
-- main (16:23 ×3, 10:00 ×2, 09:30 ×1). Les 150 autres sont ces lignes-là.
--
-- ── D'OÙ VIENT MIDI, ET POURQUOI CE N'ÉTAIT PAS UNE FAUTE ──
--
-- `importer-taches-ouvertes-salesforce.cjs` écrivait `ActivityDate + T12:00:00Z`. La raison était
-- bonne : `ActivityDate` n'a que le jour, et minuit UTC change de journée dès qu'on le lit depuis un
-- fuseau à l'ouest de Greenwich. Midi met la date à l'abri du décalage dans les deux sens.
--
-- Seulement la convention de l'application est l'inverse, et elle est écrite noir sur blanc dans
-- `src/lib/heureTache.ts` : MINUIT LOCAL VEUT DIRE « PAS D'HEURE ». C'est ce que lit `heureDe`, et
-- c'est ce que produit le formulaire de création quand on laisse le champ heure vide. Deux
-- conventions défendables séparément, et ensemble un rendez-vous inventé sur 150 lignes.
--
-- Le script est corrigé dans le même commit : il pose désormais minuit à Paris. Cette migration
-- reprend ce qu'il a déjà écrit.
--
-- ── POURQUOI `source_externe_id` EN PLUS DE L'HEURE ──
--
-- « Tout ce qui tombe à midi UTC » attraperait aussi le vrai rendez-vous de 14 h qu'un commercial
-- posera un jour d'été. Les deux conditions ensemble ne désignent que des lignes importées : les
-- 150 mesurées portent toutes un `source_externe_id`, et aucune tâche saisie à la main ne tombe à
-- midi UTC dans la base.
--
-- ── LA JOURNÉE NE BOUGE PAS ──
--
-- Vérifié avant d'écrire : 0 ligne sur 150 change de jour de calendrier en passant de midi UTC à
-- minuit à Paris. C'était le seul risque réel de cette reprise — une échéance qui reculerait d'un
-- jour ferait apparaître un retard qui n'existe pas.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── GARDE-FOU : on refuse de travailler si la donnée n'est plus celle qu'on a mesurée ──
do $$
declare
  n_concernees int;
  n_decalees int;
begin
  select count(*) into n_concernees
  from actions
  where actif
    and source_externe_id is not null
    and date_prevue is not null
    and (date_prevue at time zone 'UTC')::time = '12:00:00';

  if n_concernees = 0 then
    raise exception 'Aucune tâche importée à midi UTC : la reprise a déjà eu lieu, ou la donnée a changé.';
  end if;

  -- Une ligne qui changerait de jour de calendrier signalerait un fuseau inattendu côté serveur.
  select count(*) into n_decalees
  from actions
  where actif
    and source_externe_id is not null
    and date_prevue is not null
    and (date_prevue at time zone 'UTC')::time = '12:00:00'
    and (date_prevue at time zone 'Europe/Paris')::date
        <> ((date_trunc('day', date_prevue at time zone 'Europe/Paris') at time zone 'Europe/Paris') at time zone 'Europe/Paris')::date;

  if n_decalees > 0 then
    raise exception '% échéance(s) changeraient de jour : reprise interrompue.', n_decalees;
  end if;

  raise notice '% échéance(s) importée(s) ramenée(s) à minuit à Paris.', n_concernees;
end $$;

update actions
set date_prevue = date_trunc('day', date_prevue at time zone 'Europe/Paris') at time zone 'Europe/Paris',
    date_modification = now()
where actif
  and source_externe_id is not null
  and date_prevue is not null
  and (date_prevue at time zone 'UTC')::time = '12:00:00';

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Doit renvoyer 0 : plus aucune tâche importée ne porte l'heure de midi.
--   select count(*) from actions
--   where actif and source_externe_id is not null
--     and (date_prevue at time zone 'UTC')::time = '12:00:00';
--
--   -- Doit renvoyer 6 : les seules heures restantes sont celles que quelqu'un a choisies.
--   select to_char(date_prevue at time zone 'Europe/Paris', 'HH24:MI') as heure, count(*)
--   from actions where actif and date_prevue is not null
--     and (date_prevue at time zone 'Europe/Paris')::time <> '00:00:00'
--   group by 1 order by 2 desc;
-- ════════════════════════════════════════════════════════════════════════════════════════════════
