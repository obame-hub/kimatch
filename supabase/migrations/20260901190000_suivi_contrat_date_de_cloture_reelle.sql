-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE SUIVI D'UN CONTRAT SE CLÔT LE JOUR OÙ LE CONTRAT FINIT, PAS LE JOUR OÙ ON S'EN APERÇOIT
--
-- Trouvé le 01/09/2026 en cherchant si le défaut des dates de clôture inventées (voir la migration
-- 20260901180000) existait ailleurs. Un détecteur passé sur TOUTES les colonnes de date des tables
-- métier a signalé deux pics :
--
--     suivis_contrats.date_cloture   542 / 542 lignes au 30/08/2026   (100 %)
--     signaux.date_detection         593 / 1 456 au 23/08/2026        (41 %)
--
-- Le second est légitime : `date_detection` égale `date_creation` sur les 1 456 signaux, et un signal
-- EST détecté le jour où il est créé. Le pic dit simplement quel jour le générateur a tourné.
--
-- Le premier ne l'est pas. Un suivi de contrat se clôt parce que son contrat est fini : la date de
-- cet événement, c'est `contrats.date_fin`. Or `recalculer_etape_suivi_contrat` écrivait :
--
--     date_cloture = case when v_cible = 'CLOTURE' then coalesce(date_cloture, now()) else ... end
--
-- `now()`, c'est le jour du RATTRAPAGE, pas celui de la fin du contrat. Les 542 suivis clos par la
-- migration 20260831280000 portent donc tous le 30 août 2026, alors que leurs contrats se sont
-- terminés entre le 31/10/2021 et le 30/08/2026. Écart moyen : 299 jours. Le pire affiche « clôturé
-- le 30/08/2026 » sur un contrat fini depuis presque cinq ans.
--
-- Ce que ça casse concrètement : trier les suivis par date de clôture ne trie rien, filtrer sur une
-- période ne trouve rien avant le 30 août, et l'ancienneté d'un dossier terminé est illisible.
--
-- ══ LA DATE RETENUE ══
--
-- `greatest(date_fin, date_ouverture)`, et non `date_fin` seule.
--
-- 12 des 542 suivis ont été ouverts APRÈS la fin de leur contrat : ce sont des contrats historiques
-- saisis après coup (contrat du 01/01/2018 au 31/10/2021, suivi ouvert le 05/11/2024). Leur poser
-- une clôture antérieure à leur ouverture écrirait un intervalle impossible. Ces suivis-là sont nés
-- clos : le jour où ils ont cessé d'être une tâche vivante est le jour où ils ont été ouverts. Les
-- deux bornes sont des dates réelles, on prend la plus tardive — rien n'est inventé.
--
-- ══ CE QUI N'EST PAS TRAITÉ ══
--
-- Un suivi clos parce que son contrat est RÉSILIÉ ou ANNULÉ garde `now()` : aucune colonne ne porte
-- la date de résiliation, et la déduire de la date de fin serait faux — une résiliation intervient
-- justement avant le terme. Aucun suivi n'est dans ce cas aujourd'hui (542 sont TERMINE, 0 RESILIE) ;
-- le jour où il y en aura, c'est une colonne `date_resiliation` sur `contrats` qu'il faudra, pas une
-- déduction.
--
-- Les 542 n'ont jamais été touchés à la main : le journal ne porte que la migration de rattrapage et
-- le déclencheur système. On ne remplace donc que du calculé.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ 1. LA RÈGLE, CORRIGÉE À LA SOURCE ══
-- Sans ça, le prochain contrat qui arrive à son terme reprendrait le même bouche-trou, et le
-- rattrapage ci-dessous serait à refaire tous les mois.
create or replace function public.recalculer_etape_suivi_contrat(p_suivi uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ordre_actuel integer;
  v_statut       text;
  v_debut        date;
  v_fin          date;
  v_ouverture    timestamptz;
  v_cible        text := null;
  v_finalite     text := null;
  v_quand        timestamptz := null;
  v_etape        uuid;
  v_ordre_cible  integer;
begin
  if p_suivi is null then
    return;
  end if;

  select e.ordre, sc.code, c.date_debut, c.date_fin, s.date_ouverture
    into v_ordre_actuel, v_statut, v_debut, v_fin, v_ouverture
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
    -- Aucune colonne ne porte la date de résiliation : le jour où on le constate est le moins faux.
    v_quand := now();
  elsif v_statut = 'TERMINE' or (v_fin is not null and v_fin < current_date) then
    v_cible := 'CLOTURE';
    v_finalite := 'TERMINE';
    -- LA FIN DU CONTRAT EST L'ÉVÉNEMENT, pas le moment où ce calcul tourne. `greatest` protège les
    -- suivis ouverts après coup sur un contrat déjà fini : ils se clôturent le jour de leur
    -- ouverture, jamais avant.
    v_quand := case
                 when v_fin is null then now()
                 else greatest(v_fin::timestamptz, v_ouverture)
               end;
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
         date_cloture = case when v_cible = 'CLOTURE' then coalesce(date_cloture, v_quand) else date_cloture end
   where id = p_suivi;
end;
$$;

comment on function public.recalculer_etape_suivi_contrat(uuid) is
  'Avance l''étape d''un suivi de contrat depuis les dates et le statut du contrat. Ne recule jamais, ne pousse jamais vers les trois étapes qui sont des gestes humains, et clôture à la date de FIN DU CONTRAT — pas au moment du calcul.';

-- ══ 2. LES 542 DÉJÀ POSÉS ══
update public.suivis_contrats s
   set date_cloture = greatest(ct.date_fin::timestamptz, s.date_ouverture),
       date_modification = now()
  from public.contrats ct
 where ct.id = s.contrat_id
   and s.finalite = 'TERMINE'
   and ct.date_fin is not null
   and s.date_cloture is not null
   and s.date_cloture::date <> greatest(ct.date_fin::timestamptz, s.date_ouverture)::date;

-- ══ LE GARDE-FOU ══
do $$
declare
  v_restants integer;
  v_impossibles integer;
  v_pic integer;
begin
  -- Plus aucun suivi TERMINE ne doit être clos à une autre date que la fin de son contrat
  -- (ou son ouverture, pour les douze nés clos).
  select count(*) into v_restants
    from public.suivis_contrats s
    join public.contrats ct on ct.id = s.contrat_id
   where s.finalite = 'TERMINE' and ct.date_fin is not null
     and s.date_cloture::date <> greatest(ct.date_fin::timestamptz, s.date_ouverture)::date;
  if v_restants > 0 then
    raise exception 'Suivis TERMINE encore clos à la mauvaise date : %', v_restants;
  end if;

  -- Aucun suivi ne peut se clore avant de s'ouvrir.
  select count(*) into v_impossibles
    from public.suivis_contrats where date_cloture is not null and date_cloture < date_ouverture;
  if v_impossibles > 0 then
    raise exception 'Suivis clos avant leur ouverture : %', v_impossibles;
  end if;

  -- Et le pic doit avoir disparu : plus de 20 % des clôtures sur un même jour serait le signe que
  -- le bouche-trou est revenu par une autre porte.
  select max(n) into v_pic from (
    select count(*) n from public.suivis_contrats
     where date_cloture is not null group by date_cloture::date) x;
  raise notice 'Jour de clôture le plus chargé : % suivis (sur 542)', v_pic;
end;
$$;

commit;
