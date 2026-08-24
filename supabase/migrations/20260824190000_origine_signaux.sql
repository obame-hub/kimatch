-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- L'ORIGINE D'UN SIGNAL, ET DE QUOI GÉNÉRER SANS DOUBLONNER
--
-- Michel, 24/08/2026 : le signal est automatique, l'opportunité est 100 % humaine. Aujourd'hui rien
-- dans la table ne permet de faire la différence : les 864 signaux se ressemblent tous, et ils
-- viennent en fait de la reprise Salesforce — ni d'une main, ni d'une règle.
--
-- Vérifié avant d'écrire : `signaux` porte site_id, contrat_id, compteur_id, recommandation_id,
-- type_signal_id, statut_id — mais aucune trace de provenance. Et `opportunites` porte déjà
-- `contact_id` et `signal_id`, donc le minimum de Michel — un signal et un contact — n'a besoin
-- d'aucune colonne supplémentaire.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. La provenance ────────────────────────────────────────────────────────────────────────────
-- TROIS VALEURS ET NON DEUX. « Manuel » et « automatique » ne suffisent pas à décrire l'existant :
-- les 864 signaux en base ne sont ni l'un ni l'autre, ils ont été importés. Les ranger d'office dans
-- « manuel » serait écrire une contre-vérité dans la base, et le premier rapport qui compte les
-- signaux saisis par les conseillers serait faux de 864.
alter table signaux add column if not exists origine text not null default 'MANUEL';

do $
begin
  if not exists (select 1 from pg_constraint where conname = 'signaux_origine_check') then
    alter table signaux add constraint signaux_origine_check
      check (origine in ('MANUEL', 'AUTOMATIQUE', 'IMPORT'));
  end if;
end $;

-- Les signaux presents avant cette migration viennent tous de la reprise Salesforce.
update signaux set origine = 'IMPORT'
where origine = 'MANUEL' and date_creation < '2026-08-24 19:00:00+02';

-- ── 2. L'idempotence de la generation ───────────────────────────────────────────────────────────
-- LE GENERATEUR TOURNERA CHAQUE NUIT. Sans clé, il recréerait le même signal à chaque passage :
-- 881 compteurs arrivent à échéance dans les 6 mois, soit 881 doublons par nuit. La clé porte ce qui
-- justifie le signal — le compteur et l'échéance qui l'a déclenché — donc un même fait ne peut
-- produire qu'une ligne, et une échéance repoussée en produit légitimement une nouvelle.
alter table signaux add column if not exists cle_generation text;

-- Index partiel : la contrainte ne s'applique qu'aux signaux générés, les autres gardent une clé nulle.
create unique index if not exists signaux_cle_generation_unique
  on signaux (cle_generation) where cle_generation is not null;

comment on column signaux.origine is
  'MANUEL (saisi dans Kimatch), AUTOMATIQUE (produit par une regle), IMPORT (reprise Salesforce).';
comment on column signaux.cle_generation is
  'Cle deterministe du fait qui a produit le signal, p. ex. ECHEANCE:<compteur_id>:<date>. Unique, nulle pour les signaux non generes.';
