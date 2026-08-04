-- Flot PDL (Tools) : échéance du contrat fournisseur en cours sur ce PDL, saisie optionnelle à
-- la création -- sert notamment au calcul du préavis de résiliation côté Opportunité (flot suivant).
alter table public.compteurs
  add column if not exists date_echeance date;

comment on column public.compteurs.date_echeance is 'Échéance du contrat fournisseur actuel sur ce PDL (optionnelle) — Tools: PDL.Echeance__c';
