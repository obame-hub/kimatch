-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE TÂCHE PEUT SE RATTACHER À UNE OPPORTUNITÉ
--
-- Demandé par Naoëlle le 27/08/2026 : « crée les liens de tâche vers opportunité ».
--
-- POURQUOI CETTE COLONNE MANQUAIT, ET CE QU'ELLE DÉBLOQUE. `actions` porte un lien vers un signal,
-- un mandat, une recommandation, une version, un site et un contact — mais aucun vers une
-- opportunité. C'est le trou qui empêchait le bloc « Opportunités » de la maquette de Michel
-- d'exister dans « Ma journée » : le regroupement se fait par objet rattaché, et l'opportunité n'en
-- était pas un. J'affichais « Mandats » à la place, l'objet réellement lié.
--
-- L'INDEX N'EST PAS DÉCORATIF : « Ma journée » regroupe les tâches par objet à chaque affichage, et
-- le tableau de bord est l'écran qu'on ouvre en premier. Un index partiel — seules les lignes
-- rattachées — reste petit puisque la plupart des tâches n'auront jamais d'opportunité.
--
-- `on delete set null` PLUTÔT QUE `cascade` : supprimer une opportunité ne doit pas effacer le
-- travail qu'on a fait autour. La tâche survit, orpheline, et repart dans « Autres » — c'est
-- exactement ce qu'on veut savoir quand on cherche pourquoi une opportunité a disparu.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.actions
  add column if not exists opportunite_id uuid references public.opportunites(id) on delete set null;

create index if not exists actions_opportunite_idx
  on public.actions (opportunite_id)
  where opportunite_id is not null;

comment on column public.actions.opportunite_id is
  'Opportunité rattachée, facultative. Permet le regroupement « Opportunités » de « Ma journée » (maquette de Michel du 25/08/2026).';

commit;
