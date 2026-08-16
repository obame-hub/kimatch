-- Clôture d'une recommandation — le motif obligatoire et la date de réactivation.
--
-- La maquette « Fiche Opportunité » de William impose trois règles au moment de clôturer :
--   1. choisir une qualification finale (« Choisissez une qualification finale ») ;
--   2. saisir un motif — « Le motif est obligatoire », le bouton reste inactif sans lui ;
--   3. si la finalité est un report, saisir une date de réactivation — « La date de
--      réactivation est obligatoire ».
--
-- Kimatch sait déjà stocker la finalité (`finalite_cloture`) et la date de clôture. Il ne sait
-- stocker NI le motif NI la date de réactivation : aujourd'hui, on ferme une recommandation sans
-- que personne ne puisse savoir pourquoi, et une affaire « à reprendre en janvier » n'a aucune
-- date qui la fasse revenir. Ces deux colonnes manquaient, elles sont ajoutées ici.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS, VOLONTAIREMENT.
-- La maquette propose cinq finalités : Convertie, Non qualifiée, Perdue, Reportée, Annulée.
-- La base en utilise trois, sur 1573 lignes : ACCEPTEE (867), EXPIREE (386), REFUSEE (320).
-- Les deux vocabulaires ne se recouvrent pas — « Convertie » n'est pas « ACCEPTEE », et ni
-- « Reportée » ni « Annulée » n'ont d'équivalent. Remapper reviendrait à réécrire le sens de
-- 1573 recommandations closes sur une hypothèse. C'est une décision métier : elle est portée au
-- document POINTS-A-ARBITRER (point 10) et rien n'est touché ici.
--
-- Les deux colonnes sont nullables : les 1573 lignes déjà closes n'ont pas de motif rétroactif,
-- et leur en inventer un serait pire que de laisser vide.

begin;

alter table public.recommandations
  add column if not exists motif_cloture text,
  add column if not exists date_reactivation date;

comment on column public.recommandations.motif_cloture is
  'Pourquoi la recommandation a été close. Obligatoire à la saisie côté application ; NULL sur les lignes closes avant le 16/08/2026, faute de donnée rétroactive.';
comment on column public.recommandations.date_reactivation is
  'Date à laquelle une recommandation reportée doit revenir dans le flux. Obligatoire quand la finalité est un report.';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'recommandations'
--     and column_name in ('motif_cloture', 'date_reactivation')
--   order by column_name;
--   -- attendu : 2 lignes, date_reactivation = date, motif_cloture = text, is_nullable = YES
--
--   select coalesce(finalite_cloture,'(null)') f, count(*) n
--   from public.recommandations group by 1 order by n desc;
--   -- attendu : inchangé — ACCEPTEE 867, EXPIREE 386, REFUSEE 320, (null) 130
