-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE ACTION PEUT SE RATTACHER À UNE PISTE
--
-- Michel, 31/08/2026 : « permettre de créer et de suivre des actions dans les recommandations, les
-- opportunités et les pistes ».
--
-- ══ DEUX DES TROIS EXISTAIENT DÉJÀ, LA TROISIÈME NON ══
--
-- `actions` porte déjà `recommandation_id`, `opportunite_id`, `signal_id`, `mandat_id`, `site_id`,
-- `contact_id` et `version_recommandation_id`. Il n'y avait rien pour les pistes — donc une tâche
-- prise sur un prospect ne pouvait se rattacher qu'à son contact, et disparaissait du suivi de la
-- piste.
--
-- ══ POURQUOI CETTE COLONNE MANQUAIT, ET POURQUOI ELLE COMPTE MAINTENANT ══
--
-- Les pistes n'ont pas de fiche : elles vivent dans le kanban Prospection, où les actions se
-- faisaient à même la carte. Tant qu'une piste se traitait d'un clic, aucune tâche n'était
-- nécessaire.
--
-- Ce qui change, c'est le parcours de fidélisation et l'agent de suggestions : tous deux produisent
-- des actions datées sur des prospects — « rappeler dans trois jours », « relancer après l'envoi ».
-- Sans colonne, ces actions existeraient sans qu'on sache sur quoi.
--
-- `on delete set null` comme les autres rattachements : supprimer une piste ne doit pas effacer la
-- trace du travail fait dessus. La tâche survit, elle perd son ancrage.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.actions
  add column if not exists piste_id uuid references public.pistes(id) on delete set null;

create index if not exists actions_piste_id_idx on public.actions (piste_id);

comment on column public.actions.piste_id is
  'La piste sur laquelle porte cette action. Complète recommandation_id et opportunite_id : les trois objets du cycle commercial peuvent porter des tâches (Michel, 31/08/2026).';

commit;
