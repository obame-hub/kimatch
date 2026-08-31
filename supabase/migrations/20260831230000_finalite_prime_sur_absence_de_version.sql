-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 156 DOSSIERS CLÔTURÉS S'AFFICHAIENT EN « BROUILLON »
--
-- `recalculer_statut_recommandation` décide l'étape d'un dossier à partir de sa dernière version et
-- de sa finalité. Son ordre de test était :
--
--   1. aucune version          → BROUILLON
--   2. version vivante         → ACTIVE
--   3. finalité renseignée     → CLOTUREE
--   4. sinon                   → A_REACTIVER
--
-- Le premier test passait AVANT la finalité. Conséquence : un dossier fermé sans avoir jamais reçu de
-- version — le client ne donne pas suite, on renonce avant d'étudier — retombait en « Brouillon », au
-- milieu du travail à faire, alors qu'on sait très bien pourquoi et quand il a été fermé.
--
-- ══ MESURÉ LE 31/08/2026 ══
--
-- 179 dossiers actifs portent une finalité sans être à l'étape CLOTUREE. Leur détail :
--
--     23  ont une version vivante (19 EN_DECISION, 4 EN_CONSTRUCTION) → ACTIVE, et c'est VOULU :
--         le travail a repris, la finalité est le reste d'une clôture précédente.
--    156  n'ont AUCUNE version → BROUILLON, et c'est l'erreur.
--
-- La colonne « Brouillon » du tableau des recommandations comptait 157 dossiers. 156 d'entre eux
-- étaient donc des affaires terminées. La colonne ne montrait presque rien d'autre que des morts.
--
-- ══ LE NOUVEL ORDRE ══
--
--   1. version vivante         → ACTIVE      (le travail en cours prime sur tout)
--   2. finalité renseignée     → CLOTUREE    (une décision explicite de fermeture)
--   3. aucune version          → BROUILLON   (rien n'a encore été étudié)
--   4. sinon                   → A_REACTIVER
--
-- La version vivante reste en tête : un dossier qu'on retravaille est actif, quoi qu'il ait porté
-- avant. La finalité passe devant l'absence de version parce qu'elle est un geste, et l'absence de
-- version une simple absence. Un geste dit toujours plus qu'un vide.
--
-- ══ LE RATTRAPAGE ══
--
-- La fonction ne s'exécute qu'au passage d'un déclencheur. Les 156 dossiers ne bougeront pas d'eux-
-- mêmes : on la rappelle sur tous les dossiers actifs. Elle n'écrit que si l'étape change, donc
-- l'opération est idempotente et sans effet sur les 1 400 dossiers déjà justes.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.recalculer_statut_recommandation(p_recommandation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut_derniere text;
  v_finalite        text;
  v_code_cible      text;
  v_etape           uuid;
begin
  if p_recommandation is null then
    return;
  end if;

  select r.finalite_cloture into v_finalite
    from public.recommandations r
   where r.id = p_recommandation;

  -- La dernière version : celle que l'application désigne comme courante, à défaut le plus grand
  -- numéro. `version_actuelle` primant, l'écran et ce calcul ne peuvent pas se contredire.
  select s.code into v_statut_derniere
    from public.versions_recommandation v
    left join public.statuts_versions_recommandation s on s.id = v.statut_version_id
   where v.recommandation_id = p_recommandation
   order by v.version_actuelle desc nulls last, v.numero_version desc nulls last
   limit 1;

  v_code_cible := case
    -- Le travail en cours prime : un dossier qu'on retravaille est actif, quoi qu'il ait porté avant.
    when v_statut_derniere in ('EN_CONSTRUCTION', 'DISPONIBLE', 'EN_DECISION') then 'ACTIVE'
    -- Puis la finalité. Elle passe devant l'absence de version : c'est un geste explicite de
    -- fermeture, là où l'absence de version n'est qu'une absence.
    when v_finalite is not null then 'CLOTUREE'
    when v_statut_derniere is null then 'BROUILLON'
    else 'A_REACTIVER'
  end;

  select id into v_etape from public.etapes_recommandation where code = v_code_cible;
  if v_etape is null then
    return;
  end if;

  update public.recommandations
     set etape_id = v_etape,
         date_modification = now()
   where id = p_recommandation
     and etape_id is distinct from v_etape;
end;
$$;

comment on function public.recalculer_statut_recommandation(uuid) is
  'Étape d''un dossier déduite de sa dernière version et de sa finalité. Ordre : version vivante, puis finalité, puis absence de version (corrigé le 31/08/2026 — 156 dossiers clôturés s''affichaient en « Brouillon »).';

-- ── Le rattrapage ──
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.recommandations where actif loop
    perform public.recalculer_statut_recommandation(v_id);
  end loop;
end;
$$;

commit;
