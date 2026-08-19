-- Marge ajustable, entre la marge retenue et la marge réelle.
--
-- DEMANDE DE NAOËLLE, 19/08/2026 : « ajouter marge ajustable entre les deux champs de marges
-- marge retenue / marge réelle ». Même table, même unité, même endroit que les deux autres :
-- `offres_fournisseurs_compteurs`, en €/MWh, sur la ligne offre × point de livraison.
--
-- POURQUOI UNE TROISIÈME COLONNE ET NON UN CALCUL. Les deux marges existantes encadrent la
-- négociation dans le temps : `marge_retenue_eur_mwh` est décidée en cotant, `marge_reelle_eur_mwh`
-- constatée après coup. La marge ajustable est la troisième information, celle qu'aucune des deux
-- ne contient : ce qu'on s'autorise encore à bouger. Elle ne se déduit ni de l'une ni de l'autre —
-- deux dossiers à marge retenue identique n'ont pas la même latitude selon le client et le
-- fournisseur. La calculer serait inventer une règle que personne n'a énoncée.
--
-- L'ORDRE DES TROIS EST CHRONOLOGIQUE et c'est celui de l'écran : retenue (ce qu'on a décidé) →
-- ajustable (ce qu'on peut encore céder) → réelle (ce qu'on a obtenu).
--
-- AUCUNE CONTRAINTE, comme pour les deux autres colonnes de marge : une marge ajustable nulle est
-- une position ferme, ce qui est un cas normal. Et rien n'impose qu'elle soit inférieure à la marge
-- retenue — on peut vouloir se laisser la place d'aller au-dessus.
--
-- LA MIGRATION 20260818140000 EST DÉJÀ APPLIQUÉE (vérifié en base le 19/08/2026 :
-- marge_retenue_eur_mwh et marge_reelle_eur_mwh sont présentes), d'où un fichier séparé plutôt
-- qu'une modification de celui-là, qui ne serait jamais rejoué.

begin;

alter table public.offres_fournisseurs_compteurs
  add column if not exists marge_ajustable_eur_mwh numeric;

comment on column public.offres_fournisseurs_compteurs.marge_ajustable_eur_mwh is
  'Marge qu''on s''autorise encore à ajuster en négociation sur ce PDL, en €/MWh. Se situe entre la marge retenue (décidée en cotant) et la marge réelle (constatée) ; ne se déduit ni de l''une ni de l''autre.';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='offres_fournisseurs_compteurs'
--     and column_name like 'marge%' order by column_name;
--   -- attendu : marge_ajustable_eur_mwh, marge_reelle_eur_mwh, marge_retenue_eur_mwh — numeric
--
--   select count(*) from public.offres_fournisseurs_compteurs;
--   -- attendu : inchangé (cette migration n'écrit aucune donnée)
