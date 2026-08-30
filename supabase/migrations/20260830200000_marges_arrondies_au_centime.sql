begin;

-- LES MARGES S'ARRÊTENT AU CENTIME.
--
-- Le recalcul de la migration précédente arrondit à deux décimales, mais son garde-fou
-- (« ne réécris que si l'écart dépasse un demi-centime ») laissait passer le cas où l'écart vaut
-- EXACTEMENT un demi-centime : une marge brute de 759,005 € donnait une marge commission de
-- 759,005 € là où la marge nette, elle, avait bien été arrondie à 759,01 €.
--
-- Un dossier concerné, mais un demi-centime qui traîne dans une colonne de rémunération finit par
-- se voir. Toutes les valeurs sont ramenées au centime.

update recommandations
   set marge_nette = round(marge_nette, 2)
 where marge_nette is not null and marge_nette <> round(marge_nette, 2);

update recommandations
   set marge_nette_coeff = round(marge_nette_coeff, 2)
 where marge_nette_coeff is not null and marge_nette_coeff <> round(marge_nette_coeff, 2);

commit;
