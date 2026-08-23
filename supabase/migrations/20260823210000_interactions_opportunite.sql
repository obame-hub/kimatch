-- Une interaction peut appartenir à une opportunité.
--
-- POURQUOI. La maquette de William porte un bloc « Actions rapides » — appeler le contact, demander
-- une facture, planifier un rappel — avec cette précision : « chaque action est consignée dans le
-- flux, sans changer le statut ». Or `interactions` a un lien par objet (contact, compte, site,
-- signal, mandat, recommandation, version de recommandation) et aucun vers l'opportunité : une
-- action lancée depuis la fiche n'avait donc nulle part où se rattacher.
--
-- ET CELA RÉPOND À LA MOITIÉ D'UNE QUESTION EN ATTENTE. Michel n'a pas tranché quels échanges
-- appartiennent à une opportunité plutôt qu'au compte ou au contact. Cette colonne ne préjuge de
-- rien pour les 66 646 interactions existantes, qui restent rattachées à leur compte : elle dit
-- seulement qu'une interaction CRÉÉE DEPUIS une opportunité lui appartient. C'est la seule
-- affirmation qu'on puisse faire sans deviner, et elle suffit à alimenter le flux.
--
-- `on delete set null` et non `cascade` : supprimer une opportunité ne doit pas effacer la trace
-- d'un appel qui a réellement eu lieu.

begin;

alter table public.interactions add column if not exists opportunite_id uuid;

alter table public.interactions drop constraint if exists interactions_opportunite_fk;
alter table public.interactions
  add constraint interactions_opportunite_fk foreign key (opportunite_id)
  references public.opportunites (id) on delete set null;

-- Index partiel : la colonne sera nulle sur la quasi-totalité des 66 646 lignes existantes, et un
-- index plein les indexerait toutes pour rien.
create index if not exists idx_interactions_opportunite
  on public.interactions (opportunite_id) where opportunite_id is not null;

comment on column public.interactions.opportunite_id is
  'Opportunite d''ou l''interaction a ete lancee (bloc « Actions rapides »). Nulle pour les interactions rattachees au seul compte ou contact.';

commit;
