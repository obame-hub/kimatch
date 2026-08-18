-- Suivi des demandes de cotation : les deux statuts qui manquaient.
--
-- RÉUNION DU 17/08/2026 (Naoëlle / Michel, revue de la fiche Recommandation). Le suivi d'une demande
-- de cotation se lit à DEUX étages, et la table de référence n'en couvrait qu'un :
--
--   · l'OFFRE (une durée × un type de prix) : le fournisseur accepte-t-il de coter celle-là ?
--     -> acceptée | refusée, puis reçue.
--   · le FOURNISSEUR CONSULTÉ : où en est la demande, qui porte sur toutes ses offres à la fois ?
--     « Tu ne fais pas une demande que sur 24 mois, tu fais toujours la demande sur les 24 et 36. »
--     -> demande envoyée -> accusé de réception -> acceptée | acceptée partiellement | refusée
--        -> offre reçue.
--
-- Manquaient exactement `ACCEPTEE` et `ACCEPTEE_PARTIELLEMENT`. « Acceptée partiellement » est le
-- statut le plus utile des deux : il dit au commercial, sans qu'il ouvre chaque offre, qu'entre 24 et
-- 36 mois l'une a été refusée — ou que tout a été refusé mais qu'une alternative a été proposée
-- (le fournisseur ne fait pas 36 mois mais propose 30).
--
-- L'ORDRE EST RENUMÉROTÉ pour suivre le circuit réel. `ordre` ne pilote que l'affichage (listes
-- déroulantes, tri) : renuméroter six lignes de référence ne touche aucune donnée métier, et sans ça
-- « Acceptée » apparaîtrait après « Offre reçue » dans les menus, ce qui se lit à l'envers.
--
-- `RECUE` est renommée « Offre reçue » au lieu de « Réponse reçue » : c'est le mot employé en réunion,
-- et il est plus juste — ce qu'on attend du fournisseur est une offre, pas une réponse. Le code ne
-- change pas, donc les 1464 suivis qui la portent ne sont pas touchés.

begin;

insert into public.statuts_consultations_fournisseurs (code, libelle, ordre) values
  ('ACCEPTEE',               'Acceptée',               5),
  ('ACCEPTEE_PARTIELLEMENT', 'Acceptée partiellement', 6)
on conflict (code) do nothing;

update public.statuts_consultations_fournisseurs set ordre = 1 where code = 'ENVOYEE';
update public.statuts_consultations_fournisseurs set ordre = 2 where code = 'ACCUSE_RECEPTION';
update public.statuts_consultations_fournisseurs set ordre = 3 where code = 'RELANCEE';
update public.statuts_consultations_fournisseurs set ordre = 4 where code = 'INFO_COMPLEMENTAIRE_DEMANDEE';
update public.statuts_consultations_fournisseurs set ordre = 5 where code = 'ACCEPTEE';
update public.statuts_consultations_fournisseurs set ordre = 6 where code = 'ACCEPTEE_PARTIELLEMENT';
update public.statuts_consultations_fournisseurs set ordre = 7, libelle = 'Offre reçue' where code = 'RECUE';
update public.statuts_consultations_fournisseurs set ordre = 8 where code = 'REFUSEE';

-- ── Les offres déjà créées portent l'ancien code ───────────────────────────────────────────────
-- 12 offres ont été créées le 18/08/2026 au matin (démo de la réunion, recommandation
-- ACL-IMMO - SDC LES ALLOBROGES, versions 2 et 3) avec `statut = 'ENVOYEE'` — le vocabulaire d'avant,
-- où l'offre portait le statut de la demande. Dans le nouveau modèle, « demande envoyée » appartient
-- au fournisseur consulté et l'offre attend de savoir si ce fournisseur accepte de coter sa durée :
-- c'est le même fait, sous le bon nom.
--
-- Sans cette mise à jour, le sélecteur de statut de l'écran ne trouverait pas 'ENVOYEE' parmi ses
-- options et afficherait ces offres comme si elles étaient en attente, sans que la base le dise.
-- Les offres déjà passées à 'REFUSEE' ne sont pas touchées : ce code existe dans les deux
-- vocabulaires et veut dire la même chose.

update public.offres_fournisseurs set statut = 'EN_ATTENTE' where statut = 'ENVOYEE';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select code, libelle, ordre from public.statuts_consultations_fournisseurs order by ordre;
--   -- attendu : 8 lignes, de « Demande envoyée » à « Refusée », avec Acceptée en 5 et
--   --           Acceptée partiellement en 6
--
--   select statut, count(*) from public.offres_fournisseurs group by 1 order by 2 desc;
--   -- attendu : plus aucune ligne en 'ENVOYEE' (11 passent en 'EN_ATTENTE', 1 reste 'REFUSEE')
--
--   select count(*) from public.suivis_consultations_fournisseurs;
--   -- attendu : 5397, inchangé (aucun suivi réécrit)
--
-- À NOTER, non traité ici : `offres_fournisseurs.statut` a pour valeur par défaut 'RECUE', ce qui
-- ferait naître une offre déjà « reçue ». L'application ne s'appuie pas sur ce défaut — elle écrit
-- toujours le statut explicitement — donc changer le défaut attendra une migration où il sera le
-- sujet, plutôt que d'être glissé dans celle-ci.
