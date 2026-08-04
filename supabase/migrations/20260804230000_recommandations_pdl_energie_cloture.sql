-- Flot Opportunité/Recommandation (Tools) : énergie de l'opportunité, date de clôture calculée,
-- type d'opportunité dérivé (Renouvellement/Captation), et périmètre PDL précis (au lieu du
-- site) -- une reco Tools porte sur des points de livraison, pas des sites entiers.
alter table public.recommandations
  add column if not exists type_energie_id uuid references public.types_energies(id),
  add column if not exists date_cloture date,
  add column if not exists type_opportunite text;

comment on column public.recommandations.type_energie_id is 'Énergie de l''opportunité (électricité/gaz) — Tools: Opportunity.Energie__c';
comment on column public.recommandations.date_cloture is 'Date de clôture visée — Tools: Opportunity.CloseDate, calculée par défaut à échéance PDL - 2 mois';
comment on column public.recommandations.type_opportunite is 'Renouvellement | Captation — dérivé automatiquement du mix client/prospect des PDL sélectionnés, jamais choisi manuellement';

create table if not exists public.recommandations_compteurs (
  recommandation_id uuid not null references public.recommandations(id) on delete cascade,
  compteur_id uuid not null references public.compteurs(id) on delete cascade,
  primary key (recommandation_id, compteur_id)
);

comment on table public.recommandations_compteurs is 'Périmètre PDL précis d''une recommandation (Tools: Opportunity → PDL), en complément de recommandations_sites (dérivé, gardé pour compat affichage)';

alter table public.recommandations_compteurs enable row level security;
create policy "authenticated_all" on public.recommandations_compteurs for all to authenticated using (true) with check (true);
