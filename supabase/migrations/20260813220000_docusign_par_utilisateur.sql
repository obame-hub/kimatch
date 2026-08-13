-- ============================================================================================
-- Signature électronique : chaque conseiller envoie depuis SON compte DocuSign
-- ============================================================================================
-- Jusqu'ici Kimatch signait un JWT au nom d'un compte unique (impersonation d'un compte central
-- KiWee). Demande de William du 13/08/2026 : chaque utilisateur autorise DocuSign lui-même la
-- première fois, puis ses enveloppes partent de son propre compte — c'est le fonctionnement de
-- Tools, qui garde une session DocuSign par utilisateur avec son refresh_token.
--
-- Conséquences visibles pour le client : l'e-mail de signature vient du conseiller qui suit le
-- dossier, l'enveloppe apparaît dans SON DocuSign, et la piste d'audit porte son nom. Avec le
-- compte central, tout serait parti sous une même identité.
--
-- Les jetons stockés ici sont des secrets : quiconque les lit peut envoyer des enveloppes au nom
-- de la personne. La table n'a donc AUCUNE politique de lecture — même pour son propriétaire.
-- Seul le serveur y accède, avec la clé de service (endpoints /api/docusign/*). Le front lit la
-- vue docusign_connexions, qui n'expose que de quoi afficher « connecté en tant que ».
--
-- C'est plus étanche que profils_gmail_tokens, dont la politique self_select laisse un utilisateur
-- lire son propre refresh_token Google. À reprendre sur le même modèle un jour.
-- ============================================================================================

begin;

create table if not exists public.docusign_sessions (
  profil_id uuid primary key references public.profils(id) on delete cascade,
  -- Identité DocuSign, telle que /oauth/userinfo la renvoie. Conservée pour afficher à qui le
  -- compte appartient, et pour détecter qu'une personne a connecté le mauvais compte.
  docusign_user_id text not null,
  docusign_email text,
  docusign_nom text,
  -- Compte DocuSign retenu (une personne peut en avoir plusieurs) et son point d'entrée API :
  -- base_uri diffère selon la région d'hébergement, il ne se devine pas.
  account_id text not null,
  account_nom text,
  base_uri text not null,
  access_token text not null,
  -- DocuSign renvoie un NOUVEAU refresh_token à chaque rafraîchissement : la colonne est mise à
  -- jour à chaque fois, sinon la session expirerait au bout de 30 jours sans raison apparente.
  refresh_token text not null,
  expire_le timestamptz not null,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

comment on table public.docusign_sessions is
  'Session OAuth DocuSign par utilisateur (jetons secrets, lecture serveur uniquement — voir la vue docusign_connexions).';

alter table public.docusign_sessions enable row level security;

-- Une seule politique, et elle ne donne accès à aucun jeton : se déconnecter soi-même. Le bouton
-- « Déconnecter » du front n'a ainsi pas besoin de passer par un endpoint.
drop policy if exists docusign_sessions_self_delete on public.docusign_sessions;
create policy docusign_sessions_self_delete on public.docusign_sessions
  for delete to authenticated using (auth.uid() = profil_id);

-- Vue de lecture sans les jetons. security_invoker reste à false (le défaut) : la vue s'exécute
-- avec les droits de son propriétaire, ce qui lui permet de lire une table dépourvue de politique
-- de lecture. Le filtre auth.uid() garantit que chacun ne voit que sa propre connexion.
drop view if exists public.docusign_connexions;
create view public.docusign_connexions with (security_invoker = false) as
  select profil_id, docusign_email, docusign_nom, account_id, account_nom, expire_le, date_creation
    from public.docusign_sessions
   where profil_id = auth.uid();

grant select on public.docusign_connexions to authenticated;

commit;
