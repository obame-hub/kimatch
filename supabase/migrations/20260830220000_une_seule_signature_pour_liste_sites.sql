begin;

-- UNE FONCTION, PAS DEUX.
--
-- La migration précédente ajoute un paramètre à `liste_sites`. Or `create or replace function` ne
-- remplace que la fonction de MÊME signature : ajouter un paramètre en crée une seconde à côté de
-- l'ancienne. Postgres se retrouve alors avec deux candidates pour un appel à cinq arguments — la
-- sixième ayant une valeur par défaut — et refuse de choisir :
--
--     function liste_sites(unknown, unknown, unknown, integer, integer) is not unique
--
-- L'écran des sites appelle la fonction par arguments nommés : il serait tombé sur la même
-- ambiguïté, et la liste serait restée vide avec une erreur illisible.
--
-- L'ancienne signature est donc retirée. La nouvelle la couvre entièrement : son sixième paramètre
-- vaut NULL par défaut, ce qui reproduit exactement le comportement d'avant.

drop function if exists public.liste_sites(text, text, text, integer, integer);

commit;
