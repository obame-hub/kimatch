-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- RÉGLER UN RÔLE DEMANDE LE DROIT D'ADMINISTRER — ET UN REFUS DOIT SE VOIR
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Éprouvé à l'écran le 24/09/2026, juste après avoir livré la page de gestion : l'interrupteur
-- bascule, la page ne dit rien, ET LA BASE NE CHANGE PAS.
--
-- ══ POURQUOI C'ÉTAIT SILENCIEUX ══
--
-- `roles_acces` a `row level security` active et AUCUNE policy d'écriture — la table n'avait jamais
-- eu à en recevoir, puisque personne ne l'écrivait depuis l'application. Un `update` filtré par RLS
-- ne lève pas d'erreur : PostgREST répond 200 avec zéro ligne touchée. La mutation réussissait
-- donc, et l'écran affichait le nouvel état d'un droit qui n'avait pas bougé.
--
-- C'EST LE DÉFAUT MÊME QU'ON EST EN TRAIN DE CORRIGER, revenu par une autre porte : un écran de
-- droits qui ment sur ce qu'il a enregistré. Il ne suffisait pas de retirer les cases sans effet,
-- il fallait aussi que les nouveaux réglages échouent BRUYAMMENT quand ils échouent.
--
-- ══ CE QU'ON POSE ══
--
-- Trois policies d'écriture sur `roles_acces` et une sur `profils_roles_acces`, toutes adossées à
-- la même question : « le rôle de qui écrit ouvre-t-il l'administration ? ». C'est la colonne
-- posée par 20260924103000, donc la règle vaut pour tout rôle qui recevra ce droit demain — pas
-- seulement pour ADMIN et SUPER_ADMIN nommés en dur.
--
-- ══ POURQUOI UNE FONCTION ET NON LA SOUS-REQUÊTE DIRECTEMENT ══
--
-- La policy de `roles_acces` doit lire `roles_acces` pour savoir qui écrit. Écrite telle quelle,
-- c'est une récursion : la policy s'appelle elle-même et Postgres refuse avec « infinite recursion
-- detected in policy ». `security definer` coupe la boucle, parce que la fonction lit la table sans
-- repasser par les policies.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.peut_administrer()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.profils_roles_acces pra
      join public.roles_acces r on r.id = pra.role_acces_id
     where pra.profil_id = auth.uid()
       and r.ouvre_administration
       and r.actif
  )
$$;

comment on function public.peut_administrer() is
  'Vrai si le rôle de la personne connectée ouvre l''administration. `security definer` est '
  'indispensable : les policies de `roles_acces` s''en servent, et lire cette table depuis sa '
  'propre policy sans cela produirait une récursion infinie.';

grant execute on function public.peut_administrer() to authenticated;

-- ── Qui peut régler les rôles ──
--
-- La LECTURE reste ouverte à tous : savoir qui peut quoi n'est pas un privilège, et la page Rôles
-- s'affiche pour tout le monde. Seule l'écriture demande le droit.
drop policy if exists roles_acces_ecriture on public.roles_acces;
create policy roles_acces_ecriture on public.roles_acces
  for update to authenticated
  using (public.peut_administrer())
  with check (public.peut_administrer());

drop policy if exists roles_acces_creation on public.roles_acces;
create policy roles_acces_creation on public.roles_acces
  for insert to authenticated
  with check (public.peut_administrer());

/* ON N'OUVRE PAS LA SUPPRESSION, ET C'EST DÉLIBÉRÉ. Effacer un rôle laisserait SANS AUCUN DROIT
   ceux qui le portent, d'un coup et sans message. L'écran propose de désactiver ; il n'y a donc
   aucune raison d'autoriser en base un geste que l'application ne propose pas. */

-- ── Qui peut changer le rôle de quelqu'un ──
--
-- C'est le même pouvoir, exercé autrement : donner à quelqu'un un rôle qui ouvre l'administration
-- revient à lui ouvrir l'administration.
drop policy if exists profils_roles_acces_ecriture on public.profils_roles_acces;
create policy profils_roles_acces_ecriture on public.profils_roles_acces
  for all to authenticated
  using (public.peut_administrer())
  with check (public.peut_administrer());

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : UN ADMINISTRATEUR ÉCRIT, LES AUTRES SONT REFUSÉS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ce que la migration rend possible : régler un rôle depuis l'écran. Le RISQUE est double, et les
-- deux sens comptent autant :
--
--   · trop fermé — c'est le défaut qu'on vient de vivre : l'écran semble enregistrer et ne change
--     rien. Une page de droits qui ment est pire qu'une page absente ;
--   · trop ouvert — n'importe quel utilisateur connecté pourrait s'accorder l'administration, et
--     personne ne s'en apercevrait.
--
do $$
declare
  v_admin   uuid;
  v_simple  uuid;
  v_role    uuid;
  v_avant   boolean;
  v_touche  integer;
begin
  select p.id into v_admin
    from public.profils p
    join public.profils_roles_acces pra on pra.profil_id = p.id
    join public.roles_acces r on r.id = pra.role_acces_id
   where r.ouvre_administration and r.actif and p.actif
   limit 1;

  select p.id into v_simple
    from public.profils p
    join public.profils_roles_acces pra on pra.profil_id = p.id
    join public.roles_acces r on r.id = pra.role_acces_id
   where not r.ouvre_administration and p.actif
   limit 1;

  if v_admin is null or v_simple is null then
    raise notice 'Garde-fou ignoré : il faut au moins un administrateur et un non-administrateur actifs.';
    return;
  end if;

  select id, voit_tous_les_comptes into v_role, v_avant
    from public.roles_acces where code = 'DIRECTEUR' limit 1;
  if v_role is null then
    raise notice 'Garde-fou ignoré : le rôle DIRECTEUR n''existe pas.';
    return;
  end if;

  -- ① UN ADMINISTRATEUR ÉCRIT VRAIMENT. C'est le cas qui échouait en silence avant cette migration.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.roles_acces set voit_tous_les_comptes = not v_avant where id = v_role;
  get diagnostics v_touche = row_count;
  if v_touche <> 1 then
    raise exception 'Un administrateur n''a pas pu régler un rôle : l''écran afficherait un changement que la base ignore.';
  end if;

  -- ② UN NON-ADMINISTRATEUR EST REFUSÉ. Le cas qui compte pour la sécurité.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_simple, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.roles_acces set ouvre_administration = true where id = v_role;
  get diagnostics v_touche = row_count;
  if v_touche <> 0 then
    raise exception 'Un utilisateur sans droit d''administration a pu s''accorder l''administration.';
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- On remet l'état d'origine : un garde-fou ne laisse pas de trace.
  update public.roles_acces set voit_tous_les_comptes = v_avant where id = v_role;

  raise notice 'Garde-fou : un administrateur règle les rôles, un utilisateur ordinaire est refusé.';
end $$;

commit;
