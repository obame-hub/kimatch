-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES MONTANTS SALESFORCE REJOIGNENT LEURS RECOMMANDATIONS
--
-- William, 09-10/09/2026, en clôturant le chantier de l'écart de 137 038 € : neuf champs de
-- l'opportunité Salesforce sont recopiés sur la recommandation Kimatch correspondante.
--
--   Facturation_fournisseur__c          → marge_brute               (Montant brut)
--   Remuneration_partenaire__c          → commission_intermediaire  (CIP)
--   Montant__c                          → chiffre_affaires          (Chiffre d'affaires)
--   R_mun_ration_ap__c                  → marge_apporteur           (CAA)
--   Montant_commission_nette_kiwee__c   → marge_nette               (Montant net)
--   Montant_commission_interne__c       → marge_nette_coeff         (Montant)
--   Budget_ancienne_offre__c            → budget_ancienne_offre
--   Budget_nouvelle_offre__c            → budget_nouvelle_offre
--   Difference_budgetaire__c            → difference_budgetaire
--
-- ── LE PÉRIMÈTRE EST PORTÉ PAR LA JOINTURE, PAS PAR UN COMMENTAIRE ──
--
-- William, deux fois plutôt qu'une : « uniquement pour les opportunités importées depuis Salesforce,
-- pas celles créées depuis Kimatch » et « qui avaient (sur Salesforce) le StageName = Closed Won
-- uniquement !! ». Ces deux contraintes ne sont pas vérifiées après coup, elles sont STRUCTURELLES :
--
--   · `import_sf_montants` ne contient que du « Closed Won » — 459 lignes, contrôlé à l'insertion ;
--   · la jointure exige un `id_salesforce`, qu'une recommandation née dans Kimatch n'a jamais.
--
-- Une recommandation hors périmètre est donc hors d'atteinte de cet UPDATE, quoi qu'il arrive.
--
-- ── LES IDENTIFIANTS N'ONT PAS LA MÊME LONGUEUR DES DEUX CÔTÉS ──
--
-- L'export rend l'identifiant à 15 caractères, Kimatch stocke celui à 18. Les trois derniers ne sont
-- qu'une somme de contrôle ajoutée par Salesforce : les 15 premiers SONT l'identifiant. D'où le
-- `left(id_salesforce, 15)`. Résultat du rapprochement : 459 sur 459, zéro orpheline, zéro doublon.
--
-- ── AUCUNE VALEUR N'EST REMPLACÉE PAR DU VIDE ──
--
-- Deux opportunités n'ont pas de facturation fournisseur côté Salesforce (RENOU 828,00 €,
-- CAPTA 350,00 €) alors que Kimatch en porte une. Écrire le vide effacerait le seul montant connu.
-- `coalesce(export, existant)` garde donc ce qui est déjà là quand l'export n'apporte rien. Cette
-- règle vaut pour les neuf champs, pas seulement pour ces deux lignes.
--
-- ── CE QUE CET UPDATE CORRIGE VRAIMENT ──
--
-- Sept champs sur neuf ne font que remplir des vides. Deux écrasent des valeurs existantes, et la
-- raison est la même dans les deux cas : L'IMPORT D'ORIGINE S'EST TROMPÉ DE COLONNE.
--
-- Sur les 434 recommandations qui portaient un montant brut, `marge_brute` valait le CHIFFRE
-- D'AFFAIRES (`Montant__c`) et jamais la facturation fournisseur — 434 fois sur 434, et 100 fois sur
-- 100 parmi celles qui ont une commission d'intermédiaire. Ce n'est pas un arrondi, c'est un mauvais
-- champ recopié en août 2026. La correction rend 91 067,04 € de montant brut.
--
-- Sur le « Montant », 83 écrasements pour 803,16 € au total : 36 sous l'euro (Salesforce arrondit
-- parfois à l'euro), 47 au-delà, dont 18 où Kimatch tenait la commission nette à la place.
--
-- ── LA MARGE NETTE VIENT DU FICHIER, PAS D'UN RECALCUL ──
--
-- L'ancienne règle de Michel — nette = brute − apporteur — ignorait la commission d'intermédiaire,
-- qui n'existait nulle part. Maintenant qu'elle est renseignée, la cascade dirait
-- brute − CIP − apporteur. William, 10/09/2026, a tranché : on écrit la valeur Salesforce. Le
-- fichier fait foi, et les deux coïncident déjà au centime sur le total (1 005 178,33 €).
--
-- ── UN TRIGGER RÉÉCRIVAIT LES DEUX DERNIERS MONTANTS DERRIÈRE NOUS ──
--
-- Première tentative, 10/09/2026 : le garde-fou a rejeté la transaction. Le « Montant » total
-- donnait 1 170 749,23 € au lieu des 1 038 667,57 € du fichier. Rien n'a été écrit.
--
-- La cause est `trg_calculer_marges`, déclenché AVANT tout UPDATE de `marge_brute` ou
-- `marge_apporteur`, qui écrase les deux montants suivants :
--
--     marge_nette       := marge_brute − marge_apporteur
--     marge_nette_coeff := marge_nette × comptes.taux_commission_courtier
--
-- Il ignore la commission d'intermédiaire — elle n'existait pas quand il a été écrit — et il ignore
-- ce que le fichier Salesforce dit. Recopier les valeurs de Salesforce sans le neutraliser aurait
-- donc écrit six champs justes et deux champs recalculés par-dessus, en silence.
--
-- ON LE DÉSACTIVE POUR LA DURÉE DE LA TRANSACTION, PAS AU-DELÀ. La désactivation est elle-même
-- transactionnelle : si quoi que ce soit échoue plus bas, le trigger revient avec le reste. William
-- a tranché le 10/09/2026 — « le fichier fait foi » — et un trigger qui recalcule par-dessus une
-- source de vérité n'est pas un garde-fou, c'est un troisième avis.
--
-- CE TRIGGER RESTE UN PROBLÈME APRÈS CETTE MIGRATION, et il est signalé comme tel : au prochain
-- enregistrement d'un montant brut depuis la fiche, il réécrira les deux mêmes champs avec l'ancien
-- modèle, et les valeurs Salesforce seront reperdues. `taux_commission_courtier` vaut 1,133333 sur
-- six fournisseurs — soit 0,85 / 0,75, exactement le ratio observé entre le « Montant » et le
-- « Montant net » sur 139 recommandations. Son sort se décide à part.
--
-- ── LA SAUVEGARDE N'EST PAS UNE PRÉCAUTION DE STYLE ──
--
-- 459 lignes de montants réels sont réécrites. `sauvegarde_montants_avant_import_sf` garde l'état
-- exact d'avant, recommandation par recommandation : sans elle, un mapping mal compris serait
-- irréversible. Elle se supprime en même temps que la table de transit, une fois les chiffres
-- contrôlés à l'écran.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. L'état d'avant, gardé tel quel ──
drop table if exists sauvegarde_montants_avant_import_sf;

