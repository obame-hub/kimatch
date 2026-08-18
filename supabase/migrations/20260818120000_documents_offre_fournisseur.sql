-- Permettre d'attacher un fichier à une OFFRE fournisseur.
--
-- DEMANDE DE LA RÉUNION DU 17/08/2026 (23:01) : « Tu auras un champ dans offre fournisseur qui va
-- apparaître avec le fichier — un champ fichier où Erwan va venir saisir le fichier qu'il a reçu de
-- Gaz Européen sur l'offre acceptée. »
--
-- Le fichier appartient à L'OFFRE et non à la version : un fournisseur consulté sur 24 et 36 mois
-- envoie une grille par durée, et c'est l'offre acceptée qui porte la sienne. Rattacher ces PDF à la
-- version les mélangerait tous, sans savoir lequel répond à quoi.
--
-- CE QUI BLOQUAIT. `documents.entite_type` porte une contrainte CHECK fermée :
--
--     CHECK (entite_type = ANY (ARRAY['site','compte','mandat','recommandation',
--                                     'version_recommandation','contrat']))
--
-- Un dépôt sur une offre partait donc en violation 23514. La contrainte est fermée volontairement —
-- c'est elle qui empêche les fautes de frappe de créer des rattachements fantômes — donc on
-- l'ÉTEND, on ne la supprime pas.
--
-- Les 6468 documents existants (mandat 3563, contrat 2877, recommandation 22, site 2) ne sont pas
-- touchés : la nouvelle valeur s'ajoute à celles qu'ils utilisent déjà.

begin;

alter table public.documents drop constraint if exists documents_entite_type_check;

alter table public.documents
  add constraint documents_entite_type_check
  check (entite_type = any (array[
    'site', 'compte', 'mandat', 'recommandation', 'version_recommandation', 'contrat',
    -- Nouveau : la grille de prix reçue d'un fournisseur, sur l'offre qu'elle chiffre.
    'offre_fournisseur'
  ]));

commit;

-- Vérification après application (à coller tel quel) :
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'documents_entite_type_check';
--   -- attendu : la liste des 7 valeurs, dont 'offre_fournisseur'
--
--   select entite_type, count(*) from public.documents group by 1 order by 2 desc;
--   -- attendu : mandat 3563, contrat 2877, recommandation 22, site 2 — inchangés
--
-- NOTE. Cette contrainte devra encore être étendue le jour où l'on rattachera des fichiers à un
-- compteur ou à un contact. C'est le prix d'une liste fermée, et il vaut mieux le payer à chaque
-- ajout que d'accepter n'importe quelle chaîne dans cette colonne.
