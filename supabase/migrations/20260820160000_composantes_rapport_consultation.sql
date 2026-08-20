-- Les composantes qui manquaient pour produire le compte rendu de consultation.
--
-- SOURCE : les deux rapports Enéo que Naoëlle a fournis le 20/08/2026 — un gaz (AO-GN-260812-OJUJ,
-- AGENCE NANTAISE DE GESTION) et un électricité (AO-EL-260811-KCAZ, ÉTUDE CARAUDREY). C'est ce que
-- Michel annonçait la veille : « les informations de contribution […] ça, je vais te l'envoyer parce
-- que ça, tu l'as pas forcément ». Les rapports listent les composantes une par une, et l'application
-- n'en avait qu'une partie.
--
-- CE QUE LES RAPPORTS MONTRENT, structure de budget identique dans les deux énergies :
--
--   Total TTC = TVA + Total HTVA
--   Total HTVA = Abonnement + Énergie + Contributions
--
--     GAZ          Énergie        Molécule + CEE + CPB
--                  Contributions  ATRT + ATRD + AGN + CTA
--     ÉLECTRICITÉ  Énergie        prix par classe horosaisonnière + CEE + GO
--                  Contributions  TURPE + AE + CTA
--
-- CE QUI MANQUAIT, et rien de plus :
--
--   GAZ          prix_atrt_mwh   Accès des Tiers au Réseau de TRANSPORT — à ne pas confondre avec
--                                l'ATRD, qui est la distribution. Les deux figurent côte à côte dans
--                                le rapport, et l'ATRT y vaut 0,00 avec la mention « inclus dans
--                                l'abonnement » : la colonne doit donc exister pour porter ce zéro,
--                                qui n'est pas une absence de donnée.
--
--   ÉLECTRICITÉ  prix_cee_mwh    Les CEE existent aussi en électricité. Elles n'étaient que côté gaz.
--                prix_go_mwh     Garanties d'Origine — la part « énergie verte » du rapport, qui
--                                indique « Incluse » ou « Non incluse » selon l'offre.
--                accise_annuel_ht  L'AE (accise sur l'électricité, ex-TICFE). En €/AN dans le
--                                rapport, comme la CTA.
--                cta_annuel_ht   La CTA existe dans les deux énergies. Elle n'était que côté gaz.
--
-- POURQUOI PAS DE COLONNE DE TVA. Le rapport l'affiche, mais elle se calcule : 20 % dans les deux
-- documents fournis (2 687,98 sur 13 439,91 au gaz, 388,73 sur 1 943,67 en électricité). Stocker un
-- montant qu'une multiplication redonne créerait une seconde vérité à maintenir. Si un taux réduit
-- doit s'appliquer un jour à certaines lignes, il faudra une colonne de TAUX, pas de montant.
--
-- L'ABONNEMENT ÉLECTRIQUE EST MENSUEL dans le rapport (« / Mois »), alors qu'il est annuel au gaz
-- (« / An »). La colonne existante `abonnement_fourniture_annuel_ht` reste ANNUELLE dans les deux cas
-- — c'est l'écran qui divisera par douze pour l'afficher à la façon du rapport. Une colonne dont
-- l'unité dépend de l'énergie serait une erreur à retardement.
--
-- AUCUNE REPRISE : ces colonnes naissent vides, et rien ne les déduit de l'existant.

begin;

alter table public.offres_compteurs_gaz
  add column if not exists prix_atrt_mwh numeric;

alter table public.offres_compteurs_electricite
  add column if not exists prix_cee_mwh numeric,
  add column if not exists prix_go_mwh numeric,
  add column if not exists accise_annuel_ht numeric,
  add column if not exists cta_annuel_ht numeric;

comment on column public.offres_compteurs_gaz.prix_atrt_mwh is
  'ATRT — Accès des Tiers au Réseau de TRANSPORT (NaTran, Teréga), en €/MWh. Distinct de l''ATRD, qui est la distribution. Vaut souvent 0 parce qu''il est inclus dans l''abonnement : ce zéro est une information, pas une absence.';
comment on column public.offres_compteurs_electricite.prix_cee_mwh is
  'Certificats d''économies d''énergie refacturés, en €/MWh. Composante du budget ÉNERGIE.';
comment on column public.offres_compteurs_electricite.prix_go_mwh is
  'Garanties d''Origine, en €/MWh — la part « énergie verte » du compte rendu de consultation, incluse ou non selon l''offre. Composante du budget ÉNERGIE.';
comment on column public.offres_compteurs_electricite.accise_annuel_ht is
  'AE — accise sur l''électricité (ex-TICFE), en €/AN. Fixée par l''État, identique chez tous les fournisseurs. Composante du budget CONTRIBUTIONS.';
comment on column public.offres_compteurs_electricite.cta_annuel_ht is
  'CTA — Contribution Tarifaire d''Acheminement, en €/AN. Existe en électricité comme au gaz. Composante du budget CONTRIBUTIONS.';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select table_name, column_name from information_schema.columns
--   where table_schema='public'
--     and (table_name='offres_compteurs_gaz' and column_name='prix_atrt_mwh'
--       or table_name='offres_compteurs_electricite'
--          and column_name in ('prix_cee_mwh','prix_go_mwh','accise_annuel_ht','cta_annuel_ht'))
--   order by table_name, column_name;
--   -- attendu : 5 lignes
--
--   select count(*) from public.offres_compteurs_electricite where accise_annuel_ht is not null;
--   -- attendu : 0 — cette migration n'écrit aucune donnée
--
-- CE QUE LE RAPPORT CONTIENT ENCORE ET QUE L'APPLICATION N'A PAS, noté pour ne pas le redécouvrir :
--   · les courbes de prix de marché EEX (Cal annuels sur trois ans et trois mois) — aucune donnée de
--     marché n'entre dans Kimatch aujourd'hui ;
--   · une description commerciale par fournisseur (« fondé en 2005, actif au niveau national… ») —
--     `comptes_fournisseurs` n'a pas de champ pour cela ;
--   · la volatilité et l'évolution versus l'offre de reconduction, qui supposent de distinguer l'offre
--     ACTUELLE et l'offre de RECONDUCTION des offres proposées — c'est l'« offre de référence » dont
--     Michel parlait le 19/08, toujours pas modélisée.
