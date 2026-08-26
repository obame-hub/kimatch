-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES QUATRE TYPES DE REQUÊTE DE MICHEL
--
-- Règle n° 8 du dossier UX du 26/08/2026 : « Les types sont Demande, Réclamation, Contrôle
-- contractuel et Contrôle tarifaire. Les statuts sont Nouveau, En cours de traitement et Clôturé. »
--
-- CE N'EST PAS UN RENOMMAGE, C'EST UN CHANGEMENT DE GRILLE. Les sept catégories actuelles viennent de
-- son mémo du 23/08 — facturation, contrat, compteur, fournisseur, document, réclamation, autre — et
-- elles décrivent le SUJET de la requête. Ses quatre nouveaux types décrivent sa NATURE : est-ce
-- qu'on demande quelque chose, qu'on se plaint, qu'on vérifie un contrat, ou qu'on vérifie un prix.
--
-- La seconde grille est meilleure pour un kanban, et c'est probablement pourquoi il l'a changée : le
-- traitement d'une requête dépend de sa nature, pas de son sujet. Une réclamation se traite comme une
-- réclamation, qu'elle porte sur une facture ou sur un compteur.
--
-- LE SUJET N'EST PAS PERDU : `requetes.categorie` reste, et les deux requêtes existantes gardent leur
-- valeur (CONTRAT, COMPTEUR). Une table de référence dédiée porte les nouveaux types, et l'écran
-- affiche le type quand il existe, la catégorie sinon. Écraser les deux lignes existantes pour faire
-- propre aurait détruit la seule information qu'on ait sur elles.
--
-- POURQUOI UNE TABLE ET NON UNE LISTE DANS LE CODE : les sept catégories actuelles sont une constante
-- TypeScript, ce qui oblige à un déploiement pour en ajouter une. Michel a déjà changé cette liste
-- deux fois en trois jours ; la troisième fois, ce sera une ligne à insérer.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.types_requetes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  libelle     text not null,
  ordre       integer not null default 0,
  actif       boolean not null default true,
  date_creation timestamptz not null default now()
);

insert into public.types_requetes (code, libelle, ordre) values
  ('DEMANDE',              'Demande',              10),
  ('RECLAMATION',          'Réclamation',          20),
  ('CONTROLE_CONTRACTUEL', 'Contrôle contractuel', 30),
  ('CONTROLE_TARIFAIRE',   'Contrôle tarifaire',   40)
on conflict (code) do update set libelle = excluded.libelle, ordre = excluded.ordre;

-- Le type rejoint la requête, en plus de la catégorie et non à sa place.
alter table public.requetes
  add column if not exists type_requete_id uuid references public.types_requetes(id);

-- ══ RLS : toute table créée par migration naît protégée et sans politique. Sans celle-ci, la liste
--    des types serait vide à l'écran et aucune requête ne pourrait être créée. ══
alter table public.types_requetes enable row level security;

drop policy if exists authenticated_all on public.types_requetes;
create policy authenticated_all on public.types_requetes
  for all to authenticated using (true) with check (true);

grant select on public.types_requetes to authenticated, anon, service_role;

commit;
