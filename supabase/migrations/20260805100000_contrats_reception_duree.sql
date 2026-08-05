-- Flot Contrat (Tools, ContratWizard.tsx étape "Durée") : la date de fin n'est jamais saisie à la
-- main -- elle est calculée à partir de la date de début + une durée en mois (saisie libre, sans
-- préréglages). Ajoute aussi la date de réception souhaitée, absente jusqu'ici.
alter table public.contrats
  add column if not exists duree_mois integer,
  add column if not exists date_reception_souhaitee date;

comment on column public.contrats.duree_mois is 'Durée du contrat en mois, saisie libre (Tools: ContratWizard "Durée (mois)") -- date_fin est calculée à partir de date_debut + duree_mois, jamais saisie directement';
comment on column public.contrats.date_reception_souhaitee is 'Date de réception souhaitée du contrat signé (Tools: ContratWizard étape Durée, jour ouvré uniquement)';
