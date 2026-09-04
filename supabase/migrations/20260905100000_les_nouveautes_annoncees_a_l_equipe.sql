-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES NOUVEAUTÉS : DIRE À L'ÉQUIPE CE QUI VIENT DE CHANGER DANS KIMATCH
--
-- William, 05/09/2026 : « Lorsque Naoelle ou moi-même poussons des modifications en production, il
-- faut que l'ensemble des équipes soient au courant. Ainsi ce sera l'endroit où seront édités,
-- publiés et stockés l'ensemble des changements effectifs. »
--
-- CE QUI EXISTAIT AVANT : rien. Vérifié le 05/09/2026 — aucune table du schéma ne porte de journal
-- des changements, et le seul canal d'annonce est Slack, hors de l'application. Une modification
-- poussée en production n'était donc connue que de ceux qui la remarquaient en s'en servant.
--
-- ══ TROIS TABLES ══
--
--     types_publications      les cinq catégories, référentiel lisible par tous
--     publications            le contenu : titre, catégorie, auteur, texte riche, date
--     publications_lectures   qui a lu quoi — c'est cette table qui fait vivre la pastille
--
-- ══ POURQUOI UNE TABLE DE LECTURES ET PAS UNE COLONNE « LU » ══
--
-- La pastille doit s'éteindre pour CELUI qui a lu, sans s'éteindre pour les autres. Une colonne
-- `lu boolean` sur la publication répondrait « lu par qui ? » — la première lecture effacerait la
-- pastille des treize personnes. La lecture est un fait qui lie une personne à une publication ;
-- c'est donc une ligne par couple, et l'absence de ligne suffit à dire « non lu ». Aucune écriture
-- n'est nécessaire à la publication : les non-lus se déduisent, ils ne se distribuent pas.
--
-- ══ LE BROUILLON N'EST PAS UN STATUT DE PLUS ══
--
-- `date_publication` NULL veut dire brouillon, et la poser publie. Un statut séparé aurait permis
-- d'être publié sans date, ou daté sans être publié — deux états incohérents qu'aucun écran ne
-- saurait afficher. C'est la même logique que `est_cloture` sur les statuts de pistes : on ne
-- duplique pas en statut ce qu'un fait établit déjà.
--
-- ══ QUI PUBLIE ══
--
-- Les six administrateurs (cinq ADMIN + Michel en SUPER_ADMIN, relevé le 05/09/2026), par
-- `has_role_acces` comme partout ailleurs. Choix de William : se brancher sur les rôles plutôt que
-- sur une liste nominative, pour qu'un futur administrateur n'ait pas besoin d'une migration.
-- Le brouillon est le garde-fou contre la publication accidentelle, pas la liste des ayants droit.
--
-- ══ LES PIÈCES JOINTES VONT DANS UN ESPACE PRIVÉ ══
--
-- Le bucket « documents » est en `public = true` : ses fichiers s'ouvrent sans être connecté, pour
-- qui a l'adresse. Les captures d'écran d'une nouveauté montreront presque toujours des noms de
-- vrais clients — elles ne peuvent pas y aller. D'où un bucket `nouveautes` privé, dont la lecture
-- passe par une URL signée réservée aux personnes connectées.
--
-- ══ CE QUE CETTE MIGRATION NE FAIT PAS ══
--
-- Elle ne touche à AUCUNE table existante : ni colonne ajoutée, ni contrainte modifiée, ni donnée
-- déplacée. L'application actuelle se comporte exactement comme avant son application.
-- Elle n'envoie rien dans Slack — l'annonce vit dans Kimatch, le relais Slack se décidera à part.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ 1. LES CINQ CATÉGORIES ═══════════════════════════════════════════════════════════════════════
-- Référentiel, donc lu par `useReferenceTable()` : mêmes colonnes que `statuts_pistes` pour que le
-- front n'ait aucun cas particulier à écrire.

create table if not exists public.types_publications (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  ordre integer not null,
  /** Teinte de la pastille de catégorie, en hexadécimal, lue telle quelle par le front. */
  couleur text,
  actif boolean not null default true,
  date_creation timestamptz not null default now()
);

comment on table public.types_publications is
  'Les cinq categories d''une nouveaute : maintenance, amelioration, correction, nouveaute, annonce.';

