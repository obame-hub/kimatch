-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- « EN COURS DE CONTRACTUALISATION » : LES DOSSIERS DONT LE CONTRAT ATTEND SA SIGNATURE
--
-- Michel, 31/08/2026 : « ajouter un onglet "En cours de contractualisation" dans les recommandations.
-- Cet onglet doit regrouper les recommandations actives rattachées à un contrat en cours de
-- signature. »
--
-- ══ CE QUE ÇA REGROUPE, MESURÉ ══
--
-- 10 dossiers non clos ont un contrat dont la signature n'est pas acquise. Ils sont aujourd'hui
-- éparpillés dans quatre colonnes :
--
--   En décision      4        À réactiver      3
--   Disponible       2        En construction  1
--
-- C'est précisément le désordre qu'il veut supprimer : un dossier dont le contrat est parti à la
-- signature n'est plus « en décision », il attend une signature. Le travail a changé de nature, la
-- colonne doit le dire.
--
-- ══ POURQUOI `date_signature is null` ET NON `statut_signature` ══
--
-- `statut_signature` serait le critère naturel, mais il est VIDE sur les 694 contrats repris de
-- Salesforce — la reprise ne l'alimentait pas. Un filtre dessus ne verrait qu'un dossier sur dix.
--
-- L'absence de date de signature, elle, est vraie partout : sur un contrat créé dans Kimatch comme
-- sur un contrat repris. Et elle dit exactement ce qu'on cherche — la signature n'est pas acquise.
--
-- ══ LA COLONNE PASSE DEVANT LE STATUT DE VERSION, ET APRÈS LA CLÔTURE ══
--
-- L'ordre de priorité dans `colonne_travail` est : dossier clos d'abord, puis contractualisation,
-- puis l'état de la version. Un dossier clos reste clos même si un contrat traîne sans signature —
-- sinon on ressortirait du plan de travail des affaires terminées. Et un dossier en
-- contractualisation quitte sa colonne de version, sans quoi il apparaîtrait deux fois.
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
    -- ── La dernière version : ce sur quoi on travaille vraiment ──
    d.statut_version,
    d.resultat_version,
    d.numero_version,
    -- ── Le contrat en attente de signature ──
    ctr.contrat_id                                       as contrat_en_signature_id,
    (ctr.contrat_id is not null)                         as en_contractualisation,
    -- ══ LA COLONNE DU TABLEAU, EN UN SEUL CHAMP ══
    --
    --   CLOTUREE               le dossier est terminé                              1 382
    --   EN_CONTRACTUALISATION  un contrat attend sa signature                          10
    --   BROUILLON              aucune version : rien n'a encore été étudié            199
    --   EN_CONSTRUCTION        on travaille dessus
    --   DISPONIBLE             le comparatif est prêt
    --   EN_DECISION            c'est chez le client
    --   A_REACTIVER            la dernière version est morte, le dossier non
    case
      when e.code = 'CLOTUREE' then 'CLOTUREE'
      when ctr.contrat_id is not null then 'EN_CONTRACTUALISATION'
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
     ) d on true
     -- Le contrat dont la signature n'est pas acquise. `limit 1` : un dossier peut porter plusieurs
     -- contrats, il suffit qu'UN attende sa signature pour que le dossier soit en contractualisation.
     left join lateral (
       select ct.id as contrat_id
         from contrats ct
        where ct.recommandation_id = r.id
          and ct.actif
          and ct.date_signature is null
        order by ct.date_creation desc
        limit 1
     ) ctr on true;

comment on view public.v_recommandations_liste is
  'Une ligne par recommandation, avec le statut de sa DERNIÈRE version — c''est sur la version qu''on travaille (Michel, 28/08/2026). `colonne_travail` porte l''état du travail en un champ, dont « en contractualisation » quand un contrat attend sa signature (Michel, 31/08/2026).';

grant select on public.v_recommandations_liste to authenticated, anon, service_role;

commit;
