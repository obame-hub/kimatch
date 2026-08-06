-- ============================================================
-- Rattrapage : trois colonnes prevues par des migrations du 04/08/2026 mais jamais appliquees
-- en production. Detecte le 06/08 en comparant les `add column` de toutes les migrations du depot
-- au schema reel (37 des 38 colonnes attendues etaient bien la, ces 3 manquaient).
--
-- Impact constate :
--   contrats.strategie_tarifaire -> la creation d'une demande de contrat echouait SILENCIEUSEMENT
--     (useCreateContrat avale l'erreur et renvoie persisted:false), le wizard se fermait sans rien
--     creer.
--   compteurs.date_echeance -> preremplissage de la date de debut du contrat et calcul de la date
--     de fin de fourniture dans le moteur d'eligibilite.
--   mandats.numero -> numero lisible du mandat.
--
-- Reprend a l'identique 20260804150000, 20260804200000 et 20260804250000. Idempotent.
-- ============================================================

alter table public.mandats add column if not exists numero integer;
comment on column public.mandats.numero is 'Numero lisible du mandat (Tools: Mandat__c.Name)';

alter table public.compteurs add column if not exists date_echeance date;
comment on column public.compteurs.date_echeance is 'Echeance du contrat en cours sur ce PDL — optionnelle (souvent inconnue), sert au preremplissage de la date de debut et au calcul DDF/DFF';

alter table public.contrats add column if not exists strategie_tarifaire text default 'marge_fixe';
comment on column public.contrats.strategie_tarifaire is 'marge_fixe (defaut) | prix_cible (uniquement si type_prix = Fixe) — Tools: ContratWizard etape Preferences';