insert into public.types_publications (code, libelle, ordre, couleur)
values
  ('MAINTENANCE',  'Maintenance',  10, '#7C3AED'),
  ('AMELIORATION', 'Amélioration', 20, '#F59E0B'),
  ('CORRECTION',   'Correction',   30, '#B85145'),
  ('NOUVEAUTE',    'Nouveauté',    40, '#059669'),
  ('ANNONCE',      'Annonce',      50, '#6366F1')
on conflict (code) do nothing;

-- ══ 2. LES PUBLICATIONS ══════════════════════════════════════════════════════════════════════════

create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  type_publication_id uuid not null references public.types_publications(id),
  /** Le corps rédigé dans l'éditeur. HTML nettoyé côté application AVANT écriture : ce champ est
   *  réinjecté dans la page, une balise script qui y entrerait s'y exécuterait. */
  contenu_html text not null default '',
  /** Qui signe l'annonce, affiché sous le titre. Distinct de `cree_par_id`, qui trace qui a tapé :
   *  Naoëlle peut publier une annonce écrite par Michel. */
  auteur_id uuid references public.profils(id),
  /** NULL tant que c'est un brouillon. La poser publie, et c'est elle qui ordonne la liste. */
  date_publication timestamptz,
  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now(),
  cree_par_id uuid references public.profils(id),
  modifie_par_id uuid references public.profils(id)
);

comment on table public.publications is
  'Journal des changements de Kimatch, annonce a l''equipe. date_publication NULL = brouillon.';
comment on column public.publications.date_publication is
  'NULL tant que la publication est un brouillon ; la renseigner publie et declenche la pastille.';

-- La liste se lit toujours dans le même sens : publiées, la plus récente d'abord.
create index if not exists publications_date_publication_idx
  on public.publications (date_publication desc)
  where actif and date_publication is not null;

-- L'historique « qui a fait quoi » et le remplissage de cree_par_id / modifie_par_id.
drop trigger if exists trg_audit_trace on public.publications;
create trigger trg_audit_trace
  before insert or update on public.publications
  for each row execute function public.fn_audit_trace();

-- ══ 3. QUI A LU QUOI ═════════════════════════════════════════════════════════════════════════════
-- Clé primaire sur le couple : lire deux fois la même publication ne crée pas deux lignes, et
-- l'écriture côté application peut donc être un simple « insère si absent ».

create table if not exists public.publications_lectures (
  publication_id uuid not null references public.publications(id) on delete cascade,
  profil_id uuid not null references public.profils(id) on delete cascade,
  date_lecture timestamptz not null default now(),
  primary key (publication_id, profil_id)
);

comment on table public.publications_lectures is
  'Une ligne par personne et par publication lue. L''absence de ligne vaut « non lu ».';

-- Le compte des non-lus interroge toujours « mes lectures », jamais toutes.
create index if not exists publications_lectures_profil_idx
  on public.publications_lectures (profil_id);

-- ══ 4. LA SÉCURITÉ ═══════════════════════════════════════════════════════════════════════════════
-- Une table créée par migration naît sous RLS sans aucune politique : sans ce qui suit, les trois
-- tables seraient parfaitement muettes et l'écran resterait vide sans erreur visible.

alter table public.types_publications enable row level security;
alter table public.publications enable row level security;
alter table public.publications_lectures enable row level security;

drop policy if exists types_publications_lecture on public.types_publications;
create policy types_publications_lecture on public.types_publications
  for select to authenticated using (true);

-- Lecture : chacun voit ce qui est publié ; les brouillons ne sortent pas du cercle des admins.
drop policy if exists publications_lecture on public.publications;
create policy publications_lecture on public.publications
  for select to authenticated
  using (
    (actif and date_publication is not null)
    or public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN'])
  );

