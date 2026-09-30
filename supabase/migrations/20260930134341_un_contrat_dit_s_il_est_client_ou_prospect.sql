-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN CONTRAT DIT S'IL EST « CLIENT » OU « PROSPECT »
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Fiche compteur v4 (Claude Design, 30/09/2026) : la carte « Contrat en cours » porte une pastille
-- « Contrat client » (signé par KiWee) ou « Contrat prospect » (connu, mais signé sans nous — ses
-- conditions sont déclarées par le client et restent à vérifier sur facture).
--
-- LA NOTION N'EXISTAIT PAS. William a choisi de la créer et de la rendre modifiable, SANS la
-- déduire : un contrat issu d'une recommandation KiWee est très probablement « client », mais le
-- brief interdit la déduction, et une pastille fausse sur un document juridique vaut moins qu'une
-- pastille absente. Sans valeur, l'écran n'affiche rien.

alter table public.contrats
  add column if not exists nature_contrat text
  check (nature_contrat in ('CLIENT', 'PROSPECT'));

comment on column public.contrats.nature_contrat is
  'CLIENT = signe par KiWee ; PROSPECT = connu mais signe sans KiWee (conditions declarees). '
  'Null = non renseigne : rien ne s''affiche, rien n''est deduit.';
