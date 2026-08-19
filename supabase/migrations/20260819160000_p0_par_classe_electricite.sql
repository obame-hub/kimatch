-- Un P0 par classe tarifaire, côté électricité.
--
-- DEMANDE DE NAOËLLE, 19/08/2026, suite de l'appel avec Michel : « pour l'électricité, il faudra
-- juste avoir les mêmes champs, il faudra juste rajouter P0 ». Le modèle du gaz, transposé aux huit
-- classes horosaisonnières :
--
--   prix_<classe>_mwh  =  prix_<classe>_p0_mwh  +  marge de référence
--        présenté               saisi                  saisie
--
-- HUIT COLONNES, UNE PAR CLASSE, et non un P0 unique. C'est le point que Michel avait laissé ouvert
-- (« sur l'électricité, c'est PHP, tu sais, ces prix d'électricité là »), et Naoëlle l'a tranché en
-- nommant les huit champs. C'est aussi le seul choix qui tienne : un fournisseur ne cote pas la
-- pointe au même prix que les heures creuses d'été, donc un P0 par classe est ce qu'il communique.
--
-- LA MARGE RESTE UNIQUE PAR POINT DE LIVRAISON, sur `offres_fournisseurs_compteurs`. Elle s'ajoute à
-- CHAQUE classe : c'est la lecture littérale de « les mêmes champs avec la marge », et celle qui
-- reproduit le gaz. HYPOTHÈSE À CONFIRMER avec Michel : si la marge devait se moduler par classe, il
-- faudrait huit marges, et il faut le dire avant que la saisie commence — les colonnes sont vides
-- aujourd'hui, elles ne le resteront pas.
--
-- AUCUNE REPRISE DE DONNÉES : `offres_compteurs_electricite` compte 0 ligne (vérifié le 19/08/2026),
-- contrairement au gaz où trois lignes de test ont dû être converties. Rien à convertir ici, et donc
-- aucun risque de mal interpréter une valeur existante.
--
-- NOMMAGE. Le schéma porte déjà `prix_base_mwh`, `prix_hph_mwh`… : on insère `_p0` avant l'unité, ce
-- qui donne `prix_base_p0_mwh`. Le tri alphabétique garde ainsi chaque P0 à côté de son prix, et
-- l'unité reste en fin de nom comme partout ailleurs.

begin;

alter table public.offres_compteurs_electricite
  add column if not exists prix_base_p0_mwh numeric,
  add column if not exists prix_hp_p0_mwh numeric,
  add column if not exists prix_hc_p0_mwh numeric,
  add column if not exists prix_hpe_p0_mwh numeric,
  add column if not exists prix_hce_p0_mwh numeric,
  add column if not exists prix_hph_p0_mwh numeric,
  add column if not exists prix_hch_p0_mwh numeric,
  add column if not exists prix_pointe_p0_mwh numeric;

comment on column public.offres_compteurs_electricite.prix_base_p0_mwh is
  'P0 BASE : prix net hors marge, en €/MWh. SAISI. prix_base_mwh en est le résultat, marge comprise.';
comment on column public.offres_compteurs_electricite.prix_hp_p0_mwh is
  'P0 Heures Pleines : prix net hors marge, en €/MWh. SAISI.';
comment on column public.offres_compteurs_electricite.prix_hc_p0_mwh is
  'P0 Heures Creuses : prix net hors marge, en €/MWh. SAISI.';
comment on column public.offres_compteurs_electricite.prix_hpe_p0_mwh is
  'P0 Heures Pleines Été : prix net hors marge, en €/MWh. SAISI.';
comment on column public.offres_compteurs_electricite.prix_hce_p0_mwh is
  'P0 Heures Creuses Été : prix net hors marge, en €/MWh. SAISI.';
comment on column public.offres_compteurs_electricite.prix_hph_p0_mwh is
  'P0 Heures Pleines Hiver : prix net hors marge, en €/MWh. SAISI.';
comment on column public.offres_compteurs_electricite.prix_hch_p0_mwh is
  'P0 Heures Creuses Hiver : prix net hors marge, en €/MWh. SAISI.';
comment on column public.offres_compteurs_electricite.prix_pointe_p0_mwh is
  'P0 Pointe : prix net hors marge, en €/MWh. SAISI.';

-- Les prix présentés cessent d'être des saisies, exactement comme la molécule au gaz.
comment on column public.offres_compteurs_electricite.prix_base_mwh is
  'Prix BASE présenté au client, en €/MWh. CALCULÉ : prix_base_p0_mwh + la marge de référence de la ligne offre × compteur (offres_fournisseurs_compteurs.marge_reelle_eur_mwh). Ne pas saisir directement.';
comment on column public.offres_compteurs_electricite.prix_hp_mwh is
  'Prix Heures Pleines présenté au client, en €/MWh. CALCULÉ : prix_hp_p0_mwh + marge de référence.';
comment on column public.offres_compteurs_electricite.prix_hc_mwh is
  'Prix Heures Creuses présenté au client, en €/MWh. CALCULÉ : prix_hc_p0_mwh + marge de référence.';
comment on column public.offres_compteurs_electricite.prix_hpe_mwh is
  'Prix Heures Pleines Été présenté au client, en €/MWh. CALCULÉ : prix_hpe_p0_mwh + marge de référence.';
comment on column public.offres_compteurs_electricite.prix_hce_mwh is
  'Prix Heures Creuses Été présenté au client, en €/MWh. CALCULÉ : prix_hce_p0_mwh + marge de référence.';
comment on column public.offres_compteurs_electricite.prix_hph_mwh is
  'Prix Heures Pleines Hiver présenté au client, en €/MWh. CALCULÉ : prix_hph_p0_mwh + marge de référence.';
comment on column public.offres_compteurs_electricite.prix_hch_mwh is
  'Prix Heures Creuses Hiver présenté au client, en €/MWh. CALCULÉ : prix_hch_p0_mwh + marge de référence.';
comment on column public.offres_compteurs_electricite.prix_pointe_mwh is
  'Prix Pointe présenté au client, en €/MWh. CALCULÉ : prix_pointe_p0_mwh + marge de référence.';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='offres_compteurs_electricite'
--     and column_name like '%\_p0\_%' order by column_name;
--   -- attendu : 8 lignes — prix_base_p0_mwh, prix_hc_p0_mwh, prix_hce_p0_mwh, prix_hch_p0_mwh,
--   --           prix_hp_p0_mwh, prix_hpe_p0_mwh, prix_hph_p0_mwh, prix_pointe_p0_mwh
--
--   select count(*) from public.offres_compteurs_electricite;
--   -- attendu : inchangé (cette migration n'écrit aucune donnée)
--
-- À FAIRE ENSUITE, hors migration : le budget TURPE sur l'offre fournisseur, que Michel veut voir
-- n'apparaître qu'en électricité tout en comptant dans le budget total. Il a dit lui-même que ce
-- n'était pas urgent, et la formule de calcul du TURPE reste à récupérer.
