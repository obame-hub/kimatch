-- Mécanisme de capacité par poste horaire, et TURPE en quatre parts.
--
-- DEMANDE DE NAOËLLE, 20/08/2026, après l'appel où Michel demande de reprendre le modèle de l'étude
-- client de William : « ajoute les composantes en base ». Les composantes en question sont celles que
-- sa maquette détaille et que Kimatch n'avait pas.
--
-- CE QUE LA MAQUETTE MONTRE, relevé dans « Etude Client.dc.html » :
--
--   ÉNERGIE, par poste horaire   POSTE · CONSO · ÉLECTRON · CAPACITÉ · TOTAL/AN
--   TURPE, en quatre tuiles      Gestion · Comptage · Soutirage fixe · Soutirage variable
--   TAXES, en deux tuiles        CTA · AE (accise)
--
-- L'ÉLECTRON EXISTE DÉJÀ : c'est `prix_<classe>_mwh`, la part fourniture pure négociée avec le
-- fournisseur — exactement ce que la maquette nomme ainsi. Rien à ajouter.
--
-- LA CTA ET L'ACCISE EXISTENT DÉJÀ, ajoutées ce matin par 20260820160000. Rien à ajouter non plus.
--
-- CE QUI MANQUAIT, et rien de plus :
--
--   LA CAPACITÉ, PAR CLASSE. Le mécanisme de capacité garantit l'approvisionnement lors des pointes
--   nationales, et il se facture au poste horaire — la maquette lui donne un prix différent par poste
--   (6,10 en pointe, 2,20 en creuses d'été). Une colonne unique écraserait cette différence, qui est
--   précisément ce qui rend la pointe chère. Huit colonnes donc, une par classe, sur le modèle des P0
--   posés ce matin.
--
--   LE TURPE, EN QUATRE PARTS. La maquette le décompose en gestion, comptage, soutirage fixe et
--   soutirage variable, et son commentaire dit pourquoi cette découpe compte : « part fixe du
--   soutirage : calculée sur vos puissances souscrites — c'est elle que l'optimisation TURPE
--   réduit ». Sans elle, impossible de montrer au client ce que l'optimisation des puissances lui
--   ferait gagner : c'est le socle de l'étude de puissance dont Michel dit qu'elle viendra plus tard.
--
-- `prix_turpe_annuel_ht` RESTE, et devient le total. Un fournisseur ou un calcul externe annonce
-- parfois le TURPE global sans le détailler : on doit pouvoir le noter tel quel. Quand les quatre
-- parts sont saisies, c'est leur somme qui fait foi — l'écran le calcule, il n'y a pas deux vérités
-- en base.
--
-- TOUT EN €/AN POUR LE TURPE, comme dans la maquette : ses quatre composantes sont des montants
-- annuels, pas des prix au mégawattheure. La capacité, elle, est bien au MWh puisqu'elle se
-- multiplie par la consommation du poste.

begin;

alter table public.offres_compteurs_electricite
  -- La capacité, un prix par classe horosaisonnière.
  add column if not exists prix_base_capacite_mwh numeric,
  add column if not exists prix_hp_capacite_mwh numeric,
  add column if not exists prix_hc_capacite_mwh numeric,
  add column if not exists prix_hpe_capacite_mwh numeric,
  add column if not exists prix_hce_capacite_mwh numeric,
  add column if not exists prix_hph_capacite_mwh numeric,
  add column if not exists prix_hch_capacite_mwh numeric,
  add column if not exists prix_pointe_capacite_mwh numeric,
  -- Le TURPE, en quatre parts annuelles.
  add column if not exists turpe_gestion_annuel_ht numeric,
  add column if not exists turpe_comptage_annuel_ht numeric,
  add column if not exists turpe_soutirage_fixe_annuel_ht numeric,
  add column if not exists turpe_soutirage_variable_annuel_ht numeric;

comment on column public.offres_compteurs_electricite.prix_base_capacite_mwh is
  'Mécanisme de capacité pour la classe BASE, en €/MWh. Garantit l''approvisionnement du réseau lors des pointes nationales ; se facture par poste horaire, d''où une colonne par classe.';
comment on column public.offres_compteurs_electricite.prix_hp_capacite_mwh is
  'Mécanisme de capacité, Heures Pleines, en €/MWh.';
comment on column public.offres_compteurs_electricite.prix_hc_capacite_mwh is
  'Mécanisme de capacité, Heures Creuses, en €/MWh.';
comment on column public.offres_compteurs_electricite.prix_hpe_capacite_mwh is
  'Mécanisme de capacité, Heures Pleines Été, en €/MWh.';
comment on column public.offres_compteurs_electricite.prix_hce_capacite_mwh is
  'Mécanisme de capacité, Heures Creuses Été, en €/MWh.';
comment on column public.offres_compteurs_electricite.prix_hph_capacite_mwh is
  'Mécanisme de capacité, Heures Pleines Hiver, en €/MWh.';
comment on column public.offres_compteurs_electricite.prix_hch_capacite_mwh is
  'Mécanisme de capacité, Heures Creuses Hiver, en €/MWh.';
comment on column public.offres_compteurs_electricite.prix_pointe_capacite_mwh is
  'Mécanisme de capacité, Pointe, en €/MWh. C''est le poste où elle est la plus chère.';

comment on column public.offres_compteurs_electricite.turpe_gestion_annuel_ht is
  'TURPE — composante de gestion, en €/AN. Frais fixes de gestion du dossier par le gestionnaire de réseau.';
comment on column public.offres_compteurs_electricite.turpe_comptage_annuel_ht is
  'TURPE — composante de comptage, en €/AN. Location et entretien du compteur.';
comment on column public.offres_compteurs_electricite.turpe_soutirage_fixe_annuel_ht is
  'TURPE — part fixe du soutirage, en €/AN. Calculée sur les puissances souscrites : c''est elle que réduit une optimisation de puissance, et donc la seule qui rende cette optimisation chiffrable.';
comment on column public.offres_compteurs_electricite.turpe_soutirage_variable_annuel_ht is
  'TURPE — part variable du soutirage, en €/AN. Proportionnelle à l''énergie réellement acheminée.';
comment on column public.offres_compteurs_electricite.prix_turpe_annuel_ht is
  'TURPE total de ce PDL, en €/AN. Saisi tel quel quand le détail n''est pas connu ; sinon c''est la somme des quatre composantes (gestion, comptage, soutirage fixe et variable) qui fait foi, calculée à l''affichage pour éviter deux vérités en base.';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='offres_compteurs_electricite'
--     and (column_name like '%capacite%' or column_name like 'turpe\_%')
--   order by column_name;
--   -- attendu : 12 lignes — 8 de capacité, 4 de TURPE
--
--   select count(*) from public.offres_compteurs_electricite where prix_pointe_capacite_mwh is not null;
--   -- attendu : 0 — cette migration n'écrit aucune donnée
--
-- CE QUI RESTE HORS D'ATTEINTE, et pourquoi : la maquette de William affiche aussi une courbe de
-- charge et une analyse des puissances souscrites atteintes. Elles supposent les relevés de puissance
-- du compteur, que Kimatch ne reçoit pas. C'est l'étude de puissance dont Michel dit « on n'a pas
-- encore travaillé » — la part fixe du soutirage, elle, est désormais là pour l'accueillir.