create table sauvegarde_montants_avant_import_sf as
select r.id, r.id_salesforce, r.nom,
       r.marge_brute, r.commission_intermediaire, r.chiffre_affaires, r.marge_apporteur,
       r.marge_nette, r.marge_nette_coeff,
       r.budget_ancienne_offre, r.budget_nouvelle_offre, r.difference_budgetaire,
       now() as date_sauvegarde
from recommandations r
join import_sf_montants i on left(r.id_salesforce, 15) = i.id15
where r.actif;

comment on table sauvegarde_montants_avant_import_sf is
  'État des neuf montants des 459 recommandations AVANT l''import Salesforce du 10/09/2026. Filet de sécurité — à supprimer avec import_sf_montants une fois les chiffres contrôlés.';

do $$
declare n int;
begin
  select count(*) into n from sauvegarde_montants_avant_import_sf;
  if n <> 459 then
    raise exception 'Sauvegarde incomplète : % ligne(s) au lieu de 459. Rien n''est écrit.', n;
  end if;
end $$;

-- ── 2. Le trigger se tait, le temps de la transaction ──
alter table recommandations disable trigger trg_calculer_marges;

-- ── 3. Les neuf champs ──
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
from import_sf_montants i
where left(r.id_salesforce, 15) = i.id15
  and r.actif
  and r.id_salesforce is not null      -- redondant avec la jointure, et c'est voulu : la contrainte
  and i.stage_name = 'Closed Won';     -- de William doit se lire ici, pas seulement dans l'en-tête.

alter table recommandations enable trigger trg_calculer_marges;

-- ── 4. Les garde-fous ──
do $$
declare
  n_touchees   int;
  total_montant numeric;
  total_net    numeric;
  total_brut   numeric;
  n_hors_perimetre int;
begin
  select count(*) into n_touchees
  from recommandations r join import_sf_montants i on left(r.id_salesforce,15) = i.id15
  where r.actif;

  select round(sum(r.marge_nette_coeff), 2), round(sum(r.marge_nette), 2), round(sum(r.marge_brute), 2)
    into total_montant, total_net, total_brut
  from recommandations r join import_sf_montants i on left(r.id_salesforce,15) = i.id15
  where r.actif;

  -- Aucune recommandation née dans Kimatch n'a pu bouger : elles n'ont pas d'id_salesforce.
  select count(*) into n_hors_perimetre
  from recommandations where actif and id_salesforce is null and date_modification > now() - interval '2 minutes';

  if n_touchees <> 459 then
    raise exception 'Attendu 459 recommandations dans le périmètre, trouvé %.', n_touchees;
  end if;
  if total_montant <> 1038667.57 then
    raise exception 'Total « Montant » attendu 1038667.57 €, obtenu % €.', total_montant;
  end if;
  if total_net <> 1005178.33 then
    raise exception 'Total « Montant net » attendu 1005178.33 €, obtenu % €.', total_net;
  end if;
  -- 1 268 135,13 € du fichier + 1 178,00 € préservés sur les deux lignes sans facturation
  -- (RENOU 828,00 € et CAPTA 350,00 €) : le total attendu n'est PAS celui du CSV, et c'est le signe
  -- que le coalesce a fait son travail. Premier essai du 10/09 : l'attendu était faux, pas la donnée.
  if total_brut <> 1269313.13 then
    raise exception 'Total « Montant brut » attendu 1269313.13 €, obtenu % €.', total_brut;
  end if;
  if n_hors_perimetre > 0 then
    raise exception '% recommandation(s) hors périmètre modifiée(s) — anomalie grave.', n_hors_perimetre;
  end if;

  raise notice 'Import Salesforce : 459 recommandations, Montant total % €.', total_montant;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Les neuf totaux doivent égaler ceux du CSV, au centime.
--   select round(sum(marge_brute),2), round(sum(commission_intermediaire),2),
--          round(sum(chiffre_affaires),2), round(sum(marge_apporteur),2),
--          round(sum(marge_nette),2), round(sum(marge_nette_coeff),2)
--   from recommandations r join import_sf_montants i on left(r.id_salesforce,15) = i.id15
--   where r.actif;
--
--   -- Revenir en arrière, si besoin :
--   -- update recommandations r set marge_brute = s.marge_brute, ... from
--   --   sauvegarde_montants_avant_import_sf s where s.id = r.id;
-- ════════════════════════════════════════════════════════════════════════════════════════════════
