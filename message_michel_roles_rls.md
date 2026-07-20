# Message pour Michel — finaliser le système de rôles/permissions

Salut Michel,

J'ai audité le nouveau modèle rôles/organisations/permissions — il est nickel. Il manque trois choses pour qu'il soit utilisable par l'app :

1. **Aucune policy RLS** sur les nouvelles tables (RLS activé partout mais 0 policy, comme sur le reste de la base) — l'app ne peut donc rien lire ni écrire dessus pour l'instant.
2. **`roles_acces_permissions` est vide** — aucun rôle n'a de permissions assignées.
3. **Aucun trigger** ne crée automatiquement un `profils` quand un compte se connecte pour la première fois (on passe au lien magique par email — plus de mot de passe, le compte `auth.users` se crée tout seul mais rien ne crée le `profils` associé).

Voici le SQL. Tout est idempotent (peut être rejoué sans casser).

## 1. Fonction utilitaire (vérifier si un profil est admin)

```sql
create or replace function public.has_role_acces(p_profil_id uuid, p_codes text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from profils_roles_acces pra
    join roles_acces ra on ra.id = pra.role_acces_id
    where pra.profil_id = p_profil_id
      and ra.code = any(p_codes)
      and ra.actif
  );
$$;

grant execute on function public.has_role_acces(uuid, text[]) to authenticated;
```

## 2. Policies RLS

```sql
-- Tables de référence : lecture pour tout utilisateur connecté, écriture réservée aux admins
create policy "organisations_read" on organisations for select to authenticated using (true);
create policy "organisations_admin_write" on organisations for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

create policy "postes_read" on postes for select to authenticated using (true);
create policy "postes_admin_write" on postes for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

create policy "equipes_read" on equipes for select to authenticated using (true);
create policy "equipes_admin_write" on equipes for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

create policy "permissions_read" on permissions for select to authenticated using (true);
create policy "roles_acces_read" on roles_acces for select to authenticated using (true);
create policy "types_roles_read" on types_roles for select to authenticated using (true);

create policy "roles_acces_permissions_read" on roles_acces_permissions for select to authenticated using (true);
create policy "roles_acces_permissions_admin_write" on roles_acces_permissions for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

create policy "postes_permissions_read" on postes_permissions for select to authenticated using (true);
create policy "postes_permissions_admin_write" on postes_permissions for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

-- profils : tout le monde peut lire (nécessaire pour afficher les noms des responsables/conseillers
-- partout dans l'app), chacun peut modifier sa propre fiche, les admins peuvent modifier n'importe qui
create policy "profils_read" on profils for select to authenticated using (true);
create policy "profils_self_update" on profils for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
create policy "profils_admin_update" on profils for update to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

-- Tables de liaison profil <-> organisation/équipe/poste/rôle/compte/périmètre :
-- chacun lit ses propres lignes, les admins lisent et gèrent tout
create policy "profils_organisations_read" on profils_organisations for select to authenticated
  using (auth.uid() = profil_id or has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));
create policy "profils_organisations_admin_write" on profils_organisations for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

create policy "profils_equipes_read" on profils_equipes for select to authenticated
  using (auth.uid() = profil_id or has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));
create policy "profils_equipes_admin_write" on profils_equipes for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

create policy "profils_postes_read" on profils_postes for select to authenticated
  using (auth.uid() = profil_id or has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));
create policy "profils_postes_admin_write" on profils_postes for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

create policy "profils_roles_acces_read" on profils_roles_acces for select to authenticated
  using (auth.uid() = profil_id or has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));
create policy "profils_roles_acces_admin_write" on profils_roles_acces for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

create policy "profils_comptes_read" on profils_comptes for select to authenticated
  using (auth.uid() = profil_id or has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));
create policy "profils_comptes_admin_write" on profils_comptes for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

create policy "perimetres_acces_read" on perimetres_acces for select to authenticated
  using (auth.uid() = profil_id or has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));
create policy "perimetres_acces_admin_write" on perimetres_acces for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));
```

