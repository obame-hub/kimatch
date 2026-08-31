-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE SUIVI DE CONTRAT — L'AUTOMATISATION
--
-- Dossier de transmission du 31/08/2026, § 8 « À la signature : créer le suivi et rattacher les
-- objets », et critère de recette du § 11 : « Un contrat signé crée automatiquement un suivi et ses
-- premières actions. »
--
-- ══ CE QUE LA DÉRIVATION PEUT DIRE, ET CE QU'ELLE NE PEUT PAS ══
--
-- C'est le point qui décide de tout le reste. Les huit étapes du document sont un PARCOURS, pas une
-- fonction des dates. Trois d'entre elles sont des actes humains :
--
--   À préparer                envoyer le dossier de bienvenue          — un geste
--   Résiliation à confirmer   obtenir la preuve d'envoi                — un geste
--   En attente d'activation   veiller à la double signature            — une vigilance
--
-- Aucune donnée ne dit qu'elles sont faites. Une dérivation qui les traverserait parce que la date
-- de début est dans deux mois annoncerait « en attente d'activation » sur un contrat dont personne
-- n'a encore envoyé la lettre de résiliation à l'ancien fournisseur. C'est précisément l'erreur qui
-- coûte cher : la double facturation.
--
-- La fonction ne pousse donc QUE vers les quatre étapes qu'une donnée démontre :
--
--   Contrat actif                  la date de début est passée
--   Suivi client                   elle est passée de plus de deux mois        (la facture M+2)
--   Renouvellement à anticiper     l'échéance est à moins de douze mois        (§ 7)
--   Terminé ou résilié             le contrat est terminé, résilié ou annulé
--
-- Et elle prend la PLUS AVANCÉE de celles qui s'appliquent, jamais une étape antérieure à l'actuelle.
-- Un contrat signé aujourd'hui pour un début dans deux mois reste donc « À préparer » : c'est bien
-- ce qu'il y a à faire.
--
-- ══ POURQUOI LES PREMIÈRES ACTIONS NE SONT PAS CRÉÉES DANS TOUS LES CAS ══
--
-- Le rattrapage ouvre 1 346 suivis, dont la plupart portent des contrats en cours depuis des années
-- ou déjà terminés. Leur créer « Envoyer le dossier de bienvenue » produirait quatre mille tâches
-- absurdes, en retard dès leur naissance, et la page Tâches deviendrait illisible.
--
-- L'ordre est donc : créer le suivi, recalculer son étape, PUIS ne créer les trois premières actions
-- que s'il est resté « À préparer ». Un contrat réellement signé aujourd'hui y reste et les reçoit ;
-- un contrat de 2023 part directement en « Suivi client » et n'en reçoit aucune.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. L'ÉTAPE SE DÉDUIT — ET N'EFFACE JAMAIS UN GESTE HUMAIN
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.recalculer_etape_suivi_contrat(p_suivi uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordre_actuel integer;
  v_statut       text;
  v_debut        date;
  v_fin          date;
  v_cible        text := null;
  v_finalite     text := null;
  v_etape        uuid;
  v_ordre_cible  integer;
begin
  if p_suivi is null then
    return;
  end if;

  select e.ordre, sc.code, c.date_debut, c.date_fin
    into v_ordre_actuel, v_statut, v_debut, v_fin
    from public.suivis_contrats s
    join public.etapes_suivis_contrats e on e.id = s.etape_id
    join public.contrats c on c.id = s.contrat_id
    left join public.statuts_contrats sc on sc.id = c.statut_id
   where s.id = p_suivi and s.actif;
  if not found then
    return;
  end if;

  -- ── La plus avancée des étapes que les données démontrent ──
  -- Testées de la plus avancée à la moins avancée : le premier cas qui s'applique gagne.
  if v_statut in ('RESILIE', 'ANNULE') then
    v_cible := 'CLOTURE';
    v_finalite := 'RESILIE';
  elsif v_statut = 'TERMINE' or (v_fin is not null and v_fin < current_date) then
    v_cible := 'CLOTURE';
    v_finalite := 'TERMINE';
  elsif v_fin is not null and v_fin <= (current_date + interval '12 months') then
    v_cible := 'RENOUVELLEMENT_A_ANTICIPER';
  elsif v_debut is not null and (v_debut + interval '2 months') <= current_date then
    v_cible := 'SUIVI_CLIENT';
  elsif v_debut is not null and v_debut <= current_date then
    v_cible := 'CONTRAT_ACTIF';
  end if;

  -- Aucune donnée ne démontre rien : le suivi reste où les humains l'ont laissé.
  if v_cible is null then
    return;
  end if;

  select id, ordre into v_etape, v_ordre_cible
    from public.etapes_suivis_contrats where code = v_cible;
  if v_etape is null or v_ordre_cible <= v_ordre_actuel then
    return;
  end if;

  update public.suivis_contrats
     set etape_id = v_etape,
         finalite = case when v_cible = 'CLOTURE' then coalesce(finalite, v_finalite) else finalite end,
         date_cloture = case when v_cible = 'CLOTURE' then coalesce(date_cloture, now()) else date_cloture end
   where id = p_suivi;
end;
$$;

comment on function public.recalculer_etape_suivi_contrat(uuid) is
  'Avance l''étape d''un suivi de contrat depuis les dates et le statut du contrat. Ne recule jamais, et ne pousse jamais vers les trois étapes qui sont des gestes humains (à préparer, résiliation à confirmer, en attente d''activation).';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. LA CRÉATION, IDEMPOTENTE
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.creer_suivi_contrat(p_contrat uuid)
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

comment on function public.creer_suivi_contrat(uuid) is
  'Ouvre le suivi d''un contrat, ou remet à jour celui qui existe. Les trois premières actions ne sont créées que si le suivi reste « À préparer » après recalcul (Michel/dossier de transmission, 31/08/2026).';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. LE DÉCLENCHEUR
--
-- Sur le STATUT et non sur `date_signature` : mesuré ce jour, 1 346 contrats sont au statut signé ou
-- au-delà et 3 seulement portent une date de signature — la reprise Salesforce ne l'alimentait pas.
-- Un déclencheur sur la date ne verrait que trois contrats sur mille trois cent quarante-six.
--
-- ANNULE ne crée pas de suivi : un contrat annulé n'a jamais pris effet, l'ouvrir puis le clore
-- aussitôt ne produirait qu'une ligne vide. En revanche, si un suivi existe déjà et que le contrat
-- devient annulé, il faut le clore — d'où le recalcul inconditionnel dans ce cas.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.propager_contrat_vers_suivi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut text;
  v_suivi  uuid;
begin
  select code into v_statut from public.statuts_contrats where id = new.statut_id;

  if v_statut in ('SIGNE', 'A_VENIR', 'ACTIF', 'TERMINE', 'RESILIE') and new.actif then
    perform public.creer_suivi_contrat(new.id);
  else
    -- Pas de création, mais si le suivi existe on le tient à jour (cas de l'annulation).
    select id into v_suivi from public.suivis_contrats where contrat_id = new.id and actif;
    if found then
      perform public.recalculer_etape_suivi_contrat(v_suivi);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_propager_contrat_vers_suivi on public.contrats;
create trigger trg_propager_contrat_vers_suivi
  after insert or update of statut_id, date_signature, date_debut, date_fin, actif
    on public.contrats
  for each row
  execute function public.propager_contrat_vers_suivi();

commit;
