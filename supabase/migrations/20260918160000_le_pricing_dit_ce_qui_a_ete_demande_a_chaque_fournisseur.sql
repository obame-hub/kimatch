-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE PRICING DIT CE QUI A ÉTÉ DEMANDÉ À CHAQUE FOURNISSEUR
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 18/09/2026 : « il faudrait ajouter sur la ligne des fournisseurs les mois demandés ainsi
-- que le type de prix ».
--
-- ══ C'EST CE QUI DISTINGUE DEUX LIGNES D'UN MÊME FOURNISSEUR ══
--
-- Un fournisseur consulté sur 24 et 36 mois répond deux fois, et la ligne ne disait ni combien de
-- réponses on attendait de lui, ni sur quoi. « GAZ EUROPEEN — Demande acceptée » ne permet pas de
-- savoir si l'accord porte sur une durée ou sur trois, alors que c'est exactement la question quand
-- une proposition partielle arrive.
--
-- Mesuré le 18/09/2026 : 219 combinaisons sur 174 consultations, toutes renseignées en durée ET en
-- type de prix. Aucune ligne ne restera muette là où une offre existe.
--
-- ══ POURQUOI C'EST DANS LA VUE ET NON UNE SECONDE REQUÊTE ══
--
-- Même raison que les fournisseurs eux-mêmes : trois combinaisons au maximum par consultation, deux
-- cent dix-neuf en tout sur la page entière. Le détail coûte moins cher à transporter qu'à aller
-- chercher, et il doit être là AVANT le clic — c'est lui qui explique pourquoi une version attend
-- encore alors que le fournisseur a déjà répondu.
--
-- LE STATUT DE L'OFFRE VOYAGE AVEC ELLE. Une combinaison indisponible se barre à l'écran plutôt que
-- de disparaître : un fournisseur qui a répondu sur 24 mois et refusé les 36 a répondu à ce qu'on
-- lui demandait, et effacer la ligne refusée ferait croire qu'on ne la lui avait jamais demandée.
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
  -- Ce qu'on a demandé à chaque fournisseur : une ligne par durée × type de prix. Triées par durée
  -- croissante puis par type, pour que « 24 fixe / 24 indexé / 36 fixe » se lise dans cet ordre et
  -- pas dans celui des insertions.
  select
    o.optimisation_fournisseur_id,
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'duree_mois', o.duree_mois,
        'type_prix', o.type_prix,
        'statut', o.statut
      )
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
    coalesce(fo.nom, 'Fournisseur inconnu') as fournisseur_nom,
    -- « À TRAITER » QUAND PERSONNE N'A RIEN DIT. L'état de départ d'une consultation n'est pas écrit
    -- en base : un statut que personne n'a posé n'est pas un événement (migration du 18/09/2026).
    coalesce(d.statut_code, 'A_TRAITER') as statut_code,
    coalesce(d.statut_libelle, 'À traiter') as statut_libelle,
    d.date_evenement,
    -- Le circuit du fournisseur vit sur SA fiche, pas sur la consultation : « outil en ligne » veut
    -- dire qu'aucune demande ne part.
    coalesce(cf.mode_consultation, 'EMAIL') as mode_consultation,
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
        'fournisseur_nom', fournisseur_nom,
        'statut_code', statut_code,
        'statut_libelle', statut_libelle,
        'date_evenement', date_evenement,
        'mode_consultation', mode_consultation,
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
  'Le Pricing rangé par version : deux colonnes de statut, les fournisseurs consultés et leurs combinaisons durée × type de prix embarqués en jsonb. Voir les migrations du 18/09/2026.';
