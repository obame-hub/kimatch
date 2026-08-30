begin;

-- ANNULATION DE LA MIGRATION 20260830160000. C'ÉTAIT UNE ERREUR.
--
-- J'ai cru que 320 opportunités Salesforce manquaient dans Kimatch, en me fiant à un seul
-- critère : l'absence de leur identifiant dans recommandations.id_salesforce. Ce critère était
-- faux. 114 recommandations avaient été reprises SANS leur identifiant Salesforce, et je les ai
-- comptées comme absentes alors qu'elles étaient là.
--
-- Résultat : sur les 104 lignes insérées, 103 portent exactement le même nom et le même compte
-- qu'une recommandation déjà présente. J'ai créé des doublons dans un CRM en production.
--
-- Ce qui aurait dû me mettre en garde et que j'ai vu trop tard : 296 échanges pointaient déjà,
-- depuis Kimatch, vers la recommandation « existante » que Salesforce désignait. Si ces échanges
-- avaient un dossier, le dossier existait.
--
-- La suppression vise les 104 identifiants Salesforce insérés ce jour, et rien d'autre. Un
-- garde-fou vérifie qu'on ne touche qu'à des lignes créées aujourd'hui : les recommandations
-- reprises en juillet, même si elles portaient l'un de ces identifiants, ne bougent pas.
--
-- La bonne réparation est dans la migration suivante : compléter id_salesforce sur les lignes
-- existantes, au lieu d'en créer de nouvelles.

do $$
declare
  v_supprimees integer;
begin
  delete from recommandations
   where date_creation::date = current_date
     and id_salesforce is not null
     and not exists (select 1 from versions_recommandation v where v.recommandation_id = recommandations.id)
     and not exists (select 1 from interactions i where i.recommandation_id = recommandations.id)
     and not exists (select 1 from contrats c where c.recommandation_id = recommandations.id)
     and not exists (select 1 from signaux s where s.recommandation_id = recommandations.id);
  get diagnostics v_supprimees = row_count;
  raise notice 'Recommandations supprimées : %', v_supprimees;

  if exists (select 1 from recommandations where date_creation::date = current_date and id_salesforce is not null) then
    raise exception 'Des lignes créées aujourd''hui subsistent : elles ont acquis des dépendances, à examiner à la main.';
  end if;
end $$;

commit;
