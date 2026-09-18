-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE PRICING SE RANGE PAR VERSION, PLUS PAR CONSULTATION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 18/09/2026 : « j'aimerais complètement repenser la page Pricing avec la nouvelle
-- articulation que l'on a mise au point pour les versions sur la page recommandation. […] Deux
-- colonnes seulement, En construction et Disponible. […] Au clic sur la version, se déroulent
-- ensuite les fournisseurs avec pour chacun d'entre eux leur statut. »
--
-- ══ POURQUOI L'OBJET CHANGE, ET PAS SEULEMENT L'ÉCRAN ══
--
-- `v_pricing_consultations` rend UNE LIGNE PAR FOURNISSEUR CONSULTÉ. Une version consultée chez
-- quatre fournisseurs produisait donc quatre cartes, réparties dans quatre colonnes différentes
-- selon l'avancement de chacun — une même demande client éclatée sur toute la largeur de l'écran.
-- On ne pouvait pas répondre à « où en est ce dossier ? » sans rassembler mentalement des cartes
-- qu'on ne voyait jamais côte à côte.
--
-- La version est l'unité de travail : c'est elle qui porte la date de livraison souhaitée, c'est
-- elle qui devient Disponible, et c'est elle qu'Erwan livre. Les fournisseurs sont son détail —
-- d'où le `jsonb` embarqué plutôt qu'une seconde requête au clic : 102 versions portent 174
-- consultations en tout, soit 1,7 en moyenne et 6 au maximum. Le détail coûte moins cher à
-- transporter qu'à aller chercher.
--
-- ══ CE QUE LA VUE FILTRE, ET CE QU'ELLE LAISSE À L'ÉCRAN ══
--
-- Elle expose les mêmes drapeaux que l'ancienne — dossier en cours, version courante — plutôt que
-- de filtrer en dur. Les décisions d'affichage appartiennent à la page, et les garder ici obligerait
-- à une migration pour changer d'avis. Elle ne garde en revanche QUE les deux statuts vivants :
-- une version clôturée n'attend plus rien d'un fournisseur, et c'est la question de cette page.
--
-- ══ L'ANCIENNE VUE N'EST PAS SUPPRIMÉE ══
--
-- `v_pricing_consultations` n'a plus aucun appelant côté application, mais elle porte sept
-- migrations de règles affinées avec Michel et Naoëlle entre le 26/08 et le 02/09/2026. La
-- supprimer maintenant, le jour où l'écran change de forme, rendrait un retour en arrière coûteux
-- pour un gain nul — une vue inutilisée ne consomme rien.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace view v_pricing_versions as
with dernier_suivi as (
  -- Le statut courant d'une consultation est son dernier événement de suivi. `distinct on` évite le
  -- `group by` sur toutes les colonnes ; l'ordre départage deux événements du même horodatage par
  -- l'ordre du référentiel, comme le fait déjà v_pricing_consultations.
  select distinct on (f.optimisation_fournisseur_id)
    f.optimisation_fournisseur_id,
    s.code as statut_code,
    s.libelle as statut_libelle,
    f.date_evenement
  from suivis_consultations_fournisseurs f
  join statuts_consultations_fournisseurs s on s.id = f.statut_id
  order by f.optimisation_fournisseur_id, f.date_evenement desc nulls last, s.ordre desc
),
consultations as (
  select
    op.version_recommandation_id as version_id,
    ofr.id as consultation_id,
    coalesce(fo.nom, 'Fournisseur inconnu') as fournisseur_nom,
    -- « À TRAITER » QUAND PERSONNE N'A RIEN DIT. L'état de départ d'une consultation n'est pas écrit
    -- en base : un statut que personne n'a posé n'est pas un événement (migration du 18/09/2026).
    -- Il est déduit ici, une seule fois, plutôt que dans chaque écran qui lit cette vue.
    coalesce(d.statut_code, 'A_TRAITER') as statut_code,
    coalesce(d.statut_libelle, 'À traiter') as statut_libelle,
    d.date_evenement,
    -- Le circuit du fournisseur vit sur SA fiche, pas sur la consultation : « outil en ligne » veut
    -- dire qu'aucune demande ne part, et l'écran doit pouvoir le dire sans compter ce fournisseur
    -- parmi les relances à faire.
    coalesce(cf.mode_consultation, 'EMAIL') as mode_consultation
  from optimisations_fournisseurs ofr
  join optimisations op on op.id = ofr.optimisation_id
  left join comptes fo on fo.id = ofr.fournisseur_compte_id
  left join comptes_fournisseurs cf on cf.compte_id = ofr.fournisseur_compte_id
  left join dernier_suivi d on d.optimisation_fournisseur_id = ofr.id
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
        'fournisseur_nom', fournisseur_nom,
        'statut_code', statut_code,
        'statut_libelle', statut_libelle,
        'date_evenement', date_evenement,
        'mode_consultation', mode_consultation
      )
      -- Les reçues d'abord, les refusées en dernier : on lit ce qui est arrivé avant ce qu'on
      -- attend, et ce qu'on attend avant ce qui ne viendra pas.
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
  -- LE DÉCOMPTE EST CALCULÉ EN BASE, comme sur l'ancienne page : un décompte fait deux fois — une
  -- en SQL pour trier, une en JavaScript pour afficher — finit par se contredire un jour de
  -- changement d'heure ou sur un navigateur réglé sur un autre fuseau.
  (v.date_souhaitee - current_date) as jours_avant_livraison,
  v.date_presentation_client,
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
  'Le Pricing rangé par version : deux colonnes de statut, les fournisseurs consultés embarqués en jsonb. Voir la migration du 18/09/2026.';
