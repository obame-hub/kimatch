-- Fiche Compteur (maquette de William) — les colonnes qui manquent pour la construire.
--
-- Constat fait le 16/08/2026 en lisant `information_schema` : la maquette affiche trois choses
-- que la base ne sait pas stocker aujourd'hui.
--
--   1. « ADRESSE DU COMPTEUR — 14 rue Garibaldi, accès local technique · peut différer de
--      l'adresse du site ». La table `compteurs` n'a AUCUNE colonne d'adresse : la fiche affiche
--      forcément celle du site. C'est faux dans le cas courant d'une copropriété dont les PDL
--      sont répartis sur plusieurs entrées, et c'est précisément le cas du compteur GI155378.
--
--   2. « LOCALISATION DANS LE SITE — Local TGBT — Bât. A ». Rien non plus. Aujourd'hui ce
--      renseignement finit dans `commentaire`, mêlé à tout le reste, donc illisible et
--      inexploitable pour un technicien qui cherche où est le compteur.
--
--   3. L'onglet « Signaux » de la fiche compteur. `signaux` ne porte que `site_id` : un signal
--      ne peut pas désigner LE compteur concerné. Sur un site à 40 PDL, « 2 signaux ouverts »
--      ne dit pas lesquels sont en cause.
--
-- Tout est ajouté en NULL autorisé et sans valeur par défaut : aucune ligne existante n'est
-- touchée, rien ne casse si l'application n'est pas encore déployée.

begin;

-- 1 & 2 — Adresse propre au compteur, et emplacement dans le site.
alter table public.compteurs
  add column if not exists adresse text,
  add column if not exists code_postal text,
  add column if not exists ville text,
  -- Où le trouver une fois sur place : « Local TGBT — Bât. A », « Chaufferie — sous-sol ».
  add column if not exists localisation_site text;

comment on column public.compteurs.adresse is
  'Adresse du point de livraison quand elle diffère de celle du site (copropriété à plusieurs entrées). NULL = celle du site fait foi.';
comment on column public.compteurs.localisation_site is
  'Emplacement physique dans le site : local technique, bâtiment, étage. Renseignement de terrain, distinct du commentaire libre.';

-- 3 — Un signal peut désigner le compteur concerné, sans cesser d'appartenir à son site.
--     `on delete set null` et non `cascade` : supprimer un compteur ne doit pas faire disparaître
--     l'historique du signal, qui reste rattaché au site.
alter table public.signaux
  add column if not exists compteur_id uuid references public.compteurs(id) on delete set null;

comment on column public.signaux.compteur_id is
  'Compteur concerné, quand le signal vise un PDL précis. NULL = signal de niveau site.';

-- L'onglet Signaux d'une fiche compteur filtre sur cette colonne : sans index, chaque
-- ouverture de fiche parcourt les signaux du CRM.
create index if not exists idx_signaux_compteur_id
  on public.signaux (compteur_id)
  where compteur_id is not null;

commit;

-- Vérification après application (à coller tel quel) :
--
--   select column_name, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'compteurs'
--     and column_name in ('adresse', 'code_postal', 'ville', 'localisation_site')
--   order by column_name;
--   -- attendu : 4 lignes, toutes is_nullable = YES
--
--   select count(*) from information_schema.columns
--   where table_schema='public' and table_name='signaux' and column_name='compteur_id';
--   -- attendu : 1
