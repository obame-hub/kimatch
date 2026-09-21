-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE ÉTAPE POSÉE À LA MAIN NE SE REPREND PAS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 21/09/2026 : « je veux qu'un choix manuel tienne toujours ».
--
-- ══ CE QUI LE DÉFAISAIT ══
--
-- `recalculer_statut_recommandation` recalcule l'étape à chaque mouvement de version, et sa règle
-- ne connaissait qu'un seul geste humain : la clôture, reconnue à `date_cloture_manuelle`. Tous les
-- autres — rouvrir un dossier endormi, le remettre au brouillon — étaient repris au prochain
-- passage du calcul, sans que personne comprenne pourquoi l'étape avait rebougé toute seule.
--
-- ══ LE DRAPEAU EST UNE DATE, PAS UN BOOLÉEN ══
--
-- Même convention que `date_cloture_manuelle`, et pour la même raison : un booléen dit qu'un geste
-- a eu lieu, une date dit QUAND — ce qui se lit dans l'historique et permet de distinguer un choix
-- d'hier d'un choix de l'an dernier. Elle ne coûte rien de plus.
--
-- ══ LA MAIN REND LA MAIN ══
--
-- Le calcul s'arrête net tant que la date est posée. L'effacer rend le dossier au calcul : c'est ce
-- que fait « Laisser Kimatch décider » sous le chemin, et c'est ce que fait déjà « Rouvrir », qui
-- efface les deux marques d'un coup — rouvrir, c'est rendre un dossier à sa vie normale.
--
-- AUCUNE LIGNE EXISTANTE N'EST TOUCHÉE : la colonne naît vide sur les 1 781 recommandations, donc
-- toutes restent sous le calcul automatique tant que personne n'y touche.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

alter table recommandations
  add column if not exists date_etape_manuelle timestamptz;

comment on column recommandations.date_etape_manuelle is
  'Quand quelqu''un a posé l''étape à la main depuis le chemin de la fiche. Tant qu''elle est renseignée, recalculer_statut_recommandation ne touche plus à l''étape. L''effacer rend le dossier au calcul. Voir la migration du 21/09/2026.';

create or replace function public.recalculer_statut_recommandation(p_recommandation uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_statut_derniere text;
  v_finalite        text;
  v_manuelle        timestamptz;
  v_etape_manuelle  timestamptz;
  v_a_version       boolean;
  v_a_contrat       boolean;
  v_code_cible      text;
  v_etape           uuid;
begin
  if p_recommandation is null then
    return;
  end if;

  select r.finalite_cloture, r.date_cloture_manuelle, r.date_etape_manuelle
    into v_finalite, v_manuelle, v_etape_manuelle
    from public.recommandations r
   where r.id = p_recommandation;

  -- ══ UN CHOIX MANUEL TIENT TOUJOURS (William, 21/09/2026) ══
  -- On sort avant tout calcul : quelqu'un a décidé de l'étape de ce dossier, et le calcul n'a pas à
  -- revenir dessus. Effacer `date_etape_manuelle` le rend au calcul.
  if v_etape_manuelle is not null then
    return;
  end if;

  -- La dernière version : celle que l'application désigne comme courante, à défaut le plus grand
  -- numéro. `version_actuelle` primant, l'écran et ce calcul ne peuvent pas se contredire.
  select s.code into v_statut_derniere
    from public.versions_recommandation v
    left join public.statuts_versions_recommandation s on s.id = v.statut_version_id
   where v.recommandation_id = p_recommandation
   order by v.version_actuelle desc nulls last, v.numero_version desc nulls last
   limit 1;

  v_a_version := exists (
    select 1 from public.versions_recommandation v where v.recommandation_id = p_recommandation
  );
  -- Un dossier qui a produit un contrat n'est pas un brouillon, même si la reprise Salesforce ne
  -- lui a jamais créé de version.
  v_a_contrat := exists (
    select 1 from public.contrats c where c.recommandation_id = p_recommandation
  );

  v_code_cible := case
    -- 1. UNE CLÔTURE MANUELLE GAGNE TOUJOURS.
    when v_manuelle is not null then 'CLOTUREE'
    -- 2. UNE VERSION VIVANTE GAGNE SUR UNE FINALITÉ IMPORTÉE.
    when v_statut_derniere in ('EN_CONSTRUCTION', 'DISPONIBLE', 'EN_DECISION') then 'ACTIVE'
    -- 3. La finalité passe devant l'absence de version.
    when v_finalite is not null then 'CLOTUREE'
    -- 4. LA DÉFINITION DE MICHEL : aucune version ET aucun contrat.
    when not v_a_version and not v_a_contrat then 'BROUILLON'
    -- 5. Un contrat sans version : le dossier a produit quelque chose, il est vivant.
    when not v_a_version and v_a_contrat then 'ACTIVE'
    -- 6. Des versions, toutes clôturées, pas de conclusion : le dossier dort.
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
$function$;
