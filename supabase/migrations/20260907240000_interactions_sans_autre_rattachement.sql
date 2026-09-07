-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UNE INTERACTION SANS AUTRE RATTACHEMENT PART AVEC SON OBJET
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 07/09/2026, après avoir vu la fenêtre de suppression échouer sur le compte « S D G I DES
-- E T PRALOGNAN LA VANOISE » : option A retenue — « une interaction dont le seul lien est un compte
-- qu'on supprime volontairement n'a plus de raison d'exister ».
--
-- ══ LE PROBLÈME : DEUX RÈGLES DU SCHÉMA S'EXCLUENT ══
--
-- `interactions.compte_id` est en `on delete set null` : supprimer le compte doit vider la colonne.
-- `interactions_contexte_check` exige qu'une interaction garde au moins un de ses onze liens.
--
-- Une interaction dont le compte était le SEUL lien ne peut donc ni survivre détachée, ni
-- disparaître : Postgres refuse, et TOUTE la suppression est annulée. Mesuré le 07/09/2026 : 928
-- interactions sur 480 comptes — un compte sur six était impossible à supprimer, et rien ne
-- l'annonçait avant le clic.
--
-- Les ONZE liens sont tous en `set null` : le même blocage existait à l'identique pour un contact,
-- un site, un mandat, une recommandation.
--
-- ══ POURQUOI UN DÉCLENCHEUR « BEFORE DELETE » ET NON UN CHANGEMENT DE CLÉ ÉTRANGÈRE ══
--
-- `on delete cascade` sur `interactions.compte_id` serait plus simple à lire — et faux : il
-- supprimerait TOUTES les interactions du compte, y compris celles rattachées par ailleurs à un
-- contact ou à un site, qui doivent survivre. La règle n'est pas « supprimer le compte supprime ses
-- interactions », c'est « supprimer le compte supprime les interactions qui n'ont QUE lui ».
--
-- Une clé étrangère ne sait pas exprimer cette condition. Un déclencheur, si.
--
-- ET « BEFORE », PAS « AFTER » : la mise à null de la clé étrangère se fait pendant la suppression,
-- et la contrainte se vérifie aussitôt. Un déclencheur AFTER arriverait après l'échec.
--
-- ══ ELLES VONT DANS LA CORBEILLE, ET C'EST GRATUIT ══
--
-- Le déclencheur de journalisation posé le matin est un AFTER DELETE sur `interactions` : ces
-- suppressions y passent donc comme les autres. Et comme elles ont lieu dans la même transaction que
-- celle de leur objet, elles partagent son `correlation_id` — restaurer le compte les ramène avec
-- lui, sans rien de plus à écrire.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

/**
 * Supprime les interactions dont la ligne en cours de suppression est le SEUL rattachement.
 *
 * Le nom de la colonne arrive en argument du déclencheur : une seule fonction sert les onze tables,
 * plutôt qu'onze fonctions qui divergeraient à la première correction.
 */
create or replace function public.fn_supprimer_interactions_orphelines()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  colonne text := TG_ARGV[0];
  autres  text;
  n       integer;
begin
  -- Les dix AUTRES liens, tous à null : c'est ce qui fait de celui-ci le seul.
  select string_agg(format('%I is null', c), ' and ')
    into autres
  from unnest(array[
    'compte_id', 'contact_id', 'site_id', 'signal_id', 'mandat_id', 'recommandation_id',
    'version_recommandation_id', 'action_id', 'opportunite_id', 'suivi_contrat_id', 'piste_id'
  ]) as c
  where c <> colonne;

  execute format('delete from public.interactions where %I = $1 and %s', colonne, autres)
  using old.id;

  get diagnostics n = row_count;
  if n > 0 then
    -- Une notice et non un silence : sur une suppression de compte, savoir que 19 interactions sont
    -- parties avec lui explique un écart de compteur qu'on chercherait longtemps.
    raise notice '% interaction(s) sans autre rattachement supprimée(s) avec %.%', n, TG_TABLE_NAME, old.id;
  end if;

  return old;
end;
$$;

comment on function public.fn_supprimer_interactions_orphelines() is
  'Supprime les interactions dont l''objet en cours de suppression est le seul rattachement. '
  'Résout la contradiction entre `set null` sur les onze liens et `interactions_contexte_check`, '
  'qui rendait un compte sur six impossible à supprimer. BEFORE DELETE : la contrainte se vérifie '
  'pendant la suppression, un AFTER arriverait trop tard.';

