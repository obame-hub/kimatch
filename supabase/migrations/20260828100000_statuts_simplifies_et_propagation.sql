-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES QUATRE JEUX DE STATUTS, SIMPLIFIÉS — ET LEUR PROPAGATION AUTOMATIQUE
--
-- Michel, appels du 28/08/2026 puis document « Vue globale des statuts ». Le point de départ :
-- « Je m'embrouille avec les recommandations et les versions. Et si je m'embrouille, à mon avis les
-- commerciaux vont beaucoup s'embrouiller. »
--
-- Et le constat qui commande tout le reste : « Sur quoi on travaille, c'est les versions, ce n'est
-- pas les recommandations. » La recommandation est un DOSSIER qui porte plusieurs versions — il la
-- garde pour pouvoir montrer au client l'évolution des études successives. Ce qui bouge, ce qu'on
-- suit, ce qu'on affiche, c'est la VERSION.
--
-- ══ CE QUI CHANGE, EN QUATRE JEUX ══
--
--   RECOMMANDATION   8 étapes → 4 statuts, et ils ne se saisissent plus : ils se DÉDUISENT
--   VERSION          4 statuts + un RÉSULTAT séparé quand elle est clôturée
--   CONSULTATION     6 statuts utilisés → 4
--   OFFRE            4 statuts → 3
--
-- ══ POURQUOI DES DÉCLENCHEURS EN BASE, ET NON DU CODE DANS L'APPLICATION ══
--
-- Naoëlle, 28/08 : « il faut que chacun des statuts corresponde et fasse bouger le statut de l'autre
-- objet, comme dans le tableau ; je ne veux pas qu'on ait des erreurs dessus encore et encore. »
--
-- Une propagation écrite dans l'application ne tient que sur les chemins qu'on a pensés. Or les
-- statuts de cette base sont écrits depuis au moins quatre endroits : les écrans, les migrations, le
-- webhook DocuSign, et demain l'agent. Chaque chemin oublié produit exactement le désordre qu'on
-- corrige aujourd'hui — un statut vrai d'un côté, faux de l'autre, sans que personne sache lequel
-- croire.
--
-- En base, la règle s'applique quelle que soit l'origine de l'écriture. Elle ne se contourne pas.
--
-- ══ CE QUI RESTE HUMAIN, ET POURQUOI ══
--
-- Deux transitions de version ne se déduisent d'aucune donnée :
--
--   → DISPONIBLE   demande « au moins une offre Disponible ET le comparatif finalisé ». Le document
--                  insiste : « La présence d'une offre disponible ne doit pas faire passer
--                  automatiquement la version à Disponible : le comparatif doit également avoir été
--                  vérifié et finalisé. » Vérifier un comparatif est un acte, pas un état.
--   → EN DÉCISION  demande que la version ait été présentée au client. Rien en base ne le sait.
--
-- Le déclencheur ne les force donc pas. Il pose en revanche le GARDE-FOU inverse, lui parfaitement
-- déductible : si plus aucune offre n'est Disponible, une version « Disponible » retombe en
-- construction. Sans quoi on présenterait un comparatif vide.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. LES TABLES DE RÉFÉRENCE
--
-- Les anciens codes sont DÉSACTIVÉS et non supprimés : ils sont référencés par des milliers de
-- lignes historiques et par la table d'audit. Les effacer romprait les clés étrangères et ferait
-- perdre la trace de ce qu'un dossier a été. `actif = false` les retire des listes déroulantes sans
-- réécrire le passé.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── RECOMMANDATION : Brouillon · Active · À réactiver · Clôturée ──
insert into public.etapes_recommandation (code, libelle, ordre, actif) values
  ('BROUILLON',    'Brouillon',    10, true),
  ('ACTIVE',       'Active',       20, true),
  ('A_REACTIVER',  'À réactiver',  30, true),
  ('CLOTUREE',     'Clôturée',     40, true)
on conflict (code) do update
  set libelle = excluded.libelle, ordre = excluded.ordre, actif = true;

-- ── VERSION : En construction · Disponible · En décision · Clôturée ──
insert into public.statuts_versions_recommandation (code, libelle, ordre, actif) values
  ('EN_CONSTRUCTION', 'En construction', 10, true),
  ('DISPONIBLE',      'Disponible',      20, true),
  ('EN_DECISION',     'En décision',     30, true),
  ('CLOTUREE',        'Clôturée',        40, true)
on conflict (code) do update
  set libelle = excluded.libelle, ordre = excluded.ordre, actif = true;

-- ── CONSULTATION : Demande envoyée · Demande acceptée · Demande refusée ──
--
-- « Aucun traitement » n'est PAS une ligne de cette table : c'est l'ABSENCE de tout événement de
-- suivi sur la consultation. Le créer comme statut obligerait à écrire une ligne pour dire qu'il ne
-- s'est rien passé — et à la maintenir en cohérence avec le fait qu'il ne s'est rien passé.
insert into public.statuts_consultations_fournisseurs (code, libelle, ordre, actif) values
  ('ENVOYEE',  'Demande envoyée',  10, true),
  ('ACCEPTEE', 'Demande acceptée', 20, true),
  ('REFUSEE',  'Demande refusée',  30, true)
on conflict (code) do update
  set libelle = excluded.libelle, ordre = excluded.ordre, actif = true;

-- ══ 2. LE RÉSULTAT D'UNE VERSION CLÔTURÉE ══
--
-- Le tableau de Michel met « Clôturée » en STATUT, et Acceptée / Refusée / Expirée en RÉSULTAT.
-- Ce sont deux questions distinctes : « où en est cette version ? » et « comment s'est-elle
-- terminée ? ». Les fondre en six statuts obligerait chaque écran qui demande « est-ce fini ? » à
-- énumérer trois codes, et le jour où un quatrième résultat apparaît, à tous les retrouver.
--
-- Le pendant existe déjà côté dossier : `recommandations.finalite_cloture`.
alter table public.versions_recommandation
  add column if not exists resultat text
  check (resultat is null or resultat in ('ACCEPTEE', 'REFUSEE', 'EXPIREE'));

comment on column public.versions_recommandation.resultat is
  'Comment la version s''est terminée : ACCEPTEE, REFUSEE ou EXPIREE. Renseigné uniquement quand le statut est CLOTUREE (Michel, 28/08/2026).';

commit;
