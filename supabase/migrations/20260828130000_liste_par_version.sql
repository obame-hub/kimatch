-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA LISTE DES RECOMMANDATIONS SE RANGE PAR STATUT DE VERSION
--
-- Michel, 28/08/2026 : « à la place de recommandation, il faut montrer version », puis, sur le mot à
-- garder dans le menu : « on peut laisser le terme recommandation pour ne pas les embrouiller, et on
-- présente uniquement les dernières versions des recommandations en cours ».
--
-- Sa raison, dite deux fois : « sur quoi on travaille, c'est les versions, ce n'est pas les
-- recommandations » et « quand je vais faire un point avec les équipes, je vais regarder plus
-- l'évolution des versions que la recommandation en elle-même ».
--
-- ══ CE QUE LA VUE NE SAVAIT PAS DIRE ══
--
-- Elle portait `etape` — le statut du DOSSIER — et rien de la version. Les colonnes du tableau
-- étaient donc les paliers du dossier, ceux-là mêmes que Michel juge sans intérêt : « consultation,
-- offres reçues, présentées, en réalité ça ne nous apporte rien, puisque ces informations je vais les
-- voir sur la version ».
--
-- On ajoute donc trois colonnes issues de la DERNIÈRE version, sans rien retirer : `etape` reste, la
-- fiche compte et le tableau de bord la lisent.
--
-- ══ « DERNIÈRE VERSION » : LE MÊME ORDRE QUE LE DÉCLENCHEUR ══
--
-- `version_actuelle` d'abord, le plus grand numéro à défaut. Exactement l'ordre de
-- `recalculer_statut_recommandation` (migration 20260828120000) — deux définitions du mot
-- « dernière » finiraient par se contredire, et l'écran afficherait un statut de version qui ne
-- correspond pas au statut de dossier calculé à côté.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop view if exists public.v_recommandations_liste;

create view public.v_recommandations_liste
with (security_invoker = true) as
select r.id,
    r.nom,
    r.priorite,
    r.date_ouverture,
    r.date_cloture,
    r.finalite_cloture,
    r.type_opportunite,
    r.compte_id,
    r.proprietaire_id,
    r.date_creation,
    cp.nom as compte_nom,
    e.code as etape,
    o.libelle as origine,
    te.code as type_energie,
    coalesce((pr.prenom || ' '::text) || pr.nom, ''::text) as conseiller,
    coalesce(v.nb, 0) as nb_versions,
    coalesce(s.sites, '[]'::jsonb) as sites,
    cp.proprietaire_id as compte_proprietaire_id,
    r.marge_nette,
    r.montant,
    -- ── LA DERNIÈRE VERSION : ce sur quoi on travaille vraiment ──
    d.statut_version,
    d.resultat_version,
    d.numero_version,
    -- ══ LA COLONNE DU TABLEAU, EN UN SEUL CHAMP ══
    --
    -- Le kanban se range sur UNE colonne. Or l'état de travail d'un dossier se lit à deux endroits
    -- selon les cas : sur la version quand elle est vivante, sur le dossier sinon. Les réunir ici
    -- évite que l'écran refasse ce calcul — et évite surtout qu'il le refasse autrement.
    --
    --   BROUILLON        aucune version : rien n'a encore été étudié          → 199 dossiers
    --   EN_CONSTRUCTION  on travaille dessus                                  →  19
    --   DISPONIBLE       le comparatif est prêt                               →   6
    --   EN_DECISION      c'est chez le client                                 →  21
    --   A_REACTIVER      la dernière version est morte, le dossier non        →  86
    --
    -- « À réactiver » sera la colonne la plus chargée au démarrage, et ce n'est pas une anomalie :
    -- 1 264 versions sont expirées en base. C'est l'état réel du portefeuille.
    -- LE DOSSIER CLOS PASSE AVANT LA VERSION, et c'est le tableau de Michel qui le dit :
    --
    --   Décision terminée   Recommandation = À réactiver   Version = Clôturée
    --   Dossier terminé     Recommandation = Clôturée      Version = Clôturée
    --
    -- Les deux lignes ont la même version : ce qui les sépare est l'état du DOSSIER. Ma première
    -- version de cette colonne ne regardait que la version — les 1 382 dossiers clos tombaient donc
    -- tous dans « À réactiver », qui annonçait 1 468 au lieu de 86.
    case
      when e.code = 'CLOTUREE' then 'CLOTUREE'
      when d.statut_version is null then 'BROUILLON'
      when d.statut_version in ('EN_CONSTRUCTION', 'DISPONIBLE', 'EN_DECISION') then d.statut_version
      else 'A_REACTIVER'
    end as colonne_travail
   from recommandations r
     left join comptes cp on cp.id = r.compte_id
     left join etapes_recommandation e on e.id = r.etape_id
     left join types_origines o on o.id = r.origine_id
     left join types_energies te on te.id = r.type_energie_id
     left join profils pr on pr.id = r.responsable_profil_id
     left join ( select versions_recommandation.recommandation_id,
            count(*)::integer as nb
           from versions_recommandation
          group by versions_recommandation.recommandation_id) v on v.recommandation_id = r.id
     left join ( select rs.recommandation_id,
            jsonb_agg(jsonb_build_object('id', si.id, 'nom', si.nom) order by si.nom) as sites
           from recommandations_sites rs
             join sites si on si.id = rs.site_id
          group by rs.recommandation_id) s on s.recommandation_id = r.id
     left join lateral (
       select sv.code as statut_version,
              ver.resultat as resultat_version,
              ver.numero_version
         from versions_recommandation ver
         left join statuts_versions_recommandation sv on sv.id = ver.statut_version_id
        where ver.recommandation_id = r.id
        order by ver.version_actuelle desc nulls last, ver.numero_version desc nulls last
        limit 1
     ) d on true;

comment on view public.v_recommandations_liste is
  'Une ligne par recommandation, avec le statut de sa DERNIÈRE version — c''est sur la version qu''on travaille (Michel, 28/08/2026). `etape` reste le statut du dossier, déduit par déclencheur ; `statut_version` et `resultat_version` sont ce que le tableau range en colonnes.';

grant select on public.v_recommandations_liste to authenticated, anon, service_role;

commit;