drop policy if exists publications_creation_admins on public.publications;
create policy publications_creation_admins on public.publications
  for insert to authenticated
  with check (public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists publications_maj_admins on public.publications;
create policy publications_maj_admins on public.publications
  for update to authenticated
  using (public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']))
  with check (public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists publications_suppression_admins on public.publications;
create policy publications_suppression_admins on public.publications
  for delete to authenticated
  using (public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

-- Ses lectures et rien d'autre : personne n'a à savoir qui a lu quoi.
drop policy if exists publications_lectures_les_siennes on public.publications_lectures;
create policy publications_lectures_les_siennes on public.publications_lectures
  for select to authenticated using (profil_id = auth.uid());

drop policy if exists publications_lectures_marquer on public.publications_lectures;
create policy publications_lectures_marquer on public.publications_lectures
  for insert to authenticated with check (profil_id = auth.uid());

grant select on public.types_publications to authenticated;
grant select, insert, update, delete on public.publications to authenticated;
grant select, insert on public.publications_lectures to authenticated;

-- ══ 5. L'ESPACE DE STOCKAGE PRIVÉ ════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('nouveautes', 'nouveautes', false)
on conflict (id) do nothing;

-- Lecture réservée aux personnes connectées : c'est ce qui autorise l'application à fabriquer une
-- URL signée. Sans cette politique, même signée, l'adresse ne rendrait rien.
drop policy if exists nouveautes_lecture on storage.objects;
create policy nouveautes_lecture
  on storage.objects for select to authenticated
  using (bucket_id = 'nouveautes');

drop policy if exists nouveautes_depot_admins on storage.objects;
create policy nouveautes_depot_admins
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'nouveautes'
    and public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN'])
  );

drop policy if exists nouveautes_remplacement_admins on storage.objects;
create policy nouveautes_remplacement_admins
  on storage.objects for update to authenticated
  using (
    bucket_id = 'nouveautes'
    and public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN'])
  )
  with check (
    bucket_id = 'nouveautes'
    and public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN'])
  );

drop policy if exists nouveautes_suppression_admins on storage.objects;
create policy nouveautes_suppression_admins
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'nouveautes'
    and public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN'])
  );

-- ── Le garde-fou ──
do $$
declare
  v_politiques   integer;
  v_categories   integer;
  v_bucket_prive boolean;
  v_type         uuid;
  v_profil       uuid;
  v_publication  uuid;
begin
  select count(*) into v_politiques from pg_policies
   where schemaname = 'public'
     and tablename in ('types_publications', 'publications', 'publications_lectures');
  if v_politiques < 7 then
    raise exception 'Les trois tables devraient porter 7 politiques, il y en a % : un ecran muet', v_politiques;
  end if;

  select count(*) into v_categories from public.types_publications;
  if v_categories <> 5 then
    raise exception 'Il devrait y avoir 5 categories de publication, il y en a %', v_categories;
  end if;

  select b.public into v_bucket_prive from storage.buckets b where b.id = 'nouveautes';
  if v_bucket_prive is null then
    raise exception 'Le bucket nouveautes n a pas ete cree';
  end if;
  if v_bucket_prive then
    raise exception 'Le bucket nouveautes est public : les captures montrant des clients seraient lisibles sans connexion';
  end if;

  -- L'essai fonctionnel : on écrit vraiment, on vérifie, puis on efface. Constater que les tables
  -- existent ne prouve ni la clé étrangère, ni la cascade, ni le défaut du brouillon.
  select id into v_type from public.types_publications where code = 'ANNONCE';
  select id into v_profil from public.profils limit 1;

  if v_type is not null and v_profil is not null then
    insert into public.publications (titre, type_publication_id, contenu_html, auteur_id)
    values ('Essai de migration', v_type, '<p>Essai</p>', v_profil)
    returning id into v_publication;

    if exists (select 1 from public.publications where id = v_publication and date_publication is not null) then
      raise exception 'Une publication creee sans date ne devrait pas etre publiee';
    end if;

    insert into public.publications_lectures (publication_id, profil_id)
    values (v_publication, v_profil);

    delete from public.publications where id = v_publication;

    if exists (select 1 from public.publications_lectures where publication_id = v_publication) then
      raise exception 'La cascade n a pas efface la lecture de la publication supprimee';
    end if;

    raise notice 'Essai fonctionnel reussi, puis annule';
  end if;
end;
$$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--   select code, libelle, ordre, couleur from public.types_publications order by ordre;
--   -- Attendu : cinq lignes, de Maintenance à Annonce.
--
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public'
--      and tablename in ('types_publications','publications','publications_lectures')
--    order by tablename, policyname;
--   -- Attendu : sept politiques.
--
--   select id, public from storage.buckets where id = 'nouveautes';
--   -- Attendu : une ligne, public = false.
