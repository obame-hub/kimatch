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
-- PREMIÈRE TENTATIVE REFUSÉE, ET POURQUOI CETTE VERSION COCHE LES DEUX ÉNERGIES.
--
-- La version initiale ne renseignait ni `fournit_electricite` ni `fournit_gaz`, pour ne pas
-- inventer ce qu'un fournisseur vend. La base l'a refusée (erreur 23514) :
--
--     CHECK ((fournit_electricite = true) OR (fournit_gaz = true))
--
-- Au moins une énergie est donc obligatoire. J'ai cherché à la DÉDUIRE de l'historique réel —
-- fournisseurs consultés → optimisation → version → compteurs → type d'énergie — plutôt que du
-- nom du compte : **0 déductible sur 33**. Même ENGIE (2 consultations) et VATTENFALL (4) ne
-- donnent rien, parce que le chemin passe par `versions_recommandation_compteurs`, qui ne compte
-- que 13 lignes dans toute la base. La donnée n'existe pas.
--
-- Les deux énergies sont donc cochées, avec `statut_partenariat` à 'A_QUALIFIER' — ce qui est
-- exact : ces fiches sont créées vides et restent à qualifier.
--
-- Le choix assumé : une fiche trop large se voit et se corrige, une fiche trop étroite ne se voit
-- pas. Ne cocher que l'électricité ferait disparaître GAZ DE BARR ou GAZ DE BORDEAUX des
-- consultations gaz sans que personne ne s'en aperçoive. À l'inverse, un fournisseur gaz proposé
-- sur une consultation électricité est immédiatement visible par le conseiller, qui choisit ses
-- fournisseurs à la main.
--
-- CONTREPARTIE À CONNAÎTRE : jusqu'à qualification, les 32 fiches ressortent sur les deux
-- énergies. C'est le prix de ne rien masquer. Qualifier au fil de l'eau, ou faire une passe
-- dédiée avec Michel qui connaît le marché.
--
-- ENEDIS EST VOLONTAIREMENT EXCLU. Il figure parmi les comptes de type fournisseur, mais c'est le
-- gestionnaire du réseau de distribution : il n'a jamais vendu d'électricité et ne peut pas être
-- consulté sur une offre. Lui créer une fiche fournisseur ancrerait l'erreur au lieu de la
-- signaler. Son classement en « fournisseur » est à corriger séparément — porté au document
-- POINTS-A-ARBITRER.

begin;

insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz)
select co.id, true, true
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
--   select statut_partenariat, fournit_electricite, fournit_gaz, count(*)
--   from public.comptes_fournisseurs group by 1,2,3 order by 4 desc;
--   -- les 32 nouvelles doivent être en A_QUALIFIER
