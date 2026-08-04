-- Flot Mandat (Tools) : durée du mandat en mois (12/24/36/48, défaut 36) -- sert à calculer
-- date_debut_validite/date_fin_validite à la création et à générer le PDF Kiwee.
alter table public.mandats
  add column if not exists duree_mois integer;

comment on column public.mandats.duree_mois is 'Durée du mandat en mois (12/24/36/48, défaut 36) — Tools: sélecteur du wizard MandatWizard';
