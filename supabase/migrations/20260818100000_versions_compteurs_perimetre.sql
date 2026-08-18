-- Rattacher leurs compteurs aux versions : sans ça, aucun prix ne peut être saisi par PDL.
--
-- CONSTAT DU 18/08/2026, en préparant la saisie des prix par compteur demandée en réunion. La chaîne
-- de saisie est :
--
--   offres_fournisseurs
--     └── offres_fournisseurs_compteurs   (une ligne par offre × point de livraison)
--           ├── offres_compteurs_electricite   (prix €/MWh par classe, puissances, TURPE)
--           └── offres_compteurs_gaz           (prix énergie, CAR, ATRD)
--
-- Le maillon du milieu porte `version_recommandation_compteur_id NOT NULL` : il ne référence pas le
-- compteur directement, mais le lien VERSION ↔ COMPTEUR (`versions_recommandation_compteurs`).
--
-- Or cette table de liaison ne couvre que **16 versions sur 2016**. Les versions créées depuis
-- l'application la remplissent bien (c'est d'où viennent ces 16), mais les 2000 versions reprises de
-- Salesforce n'ont jamais eu leurs compteurs rattachés : l'import a créé les versions et le
-- périmètre de la RECOMMANDATION (`recommandations_compteurs`, 2088 lignes), jamais le lien par
-- version.
--
-- Conséquence concrète : Erwan ne pourrait saisir un prix que sur 16 versions. Sur les 2000 autres,
-- l'écran n'aurait aucun compteur à proposer — et rien ne le dirait.
--
-- CE QUE FAIT CETTE MIGRATION. Elle recopie le périmètre de la recommandation sur chacune de ses
-- versions qui n'en a pas : 2372 lignes attendues.
--
-- POURQUOI C'EST LÉGITIME ET NON UNE INVENTION. Le périmètre est UNIQUE pour tout le dossier —
-- c'est écrit dans la maquette de William et repris dans l'onglet Périmètre : « toutes les versions
-- (V1, V2, V3…) portent sur ces mêmes points de livraison ». Recopier le périmètre du dossier sur
-- ses versions ne fait donc qu'expliciter ce qui est déjà vrai. Ce n'est pas une hypothèse sur des
-- données manquantes, c'est la règle du modèle.
--
-- CE QU'ELLE NE FAIT PAS : elle n'ajoute aucun compteur là où la recommandation n'en a pas, et elle
-- ne touche aucune version qui a déjà ses liens — une version dont le périmètre aurait été
-- volontairement restreint garde le sien.

begin;

insert into public.versions_recommandation_compteurs (version_recommandation_id, compteur_id)
select v.id, rc.compteur_id
  from public.versions_recommandation v
  join public.recommandations_compteurs rc on rc.recommandation_id = v.recommandation_id
 where not exists (
         select 1 from public.versions_recommandation_compteurs vc
          where vc.version_recommandation_id = v.id
            and vc.compteur_id = rc.compteur_id
       )
on conflict do nothing;

commit;

-- Vérification après application (à coller tel quel) :
--
--   select count(*) from public.versions_recommandation_compteurs;
--   -- attendu : 18 + 2372 = 2390
--
--   select count(*) filter (where nb > 0) avec_compteurs, count(*) filter (where nb = 0) sans_compteurs
--     from (select v.id, (select count(*) from public.versions_recommandation_compteurs vc
--                          where vc.version_recommandation_id = v.id) nb
--             from public.versions_recommandation v) x;
--   -- attendu : ~2000 avec compteurs. Les versions restantes sans compteur sont celles dont la
--   -- recommandation n'a elle-même aucun PDL — rien n'a été inventé pour elles.
--
--   select count(*) from public.recommandations_compteurs;
--   -- attendu : 2088, inchangé (cette migration lit ce périmètre, elle ne le modifie pas)
