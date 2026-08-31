-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE SUIVI DE CONTRAT — LE RATTRAPAGE DU PARC EXISTANT
--
-- Le déclencheur ouvre un suivi à chaque contrat qui passe au statut signé. Il ne se déclenchera
-- jamais sur les contrats déjà signés : sans rattrapage, l'écran « Suivis de contrats » s'ouvre vide
-- sur un parc de 1 579 contrats.
--
-- ══ CE QUE LA SIMULATION A DONNÉ, EN TRANSACTION ANNULÉE ══
--
--   1 579  suivis ouverts (SIGNE 13 · A_VENIR 233 · ACTIF 794 · TERMINE 539)
--
--     542  Terminé ou résilié          le contrat est fini
--     508  Suivi client                démarré depuis plus de deux mois
--     245  À préparer                  pas encore démarré
--     225  Renouvellement à anticiper  échéance à moins de douze mois
--      59  Contrat actif               démarré depuis moins de deux mois
--
-- ══ POURQUOI LE RATTRAPAGE NE CRÉE PAS LES TÂCHES DE DÉPART ══
--
-- Les 245 suivis « À préparer » en auraient reçu trois chacune : 735 tâches nées le même jour, sur
-- des contrats signés il y a des mois dont l'accueil client et la résiliation ont peut-être déjà été
-- faits en dehors de Kimatch. Une liste de tâches où sept cents lignes sont douteuses n'est plus une
-- liste de tâches : plus personne ne la croit, et les vraies s'y noient.
--
-- Le paramètre `p_avec_actions_de_depart` tranche. Le déclencheur le laisse à `true` — un contrat
-- signé à partir de maintenant reçoit bien ses premières actions, c'est le critère de recette du
-- § 11. Le rattrapage le passe à `false` : les suivis existent, avec leur étape juste et leurs
-- rattachements, et les tâches se créent au fil du travail réel.
--
-- ══ RETOUR ARRIÈRE ══
--
--   delete from public.suivis_contrats;
--
-- Rien d'autre à défaire : aucune ligne existante n'est modifiée, et les colonnes
-- `actions.suivi_contrat_id` / `interactions.suivi_contrat_id` restent vides sur tout l'existant.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── La création accepte de se passer des tâches de départ ──
create or replace function public.creer_suivi_contrat(
  p_contrat uuid,
  p_avec_actions_de_depart boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suivi        uuid;
  v_etape_depart uuid;
  v_reste_a_preparer boolean;
  v_statut_a_faire uuid;
  v_contrat      record;
begin
  if p_contrat is null then
    return null;
  end if;

  -- Déjà suivi : on ne crée pas un deuxième, on remet seulement l'étape à jour.
  select id into v_suivi from public.suivis_contrats where contrat_id = p_contrat and actif;
  if found then
    perform public.recalculer_etape_suivi_contrat(v_suivi);
    return v_suivi;
  end if;

  select c.id, c.compte_id, c.site_id, c.fournisseur_compte_id, c.contact_signataire_id,
         c.recommandation_id, c.reference, c.proprietaire_id,
         coalesce(c.date_signature, c.date_creation) as ouverture
    into v_contrat
    from public.contrats c where c.id = p_contrat and c.actif;
  if not found then
    return null;
  end if;

  select id into v_etape_depart from public.etapes_suivis_contrats where code = 'A_PREPARER';

  insert into public.suivis_contrats
    (contrat_id, compte_id, site_id, fournisseur_compte_id, contact_principal_id,
     recommandation_id, etape_id, date_ouverture, reference, proprietaire_id)
  values
    (v_contrat.id, v_contrat.compte_id, v_contrat.site_id, v_contrat.fournisseur_compte_id,
     v_contrat.contact_signataire_id, v_contrat.recommandation_id, v_etape_depart,
     v_contrat.ouverture, v_contrat.reference, v_contrat.proprietaire_id)
  returning id into v_suivi;

  -- L'étape d'abord, les actions ensuite : un contrat de 2023 ne reçoit pas de dossier de bienvenue.
  perform public.recalculer_etape_suivi_contrat(v_suivi);

  if not coalesce(p_avec_actions_de_depart, true) then
    return v_suivi;
  end if;

  select (e.code = 'A_PREPARER') into v_reste_a_preparer
    from public.suivis_contrats s join public.etapes_suivis_contrats e on e.id = s.etape_id
   where s.id = v_suivi;

  if coalesce(v_reste_a_preparer, false) then
    select id into v_statut_a_faire from public.statuts_actions where code = 'A_FAIRE';
    if v_statut_a_faire is not null then
      insert into public.actions (titre, type_action_id, statut_id, date_prevue, priorite,
                                  suivi_contrat_id, site_id, contact_id, commentaire)
      select v.titre,
             (select id from public.types_actions where code = v.type_code),
             v_statut_a_faire,
             now() + (v.jours || ' days')::interval,
             50,
             v_suivi,
             v_contrat.site_id,
             v_contrat.contact_signataire_id,
             'Créée automatiquement à l''ouverture du suivi de contrat.'
        from (values
          ('Vérifier le périmètre du suivi',              'VERIFIER_PERIMETRE',   1),
          ('Envoyer le dossier de bienvenue',             'ENVOYER_BIENVENUE',    3),
          ('Préparer la résiliation auprès de l''ancien fournisseur', 'PREPARER_RESILIATION', 5)
        ) as v(titre, type_code, jours)
       where exists (select 1 from public.types_actions t where t.code = v.type_code);
    end if;
  end if;

  return v_suivi;
end;
$$;

comment on function public.creer_suivi_contrat(uuid, boolean) is
  'Ouvre le suivi d''un contrat, ou remet à jour celui qui existe. Les trois premières actions ne sont créées que si le suivi reste « À préparer » après recalcul, et seulement si `p_avec_actions_de_depart` (le rattrapage du 31/08/2026 s''en passe : 735 tâches sur des contrats anciens auraient noyé les vraies).';

-- ── Le rattrapage ──
do $$
declare
  v_id uuid;
  v_n  integer := 0;
begin
  for v_id in
    select c.id from public.contrats c
      join public.statuts_contrats s on s.id = c.statut_id
     where c.actif and s.code in ('SIGNE', 'A_VENIR', 'ACTIF', 'TERMINE', 'RESILIE')
  loop
    perform public.creer_suivi_contrat(v_id, false);
    v_n := v_n + 1;
  end loop;
  raise notice 'Suivis de contrats : % contrats traites.', v_n;
end;
$$;

commit;
