-- Offres reçues : distinguer « 36 mois fixe » de « 36 mois indexé », et garder le prix annoncé.
--
-- DEMANDE DE MICHEL (17/08/2026) : « il faut qu'on voie sous chaque fournisseur consulté la ou les
-- offres différentes, sinon la version ne sert à rien. » Un fournisseur consulté sur 24 et 36 mois,
-- en fixe et en indexé, peut répondre plusieurs offres — et c'est justement entre elles qu'on
-- arbitre.
--
-- CE QUI EXISTE DÉJÀ, VÉRIFIÉ AVANT D'ÉCRIRE CETTE MIGRATION :
--
--   · plusieurs offres par fournisseur consulté sont DÉJÀ possibles : il n'y a aucune contrainte
--     d'unicité sur `offres_fournisseurs.optimisation_fournisseur_id` (testé : deux insertions
--     passent). Rien à changer de ce côté.
--   · `duree_mois`, `montant_annuel_ht`, `economie_pourcentage`, `date_reception`, `date_validite`,
--     `reference_offre`, `statut`, `est_offre_recommandee` et `ordre_classement` existent.
--
-- CE QUI MANQUE, ET SEULEMENT CELA :
--
--   1. `type_prix` — sans lui, deux offres du même fournisseur sur la même durée (une fixe, une
--      indexée) sont indiscernables. La version demande déjà « Fixe » et/ou « Indexé »
--      (`versions_recommandation.types_prix`) : la réponse doit pouvoir dire laquelle des deux
--      elle est. La colonne porte le même nom que sur `offres_compteurs_electricite`,
--      `offres_compteurs_gaz`, `contrats` et `contrats_compteurs_tarifs` — un cinquième nom pour la
--      même notion serait une erreur de plus à retenir.
--
--   2. `prix_moyen_mwh` — le prix que le fournisseur ANNONCE (« 71,40 €/MWh »). Ce n'est pas un
--      doublon d'un calcul : c'est la donnée primaire de son offre, celle qu'il écrit dans son mail,
--      et un courtier compare d'abord là-dessus. Le détail par PDL
--      (`offres_fournisseurs_compteurs` → `offres_compteurs_electricite.prix_base_mwh`…) est un
--      raffinement qui arrive plus tard, quand il arrive : il compte 0 ligne aujourd'hui. L'écran
--      affiche le prix annoncé s'il existe, sinon la moyenne pondérée par les volumes du détail.
--
--   3. Un index sur `optimisation_fournisseur_id` — c'est désormais la clé de regroupement de
--      l'écran (« les offres DE ce fournisseur »), et elle n'en avait pas.
--
-- `nom` reste NOT NULL et sans valeur par défaut : ce n'est pas un oubli du schéma mais une offre
-- doit avoir un libellé. C'est le code applicatif qui était en faute, il ne le renseignait pas —
-- corrigé dans le même lot. Rien n'est relâché ici pour compenser un bug applicatif.

begin;

alter table public.offres_fournisseurs
  add column if not exists type_prix text,
  add column if not exists prix_moyen_mwh numeric;

comment on column public.offres_fournisseurs.type_prix is
  'Fixe | Indexé — répond aux types de prix demandés dans versions_recommandation.types_prix. Distingue deux offres du même fournisseur sur la même durée.';
comment on column public.offres_fournisseurs.prix_moyen_mwh is
  'Prix €/MWh tel que le fournisseur l''annonce. Donnée primaire de l''offre, pas un calcul : le détail par PDL, quand il existe, la précise sans la remplacer.';

-- Un prix négatif n'existe pas. Contrainte posée maintenant plutôt qu'après coup : la colonne est
-- vide, aucune ligne ne peut la faire échouer.
alter table public.offres_fournisseurs
  add constraint offres_fournisseurs_prix_moyen_mwh_positif
  check (prix_moyen_mwh is null or prix_moyen_mwh >= 0);

create index if not exists idx_offres_fournisseurs_optimisation_fournisseur
  on public.offres_fournisseurs (optimisation_fournisseur_id);

commit;

-- Vérification après application (à coller tel quel) :
--
--   select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='offres_fournisseurs'
--     and column_name in ('type_prix','prix_moyen_mwh');
--   -- attendu : 2 lignes (text, numeric)
--
--   select indexname from pg_indexes where schemaname='public'
--     and tablename='offres_fournisseurs'
--     and indexname='idx_offres_fournisseurs_optimisation_fournisseur';
--   -- attendu : 1 ligne
--
--   select count(*) from public.offres_fournisseurs;
--   -- attendu : 0 aujourd'hui — la table n'a jamais pu être remplie (voir le correctif applicatif
--   -- du même jour). Ce nombre doit se mettre à monter dès la première cotation créée après
--   -- déploiement.
