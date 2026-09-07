-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LES SUPPRESSIONS LAISSENT ENFIN UNE TRACE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le 07/09/2026, Guillaume a perdu le compte « ALAIN - CHEZ GILLES (BAR DE L'ADOUR) » et son
-- contact. Question posée : est-ce la suppression du contact qui a emporté le compte ?
--
-- IMPOSSIBLE À DIRE. Et c'est le vrai défaut. Kimatch ne journalise aucune suppression :
--
--   · `historiques_entites` accepte l'opération 'DELETE' — sa contrainte de contrôle la prévoit —
--     mais la table est VIDE : rien ne l'écrit.
--   · `historique_modifications` est alimentée par `fn_audit_trace`, qui est un déclencheur
--     `BEFORE INSERT OR UPDATE`. La suppression n'y figure pas.
--
-- On a donc pu prouver par le schéma que la cascade incriminée n'existe pas — `comptes` ne porte que
-- cinq clés étrangères, toutes en NO ACTION, aucune règle, aucun déclencheur de suppression, et
-- `useDeleteContact` n'a jamais fait qu'un delete sur `contacts` depuis son premier commit — mais on
-- n'a pas pu dire ce qui s'était réellement passé ce jour-là. La prochaine fois, on pourra.
--
-- ══ CE QUE CHAQUE LIGNE SUPPRIMÉE LAISSERA ══
--
--   entite_type        la table
--   entite_id          la ligne
--   ancienne_valeur    LA LIGNE ENTIÈRE en jsonb — de quoi la relire, et la recréer si besoin
--   auteur_profil_id   qui a supprimé, quand `auth.uid()` est connu
--   correlation_id     LA CLÉ DE VOÛTE : toutes les lignes emportées par une même suppression
--                      partagent cet identifiant. C'est ce qui permettra de répondre à « qu'est-ce
--                      que cette suppression a emporté, exactement ? » — la question du jour.
--   date_modification  l'horodatage
--
-- ══ POURQUOI `compte_id` RESTE NULL, ET C'EST VOLONTAIRE ══
--
-- `historiques_entites.compte_id` porte une clé étrangère vers `comptes` en NO ACTION. Y écrire
-- l'identifiant du compte qu'on est en train de supprimer ferait échouer la suppression elle-même :
-- la ligne de journal référencerait un compte disparu. Le rattachement au compte se retrouve donc
-- dans `ancienne_valeur`, qui porte la ligne complète.
--
-- ══ CE QUI N'EST PAS COUVERT, ET POURQUOI ══
--
-- Les tables de jointure — `contacts_comptes`, `mandats_compteurs`, `recommandations_sites`… — ne
-- sont pas journalisées. Personne ne les supprime à la main : elles disparaissent toujours dans le
-- sillage d'un objet qui l'est, lequel est journalisé. Les couvrir multiplierait le volume sans rien
-- apprendre. Idem pour `consommations`, qui peut compter des milliers de lignes par compteur.
--
-- ══ SÉCURITÉ ══
--
-- `SECURITY DEFINER`, comme `fn_audit_trace` : `historiques_entites` est sous RLS, et un déclencheur
-- exécuté avec les droits de l'appelant échouerait à y écrire — ce qui rendrait toute suppression
-- impossible. Le motif est déjà en place et éprouvé sur `historique_modifications`.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.fn_journaliser_suppression()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.historiques_entites (
    entite_type, entite_id, operation, ancienne_valeur, auteur_profil_id, source, correlation_id
  ) values (
    TG_TABLE_NAME,
    old.id,
    'DELETE',
    to_jsonb(old),
    auth.uid(),
    'APPLICATION',
    -- UN IDENTIFIANT PAR TRANSACTION, déduit et non tiré au hasard : toutes les lignes qu'une même
    -- suppression emporte tombent dans la même transaction, donc partagent ce numéro. Sans lui, on
    -- aurait 672 lignes de journal sans savoir qu'elles racontent un seul geste.
    md5(txid_current()::text)::uuid
  );
  return old;
end;
$$;

comment on function public.fn_journaliser_suppression() is
  'Journalise dans historiques_entites toute ligne supprimée, avec son contenu complet et un '
  'identifiant de transaction partagé par les lignes emportées ensemble. Posé le 07/09/2026 : '
  'aucune suppression ne laissait de trace, et on n''a pas pu reconstituer la perte du compte '
  'ALAIN - CHEZ GILLES (BAR DE L''ADOUR).';

-- ── Les tables couvertes : les objets qu'un utilisateur reconnaît et peut supprimer ────────────
do $$
declare
  t text;
  couvertes text[] := array[
    'comptes', 'contacts', 'sites', 'compteurs', 'contrats', 'mandats',
    'recommandations', 'versions_recommandation', 'opportunites', 'signaux',
    'interactions', 'pistes', 'requetes', 'documents', 'actions', 'offres_fournisseurs'
  ];
begin
  foreach t in array couvertes loop
    -- Ignore une table absente plutôt que d'échouer : le schéma évolue, et cette migration ne doit
    -- pas devenir impossible à appliquer parce qu'une table a été renommée entre-temps.
    if not exists (select 1 from information_schema.tables
                    where table_schema = 'public' and table_name = t) then
      raise notice 'Table % absente, ignorée.', t;
      continue;
    end if;

    execute format('drop trigger if exists trg_journaliser_suppression on public.%I', t);
    execute format(
      'create trigger trg_journaliser_suppression after delete on public.%I '
      'for each row execute function public.fn_journaliser_suppression()', t);
  end loop;
end $$;

-- ── GARDE-FOU : on vérifie que ça écrit vraiment, et on annule si ce n'est pas le cas ──────────
--
-- Une migration qui pose un déclencheur silencieusement inopérant est pire que pas de migration :
-- on croirait avoir la trace. On crée donc un enregistrement jetable, on le supprime, on vérifie
-- que le journal l'a vu, puis on efface la preuve.
do $$
declare
  id_test uuid;
  n integer;
  type_test uuid;
begin
  select id into type_test from types_comptes limit 1;
  if type_test is null then
    raise exception 'Aucun type de compte en base : impossible de tester le déclencheur.';
  end if;

  insert into comptes (nom, type_compte_id)
  values ('ZZZ TEST JOURNAL SUPPRESSION — À SUPPRIMER', type_test)
  returning id into id_test;

  delete from comptes where id = id_test;

  select count(*) into n
  from historiques_entites
  where entite_id = id_test and operation = 'DELETE' and entite_type = 'comptes';

  if n <> 1 then
    raise exception 'Le déclencheur n''a pas journalisé la suppression (% lignes au lieu de 1). Rien n''est appliqué.', n;
  end if;

  -- La preuve a servi, elle s'efface : ce compte de test n'a pas à rester dans le journal.
  delete from historiques_entites where entite_id = id_test;

  raise notice 'Garde-fou passé : la suppression d''un compte est bien journalisée.';
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APRÈS APPLICATION — comment lire le journal
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Les dernières suppressions, et ce que chacune a emporté :
--
--   select to_char(min(date_modification), 'DD/MM/YYYY HH24:MI:SS') as quand,
--          correlation_id,
--          count(*)                                    as lignes_emportees,
--          string_agg(distinct entite_type, ', ')      as tables,
--          (array_agg(ancienne_valeur ->> 'nom')
--             filter (where entite_type = 'comptes'))[1] as compte
--   from historiques_entites
--   where operation = 'DELETE'
--   group by correlation_id
--   order by min(date_modification) desc
--   limit 20;
--
-- Le détail d'une suppression, ligne par ligne :
--
--   select entite_type, entite_id, ancienne_valeur
--   from historiques_entites
--   where correlation_id = '<le correlation_id>' order by entite_type;
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
