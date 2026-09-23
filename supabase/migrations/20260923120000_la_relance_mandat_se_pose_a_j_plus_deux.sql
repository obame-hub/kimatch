-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA RELANCE DU MANDAT SE POSE À J+2, PLUS À J+1
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 23/09/2026 : « Vous dites "Relance mandat à J+2" — oui je valide ça, donc corrige le J+1
-- d'hier. »
--
-- La migration 20260922150000 posait la tâche au lendemain de la conversion. Un mandat part en
-- signature électronique le jour même : relancer le lendemain, c'est relancer avant que le client
-- ait eu une journée ouvrée complète pour le signer. J+2 laisse ce jour-là.
--
-- `aujourdhui_a_minuit_paris()` ET NON `now()` : une conversion faite à 23 h 30 poserait sinon sa
-- relance à 23 h 30 le surlendemain, c'est-à-dire hors du plan du jour de cette journée-là.
--
-- Rien d'autre ne change : seule la branche « née d'une piste » est concernée, l'autre garde
-- l'échéance par défaut de `creer_tache_debut_prospection`.

create or replace function fn_opportunite_ouvre_sa_tache()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.proprietaire_id is null then return null; end if;

  if new.origine = 'PISTE' then
    -- « À J+2 de la création » : la date fait le reste, le plan du jour la ramènera d'elle-même.
    perform creer_tache_debut_prospection(
      'OPPORTUNITE', new.id, new.proprietaire_id,
      aujourdhui_a_minuit_paris() + interval '2 days',
      'Relance mandat'
    );
  else
    perform creer_tache_debut_prospection('OPPORTUNITE', new.id, new.proprietaire_id);
  end if;

  return null;
end;
$$;
