-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES FOURNISSEURS « INSTANTANÉS » RÉPONDENT PAR TRADEO
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Michel, 05/10/2026, en testant le Pricer avec William : il ajoute Ekwateur, GEG et Mint Energie à
-- une commande, et « ça ne se remplit pas, comme s'il ne les trouvait pas ». Ekwateur et Mint Energie
-- n'avaient AUCUN mode de réponse : le bouton « Tradeo » du Pricer n'interroge que les fournisseurs
-- au mode TRADEO, il les sautait. Tradeo, lui, les cotait (LA MARMOTTE GOURMANDE, même jour).
--
-- La règle de Michel, d'après son export « Conditions fournisseurs » du 23/09/2026 : un délai de
-- réponse « Instantané » veut dire que le fournisseur passe par Tradeo — SAUF SEFE et ILEK, qui
-- répondent sur leur propre plateforme.
--
-- Cinq fournisseurs instantanés n'étaient pas au mode TRADEO :
--   EKWATEUR, MINT ENERGIE   aucun mode
--   TOTAL ENERGIES           GRILLE      (Tradeo le cote : « Total », 05/10/2026)
--   MET ENERGIE, OHM ENERGIE PLATEFORME
--
-- On n'enlève RIEN : les fournisseurs déjà au mode TRADEO avec un délai de 2 ou 3 jours (GEG, SAVE,
-- SELIA, LA BELLENERGIE, Picoty, Energem) y restent — « instantané ⇒ Tradeo » ne dit pas l'inverse.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

update comptes_fournisseurs cf
   set mode_reponse = 'TRADEO'
  from comptes c
 where c.id = cf.compte_id
   and upper(c.nom) in ('EKWATEUR', 'MINT ENERGIE', 'TOTAL ENERGIES', 'MET ENERGIE', 'OHM ENERGIE')
   and cf.response_delay_days = 0
   and cf.mode_reponse is distinct from 'TRADEO';

commit;
