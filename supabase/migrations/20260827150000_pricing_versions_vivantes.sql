-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PRICING : ÉCARTER LES VERSIONS AU STATUT MORT, ET EXPOSER LA DATE DE COTATION SOUHAITÉE
--
-- Michel, 27/08/2026, après avoir vu la page à 191 lignes : d'accord pour retirer les versions
-- expirées. Il ajoute que les statuts de version doivent devenir modifiables à la main, « il y a eu
-- trop de bugs à l'import Salesforce » — ce qui répond à la question que je lui posais et lève la
-- réserve de la migration précédente.
--
-- ══ CE QUE ÇA DONNE, MESURÉ ══
--
--   recommandations en cours, version courante                     190 consultations
--     · statut de version EXPIREE                                  135   ← écartées
--     · EN_CONSTRUCTION 37 · DISPONIBLE 11 · EN_DECISION 7           55   ← conservées
--
-- La page passe donc de 191 à 55 lignes : 18 à demander, 34 en attente, 3 offres reçues.
--
-- (J'avais annoncé 57 hier. Le bon chiffre est 55 : mon estimation ne retirait pas les statuts
--  ACCEPTEE et REFUSEE, qui sont morts eux aussi.)
--
-- ══ LA LISTE DES STATUTS MORTS, ET POURQUOI CELLE-LÀ ══
--
--   ACCEPTEE   la version a été retenue : la consultation fournisseur est finie
--   REFUSEE    le client a dit non
--   REMPLACEE  une version plus récente a pris la main
--   EXPIREE    le délai est passé
--   ARCHIVEE   rangée
--
-- Les statuts VIVANTS sont donc, en creux : EN_CONSTRUCTION, BROUILLON, DISPONIBLE, A_VALIDER,
-- EN_DECISION, VALIDEE, PRESENTEE. La liste est écrite en négatif VOLONTAIREMENT : un statut ajouté
-- demain dans la table de référence apparaîtra dans le Pricing plutôt que d'en disparaître en
-- silence. Un oubli qui montre trop se voit et se corrige ; un oubli qui cache ne se voit jamais.
--
-- ══ LA DATE DE COTATION SOUHAITÉE ══
--
-- Michel veut la voir sur les tuiles de la colonne « à demander », sans avoir à cliquer, et trier
-- dessus — les retards et les échéances proches en premier.
--
-- Elle vit sur `versions_recommandation.date_souhaitee`, saisie dans le formulaire de cotation sous
-- « Date souhaitée » et reprise de `Cotation__c.Livraison_attendue_le__c`. Vérifié : les 55
-- consultations conservées la portent TOUTES. Le tri ne laissera donc aucune carte sans date en fin
-- de liste, ce qui aurait été le vrai piège d'un tri sur une colonne à trous.
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
  v.id                                                as version_id,
  v.numero_version,
  coalesce(v.version_actuelle, false)                  as version_courante,
  sv.code                                              as version_statut,
  -- Écrit en négatif : un statut ajouté plus tard sera considéré vivant, donc visible.
  (coalesce(sv.code, '') not in ('ACCEPTEE', 'REFUSEE', 'REMPLACEE', 'EXPIREE', 'ARCHIVEE'))
                                                       as version_vivante,
  -- ── La date de cotation souhaitée, et son retard ──
  v.date_souhaitee::date                               as date_cotation_souhaitee,
  -- Le nombre de jours d'ici à cette date : négatif = en retard, 0 = aujourd'hui. Calculé EN BASE
  -- pour que le tri serveur et l'étiquette affichée reposent sur la même valeur — deux calculs, l'un
  -- en SQL pour trier et l'autre en JavaScript pour afficher, finissent toujours par se contredire
  -- un jour de changement d'heure.
  (v.date_souhaitee::date - current_date)              as jours_avant_cotation,
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
  'Une consultation fournisseur et son état courant, pour la page Pricing. La page croise TROIS filtres : reco_en_cours (recommandation non close), version_courante (version de travail) et version_vivante (statut de version non terminal), ce qui ramène 3 527 consultations à 55. date_cotation_souhaitee et jours_avant_cotation servent l''affichage et le tri des tuiles — les retards d''abord (Michel, 27/08/2026).';

grant select on public.v_pricing_consultations to authenticated, anon, service_role;

commit;
