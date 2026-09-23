-- ════════════════════════════════════════════════════════════════════════════════════════════
-- UNE BOÎTE DE DÉPÔT POUR LES FACTURES DU CLIENT
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 23/09/2026 :
--
--   « Lors de l'envoi du mail de demande de facture, j'aimerais que ça ajoute dans ce mail un lien
--     unique (généré) qui, lorsque le client clique dessus, ouvre une boîte de dépôt dans laquelle
--     il peut déposer un ou plusieurs fichiers PDF, JPEG, PNG. Dès que c'est fait et envoyé, le
--     commercial doit recevoir une notification lui indiquant que des factures ont été reçues. »
--
-- ══ POURQUOI CETTE BOÎTE CHANGE LE PROCESSUS, ET PAS SEULEMENT LE CONFORT ══
--
-- « J'ai reçu une facture » n'avait AUCUNE trace en base. C'est le constat du 22/09 : une seule
-- piste sur 4 734 porte un document, et la garde posée sur la conversion doit se contenter du
-- statut « En attente de facture » — c'est-à-dire de ce qu'on a DEMANDÉ, pas de ce qu'on a REÇU.
-- Une facture déposée ici est un fait daté, attaché à la piste ou à l'opportunité. C'est ce fait-là
-- qui autorisera la conversion, et non plus une déclaration.
--
-- ══ LE JETON EST LA SEULE CLÉ, DONC IL EN A LE POIDS ══
--
-- Le client n'a pas de compte et n'en aura pas : lui demander de s'inscrire pour envoyer un PDF
-- ferait perdre la facture, pas gagner une identité. Le lien EST l'autorisation, ce qui impose
-- trois choses :
--
--   32 OCTETS DE HASARD, en base64url — de quoi rendre l'énumération sans objet.
--   UNE DATE D'EXPIRATION, trente jours : une boîte oubliée dans une boîte mail ne doit pas rester
--     ouverte indéfiniment. Elle se rouvre en renvoyant le mail.
--   AUCUNE DONNÉE LISIBLE DEDANS. Le jeton ne dit ni le nom du client, ni celui de la piste : qui
--     le récupère par accident n'apprend rien avant de l'ouvrir, et l'écran public ne montre que
--     la raison sociale déjà connue du destinataire.
--
-- ══ CE QUE LA BASE NE FAIT PAS ══
--
-- Aucune politique RLS n'ouvre ces tables au public. Le client passe par `api/depot/*`, côté
-- serveur, qui vérifie le jeton avant d'écrire. Exposer la table en lecture anonyme aurait rendu
-- le jeton devinable ligne par ligne — l'erreur classique, et la seule qui compte ici.

-- ── 1 · La boîte ──
create table if not exists public.depots_factures (
  id uuid primary key default gen_random_uuid(),
  -- La clé du lien. Unique, indexée : c'est le seul chemin d'accès.
  jeton text not null unique,

  -- À QUOI LA BOÎTE SE RATTACHE. L'une des deux au moins, comme pour une interaction : une piste
  -- avant conversion, une opportunité après. Les deux quand la piste vient d'être convertie.
  piste_id uuid references public.pistes(id) on delete cascade,
  opportunite_id uuid references public.opportunites(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  compte_id uuid references public.comptes(id) on delete set null,

  -- QUI PRÉVENIR. Le propriétaire de l'enregistrement, pas celui qui a cliqué : même règle que les
  -- tâches depuis le 22/09 — une facture arrive dans le portefeuille de quelqu'un.
  destinataire_profil_id uuid references public.profils(id) on delete set null,
  cree_par_id uuid references public.profils(id) on delete set null,

  -- Le mail qui portait le lien : le fil d'activité peut ainsi rattacher le dépôt à sa demande.
  interaction_id uuid references public.interactions(id) on delete set null,

  date_creation timestamptz not null default now(),
  expire_le timestamptz not null default now() + interval '30 days',
  -- Première ouverture de la page : un lien cliqué mais jamais rempli est une information.
  ouvert_le timestamptz,
  -- Validation par le client : c'est CE moment qui déclenche la notification.
  depose_le timestamptz,
  actif boolean not null default true,

  constraint depots_factures_cible_check
    check (piste_id is not null or opportunite_id is not null)
);

create index if not exists idx_depots_factures_piste on public.depots_factures (piste_id) where actif;
create index if not exists idx_depots_factures_opportunite on public.depots_factures (opportunite_id) where actif;
create index if not exists idx_depots_factures_destinataire on public.depots_factures (destinataire_profil_id, depose_le desc);

-- ── 2 · Les fichiers déposés ──
create table if not exists public.depots_fichiers (
  id uuid primary key default gen_random_uuid(),
  depot_id uuid not null references public.depots_factures(id) on delete cascade,
  nom_fichier text not null,
  -- Le chemin dans le seau `depots`. Jamais l'URL : un seau privé n'en a pas de stable.
  chemin text not null,
  mime_type text,
  taille_octets bigint,
  -- Le document créé sur la fiche, quand l'attachement a réussi.
  document_id uuid references public.documents(id) on delete set null,
  date_creation timestamptz not null default now()
);

create index if not exists idx_depots_fichiers_depot on public.depots_fichiers (depot_id);

-- ── 3 · Le seau, privé ──
insert into storage.buckets (id, name, public)
values ('depots', 'depots', false)
on conflict (id) do nothing;

-- ── 4 · Les droits : l'équipe lit, le serveur écrit ──
alter table public.depots_factures enable row level security;
alter table public.depots_fichiers enable row level security;

drop policy if exists depots_factures_equipe on public.depots_factures;
create policy depots_factures_equipe on public.depots_factures
  for all to authenticated using (true) with check (true);

drop policy if exists depots_fichiers_equipe on public.depots_fichiers;
create policy depots_fichiers_equipe on public.depots_fichiers
  for all to authenticated using (true) with check (true);

comment on table public.depots_factures is
  'Une boîte de dépôt ouverte à un client par un lien unique, pour qu''il envoie ses factures sans compte Kimatch.';
comment on column public.depots_factures.jeton is
  'La seule clé d''accès : 32 octets de hasard en base64url. Le client n''a pas de compte.';
comment on column public.depots_factures.depose_le is
  'La validation du client. C''est ce moment qui prouve qu''une facture est arrivée — et qui autorisera la conversion.';
