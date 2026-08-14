-- ============================================================================================
-- Ménage : mandats de test et doublons de saisie
-- ============================================================================================
-- Deux jours de mise au point de la chaîne DocuSign ont laissé des mandats sans valeur métier.
-- Validé par Naoëlle.
--
-- 1. KIWEE ENERGIE FRANCE est le compte interne de la société, celui sur lequel l'équipe essaie la
--    signature. Quatorze mandats y ont été créés les 13 et 14/08/2026 par Naoëlle, William et
--    Marie. Tous sont restés « À préparer » : aucun n'a été signé, aucun ne couvre un vrai client.
--
-- 2. CABINET ROUMILHAC JOURDAN porte deux tentatives de Marie du 13/08 (12:47 et 12:48), doublons
--    de la troisième qui est devenue le mandat 001745. Elles datent du moment où DocuSign échouait :
--    le mandat était enregistré, puis l'ouverture de la signature plantait, d'où la ressaisie.
--
-- Ne sont PAS touchés : tout mandat signé, actif ou expiré, et le mandat de CABINET MOLINIER qui
-- vient de passer à « Signé ». La condition porte sur le statut, pas sur une liste d'identifiants,
-- pour qu'un mandat qui aurait avancé entre-temps soit épargné.
-- ============================================================================================

begin;

create temporary table mandats_a_supprimer on commit drop as
select m.id
  from public.mandats m
  join public.comptes c on c.id = m.compte_id
  left join public.statuts_mandats sm on sm.id = m.statut_id
 where coalesce(sm.code, 'A_PREPARER') = 'A_PREPARER'
   and m.date_signature is null
   and (
     (c.nom = 'KIWEE ENERGIE FRANCE' and m.date_creation >= '2026-08-13')
     or m.id in ('4401c5b5-ae1e-4896-88dd-8354fa078121', '555a7193-1a2e-49d1-be6a-bc19bc67ce5e')
   );

delete from public.documents
 where entite_type = 'mandat' and entite_id in (select id from mandats_a_supprimer);
delete from public.mandats_compteurs where mandat_id in (select id from mandats_a_supprimer);
delete from public.mandats_courtiers where mandat_id in (select id from mandats_a_supprimer);
delete from public.mandats where id in (select id from mandats_a_supprimer);

commit;

-- Contrôle : il ne doit plus rester que des mandats réels sur ces deux comptes.
--   select c.nom, sm.libelle, count(*)
--     from public.mandats m
--     join public.comptes c on c.id = m.compte_id
--     left join public.statuts_mandats sm on sm.id = m.statut_id
--    where c.nom in ('KIWEE ENERGIE FRANCE', 'CABINET ROUMILHAC JOURDAN')
--    group by 1, 2 order by 1, 2;
