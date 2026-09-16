-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN CONSEILLER SUPPRIME CE QU'IL TRAVAILLE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 16/09/2026 : « Matthieu m'indique qu'il ne peut pas supprimer une opportunité. Rien ne le
-- bloque mais l'opportunité ne se supprime pas. »
--
-- ══ CE QUI SE PASSAIT ══
--
-- `opportunites` porte une politique RESTRICTIVE réservant la suppression aux profils SUPER_ADMIN et
-- ADMIN. Matthieu est CONSEILLER : la ligne lui est invisible en écriture, le DELETE n'efface donc
-- AUCUNE ligne — et supprimer zéro ligne est une instruction parfaitement valide. PostgREST ne
-- renvoie pas d'erreur, l'écran annonce « supprimée », et la fiche reste là.
--
-- Le refus de droit et le succès étaient rigoureusement indiscernables. Le correctif côté écran
-- (lecture des lignes réellement effacées) reste en place quoi qu'il arrive : il transforme un
-- silence en phrase.
--
-- ══ LA RÈGLE ÉTAIT INCOHÉRENTE, ET C'EST CE QUI A DÉCIDÉ ══
--
-- Mesuré avant d'écrire, sur les onze objets du travail quotidien :
--
--   administrateurs seulement : opportunités · pistes · requêtes · tâches
--   tout utilisateur connecté : comptes · contacts · compteurs · mandats · contrats ·
--                               recommandations · signaux
--
-- Un conseiller pouvait donc supprimer un COMPTE entier — avec ses compteurs, ses contacts et son
-- historique — mais pas l'opportunité qu'il venait d'ouvrir dessus. Ce n'est pas une protection,
-- c'est un reste : la politique « suppression réservée aux admins » a été posée d'un bloc sur une
-- centaine de tables, référentiels compris, et a emporté au passage quatre objets métier.
--
-- William, mis devant ces deux listes : « ouvrir aux conseillers ».
--
-- ══ CE QU'ON OUVRE, ET CE QU'ON N'OUVRE PAS ══
--
-- Les QUATRE objets de travail — opportunités, pistes, requêtes, tâches — et les tables de liaison
-- qui en dépendent, sans lesquelles la suppression échouerait sur une clé étrangère.
--
-- LES RÉFÉRENTIELS NE BOUGENT PAS. `types_*`, `statuts_*`, les tables de calcul et d'expertise :
-- supprimer une ligne de référentiel casse des enregistrements qui la citent, dans toute
-- l'application et pour tout le monde. C'est bien un geste d'administration, et la politique y est
-- à sa place.
--
-- ══ POURQUOI SUPPRIMER LA POLITIQUE PLUTÔT QUE L'ÉLARGIR ══
--
-- Une politique restrictive dont la condition serait « vrai » n'interdit rien mais coûte une
-- évaluation à chaque ligne, et surtout elle ment sur son nom : quelqu'un la lirait comme une
-- protection encore active. La politique permissive `authenticated_all` suffit et dit ce qu'elle
-- fait.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- Les quatre objets de travail, et leurs tables de liaison.
drop policy if exists suppression_reservee_aux_admins on opportunites;
drop policy if exists suppression_reservee_aux_admins on opportunites_compteurs;
drop policy if exists suppression_reservee_aux_admins on opportunites_sites;
drop policy if exists suppression_reservee_aux_admins on pistes;
drop policy if exists suppression_reservee_aux_admins on requetes;

-- `actions` et `interactions` portent une politique différente — « auteur ou admin » — qui laisse
-- déjà chacun supprimer ce qu'il a créé. C'est une règle défendable et d'une autre nature : on n'y
-- touche pas.
