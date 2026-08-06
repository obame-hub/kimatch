-- ============================================================
-- Notifications email par module, sur le meme modele que parametres_slack.
-- Valeurs reprises de l'export Tools du 04/08/2026 (email_settings.csv) : les destinataires ne
-- sont donc PAS codes en dur dans l'application, ils restent modifiables depuis Parametres.
--
-- Tools envoie un email a chaque demande de contrat et a chaque cotation. Kimatch avait deja la
-- notification Slack mais pas l'email.
-- ============================================================

create table if not exists public.parametres_emails (
  module text primary key,
  actif boolean not null default false,
  destinataires text[] not null default '{}',
  copies text[] not null default '{}',
  copies_cachees text[] not null default '{}',
  sujet_template text,
  date_modification timestamptz not null default now()
);

comment on table public.parametres_emails is 'Destinataires des notifications email par module (Tools: email_settings). Modifiable depuis Paramètres, jamais codé en dur.';
comment on column public.parametres_emails.sujet_template is 'Gabarit du sujet, avec des jetons remplacés à l''envoi (ex. {contractName}, {supplierName}).';

alter table public.parametres_emails enable row level security;
drop policy if exists "authenticated_all" on public.parametres_emails;
create policy "authenticated_all" on public.parametres_emails for all to authenticated using (true) with check (true);

insert into public.parametres_emails (module, actif, destinataires, copies, sujet_template) values
  ('contrat',  true, '{"e.ozimo@kiwee-energie.fr"}', '{"w.goupil@kiwee-energie.fr"}', '[Contrat] {contractName} — {supplierName}'),
  ('cotation', true, '{"e.ozimo@kiwee-energie.fr"}', '{"w.goupil@kiwee-energie.fr"}', '[Cotation] {cotationName} — {accountName}')
on conflict (module) do nothing;
