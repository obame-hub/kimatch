-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE FICHE APPELÉE A UNE SUITE, OU ELLE NE PASSE PAS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 28/09/2026 : « Soit je clôture un enregistrement (conversion, disqualification), soit je
-- prévois une nouvelle tâche, soit je passe la fiche pour y revenir plus tard. Si je ne fais pas une
-- de ces trois actions, le passage à la fiche suivante doit être bloqué. » Et : « Passer n'est
-- proposé qu'avant l'appel ; après l'appel il ne reste que clôturer ou prévoir. »
--
-- ══ POURQUOI LA BASE, ET AU MOMENT DU CLIC ══
--
-- La conversion d'une piste se fait dans un autre onglet, sur la fiche de la piste ; une tâche peut
-- se poser depuis la fiche elle-même. Le sprint ne voit donc pas tout ce qui arrive à la fiche qu'il
-- affiche. Plutôt que de le deviner, on demande à la base, à l'instant où l'on veut passer.
--
-- ══ CE QUI COMPTE COMME UNE SUITE ══
--
-- Une fiche CLOSE — elle n'a plus rien à faire faire. Ou une fiche qui a AU MOINS UNE TÂCHE OUVERTE,
-- à n'importe quelle date : elle reviendra d'elle-même au plan du jour, rien ne se perd. Une tâche
-- déjà prévue avant l'appel vaut donc suite — la piste de Thomas avait un rappel au 4 octobre.
--
-- Seule une fiche ni close ni suivie bloque : c'est exactement celle qui sortirait du plan sans
-- jamais y revenir, le trou que le Cockpit existe pour boucher.

create or replace function public.fiche_a_une_suite(p_cible_type text, p_cible_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select
    case when p_cible_type = 'PISTE' then not public.fn_piste_est_ouverte(p_cible_id)
         else not public.fn_opportunite_est_ouverte(p_cible_id) end
    or exists (
      select 1 from actions a
        join statuts_actions sa on sa.id = a.statut_id
       where a.actif
         and sa.code not in ('TERMINEE', 'ANNULEE')
         and ((p_cible_type = 'PISTE'       and a.piste_id       = p_cible_id)
           or (p_cible_type = 'OPPORTUNITE' and a.opportunite_id = p_cible_id))
    )
$$;

comment on function public.fiche_a_une_suite(text, uuid) is
  'Vrai si la fiche est close ou porte au moins une tache ouverte. Garde du passage a la fiche suivante dans le sprint.';
