-- RELEVÉ TECHNIQUE TEMPORAIRE (30/09/2026) : la forme des mesures Enedis reçues à la synchronisation,
-- pour caler la lecture mensuelle. Dates, postes et noms de balises seulement — aucune valeur de
-- consommation. Écrit par le serveur (clé de service), lu par l'équipe technique ; aucune politique :
-- personne d'autre ne le voit. À supprimer une fois la lecture calée.
create table if not exists public.diagnostics_enedis (
  id            uuid primary key default gen_random_uuid(),
  date_creation timestamptz not null default now(),
  numero_point  text not null,
  detail        jsonb not null
);
alter table public.diagnostics_enedis enable row level security;
revoke all on public.diagnostics_enedis from anon, authenticated;
comment on table public.diagnostics_enedis is 'Temporaire : forme des mesures Enedis recues, pour caler la lecture mensuelle.';
