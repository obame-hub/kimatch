-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE VERSION A TROIS STATUTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 18/09/2026 :
--
--   « En construction : lorsque les demandes d'offres sont en cours et qu'on ne les a pas encore
--     reçues
--     Disponible : lorsque l'ensemble des offres de la version ont été reçues
--     Clôturée »
--
-- La table en portait TREIZE, dont neuf déjà désactivées et sans aucune version — le reste de
-- l'ancien cycle Salesforce. Le quatrième actif, « En décision », disparaît.
--
-- ══ OÙ VONT LES 39 VERSIONS « EN DÉCISION » ══
--
-- Vers « Disponible », sur décision de William mis devant les trois options. Elles ont dépassé la
-- construction, donc les propositions sont réputées arrivées. Mesure avant écriture : 8 des 39 ont
-- effectivement reçu toutes leurs réponses, les 31 autres sont déclarées disponibles sans l'être
-- strictement — c'est le prix assumé d'un rangement qui ne réécrit pas l'histoire à la main.
--
-- ══ CE QUE CE STATUT PORTAIT, ET QUI NE FONCTIONNAIT PAS ══
--
-- « En décision » disait « l'offre est partie, la balle est chez le décisionnaire », et la
-- suggestion de relance s'appuyait dessus (`relance.ts`). Vérifié avant de supprimer :
-- ELLE NE S'EST JAMAIS DÉCLENCHÉE. La fonction compare `reco.etape` — une étape de DOSSIER, dont
-- les valeurs sont Active, Clôturée, À réactiver, Brouillon — au code `EN_DECISION`, qui est un
-- statut de VERSION et n'existe même pas dans `etapes_recommandation`. La condition est fausse pour
-- tous les dossiers, depuis toujours.
--
-- On ne casse donc rien : on retire un statut dont la seule fonction était morte. La relance reste
-- à recâbler sur un fait qui existe, et c'est un autre sujet.
--
-- ══ POURQUOI « DISPONIBLE » N'AVAIT ÉTÉ POSÉ QUE TROIS FOIS ══
--
-- Parce que le mot vivait aussi sur l'offre et sur le fournisseur consulté, avec trois sens
-- différents — voir la migration 20260918120000 qui renomme celui du fournisseur en « Proposition
-- reçue ». Les trois seules versions « Disponible » de la base n'avaient d'ailleurs AUCUN
-- fournisseur consulté : le statut avait été posé sur des versions vides.
--
-- ══ LE PASSAGE EN « DISPONIBLE » SERA PROPOSÉ, PAS IMPOSÉ ══
--
-- William, mis devant le choix : quand toutes les propositions sont reçues, l'écran proposera le
-- basculement et Erwan validera d'un clic. Pas de déclencheur en base : on vient d'en supprimer un
-- qui écrivait des statuts que personne n'avait demandés (migration 20260918100000), et la règle
-- juste ne rachète pas le procédé. L'effort disparaît, la décision reste humaine.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

update versions_recommandation v
set statut_version_id = (select id from statuts_versions_recommandation where code = 'DISPONIBLE')
where v.statut_version_id = (select id from statuts_versions_recommandation where code = 'EN_DECISION');

update statuts_versions_recommandation set actif = false where code = 'EN_DECISION';

update statuts_versions_recommandation set actif = true  where code in ('EN_CONSTRUCTION','DISPONIBLE','CLOTUREE');
