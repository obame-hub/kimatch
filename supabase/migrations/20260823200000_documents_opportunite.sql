-- Les fichiers d'une opportunité.
--
-- LA TABLE `documents` EST DÉJÀ GÉNÉRIQUE — `entite_type` + `entite_id` — mais une contrainte CHECK
-- énumère les types autorisés, et `opportunite` n'y était pas. L'onglet Fichiers de la fiche
-- opportunité affichait donc un message d'attente alors que tout le mécanisme existait.
--
-- C'EST EXACTEMENT LE BLOCAGE D'AGATHE, du 21/08/2026 : elle ne pouvait pas joindre un fichier à un
-- compteur, et la cause était la même contrainte, à laquelle `compteur` manquait. Une contrainte
-- CHECK qui énumère des valeurs se paie à chaque nouvel objet : on ajoute donc aussi les trois
-- objets de la chaîne qui vont en avoir besoin (piste, requête, rémunération) plutôt que de revenir
-- ici trois fois.
--
-- POURQUOI GARDER LA CONTRAINTE. Elle empêche un `entite_type` mal orthographié de créer une
-- famille de documents fantôme, invisible partout. Le coût est cette migration ; le bénéfice est
-- qu'aucun fichier ne se perd dans une catégorie que personne n'affiche.

begin;

alter table public.documents drop constraint if exists documents_entite_type_check;
alter table public.documents add constraint documents_entite_type_check
  check (entite_type = any (array[
    'site', 'compte', 'mandat', 'recommandation', 'version_recommandation',
    'contrat', 'offre_fournisseur', 'compteur',
    'opportunite', 'piste', 'requete', 'remuneration'
  ]));

commit;
