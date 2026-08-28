-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE PRICING REBRANCHÉ SUR LES NOUVEAUX STATUTS
--
-- La refonte du 28/08/2026 a cassé cette vue, et je l'avais annoncée à Michel comme réglant son bug.
-- C'était l'inverse. Constaté à l'écran juste après : 2 645 consultations en « En attente
-- fournisseur » au lieu de 153.
--
-- ══ DEUX CAUSES, TOUTES DEUX DANS CETTE VUE ══
--
-- 1. LA COLONNE CHERCHAIT UN CODE QUI N'EXISTE PLUS. Le `case` testait `statut_code = 'RECUE'` pour
--    ranger dans « Offres reçues ». Or « Offre reçue » a fusionné avec « Demande acceptée » : les
--    1 378 consultations acceptées tombaient donc dans le `else`, c'est-à-dire « En attente ».
--
-- 2. `version_vivante` ÉTAIT ÉCRIT EN NÉGATIF, et ce choix — bon à l'époque — s'est retourné contre
--    nous. Il excluait ACCEPTEE, REFUSEE, REMPLACEE, EXPIREE, ARCHIVEE, en se disant qu'un statut
--    ajouté plus tard apparaîtrait plutôt que de disparaître en silence. Un statut a été ajouté :
--    CLOTUREE. Il est donc passé pour vivant, et les 3 472 consultations de versions closes avec lui.
--
--    LA LEÇON EST SUR LE RAISONNEMENT, PAS SUR LE CODE : écrire en négatif protège d'un oubli
--    d'affichage, mais expose à un oubli de filtrage. Ici le jeu de statuts est désormais fermé et
--    court — quatre codes, dont un seul terminal — donc le positif est à la fois plus sûr et plus
--    lisible : est vivante une version en construction, disponible ou en décision.
--
-- ══ LA CORRESPONDANCE, TELLE QUE MICHEL L'A ÉCRITE ══
--
--   Aucun traitement   →  À demander              (aucun événement de suivi)
--   Demande envoyée    →  En attente fournisseur
--   Demande acceptée   →  Offres reçues           « le fournisseur accepte et transmet sa proposition »
--   Demande refusée    →  Refusées                (hors tableau par défaut)
--
-- C'est cette troisième ligne qui règle son bug : une version présentée au client n'a plus ses
-- consultations en attente, puisque les offres sont arrivées.
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
  -- ── L'état de la recommandation ──
  et.code                                              as recommandation_etape,
  (coalesce(et.code, '') not in ('CLOTUREE'))          as reco_en_cours,
  -- ── L'état de la version ──
  v.id                                                as version_id,
  v.numero_version,
  coalesce(v.version_actuelle, false)                  as version_courante,
  sv.code                                              as version_statut,
  v.resultat                                          as version_resultat,
  -- ÉCRIT EN POSITIF, désormais : seuls ces trois statuts sont vivants. Voir l'en-tête.
  (coalesce(sv.code, '') in ('EN_CONSTRUCTION', 'DISPONIBLE', 'EN_DECISION'))
                                                       as version_vivante,
  -- ── La date de cotation souhaitée, et son retard ──
  v.date_souhaitee::date                               as date_cotation_souhaitee,
  (v.date_souhaitee::date - current_date)              as jours_avant_cotation,
  -- ── La colonne du kanban, selon la correspondance de Michel ──
  case
    when d.statut_code is null       then 'A_DEMANDER'
    when d.statut_code = 'ENVOYEE'   then 'EN_ATTENTE'
    when d.statut_code = 'ACCEPTEE'  then 'RECUE'
    when d.statut_code = 'REFUSEE'   then 'REFUSEE'
    -- Un code hérité et désactivé tombe ici. On le range en attente plutôt que de le perdre : une
    -- consultation invisible est un travail qu'on ne fera jamais.
    else 'EN_ATTENTE'
  end                                                  as colonne
from public.optimisations_fournisseurs ofr
join public.optimisations op            on op.id = ofr.optimisation_id
join public.versions_recommandation v   on v.id = op.version_recommandation_id
left join public.statuts_versions_recommandation sv on sv.id = v.statut_version_id
join public.recommandations r           on r.id = v.recommandation_id
left join public.etapes_recommandation et on et.id = r.etape_id
left join public.comptes cp             on cp.id = r.compte_id
left join public.comptes fo             on fo.id = ofr.fournisseur_compte_id
left join public.types_energies te      on te.id = r.type_energie_id
left join dernier_suivi d               on d.optimisation_fournisseur_id = ofr.id
left join offre_du_fournisseur od       on od.optimisation_fournisseur_id = ofr.id
where r.actif;

comment on view public.v_pricing_consultations is
  'Une consultation fournisseur et son état courant, pour la page Pricing. Trois filtres croisés par la page : reco_en_cours, version_courante et version_vivante. Les colonnes suivent la correspondance de Michel du 28/08/2026 : aucun traitement → à demander, demande envoyée → en attente, demande acceptée → offres reçues, demande refusée → refusées.';

grant select on public.v_pricing_consultations to authenticated, anon, service_role;

commit;
