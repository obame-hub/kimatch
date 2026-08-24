-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SIX DES HUIT ÉTAPES DE RECOMMANDATION ÉTAIENT DÉSACTIVÉES
--
-- CONSTATÉ À L'ÉCRAN LE 25/08/2026, pas dans le code. Sur la fiche « AH IMMO — SDC SAINTE CECILE »,
-- le rail du cycle de vie n'affichait que deux crans — Brouillon et Consultation — et portait sous
-- lui la mention « Étape "PRESENTEE" : ancien cycle de vie, hors rail ». Or « Présentée » est le
-- cinquième palier de la diapositive 11 de Michel, et le dossier y est légitimement.
--
-- C'EST MA MIGRATION D'HIER QUI A LAISSÉ ÇA. 20260824150000 a renommé les étapes en place pour
-- épouser sa diapositive 11 — DIAGNOSTIC devient BROUILLON, DECISION devient PRESENTEE, et ainsi de
-- suite. Elle a changé les codes, les libellés et les ordres. Elle n'a pas touché à `actif`, et les
-- lignes qui portaient les anciens codes inutilisés étaient désactivées : elles ont donc gardé leur
-- `actif = false` sous leur nouveau nom.
--
-- CE QUE ÇA CASSAIT, AU-DELÀ DU RAIL. `fetchReferenceTable` ne rend que les lignes actives. Les
-- 1 573 recommandations closes pointaient donc une étape que l'application ne pouvait pas nommer, et
-- toute liste déroulante d'étapes en proposait deux sur huit. Le symptôme visible — un rail à deux
-- crans — était le plus bénin.
--
-- Vérifié avant d'écrire : la table ne contient QUE ces huit lignes, aucun ancien code résiduel à
-- laisser désactivé. Et les deux autres référentiels renommés par la même migration,
-- `statuts_signaux` et `statuts_opportunites`, sont intacts — leurs lignes étaient déjà actives.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

update etapes_recommandation
   set actif = true,
       date_modification = now()
 where code in ('BROUILLON', 'CONSULTATION', 'OFFRES_RECUES', 'A_PRESENTER',
                'PRESENTEE', 'ACCEPTEE', 'REFUSEE', 'ABANDONNEE')
   and actif is distinct from true;

commit;
