-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES MONTANTS SALESFORCE 2026 REJOIGNENT LEURS RECOMMANDATIONS
--
-- Second passage, même procédure que celle du 10/09/2026 pour 2025 (migration 20260910230000) :
-- 266 opportunités Closed Won clôturées entre le 01/01/2026 et le 31/12/2026, neuf champs recopiés.
--
-- ── CE QUI A CHANGÉ DEPUIS LE PREMIER PASSAGE ──
--
-- `trg_calculer_marges` n'existe plus (migration 20260910240000). Il avait fallu le neutraliser
-- pour l'import 2025, faute de quoi il réécrivait la marge nette et le « Montant » par-dessus les
-- valeurs Salesforce. Rien à désactiver cette fois : le montant d'une recommandation n'a plus
-- qu'une source.
--
-- ── LES CONTRÔLES PASSÉS AVANT D'ÉCRIRE ──
--
--   · 266 lignes, 266 identifiants uniques, 100 % « Closed Won » ;
--   · en-tête du fichier STRICTEMENT identique à celui de 2025, colonne par colonne ;
--   · les huit totaux du transit égalent ceux du fichier, au centime ;
--   · 266 appariées sur 266, zéro orpheline, zéro doublon ;
--   · ZÉRO CHEVAUCHEMENT avec les 459 de 2025 — deux lots disjoints, aucune valeur réécrite deux fois ;
--   · les 266 sont toutes « Acceptée / clôturée en 2026 » côté Kimatch.
--
-- ── LE MÊME DÉFAUT D'IMPORT QU'EN 2025, ET DANS LA MÊME PROPORTION ──
--
-- 60 recommandations voient leur montant brut corrigé : il portait le CHIFFRE D'AFFAIRES
-- (`Montant__c`) au lieu de la facturation fournisseur. C'est l'erreur de colonne de l'import
-- d'août 2026, déjà constatée 434 fois sur 434 sur le lot 2025.
--
-- ── TROIS MONTANTS SONT PRÉSERVÉS, ET C'EST LE `coalesce` QUI LE FAIT ──
--
-- RENOU 66 RUE REGNAULT (6 193,25 €), CAPTA JULES GUESDE (1 096,68 €) et CAPTA MIREILLE DARC
-- (1 207,80 €) n'ont pas de facturation fournisseur côté Salesforce alors que Kimatch en porte une.
-- Écrire le vide effacerait le seul montant connu. Le total du montant brut après import n'est donc
-- PAS celui du fichier : 872 222,20 € + 8 497,73 € préservés = 880 719,93 €. Un total qui tomberait
-- pile sur le fichier serait le signe que le garde-fou n'a pas joué.
--
-- Deux autres (CITYA VAL D'OUEST, MATERA 45-53 GALLIENI) n'ont pas de chiffre d'affaires ni d'un
-- côté ni de l'autre : ils restent vides, il n'y a rien à préserver.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. L'état d'avant, gardé tel quel ──
drop table if exists sauvegarde_montants_avant_import_sf_2026;

create table sauvegarde_montants_avant_import_sf_2026 as
select r.id, r.id_salesforce, r.nom,
       r.marge_brute, r.commission_intermediaire, r.chiffre_affaires, r.marge_apporteur,
       r.marge_nette, r.marge_nette_coeff,
       r.budget_ancienne_offre, r.budget_nouvelle_offre, r.difference_budgetaire,
       now() as date_sauvegarde
from recommandations r
join import_sf_montants_2026 i on left(r.id_salesforce, 15) = i.id15
where r.actif;

do $$
declare n int;
begin
  select count(*) into n from sauvegarde_montants_avant_import_sf_2026;
  if n <> 266 then
    raise exception 'Sauvegarde incomplète : % ligne(s) au lieu de 266. Rien n''est écrit.', n;
  end if;
end $$;

-- ── 2. Les neuf champs ──
update recommandations r
set marge_brute              = coalesce(i.facturation_fournisseur, r.marge_brute),
    commission_intermediaire = coalesce(i.remuneration_partenaire, r.commission_intermediaire),
    chiffre_affaires         = coalesce(i.montant, r.chiffre_affaires),
    marge_apporteur          = coalesce(i.remuneration_apporteur, r.marge_apporteur),
    marge_nette              = coalesce(i.commission_nette_kiwee, r.marge_nette),
    marge_nette_coeff        = coalesce(i.commission_interne, r.marge_nette_coeff),
    budget_ancienne_offre    = coalesce(i.budget_ancienne_offre, r.budget_ancienne_offre),
    budget_nouvelle_offre    = coalesce(i.budget_nouvelle_offre, r.budget_nouvelle_offre),
    difference_budgetaire    = coalesce(i.difference_budgetaire, r.difference_budgetaire),
    date_modification        = now()
from import_sf_montants_2026 i
where left(r.id_salesforce, 15) = i.id15
  and r.actif
  and r.id_salesforce is not null   -- redondant avec la jointure, et volontairement écrit : la
  and i.stage_name = 'Closed Won';  -- contrainte de William se lit ici, pas dans un commentaire.

-- ── 3. Les garde-fous ──
do $$
declare n int; v_montant numeric; v_net numeric; v_brut numeric; v_cip numeric; v_ca numeric; hors int;
begin
  select count(*), round(sum(r.marge_nette_coeff),2), round(sum(r.marge_nette),2),
         round(sum(r.marge_brute),2), round(sum(r.commission_intermediaire),2),
         round(sum(r.chiffre_affaires),2)
    into n, v_montant, v_net, v_brut, v_cip, v_ca
  from recommandations r join import_sf_montants_2026 i on left(r.id_salesforce,15) = i.id15
  where r.actif;

  select count(*) into hors from recommandations
   where actif and id_salesforce is null and date_modification > now() - interval '2 minutes';

  if n <> 266             then raise exception 'Attendu 266 recommandations, trouvé %.', n; end if;
  if v_montant <> 695024.09 then raise exception '« Montant » attendu 695024.09 €, obtenu % €.', v_montant; end if;
  if v_net  <> 665673.83  then raise exception '« Montant net » attendu 665673.83 €, obtenu % €.', v_net; end if;
  if v_brut <> 880719.93  then raise exception '« Montant brut » attendu 880719.93 € (872222.20 du fichier + 8497.73 préservés), obtenu % €.', v_brut; end if;
  if v_cip  <> 66126.72   then raise exception 'CIP attendue 66126.72 €, obtenue % €.', v_cip; end if;
  if v_ca   <> 806095.53  then raise exception 'Chiffre d''affaires attendu 806095.53 €, obtenu % €.', v_ca; end if;
  if hors > 0             then raise exception '% recommandation(s) hors périmètre modifiée(s) — anomalie grave.', hors; end if;

  raise notice 'Import Salesforce 2026 : 266 recommandations, Montant total % €.', v_montant;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Les acceptées 2025 et 2026 réunies.
--   select extract(year from date_cloture)::int as annee, count(*),
--          count(marge_nette_coeff) as avec_montant, round(sum(marge_nette_coeff),2) as montant
--   from recommandations where actif and finalite_cloture = 'ACCEPTEE' and date_cloture is not null
--   group by 1 order by 1;   -- attendu : 2025 → 459 / 1038667.57 ; 2026 → 270 / 695024.09 + les 4 déjà chiffrées
--
--   -- Revenir en arrière : sauvegarde_montants_avant_import_sf_2026.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
