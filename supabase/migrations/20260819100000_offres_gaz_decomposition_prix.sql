-- Décomposition du prix gaz : molécule, CEE, CPB, ATRD, AGN, CTA.
--
-- DEMANDE DE NAOËLLE, 19/08/2026. Le détail par compteur d'une offre gaz doit montrer le prix comme
-- le fournisseur le décompose, et non un prix d'énergie unique :
--
--   1. Prix de l'énergie (€/MWh) — molécule, CEE, CPB
--   2. Abonnement (€/an)
--   3. Contributions — ATRD (€/MWh), AGN (€/MWh), CTA (€/an)
--
-- CE QUI EXISTAIT DÉJÀ et qui suffit : `prix_energie_mwh` devient le PRIX DE LA MOLÉCULE, et
-- `abonnement_fourniture_annuel_ht` l'abonnement. La table étant vide (0 ligne), requalifier le
-- premier ne réinterprète aucune donnée — et ajouter un `prix_molecule_mwh` à côté de
-- `prix_energie_mwh` aurait laissé deux colonnes pour la même chose, ce qui finit toujours par
-- produire deux vérités.
--
-- CE QUI MANQUAIT, et rien de plus :
--
--   prix_cee_mwh    Certificats d'économies d'énergie, refacturés au MWh.
--   prix_cpb_mwh    CPB, au MWh.
--   prix_atrd_mwh   Accès des Tiers au Réseau de Distribution, part variable au MWh.
--   prix_agn_mwh    AGN, au MWh.
--   cta_annuel_ht   Contribution Tarifaire d'Acheminement — la seule contribution en €/AN et non
--                   au MWh, d'où son nom distinct : la confondre avec les autres ferait un facteur
--                   mille dans le budget.
--
-- ORTHOGRAPHE. La demande écrit « ATDR » ; c'est ATRD. Le schéma porte déjà `version_atrd` et
-- `detail_calcul_atrd`, on reste cohérent avec eux plutôt que de propager l'inversion.
--
-- LES BUDGETS EN €/AN NE SONT PAS ICI. Ils vivent déjà un niveau au-dessus, sur
-- `offres_fournisseurs_compteurs` : `cout_fourniture_annuel_ht` (budget énergie),
-- `cout_acheminement_annuel_ht` (budget contribution), `cout_total_annuel_estime_ht` (budget total),
-- `economie_annuelle_estimee`. Aucune colonne à ajouter pour eux — seuls les libellés de l'écran
-- changent.
--
-- AUCUNE CONTRAINTE DE POSITIVITÉ : une CEE peut être nulle, et un mécanisme de régularisation peut
-- rendre une composante négative. Interdire le signe serait une règle que personne n'a énoncée.

begin;

alter table public.offres_compteurs_gaz
  add column if not exists prix_cee_mwh numeric,
  add column if not exists prix_cpb_mwh numeric,
  add column if not exists prix_atrd_mwh numeric,
  add column if not exists prix_agn_mwh numeric,
  add column if not exists cta_annuel_ht numeric;

comment on column public.offres_compteurs_gaz.prix_energie_mwh is
  'Prix de la molécule, en €/MWh. C''est la composante « énergie » nue, hors CEE et CPB.';
comment on column public.offres_compteurs_gaz.prix_cee_mwh is
  'Certificats d''économies d''énergie refacturés, en €/MWh.';
comment on column public.offres_compteurs_gaz.prix_cpb_mwh is
  'CPB, en €/MWh.';
comment on column public.offres_compteurs_gaz.prix_atrd_mwh is
  'ATRD (Accès des Tiers au Réseau de Distribution), part variable en €/MWh. Le barème appliqué est tracé par version_atrd.';
comment on column public.offres_compteurs_gaz.prix_agn_mwh is
  'AGN, en €/MWh.';
comment on column public.offres_compteurs_gaz.cta_annuel_ht is
  'Contribution Tarifaire d''Acheminement, en €/AN — la seule contribution qui ne soit pas au MWh.';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='offres_compteurs_gaz'
--     and (column_name like 'prix%' or column_name like 'cta%')
--   order by column_name;
--   -- attendu : cta_annuel_ht, prix_agn_mwh, prix_atrd_mwh, prix_cee_mwh, prix_cpb_mwh,
--   --           prix_energie_mwh
--
--   select count(*) from public.offres_compteurs_gaz;
--   -- attendu : inchangé (cette migration n'écrit aucune donnée)
--
-- À FAIRE ENSUITE, hors migration : la même décomposition existe côté électricité, mais elle ne
-- porte pas les mêmes composantes (TURPE au lieu de l'ATRD, accise, pas de CPB). Ne pas recopier ces
-- colonnes telles quelles sur `offres_compteurs_electricite` sans l'avoir cadré avec Erwan.
