-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- « ON A BIEN CLÔTURÉ, MIS LE MOTIF, ET LE STATUT RESTE EN ACTIVE »
--
-- Naoëlle, 02/09/2026, capture à l'appui sur « SAS TVPJ - SDC 27 BD JOFFRE ». Le dossier porte
-- bien tout ce qu'une clôture écrit :
--
--     finalite_cloture        ACCEPTEE
--     motif_cloture           « Gagnée face à DALKIA »
--     date_cloture            30/08/2026
--     date_cloture_manuelle   02/09/2026 14:11
--
-- ... et son étape est ACTIVE. Pas un affichage en retard : c'est bien ACTIVE qui est écrit en base.
--
-- ══ CE QUI S'EST PASSÉ ══
--
-- Le 31/08/2026, DEUX migrations ont réécrit `recalculer_statut_recommandation` à quelques heures
-- d'intervalle, et la seconde a été écrite à partir de la version d'AVANT la première :
--
--   14 h  20260831140000_cloture_manuelle_et_contrat_actif
--         → ajoute `date_cloture_manuelle` en tête du calcul (« une clôture manuelle gagne
--           TOUJOURS ») et fait entrer le contrat dans la définition du brouillon.
--   23 h  20260831230000_finalite_prime_sur_absence_de_version
--         → corrige l'ordre finalité / absence de version… et repart d'une copie qui ne connaît
--           ni `date_cloture_manuelle` ni le contrat. Les deux branches de 14 h disparaissent.
--
-- La fonction en production ne lit donc plus du tout `date_cloture_manuelle`. Sur le dossier de
-- Naoëlle, la version 1 est EN_DECISION : la branche « version vivante → ACTIVE » gagne, et le
-- déclencheur `trg_propager_cloture_vers_statut` — qui s'arme précisément quand on clôture —
-- réécrit ACTIVE dans la seconde qui suit le clic. Clôturer défaisait sa propre clôture.
--
-- C'est exactement ce que Michel avait tranché le 31/08 : « la version fait évoluer la
-- recommandation, mais ne clôture JAMAIS la recommandation, ça doit se faire manuellement. » Une
-- clôture à la main est un geste ; une version qui bouge ensuite ne l'annule pas.
--
-- ══ PORTÉE MESURÉE (02/09/2026) ══
--
-- 4 dossiers portent une `date_cloture_manuelle` — la fonctionnalité est récente. 1 est contredit
-- (celui de la capture), 3 sont déjà CLOTUREE parce qu'aucune version vivante ne les tirait
-- ailleurs. Le rattrapage en fin de fichier remet le premier d'aplomb.
--
-- Le nombre est petit aujourd'hui et c'est tout l'enjeu : sans ce correctif, tout dossier clôturé
-- à la main alors qu'une version reste ouverte se rouvrirait tout seul — et c'est le cas le plus
-- courant, puisqu'on clôture justement une affaire gagnée dont la version est partie en décision.
--
-- ══ L'ORDRE RÉTABLI, LES DEUX CORRECTIFS DU 31/08 RÉUNIS ══
--
--   1. clôture manuelle          → CLOTUREE     le geste de quelqu'un, il ne se défait pas
--   2. version vivante           → ACTIVE       le travail en cours prime sur une finalité importée
--   3. finalité renseignée       → CLOTUREE     un geste dit plus qu'une absence (correctif de 23 h)
--   4. ni version ni contrat     → BROUILLON    la définition de Michel (correctif de 14 h)
--   5. contrat sans version      → ACTIVE       le dossier a produit quelque chose (correctif de 14 h)
--   6. sinon                     → A_REACTIVER  des versions, toutes closes, aucune conclusion
--
-- Le 3 passe devant le 4 : c'est le correctif de 23 h, celui qui a sorti 156 affaires terminées de
-- la colonne « Brouillon ». Il est conservé tel quel.
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
  v_manuelle        timestamptz;
  v_a_version       boolean;
  v_a_contrat       boolean;
  v_code_cible      text;
  v_etape           uuid;
begin
  if p_recommandation is null then
    return;
  end if;

  select r.finalite_cloture, r.date_cloture_manuelle
    into v_finalite, v_manuelle
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

  v_a_version := exists (
    select 1 from public.versions_recommandation v where v.recommandation_id = p_recommandation
  );
  -- Un dossier qui a produit un contrat n'est pas un brouillon, même si la reprise Salesforce ne
  -- lui a jamais créé de version.
  v_a_contrat := exists (
    select 1 from public.contrats c where c.recommandation_id = p_recommandation
  );

  v_code_cible := case
    -- 1. UNE CLÔTURE MANUELLE GAGNE TOUJOURS. C'est le geste de quelqu'un, il ne se défait pas
    --    parce qu'une version a bougé ensuite. Rouvrir efface `date_cloture_manuelle`, et c'est
    --    par là que le dossier repasse sous les branches suivantes.
    when v_manuelle is not null then 'CLOTUREE'
    -- 2. UNE VERSION VIVANTE GAGNE SUR UNE FINALITÉ IMPORTÉE. Salesforce dit que l'affaire est
    --    close, quelqu'un travaille pourtant dessus aujourd'hui : c'est le travail en cours qui
    --    décrit la réalité, pas la photo prise à l'import.
    when v_statut_derniere in ('EN_CONSTRUCTION', 'DISPONIBLE', 'EN_DECISION') then 'ACTIVE'
    -- 3. La finalité passe devant l'absence de version : c'est un geste explicite de fermeture,
    --    là où l'absence de version n'est qu'une absence.
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
$$;

comment on function public.recalculer_statut_recommandation(uuid) is
  'Étape d''un dossier déduite de sa clôture manuelle, de sa dernière version, de sa finalité et de ses contrats. Ordre : clôture manuelle, version vivante, finalité, ni version ni contrat, contrat sans version (les correctifs du 31/08/2026 14 h et 23 h réunis le 02/09/2026 — la réécriture de 23 h avait perdu la clôture manuelle, si bien qu''une clôture à la main sur un dossier à version vivante se défaisait aussitôt).';

-- ── LE RATTRAPAGE ───────────────────────────────────────────────────────────────────────────────
--
-- La fonction ne s'exécute qu'au passage d'un déclencheur : les dossiers déjà contredits ne
-- bougeront pas d'eux-mêmes. On la rappelle sur les dossiers actifs. Elle n'écrit que si l'étape
-- change, donc l'opération est idempotente et sans effet sur les 1 400 dossiers déjà justes.
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

-- ── CONTRÔLE APRÈS APPLICATION ──────────────────────────────────────────────────────────────────
--
-- Doit renvoyer CLOTUREE, et zéro ligne pour la seconde requête :
--
--   select e.code from recommandations r
--     join etapes_recommandation e on e.id = r.etape_id
--    where r.id = '6510cdee-3071-495c-91a1-64aff577a069';
--
--   select r.id, r.nom, e.code from recommandations r
--     left join etapes_recommandation e on e.id = r.etape_id
--    where r.date_cloture_manuelle is not null and e.code is distinct from 'CLOTUREE';
