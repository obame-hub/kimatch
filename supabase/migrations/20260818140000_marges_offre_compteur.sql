-- Marge retenue et marge réelle, sur la ligne offre × point de livraison.
--
-- DEMANDE DE MICHEL, transmise le 18/08/2026 : deux champs de marge « sur les compteurs ».
-- Arbitrage de Naoëlle le même jour : sur la ligne offre × compteur
-- (`offres_fournisseurs_compteurs`), et non sur le compteur lui-même.
--
-- POURQUOI CET ENDROIT. Une marge se décide offre par offre : la même consultation peut produire
-- 24 mois à une marge et 36 mois à une autre, et deux fournisseurs ne se négocient pas pareil. Posée
-- sur `compteurs`, la marge serait unique par PDL quel que soit le fournisseur — elle ne pourrait
-- plus se comparer d'une offre à l'autre, ce qui est précisément ce qu'on veut lire au comparatif.
--
-- L'UNITÉ EST DANS LE NOM, volontairement. Le schéma porte déjà `marge_nette_mwh` sur
-- `recommandations`, `prix_molecule_eur_mwh` sur `contrats` et `prix_base_eur_mwh` sur
-- `contrats_compteurs_tarifs` : trois façons d'écrire la même unité. Ici c'est
-- `..._eur_mwh`, comme la table des tarifs de contrat — la plus récente et la plus explicite.
--
-- HYPOTHÈSE À CONFIRMER AVEC MICHEL : la marge est prise en €/MWh, parce que c'est en €/MWh qu'un
-- courtier la décide et qu'elle se compare entre offres de volumes différents. Si le besoin était
-- une marge en € annuels, il faut le dire maintenant : les colonnes sont vides, un renommage ne
-- coûte rien aujourd'hui et coûtera cher une fois la saisie commencée. Le montant annuel reste de
-- toute façon calculable : marge_eur_mwh × consommation_annuelle_reference_mwh.
--
-- LES DEUX NE SE REMPLISSENT PAS AU MÊME MOMENT :
--   · `marge_retenue_eur_mwh` — la marge décidée en cotant, connue dès la construction de l'offre.
--   · `marge_reelle_eur_mwh`  — celle effectivement obtenue, connue après coup.
-- L'écart entre les deux est l'information utile ; c'est pour ça qu'on garde les deux plutôt qu'une
-- seule colonne qu'on écraserait.
--
-- AUCUNE CONTRAINTE DE POSITIVITÉ. Une marge nulle existe (offre d'appel), et une marge négative
-- n'est pas absurde sur un dossier stratégique. Interdire le signe négatif serait une règle métier
-- que personne n'a énoncée — mieux vaut ne pas la deviner.

begin;

alter table public.offres_fournisseurs_compteurs
  add column if not exists marge_retenue_eur_mwh numeric,
  add column if not exists marge_reelle_eur_mwh numeric;

comment on column public.offres_fournisseurs_compteurs.marge_retenue_eur_mwh is
  'Marge décidée au moment de coter cette offre sur ce PDL, en €/MWh. Connue dès la construction de l''offre.';
comment on column public.offres_fournisseurs_compteurs.marge_reelle_eur_mwh is
  'Marge effectivement obtenue sur ce PDL, en €/MWh. Renseignée après coup ; l''écart avec la marge retenue est l''information utile.';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='offres_fournisseurs_compteurs'
--     and column_name like 'marge%';
--   -- attendu : 2 lignes, numeric
--
--   select count(*) from public.offres_fournisseurs_compteurs;
--   -- attendu : inchangé (cette migration n'écrit aucune donnée)
