-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- RETRAIT DE v_comptes_patrimoine — le score est abandonné
--
-- Créée le matin du 26/08/2026 pour la page « Performance » : un score sur 100 par compte, quatre
-- dimensions pondérées. Michel l'a écarté l'après-midi, de sa propre voix pendant l'appel : « on ne
-- va pas le compter, on ne va pas le compter ». Le dossier UX qui a suivi n'en porte plus trace, et
-- la règle n° 2 demande du comptage — c'est `v_patrimoine_synthese` qui le sert.
--
-- ON LA SUPPRIME PLUTÔT QUE DE LA LAISSER DORMIR. Une vue que plus aucun écran ne lit est un piège :
-- au prochain audit, quelqu'un la trouvera, croira qu'elle sert, et se demandera pourquoi son score
-- n'apparaît nulle part. Vérifié en transaction annulée : aucune dépendance ne la lit.
--
-- Le calcul n'est pas perdu pour autant — il est dans l'historique, et ses trois dimensions
-- (rattachement à un contact, échéance valide, recommandations par compteur) sont exactement celles
-- qu'il a décrites pendant l'appel. Si le score revient « plus tard, avec de l'historique » comme il
-- l'a dit le 24/08, la requête est écrite.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop view if exists public.v_comptes_patrimoine;

commit;
