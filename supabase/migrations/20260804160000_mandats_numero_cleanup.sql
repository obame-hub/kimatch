-- Correctif : la colonne "numero" ajoutee dans la migration precedente
-- (20260804150000_mandats_numero.sql) etait redondante -- une colonne "reference" (text, unique)
-- existait deja sur mandats, simplement jamais alimentee ni utilisee cote app. On l'utilise a la
-- place, avec le vrai numero Salesforce (Mandat__c.Name, ex. "Mandat 000007") comme valeur.
alter table public.mandats drop constraint if exists mandats_numero_unique;
alter table public.mandats drop column if exists numero;
drop sequence if exists public.mandats_numero_seq;
