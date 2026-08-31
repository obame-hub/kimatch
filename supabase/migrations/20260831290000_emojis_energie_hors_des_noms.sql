-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES EMOJIS D'ÉNERGIE SORTENT DES NOMS DE RECOMMANDATION
--
-- Naoëlle, 31/08/2026 : « remplace tous les emojis comme celui du gaz et élec qui font pas pro du
-- tout, remplace-les par des icônes gaz et élec minimalistes ».
--
-- ══ CE QUE J'AI TROUVÉ EN CHERCHANT L'EMOJI DANS LE CODE ══
--
-- Il n'y est pas. Sur 1 697 recommandations, **204 portent l'emoji dans leur NOM**, en préfixe,
-- hérité de la reprise Salesforce :
--
--   110  « 🔥 CABINET MOLINIER - SDC 5JOFFRE »        gaz
--    94  « ⚡ KIWEE ENERGIE FRANCE - TEST ELEC »       électricité
--
-- Aucun composant ne les dessine : l'écran affiche simplement le nom stocké. Les remplacer par une
-- icône dans le code n'aurait donc rien changé — l'emoji serait resté, doublé d'une icône.
--
-- ══ L'EMOJI EST REDONDANT — SAUF DEUX FOIS ══
--
-- Croisé avec `type_energie_id` :
--
--   ELECTRICITE + éclair   92     la colonne dit déjà la même chose
--   GAZ + flamme          110     idem
--   (vide) + éclair         2     ← ICI L'EMOJI EST LA SEULE SOURCE
--
-- D'où l'ordre des deux opérations. On REMPLIT d'abord la colonne sur ces deux lignes, on nettoie
-- les noms ensuite. L'inverse aurait détruit la seule trace de leur type d'énergie — deux lignes sur
-- mille sept cents, invisibles dans un total, définitivement perdues.
--
-- ══ POURQUOI EN BASE ET NON À L'AFFICHAGE ══
--
-- Retirer le préfixe au moment de l'affichage aurait laissé l'emoji dans le nom réel : il serait
-- ressorti dans les exports, les messages Slack, les PDF de mandat et la recherche — « 🔥 CABINET »
-- ne se trouve pas en tapant « CABINET » si la recherche compare le début de la chaîne. Le nom d'un
-- dossier doit être le nom du dossier.
--
-- ══ RETOUR ARRIÈRE ══
--
-- Le préfixe se reconstruit depuis `type_energie_id`, qui porte désormais l'information pour les
-- 204 lignes. Rien n'est perdu, mais rien ne le justifie non plus : c'est du bruit d'import.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Les deux lignes dont l'emoji est la seule source ──
update public.recommandations r
   set type_energie_id = (select id from public.types_energies where code = 'ELECTRICITE')
 where r.type_energie_id is null and r.nom like '⚡%';

update public.recommandations r
   set type_energie_id = (select id from public.types_energies where code = 'GAZ')
 where r.type_energie_id is null and r.nom like '🔥%';

-- ── 2. Le préfixe quitte les noms ──
-- `ltrim` sur l'espace qui suit : « 🔥 CABINET » laisserait « CABINET » précédé d'une espace, et un
-- tri alphabétique remonterait ces 204 dossiers en tête de liste sans qu'on comprenne pourquoi.
update public.recommandations
   set nom = ltrim(regexp_replace(nom, '^[🔥⚡]\s*', ''))
 where nom ~ '^[🔥⚡]';

-- ── 3. Le garde-fou ──
do $$
declare
  v_restants integer;
  v_orphelins integer;
begin
  select count(*) into v_restants from public.recommandations where nom ~ '^[🔥⚡]';
  if v_restants > 0 then
    raise exception 'Nettoyage incomplet : % nom(s) portent encore un emoji.', v_restants;
  end if;

  -- Aucun des 204 ne doit avoir perdu son type d'énergie au passage.
  select count(*) into v_orphelins
    from public.recommandations
   where type_energie_id is null and nom ~ '[🔥⚡]';
  if v_orphelins > 0 then
    raise exception 'Incohérence : % dossier(s) sans type d''énergie portent encore un emoji.', v_orphelins;
  end if;
end;
$$;

commit;
