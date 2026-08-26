-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES OBJECTIFS MENSUELS DE MARGE
--
-- Michel, Slack du 26/08/2026 à 20 h 24 : « on part sur un objectif de 115 k en moyenne sur l'année
-- […] je veux dire 115 k PAR MOIS, soit 1 380 k en 2026 ». Puis, par commercial :
--
--   Marie    35 k/mois   420 k/an
--   Guillaume 35 k/mois   420 k/an
--   Matthieu  25 k/mois   300 k/an
--   Thomas    20 k/mois   240 k/an
--
-- LA SOMME DES QUATRE FAIT 115 k, ET CE N'EST PAS UNE COÏNCIDENCE : 35 + 35 + 25 + 20 = 115. Son
-- objectif d'équipe EST la somme des objectifs individuels, ce qui veut dire qu'il ne faut pas le
-- stocker deux fois. La ligne d'équipe est donc dérivée, jamais saisie — sinon un objectif individuel
-- modifié laisserait un total d'équipe faux, et personne ne saurait lequel croire.
--
-- ══ UNE LIGNE PAR MOIS ET PAR PERSONNE ══
--
-- Il a donné des valeurs mensuelles constantes pour 2026, mais la structure les porte mois par mois :
-- un objectif se révise, et l'écraser ferait perdre l'objectif de janvier en fixant celui de février.
-- L'historique est ce qui permettra plus tard de dire « il a fait 120 % de son objectif de mars ».
--
-- `mois` est le PREMIER JOUR du mois, pas un couple année/mois : une date se compare, s'ordonne et
-- s'indexe sans conversion, là où deux entiers demandent de la reconstruire à chaque requête.
--
-- ══ POURQUOI PAS EN DUR DANS LE CODE ══
--
-- Naoëlle a posé la question, et la réponse est dans le message même de Michel : il a corrigé son
-- propre chiffre en trois minutes (« 115 k en moyenne sur l'année » puis « je veux dire par mois »).
-- Des valeurs qui se corrigent en trois minutes ne se déploient pas.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.objectifs_mensuels (
  id              uuid primary key default gen_random_uuid(),
  /** Premier jour du mois concerné. */
  mois            date not null,
  /** Le commercial visé. `null` = objectif d'équipe saisi à la main, ce qu'on évite (voir la vue). */
  profil_id       uuid references public.profils(id) on delete cascade,
  /** Marge nette attendue sur le mois, en euros. */
  objectif_marge  numeric not null check (objectif_marge >= 0),
  commentaire     text,
  cree_par_id     uuid references public.profils(id),
  date_creation   timestamptz not null default now(),
  date_modification timestamptz not null default now(),
  -- Un seul objectif par personne et par mois : deux lignes rendraient le pourcentage indéterminé.
  unique (mois, profil_id)
);

create index if not exists objectifs_mensuels_mois_idx on public.objectifs_mensuels (mois);

-- ══ RLS : une table créée par migration naît protégée et sans politique. Sans celle-ci, les
--    objectifs seraient invisibles à l'écran et les barres de progression resteraient vides. ══
alter table public.objectifs_mensuels enable row level security;

drop policy if exists authenticated_all on public.objectifs_mensuels;
create policy authenticated_all on public.objectifs_mensuels
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.objectifs_mensuels to authenticated;
grant select on public.objectifs_mensuels to anon, service_role;

-- ══ LES DOUZE MOIS DE 2026, POUR LES QUATRE COMMERCIAUX ══
--
-- Les profils sont retrouvés par prénom ET nom : un prénom seul aurait pu viser un homonyme, et un
-- identifiant écrit en dur dans une migration devient faux dès qu'on rejoue le tout sur une autre
-- base. `on conflict do nothing` rend la migration rejouable sans écraser une révision faite depuis.
insert into public.objectifs_mensuels (mois, profil_id, objectif_marge, commentaire)
select
  make_date(2026, m, 1),
  p.id,
  o.montant,
  'Objectif 2026 fixé par Michel le 26/08/2026'
from generate_series(1, 12) as m
cross join (values
  ('Marie',     'Thonnard', 35000),
  ('Guillaume', 'Gilles',   35000),
  ('Matthieu',  'Bruere',   25000),
  ('Thomas',    'Le Guen',  20000)
) as o(prenom, nom, montant)
join public.profils p on p.prenom = o.prenom and p.nom = o.nom
on conflict (mois, profil_id) do nothing;

comment on table public.objectifs_mensuels is
  'Objectif de marge nette par commercial et par mois. L''objectif d''équipe est la SOMME de ces lignes, jamais une ligne à part : 35 + 35 + 25 + 20 = 115 k, le chiffre annoncé par Michel le 26/08/2026.';

commit;
