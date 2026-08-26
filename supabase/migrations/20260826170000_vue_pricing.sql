-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA PAGE PRICING : v_pricing_consultations
--
-- Règle n° 7 du dossier UX du 26/08/2026 : « Gérer les offres fournisseurs par statut : à demander,
-- en attente fournisseur, offres reçues et validées. »
--
-- ══ RIEN À CRÉER : LA DONNÉE EXISTE, ET ELLE EST RICHE ══
--
-- Avant d'écrire une table, j'ai regardé. `suivis_consultations_fournisseurs` porte 5 409 événements
-- horodatés sur 3 487 consultations, avec huit statuts déjà définis dans
-- `statuts_consultations_fournisseurs` : demande envoyée, accusé de réception, relancée, informations
-- complémentaires demandées, demande acceptée, acceptée partiellement, offre reçue, refusée.
--
-- C'est exactement le suivi que sa page décrit, et il tourne depuis la reprise Salesforce. Créer un
-- second mécanisme aurait produit deux vérités sur le même fait.
--
-- ══ SES QUATRE COLONNES, DEPUIS NOS HUIT STATUTS ══
--
--   À DEMANDER            aucun événement de suivi : le fournisseur est rattaché à l'optimisation,
--                         la demande n'est pas partie. C'est le seul statut qui se déduit d'une
--                         ABSENCE, et c'est pourquoi la vue part des fournisseurs et non des suivis.
--   EN ATTENTE FOURNISSEUR demande envoyée, accusé de réception, relancée, informations demandées,
--                         demande acceptée ou acceptée partiellement — la balle est chez eux.
--   OFFRES REÇUES         « Offre reçue » : il y a quelque chose à comparer.
--   VALIDÉES              l'offre du fournisseur porte `est_offre_recommandee` : c'est celle qu'on a
--                         retenue. Le statut de consultation ne le dit pas — la validation est une
--                         décision de Kiwee, pas un événement du fournisseur.
--
-- « Demande refusée » sort du tableau : un fournisseur qui refuse de coter n'est plus dans le
-- pipeline, et l'y laisser gonflerait « en attente » de 57 dossiers morts.
--
-- ══ L'ÉTAT COURANT, ET NON L'HISTORIQUE ══
--
-- `distinct on` rend le dernier événement de chaque consultation. L'ordre de tri porte sur la date
-- PUIS sur l'ordre du statut : deux événements enregistrés à la même seconde par un import se
-- départagent alors par l'avancement, et non au hasard — sans quoi une consultation pourrait
-- apparaître « envoyée » alors que son offre est arrivée.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop view if exists public.v_pricing_consultations;

create view public.v_pricing_consultations
with (security_invoker = true) as
with dernier_suivi as (
  select distinct on (f.optimisation_fournisseur_id)
    f.optimisation_fournisseur_id,
    s.code    as statut_code,
    s.libelle as statut_libelle,
    f.date_evenement
  from public.suivis_consultations_fournisseurs f
  join public.statuts_consultations_fournisseurs s on s.id = f.statut_id
  order by f.optimisation_fournisseur_id, f.date_evenement desc nulls last, s.ordre desc
),
offre_du_fournisseur as (
  select
    o.optimisation_fournisseur_id,
    max(o.montant_annuel_ht)                                  as montant_annuel_ht,
    max(o.prix_moyen_mwh)                                      as prix_moyen_mwh,
    bool_or(coalesce(o.est_offre_recommandee, false))          as est_retenue,
    count(*)                                                   as nb_offres
  from public.offres_fournisseurs o
  where o.actif and o.optimisation_fournisseur_id is not null
  group by o.optimisation_fournisseur_id
)
select
  ofr.id                                              as consultation_id,
  ofr.optimisation_id,
  r.id                                                as recommandation_id,
  r.nom                                               as recommandation_nom,
  cp.nom                                              as compte_nom,
  cp.id                                               as compte_id,
  fo.nom                                              as fournisseur_nom,
  te.code                                             as type_energie,
  d.statut_code,
  d.statut_libelle,
  d.date_evenement,
  coalesce(od.nb_offres, 0)                            as nb_offres,
  od.montant_annuel_ht,
  od.prix_moyen_mwh,
  coalesce(od.est_retenue, false)                      as est_retenue,
  -- ── La colonne du kanban ──
  case
    when coalesce(od.est_retenue, false)                            then 'VALIDEE'
    when d.statut_code = 'RECUE'                                    then 'RECUE'
    when d.statut_code is null                                      then 'A_DEMANDER'
    when d.statut_code = 'REFUSEE'                                  then 'REFUSEE'
    else 'EN_ATTENTE'
  end                                                  as colonne
from public.optimisations_fournisseurs ofr
join public.optimisations op            on op.id = ofr.optimisation_id
join public.versions_recommandation v   on v.id = op.version_recommandation_id
join public.recommandations r           on r.id = v.recommandation_id
left join public.comptes cp             on cp.id = r.compte_id
left join public.comptes fo             on fo.id = ofr.fournisseur_compte_id
left join public.types_energies te      on te.id = r.type_energie_id
left join dernier_suivi d               on d.optimisation_fournisseur_id = ofr.id
left join offre_du_fournisseur od       on od.optimisation_fournisseur_id = ofr.id
where r.actif;

comment on view public.v_pricing_consultations is
  'Une consultation fournisseur et son état courant, pour la page Pricing. Quatre colonnes déduites des huit statuts de suivi : à demander (aucun événement), en attente fournisseur, offre reçue, validée (offre retenue). Règle n° 7 du dossier UX du 26/08/2026.';

grant select on public.v_pricing_consultations to authenticated, anon, service_role;

commit;
