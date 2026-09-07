-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CHANGER LE COMPTE D'UN COMPTEUR — LE SITE SUIT
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 07/09/2026 : « donne la possibilité dans le compteur de changer le compte de ce compteur
-- et bien sûr aussi des objets qui sont dépendants de ce compteur ». Puis, la précisant : « il
-- faudrait que quand on change le compte du compteur, ça change automatiquement le compte du site
-- auquel il est rattaché ».
--
-- ══ UN COMPTEUR N'A PAS DE COMPTE ══
--
-- `compteurs` ne porte aucune colonne `compte_id`. Elle porte `site_id`, obligatoire, et le compte
-- se lit à travers le site : compte → site → compteur. Il y a donc DEUX façons de changer le compte
-- d'un compteur, et elles ne font pas la même chose.
--
-- ══ DEUX GESTES, ET LE PREMIER EST LE BON DANS DEUX CAS SUR TROIS ══
--
-- ① EMMENER LE SITE — `fn_deplacer_site`. Le site change de compte, et tout ce qui pend dessous
--   suit sans qu'on y touche : ses compteurs, ses signaux, ses contacts de site, ses actions. C'est
--   le geste que Naoëlle décrit, et c'est le bon quand le SITE lui-même était rangé sous la mauvaise
--   société — le cas de GI155378, corrigé à la main en base le 13/08/2026 faute d'écran.
--
--   MESURÉ LE 07/09/2026 : 5 352 sites sur 6 373 (84 %) n'ont qu'un seul compteur, et 5 352
--   compteurs sur 7 919 (67,6 %) sont seuls sur leur site. Deux fois sur trois, emmener le site
--   n'emmène rien d'autre que le compteur qu'on visait.
--
--   Mais 2 567 compteurs (32,4 %) PARTAGENT leur site. Emmener le site les emmène tous. Ce n'est
--   pas une raison de l'interdire — c'est souvent juste, une copropriété entière ayant été mal
--   classée — c'est une raison de les NOMMER avant le clic. L'écran le fait.
--
-- ② RANGER LE COMPTEUR DANS UN SITE EXISTANT — `fn_deplacer_compteur`. Le site d'origine ne bouge
--   pas ; seul le compteur change de parent. C'est le geste quand un seul PDL d'un immeuble a été
--   attribué à la mauvaise société, et que les autres sont bien là où ils sont.
--
-- ══ CE QUI NE SUIT PAS, DANS LES DEUX CAS ══
--
-- Mandats, contrats, recommandations et opportunités appartiennent au compte qui les a signés ou
-- demandés. Un mandat couvre en moyenne plusieurs compteurs — jusqu'à 38 pour l'un d'eux — et le
-- faire suivre réécrirait un document signé tout en arrachant les autres compteurs à leur propre
-- compte. Ils sont donc COMPTÉS et rendus à l'appelant, jamais déplacés.
--
-- Ce n'est pas une incohérence nouvelle : 46 mandats ont déjà un compte différent de celui de leurs
-- compteurs, et 16 en couvrent plusieurs. Le schéma le tolère, la réalité le contient.
--
-- `evenements_metier` non plus ne suit pas : c'est un journal de ce qui est arrivé, et à l'instant
-- où c'est arrivé le site appartenait bien à l'ancien compte. Réécrire un journal, ce n'est pas le
-- corriger.
--
-- ══ CE QUI SUIT, ET POURQUOI IL FAUT LE RÉÉCRIRE ══
--
-- `requetes` et `interactions` dupliquent `compte_id` en plus de leur lien au site. Sans réécriture,
-- une réclamation resterait affichée sous l'ancienne société alors que son site n'y est plus. On les
-- réécrit donc — la demande est la CORRECTION d'un mauvais classement, et dans une correction tout
-- suit. (Un vrai changement de syndic serait un autre besoin, avec une date d'effet : ce n'est pas
-- ce qui est demandé ici.)
--
-- Les contacts de site, eux, suivent gratuitement : depuis la règle du 07/09/2026, un contact
-- rattaché à un site est éligible sur le compte de ce site. Le site changeant de compte, ils
-- deviennent éligibles sur le nouveau sans qu'on écrive une ligne.
--
-- ══ POURQUOI EN BASE ET NON DEPUIS LE NAVIGATEUR ══
--
-- Chaque geste touche trois à quatre tables. Enchaînés depuis le navigateur, ces appels n'ont aucune
-- transaction commune : une coupure au milieu laisse le site chez son nouveau compte et ses requêtes
-- chez l'ancien. C'est exactement l'incohérence que l'écran sert à réparer. Ici, tout passe ou rien.
--
-- ══ QUI PEUT LE FAIRE ══
--
-- Tout utilisateur qui peut déjà modifier le compteur. Le geste est réversible — on redéplace — et
-- il est journalisé avec son auteur, sa date et son motif. Le réserver aux administrateurs le
-- mettrait hors de portée des commerciaux, qui sont ceux qui repèrent un PDL sous la mauvaise
-- société.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

