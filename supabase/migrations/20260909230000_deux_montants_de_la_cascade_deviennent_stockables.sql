-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- DEUX MONTANTS DE LA CASCADE DEVIENNENT STOCKABLES
--
-- William, 09/09/2026, en préparant la reprise de l'import Salesforce : « ok donc si c'est pas créé
-- tu peux le faire non ? »
--
-- ── QUATRE DES SIX MONTANTS AVAIENT DÉJÀ LEUR COLONNE, DEUX N'EN AVAIENT PAS ──
--
--   Montant brut    `marge_brute`         ✅
--   CIP             —                     ❌  calculée à la volée, nulle part stockée
--   Chiffre d'aff.  —                     ❌  idem
--   CAA             `marge_apporteur`     ✅
--   Montant net     `marge_nette`         ✅
--   Montant         `marge_nette_coeff`   ✅
--
-- Les deux manquantes ne posaient aucun problème tant que la cascade se calculait : la vue les
-- déduit du montant brut et des taux, et une colonne aurait fait doublon avec la formule.
--
-- ── CE QUI CHANGE : LES 1 668 RECOMMANDATIONS REPRISES DE SALESFORCE ──
--
-- Elles n'ont aucune offre retenue derrière elles — la vue ne peut donc rien calculer, et leurs
-- valeurs viennent de Salesforce, où elles sont saisies et non déduites :
--
--   Remuneration_partenaire__c   → commission_intermediaire
--   Montant__c                   → chiffre_affaires
--
-- Sans colonne, ces deux montants n'auraient nulle part où atterrir, et la cascade s'arrêterait au
-- montant brut sur les trois quarts du portefeuille.
--
-- ── LE CALCUL RESTE PRIORITAIRE, LA COLONNE EST UN REPLI ──
--
-- Sur une recommandation qui porte une offre retenue, c'est la vue qui fait foi : ces colonnes ne
-- sont alors ni lues, ni écrites. Elles ne servent qu'aux dossiers venus d'un autre système — et le
-- jour où l'un d'eux reçoit une offre, le calcul reprend la main.
--
-- ── ATTENTION AU VOISINAGE : `montant` EXISTE DÉJÀ ET NE PARLE PAS D'ARGENT DE KIWEE ──
--
-- La table porte une colonne `montant`, héritée, renseignée sur 1 575 lignes pour 153 460 425 €
-- cumulés : c'est le budget du marché d'électricité, pas une commission. `chiffre_affaires` est mille
-- fois plus petit et n'a rien à voir. Le commentaire de colonne le dit, pour que personne n'additionne
-- les deux un jour de reporting.
--
-- ── ELLES PARTENT VIDES, ET C'EST LE POINT IMPORTANT ──
--
-- Aucune de ces deux valeurs n'existe aujourd'hui dans Kimatch : l'import d'août 2026 n'a jamais
-- rapatrié `Remuneration_partenaire__c` ni `Montant__c`. Créer les colonnes ne crée pas la donnée —
-- elle sera versée depuis l'export Salesforce que William prépare, et pas avant.
--
-- NULL N'EST PAS ZÉRO ICI. Une commission d'intermédiaire vide veut dire « non renseignée », pas
-- « aucune commission ». Le zéro et l'absence disent deux choses différentes, et l'écran les
-- distingue déjà.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table recommandations
  add column if not exists commission_intermediaire numeric(14, 2),
  add column if not exists chiffre_affaires numeric(14, 2);

comment on column recommandations.commission_intermediaire is
  'Ce que l''intermédiaire pricing prélève, quand la valeur vient d''un autre système. Sur une recommandation portant une offre retenue, c''est v_montants_recommandation qui fait foi. Origine Salesforce : Remuneration_partenaire__c. NULL = non renseignée, jamais « zéro commission ».';

comment on column recommandations.chiffre_affaires is
  'Ce qui entre dans les caisses de Kiwee, quand la valeur vient d''un autre système. Sur une recommandation portant une offre retenue, c''est v_montants_recommandation qui fait foi. Origine Salesforce : Montant__c. À ne pas confondre avec recommandations.montant, colonne héritée qui porte le budget du marché (153 M€ cumulés), pas une commission.';

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION — fait le 09/09/2026 : 0 / 0 sur 1 732 recommandations actives.
--
--   select count(*) filter (where commission_intermediaire is not null) as cip_renseignees,
--          count(*) filter (where chiffre_affaires is not null)         as ca_renseignes,
--          count(*)                                                     as total_actives
--   from recommandations where actif;
-- ════════════════════════════════════════════════════════════════════════════════════════════════
