-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CHACUN EFFACE CE QU'IL A ÉCRIT, LES ADMINISTRATEURS EFFACENT LE RESTE
--
-- William, 07/09/2026 : « il faudrait la possibilité de supprimer une tâche également ou une note si
-- on a fait une erreur ».
--
-- ══ CES DEUX TABLES ÉTAIENT LES SEULES SANS VERROU ══
--
-- La migration 20260828160000 a réservé la suppression aux administrateurs sur 96 tables, par des
-- politiques restrictives. `interactions` et `actions` n'en font pas partie : relevé le 07/09/2026,
-- elles ne portent qu'une politique `authenticated_all` en `using (true)`. N'importe quel
-- utilisateur connecté pouvait donc y effacer n'importe quelle ligne — y compris les 66 000
-- échanges importés de Salesforce.
--
-- Ce n'était probablement pas un choix : c'est l'oubli qui accompagne toute liste de 96 noms.
--
-- ══ POURQUOI L'AUTEUR, ET PAS SEULEMENT LES ADMINISTRATEURS ══
--
-- Le besoin exprimé est « j'ai fait une erreur ». Réserver la suppression aux six administrateurs
-- obligerait un commercial à demander de l'aide pour rattraper sa propre faute de frappe — et, en
-- pratique, à laisser la note fautive en place. La règle suit donc le besoin : on efface ce qu'on a
-- écrit soi-même, et les administrateurs gardent la main sur tout.
--
-- LES DEUX COLONNES D'AUTEUR SONT TESTÉES, et pas une seule. `interactions` porte
-- `auteur_profil_id` — rempli par `useCreateInteraction` — ET `cree_par_id`, écrit par le
-- déclencheur d'audit. Selon le chemin d'écriture, l'une ou l'autre est renseignée ; n'en tester
-- qu'une priverait de la moitié des cas. Mesuré avant écriture : 36 227 interactions portent un
-- auteur, 6 647 un créateur, sur 80 691 lignes. Les autres sont des imports sans auteur humain, et
-- elles resteront réservées aux administrateurs — ce qui est exactement ce qu'on veut d'un échange
-- venu de Salesforce ou d'Allo.
--
-- Pour `actions`, c'est `cree_par_id` : 164 des 167 tâches le portent.
--
-- ══ CE QUE CETTE MIGRATION NE CASSE PAS ══
--
-- `fn_supprimer_interactions_orphelines`, le déclencheur qui nettoie les interactions quand on
-- supprime un compte ou un site, est en `SECURITY DEFINER` : il ignore les politiques et continue
-- de fonctionner. Vérifié avant écriture — c'était le seul risque de régression.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- RESTRICTIVE et non PERMISSIVE : une politique permissive s'AJOUTE aux autres, et `authenticated_all`
-- autorisant déjà tout, elle n'aurait rien interdit. Une politique restrictive se COMBINE en ET avec
-- les permissives — c'est la seule forme qui restreint. C'est celle des 96 autres tables.
drop policy if exists suppression_auteur_ou_admin on public.interactions;
create policy suppression_auteur_ou_admin on public.interactions
  as restrictive for delete to authenticated
  using (
    auteur_profil_id = auth.uid()
    or cree_par_id = auth.uid()
    or public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN'])
  );

drop policy if exists suppression_auteur_ou_admin on public.actions;
create policy suppression_auteur_ou_admin on public.actions
  as restrictive for delete to authenticated
  using (
    cree_par_id = auth.uid()
    or public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN'])
  );

-- ── Le garde-fou ──
do $$
declare
  v_restrictives integer;
begin
  select count(*) into v_restrictives
    from pg_policies
   where schemaname = 'public'
     and tablename in ('interactions', 'actions')
     and policyname = 'suppression_auteur_ou_admin'
     and permissive = 'RESTRICTIVE'
     and cmd = 'DELETE';

  if v_restrictives <> 2 then
    raise exception 'Attendu 2 politiques restrictives de suppression, trouve % : les tables resteraient ouvertes', v_restrictives;
  end if;

  -- La trace des suppressions doit rester en place : c'est elle qui rend l'effacement réversible
  -- depuis la corbeille, et donc ce bouton acceptable.
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'interactions' and t.tgname = 'trg_journaliser_suppression'
  ) then
    raise exception 'interactions n a plus de journal de suppression : une note effacee serait perdue';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'actions' and t.tgname = 'trg_journaliser_suppression'
  ) then
    raise exception 'actions n a plus de journal de suppression : une tache effacee serait perdue';
  end if;

  raise notice 'Suppression reservee a l auteur et aux administrateurs, journal en place';
end;
$$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--   select tablename, policyname, permissive, cmd from pg_policies
--    where schemaname='public' and tablename in ('interactions','actions') order by tablename;
--   -- Attendu : `authenticated_all` (PERMISSIVE, ALL) et `suppression_auteur_ou_admin`
--   --           (RESTRICTIVE, DELETE) sur chacune.
--
--   Puis, dans l'application : écrire une note, la supprimer — elle doit partir. Ouvrir la corbeille
--   depuis Administration : elle doit y figurer, restaurable.
