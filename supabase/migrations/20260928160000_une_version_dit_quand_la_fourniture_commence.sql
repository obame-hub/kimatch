-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE VERSION DIT QUAND LA FOURNITURE COMMENCE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Michel, 28/09/2026, le parcours de pricing : « Le commercial crée la version en choisissant les
-- compteurs, la date de début de fourniture et la durée. »
--
-- LES COMPTEURS ET LA DURÉE EXISTAIENT (`versions_recommandation_compteurs`,
-- `versions_recommandation_durees`). LA DATE DE DÉBUT, NON. Elle se devinait à partir de l'échéance
-- de chaque compteur, ce qui suffit à un conseiller qui connaît le dossier mais pas à un calcul : un
-- fournisseur cote une période, et sans son premier jour, « 36 mois » ne dit pas lesquels. L'API
-- Tradeo, elle, refuse tout calcul sans `dateDebut`.
--
-- UNE DATE PAR VERSION, et non par compteur : c'est la date que le commercial choisit pour la
-- proposition entière, celle qu'il demande à tous les fournisseurs. Un compteur dont l'échéance
-- tombe plus tard se règle en créant une autre version, comme aujourd'hui.
--
-- NULLABLE, sans valeur reprise : les 2 135 versions existantes n'ont jamais eu de date de début, et
-- en inventer une à partir des échéances écrirait une décision que personne n'a prise.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table versions_recommandation
  add column if not exists date_debut_fourniture date;

comment on column versions_recommandation.date_debut_fourniture is
  'Premier jour de fourniture demandé aux fournisseurs pour cette version. Avec la durée par compteur '
  '(versions_recommandation_durees), il fixe la période cotée. NULL sur les versions antérieures au '
  '28/09/2026 : jamais déduite des échéances.';

commit;
