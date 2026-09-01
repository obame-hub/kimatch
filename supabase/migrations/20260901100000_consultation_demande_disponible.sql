-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- « DEMANDE DISPONIBLE » : LE STATUT DE CONSULTATION QUI SE CALCULE SEUL
--
-- Naoëlle, 01/09/2026 : « ajouter un statut qui se calcule automatiquement "Demande disponible" dans
-- l'objet consultation fournisseur, et la condition sera que toutes les offres fournisseur soient
-- disponibles, ou disponible et indisponible mélangés mais aucune en attente. Et aussi calculer
-- automatiquement le statut déjà en place "Demande refusée" si toutes les offres fournisseurs sont
-- indisponibles. La demande reste acceptée si une ou plusieurs offres fournisseurs sont en attente. »
--
-- ══ LA RÈGLE, DANS L'ORDRE OÙ ELLE SE LIT ══
--
--   aucune offre                              on ne touche à rien
--   au moins une offre EN_ATTENTE             Demande acceptée      (le fournisseur travaille encore)
--   aucune EN_ATTENTE, aucune DISPONIBLE      Demande refusée       (il n'a rien à proposer)
--   aucune EN_ATTENTE, au moins une DISPONIBLE Demande disponible   (on peut comparer)
--
-- Le mélange disponible + indisponible tombe dans le dernier cas, et c'est voulu : un fournisseur qui
-- répond sur deux sites et pas sur le troisième a bien répondu. Attendre qu'il couvre tout
-- laisserait la consultation en attente pour toujours.
--
-- ══ POURQUOI « AUCUNE OFFRE » NE DÉCLENCHE RIEN ══
--
-- Mesuré ce jour : 3 517 consultations, dont **49 seulement portent une offre**. Si l'absence
-- d'offre valait « refusée », 3 468 consultations basculeraient d'un coup en refus — alors que la
-- plupart viennent d'être envoyées et attendent une réponse. Le silence n'est pas un refus.
--
-- ══ POURQUOI ON ÉCRIT UN ÉVÉNEMENT, ET NON UNE COLONNE ══
--
-- Le statut d'une consultation N'EST PAS une colonne : c'est la dernière ligne de
-- `suivis_consultations_fournisseurs`, un journal. Le calculer dans une vue aurait produit deux
-- vérités — l'écran Pricing aurait dit « disponible » pendant que le journal disait encore
-- « envoyée », et tout autre lecteur du journal aurait vu l'ancien statut.
--
-- Écrire dans le journal garde une seule source, et donne en prime la DATE : « devenue disponible le
-- 12/09 » est exactement ce qu'un journal sert à dire.
--
-- ══ CE QUE ÇA DONNE SUR LES DONNÉES D'AUJOURD'HUI ══
--
-- Simulé en transaction annulée, migration complète comprise :
--
--     49  consultations recalculées — celles qui portent au moins une offre
--  3 468  ne bougent pas, faute d'offre
--
-- Répartition obtenue sur les 3 517 consultations : 2 044 envoyées · 1 403 acceptées ·
-- 17 disponibles · 53 refusées. Un second passage n'écrit AUCUNE ligne de plus, et aucune offre
-- n'est modifiée au passage — les deux défauts que la simulation avait révélés.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. LE STATUT
--
-- Ordre 25 : entre « Demande acceptée » (20) et « Demande refusée » (30). Naoëlle, 01/09/2026, sur
-- la question posée : la demande reste acceptée tant que des offres sont en attente, puis devient
-- disponible quand elles arrivent. Le placer avant « acceptée » aurait fait reculer une consultation
-- sur le tableau Pricing — elle serait passée en « acceptée » à l'envoi des offres, puis revenue en
-- arrière sur « disponible » à leur arrivée.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

insert into public.statuts_consultations_fournisseurs (code, libelle, ordre, actif)
values ('DISPONIBLE', 'Demande disponible', 25, true)
on conflict (code) do update
  set libelle = excluded.libelle, ordre = excluded.ordre, actif = true;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. LE CALCUL
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.recalculer_statut_consultation(p_consultation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total        integer;
  v_attente      integer;
  v_disponible   integer;
  v_cible        text;
  v_statut_id    uuid;
  v_statut_actuel uuid;
begin
  if p_consultation is null then
    return;
  end if;

  select count(*),
         count(*) filter (where f.statut = 'EN_ATTENTE'),
         count(*) filter (where f.statut = 'DISPONIBLE')
    into v_total, v_attente, v_disponible
    from public.offres_fournisseurs f
   where f.optimisation_fournisseur_id = p_consultation and f.actif;

  -- Le silence n'est pas un refus : sans offre, on laisse le statut humain en place.
  if v_total = 0 then
    return;
  end if;

  v_cible := case
    when v_attente > 0 then 'ACCEPTEE'
    when v_disponible = 0 then 'REFUSEE'
    else 'DISPONIBLE'
  end;

  select id into v_statut_id
    from public.statuts_consultations_fournisseurs where code = v_cible;
  if v_statut_id is null then
    return;
  end if;

  -- LE JOURNAL NE SE RÉPÈTE PAS. Sans cette garde, chaque enregistrement d'offre ajouterait une
  -- ligne identique, et l'historique d'une consultation deviendrait illisible en quelques jours.
  --
  -- `clock_timestamp()` ET NON `now()`, ET C'EST TOUT SAUF UN DÉTAIL. `now()` rend l'heure de DÉBUT
  -- DE TRANSACTION : dans une boucle de rattrapage, les cinquante lignes écrites porteraient la même
  -- date à la microseconde près. Le « dernier événement » deviendrait alors indéterminé — `order by
  -- date_evenement desc limit 1` choisirait au hasard parmi les ex æquo — et la garde ci-dessous
  -- lirait un statut ancien, donc réinsérerait. Constaté en simulation : 113 lignes écrites pour
  -- 49 consultations. `clock_timestamp()` avance à chaque appel, y compris dans une transaction.
  --
  -- Le départage par `ctid` couvre le cas résiduel de deux écritures dans la même microseconde.
  select sc.statut_id into v_statut_actuel
    from public.suivis_consultations_fournisseurs sc
   where sc.optimisation_fournisseur_id = p_consultation
   order by sc.date_evenement desc nulls last, sc.ctid desc
   limit 1;

  if v_statut_actuel is not distinct from v_statut_id then
    return;
  end if;

  insert into public.suivis_consultations_fournisseurs
    (optimisation_fournisseur_id, statut_id, date_evenement, commentaire)
  values
    (p_consultation, v_statut_id, clock_timestamp(),
     'Calculé automatiquement d''après les offres du fournisseur.');
end;
$$;

comment on function public.recalculer_statut_consultation(uuid) is
  'Déduit le statut d''une consultation de l''état de ses offres : au moins une en attente → acceptée, aucune disponible → refusée, sinon disponible. Sans offre, ne touche à rien (Naoëlle, 01/09/2026).';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. LA PROPAGATION INVERSE EST RETIRÉE — ET C'EST LE POINT LE PLUS IMPORTANT DE CETTE MIGRATION
--
-- `trg_propager_consultation_vers_offre`, posé le 28/08/2026, fait exactement l'INVERSE de la règle
-- demandée aujourd'hui : il écrase le statut de TOUTES les offres d'une consultation avec celui de
-- la consultation.
--
--     consultation ENVOYEE   →  toutes ses offres deviennent EN_ATTENTE
--     consultation ACCEPTEE  →  toutes ses offres deviennent DISPONIBLE
--     consultation REFUSEE   →  toutes ses offres deviennent INDISPONIBLE
--
-- ══ LES DEUX RÈGLES SE RÉPONDENT EN BOUCLE ══
--
-- Constaté en simulation : on calcule ACCEPTEE parce qu'une offre est en attente ; l'ancien
-- déclencheur passe alors TOUTES les offres à DISPONIBLE ; plus aucune n'est en attente ; le calcul
-- suivant rend DISPONIBLE. Deux statuts écrits à 45 millisecondes d'écart sur la même consultation,
-- et les offres modifiées au passage sans que personne l'ait demandé.
--
-- ══ ET IL REND LA NOUVELLE RÈGLE IMPOSSIBLE ══
--
-- Naoëlle décrit un cas central : « disponible et indisponible mélangés mais aucune en attente ».
-- Mesuré ce jour : sur 49 consultations qui portent des offres, **zéro n'a de statuts mélangés** —
-- et ce n'est pas un hasard, l'ancien déclencheur les aplatit (17 écritures dans l'historique). Le
-- cas que la règle doit traiter ne peut pas exister tant qu'il tourne.
--
-- ══ UNE SEULE DIRECTION, ET C'EST CELLE DES DONNÉES ══
--
-- Un fournisseur qui répond sur deux sites et pas sur le troisième produit deux offres disponibles
-- et une indisponible. C'est un FAIT, et l'ancien déclencheur le détruisait au premier changement de
-- statut de la consultation. Désormais l'offre est la donnée, la consultation en est le résumé.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

drop trigger if exists trg_propager_consultation_vers_offre on public.suivis_consultations_fournisseurs;
drop function if exists public.propager_consultation_vers_offre();

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. LE DÉCLENCHEUR
--
-- Sur INSERT, UPDATE et DELETE : une offre retirée change la conclusion autant qu'une offre ajoutée.
-- La dernière offre disponible qu'on supprime doit faire retomber la consultation en refus.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.propager_offre_vers_consultation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculer_statut_consultation(
    coalesce(new.optimisation_fournisseur_id, old.optimisation_fournisseur_id));
  -- Une offre déplacée d'une consultation à l'autre en laisse deux à recalculer.
  if tg_op = 'UPDATE'
     and new.optimisation_fournisseur_id is distinct from old.optimisation_fournisseur_id then
    perform public.recalculer_statut_consultation(old.optimisation_fournisseur_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_propager_offre_vers_consultation on public.offres_fournisseurs;
create trigger trg_propager_offre_vers_consultation
  after insert or delete
     or update of statut, actif, optimisation_fournisseur_id
    on public.offres_fournisseurs
  for each row
  execute function public.propager_offre_vers_consultation();

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. LE RATTRAPAGE
--
-- La fonction ne s'exécute qu'au passage du déclencheur : les 49 consultations qui portent déjà des
-- offres ne bougeraient jamais d'elles-mêmes. On ne parcourt que celles-là — les 3 468 autres n'ont
-- rien à recalculer.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_id uuid;
begin
  for v_id in
    select distinct f.optimisation_fournisseur_id
      from public.offres_fournisseurs f
     where f.actif and f.optimisation_fournisseur_id is not null
  loop
    perform public.recalculer_statut_consultation(v_id);
  end loop;
end;
$$;

commit;
