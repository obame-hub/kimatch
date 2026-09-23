-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE CLÉ API OUVRE KIMATCH SANS Y ENTRER
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 23/09/2026 : « dans le futur, on aimerait que des personnes extérieures puissent se
-- connecter à Kimatch avec une clé API, mais sans entrer dans Kimatch. Il faudrait un truc pour
-- eux. »
--
-- ══ POURQUOI CE N'EST PAS UN RÔLE DE PLUS ══
--
-- La tentation serait d'attribuer le rôle PARTENAIRE — il existe déjà, vide, depuis les débuts.
-- C'est ce qu'il ne faut pas faire, pour trois raisons mesurées le 23/09 :
--
--   · UN RÔLE SUPPOSE UN PROFIL, donc un compte d'authentification, donc quelqu'un qui peut se
--     connecter à l'écran. C'est exactement ce que Naoëlle exclut : « sans entrer dans Kimatch ».
--   · LES RÔLES NE PORTENT AUCUN DROIT FIN aujourd'hui — les 24 permissions ne sont lues par
--     personne (voir `components/administration/DroitsReels.tsx`). Un partenaire hériterait donc
--     soit de tout, soit de rien.
--   · ON NE RÉVOQUE PAS UN RÔLE COMME UNE CLÉ. Une clé se coupe en une seconde, se limite à
--     quelques lectures, et laisse une trace de chaque appel. Un rôle, non.
--
-- ══ CE QUE CETTE MIGRATION POSE ══
--
-- `cles_api` : à qui appartient la clé, ce qu'elle a le droit de lire, et si elle est encore
-- valide. La clé elle-même n'est JAMAIS stockée en clair — on garde son empreinte SHA-256, comme
-- un mot de passe. Personne, pas même un administrateur de la base, ne peut relire une clé émise :
-- on la montre une fois à sa création, et jamais plus.
--
-- `cles_api_appels` : ce que chaque clé a demandé, et quand. Sans ce journal, une clé qui fuite
-- est invisible — on ne saurait ni depuis quand, ni ce qui a été lu.
--
-- ══ CE QU'ELLE NE FAIT PAS, ET C'EST VOULU ══
--
-- Aucune écriture. Les portées sont des LECTURES uniquement (`comptes:lire`, `contrats:lire`…).
-- Ouvrir l'écriture à un tiers demande de décider qui répond des données créées, et cette question
-- n'est pas posée. On pourra l'ajouter le jour où elle le sera.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.cles_api (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  empreinte text not null unique,
  prefixe text not null,
  portees text[] not null default '{}',
  cree_par_id uuid references public.profils(id),
  date_creation timestamptz not null default now(),
  derniere_utilisation timestamptz,
  expire_le timestamptz,
  revoquee_le timestamptz
);

comment on table public.cles_api is
  'Les clés qui permettent à un partenaire extérieur de LIRE Kimatch par l''API, sans compte ni '
  'accès à l''écran. Une clé n''est pas un utilisateur : elle ne porte pas de rôle, ne voit que ce '
  'que ses portées autorisent, et se révoque en une seconde.';

comment on column public.cles_api.libelle is
  'À qui appartient cette clé, en clair : « Portail client Dupont », « Intégration Salesforce ». '
  'C''est ce qu''on lit le jour où il faut décider laquelle couper.';

comment on column public.cles_api.empreinte is
  'L''empreinte SHA-256 de la clé, jamais la clé elle-même. Comme un mot de passe : on vérifie en '
  'recalculant, on ne relit jamais. Une clé perdue se remplace, elle ne se retrouve pas.';

comment on column public.cles_api.prefixe is
  'Les huit premiers caractères de la clé, gardés en clair pour la reconnaître dans une liste ou '
  'dans un journal — « kmt_a1b2… ». Trop courts pour servir à s''authentifier.';

comment on column public.cles_api.portees is
  'Ce que cette clé a le droit de lire : « comptes:lire », « contrats:lire », « compteurs:lire ». '
  'Une portée absente est un refus, jamais un oubli — le défaut est le tableau vide, qui ne donne '
  'accès à rien.';

comment on column public.cles_api.expire_le is
  'Quand la clé cesse de fonctionner. Nul signifie « sans limite », ce qui doit rester l''exception : '
  'une clé sans échéance survit à la mission qui l''a justifiée.';

