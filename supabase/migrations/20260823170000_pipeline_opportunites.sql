-- Le pipeline des opportunités, tel que Michel le fixe.
--
-- MICHEL, 23/08/2026, 16 h 47 :
--
--   NOUVELLE → À QUALIFIER → À COMPLÉTER → À VALIDER → CONVERTIE
--
--   Nouvelle       Signal positif + contact valide
--   À qualifier    Compte / organisation à confirmer
--   À compléter    Site à rattacher + mandat à obtenir
--   À valider      Tout est prêt, il manque l'accord du client pour lancer la recommandation
--   Convertie      Recommandation créée
--
-- CE PIPELINE EST EXACTEMENT LA LISTE DES PRÉREQUIS, LUE COMME UNE ÉCHELLE. Chaque palier nomme ce
-- qu'il reste à réunir : le statut n'est donc pas une étiquette qu'on pose à côté des objets, c'est
-- leur état. Il se calcule (voir `statutDerive` dans `src/lib/data/opportunites.ts`) au lieu de se
-- choisir dans une liste, ce qui évite qu'il contredise la case cochée juste à côté.
--
-- LES ANCIENS CODES SONT RENOMMÉS, PAS DOUBLÉS. `statut_id` est une clé étrangère : créer cinq
-- nouvelles lignes en laissant les anciennes aurait laissé les opportunités existantes pointer vers
-- des statuts hors pipeline, et rempli les listes de choix de doublons. On renomme donc en place,
-- ce qui reclasse du même coup l'opportunité qui existe déjà.
--
-- « CLÔTURÉE » DISPARAÎT DU PIPELINE. Michel ne le mentionne pas, et pour une bonne raison : la fin
-- d'une opportunité est déjà portée par `qualification_fin` (Convertie | Non qualifiée | Perdue |
-- Reportée | Annulée). Deux endroits pour dire la même chose finissent toujours par se contredire.

begin;

-- Renommage en place des quatre paliers qui correspondent, dans l'ordre du pipeline.
update public.statuts_opportunites set code = 'A_QUALIFIER', libelle = 'À qualifier', ordre = 20
  where code = 'EN_QUALIFICATION';
update public.statuts_opportunites set code = 'A_COMPLETER', libelle = 'À compléter', ordre = 30
  where code = 'EN_ATTENTE';
update public.statuts_opportunites set code = 'A_VALIDER', libelle = 'À valider', ordre = 40
  where code = 'QUALIFIEE';
update public.statuts_opportunites set code = 'CONVERTIE', libelle = 'Convertie', ordre = 50, est_cloture = true
  where code = 'CLOTUREE';

update public.statuts_opportunites set libelle = 'Nouvelle', ordre = 10, est_cloture = false
  where code = 'NOUVELLE';

-- Filet de sécurité : si l'un des codes attendus manquait (base repartie de zéro, ou renommage déjà
-- passé), on le crée. `on conflict` rend la migration rejouable.
insert into public.statuts_opportunites (code, libelle, ordre, est_cloture) values
  ('NOUVELLE', 'Nouvelle', 10, false),
  ('A_QUALIFIER', 'À qualifier', 20, false),
  ('A_COMPLETER', 'À compléter', 30, false),
  ('A_VALIDER', 'À valider', 40, false),
  ('CONVERTIE', 'Convertie', 50, true)
on conflict (code) do update set libelle = excluded.libelle, ordre = excluded.ordre, est_cloture = excluded.est_cloture;

-- Et on retire ce qui traînerait hors pipeline, à condition que rien ne le référence : une
-- suppression aveugle casserait la clé étrangère.
delete from public.statuts_opportunites s
where s.code not in ('NOUVELLE', 'A_QUALIFIER', 'A_COMPLETER', 'A_VALIDER', 'CONVERTIE')
  and not exists (select 1 from public.opportunites o where o.statut_id = s.id);

commit;
