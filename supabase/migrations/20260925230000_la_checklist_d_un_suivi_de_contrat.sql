-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA CHECK-LIST D'UN SUIVI DE CONTRAT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 25/09/2026 : « j'aimerais ajouter un composant check-list […] ce sera à Fabien de
-- cocher à la main les étapes qu'il a faites. Ce sera utile par la suite pour faire évoluer le
-- chemin du suivi de contrat. »
--
-- ══ « JALON » ET NON « ÉTAPE », ET LA DISTINCTION EST TOUT L'INTÉRÊT ══
--
-- `etapes_suivis_contrats` porte déjà huit ÉTAPES — À préparer, Résiliation à confirmer, Contrat
-- actif… C'est le chemin du dossier, celui que la frise dessine en haut de la fiche, et un suivi
-- n'est qu'à UNE étape à la fois.
--
-- Un JALON est autre chose : un geste qu'on a fait, ou pas. Ils se cochent indépendamment, dans
-- l'ordre qu'on veut, et plusieurs sont vrais en même temps. Les mêler aurait obligé à choisir
-- entre les deux sens du mot, et c'est exactement ce que William annonce vouloir observer : SI la
-- check-list montre qu'un geste précède toujours un autre, le chemin pourra en tenir compte. Pour
-- que cette observation soit possible, il faut garder QUI a coché et QUAND — pas seulement une
-- case.
--
-- ══ DEUX TABLES PLUTÔT QU'UNE COLONNE JSON ══
--
-- Un JSON sur `suivis_contrats` aurait suffi à afficher des cases. Il n'aurait répondu à aucune
-- des questions qui suivront : combien de dossiers ont reçu leur mail de bienvenue, en combien de
-- jours après l'activation, qui coche quoi. Une ligne par jalon fait, datée, y répond en SQL.
--
-- ══ VÉRIFIÉ APRÈS APPLICATION, SUR LA PRODUCTION ══
--
-- Cocher écrit une ligne, un second clic est refusé par l'unicité, décocher la supprime — essayé
-- puis annulé sur un vrai suivi. Sept jalons en référence, dont trois optionnels.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.jalons_suivi_contrat (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  libelle    text not null,
  ordre      integer not null,
  /* Un jalon optionnel ne manque à personne quand il n'est pas coché : il ne compte pas dans
     l'avancement affiché, et ne reprochera rien à Fabien sur un dossier qui n'en avait pas besoin. */
  optionnel  boolean not null default false,
  actif      boolean not null default true,
  date_creation timestamptz not null default now()
);

insert into public.jalons_suivi_contrat (code, libelle, ordre, optionnel) values
  ('MAIL_BIENVENUE',            'Mail de bienvenue',           10, false),
  ('LETTRE_RESILIATION',        'Lettre de résiliation',       20, false),
  ('RESILIATION_CONFIRMEE',     'Envoi résiliation confirmé',  30, false),
  ('CONTROLE_FACTURATION',      'Contrôle facturation',        40, false),
  ('ACTION_CROSS_SELL',         'Action cross-sell',           50, true),
  ('BILAN_ANNUEL',              'Bilan annuel',                60, true),
  ('ANTICIPATION_RENOUVELLEMENT','Anticipation renouvellement', 70, true)
on conflict (code) do update
  set libelle = excluded.libelle, ordre = excluded.ordre, optionnel = excluded.optionnel;

create table if not exists public.suivis_contrats_jalons (
  id               uuid primary key default gen_random_uuid(),
  suivi_contrat_id uuid not null references public.suivis_contrats(id) on delete cascade,
  jalon_id         uuid not null references public.jalons_suivi_contrat(id) on delete cascade,
  fait_le          timestamptz not null default now(),
  fait_par_id      uuid references public.profils(id) on delete set null,
  /* UNE LIGNE = UN JALON FAIT. Décocher SUPPRIME la ligne plutôt que de poser un `false` : une
     case décochée n'est pas un fait, c'est l'absence de fait, et la garder ferait croire à un
     geste annulé là où il n'y a eu qu'une erreur de clic. */
  unique (suivi_contrat_id, jalon_id)
);

create index if not exists suivis_contrats_jalons_par_suivi_idx
  on public.suivis_contrats_jalons (suivi_contrat_id);

alter table public.jalons_suivi_contrat    enable row level security;
alter table public.suivis_contrats_jalons  enable row level security;

/* La référence se lit par toute l'équipe ; elle ne s'écrit que par migration. */
drop policy if exists jalons_lecture on public.jalons_suivi_contrat;
create policy jalons_lecture on public.jalons_suivi_contrat
  for select to authenticated using (not public.est_partenaire());

/* Les cases cochées suivent le cloisonnement des suivis eux-mêmes : un partenaire n'a rien à y
   voir, et l'équipe coche librement. */
drop policy if exists suivis_jalons_equipe on public.suivis_contrats_jalons;
create policy suivis_jalons_equipe on public.suivis_contrats_jalons
  for all to authenticated
  using (not public.est_partenaire())
  with check (not public.est_partenaire());

comment on table public.jalons_suivi_contrat is
  'Les gestes d''un suivi de contrat, coches a la main. A ne pas confondre avec '
  'etapes_suivis_contrats, qui est le CHEMIN du dossier (une seule etape a la fois).';
comment on table public.suivis_contrats_jalons is
  'Un jalon fait sur un suivi : qui, et quand. Decocher supprime la ligne.';
