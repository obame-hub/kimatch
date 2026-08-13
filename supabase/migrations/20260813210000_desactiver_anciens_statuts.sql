-- ============================================================================================
-- Retire des listes les statuts remplaces par les cycles de vie du 12/08/2026
-- ============================================================================================
-- La migration 20260812090000 a ajoute les nouveaux referentiels et rebascule toutes les lignes
-- dessus, mais a laisse les anciens codes dans les tables. Consequence visible sur la fiche
-- recommandation : le fil d'etapes affiche les treize etapes melangees — « À préparer, Diagnostic,
-- En analyse, Consultation, En préparation, Décision, Clôture, Prête, Présentée au client, À
-- actualiser, Acceptée, Clôturée » — alors que la maquette de William n'en prevoit que quatre.
-- Les listes deroulantes de statut de version ont le meme defaut.
--
-- Verifie avant d'ecrire : les neuf anciennes etapes portent 0 recommandation (les 1694 sont
-- reparties sur Diagnostic 24, Consultation 93, Décision 4, Clôture 1573) et les six anciens
-- statuts de version portent 0 version.
--
-- actif = false plutot qu'un delete : ces lignes sont encore citees dans les commentaires des
-- migrations et dans l'historique des modifications, et une suppression de referentiel ne se
-- rattrape pas. Le front ignore desormais les lignes inactives (referenceTables.ts).
--
-- Rien n'est touche du cote statuts_mandats ni statuts_contrats : leurs codes a zero ligne
-- (ENVOYE, EN_SIGNATURE, SIGNE, REFUSE, ANNULE, RESILIE...) sont des etats a venir du cycle
-- courant, pas des restes de l'ancien.
-- ============================================================================================

begin;

update public.etapes_recommandation
   set actif = false, date_modification = now()
 where code in ('A_PREPARER', 'EN_ANALYSE', 'EN_PREPARATION', 'PRETE', 'PRESENTEE',
                'ACTUALISATION', 'ACCEPTEE', 'REFUSEE', 'CLOTUREE');

-- ACCEPTEE, REFUSEE et EXPIREE restent actifs : ce sont les trois fins de vie d'une version
-- decidees le 12/08 (« la recommandation peut etre cloturee acceptee, refusee ou expiree »).
update public.statuts_versions_recommandation
   set actif = false, date_modification = now()
 where code in ('BROUILLON', 'A_VALIDER', 'VALIDEE', 'PRESENTEE', 'REMPLACEE', 'ARCHIVEE');

commit;

-- Controle : plus aucune ligne active sans usage, plus aucune ligne inactive avec usage.
--   select e.code, e.actif, count(r.id)
--     from public.etapes_recommandation e
--     left join public.recommandations r on r.etape_id = e.id
--    group by 1, 2 order by 2 desc, 1;
