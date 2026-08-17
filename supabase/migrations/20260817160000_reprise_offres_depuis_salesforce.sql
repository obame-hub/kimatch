-- Reprise des offres à partir de ce que Salesforce a réellement donné.
--
-- POURQUOI CETTE MIGRATION EXISTE. `offres_fournisseurs` compte 0 ligne sur 1704 recommandations
-- importées, et la question s'est posée le 17/08/2026 : a-t-on raté l'import ? Non. Vérifié :
--
--   · l'objet `Cotation__c` de Salesforce ne porte que cinq champs — Id, Name, Opportunit__c,
--     Statut__c, CreatedDate. Ni montant, ni fournisseur, ni prix.
--   · l'objet `Opportunity` porte les chiffres de l'AFFAIRE RETENUE (`Fournisseur__c`,
--     `Budget_nouvelle_offre__c`, `Dur_e_mois__c`), pas les offres des concurrents.
--   · Salesforce n'a aucun objet « offre de tel fournisseur à tel prix » parmi ce qui a été
--     extrait : cette information vivait dans les mails et les Excel.
--
-- Rien n'a donc été perdu. Mais deux faits que nous DÉTENONS ne sont visibles nulle part, et cette
-- migration les matérialise en offres — sans rien inventer.
--
-- ── 1. L'offre retenue, avec ses vrais chiffres ────────────────────────────────────────────────
-- 822 recommandations portent un fournisseur retenu, dont 289 avec le budget de la nouvelle offre
-- et 824 avec une durée. On crée l'offre retenue de la version courante, avec le fournisseur, le
-- budget annuel et la durée tels que Salesforce les donne. Le comparatif des versions s'en nourrit
-- immédiatement (lignes Fournisseur, Budget proposé, Durée d'engagement).
--
-- `budget_nouvelle_offre` et NON `montant` : `montant` vient de `Opportunity.Montant__c`, qui est le
-- montant de l'affaire pour KiWee (commission), pas le budget annuel du client. Les confondre
-- afficherait une commission dans la colonne « Budget proposé ».
--
-- ── 2. Qui a répondu ──────────────────────────────────────────────────────────────────────────
-- 3480 des 3483 consultations ont un historique de suivi. Le dernier statut de chacune est connu :
-- 1328 « Réponse reçue », 55 « Refusée », 1922 encore « Demande envoyée ». Pour les réponses reçues
-- et les refus, on crée une offre au statut correspondant, SANS AUCUN CHIFFRE. L'écran dira « ce
-- fournisseur a répondu » au lieu de « aucune offre suivie », ce qui est exactement ce que nous
-- savons — ni plus.
--
-- Les 55 refus sont inclus volontairement : un refus est une réponse définitive, et le masquer
-- ferait croire à une consultation restée sans suite. Retirer le `'REFUSEE'` de la clause `in`
-- ci-dessous suffit à les exclure.
--
-- ── CE QUI N'EST PAS FAIT, ET NE DOIT PAS L'ÊTRE ──────────────────────────────────────────────
-- Le prix au MWh reste NUL partout. On pourrait le calculer en divisant le budget par le volume
-- contractuel, mais `prix_moyen_mwh` est défini comme « le prix tel que le fournisseur l'annonce » :
-- y écrire un quotient calculé par nous ferait passer une déduction pour une donnée reçue. Un
-- conseiller comparerait des prix dont certains n'ont jamais été annoncés par personne.
--
-- Aucune ligne existante n'est modifiée : la migration n'écrit QUE des insertions, dans une table
-- vide. Les clauses `not exists` la rendent rejouable sans créer de doublon.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. L'offre retenue de chaque recommandation
-- ─────────────────────────────────────────────────────────────────────────────

with version_cible as (
  -- La version qui porte l'affaire : l'actuelle, sinon la plus haute, sinon la plus récente.
  -- Les chiffres de Salesforce sont au niveau de l'opportunité et non de la cotation : il faut donc
  -- choisir une version, et c'est la version courante qui représente l'état du dossier.
  select distinct on (v.recommandation_id) v.recommandation_id, v.id as version_id
    from public.versions_recommandation v
   order by v.recommandation_id, v.version_actuelle desc, v.numero_version desc nulls last, v.date_creation desc
),
optim_cible as (
  -- La mise en concurrence de préférence : c'est elle qui porte les fournisseurs consultés.
  select distinct on (o.version_recommandation_id) o.version_recommandation_id, o.id as optimisation_id
    from public.optimisations o
    left join public.types_optimisations t on t.id = o.type_optimisation_id
   order by o.version_recommandation_id, (t.code = 'MISE_EN_CONCURRENCE') desc nulls last, o.id
),
retenue as (
  select r.id as reco_id,
         r.fournisseur_compte_id,
         r.budget_nouvelle_offre,
         r.duree_mois,
         oc.optimisation_id,
         -- Rattachée au fournisseur consulté quand il est bien parmi les consultés de cette
         -- optimisation (564 cas sur 822). Sinon NULL : l'offre apparaît alors dans « Offres non
         -- rattachées à un fournisseur consulté » plutôt que d'inventer une consultation qui n'a
         -- jamais eu lieu.
         (select ofo.id
            from public.optimisations_fournisseurs ofo
           where ofo.optimisation_id = oc.optimisation_id
             and ofo.fournisseur_compte_id = r.fournisseur_compte_id
           limit 1) as consultation_id
    from public.recommandations r
    join version_cible vc on vc.recommandation_id = r.id
    join optim_cible oc on oc.version_recommandation_id = vc.version_id
    -- `compte_fournisseur_id` référence `comptes_fournisseurs(compte_id)` et non `comptes(id)` :
    -- sans fiche fournisseur, l'offre ne peut pas exister. ENEDIS est le seul cas restant.
    join public.comptes_fournisseurs cf on cf.compte_id = r.fournisseur_compte_id
   where r.fournisseur_compte_id is not null
)
insert into public.offres_fournisseurs (
  optimisation_id, optimisation_fournisseur_id, compte_fournisseur_id,
  nom, duree_mois, montant_annuel_ht, statut, est_offre_recommandee, ordre_classement
)
select re.optimisation_id,
       re.consultation_id,
       re.fournisseur_compte_id,
       -- `nom` est NOT NULL sans défaut. Le libellé dit ce que la ligne est.
       'Offre retenue' || case when re.duree_mois is not null then ' — ' || re.duree_mois || ' mois' else '' end,
       re.duree_mois,
       re.budget_nouvelle_offre,
       -- Retenue donc reçue : on ne retient pas une offre qui n'est jamais arrivée.
       'RECUE',
       true,
       1
  from retenue re
 where not exists (
         select 1 from public.offres_fournisseurs o
          where o.optimisation_id = re.optimisation_id and o.est_offre_recommandee
       );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Les consultations dont on sait qu'elles ont abouti (ou été refusées)
-- ─────────────────────────────────────────────────────────────────────────────

with dernier_suivi as (
  select distinct on (sc.optimisation_fournisseur_id)
         sc.optimisation_fournisseur_id,
         st.code
    from public.suivis_consultations_fournisseurs sc
    join public.statuts_consultations_fournisseurs st on st.id = sc.statut_id
   order by sc.optimisation_fournisseur_id, sc.date_evenement desc
)
insert into public.offres_fournisseurs (
  optimisation_id, optimisation_fournisseur_id, compte_fournisseur_id,
  nom, statut, est_offre_recommandee, ordre_classement
)
select ofo.optimisation_id,
       ofo.id,
       ofo.fournisseur_compte_id,
       case when d.code = 'RECUE' then 'Réponse reçue' else 'Offre refusée' end,
       d.code,
       false,
       1
  from dernier_suivi d
  join public.optimisations_fournisseurs ofo on ofo.id = d.optimisation_fournisseur_id
  join public.comptes_fournisseurs cf on cf.compte_id = ofo.fournisseur_compte_id
 where d.code in ('RECUE', 'REFUSEE')
   -- Ne double pas l'offre retenue déjà créée à l'étape 1 pour cette même consultation.
   and not exists (
         select 1 from public.offres_fournisseurs o
          where o.optimisation_fournisseur_id = ofo.id
       );

commit;

-- Vérification après application (à coller tel quel) :
--
--   select statut, count(*) , count(montant_annuel_ht) avec_budget,
--          count(*) filter (where est_offre_recommandee) retenues
--     from public.offres_fournisseurs group by statut order by 2 desc;
--   -- attendu : environ 1900 lignes au total, dont ~820 retenues et ~289 avec un budget
--
--   select count(*) filter (where optimisation_fournisseur_id is null) non_rattachees
--     from public.offres_fournisseurs;
--   -- attendu : ~258 (fournisseur retenu qui n'était pas parmi les consultés)
--
--   select count(*) from public.offres_fournisseurs where prix_moyen_mwh is not null;
--   -- attendu : 0 — aucun prix n'est inventé
--
-- ANNULATION, si le résultat ne convient pas. La table était vide avant cette migration, donc tout
-- supprimer la remet exactement dans son état d'origine :
--
--   delete from public.offres_fournisseurs;
--
-- À n'exécuter que si AUCUNE offre n'a encore été saisie à la main depuis l'application.
