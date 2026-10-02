-- ══ UNE GRILLE TURPE PORTE SON FICHIER, ET PLUS DE CARD — William, 02/10/2026 ══
-- « Il faudrait pour chaque version me permettre de joindre un fichier (celui venant d'Enedis) » et
-- « ne propose pas les contrats CARD, supprime les colonnes en question ».

-- 1. Un document peut se ranger sur une grille TURPE.
alter table public.documents drop constraint documents_entite_type_check;
alter table public.documents add constraint documents_entite_type_check check (entite_type = any (array[
  'site', 'compte', 'contact', 'mandat', 'recommandation', 'version_recommandation', 'contrat', 'offre_fournisseur',
  'consultation_fournisseur', 'compteur', 'opportunite', 'piste', 'requete', 'remuneration', 'version_turpe']));

-- 2. Gestion et comptage : le contrat unique seulement. Les lignes CARD, toutes vides, disparaissent.
delete from public.composantes_fixes_turpe where cadre = 'CARD' and cg_annuel is null and cc_annuel is null;
alter table public.composantes_fixes_turpe drop constraint composantes_fixes_turpe_cadre_check;
alter table public.composantes_fixes_turpe add constraint composantes_fixes_turpe_cadre_check check (cadre = 'CONTRAT_UNIQUE');
