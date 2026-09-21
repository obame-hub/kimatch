-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE FOURNISSEUR CONSULTÉ PORTE L'IDENTIFIANT DE SON COMPTE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 18/09/2026 : « il faut tout câbler, même les mails ». Et plus tôt : « il faut proposer
-- d'envoyer le mail à un des contacts du compte fournisseur en question ; en fonction du choix, ça
-- met le bon destinataire ».
--
-- Sans le compte du fournisseur, « Écrire au fournisseur » n'a nulle part où chercher ses contacts.
-- La vue portait son NOM, ce qui suffit à l'afficher mais pas à retrouver ses interlocuteurs.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace view v_pricing_versions as
with dernier_suivi as (
  select distinct on (f.optimisation_fournisseur_id)
    f.optimisation_fournisseur_id,
    s.code as statut_code,
    s.libelle as statut_libelle,
    f.date_evenement
  from suivis_consultations_fournisseurs f
  join statuts_consultations_fournisseurs s on s.id = f.statut_id
  order by f.optimisation_fournisseur_id, f.date_evenement desc nulls last, s.ordre desc
),
combinaisons as (
  select
    o.optimisation_fournisseur_id,
    jsonb_agg(
      jsonb_build_object('id', o.id, 'duree_mois', o.duree_mois, 'type_prix', o.type_prix, 'statut', o.statut)
      order by o.duree_mois nulls last, o.type_prix
    ) as combinaisons
  from offres_fournisseurs o
  where o.actif and o.optimisation_fournisseur_id is not null
  group by o.optimisation_fournisseur_id
),
consultations as (
  select
    op.version_recommandation_id as version_id,
    ofr.id as consultation_id,
    ofr.fournisseur_compte_id,
    coalesce(fo.nom, 'Fournisseur inconnu') as fournisseur_nom,
    coalesce(d.statut_code, 'A_TRAITER') as statut_code,
    coalesce(d.statut_libelle, 'À traiter') as statut_libelle,
    d.date_evenement,
    coalesce(cf.mode_consultation, 'EMAIL') as mode_consultation,
    -- LE MODE DE RÉPONSE, renseigné par William le 18/09/2026 sur les dix-huit partenaires. NULL sur
    -- un fournisseur jamais qualifié : l'écran le dira plutôt que d'inventer un circuit.
    cf.mode_reponse,
    coalesce(cb.combinaisons, '[]'::jsonb) as combinaisons
  from optimisations_fournisseurs ofr
  join optimisations op on op.id = ofr.optimisation_id
  left join comptes fo on fo.id = ofr.fournisseur_compte_id
  left join comptes_fournisseurs cf on cf.compte_id = ofr.fournisseur_compte_id
  left join dernier_suivi d on d.optimisation_fournisseur_id = ofr.id
  left join combinaisons cb on cb.optimisation_fournisseur_id = ofr.id
),
par_version as (
  select
    version_id,
    count(*) as nb_fournisseurs,
    count(*) filter (where statut_code = 'DISPONIBLE') as nb_recues,
    count(*) filter (where statut_code = 'REFUSEE') as nb_refusees,
    count(*) filter (where statut_code not in ('DISPONIBLE', 'REFUSEE')) as nb_attendus,
    jsonb_agg(
      jsonb_build_object(
        'id', consultation_id,
        'fournisseur_compte_id', fournisseur_compte_id,
        'fournisseur_nom', fournisseur_nom,
        'statut_code', statut_code,
        'statut_libelle', statut_libelle,
        'date_evenement', date_evenement,
        'mode_consultation', mode_consultation,
        'mode_reponse', mode_reponse,
        'combinaisons', combinaisons
      )
      order by
        case statut_code when 'DISPONIBLE' then 0 when 'REFUSEE' then 2 else 1 end,
        fournisseur_nom
    ) as fournisseurs
  from consultations
  group by version_id
)
select
  v.id as version_id,
  v.numero_version,
  v.nom as version_nom,
  sv.code as version_statut,
  sv.libelle as version_statut_libelle,
  v.date_souhaitee,
  (v.date_souhaitee - current_date) as jours_avant_livraison,
  v.date_presentation_client,
  v.date_creation as version_date_creation,
  r.id as recommandation_id,
  r.nom as recommandation_nom,
  r.montant,
  cp.id as compte_id,
  cp.nom as compte_nom,
  cp.proprietaire_id as compte_proprietaire_id,
  r.proprietaire_id as recommandation_proprietaire_id,
  te.code as type_energie,
  et.code as recommandation_etape,
  coalesce(et.code, '') <> 'CLOTUREE' as reco_en_cours,
  coalesce(v.version_actuelle, false) as version_courante,
  coalesce(pv.nb_fournisseurs, 0) as nb_fournisseurs,
  coalesce(pv.nb_recues, 0) as nb_recues,
  coalesce(pv.nb_refusees, 0) as nb_refusees,
  coalesce(pv.nb_attendus, 0) as nb_attendus,
  coalesce(pv.fournisseurs, '[]'::jsonb) as fournisseurs
from versions_recommandation v
join statuts_versions_recommandation sv on sv.id = v.statut_version_id
join recommandations r on r.id = v.recommandation_id
left join etapes_recommandation et on et.id = r.etape_id
left join comptes cp on cp.id = r.compte_id
left join types_energies te on te.id = r.type_energie_id
left join par_version pv on pv.version_id = v.id
where sv.code in ('EN_CONSTRUCTION', 'DISPONIBLE');

comment on view v_pricing_versions is
  'Le Pricing rangé par version : statut, échéance, et les fournisseurs consultés avec leur mode de réponse et leurs combinaisons durée × type de prix, embarqués en jsonb. Voir les migrations du 18/09/2026.';

