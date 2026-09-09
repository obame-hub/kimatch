-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES FONCTIONS DE LA LISTE DES SITES N'ONT PLUS DE LECTEUR
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE QUI SE SUPPRIME, ET POURQUOI C'EST SÛR ══════════════════════════════════════════════════
--
-- `liste_sites` et `carte_sites` avaient un seul appelant chacune, l'écran `src/pages/Sites.tsx`,
-- supprimé du dépôt aujourd'hui. Vérifié fichier par fichier avant d'écrire cette migration :
-- `liste_sites` et `carte_sites` n'apparaissent plus nulle part dans `src/`, `api/` ni `scripts/`,
-- sinon dans les commentaires qui racontent leur retrait.
--
-- Leur suppression est la contrepartie ironique du chantier. `liste_sites` était le morceau le plus
-- travaillé du CRM : écrite le 15/08/2026, elle remplaçait à elle seule les 87 requêtes PostgREST
-- que l'écran lançait pour croiser six tables dans le navigateur — 6 348 sites, 7 886 compteurs,
-- plus les signaux, contrats, mandats et recommandations — et rendait 100 lignes filtrées, triées,
-- paginées et scorées en ~140 ms. Elle servait l'écran dont William disait le 09/09 : « l'objet
-- site m'embête plus qu'il ne me sert. »
--
-- ══ CE QUI NE SE SUPPRIME PAS ══════════════════════════════════════════════════════════════════
--
-- `fn_deplacer_site` RESTE. Elle a encore un appelant vivant — `useDeplacerSite`, dans
-- `src/components/compteur/DialogDeplacerCompteur.tsx` : déplacer tout un regroupement d'adresse
-- d'un client vers un autre reste une opération légitime, et c'est même la seule façon propre de
-- corriger un rattachement en masse. Elle a été réécrite le 09/09 (migration 20260909240000) pour
-- ne plus traverser la table `sites` là où ce n'était pas nécessaire.
--
-- Ces trois fonctions étaient les seules du schéma `public` à lire ou écrire `sites` — relevé du
-- jour sur `pg_proc`. Après cette migration il n'en reste qu'une.
--
-- ══ ET LA TABLE `sites` NE PART PAS AUJOURD'HUI ════════════════════════════════════════════════
--
-- Deux raisons mesurées, pas une préférence :
--
--   · `compteurs.site_id` est encore `not null`. Chaque compteur DOIT pointer une ligne de `sites`.
--     C'est aujourd'hui une sécurité — c'est elle qui garantit les « 0 pertes » demandées — mais
--     c'est aussi ce qui interdit de supprimer la table.
--   · Treize fichiers de données lisent encore `sites`, presque toujours pour un nom de site via
--     `site:sites(nom)`. Cinq tables portent leur propre `site_id` et PostgREST ne sait pas
--     embarquer une vue sans clé étrangère : leur nom de site demande soit une dénormalisation de
--     plus, soit une seconde requête. C'est un chantier à part.
--
-- La table ne coûte rien en attendant, et c'est la dernière chose réversible qui reste.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop function if exists liste_sites(text, text, text, integer, integer, uuid);
drop function if exists carte_sites(text);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES GARDE-FOUS — chacun REFAIT le calcul depuis le catalogue
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_restantes text;
  v_deplacer  integer;
  v_compteurs integer;
  v_orphelins integer;
begin
  -- ① LES DEUX FONCTIONS SONT BIEN PARTIES, ET AUCUNE SURCHARGE NE SUBSISTE. Je cherche par NOM
  --   et non par signature : une surcharge oubliée resterait appelable et le `drop` ciblé ne
  --   l'aurait pas vue. `string_agg` plutôt qu'un simple compte — un garde-fou qui annonce
  --   « 1 fonction inattendue » sans la nommer envoie chercher à l'aveugle (leçon du 09/09).
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into v_restantes
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('liste_sites', 'carte_sites');
  if v_restantes is not null then
    raise exception 'Garde-fou : ces fonctions devaient disparaitre et sont encore la -> %', v_restantes;
  end if;

  -- ② `fn_deplacer_site` EST TOUJOURS LÀ. Elle a un appelant vivant dans l'interface ; la perdre
  --   par ricochet casserait le déplacement d'un regroupement d'adresse sans aucun signal.
  select count(*) into v_deplacer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_deplacer_site';
  if v_deplacer <> 1 then
    raise exception 'Garde-fou : fn_deplacer_site devait rester, % exemplaire(s) trouve(s)', v_deplacer;
  end if;

  -- ③ AUCUN COMPTEUR N'A BOUGÉ. Cette migration ne touche que des fonctions, donc le compte doit
  --   être exactement celui d'hier — 7 919 — et aucun compteur ne doit avoir perdu son site.
  --   C'est la promesse « zéro perte » de Naoëlle, revérifiée à chaque étape du chantier.
  select count(*) into v_compteurs from compteurs;
  select count(*) into v_orphelins
    from compteurs c where c.site_id is null or c.groupe_site_id is null or c.compte_id is null;
  if v_orphelins > 0 then
    raise exception 'Garde-fou : % compteur(s) sans site, sans groupe ou sans compte', v_orphelins;
  end if;
  if v_compteurs <> 7919 then
    raise exception 'Garde-fou : % compteurs au lieu des 7919 attendus — cette migration ne devait en toucher aucun', v_compteurs;
  end if;

  raise notice 'Garde-fou passe : liste_sites et carte_sites supprimees, fn_deplacer_site conservee, % compteurs intacts et tous rattaches', v_compteurs;
end $$;

commit;
