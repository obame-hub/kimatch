-- Fiches fournisseurs manquantes — sans elles, aucune offre ne peut être suivie.
--
-- Constat du 16/08/2026 en branchant la création d'offres demandée par Michel :
-- `offres_fournisseurs.compte_fournisseur_id` est NOT NULL et référence
-- `comptes_fournisseurs(compte_id)`, pas `comptes(id)`. Or sur 52 comptes de type fournisseur,
-- seuls 19 ont une ligne dans `comptes_fournisseurs`.
--
-- Conséquence concrète : consulter l'un des 33 autres crée bien le fournisseur consulté, mais
-- son offre ne peut pas exister — donc son statut n'est suivi nulle part. L'application les
-- écarte proprement et le trace en console, mais le vrai correctif est ici : un fournisseur
-- qu'on peut consulter doit avoir sa fiche.
--
-- Seul `compte_id` est obligatoire (vérifié colonne par colonne) : tout le reste a une valeur par
-- défaut. `statut_partenariat` vaut donc 'A_QUALIFIER', ce qui est exact — ces fiches sont créées
-- vides et restent à qualifier. On ne coche NI `fournit_electricite` NI `fournit_gaz` : les
-- deviner d'après le nom du compte serait une invention, et une fiche fournisseur qui annonce
-- fournir du gaz à tort ferait ressortir le fournisseur dans les mauvaises consultations.
--
-- ENEDIS EST VOLONTAIREMENT EXCLU. Il figure parmi les comptes de type fournisseur, mais c'est le
-- gestionnaire du réseau de distribution : il n'a jamais vendu d'électricité et ne peut pas être
-- consulté sur une offre. Lui créer une fiche fournisseur ancrerait l'erreur au lieu de la
-- signaler. Son classement en « fournisseur » est à corriger séparément — porté au document
-- POINTS-A-ARBITRER.

begin;

insert into public.comptes_fournisseurs (compte_id)
select co.id
from public.comptes co
left join public.comptes_fournisseurs cf on cf.compte_id = co.id
where co.type_compte_id in (
        select id from public.types_comptes where code ilike '%fournisseur%'
      )
  and cf.compte_id is null
  -- Gestionnaire de réseau, pas fournisseur : voir l'en-tête.
  and upper(co.nom) <> 'ENEDIS'
on conflict (compte_id) do nothing;

commit;

-- Vérification après application (à coller tel quel) :
--
--   select count(*) from public.comptes_fournisseurs;
--   -- attendu : 19 + 32 = 51
--
--   select co.nom
--   from public.comptes co
--   left join public.comptes_fournisseurs cf on cf.compte_id = co.id
--   where co.type_compte_id in (select id from public.types_comptes where code ilike '%fournisseur%')
--     and cf.compte_id is null;
--   -- attendu : une seule ligne, ENEDIS
--
--   select statut_partenariat, count(*) from public.comptes_fournisseurs group by 1;
--   -- les 32 nouvelles doivent être en A_QUALIFIER