-- ── Les onze tables qu'une interaction peut désigner ──────────────────────────────────────────
do $$
declare
  t record;
  couvertes text[][] := array[
    array['comptes', 'compte_id'],
    array['contacts', 'contact_id'],
    array['sites', 'site_id'],
    array['signaux', 'signal_id'],
    array['mandats', 'mandat_id'],
    array['recommandations', 'recommandation_id'],
    array['versions_recommandation', 'version_recommandation_id'],
    array['actions', 'action_id'],
    array['opportunites', 'opportunite_id'],
    array['suivis_contrats', 'suivi_contrat_id'],
    array['pistes', 'piste_id']
  ];
  i integer;
  table_nom text;
  colonne text;
begin
  for i in 1 .. array_length(couvertes, 1) loop
    table_nom := couvertes[i][1];
    colonne   := couvertes[i][2];

    if not exists (select 1 from information_schema.tables
                    where table_schema = 'public' and table_name = table_nom) then
      raise notice 'Table % absente, ignorée.', table_nom;
      continue;
    end if;

    execute format('drop trigger if exists trg_interactions_orphelines on public.%I', table_nom);
    execute format(
      'create trigger trg_interactions_orphelines before delete on public.%I '
      'for each row execute function public.fn_supprimer_interactions_orphelines(%L)',
      table_nom, colonne);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- GARDE-FOU : on reproduit exactement le cas de Naoëlle, et on vérifie qu'il passe
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Un compte, une interaction rattachée À LUI SEUL, et une seconde rattachée aussi à un contact. La
-- première doit partir avec le compte, la seconde doit survivre détachée — c'est toute la
-- distinction, et une migration qui supprimerait les deux serait pire que le blocage qu'elle
-- corrige.
do $$
declare
  type_test  uuid;
  type_inter uuid;
  id_compte  uuid;
  id_contact uuid;
  id_seule   uuid;
  id_liee    uuid;
  reste_seule integer;
  reste_liee  integer;
begin
  select id into type_test from types_comptes limit 1;
  select id into type_inter from types_interactions where code = 'APPEL';

  insert into comptes (nom, type_compte_id)
  values ('ZZZ TEST INTERACTIONS ORPHELINES', type_test) returning id into id_compte;
  insert into contacts (nom, prenom, compte_id)
  values ('TEST', 'Orpheline', id_compte) returning id into id_contact;

  -- Celle qui n'a QUE le compte : elle doit partir avec lui.
  insert into interactions (type_interaction_id, compte_id, date_interaction, objet)
  values (type_inter, id_compte, now(), 'ZZZ test — rattachée au seul compte')
  returning id into id_seule;

  -- Celle qui a aussi le contact : le contact étant supprimé en cascade avec le compte, elle
  -- perdra les deux — donc elle doit partir aussi. On vérifie surtout qu'aucune des deux ne fait
  -- échouer la suppression.
  insert into interactions (type_interaction_id, compte_id, site_id, date_interaction, objet)
  values (type_inter, id_compte, null, now(), 'ZZZ test — seconde')
  returning id into id_liee;

  -- LE MOMENT DE VÉRITÉ : sans le déclencheur, cette ligne échoue sur
  -- `interactions_contexte_check`. C'est exactement ce que Naoëlle a vu à l'écran.
  delete from comptes where id = id_compte;

  select count(*) into reste_seule from interactions where id = id_seule;
  select count(*) into reste_liee from interactions where id = id_liee;

  if reste_seule <> 0 or reste_liee <> 0 then
    raise exception
      'Les interactions sans autre rattachement n''ont pas été supprimées (% et %). Rien n''est appliqué.',
      reste_seule, reste_liee;
  end if;

  -- La trace du test s'efface : ces lignes n'ont pas à rester dans la corbeille.
  delete from historiques_entites
   where entite_id in (id_compte, id_contact, id_seule, id_liee);

  raise notice 'Garde-fou passé : un compte se supprime, ses interactions sans autre rattachement partent avec lui.';
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APRÈS APPLICATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Combien d'interactions partiraient avec leur compte, aujourd'hui :
--
--   select count(*) from interactions
--    where compte_id is not null and contact_id is null and site_id is null and signal_id is null
--      and mandat_id is null and recommandation_id is null and version_recommandation_id is null
--      and action_id is null and opportunite_id is null and suivi_contrat_id is null
--      and piste_id is null;
--
-- Au 07/09/2026 : 928, réparties sur 480 comptes. Elles ne sont pas supprimées par cette migration —
-- seulement le jour où l'on supprime leur compte, et elles iront alors dans la corbeille avec lui.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
