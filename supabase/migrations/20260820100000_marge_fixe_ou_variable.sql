-- Marge fixe ou marge variable : le commercial choisit, et ça change le prix présenté.
--
-- RÉUNION DU 20/08/2026. Michel : « dans l'idéal, ce serait que le commercial choisisse si c'est une
-- marge fixe ou une marge variable. Quand c'est une marge fixe, normalement, ça n'a pas d'impact sur
-- le prix. Et si c'est une marge variable, ça a un impact sur le prix. » Naoëlle précise la nature de
-- la marge fixe : c'est celle que le fournisseur impose et qu'on ne peut pas changer.
--
-- CE QUE ÇA VEUT DIRE POUR LE CALCUL :
--
--   VARIABLE   prix présenté = P0 + marge de référence      (le comportement d'hier)
--   FIXE       prix présenté = P0                            la marge est DANS le prix du fournisseur
--
-- Autrement dit, en marge fixe le P0 n'est plus un prix nu : le fournisseur a déjà pris sa marge
-- dedans. On l'enregistre pour la connaître — c'est elle qui dit ce que rapporte le dossier — mais
-- l'ajouter au P0 la compterait deux fois et gonflerait le prix annoncé au client.
--
-- DEUX COLONNES, ET NON UNE SEULE RÉUTILISÉE. On aurait pu ranger les deux marges dans
-- `marge_reelle_eur_mwh` et se contenter du drapeau. Ce serait un piège : basculer de fixe à variable
-- ferait alors entrer dans le prix un montant saisi pour une autre règle, sans que personne le
-- demande. Deux colonnes, chacune avec son sens, et le basculement ne déplace aucun chiffre.
--
-- LE DÉFAUT EST `VARIABLE` : c'est le cas courant du courtage, et c'est ce que faisaient déjà les
-- lignes existantes. Se tromper vers VARIABLE affiche un prix client trop élevé — visible tout de
-- suite. Se tromper vers FIXE afficherait un prix trop bas, ce qui ne se voit pas et se signe.
--
-- LISTE FERMÉE PAR CHECK : c'est un aiguillage de calcul, une faute de frappe y ferait prendre le
-- mauvais chemin en silence.

begin;

alter table public.offres_fournisseurs_compteurs
  add column if not exists type_marge text not null default 'VARIABLE',
  add column if not exists marge_fixe_eur_mwh numeric;

alter table public.offres_fournisseurs_compteurs
  drop constraint if exists offres_fournisseurs_compteurs_type_marge_check;

alter table public.offres_fournisseurs_compteurs
  add constraint offres_fournisseurs_compteurs_type_marge_check
  check (type_marge = any (array['VARIABLE', 'FIXE']));

comment on column public.offres_fournisseurs_compteurs.type_marge is
  'VARIABLE : la marge de référence s''ajoute au P0 pour former le prix présenté au client. FIXE : le fournisseur impose sa marge, elle est déjà comprise dans son P0 — on l''enregistre dans marge_fixe_eur_mwh sans l''ajouter au prix.';
comment on column public.offres_fournisseurs_compteurs.marge_fixe_eur_mwh is
  'Marge imposée par le fournisseur, en €/MWh, quand type_marge vaut FIXE. Enregistrée pour être connue, JAMAIS ajoutée au prix présenté : elle est déjà dans le P0 du fournisseur.';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select type_marge, count(*) from public.offres_fournisseurs_compteurs group by 1;
--   -- attendu : VARIABLE sur toutes les lignes existantes
--
--   select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='offres_fournisseurs_compteurs'
--     and column_name in ('type_marge','marge_fixe_eur_mwh');
--   -- attendu : 2 lignes, text et numeric
--
-- À FAIRE ENSUITE, hors migration : les composantes de contribution en électricité. Michel doit
-- envoyer les documents gaz et électricité qui les listent (« ça, je vais te l'envoyer parce que ça,
-- tu l'as pas forcément »). En attendant, l'écran expose le budget contribution en €/an sans le
-- décomposer, plutôt que d'inventer des composantes.
