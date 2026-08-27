-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PRICING : NE MONTRER QUE LES RECOMMANDATIONS EN COURS, ET RETIRER « VALIDÉES »
--
-- Naoëlle, 27/08/2026 : « est-ce que dans pricing tu peux filtrer juste les recos en cours, car le
-- pricing n'a besoin de voir que ça — là il y a tout et c'est pas ce qu'on veut. Et enlève la colonne
-- validée, elle ne sert à rien ici. »
--
-- ══ CE QUE LE FILTRE RETIRE, MESURÉ ══
--
-- Les 3 469 consultations de la page se répartissent ainsi selon l'étape de leur recommandation :
--
--   en cours   BROUILLON 74 · CONSULTATION 199 · A_PRESENTER 19 · PRESENTEE 17     =   309
--   closes     ACCEPTEE 1 548 · REFUSEE 763 · ABANDONNEE 906                       = 3 217
--
-- La page passe donc de 3 469 à environ 305 lignes (les refusées restant hors tableau par défaut).
-- Ce n'est pas un dégraissage cosmétique : 93 % de ce qui était affiché portait sur des dossiers déjà
-- tranchés, sur lesquels PERSONNE N'A PLUS RIEN À FAIRE côté pricing. Relancer un fournisseur pour
-- une affaire abandonnée en 2025 n'a pas de sens, et ces lignes noyaient les 151 demandes réellement
-- en attente — le seul vrai sujet de cette page.
--
-- ══ « EN COURS » N'EST PAS REDÉFINI ICI ══
--
-- La règle existe déjà dans l'application (`ETAPES_CLOSES` de `lib/data/recommandations.ts`) et vient
-- de Michel, 26/08/2026 : « acceptée, refusée et abandonnée sont dans clôturé comme d'hab ». La vue
-- reprend ces trois étapes, pas une quatrième. Une recommandation SANS étape est comptée en cours :
-- rien ne prouve qu'elle est close, et la faire disparaître serait perdre une consultation vivante.
-- (Mesuré : aucune ligne dans ce cas aujourd'hui — la clause est là pour demain.)
--
-- ══ POURQUOI UN BOOLÉEN DANS LA VUE, ET NON UN `where` ══
--
-- Filtrer dans la vue elle-même aurait rendu les 3 217 consultations closes inatteignables pour tout
-- autre usage de `v_pricing_consultations`. Le booléen laisse la page décider, et la page filtre.
--
-- ══ LA COLONNE « VALIDÉES » DISPARAÎT SANS EMPORTER SES LIGNES ══
--
-- Le `case` testait `est_retenue` EN PREMIER : une offre retenue partait en « VALIDEE » quel que soit
-- son état de suivi réel. Retirer la colonne de l'écran sans toucher au `case` aurait fait s'évaporer
-- ses lignes — aucune colonne ne les aurait plus réclamées. La branche est donc retirée du `case`, et
-- ces consultations retrouvent la colonne de leur suivi.
--
-- Vérifié sur les 2 lignes concernées : toutes deux portent « Demande acceptée », elles rejoignent
-- donc « En attente fournisseur », qui est leur état exact.
--
-- `est_retenue` RESTE EXPOSÉ : c'est un fait utile (quelle offre a été retenue), ce n'est simplement
-- plus une colonne de kanban. La supprimer aurait été confondre l'affichage et la donnée.
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
  -- ── L'étape de la recommandation, et son état ──
  et.code                                              as recommandation_etape,
  -- Le filtre de la page. `is distinct from` couvre l'étape absente : une recommandation sans étape
  -- n'est pas close, elle est simplement mal renseignée — et sa consultation reste à traiter.
  (coalesce(et.code, '') not in ('ACCEPTEE', 'REFUSEE', 'ABANDONNEE'))
                                                       as reco_en_cours,
  -- ── La colonne du kanban ──
  -- Plus de branche « VALIDEE » : voir l'en-tête. Chaque consultation tombe dans la colonne de son
  -- suivi, et rien d'autre ne décide à sa place.
  case
    when d.statut_code = 'RECUE'                                    then 'RECUE'
    when d.statut_code is null                                      then 'A_DEMANDER'
    when d.statut_code = 'REFUSEE'                                  then 'REFUSEE'
    else 'EN_ATTENTE'
  end                                                  as colonne
from public.optimisations_fournisseurs ofr
join public.optimisations op            on op.id = ofr.optimisation_id
join public.versions_recommandation v   on v.id = op.version_recommandation_id
join public.recommandations r           on r.id = v.recommandation_id
left join public.etapes_recommandation et on et.id = r.etape_id
left join public.comptes cp             on cp.id = r.compte_id
left join public.comptes fo             on fo.id = ofr.fournisseur_compte_id
left join public.types_energies te      on te.id = r.type_energie_id
left join dernier_suivi d               on d.optimisation_fournisseur_id = ofr.id
left join offre_du_fournisseur od       on od.optimisation_fournisseur_id = ofr.id
where r.actif;

comment on view public.v_pricing_consultations is
  'Une consultation fournisseur et son état courant, pour la page Pricing. Trois colonnes déduites des statuts de suivi : à demander (aucun événement), en attente fournisseur, offre reçue — plus « refusées » sur demande. `reco_en_cours` isole les recommandations non closes : la page ne montre que celles-là (Naoëlle, 27/08/2026), 93 % des consultations portant sur des dossiers déjà tranchés.';

grant select on public.v_pricing_consultations to authenticated, anon, service_role;

commit;
