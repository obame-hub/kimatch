-- ============================================================
-- Flot CONTRAT : aligner Kimatch sur Tools (décision Naoëlle, 06/08/2026)
--
-- Tools crée une DEMANDE de contrat depuis une OPPORTUNITÉ : tous les PDL de l'opportunité sont
-- embarqués, et l'enregistrement naît au statut « Nouveau » avant d'être envoyé au fournisseur.
-- Kimatch partait d'un site, faisait cocher des compteurs, et forçait le statut à ACTIF — il n'y
-- avait donc ni statut de demande, ni lien avec la recommandation : le circuit s'arrêtait à la
-- cotation.
--
-- Cette migration n'ajoute que du nullable et une ligne de référence : les 1597 contrats déjà
-- migrés depuis Salesforce restent strictement inchangés.
-- ============================================================

-- 1) Rattachement du contrat à l'opportunité (recommandation) et à la version (cotation) dont il
--    découle. Nullable : les contrats importés de Salesforce n'ont pas cette traçabilité.
alter table public.contrats
  add column if not exists recommandation_id uuid references public.recommandations(id) on delete set null,
  add column if not exists version_recommandation_id uuid references public.versions_recommandation(id) on delete set null;

comment on column public.contrats.recommandation_id is
  'Opportunité dont découle la demande de contrat — Tools: ContratWizard part d''un opportunityId. Null pour les contrats repris de Salesforce.';
comment on column public.contrats.version_recommandation_id is
  'Version (cotation) retenue qui a abouti à ce contrat. Null si le contrat ne vient pas du circuit.';

create index if not exists idx_contrats_recommandation on public.contrats(recommandation_id);

-- 2) Statut « Nouveau » : celui d'une demande de contrat pas encore signée. Les statuts existants
--    (ACTIF / A_RENOUVELER / EXPIRE / RESILIE) décrivent tous un contrat déjà en vigueur.
--    `ordre = 5` pour qu'il se place avant ACTIF (10) dans les listes.
--    `id` fourni explicitement : la table n'est pas décrite dans les migrations du dépôt (créée
--    directement en base), on ne suppose donc pas qu'elle a un DEFAULT sur sa clé primaire.
insert into public.statuts_contrats (id, code, libelle, ordre)
select gen_random_uuid(), 'NOUVEAU', 'Nouveau', 5
where not exists (select 1 from public.statuts_contrats where code = 'NOUVEAU');

-- 3) Renégociation anticipée : Tools écrase le type d'opportunité par un toggle générique, ce qui
--    est la confusion documentée cote Tools. On garde UN seul champ explicite côté Kimatch.
alter table public.contrats
  add column if not exists renegociation_anticipee boolean not null default false;

comment on column public.contrats.renegociation_anticipee is
  'Demande marquée « Renégociation anticipée » (Tools: toggle earlyReneg de l''étape Préférences). Un seul champ ici, là où Tools en a deux qui se chevauchent.';
