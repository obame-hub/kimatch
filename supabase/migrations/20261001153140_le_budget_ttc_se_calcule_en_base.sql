-- LE BUDGET TTC SE CALCULE EN BASE — William, 01/10/2026 : « au lieu d'afficher HTVA et TTC (bien que
-- les 2 doivent être calculés en base) ». Le Pricer bascule de l'un à l'autre ; la base porte les deux.
-- TVA à 20 % sur toute la facture d'électricité et de gaz depuis le 1er août 2025 (l'abonnement est
-- passé de 5,5 % à 20 %). Colonne calculée : elle suit le HTVA, existant compris, sans écriture.
alter table public.offres_fournisseurs_compteurs
  add column if not exists cout_total_annuel_estime_ttc numeric
  generated always as (round(cout_total_annuel_estime_ht * 1.2, 2)) stored;

comment on column public.offres_fournisseurs_compteurs.cout_total_annuel_estime_ttc is
  'Budget annuel TTC de la ligne offre × compteur : HTVA × 1,20 (TVA 20 % depuis le 01/08/2025), au centime.';
