# Message pour Michel — table pour l'intégration Gmail

Salut Michel,

On vient de brancher l'envoi d'emails dans KiWee OS (chaque conseiller connecte son propre compte Gmail). Il faut juste une nouvelle table pour stocker les tokens OAuth de chaque conseiller.

## SQL à exécuter

```sql
create table if not exists profils_gmail_tokens (
  profil_id uuid primary key references profils(id) on delete cascade,
  email_gmail text not null,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  date_connexion timestamptz not null default now()
);

alter table profils_gmail_tokens enable row level security;

create policy "profils_gmail_tokens_self_select" on profils_gmail_tokens
  for select using (auth.uid() = profil_id);

create policy "profils_gmail_tokens_self_delete" on profils_gmail_tokens
  for delete using (auth.uid() = profil_id);
```

## À quoi ça sert

- Une ligne par conseiller qui a connecté son Gmail (clé = `profil_id`, donc `profils.id` qui référence déjà `auth.users`).
- `refresh_token`/`access_token` : uniquement écrits par le serveur (via la clé service_role), jamais par le client — pas de politique INSERT/UPDATE pour le rôle `authenticated`, seul le rôle `service_role` peut écrire (il bypasse RLS).
- Les conseillers peuvent lire leur propre `email_gmail`/`date_connexion` (pour afficher "connecté en tant que...") et supprimer leur propre ligne (bouton "Déconnecter").

Merci !
