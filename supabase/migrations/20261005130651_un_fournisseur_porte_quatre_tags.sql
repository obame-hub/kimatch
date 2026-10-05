-- ══ QUATRE TAGS PAR FOURNISSEUR — William, 05/10/2026 ══
-- Les fiches fournisseurs remises le 05/10/2026 portent quatre tags chacune, et la page 3 de la
-- proposition commerciale en affiche jusqu'à quatre (modèle de Claude Design). La fiche en acceptait
-- trois : elle passe à quatre.
alter table public.comptes_fournisseurs drop constraint if exists comptes_fournisseurs_tags_check;
alter table public.comptes_fournisseurs add constraint comptes_fournisseurs_tags_check check (cardinality(tags) <= 4);
