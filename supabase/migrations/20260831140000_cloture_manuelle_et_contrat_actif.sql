begin;

-- DES AFFAIRES GAGNÉES S'AFFICHAIENT COMME DES BROUILLONS.
--
-- Michel, appel du 31/08/2026 à 14 h 13 : « t'as des opportunités qui étaient même gagnées, qui
-- se retrouvent dans le brouillon ». Vérifié : **29 recommandations** portaient l'étape
-- « Brouillon » alors qu'elles ont un contrat « En cours » et une finalité « Acceptée ».
--
-- LA CAUSE. Dans `recalculer_statut_recommandation`, la première branche du `case` était
-- « aucune version → BROUILLON », et elle passait AVANT le test de la finalité. Une reprise
-- Salesforce qui n'a pas créé de version — parce que les versions n'existaient pas à l'époque —
-- suffisait donc à faire passer une affaire signée pour un dossier jamais commencé.
--
-- SA DÉFINITION, mot pour mot : « Brouillon, c'est une recommandation pour laquelle je n'ai
-- aucune version, et bien évidemment aucun contrat. » Le contrat entre donc dans le calcul.
--
-- ── LA CLÔTURE DEVIENT MANUELLE ─────────────────────────────────────────────────────────────
--
-- Michel : « le statut de la recommandation évolue en fonction du jeu des versions. Mais si je
-- veux vraiment la clôturer, ça se fait manuellement. La version fait évoluer la recommandation,
-- mais ne clôture JAMAIS la recommandation. »
--
-- Cela demande de distinguer deux choses que le code confondait :
--
--   `finalite_cloture`        vient de la reprise Salesforce. Elle dit comment l'OPPORTUNITÉ
--                             s'est terminée là-bas. 1 383 recommandations en portent une.
--   `date_cloture_manuelle`   NOUVELLE. Elle dit que quelqu'un a cliqué « Clôturer » dans
--                             Kimatch, et c'est la seule chose qui ferme un dossier pour de bon.
--
-- Sans cette séparation, appliquer « finalité = clôturée » aurait fermé 208 dossiers, dont 23 sur
-- lesquels une version est EN COURS de construction ou de décision. Fermer un dossier sous les
-- doigts de celui qui y travaille est plus grave que d'afficher une finalité un peu ancienne.
--
-- D'où l'ordre des branches ci-dessous : une clôture manuelle gagne toujours ; à défaut, une
-- version vivante gagne sur une finalité importée.
--
-- Mesuré avant application : 29 lignes changent. Exactement celles que Michel a trouvées.

alter table recommandations
  add column if not exists date_cloture_manuelle timestamptz;

comment on column recommandations.date_cloture_manuelle is
  'Quand quelqu''un a cliqué « Clôturer » dans Kimatch. C''est la SEULE chose qui ferme un dossier '
  'definitivement : le jeu des versions le fait evoluer, jamais le fermer (Michel, 31/08/2026). '
  'A ne pas confondre avec finalite_cloture, qui vient de la reprise Salesforce et dit comment '
  'l''opportunite s''est terminee la-bas.';

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
  -- LE CONTRAT ENTRE DANS LE CALCUL : c'est le correctif du 31/08/2026. Un dossier qui a produit
  -- un contrat n'est pas un brouillon, même si la reprise ne lui a jamais créé de version.
  v_a_contrat := exists (
    select 1 from public.contrats c where c.recommandation_id = p_recommandation
  );

  v_code_cible := case
    -- 1. UNE CLÔTURE MANUELLE GAGNE TOUJOURS. C'est le geste de quelqu'un, il ne se défait pas
    --    parce qu'une version a bougé ensuite.
    when v_manuelle is not null then 'CLOTUREE'
    -- 2. UNE VERSION VIVANTE GAGNE SUR UNE FINALITÉ IMPORTÉE. 23 dossiers sont dans ce cas :
    --    Salesforce dit que l'affaire est close, quelqu'un travaille pourtant dessus aujourd'hui.
    --    C'est le travail en cours qui décrit la réalité, pas la photo prise à l'import.
    when v_statut_derniere in ('EN_CONSTRUCTION', 'DISPONIBLE', 'EN_DECISION') then 'ACTIVE'
    -- 3. LA DÉFINITION DE MICHEL : aucune version ET aucun contrat.
    when not v_a_version and not v_a_contrat then 'BROUILLON'
    -- 4. La finalité reprise de Salesforce : l'affaire s'est terminée là-bas.
    when v_finalite is not null then 'CLOTUREE'
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

-- ── APPLICATION AUX LIGNES EXISTANTES ───────────────────────────────────────────────────────
--
-- Un contrat qui apparaît ou disparaît doit désormais recalculer l'étape de sa recommandation :
-- sans ce déclencheur, le correctif ne vaudrait que pour les lignes qu'on touche à la main.

create or replace function public.propager_contrat_vers_recommandation()
returns trigger
language plpgsql
as $$
begin
  perform public.recalculer_statut_recommandation(
    coalesce(new.recommandation_id, old.recommandation_id)
  );
  -- Un contrat déplacé d'un dossier à l'autre en laisse deux à recalculer.
  if tg_op = 'UPDATE' and new.recommandation_id is distinct from old.recommandation_id then
    perform public.recalculer_statut_recommandation(old.recommandation_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_propager_contrat_vers_recommandation on contrats;

create trigger trg_propager_contrat_vers_recommandation
  after insert or update of recommandation_id or delete
  on contrats
  for each row
  execute function public.propager_contrat_vers_recommandation();

-- Recalcul de toutes les recommandations actives, une fois.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from recommandations where actif loop
    perform public.recalculer_statut_recommandation(v_id);
  end loop;
end $$;

commit;