/**
 * Un contact est-il rattaché à ce compte, de quelque manière que ce soit ?
 *
 * Trois chemins, et non le seul `contacts.compte_id` qui ne porte que le rattachement PRINCIPAL :
 * le compte principal, les rattachements multiples de `contacts_comptes` (depuis le 13/08/2026), et
 * les rattachements par site. C'est la même règle que l'application applique désormais partout.
 */
create or replace function public.fn_contact_rattache_au_compte(p_contact_id uuid, p_compte_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_contact_id is not null and p_compte_id is not null and (
    exists (select 1 from contacts c where c.id = p_contact_id and c.compte_id = p_compte_id)
    or exists (select 1 from contacts_comptes cc
                where cc.contact_id = p_contact_id and cc.compte_id = p_compte_id and cc.actif)
    or exists (select 1 from contacts_sites cs
                join sites s on s.id = cs.site_id
                where cs.contact_id = p_contact_id and s.compte_id = p_compte_id and cs.actif)
  );
$$;

comment on function public.fn_contact_rattache_au_compte(uuid, uuid) is
  'Un contact est-il lié à ce compte — en principal, par contacts_comptes, ou par un de ses sites ? '
  'La règle du 07/09/2026 : lié à un compte ⇒ éligible pour tout ce qui en découle.';


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ① EMMENER LE SITE : le geste demandé, celui qui fait suivre tout l'immeuble
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_deplacer_site(
  p_site_id                uuid,
  p_compte_destination_id  uuid,
  p_motif                  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_compte_origine uuid;
  v_nom_site       text;
  v_nom_origine    text;
  v_nom_dest       text;
  v_compteurs      uuid[];
  v_nb_compteurs   integer;
  v_signaux        integer;
  v_contacts_site  integer;
  v_actions        integer;
  v_requetes       integer := 0;
  v_interactions   integer := 0;
  v_mandats        integer;
  v_contrats       integer;
  v_recos          integer;
  v_opportunites   integer;
  v_correlation    uuid := md5(txid_current()::text)::uuid;
begin
  select s.compte_id, s.nom into v_compte_origine, v_nom_site from sites s where s.id = p_site_id;
  if v_compte_origine is null then
    raise exception 'Site introuvable : %', p_site_id;
  end if;

  select c.nom into v_nom_dest from comptes c where c.id = p_compte_destination_id;
  if v_nom_dest is null then
    raise exception 'Compte de destination introuvable : %', p_compte_destination_id;
  end if;

  if v_compte_origine = p_compte_destination_id then
    raise exception 'Le site « % » appartient déjà à %.', v_nom_site, v_nom_dest;
  end if;

  select c.nom into v_nom_origine from comptes c where c.id = v_compte_origine;

  -- Les compteurs du site : ils suivent pour rien — leur lien est `site_id` — mais on en a besoin
  -- pour retrouver les requêtes qui les visent directement.
  select coalesce(array_agg(cp.id), '{}'), count(*) into v_compteurs, v_nb_compteurs
    from compteurs cp where cp.site_id = p_site_id;

  select count(*) into v_signaux from signaux where site_id = p_site_id;
  select count(*) into v_contacts_site from contacts_sites where site_id = p_site_id;
  select count(*) into v_actions from actions where site_id = p_site_id;

  -- ── CE QUI RESTERA DERRIÈRE, compté AVANT l'écriture ────────────────────────────────────────
  select count(distinct mc.mandat_id) into v_mandats
    from mandats_compteurs mc join mandats m on m.id = mc.mandat_id
   where mc.compteur_id = any(v_compteurs) and m.compte_id = v_compte_origine;

  select count(distinct cc.contrat_id) into v_contrats
    from contrats_compteurs cc join suivis_contrats sc on sc.id = cc.contrat_id
   where cc.compteur_id = any(v_compteurs) and sc.compte_id = v_compte_origine;

  select count(distinct rs.recommandation_id) into v_recos
    from recommandations_sites rs join recommandations r on r.id = rs.recommandation_id
   where rs.site_id = p_site_id and r.compte_id = v_compte_origine;

  select count(distinct os.opportunite_id) into v_opportunites
    from opportunites_sites os join opportunites o on o.id = os.opportunite_id
   where os.site_id = p_site_id and o.compte_id = v_compte_origine;

  -- ── 1. LE SITE. Une seule écriture, et l'immeuble entier change de société ──────────────────
  update sites set compte_id = p_compte_destination_id where id = p_site_id;

  -- ── 2. LES REQUÊTES, qui dupliquent le compte ───────────────────────────────────────────────
  --
  -- Celles du site ET celles qui visent un de ses compteurs sans nommer le site. Uniquement quand
  -- elles pointaient vers l'ancien compte : une requête déjà rangée ailleurs l'a été exprès.
  update requetes set compte_id = p_compte_destination_id
   where compte_id = v_compte_origine
     and (site_id = p_site_id or compteur_id = any(v_compteurs));
  get diagnostics v_requetes = row_count;

  -- ── 3. LES INTERACTIONS rattachées au site ──────────────────────────────────────────────────
  update interactions set compte_id = p_compte_destination_id
   where compte_id = v_compte_origine and site_id = p_site_id;
  get diagnostics v_interactions = row_count;

  -- ── 4. LA TRACE ─────────────────────────────────────────────────────────────────────────────
  --
  -- 'UPDATE' et non un libellé plus parlant : `historiques_entites_operation_check` n'admet que
  -- INSERT, UPDATE, DELETE et CHANGEMENT_STATUT, et changer une contrainte de la table d'historique
  -- pour un mot coûterait un verrou sur la production. C'est `champs_modifies = {compte_id}` sur
  -- `entite_type = 'sites'` qui identifie un déplacement.
  insert into historiques_entites (
    entite_type, entite_id, operation, ancienne_valeur, nouvelle_valeur, champs_modifies,
    motif, auteur_profil_id, source, correlation_id, compte_id
  ) values (
    'sites', p_site_id, 'UPDATE',
    jsonb_build_object('compte_id', v_compte_origine, 'compte_nom', v_nom_origine, 'site_nom', v_nom_site),
    jsonb_build_object('compte_id', p_compte_destination_id, 'compte_nom', v_nom_dest, 'site_nom', v_nom_site),
    array['compte_id'],
    p_motif, auth.uid(), 'APPLICATION', v_correlation, p_compte_destination_id
  );

  return jsonb_build_object(
    'geste', 'site',
    'site', v_nom_site,
    'compte_origine', v_nom_origine,
    'compte_destination', v_nom_dest,
    'suivis', jsonb_build_object(
      'compteurs', v_nb_compteurs, 'signaux', v_signaux, 'contacts_site', v_contacts_site,
      'actions', v_actions, 'requetes', v_requetes, 'interactions', v_interactions),
    'restes', jsonb_build_object(
      'mandats', v_mandats, 'contrats', v_contrats,
      'recommandations', v_recos, 'opportunites', v_opportunites)
  );
end;
$$;

comment on function public.fn_deplacer_site(uuid, uuid, text) is
  'Rattache un site — et donc tous ses compteurs, signaux, contacts de site et actions — à un autre '
  'compte, en une transaction. Réécrit le compte dupliqué sur les requêtes et les interactions. '
  'Mandats, contrats, recommandations et opportunités restent sur l''ancien compte : ils sont signés '
  'ou couvrent d''autres compteurs. Demandé le 07/09/2026 : « quand on change le compte du compteur, '
  'ça change automatiquement le compte du site auquel il est rattaché ».';


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ② RANGER LE COMPTEUR AILLEURS : quand le site, lui, est bien là où il est
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_deplacer_compteur(
  p_compteur_id           uuid,
  p_site_destination_id   uuid,
  p_detacher_contacts     boolean default false,
  p_motif                 text    default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_site_origine    uuid;
  v_compte_origine  uuid;
  v_compte_dest     uuid;
  v_numero          text;
  v_nom_dest        text;
  v_nom_origine     text;
  v_signaux         integer := 0;
  v_requetes        integer := 0;
  v_contacts        integer := 0;
  v_mandats         integer;
  v_contrats        integer;
  v_recos           integer;
  v_opportunites    integer;
  v_correlation     uuid := md5(txid_current()::text)::uuid;
begin
  select cp.site_id, cp.numero_point into v_site_origine, v_numero
    from compteurs cp where cp.id = p_compteur_id;
  if v_site_origine is null then
    raise exception 'Compteur introuvable : %', p_compteur_id;
  end if;

  select s.compte_id, s.nom into v_compte_dest, v_nom_dest
    from sites s where s.id = p_site_destination_id;
  if v_compte_dest is null then
    raise exception 'Site de destination introuvable : %', p_site_destination_id;
  end if;

  select s.compte_id, s.nom into v_compte_origine, v_nom_origine
    from sites s where s.id = v_site_origine;

  if v_site_origine = p_site_destination_id then
    raise exception 'Le compteur % est déjà rattaché au site « % ».', v_numero, v_nom_dest;
  end if;

  -- ── CE QUI RESTERA DERRIÈRE, compté AVANT l'écriture ────────────────────────────────────────
  select count(distinct mc.mandat_id) into v_mandats
    from mandats_compteurs mc join mandats m on m.id = mc.mandat_id
   where mc.compteur_id = p_compteur_id and m.compte_id = v_compte_origine;

  select count(distinct cc.contrat_id) into v_contrats
    from contrats_compteurs cc join suivis_contrats sc on sc.id = cc.contrat_id
   where cc.compteur_id = p_compteur_id and sc.compte_id = v_compte_origine;

  select count(distinct rc.recommandation_id) into v_recos
    from recommandations_compteurs rc join recommandations r on r.id = rc.recommandation_id
   where rc.compteur_id = p_compteur_id and r.compte_id = v_compte_origine;

  select count(distinct oc.opportunite_id) into v_opportunites
    from opportunites_compteurs oc join opportunites o on o.id = oc.opportunite_id
   where oc.compteur_id = p_compteur_id and o.compte_id = v_compte_origine;

  -- ── 1. LE COMPTEUR ──────────────────────────────────────────────────────────────────────────
  update compteurs set site_id = p_site_destination_id where id = p_compteur_id;

  -- ── 2. LES SIGNAUX, qui portent leur propre site (NOT NULL) ─────────────────────────────────
  update signaux set site_id = p_site_destination_id
   where compteur_id = p_compteur_id and site_id = v_site_origine;
  get diagnostics v_signaux = row_count;

  -- ── 3. LES REQUÊTES, qui portent le compte ET le site ───────────────────────────────────────
  update requetes
     set site_id   = case when site_id  = v_site_origine   then p_site_destination_id else site_id end,
         compte_id = case when compte_id = v_compte_origine then v_compte_dest         else compte_id end
   where compteur_id = p_compteur_id
     and (site_id = v_site_origine or compte_id = v_compte_origine);
  get diagnostics v_requetes = row_count;

  -- ── 4. LES CONTACTS PORTÉS PAR LE COMPTEUR, sur demande seulement ───────────────────────────
  --
  -- 6 738 compteurs sur 7 919 désignent un responsable. Il appartient au compte d'origine : effacer
  -- une donnée réelle sans le dire serait pire que l'afficher étrangère, donc par défaut il reste.
  if p_detacher_contacts then
    update compteurs
       set responsable_contact_id =
             case when fn_contact_rattache_au_compte(responsable_contact_id, v_compte_dest)
                  then responsable_contact_id else null end,
           contact_conseil_syndical_id =
             case when fn_contact_rattache_au_compte(contact_conseil_syndical_id, v_compte_dest)
                  then contact_conseil_syndical_id else null end
     where id = p_compteur_id
       and (
         (responsable_contact_id is not null
          and not fn_contact_rattache_au_compte(responsable_contact_id, v_compte_dest))
         or (contact_conseil_syndical_id is not null
             and not fn_contact_rattache_au_compte(contact_conseil_syndical_id, v_compte_dest))
       );
    get diagnostics v_contacts = row_count;
  end if;

  -- ── 5. LA TRACE ─────────────────────────────────────────────────────────────────────────────
  insert into historiques_entites (
    entite_type, entite_id, operation, ancienne_valeur, nouvelle_valeur, champs_modifies,
    motif, auteur_profil_id, source, correlation_id, compte_id
  ) values (
    'compteurs', p_compteur_id, 'UPDATE',
    jsonb_build_object('site_id', v_site_origine, 'site_nom', v_nom_origine, 'compte_id', v_compte_origine),
    jsonb_build_object('site_id', p_site_destination_id, 'site_nom', v_nom_dest, 'compte_id', v_compte_dest),
    array['site_id'],
    p_motif, auth.uid(), 'APPLICATION', v_correlation, v_compte_dest
  );

  return jsonb_build_object(
    'geste', 'compteur',
    'compteur', v_numero,
    'change_de_compte', v_compte_origine is distinct from v_compte_dest,
    'site_origine', v_nom_origine,
    'site_destination', v_nom_dest,
    'suivis', jsonb_build_object('signaux', v_signaux, 'requetes', v_requetes,
                                 'contacts_detaches', v_contacts),
    'restes', jsonb_build_object('mandats', v_mandats, 'contrats', v_contrats,
                                 'recommandations', v_recos, 'opportunites', v_opportunites)
  );
end;
$$;

comment on function public.fn_deplacer_compteur(uuid, uuid, boolean, text) is
  'Rattache un compteur à un autre site sans déplacer son site d''origine — le geste quand un seul '
  'PDL d''un immeuble était attribué à la mauvaise société. Pour faire suivre l''immeuble entier, '
  'voir fn_deplacer_site.';

grant execute on function public.fn_contact_rattache_au_compte(uuid, uuid) to authenticated;
grant execute on function public.fn_deplacer_site(uuid, uuid, text) to authenticated;
grant execute on function public.fn_deplacer_compteur(uuid, uuid, boolean, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- GARDE-FOU : les deux gestes sont joués pour de vrai, et vérifiés
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Une migration qui déplacerait le site sans emmener ses compteurs, ou le compteur sans ses
-- signaux, serait pire que l'absence de fonctionnalité : elle fabriquerait l'incohérence silencieuse
-- que ces écrans existent pour réparer. On la reproduit donc, et on la casse si elle survient.
do $$
declare
  v_type_compte   uuid;
  v_type_energie  uuid;
  v_type_signal   uuid;
  v_statut_signal uuid;
  v_compte_a uuid; v_compte_b uuid;
  v_site_a   uuid; v_site_b   uuid;
  v_pdl_1 uuid; v_pdl_2 uuid; v_signal uuid; v_requete uuid;
  v_res jsonb;
  v_compte_du_site uuid; v_site_du_pdl uuid; v_compte_requete uuid; v_site_signal uuid;
begin
  select id into v_type_compte from types_comptes limit 1;
  select id into v_type_energie from types_energies limit 1;
  select id into v_type_signal from types_signaux limit 1;
  select id into v_statut_signal from statuts_signaux limit 1;

  insert into comptes (nom, type_compte_id) values ('ZZZ TEST DEPLACEMENT A', v_type_compte)
    returning id into v_compte_a;
  insert into comptes (nom, type_compte_id) values ('ZZZ TEST DEPLACEMENT B', v_type_compte)
    returning id into v_compte_b;
  insert into sites (nom, compte_id) values ('ZZZ SITE A', v_compte_a) returning id into v_site_a;
  insert into sites (nom, compte_id) values ('ZZZ SITE B', v_compte_b) returning id into v_site_b;

  -- DEUX compteurs sur le site A : c'est le cas des 32,4 % qui partagent leur site, et celui où le
  -- déplacement du site doit emmener le second sans qu'on l'ait nommé.
  insert into compteurs (numero_point, site_id, type_energie_id)
  values ('00000000000001', v_site_a, v_type_energie) returning id into v_pdl_1;
  insert into compteurs (numero_point, site_id, type_energie_id)
  values ('00000000000002', v_site_a, v_type_energie) returning id into v_pdl_2;

  insert into signaux (site_id, compteur_id, type_signal_id, statut_id, date_detection, origine)
  values (v_site_a, v_pdl_1, v_type_signal, v_statut_signal, now(), 'MANUEL')
  returning id into v_signal;

  insert into requetes (compte_id, site_id, compteur_id, objet)
  values (v_compte_a, v_site_a, v_pdl_1, 'ZZZ test déplacement')
  returning id into v_requete;

  -- ══ ① EMMENER LE SITE ══
  v_res := fn_deplacer_site(v_site_a, v_compte_b, 'garde-fou de migration');

  select compte_id into v_compte_du_site from sites where id = v_site_a;
  select compte_id into v_compte_requete from requetes where id = v_requete;

  if v_compte_du_site <> v_compte_b then
    raise exception 'Le site n''a pas changé de compte (%). Rien n''est appliqué.', v_compte_du_site;
  end if;
  if v_compte_requete <> v_compte_b then
    raise exception 'La requête est restée sur l''ancien compte (%). Rien n''est appliqué.', v_compte_requete;
  end if;
  if (v_res -> 'suivis' ->> 'compteurs')::int <> 2 then
    raise exception 'Le site devait emmener ses DEUX compteurs, le compte rendu dit : %', v_res;
  end if;
  -- Le second compteur suit sans écriture : son lien est `site_id`, et le site a changé de compte.
  if (select s.compte_id from compteurs cp join sites s on s.id = cp.site_id where cp.id = v_pdl_2)
     <> v_compte_b then
    raise exception 'Le second compteur du site n''a pas suivi. Rien n''est appliqué.';
  end if;

  -- ══ ② RANGER LE COMPTEUR AILLEURS ══
  -- On renvoie le premier PDL vers le site B, qui appartient déjà au compte B. Le site A ne doit pas
  -- bouger, et le signal doit suivre le compteur.
  v_res := fn_deplacer_compteur(v_pdl_1, v_site_b, false, 'garde-fou de migration');

  select site_id into v_site_du_pdl from compteurs where id = v_pdl_1;
  select site_id into v_site_signal from signaux where id = v_signal;

  if v_site_du_pdl <> v_site_b then
    raise exception 'Le compteur n''a pas suivi : site % au lieu de %.', v_site_du_pdl, v_site_b;
  end if;
  if v_site_signal <> v_site_b then
    raise exception 'Le signal est resté sur l''ancien site (%). Rien n''est appliqué.', v_site_signal;
  end if;
  if (select site_id from compteurs where id = v_pdl_2) <> v_site_a then
    raise exception 'Le second compteur a bougé alors que seul le premier était visé.';
  end if;

  -- On efface la trace du test : ni la corbeille ni l'historique n'ont à la garder.
  delete from requetes where id = v_requete;
  delete from signaux where id = v_signal;
  delete from compteurs where id in (v_pdl_1, v_pdl_2);
  delete from sites where id in (v_site_a, v_site_b);
  delete from comptes where id in (v_compte_a, v_compte_b);
  delete from historiques_entites
   where entite_id in (v_pdl_1, v_pdl_2, v_signal, v_requete, v_site_a, v_site_b, v_compte_a, v_compte_b);

  raise notice 'Garde-fou passé : le site emmène ses deux compteurs, et un compteur seul emmène son signal.';
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APRÈS APPLICATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Qui a déplacé quoi, et d'où vers où (réservé aux administrateurs par la politique de lecture
-- posée le 07/09/2026) :
--
--   select h.date_modification, p.prenom || ' ' || p.nom as par_qui, h.entite_type,
--          coalesce(h.ancienne_valeur ->> 'compte_nom', h.ancienne_valeur ->> 'site_nom') as depuis,
--          coalesce(h.nouvelle_valeur ->> 'compte_nom', h.nouvelle_valeur ->> 'site_nom') as vers,
--          h.motif
--     from historiques_entites h
--     left join profils p on p.id = h.auteur_profil_id
--    where (h.entite_type = 'sites'     and h.champs_modifies = array['compte_id'])
--       or (h.entite_type = 'compteurs' and h.champs_modifies = array['site_id'])
--    order by h.date_modification desc;
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
