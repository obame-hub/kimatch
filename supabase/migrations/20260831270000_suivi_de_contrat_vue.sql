-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE SUIVI DE CONTRAT — LA VUE DE LISTE, LA SANTÉ ET LA PROCHAINE ACTION
--
-- Dossier de transmission du 31/08/2026 :
--
--   § 7  « Indicateur de santé : Sain · À surveiller · À risque · Opportunité. »
--   § 9  « Statuts calculés depuis les données lorsque possible · Impossible d'afficher un statut
--          incohérent »
--   § 9  « Prochaine action : toujours visible sur un dossier ouvert · responsable et échéance
--          identifiables »
--   § 11 « La prochaine action et les alertes sont visibles sans chercher dans un onglet. »
--
-- ══ LA SANTÉ SE CALCULE, ELLE NE SE SAISIT PAS ══
--
-- Une santé écrite en base se désynchronise le lendemain : il suffit qu'une action dépasse son
-- échéance pour que « Sain » devienne faux, et personne ne repasse derrière. Le § 9 l'interdit
-- explicitement — « impossible d'afficher un statut incohérent ». Elle est donc déduite ici, à
-- chaque lecture, de faits vérifiables : le retard des actions, les requêtes ouvertes, l'échéance du
-- contrat.
--
-- `sante_forcee` reste possible et l'emporte, avec son motif obligatoire à l'écran : le terrain sait
-- parfois ce que les données ignorent — un client qui a annoncé son départ, par exemple. Mais c'est
-- l'exception déclarée, pas le régime normal.
--
-- ══ L'ORDRE DES QUATRE ÉTATS ══
--
--   À RISQUE       une action en retard de plus de sept jours, une requête ouverte en retard, ou un
--                  contrat dont l'échéance est passée sans que le suivi soit clos. Trois situations
--                  où quelque chose est déjà tombé.
--   À SURVEILLER   une action en retard, ou une requête ouverte. Ça glisse, rien n'est cassé.
--   OPPORTUNITÉ    échéance à moins de douze mois et rien qui cloche : c'est une affaire à reprendre,
--                  pas un problème. Le document la classe parmi les états de santé — d'où sa place
--                  ici, après les deux alertes : un renouvellement à saisir sur un dossier qui brûle
--                  reste d'abord un dossier qui brûle.
--   SAIN           le reste, y compris un suivi clos : un contrat terminé proprement va bien.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop view if exists public.v_suivis_contrats_liste;

create view public.v_suivis_contrats_liste
with (security_invoker = true) as
select s.id,
       s.reference,
       s.contrat_id,
       s.compte_id,
       s.site_id,
       s.fournisseur_compte_id,
       s.contact_principal_id,
       s.recommandation_id,
       s.responsable_profil_id,
       s.proprietaire_id,
       s.date_ouverture,
       s.date_cloture,
       s.finalite,
       s.commentaire,
       s.sante_forcee,
       s.motif_sante_forcee,
       s.date_creation,
       e.code    as etape,
       e.libelle as etape_libelle,
       e.finalite as etape_finalite,
       e.ordre   as etape_ordre,
       cp.nom    as compte_nom,
       si.nom    as site_nom,
       fo.nom    as fournisseur_nom,
       ct.reference as contrat_reference,
       ct.date_debut,
       ct.date_fin,
       stc.code  as contrat_statut,
       coalesce((pr.prenom || ' ') || pr.nom, '') as responsable,
       coalesce(cc.prenom || ' ' || cc.nom, '')   as contact_principal_nom,
       -- ── Le nombre de jours avant l'échéance : ce qui déclenche l'anticipation à −12 mois ──
       case when ct.date_fin is null then null
            else (ct.date_fin - current_date) end as jours_avant_echeance,
       -- ── Les actions ──
       coalesce(act.ouvertes, 0)   as actions_ouvertes,
       coalesce(act.en_retard, 0)  as actions_en_retard,
       act.prochaine_action,
       act.prochaine_echeance,
       act.prochain_responsable,
       -- ── Les requêtes du contrat : elles vivent déjà sur `requetes.contrat_id` ──
       coalesce(req.ouvertes, 0)  as requetes_ouvertes,
       coalesce(req.en_retard, 0) as requetes_en_retard,
       -- ══ LA SANTÉ ══
       case
         when s.sante_forcee is not null then s.sante_forcee
         when coalesce(act.retard_max, 0) > 7
           or coalesce(req.en_retard, 0) > 0
           or (ct.date_fin is not null and ct.date_fin < current_date and e.code <> 'CLOTURE')
           then 'A_RISQUE'
         when coalesce(act.en_retard, 0) > 0 or coalesce(req.ouvertes, 0) > 0
           then 'A_SURVEILLER'
         when e.code <> 'CLOTURE' and ct.date_fin is not null
           and ct.date_fin <= (current_date + interval '12 months')
           then 'OPPORTUNITE'
         else 'SAIN'
       end as sante
  from public.suivis_contrats s
  join public.etapes_suivis_contrats e on e.id = s.etape_id
  join public.contrats ct on ct.id = s.contrat_id
  left join public.statuts_contrats stc on stc.id = ct.statut_id
  left join public.comptes cp on cp.id = s.compte_id
  left join public.comptes fo on fo.id = s.fournisseur_compte_id
  left join public.sites si on si.id = s.site_id
  left join public.profils pr on pr.id = s.responsable_profil_id
  left join public.contacts cc on cc.id = s.contact_principal_id
  -- Les actions du suivi, résumées en une ligne. `date_realisation is null` est le critère de
  -- « ouverte » retenu partout dans l'application : cocher une tâche n'écrit que cette date.
  left join lateral (
    select count(*)::integer as ouvertes,
           count(*) filter (where a.date_prevue::date < current_date)::integer as en_retard,
           max(case when a.date_prevue::date < current_date
                    then current_date - a.date_prevue::date else 0 end) as retard_max,
           (array_agg(a.titre order by a.date_prevue nulls last))[1] as prochaine_action,
           (array_agg(a.date_prevue order by a.date_prevue nulls last))[1] as prochaine_echeance,
           (array_agg(coalesce(p2.prenom || ' ' || p2.nom, '') order by a.date_prevue nulls last))[1]
             as prochain_responsable
      from public.actions a
      left join public.profils p2 on p2.id = a.responsable_profil_id
     where a.suivi_contrat_id = s.id and a.date_realisation is null
  ) act on true
  left join lateral (
    select count(*)::integer as ouvertes,
           count(*) filter (where r.date_echeance is not null
                              and r.date_echeance::date < current_date)::integer as en_retard
      from public.requetes r
      join public.statuts_requetes sr on sr.id = r.statut_id
     where r.contrat_id = s.contrat_id and r.actif
       and sr.code in ('NOUVELLE', 'EN_TRAITEMENT')
  ) req on true
 where s.actif;

comment on view public.v_suivis_contrats_liste is
  'Une ligne par suivi de contrat, avec son étape, sa santé calculée (Sain · À surveiller · À risque · Opportunité) et sa prochaine action. Dossier de transmission KiMatch du 31/08/2026, § 7 et § 9.';

grant select on public.v_suivis_contrats_liste to authenticated, anon, service_role;

commit;
