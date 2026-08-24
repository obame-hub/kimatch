-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE SIGNAL S'ACCROCHE À UN CONTACT
--
-- Michel, 24/08/2026 à 22:05, en réponse à la question posée le même jour :
--
--   « Le signal doit être accroché à un contact et ensuite analyse les sites (compteurs) liés à ce
--     contact pour créer un signal. »
--
-- C'était la question ouverte depuis la veille : la table portait site_id, contrat_id, compteur_id et
-- recommandation_id — jamais de contact, et les 864 signaux repris pointent tous un site. Sa réponse
-- inverse le sens de lecture : le contact est le PORTEUR du signal, ses compteurs en sont la MATIÈRE.
--
-- CE N'EST PAS UN DÉTAIL DE MODÉLISATION. Un signal accroché au compteur donnerait 1 065 signaux
-- pour les échéances des douze prochains mois. Accroché au contact, il en donne 593 — mesuré en
-- production le 24/08/2026, 1,7 compteur par contact en moyenne. Le commercial appelle une personne,
-- pas un point de livraison : c'est sa règle qui rend le volume tenable.
--
-- Les autres rattachements RESTENT. Le compteur qui a déclenché le signal continue d'être nommé
-- (`compteur_id`), et le site avec lui : sans eux, un signal « échéance » ne dirait pas de quelle
-- échéance il parle.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table signaux add column if not exists contact_id uuid;

-- `on delete set null` et non `cascade` : un contact qui quitte le syndic ne doit pas effacer
-- l'historique des signaux qu'il a portés. Le signal survit, orphelin et visible comme tel.
alter table signaux drop constraint if exists signaux_contact_id_fkey;
alter table signaux add constraint signaux_contact_id_fkey
  foreign key (contact_id) references contacts(id) on delete set null;

-- Index partiel : les 864 signaux repris n'ont pas de contact, les indexer ne servirait à rien.
create index if not exists signaux_contact_id_idx on signaux (contact_id) where contact_id is not null;

comment on column signaux.contact_id is
  'Le contact qui porte le signal (Michel, 24/08/2026 : « le signal doit etre accroche a un contact »). Le compteur et le site restent renseignes : ils disent de quelle echeance le signal parle.';

commit;
