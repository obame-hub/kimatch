begin;

-- L'IDENTIFIANT SALESFORCE MANQUANT SUR 114 RECOMMANDATIONS.
--
-- La reprise a importe ces dossiers mais a perdu en route l'identifiant de l'opportunite dont
-- ils viennent. Consequence : impossible de savoir ce qui a ete repris et ce qui ne l'a pas ete.
-- C'est exactement ce qui m'a fait croire, ce matin, que 320 opportunites manquaient — et creer
-- 103 doublons avant de m'en apercevoir (migrations 20260830160000 et 170000).
--
-- Le rapprochement se fait sur le COUPLE compte + nom, et n'est retenu que s'il est UNIQUE des
-- deux cotes. Un nom qui revient deux fois sur le meme compte est ecarte : mieux vaut une ligne
-- sans identifiant qu'un identifiant pose sur le mauvais dossier.
--
--   11 rapprochements surs
--   11 sans aucune correspondance cote Salesforce
--   0 avec plusieurs opportunites candidates
--   92 dont le nom revient plusieurs fois dans Kimatch pour le meme compte
--
-- Une contrainte d'unicite est posee ensuite sur id_salesforce : c'est elle qui empechera
-- qu'un dossier soit importe deux fois, quel que soit le critere employe par celui qui importe.

update recommandations as r
set id_salesforce = v.sf
from (values
  ('d9311f4b-dd47-4672-8a8a-e89e14b961ed'::uuid, '006bR00000IsHSvQAN'),
  ('09e97096-3d0a-4197-a56a-1763ff4bbd8f'::uuid, '006bR00000d7Ky2QAE'),
  ('be514e2f-ec25-41e9-a0af-6810b4fca876'::uuid, '006bR00000K5olRQAR'),
  ('5cb2e022-d03f-4dc2-b1ec-9ef51b42d4b6'::uuid, '006bR00000RG2xZQAT'),
  ('e67e42d5-5b35-4d53-b7b4-eefd7820120f'::uuid, '006bR00000d5w9lQAA'),
  ('a4afa648-d262-44c5-a260-a994cd61eadb'::uuid, '006bR00000DCTI5QAP'),
  ('d77ba400-aae3-456f-8e67-496ac0bf366e'::uuid, '006bR00000DC93GQAT'),
  ('f545a1a1-92b7-470a-83f2-88decf6cc41b'::uuid, '006bR00000DCU9JQAX'),
  ('513818c6-6a04-4c67-9b89-7e941dd554d4'::uuid, '006bR00000RFfpoQAD'),
  ('0a2dca23-39f7-413e-80ce-14e4ffef15ea'::uuid, '006bR00000DCEm5QAH'),
  ('83fc38ff-c553-40c6-a103-b29fa428be99'::uuid, '006bR00000DCSXJQA5')
) as v(reco, sf)
where r.id = v.reco and r.id_salesforce is null;

create unique index if not exists recommandations_id_salesforce_unique
  on recommandations (id_salesforce) where id_salesforce is not null;

commit;
