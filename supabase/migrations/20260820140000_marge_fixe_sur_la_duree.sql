-- La marge fixe porte sur TOUTE LA DURÉE du contrat, pas sur une année.
--
-- PRÉCISION DE NAOËLLE, 20/08/2026, en réponse à la question laissée ouverte par la migration
-- 20260820120000 : « c'est sur toute la durée du contrat ».
--
-- Cette migration ne change que le commentaire de la colonne, et pourtant elle vaut d'être écrite :
-- c'est la seule chose qui distingue 150 € de 150 € par an. Sur un contrat de 36 mois, l'écart entre
-- les deux lectures est d'un facteur trois — de quoi présenter une rentabilité de dossier fausse.
--
-- AUCUNE DONNÉE À REPRENDRE : la colonne est toujours vide (vérifié avant d'écrire ceci), la
-- précision arrive avant la première saisie.
--
-- POURQUOI PAS UNE COLONNE `marge_fixe_annuelle` CALCULÉE : parce que la durée vit sur l'offre
-- (`offres_fournisseurs.duree_mois`) et qu'un montant annuel s'en déduit en une division. Le stocker
-- créerait une seconde vérité à maintenir cohérente à chaque changement de durée. L'écran affiche
-- l'équivalent annuel comme un repère de lecture, sans l'enregistrer.

begin;

comment on column public.offres_fournisseurs_compteurs.marge_fixe_eur is
  'Marge que le fournisseur impose, en EUROS et SUR TOUTE LA DURÉE du contrat — ni au MWh, ni par an. Elle ne dépend pas du volume consommé. Renseignée quand type_marge vaut FIXE. JAMAIS ajoutée au prix ni aux budgets présentés au client : le fournisseur l''a déjà comprise dans son P0. Pour un équivalent annuel, diviser par la durée de l''offre (offres_fournisseurs.duree_mois / 12).';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select col_description('public.offres_fournisseurs_compteurs'::regclass,
--            (select ordinal_position from information_schema.columns
--              where table_schema='public' and table_name='offres_fournisseurs_compteurs'
--                and column_name='marge_fixe_eur')::int);
--   -- attendu : le commentaire contient « SUR TOUTE LA DURÉE »
