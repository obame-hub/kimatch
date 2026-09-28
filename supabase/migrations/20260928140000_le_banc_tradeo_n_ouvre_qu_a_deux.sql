-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE BANC D'ESSAI TRADEO N'OUVRE QU'À DEUX PERSONNES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Réunion du 28/09/2026 : Naoëlle récupère les prix unitaires des fournisseurs par l'API EnergieX de
-- Tradeo, William les intègre ensuite aux versions de recommandation. Naoëlle, le même jour : « créer
-- un truc qui s'appelle pricing et qui serait visible juste de lui et moi », pour qu'il ait « un
-- visuel sur comment ça fonctionne » avant de l'intégrer.
--
-- ══ POURQUOI UNE TABLE, ET NON LE DROIT D'ADMINISTRER ══
--
-- Mesuré ce jour : cinq profils ouvrent l'administration (Agathe, Erwan, Michel, Naoëlle, William).
-- S'appuyer sur ce droit ouvrirait le banc à trois personnes qui n'ont pas à y être — et le banc
-- dépose de vraies demandes de cotation sur la pré-production de Tradeo, où l'équipe Tradeo les lit.
--
-- UNE TABLE plutôt que deux adresses écrites dans une fonction : ajouter un testeur, c'est une ligne,
-- pas une migration. Et la même fonction répond à l'écran ET au serveur : il n'y a qu'une définition
-- de « qui peut tester Tradeo », comme `est_partenaire()` pour « qui est partenaire ».
--
-- ══ LE JOURNAL ══
--
-- Chaque appel à Tradeo y laisse sa requête et sa réponse. C'est ce que William lira pour intégrer :
-- la documentation dit une chose, la pré-production répond parfois autrement (mesuré ce jour :
-- « Email et mot de passe obligatoires. » là où la doc annonce « requis »). Le jeton et le mot de
-- passe n'y entrent jamais — le serveur les retire avant d'écrire.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ QUI PEUT TESTER ═══════════════════════════════════════════════════════════════════════════

create table if not exists testeurs_tradeo (
  profil_id uuid primary key references profils (id) on delete cascade,
  motif text,
  date_ajout timestamptz not null default now()
);

comment on table testeurs_tradeo is
  'Les profils qui ouvrent le banc d''essai de l''API Tradeo (onglet « Prix Tradeo »). Une ligne '
  'par personne. Le droit d''administrer n''y suffit pas : le banc dépose de vraies demandes sur la '
  'pré-production de Tradeo. Voir la migration du 28/09/2026.';
comment on column testeurs_tradeo.profil_id is 'Le profil autorisé.';
comment on column testeurs_tradeo.motif is 'Pourquoi cette personne y a accès, en clair.';
comment on column testeurs_tradeo.date_ajout is 'Quand l''accès a été ouvert.';

alter table testeurs_tradeo enable row level security;

drop policy if exists testeurs_tradeo_lecture on testeurs_tradeo;
create policy testeurs_tradeo_lecture on testeurs_tradeo
  for select using (profil_id = auth.uid());

create or replace function ouvre_banc_tradeo()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.testeurs_tradeo t where t.profil_id = auth.uid())
$$;

comment on function ouvre_banc_tradeo() is
  'Vrai si la personne connectée peut ouvrir le banc d''essai Tradeo. Seule définition de ce droit : '
  'l''écran la lit pour afficher l''onglet, `api/tradeo` pour refuser l''appel.';

insert into testeurs_tradeo (profil_id, motif)
select p.id, m.motif
from profils p
join (values
  ('n.ghouma@kiwee-energie.fr', 'Construit les routes de récupération des prix (réunion du 28/09/2026).'),
  ('w.goupil@kiwee-energie.fr', 'Intègre les prix aux versions de recommandation (réunion du 28/09/2026).')
) as m (email, motif) on lower(p.email) = m.email
on conflict (profil_id) do nothing;

-- ══ LE JOURNAL DES APPELS ═════════════════════════════════════════════════════════════════════

create table if not exists appels_tradeo (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null default auth.uid() references profils (id),
  action text not null,
  chemin text not null,
  statut_http integer,
  succes boolean not null default false,
  duree_ms integer,
  requete jsonb,
  reponse jsonb,
  erreur text,
  date_appel timestamptz not null default now()
);

create index if not exists appels_tradeo_date_idx on appels_tradeo (date_appel desc);

comment on table appels_tradeo is
  'Journal des appels du banc d''essai à l''API EnergieX de Tradeo : ce qui a été envoyé, ce qui est '
  'revenu. Sert à intégrer sur des réponses réelles plutôt que sur la documentation. Ni jeton ni mot '
  'de passe n''y sont écrits.';
comment on column appels_tradeo.profil_id is 'Qui a lancé l''appel depuis le banc.';
comment on column appels_tradeo.action is 'L''action du banc (creer_demande, calculer…), telle que reçue par `api/tradeo`.';
comment on column appels_tradeo.chemin is 'La route Tradeo appelée, par exemple `calculer-budget-energie/`.';
comment on column appels_tradeo.statut_http is 'Le code HTTP rendu par Tradeo. NULL si Tradeo n''a pas répondu (délai, réseau).';
comment on column appels_tradeo.succes is 'Vrai si Tradeo a répondu 2xx avec `result` différent de false.';
comment on column appels_tradeo.duree_ms is 'Durée de l''aller-retour vers Tradeo, en millisecondes.';
comment on column appels_tradeo.requete is 'Le corps envoyé, fichiers remplacés par leur nom et leur taille.';
comment on column appels_tradeo.reponse is 'Le corps rendu par Tradeo, tel quel (JSON), ou `{ "texte": … }` s''il n''était pas du JSON.';
comment on column appels_tradeo.erreur is 'L''erreur côté Kimatch quand Tradeo n''a pas pu être joint.';
comment on column appels_tradeo.date_appel is 'Quand l''appel est parti.';

alter table appels_tradeo enable row level security;

drop policy if exists appels_tradeo_lecture on appels_tradeo;
create policy appels_tradeo_lecture on appels_tradeo
  for select using (ouvre_banc_tradeo());

drop policy if exists appels_tradeo_ecriture on appels_tradeo;
create policy appels_tradeo_ecriture on appels_tradeo
  for insert with check (ouvre_banc_tradeo() and profil_id = auth.uid());

commit;
