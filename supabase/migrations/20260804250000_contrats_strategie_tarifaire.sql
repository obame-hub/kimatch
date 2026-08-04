-- Flot Contrat (Tools) : stratégie tarifaire ("Marge fixe" par défaut vs "Prix cible", ce
-- dernier disponible seulement si le type de prix est "Fixe") -- zone volontairement incomplète
-- côté Tools (pas d'intelligence de prix de marché derrière), simple champ texte ici aussi.
alter table public.contrats
  add column if not exists strategie_tarifaire text default 'marge_fixe';

comment on column public.contrats.strategie_tarifaire is 'marge_fixe (défaut) | prix_cible (uniquement si type_prix = Fixe) — Tools: ContratWizard étape Préférences';
