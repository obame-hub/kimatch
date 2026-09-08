-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- NEUF HEURES QUE PERSONNE N'AVAIT CHOISIES
--
-- William, 08/09/2026 : « si une tâche n'a pas une heure choisie par l'utilisateur, alors elle doit
-- être supprimée. C'est la raison pour laquelle désormais, en créant une tâche, l'heure est une
-- option, pas une obligation. »
--
-- La règle est générale, et elle vient d'être appliquée à l'import Salesforce (migration
-- 20260908200000, 150 lignes ramenées à minuit). Il restait 59 tâches à 09:00, de deux origines
-- différentes, aucune choisie par quiconque.
--
-- ── LES 48 DU REPORT EN LOT ──
--
-- Le bouton « Tout reporter à demain » livré ce matin posait l'échéance à demain 9 h. Matthieu l'a
-- utilisé à 14 h 44, vingt minutes après le déploiement : 48 de ses 49 tâches en retard ont pris
-- 09:00. Le message de confirmation annonçait bien « demain 9 h », il n'a donc pas été trompé —
-- mais l'heure venait du code, pas de lui. Le bouton pose désormais minuit local, et son libellé ne
-- promet plus d'heure.
--
-- ── LES 11 TÂCHES « SUIVRE LA RECOMMANDATION » ──
--
-- Créées entre le 25/08 et le 31/08, toutes à 09:00, par un script ponctuel dont il ne reste aucune
-- trace ni dans le dépôt ni dans les fonctions de la base — vérifié. Rien ne les régénérera.
--
-- ── POURQUOI ON PEUT AFFIRMER QUE 09:00 N'A JAMAIS ÉTÉ CHOISI ──
--
-- Avant aujourd'hui, SIX heures existaient dans toute la base : 16:23 (×3), 10:00 (×2) et 09:30. Pas
-- une seule à 09:00. Les 59 lignes visées portent par ailleurs des `date_modification` identiques à
-- la microseconde par lot — signature d'une écriture machine, pas d'une saisie.
--
-- Le préréglage « Lundi » posait aussi 9 h, mais il ne peut pas être la cause ici : les échéances
-- concernées tombent un vendredi, un mardi et un mercredi.
--
-- ── CE QUE « SUPPRIMER L'HEURE » VEUT DIRE EN BASE ──
--
-- `actions.date_prevue` est un `timestamptz` : il porte toujours un instant, on ne peut pas y
-- écrire « une date sans heure ». La convention de l'application, posée dans
-- `src/lib/heureTache.ts`, est que MINUIT LOCAL SIGNIFIE « PAS D'HEURE » : `heureDe` renvoie alors
-- `null`, et aucun écran n'affiche « 00:00 ». C'est donc bien l'heure qui disparaît de l'interface,
-- pas une heure remplacée par une autre.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  n_visees int;
  n_neuf_heures_ailleurs int;
begin
  select count(*) into n_visees
  from actions
  where actif
    and date_prevue is not null
    and to_char(date_prevue at time zone 'Europe/Paris', 'HH24:MI') = '09:00';

  if n_visees = 0 then
    raise exception 'Aucune tâche à 09:00 : la reprise a déjà eu lieu.';
  end if;

  -- Garde-fou : si quelqu'un a saisi 09:00 à la main DEPUIS ce constat, on ne l'écrase pas en
  -- silence. Une tâche modifiée après l'heure de cette migration est forcément volontaire.
  select count(*) into n_neuf_heures_ailleurs
  from actions
  where actif
    and date_prevue is not null
    and to_char(date_prevue at time zone 'Europe/Paris', 'HH24:MI') = '09:00'
    and date_modification > '2026-09-08 13:00:00+00';

  if n_neuf_heures_ailleurs > 0 then
    raise exception
      '% tâche(s) à 09:00 modifiée(s) après le constat : vérifier à la main avant de reprendre.',
      n_neuf_heures_ailleurs;
  end if;

  raise notice '% échéance(s) privée(s) de leur heure fictive.', n_visees;
end $$;

update actions
set date_prevue = date_trunc('day', date_prevue at time zone 'Europe/Paris') at time zone 'Europe/Paris',
    date_modification = now()
where actif
  and date_prevue is not null
  and to_char(date_prevue at time zone 'Europe/Paris', 'HH24:MI') = '09:00';

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Doit renvoyer les SIX heures d'origine, et rien d'autre : 16:23 ×3, 10:00 ×2, 09:30 ×1.
--   select to_char(date_prevue at time zone 'Europe/Paris', 'HH24:MI') as heure, count(*)
--   from actions where actif and date_prevue is not null
--     and (date_prevue at time zone 'Europe/Paris')::time <> '00:00:00'
--   group by 1 order by 2 desc;
--
--   -- Doit renvoyer 0 : plus aucune échéance à 09:00.
--   select count(*) from actions where actif and date_prevue is not null
--     and to_char(date_prevue at time zone 'Europe/Paris', 'HH24:MI') = '09:00';
-- ════════════════════════════════════════════════════════════════════════════════════════════════
