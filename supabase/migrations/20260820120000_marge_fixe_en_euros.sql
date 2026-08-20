-- La marge fixe est un montant en euros, pas un prix au mégawattheure.
--
-- CORRECTION DE NAOËLLE, 20/08/2026 : « un fournisseur peut décider d'une marge fixe de 150 € par
-- exemple, on ne peut pas y toucher — au lieu que ce soit sur le mégawattheure, c'est en € fixe. »
--
-- Je l'avais posée en €/MWh ce matin, par symétrie avec la marge de référence. C'est faux, et la
-- symétrie était justement le piège : une marge fixe ne se rapporte pas au volume. C'est un montant
-- que le fournisseur arrête, indépendant de ce que le client consomme — 150 €, que le PDL tire 10 MWh
-- ou 800.
--
-- CE QUE ÇA CHANGE AU CALCUL : rien, et c'est cohérent. La marge fixe n'entre dans aucun budget
-- présenté au client, puisque le fournisseur l'a déjà comprise dans son P0 (« ça n'a pas d'impact sur
-- le prix », Michel). On l'enregistre pour savoir ce que rapporte le dossier. La différence porte sur
-- l'unité affichée et sur le fait qu'on ne la multiplie jamais par un volume.
--
-- UN RENOMMAGE ET NON UNE NOUVELLE COLONNE : `marge_fixe_eur_mwh` a été créée il y a quelques
-- minutes par la migration 20260820100000 et n'a jamais reçu de valeur (vérifié avant d'écrire ceci).
-- La renommer ne réinterprète donc aucune donnée. Laisser les deux aurait garanti qu'un jour
-- quelqu'un remplisse la mauvaise.
--
-- À APPLIQUER SANS ATTENDRE : le code déployé nomme désormais `marge_fixe_eur`. Entre les deux, une
-- saisie de marge fixe échoue — visiblement, avec le message qui le dit.

begin;

alter table public.offres_fournisseurs_compteurs
  rename column marge_fixe_eur_mwh to marge_fixe_eur;

comment on column public.offres_fournisseurs_compteurs.marge_fixe_eur is
  'Marge que le fournisseur impose, en EUROS et non au MWh — elle ne dépend pas du volume consommé. Renseignée quand type_marge vaut FIXE. JAMAIS ajoutée au prix ni aux budgets présentés au client : le fournisseur l''a déjà comprise dans son P0. Elle sert à connaître ce que rapporte le dossier.';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='offres_fournisseurs_compteurs'
--     and column_name like 'marge_fixe%';
--   -- attendu : une seule ligne, marge_fixe_eur, numeric
--
--   select count(*) from public.offres_fournisseurs_compteurs where marge_fixe_eur is not null;
--   -- attendu : 0 — la colonne n'avait pas encore servi
--
-- RESTE À TRANCHER, et personne ne l'a dit : 150 € par an, ou sur toute la durée du contrat ? L'écran
-- l'affiche aujourd'hui comme un montant annuel, par point de livraison, parce que tous les autres
-- montants de cette table le sont. À confirmer avec Michel avant que la saisie commence.
