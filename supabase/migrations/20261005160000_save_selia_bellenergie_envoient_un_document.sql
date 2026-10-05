-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SAVE, SELIA ET LA BELLENERGIE : TRADEO, MAIS UNE PROPOSITION EN DOCUMENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Michel, 05/10/2026 (Slack, 15 h 47), à la question « SAVE, SELIA et La Bellenergie rendent-ils
-- leurs prix par Tradeo, ou envoient-ils un document comme Picoty ? » : « comme Picoty et Energem ».
-- Même réglage qu'eux (migration 20261005110000) : ils déclenchent l'homologation, ils ne sont pas
-- interrogés par l'API ; leur proposition se dépose sur le tableau du Pricer.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

update comptes_fournisseurs cf
   set tradeo_prix_automatiques = false
  from comptes c
 where c.id = cf.compte_id
   and upper(c.nom) in ('SAVE', 'SELIA', 'LA BELLENERGIE');

commit;
