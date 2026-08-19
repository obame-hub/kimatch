-- Le TURPE, saisi en €/an sur l'offre × compteur électricité.
--
-- APPEL DE MICHEL DU 19/08/2026, 15h53 : « on va mettre TURPE manuellement, on va rajouter ce champ
-- en électricité […] tu mets prix et tu mets euros par an ». Manuel et non calculé, assumé comme
-- provisoire : « dans un premier temps on pourra le calculer nous-mêmes avec Kiwee Tools », le barème
-- réglementaire n'étant pas dans l'application.
--
-- EN €/AN ET NON AU MWH, contrairement à toutes les autres composantes de prix. C'est explicite dans
-- l'appel, et c'est cohérent : le TURPE se compose d'une part fixe et de parts variables que le
-- calcul externe agrège déjà en un montant annuel. D'où le nom `..._annuel_ht`, comme
-- `cta_annuel_ht` au gaz — la seule autre composante annuelle du schéma.
--
-- POURQUOI UNE COLONNE DÉDIÉE, et non `cout_acheminement_annuel_ht` qui existe déjà un niveau plus
-- haut. Cette dernière est un BUDGET, calculé au gaz (ATRD + AGN + CTA) et recalculé à chaque saisie
-- de prix. Y écrire une saisie mélangerait la donnée d'entrée et le résultat, et la première
-- recomposition des budgets l'écraserait. Le TURPE saisi vit donc avec les autres prix, dans
-- `offres_compteurs_electricite`, et le budget se déduit de lui.
--
-- CE QUE ÇA CHANGE AU-DESSUS, sur la ligne de l'offre — décidé dans le même appel :
--
--   · « Budget abonnement » devient « Budget abonnement gaz ». Michel : « tu précises abonnement gaz
--     et abonnement électricité, comme ça on sait que quand c'est abonnement gaz il y aura un budget
--     abonnement, alors que quand c'est abonnement électricité, ça rentre dans le budget énergie. »
--   · L'électricité affiche à cette place un « Budget TURPE » : « il n'y a pas un budget abonnement
--     en électricité […] à la place, on peut mettre TURPE. »
--   · Et le budget énergie électrique absorbe l'abonnement fourniture : « consommation heures pleines
--     hiver fois le prix, ainsi de suite, plus l'abonnement annuel, et la somme me donne le budget
--     énergie. » Aucune colonne à ajouter pour ça, seul le calcul change.
--
-- AUCUNE CONTRAINTE DE SIGNE et aucune reprise : la table compte 0 ligne (vérifié le 19/08/2026).

begin;

alter table public.offres_compteurs_electricite
  add column if not exists prix_turpe_annuel_ht numeric;

comment on column public.offres_compteurs_electricite.prix_turpe_annuel_ht is
  'TURPE de ce PDL pour cette offre, en €/AN et non au MWh. SAISI À LA MAIN : le barème réglementaire n''est pas dans l''application, le montant est calculé à côté (Kiwee Tools) puis reporté ici. Alimente le « Budget TURPE » de la ligne d''offre, qui remplace en électricité le budget abonnement — cet abonnement-là étant compté dans le budget énergie.';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='offres_compteurs_electricite'
--     and column_name = 'prix_turpe_annuel_ht';
--   -- attendu : 1 ligne, numeric
--
--   select count(*) from public.offres_compteurs_electricite;
--   -- attendu : inchangé (cette migration n'écrit aucune donnée)
--
-- À CONFIRMER AVEC MICHEL, et noté ici pour que la question ne se perde pas : en électricité, le
-- TURPE et le « budget contribution » désignent la même chose — l'acheminement. L'écran n'affiche donc
-- qu'une ligne pour les deux côté électricité, sous le nom TURPE. S'il attend en plus un budget
-- contribution électrique distinct (l'accise ? la CTA ?), il faut dire ce qu'il contient : personne ne
-- l'a énoncé.
