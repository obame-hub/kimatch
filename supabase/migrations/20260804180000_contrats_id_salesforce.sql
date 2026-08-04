-- Meme demande de William que pour les mandats : champ TEMPORAIRE, juste pour comparer
-- visuellement avec Salesforce (recherche par ContractNumber) pendant l'audit manuel d'Agathe.
-- A supprimer une fois l'audit termine.
alter table public.contrats add column if not exists id_salesforce text;
