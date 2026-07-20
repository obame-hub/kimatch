# SQL — liste blanche d'emails autorisés à créer un compte

```sql
create table if not exists public.profils_autorises (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  invite_par_profil_id uuid references public.profils(id),
  date_creation timestamptz not null default now()
);

alter table public.profils_autorises enable row level security;

create policy "profils_autorises_read" on public.profils_autorises for select to authenticated using (true);
create policy "profils_autorises_admin_write" on public.profils_autorises for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

create or replace function public.hook_restrict_signup_by_allowlist(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count int;
begin
  v_email := lower(event->'user'->>'email');

  select count(*) into v_count
  from public.profils_autorises
  where lower(email) = v_email;

  if v_count > 0 then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'Cette adresse email n''est pas autorisée à créer un compte sur KiWee OS. Contactez un administrateur.',
      'http_code', 403
    )
  );
end;
$$;

grant execute on function public.hook_restrict_signup_by_allowlist to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup_by_allowlist from authenticated, anon, public;

-- Seed : autoriser les emails déjà connus de l'équipe (ajoute les tiens/celles de Michel si besoin)
insert into public.profils_autorises (email) values
  ('n.ghouma@kiwee-energie.fr'),
  ('obame@kiwee-energie.fr')
on conflict (email) do nothing;
```

## Après avoir lancé ce SQL, active le hook dans le dashboard Supabase

1. Authentication → Auth Hooks → "Add a new hook" → **Before User Created hook**
2. Hook type : **Postgres**
3. Postgres Schema : **public**
4. Postgres function : **hook_restrict_signup_by_allowlist**
5. Active le toggle "Enable Before User Created hook" puis "Create hook"

À partir de là, seuls les emails présents dans `profils_autorises` pourront créer un compte (recevoir un lien magique qui fonctionne). Un email random qui tombe sur le site et demande un lien se fait rejeter silencieusement côté serveur.
