-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CHACUN RETROUVE CE QU'IL VIENT D'OUVRIR
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 16/09/2026 : « il pourrait également être intéressant, dans la palette, d'afficher les
-- 5 derniers enregistrements sur lesquels j'ai cliqué ».
--
-- ══ POURQUOI EN BASE ET PAS DANS LE NAVIGATEUR ══
--
-- `localStorage` aurait suffi et n'aurait rien coûté. Deux raisons de préférer la base, et William
-- a tranché pour elle :
--
--   · LA LISTE SUIT LA PERSONNE. Le portefeuille se travaille depuis un PC au bureau et un portable
--     ailleurs ; une liste de récents qui recommence à zéro selon la machine n'est pas une liste de
--     récents, c'est un cache.
--   · ELLE OUVRE AUTRE CHOSE. « Qui a consulté ce compte, et quand » est une question qui se posera
--     sur un portefeuille partagé à quatre. La trace existe alors déjà.
--
-- ══ UNE LIGNE PAR ENREGISTREMENT, PAS UNE PAR VISITE ══
--
-- La contrainte d'unicité `(profil_id, entite_type, entite_id)` transforme chaque réouverture en
-- mise à jour de la date. Sans elle, la table grandirait d'une ligne à chaque clic — des dizaines de
-- milliers par mois pour cinq lignes affichées — et il faudrait dédoublonner à la lecture.
--
-- La taille est donc bornée par le nombre d'enregistrements DISTINCTS que chacun a ouverts.
--
-- ══ LE LIBELLÉ EST RECOPIÉ, PAS JOINT ══
--
-- Une palette qui doit interroger dix tables — comptes, pistes, contacts, compteurs, mandats,
-- contrats, opportunités, recommandations… — pour afficher cinq lignes n'est pas une palette : elle
-- s'ouvre en un dixième de seconde ou elle ne sert à rien.
--
-- Le nom stocké est donc celui du moment de la visite. Un enregistrement renommé garde son ancien
-- nom dans la liste jusqu'à ce qu'on l'ouvre de nouveau — c'est le seul défaut, et il se répare tout
-- seul à la visite suivante. Le chemin est stocké pour la même raison : la palette navigue sans
-- avoir à savoir comment chaque objet s'adresse.
--
-- ══ PERSONNE NE VOIT CELLES D'UN AUTRE ══
--
-- Pas même un administrateur, contrairement à la plupart des tables de Kimatch. Ce n'est pas une
-- donnée métier : c'est le fil de la journée de quelqu'un.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists consultations_recentes (
  id                 uuid primary key default gen_random_uuid(),
  profil_id          uuid not null references profils(id) on delete cascade,
  entite_type        text not null,
  entite_id          uuid not null,
  libelle            text not null,
  sous_libelle       text,
  chemin             text not null,
  date_consultation  timestamptz not null default now(),
  unique (profil_id, entite_type, entite_id)
);

comment on table consultations_recentes is
  'Ce que chacun a ouvert, pour la palette de recherche. Une ligne par enregistrement et par personne : rouvrir une fiche met la date à jour, elle ne s''empile pas.';

comment on column consultations_recentes.libelle is
  'Le nom AU MOMENT DE LA VISITE. Recopié plutôt que joint : une palette qui doit interroger dix tables pour afficher cinq lignes n''est pas une palette. Un enregistrement renommé reprend son nom à la visite suivante.';

comment on column consultations_recentes.chemin is
  'La route interne (« /comptes/<id> »). Stockée pour que la palette navigue sans avoir à savoir comment chaque objet s''adresse.';

create index if not exists idx_consultations_recentes_personne
  on consultations_recentes (profil_id, date_consultation desc);

alter table consultations_recentes enable row level security;

drop policy if exists consultations_recentes_les_miennes on consultations_recentes;
create policy consultations_recentes_les_miennes on consultations_recentes
  for all to authenticated
  using (profil_id = auth.uid())
  with check (profil_id = auth.uid());
