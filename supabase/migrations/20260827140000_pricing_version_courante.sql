-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PRICING : NE MONTRER QUE LES CONSULTATIONS DE LA VERSION COURANTE
--
-- Naoëlle, 27/08/2026, après un retour de Michel qui trouvait qu'il restait « encore trop
-- d'éléments » : « tu as filtré seulement sur les recommandations, ce qui est ok, mais il faut aussi
-- qu'on filtre sur les versions actives, sinon c'est pas logique ».
--
-- Elle a raison, et le défaut était dans la vue depuis le début : la jointure sur
-- `versions_recommandation` ne regardait pas `version_actuelle`. Une recommandation reprise trois
-- fois affichait donc les consultations de ses TROIS versions, dont deux abandonnées. On demandait
-- au pricing de relancer des fournisseurs sur une offre qui n'existe plus.
--
--   321 recommandations portent plus d'une version, pour 2 027 versions au total.
--
-- ══ CE QUE LE FILTRE RETIRE ══
--
--   recommandations en cours (filtre du 20260827130000)            306 consultations
--   + version courante seulement                                   192 consultations
--
-- Soit 114 consultations rattachées à une version qui n'est plus la version de travail.
--
-- ══ CE QUE JE N'AI PAS FILTRÉ, ET POURQUOI ══
--
-- Le premier réflexe serait d'aller plus loin et d'écarter aussi les versions dont le STATUT dit
-- qu'elles sont expirées : cela ramènerait la page à 57 lignes, ce qui collerait encore mieux à la
-- remarque de Michel. Je ne l'ai pas fait, et c'est délibéré.
--
-- Mesuré sur les 192 consultations restantes :
--
--   reco à l'étape CONSULTATION  ×  version au statut EXPIREE   →   96 consultations
--   reco à l'étape BROUILLON     ×  version au statut EXPIREE   →   29 consultations
--
-- Une recommandation en cours de consultation dont la version courante serait « expirée » est une
-- CONTRADICTION, pas une information. Deux faits l'expliquent :
--
--   · aucune de ces 135 versions ne porte de `date_expiration` — le statut ne vient donc pas d'un
--     calcul de date, il a été posé tel quel ;
--   · 1 171 des 1 242 versions au statut EXPIREE portent un `id_salesforce` : elles viennent de la
--     reprise, où ce statut traduisait probablement autre chose.
--
-- Filtrer là-dessus reviendrait à faire disparaître 135 consultations sur la foi d'un statut dont on
-- ne sait pas ce qu'il voulait dire dans Salesforce. C'est exactement le raisonnement que Michel
-- interdit : ne rien déduire d'un mécanisme qu'on ne comprend pas. La question lui est posée ; si
-- « EXPIREE » est bien un statut mort, ajouter la clause est une ligne.
--
-- ══ UN BOOLÉEN, PAS UN `where` ══
--
-- Même raison que pour `reco_en_cours` : filtrer dans la vue rendrait les 114 consultations des
-- anciennes versions inatteignables pour tout autre usage. La vue expose, la page décide.
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
  (coalesce(et.code, '') not in ('ACCEPTEE', 'REFUSEE', 'ABANDONNEE'))
                                                       as reco_en_cours,
  -- ── L'état de la version ──
  -- `version_courante` est le second filtre de la page. `coalesce` sur false : une version dont le
  -- drapeau serait nul n'est pas la version de travail (aucun cas aujourd'hui, la clause est là
  -- pour demain).
  v.id                                                 as version_id,
  v.numero_version,
  coalesce(v.version_actuelle, false)                  as version_courante,
  -- Le statut de version est EXPOSÉ mais délibérément PAS utilisé comme filtre : voir l'en-tête,
  -- 96 consultations ont une reco en consultation et une version dite expirée.
  sv.code                                              as version_statut,
  -- ── La colonne du kanban ──
  case
    when d.statut_code = 'RECUE'                                    then 'RECUE'
    when d.statut_code is null                                      then 'A_DEMANDER'
    when d.statut_code = 'REFUSEE'                                  then 'REFUSEE'
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
  'Une consultation fournisseur et son état courant, pour la page Pricing. Trois colonnes déduites des statuts de suivi, plus « refusées » sur demande. La page croise DEUX filtres : `reco_en_cours` (recommandation non close) et `version_courante` (version de travail), ce qui ramène 3 526 consultations à 192. `version_statut` est exposé mais non filtré : 96 consultations ont une reco en consultation et une version dite EXPIREE, statut hérité de Salesforce et donc non fiable.';

grant select on public.v_pricing_consultations to authenticated, anon, service_role;

commit;
