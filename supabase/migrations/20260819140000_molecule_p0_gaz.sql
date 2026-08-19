-- Molécule P0 : le prix net du fournisseur, hors marge. La molécule devient un calcul.
--
-- APPEL DE MICHEL DU 19/08/2026 (8:14 → 25:11). Il tâtonne longtemps puis conclut net :
--
--   « Il nous faut un champ qui s'appelle molécule P0. […] Le champ actuel qui s'appelle molécule
--     sera égal à molécule P0 plus marge. […] Je peux supprimer marge ajustable, marge retenue, tu
--     gardes marge de référence. »
--
-- Sa raison : « le prix de la molécule, ce n'est pas juste saisi, c'est quelque chose qui est
-- présenté » au client. Le prix nu du fournisseur, lui, c'est le P0 — « on l'appelait même pas
-- molécule, on l'appelait P0 ». La marge cesse donc d'être un chiffre à part : elle est DANS le prix
-- présenté, et changer la marge change la molécule.
--
--   molécule (présentée) = molécule P0 (saisie) + marge de référence (saisie)
--
-- UNE SEULE COLONNE AJOUTÉE. `prix_energie_mwh` garde son rôle — le prix de la molécule — et devient
-- un résultat écrit par l'application, comme le sont déjà les budgets annuels. La marge de référence
-- reste où elle est, sur `offres_fournisseurs_compteurs`, puisqu'elle vaut pour le PDL et non pour la
-- seule composante gaz.
--
-- REPRISE DES 3 LIGNES EXISTANTES (les tests de Naoëlle du 19/08). Avant aujourd'hui,
-- `prix_energie_mwh` portait le prix fournisseur NU et la marge s'ajoutait par-dessus dans le budget
-- énergie. C'est donc exactement le P0 : on le recopie, puis on recalcule la molécule présentée.
-- Sans cette reprise, les deux lignes déjà saisies afficheraient une molécule sans marge à côté d'un
-- budget qui en contient une.
--
-- CE QUE JE NE SUPPRIME PAS, et pourquoi : `marge_ajustable_eur_mwh` et `marge_retenue_eur_mwh`
-- disparaissent de l'écran, comme Michel le demande, mais leurs colonnes restent. Elles ont été
-- créées ce matin, la logique des marges a changé trois fois en une matinée, et un `drop column` ne
-- se rejoue pas. Elles sont vides de sens désormais mais ne coûtent rien ; le jour où la logique est
-- stable, une migration de ménage les enlèvera d'un trait.

begin;

alter table public.offres_compteurs_gaz
  add column if not exists prix_molecule_p0_mwh numeric;

comment on column public.offres_compteurs_gaz.prix_molecule_p0_mwh is
  'Prix net de la molécule hors marge, en €/MWh — le « P0 » du fournisseur. SAISI.';
comment on column public.offres_compteurs_gaz.prix_energie_mwh is
  'Prix de la molécule présenté au client, en €/MWh. CALCULÉ : prix_molecule_p0_mwh + la marge de référence de la ligne offre × compteur (offres_fournisseurs_compteurs.marge_reelle_eur_mwh). Ne pas saisir directement.';

-- Reprise. Le P0 d'abord, en une seule instruction pour ne pas lire une colonne qu'on vient
-- d'écrire : `prix_energie_mwh` sert de source à `prix_molecule_p0_mwh` ET de cible, donc les deux
-- affectations se calculent sur l'état d'AVANT l'update — c'est la sémantique de SQL, et elle est ici
-- exactement ce qu'on veut.
update public.offres_compteurs_gaz g
   set prix_molecule_p0_mwh = g.prix_energie_mwh,
       prix_energie_mwh = g.prix_energie_mwh + coalesce(ofc.marge_reelle_eur_mwh, 0)
  from public.offres_fournisseurs_compteurs ofc
 where ofc.id = g.offre_compteur_id
   and g.prix_energie_mwh is not null
   and g.prix_molecule_p0_mwh is null;

commit;

-- Vérification après application (à coller tel quel) :
--
--   select g.prix_molecule_p0_mwh p0, ofc.marge_reelle_eur_mwh marge, g.prix_energie_mwh molecule,
--          g.prix_molecule_p0_mwh + coalesce(ofc.marge_reelle_eur_mwh, 0) attendu
--     from public.offres_compteurs_gaz g
--     join public.offres_fournisseurs_compteurs ofc on ofc.id = g.offre_compteur_id
--    where g.prix_molecule_p0_mwh is not null;
--   -- attendu : molecule = attendu sur chaque ligne
--
--   select count(*) from public.offres_compteurs_gaz where prix_energie_mwh is not null
--     and prix_molecule_p0_mwh is null;
--   -- attendu : 0 — aucune molécule sans son P0
--
-- À FAIRE ENSUITE, hors migration :
--   · L'ÉLECTRICITÉ. Michel : « il faudra juste rajouter P0 » sur les prix par classe (HP, HC, HPH…),
--     et il prépare une note. Ne pas dupliquer ces colonnes à l'aveugle : un P0 par classe tarifaire
--     n'est pas la même chose qu'un P0 unique.
--   · LE BUDGET TURPE sur l'offre fournisseur, qu'il veut ajouter et n'afficher qu'en électricité tout
--     en le comptant dans le total. Il a dit lui-même : « ce n'est pas une urgence, finissons déjà le
--     gaz. »
