-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE CODE NAF ET SON LIBELLÉ, DEPUIS LE SIRET
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 16/09/2026 : « récupérer via une base de données, à toi de me dire la plus fiable et la
-- plus rapide, 2 informations à partir du SIRET (ou du SIREN si le SIRET est vierge) : le code NAF
-- (exemple : 68.32 A) ainsi que le libellé APE (pour 68.32A : "Administration d'immeubles et autres
-- biens immobiliers"). Le code NAF c'est un champ à créer. Pour le libellé APE tu peux éditer le
-- champ Activité. »
--
-- ══ LA SOURCE EST CELLE QUE KIMATCH UTILISE DÉJÀ ══
--
-- `recherche-entreprises.api.gouv.fr` — l'API publique de la DINUM, adossée à Sirene. Elle est déjà
-- branchée dans `src/lib/companyDirectory.ts` pour la création de compte depuis une piste : c'est
-- une dépendance connue, pas une de plus. Gratuite, sans clé, sans quota nominatif, elle répond en
-- une centaine de millisecondes.
--
-- L'API Sirene de l'INSEE dirait exactement la même chose, mais réclame un jeton OAuth et plafonne à
-- 30 appels la minute : pour les 4 793 pistes à rattraper, c'est deux heures et demie contre onze
-- minutes.
--
-- ══ ELLE REND LE CODE, JAMAIS LE LIBELLÉ — D'OÙ CETTE TABLE ══
--
-- Vérifié sur trois SIRET réels de la base le 16/09/2026 : `activite_principale` vaut « 68.32A », et
-- `libelle_activite_principale` est NUL. La traduction doit donc venir d'ailleurs : `codes_naf`
-- porte la nomenclature officielle, niveau 5, 732 sous-classes.
--
-- ELLE SE REMPLIT TOUTE SEULE, au premier enrichissement, depuis la source publique — voir
-- `api/pistes/enrichir-naf.ts`. Personne n'a à la saisir ni à la maintenir : elle ne bouge qu'à une
-- révision de la NAF. J'ai d'abord voulu la mettre dans le code, en constante TypeScript ; elle y
-- aurait été invisible au SQL, et un référentiel qu'aucune requête ne peut joindre n'est pas un
-- référentiel. La production a reçu cet aller-retour en trois migrations dans la même minute
-- (20260916142428 · 142526 · 142656) ; ce fichier dit l'état d'arrivée, et il est rejouable tel quel.
--
-- ══ NAF 2008, PAS NAF 2025 ══
--
-- L'API rend les deux : `activite_principale` (68.32A) et `activite_principale_naf25` (68.32H). On
-- garde la première — celle de l'exemple de William, et celle que portent déjà les 822 pistes venues
-- de Salesforce : « Aide à domicile » EST le libellé de 88.10A en NAF 2008. Basculer sur la révision
-- 2025 se fera d'un bloc le jour où l'entreprise le décidera, pas par accident.
--
-- ══ PAS DE CLÉ ÉTRANGÈRE VERS `codes_naf` ══
--
-- La nomenclature arrive au premier enrichissement, pas à la migration. Une contrainte ferait
-- échouer l'écriture d'un code tant que la table est vide, et surtout elle ferait dépendre une donnée
-- métier — ce que fait cette entreprise — de la présence d'un référentiel décoratif. Un code sans
-- libellé reste une information ; le libellé se rattrape au passage suivant.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists codes_naf (
  code          text primary key,
  libelle       text not null,
  date_creation timestamptz not null default now()
);

comment on table codes_naf is
  'Nomenclature d''activités française, niveau 5 (NAF rév. 2, 2008) : 732 sous-classes du type « 68.32A » et leur libellé. Remplie automatiquement depuis la source publique au premier enrichissement — voir api/pistes/enrichir-naf.ts.';

alter table codes_naf enable row level security;

-- Lecture pour tous : c'est une nomenclature publique. Écriture réservée, comme les autres
-- référentiels — l'enrichissement passe par la clé de service, qui ne voit pas les politiques.
drop policy if exists codes_naf_lecture on codes_naf;
create policy codes_naf_lecture on codes_naf for select to authenticated using (true);

drop policy if exists codes_naf_ecriture_admins on codes_naf;
create policy codes_naf_ecriture_admins on codes_naf for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

alter table pistes add column if not exists code_naf text;

comment on column pistes.code_naf is
  'Code NAF de l''unité légale (format « 68.32A »), récupéré depuis le SIRET ou le SIREN via recherche-entreprises.api.gouv.fr. Le libellé correspondant est recopié dans `activite`.';

-- Partiel : 153 pistes n'ont aucun identifiant et n'en porteront jamais.
create index if not exists idx_pistes_code_naf on pistes (code_naf) where code_naf is not null;
