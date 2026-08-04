-- Demande de William (04/08/2026, via Slack) : un champ TEMPORAIRE sur les mandats, juste pour
-- comparer visuellement avec Salesforce pendant l'audit manuel d'Agathe/Erwan. A supprimer une
-- fois l'audit termine (pas une colonne definitive, ne pas la brancher dans les flots a venir).
alter table public.mandats add column if not exists id_salesforce text;