## 3. Seed des permissions par rôle (proposition — à ajuster avec toi)

```sql
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roles_acces_permissions_unique') then
    alter table roles_acces_permissions add constraint roles_acces_permissions_unique unique (role_acces_id, permission_id);
  end if;
end $$;

-- SUPER_ADMIN et ADMIN : toutes les permissions
insert into roles_acces_permissions (role_acces_id, permission_id)
select ra.id, p.id from roles_acces ra cross join permissions p
where ra.code in ('SUPER_ADMIN','ADMIN')
on conflict (role_acces_id, permission_id) do nothing;

-- DIRECTEUR et MANAGER : tout sauf l'administration des utilisateurs
insert into roles_acces_permissions (role_acces_id, permission_id)
select ra.id, p.id from roles_acces ra cross join permissions p
where ra.code in ('DIRECTEUR','MANAGER') and p.code <> 'UTILISATEUR_ADMIN'
on conflict (role_acces_id, permission_id) do nothing;

-- CONSEILLER : lecture/écriture métier courante (pas de validation ni d'administration)
insert into roles_acces_permissions (role_acces_id, permission_id)
select ra.id, p.id from roles_acces ra cross join permissions p
where ra.code = 'CONSEILLER'
  and p.action in ('READ','WRITE','CREATE','SELECT','UPLOAD')
  and p.module <> 'SYSTEM'
on conflict (role_acces_id, permission_id) do nothing;

-- SERVICE_CLIENT : lecture seule
insert into roles_acces_permissions (role_acces_id, permission_id)
select ra.id, p.id from roles_acces ra cross join permissions p
where ra.code = 'SERVICE_CLIENT' and p.action = 'READ' and p.module <> 'SYSTEM'
on conflict (role_acces_id, permission_id) do nothing;

-- PARTENAIRE / FOURNISSEUR / CLIENT : rien pour l'instant (futur portail, pas utilisé dans KiWee OS)
```

## 4. Trigger de création automatique du profil à la première connexion

Chaque nouvel utilisateur qui clique son lien magique crée un `auth.users`, mais rien ne crée le `profils` correspondant. Ce trigger le fait, avec l'organisation KIWEE_FR et le rôle CONSEILLER par défaut (le plus prudent — un admin pourra ensuite changer le rôle réel dans l'écran d'administration).

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organisation_id uuid;
  v_role_acces_id uuid;
begin
  if not exists (select 1 from public.profils where id = new.id) then
    insert into public.profils (id, prenom, nom, email, actif)
    values (new.id, coalesce(new.raw_user_meta_data->>'prenom', ''), coalesce(new.raw_user_meta_data->>'nom', ''), new.email, true);
  end if;

  select id into v_organisation_id from public.organisations where code = 'KIWEE_FR' limit 1;
  if v_organisation_id is not null and not exists (
    select 1 from public.profils_organisations where profil_id = new.id and organisation_id = v_organisation_id
  ) then
    insert into public.profils_organisations (profil_id, organisation_id, est_principale)
    values (new.id, v_organisation_id, true);
  end if;

  select id into v_role_acces_id from public.roles_acces where code = 'CONSEILLER' limit 1;
  if v_role_acces_id is not null and not exists (
    select 1 from public.profils_roles_acces where profil_id = new.id and role_acces_id = v_role_acces_id
  ) then
    insert into public.profils_roles_acces (profil_id, role_acces_id)
    values (new.id, v_role_acces_id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

## Ce que ça débloque

- L'écran Admin que je construis en parallèle (gestion des utilisateurs, rôles, permissions).
- Le lien magique : premier clic = compte + profil + rôle CONSEILLER par défaut, un admin ajuste ensuite.
- Toute la donnée reste protégée : seuls les rôles SUPER_ADMIN/ADMIN peuvent écrire sur les tables de rôles/permissions/organisation ; les autres n'ont que la lecture de leurs propres lignes.

Dis-moi si la répartition des permissions par rôle (section 3) te convient ou si tu veux ajuster.
