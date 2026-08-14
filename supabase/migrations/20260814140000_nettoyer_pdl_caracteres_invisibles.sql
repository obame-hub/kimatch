-- ============================================================================================
-- Retirer les caractères invisibles des numéros de PDL
-- ============================================================================================
-- Signalé le 14/08/2026 sur le mandat de CABINET MOLINIER : le PDL de SDC LE FONTENAY s'imprimait
-- « - 21326772715289 , » sur le document envoyé au client.
--
-- Le numéro avait été collé depuis une autre application avec deux marques de direction Unicode
-- (U+202D LEFT-TO-RIGHT OVERRIDE et U+202C POP DIRECTIONAL FORMATTING). Elles ne se voient pas dans
-- Kimatch, mais jsPDF les rend comme un tiret et une virgule — d'où le numéro encadré de ponctuation
-- parasite sur le PDF.
--
-- Ces caractères font plus que salir l'affichage : ils cassent toute comparaison. Le même PDL
-- ressaisi à la main ne serait pas reconnu comme un doublon, et une recherche sur le numéro ne
-- trouverait rien.
--
-- La saisie est désormais nettoyée à l'écriture (voir nettoyerSaisie dans src/lib/utils.ts). Cette
-- migration traite la seule ligne existante concernée, et couvre les mêmes caractères.
-- ============================================================================================

begin;

update public.compteurs
   set numero_point = btrim(regexp_replace(numero_point, '[​-‏‪-‮⁠﻿]', '', 'g')),
       date_modification = now()
 where numero_point ~ '[​-‏‪-‮⁠﻿]';

commit;

-- Contrôle : plus aucun numéro ne doit contenir de caractère invisible.
--   select count(*) from public.compteurs
--    where numero_point ~ '[​-‏‪-‮⁠﻿]';
