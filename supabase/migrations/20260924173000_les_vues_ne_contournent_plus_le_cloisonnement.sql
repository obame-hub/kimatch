-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES VUES NE CONTOURNENT PLUS LE CLOISONNEMENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Trouvé en regardant la capture de l'espace partenaire, le 24/09/2026 : l'écran annonçait
-- « 158 recommandations » et « 45 700 € » à un utilisateur qui ne devait en voir aucune.
--
-- ══ CE QUE J'AI MESURÉ ══
--
-- À la place d'un partenaire, dans une transaction annulée :
--
--     select count(*) from recommandations          ->     0   ✓ la policy joue
--     select count(*) from v_recommandations_liste  -> 1 796   ✗ la vue rend TOUT
--
-- ══ POURQUOI UNE VUE PASSE AU-DESSUS DES POLICIES ══
--
-- Par défaut, une vue s'exécute avec les droits de SON PROPRIÉTAIRE, pas de qui l'interroge. Les 25
-- vues de `public` appartiennent à `postgres` : elles lisent donc les tables sans que les policies
-- s'appliquent, et les rendent telles quelles à l'appelant.
--
-- Le cloisonnement posé le 24/09 était donc contournable par la porte à côté — et c'est exactement
-- l'accident que Michel redoutait : « faut juste qu'on soit sûr qu'il y ait pas d'accident à ce
-- qu'il ait accès à notre base de données, parce que là ça va être très vilain ».
--
-- ══ LA CORRECTION ══
--
-- `security_invoker = true` fait exécuter la vue avec les droits de l'appelant : les policies des
-- tables sous-jacentes s'appliquent alors normalement. C'est une option de PostgreSQL 15+, et cette
-- base est en 17.6.
--
-- NEUF VUES L'AVAIENT DÉJÀ — v_contacts_liste, v_mandats_liste, v_qualite_compte… Ce n'est donc pas
-- une nouveauté dans ce dépôt, c'est une pose qui n'avait pas été faite partout. On la généralise.
--
-- ══ CE QUI NE CHANGE PAS POUR L'ÉQUIPE ══
--
-- Rien. Les tables portent `authenticated_all` avec `using (true)` : un conseiller, un
-- administrateur, le webhook avec sa clé de service lisent exactement comme avant. Seul un
-- partenaire — dont les policies restrictives bornent la lecture — voit la différence. Le garde-fou
-- le vérifie dans les deux sens.
--
-- ══ UNE EXCEPTION ASSUMÉE ══
--
-- `docusign_connexions` porte explicitement `security_invoker = false`. Ce n'est pas un oubli : on
-- ne la touche pas, parce qu'une valeur posée à `false` de façon explicite est une décision, et la
-- retourner sans savoir pourquoi elle a été prise casserait quelque chose qu'on ne voit pas d'ici.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  v_nom text;
  v_faites integer := 0;
begin
  for v_nom in
    select c.relname
      from pg_class c
     where c.relkind = 'v'
       and c.relnamespace = 'public'::regnamespace
       /* ON NE TOUCHE PAS À CELLES QUI PORTENT DÉJÀ UNE DÉCISION EXPLICITE, dans un sens ou dans
          l'autre : `docusign_connexions` est à `false` volontairement. */
       and (c.reloptions is null
            or not exists (
              select 1 from unnest(c.reloptions) o
               where o like 'security_invoker=%'
            ))
  loop
    execute format('alter view public.%I set (security_invoker = true)', v_nom);
    v_faites := v_faites + 1;
  end loop;
  raise notice 'security_invoker posé sur % vue(s).', v_faites;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LA VUE DIT LA MÊME CHOSE QUE LA TABLE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ce que la migration corrige : une vue qui rend ce qu'une policy refuse. Le RISQUE, en changeant
-- 16 vues d'un coup, est double et les deux comptent :
--
--   · trop fermé — l'équipe perdrait ses listes, et ça se verrait tout de suite à l'écran ;
--   · trop ouvert — c'est le défaut qu'on corrige, et lui ne se voit pas.
--
-- On éprouve donc les deux, sur la vue par laquelle le défaut a été trouvé.
--
do $$
declare
  v_partenaire uuid;
  v_profil     uuid;
  v_type_p     uuid;
  v_vue        integer;
  v_table      integer;
  v_equipe     integer;
  v_total      integer;
begin
  select id into v_type_p from public.types_comptes where code = 'PARTENAIRE';
  select id into v_profil from public.profils where actif limit 1;
  if v_type_p is null or v_profil is null then
    raise notice 'Garde-fou ignoré : type PARTENAIRE ou profil actif manquant.';
    return;
  end if;

  select count(*) into v_total from public.v_recommandations_liste;

  insert into public.comptes (nom, type_compte_id)
  values ('zzz garde-fou vues', v_type_p) returning id into v_partenaire;
  update public.profils set compte_partenaire_id = v_partenaire where id = v_profil;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_vue from public.v_recommandations_liste;
  select count(*) into v_table from public.recommandations;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  if v_vue <> v_table then
    raise exception 'La vue rend % lignes là où la table en rend % : le cloisonnement se contourne par les vues.', v_vue, v_table;
  end if;

  -- L'ÉQUIPE N'EST PAS AFFECTÉE : c'est ce qui rend cette migration sûre.
  update public.profils set compte_partenaire_id = null where id = v_profil;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_equipe from public.v_recommandations_liste;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  if v_equipe < v_total then
    raise exception 'Un membre de l''équipe ne voit plus que % recommandations sur % : les vues se sont refermées sur KiWee.', v_equipe, v_total;
  end if;

  delete from public.comptes where id = v_partenaire;

  raise notice 'Garde-fou : le partenaire voit % recommandation(s) par la vue comme par la table, et l''équipe en voit toujours %.', v_vue, v_equipe;
end $$;

commit;
