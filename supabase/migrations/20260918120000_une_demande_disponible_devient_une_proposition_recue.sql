-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- « DEMANDE DISPONIBLE » DEVIENT « PROPOSITION REÇUE »
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 18/09/2026, en listant le vocabulaire des trois étages : « Demande disponible devient
-- Proposition reçue ».
--
-- ══ POURQUOI CE MOT COÛTAIT CHER ══
--
-- « Disponible » vivait aux TROIS étages de la consultation, avec trois sens différents :
--
--   · sur l'OFFRE            → ce fournisseur cote cette durée-là
--   · sur le FOURNISSEUR     → sa demande a abouti
--   · sur la VERSION         → toutes les offres sont revenues
--
-- Trois objets, un même mot, trois sens. C'est ce qui a permis au calcul automatique des statuts de
-- vivre dix-sept jours sans que personne le voie (migration 20260918100000) — et c'est probablement
-- aussi pourquoi le cran « Disponible » de la version n'a jamais été franchi que trois fois, sur des
-- versions qui n'avaient AUCUN fournisseur consulté : personne ne savait duquel on parlait.
--
-- « Proposition reçue » dit ce qui s'est passé — un document est arrivé — au lieu de décrire un état
-- abstrait. Et il ne peut plus se confondre avec la disponibilité d'une version.
--
-- ══ LE CODE NE CHANGE PAS ══
--
-- `DISPONIBLE` reste le code : il est cité dans `CODES_STATUT_CONSULTATION_PROPOSES` et dans la vue
-- du Pricing, et 43 lignes de suivi le portent. Renommer un code pour renommer un libellé, c'est se
-- donner une migration de données et un risque de rupture pour un gain nul — le libellé est la seule
-- chose que quiconque lit.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

update statuts_consultations_fournisseurs
set libelle = 'Proposition reçue'
where code = 'DISPONIBLE';