comment on column public.cles_api.revoquee_le is
  'Quand on a coupé cette clé. On ne supprime pas la ligne : le journal des appels y renvoie, et '
  'effacer la clé rendrait son historique illisible le jour où l''on enquête.';

-- ── LE JOURNAL ──────────────────────────────────────────────────────────────────────────────────
create table if not exists public.cles_api_appels (
  id bigserial primary key,
  cle_id uuid not null references public.cles_api(id) on delete cascade,
  chemin text not null,
  statut int not null,
  ip text,
  appele_le timestamptz not null default now()
);

comment on table public.cles_api_appels is
  'Ce que chaque clé a demandé, et quand. Sans ce journal, une clé qui fuite est invisible : on ne '
  'saurait ni depuis quand, ni ce qui a été lu. C''est aussi ce qui permet de constater qu''une clé '
  'ne sert plus et peut être coupée.';

create index if not exists idx_cles_api_appels_cle on public.cles_api_appels (cle_id, appele_le desc);

-- ── LES DEUX TABLES NAISSENT FERMÉES ────────────────────────────────────────────────────────────
-- RLS active et AUCUNE politique : seule la clé de service y accède, c'est-à-dire les fonctions
-- `api/` qui vérifient elles-mêmes l'appelant. Un navigateur ne doit jamais lire ces tables — une
-- empreinte volée se compare hors ligne.
alter table public.cles_api enable row level security;
alter table public.cles_api_appels enable row level security;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : UNE CLÉ RÉVOQUÉE OU EXPIRÉE NE DOIT PLUS RIEN OUVRIR
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ce que la migration rend possible, et qu'on éprouve ici : distinguer une clé valide d'une clé
-- morte. Le risque n'est pas qu'une clé ne marche pas — ça se voit tout de suite — c'est qu'une clé
-- coupée continue de fonctionner, et personne ne le remarquerait.
--
create or replace function public.cle_api_valide(p_empreinte text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from public.cles_api
   where empreinte = p_empreinte
     and revoquee_le is null
     and (expire_le is null or expire_le > now())
   limit 1
$$;

comment on function public.cle_api_valide(text) is
  'L''identifiant de la clé si elle est encore bonne, rien sinon. Une clé révoquée ou expirée rend '
  'null — c''est le seul contrôle, et il est ici plutôt que dans chaque fonction `api/` pour ne pas '
  'diverger.';

grant execute on function public.cle_api_valide(text) to service_role;

do $$
declare
  v_vivante  uuid;
  v_coupee   uuid;
  v_expiree  uuid;
begin
  insert into public.cles_api (libelle, empreinte, prefixe, portees)
  values ('zzz-essai-vivante', 'empreinte-essai-vivante', 'kmt_test', '{comptes:lire}')
  returning id into v_vivante;

  insert into public.cles_api (libelle, empreinte, prefixe, portees, revoquee_le)
  values ('zzz-essai-coupee', 'empreinte-essai-coupee', 'kmt_test', '{comptes:lire}', clock_timestamp())
  returning id into v_coupee;

  insert into public.cles_api (libelle, empreinte, prefixe, portees, expire_le)
  values ('zzz-essai-expiree', 'empreinte-essai-expiree', 'kmt_test', '{comptes:lire}',
          clock_timestamp() - interval '1 day')
  returning id into v_expiree;

  if public.cle_api_valide('empreinte-essai-vivante') is distinct from v_vivante then
    raise exception 'Une clé valide n''ouvre rien : l''accès partenaire serait inutilisable.';
  end if;

  if public.cle_api_valide('empreinte-essai-coupee') is not null then
    raise exception 'UNE CLÉ RÉVOQUÉE OUVRE ENCORE. C''est la faute que cette table doit empêcher.';
  end if;

  if public.cle_api_valide('empreinte-essai-expiree') is not null then
    raise exception 'Une clé expirée ouvre encore : l''échéance ne servirait à rien.';
  end if;

  if public.cle_api_valide('empreinte-qui-n-existe-pas') is not null then
    raise exception 'Une empreinte inconnue ouvre quelque chose.';
  end if;

  delete from public.cles_api where libelle like 'zzz-essai-%';

  raise notice 'Garde-fou : une clé coupée ou expirée n''ouvre plus rien, une clé valide ouvre.';
end $$;

commit;
