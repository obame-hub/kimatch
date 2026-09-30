-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA PROPOSITION A SA RÉFÉRENCE D'APPEL D'OFFRES, ET UNE OFFRE INDEXÉE SON INDICE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Suite de la migration 20260930100000. Naoëlle, 30/09/2026 : « il faut que tu ajoutes les champs en
-- base qui manquent ». Après les clauses et l'identité du fournisseur, les deux derniers champs des
-- modèles de William (« Offre B v3 », « Offre Electricite ») sans colonne :
--
-- ══ ① LA RÉFÉRENCE D'APPEL D'OFFRES, SUR LA VERSION ══
--
-- Le modèle titre chaque proposition « AO-2026-0418 · Gaz naturel · Monosite ». Aucune colonne ne la
-- portait : `recommandations.reference` est vide sur tous les dossiers, et une recommandation a
-- plusieurs versions — donc plusieurs appels d'offres. C'est la VERSION qui est un appel d'offres :
-- ce qu'on a demandé aux fournisseurs, à une date.
--
-- ELLE S'ATTRIBUE TOUTE SEULE, au format du modèle : AO-<année de création>-<numéro sur 4
-- chiffres>, le numéro repartant de 1 chaque année. Les 2 135 versions existantes la reçoivent dans
-- l'ordre de leur création, pour que les numéros disent la chronologie. Le format est celui du
-- modèle de William ; s'il en choisit un autre, il se recalcule d'une requête.
--
-- UNIQUE : deux propositions ne peuvent pas porter la même référence, c'est ce qu'un client cite
-- quand il rappelle.
--
-- ══ ② L'INDICE D'UNE OFFRE INDEXÉE, SUR L'OFFRE ══
--
-- Le modèle écrit « Picoty — Indexé PEG ». `type_prix` ne dit que « Indexé » (2 offres sur 382), et
-- l'indice — PEG, TTF, Spot… — est ce qui dit AU CLIENT sur quoi son prix va bouger. Il n'a de sens
-- que pour une offre indexée ; sur une offre fixe il reste vide.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ ① La référence d'appel d'offres ═════════════════════════════════════════════════════════════

alter table versions_recommandation add column if not exists reference_appel_offres text;

create unique index if not exists versions_recommandation_reference_appel_offres_uq
  on versions_recommandation (reference_appel_offres) where reference_appel_offres is not null;

comment on column versions_recommandation.reference_appel_offres is
  'Référence de l''appel d''offres que représente cette version, affichée en tête de la proposition commerciale : AO-<année>-<numéro sur 4 chiffres>, attribuée automatiquement à la création (trigger `attribuer_reference_appel_offres`), numérotation annuelle. Voir la migration du 30/09/2026.';

-- Les existantes, dans l'ordre de leur création : le numéro dit la chronologie.
with numerotees as (
  select id,
         'AO-' || extract(year from date_creation)::int || '-' ||
         lpad(row_number() over (partition by extract(year from date_creation) order by date_creation, id)::text, 4, '0') as ref
  from versions_recommandation
  where reference_appel_offres is null
)
update versions_recommandation v set reference_appel_offres = n.ref
from numerotees n where n.id = v.id;

create or replace function attribuer_reference_appel_offres()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  annee int := extract(year from coalesce(new.date_creation, now()))::int;
  suivant int;
begin
  if new.reference_appel_offres is not null then
    return new;
  end if;
  -- Un verrou par année : deux versions créées à la même seconde ne peuvent pas prendre le même numéro.
  perform pg_advisory_xact_lock(hashtext('reference_appel_offres_' || annee));
  select coalesce(max(split_part(reference_appel_offres, '-', 3)::int), 0) + 1 into suivant
  from versions_recommandation
  where reference_appel_offres like 'AO-' || annee || '-%';
  new.reference_appel_offres := 'AO-' || annee || '-' || lpad(suivant::text, 4, '0');
  return new;
end;
$$;

comment on function attribuer_reference_appel_offres() is
  'Attribue à une nouvelle version sa référence d''appel d''offres (AO-<année>-<numéro>), au numéro suivant de l''année. Voir la migration du 30/09/2026.';

drop trigger if exists versions_recommandation_reference_appel_offres on versions_recommandation;
create trigger versions_recommandation_reference_appel_offres
  before insert on versions_recommandation
  for each row execute function attribuer_reference_appel_offres();

-- ══ ② L'indice d'une offre indexée ═════════════════════════════════════════════════════════════

alter table offres_fournisseurs add column if not exists indice_indexation text;

comment on column offres_fournisseurs.indice_indexation is
  'L''indice sur lequel une offre INDEXÉE suit le marché : PEG, TTF, Spot… Affiché dans la proposition (« Indexé PEG »). Vide sur une offre fixe. Voir la migration du 30/09/2026.';

commit;
