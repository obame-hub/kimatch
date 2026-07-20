# SQL pour recréer parametres_slack

```sql
create table if not exists parametres_slack (
  module text primary key,
  channel_id text,
  channel_name text,
  enabled boolean not null default false
);

alter table parametres_slack enable row level security;

create policy "parametres_slack_read" on parametres_slack for select to authenticated using (true);
create policy "parametres_slack_admin_write" on parametres_slack for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

insert into parametres_slack (module, enabled) values
  ('compte', false),
  ('contrat', false)
on conflict (module) do nothing;
```

À quoi ça sert : une ligne par module (`compte`, `contrat`) qui dit sur quel canal Slack notifier et si c'est activé. Lecture ouverte à tous les connectés, écriture réservée aux rôles SUPER_ADMIN/ADMIN (dépend de la fonction `has_role_acces` déjà créée avec le système de rôles).
