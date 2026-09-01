-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- L'ÉNERGIE D'UN CONTRAT SUIT SES COMPTEURS
--
-- Naoëlle, 01/09/2026, capture à l'appui : « pourquoi la reco est électricité si son compteur est
-- gaz ? ». Le contrat SENAC IMMOBILIER / SDC LE BOIS CHAMPEAUX s'affiche en Électricité alors que
-- son unique compteur, GI041477, est au gaz — et que son fournisseur s'appelle GAZ EUROPEEN.
--
-- ══ LA CAUSE, DANS LE CODE ══
--
-- `ContratWizard.tsx` déduisait l'énergie du contrat de celle de la RECOMMANDATION :
--
--     reco.type_energie === 'gaz' ? 'gaz' : 'electricite'
--
-- Un ternaire à deux branches sur une valeur qui en a trois. `recommandations.type_energie_id` est
-- nul sur 1 493 des 1 703 lignes — il n'est renseigné que sur les dossiers nés dans Kimatch. Sur
-- tous les autres, « je ne sais pas » tombait dans la branche « sinon », c'est-à-dire électricité.
-- Le contrat ne se trompait donc pas au hasard : il se trompait toujours du même côté.
--
-- Corrigé dans le même commit : l'énergie vient désormais des compteurs du périmètre, qui la portent
-- tous — 7 911 sur 7 911, sans exception. Un contrat de fourniture porte sur des points de
-- livraison, et un point de livraison n'a qu'une énergie.
--
-- ══ CE QUE ÇA CASSAIT AU-DELÀ DE L'ÉTIQUETTE ══
--
-- Le formulaire propose les types de prix selon l'énergie : Fixe ou Indexé pour le gaz, Marché pour
-- l'électricité. Le contrat SENAC, gaz, s'est donc vu offrir « Marché » comme seul choix, et l'a
-- enregistré. LA MIGRATION NE LE CORRIGE PAS : « Fixe » et « Indexé » ne se déduisent pas d'une
-- table, c'est une clause commerciale. À reprendre à la main sur ce contrat-là, le seul concerné.
--
-- ══ LES SIX CONTRATS CONCERNÉS, ET POURQUOI LES COMPTEURS ONT RAISON ══
--
-- Sur 1 557 contrats rattachés à au moins un compteur, six contredisent leur périmètre :
--
--     6a197b0c  21/08/2026  Électricité  ← GI041477 gaz            SENAC IMMOBILIER · GAZ EUROPEEN
--     26f962e8  14/11/2024  Électricité  ← GI101492 gaz            SNC STOFFLET
--     73cea17d  03/10/2024  Électricité  ← 2 compteurs gaz         ASS SYNDICALE LIBRE
--     de7c27d5  04/11/2024  Électricité  ← 1 compteur gaz          SAS BRAY TRANSPORTS
--     916ca44f  16/09/2024  Gaz          ← 1 compteur électricité  SOCIETE ORFILA · TOTAL ENERGIES
--     2d86075c  09/10/2024  Gaz          ← 4 compteurs électricité LAMY · TOTAL ENERGIES
--
-- LA PREUVE NE VIENT PAS DU NUMÉRO DE POINT. Le format ne discrimine rien : 1 397 compteurs gaz
-- portent aussi un numéro à 14 chiffres. Elle vient des FICHES TECHNIQUES — chacun des dix compteurs
-- concernés a sa ligne dans `compteurs_gaz` OU dans `compteurs_electricite`, jamais les deux, et
-- toujours du côté que `type_energie_id` annonce. Deux données indépendantes s'accordent contre le
-- champ du contrat : c'est lui qui a tort.
--
-- LE PÉRIMÈTRE DOIT ÊTRE UNANIME pour que la correction s'applique. Deux recommandations mélangent
-- aujourd'hui gaz et électricité dans leur périmètre ; aucune n'a produit de contrat, mais la clause
-- `count(distinct) = 1` garantit qu'on ne trancherait pas à leur place.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

update public.contrats ct
   set type_energie_id = v.energie,
       date_modification = now()
  from (
    select cc.contrat_id, (array_agg(distinct cm.type_energie_id))[1] as energie
      from public.contrats_compteurs cc
      join public.compteurs cm on cm.id = cc.compteur_id
     where cm.type_energie_id is not null
     group by cc.contrat_id
    having count(distinct cm.type_energie_id) = 1
  ) as v
 where ct.id = v.contrat_id
   and ct.type_energie_id is distinct from v.energie;

-- ── Le garde-fou ──
do $$
declare
  v_restants integer;
  v_prix integer;
begin
  select count(*) into v_restants
    from (
      select cc.contrat_id, (array_agg(distinct cm.type_energie_id))[1] energie
        from public.contrats_compteurs cc
        join public.compteurs cm on cm.id = cc.compteur_id
       where cm.type_energie_id is not null
       group by cc.contrat_id
      having count(distinct cm.type_energie_id) = 1) v
    join public.contrats ct on ct.id = v.contrat_id
   where ct.type_energie_id is distinct from v.energie;
  if v_restants > 0 then
    raise exception 'Contrats encore en désaccord avec leurs compteurs : %', v_restants;
  end if;

  -- Le type de prix qui reste à trancher à la main : un contrat gaz vendu « Marché ».
  select count(*) into v_prix
    from public.contrats ct
    join public.types_energies te on te.id = ct.type_energie_id
   where te.code = 'GAZ' and ct.type_prix = 'Marché';
  raise notice 'Contrats gaz portant le type de prix « Marché », à reprendre à la main : %', v_prix;
end;
$$;

commit;
