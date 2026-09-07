-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DÉPLACER UN COMPTEUR VERS UN AUTRE COMPTE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 07/09/2026 : « donne la possibilité dans le compteur de changer le compte de ce compteur
-- et bien sûr aussi des objets qui sont dépendants de ce compteur ».
--
-- ══ UN COMPTEUR N'A PAS DE COMPTE ══
--
-- `compteurs` ne porte aucune colonne `compte_id`. Elle porte `site_id`, obligatoire, et le compte
-- se lit à travers le site : compte → site → compteur. « Changer le compte d'un compteur » est donc
-- une seule écriture — le rattacher à un site de l'autre compte — et c'est ce qui la rend possible
-- sans toucher au schéma.
--
-- Le besoin n'est pas théorique : le PDL GI155378 était rangé sous le mauvais site, et il a fallu le
-- corriger à la main en base le 13/08/2026, faute d'écran pour le faire.
--
-- ══ POURQUOI UNE FONCTION EN BASE PLUTÔT QUE TROIS APPELS DEPUIS L'APPLICATION ══
--
-- Un déplacement touche quatre tables : le compteur, ses signaux, ses requêtes, et parfois les
-- contacts qu'il porte. Enchaînés depuis le navigateur, ces appels n'ont AUCUNE transaction commune :
-- une coupure réseau entre le deuxième et le troisième laisse le compteur chez son nouveau compte et
-- ses signaux chez l'ancien. C'est précisément l'incohérence que l'écran sert à réparer.
--
-- Ici, tout passe ou rien ne passe.
--
-- ══ CE QUI SUIT, CE QUI RESTE ══
--
-- SUIVENT SANS RIEN FAIRE — ces tables ne connaissent que le compteur :
--   consommations, compteurs_electricite, compteurs_gaz, et les tarifs portés par les contrats.
--
-- SUIVENT PARCE QU'ON LES RÉÉCRIT — elles portent leur propre pointeur vers le site ou le compte, et
-- resteraient sinon accrochées à l'ancien :
--   signaux.site_id, requetes.site_id, requetes.compte_id
--
-- RESTENT SUR L'ANCIEN COMPTE, ET C'EST VOULU :
--   mandats, contrats, recommandations, opportunités.
--
-- Un mandat est signé : il couvre en moyenne plusieurs compteurs — jusqu'à 38 pour l'un d'eux — et
-- appartient au compte qui l'a signé. Le faire suivre un seul de ses compteurs réécrirait un
-- document signé et arracherait les 37 autres à leur propre compte. La fonction ne les touche donc
-- pas, elle les COMPTE et les rend à l'appelant, pour que l'écran les nomme avant le clic et que la
-- personne sache ce qu'il lui reste à faire.
--
-- Ce n'est pas une incohérence nouvelle : 46 mandats ont déjà un compte différent de celui de leurs
-- compteurs, et 16 en couvrent plusieurs. Le schéma le tolère, la réalité le contient.
--
-- ══ LES CONTACTS PORTÉS PAR LE COMPTEUR ══
--
-- 6 738 compteurs sur 7 919 désignent un responsable, 435 un contact de conseil syndical. Ces
-- personnes appartiennent au compte d'origine. Après le déplacement, elles restent en place PAR
-- DÉFAUT : effacer une donnée réelle sans le dire serait pire que l'afficher étrangère. L'appelant
-- peut demander leur détachement, et alors seuls partent ceux qui ne sont rattachés d'aucune façon
-- au compte de destination — au sens de la règle du 07/09/2026, « à partir du moment où un contact
-- est lié à un compte, il est éligible pour tous les enregistrements qui en découlent ».
--
-- ══ QUI PEUT LE FAIRE ══
--
-- Tout utilisateur qui peut déjà modifier le compteur. Le geste est réversible — on redéplace — et
-- il est journalisé avec son auteur. Le réserver aux administrateurs le mettrait hors de portée des
-- commerciaux, qui sont justement ceux qui repèrent un PDL sous la mauvaise société.
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

/**
 * Déplace un compteur vers un autre site, et rend le compte de ce qui a suivi et de ce qui reste.
 *
 * Rend un objet JSON, jamais une exception silencieuse : l'écran affiche ces nombres après coup et
 * les compare à ce qu'il avait annoncé avant. Un écart se voit alors tout de suite.
 */
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
  -- ── Ce qu'on déplace, et vers où ────────────────────────────────────────────────────────────
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
  --
  -- Compté avant, parce qu'après le déplacement ces objets seraient toujours là mais la question
  -- « appartiennent-ils encore à l'ancien compte ? » n'aurait plus de réponse lisible.
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
  --
  -- Seuls ceux qui pointaient vers le site d'origine : un signal déjà rangé ailleurs a été rangé
  -- exprès, et le déplacement d'un compteur n'est pas une raison de le corriger.
  update signaux set site_id = p_site_destination_id
   where compteur_id = p_compteur_id and site_id = v_site_origine;
  get diagnostics v_signaux = row_count;

  -- ── 3. LES REQUÊTES, qui portent le compte ET le site ───────────────────────────────────────
  update requetes
     set site_id  = case when site_id  = v_site_origine   then p_site_destination_id else site_id end,
         compte_id = case when compte_id = v_compte_origine then v_compte_dest        else compte_id end
   where compteur_id = p_compteur_id
     and (site_id = v_site_origine or compte_id = v_compte_origine);
  get diagnostics v_requetes = row_count;

  -- ── 4. LES CONTACTS PORTÉS PAR LE COMPTEUR, sur demande seulement ───────────────────────────
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
  --
  -- `trg_audit_trace` ne fait qu'horodater la ligne : il ne dit pas d'où le compteur venait. Sans
  -- cette écriture, un PDL passé d'une société à une autre ne laisserait rien derrière lui, et
  -- c'est exactement la question qu'on se posera dans six mois.
  insert into historiques_entites (
    entite_type, entite_id, operation, ancienne_valeur, nouvelle_valeur, champs_modifies,
    motif, auteur_profil_id, source, correlation_id, compte_id
  ) values (
    -- 'UPDATE' ET NON 'DEPLACEMENT' : `historiques_entites_operation_check` n'admet que quatre
    -- valeurs, et changer une contrainte de la table d'historique pour un libelle plus joli
    -- couterait un verrou sur la production. C'est `champs_modifies = {site_id}` qui identifie un
    -- deplacement, et c'est ce que la requete de relecture ci-dessous utilise.
    'compteurs', p_compteur_id, 'UPDATE',
    jsonb_build_object('site_id', v_site_origine, 'site_nom', v_nom_origine, 'compte_id', v_compte_origine),
    jsonb_build_object('site_id', p_site_destination_id, 'site_nom', v_nom_dest, 'compte_id', v_compte_dest),
    array['site_id'],
    p_motif, auth.uid(), 'APPLICATION', v_correlation, v_compte_dest
  );

  return jsonb_build_object(
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
  'Rattache un compteur à un autre site — donc à un autre compte — en une transaction, avec ses '
  'signaux et ses requêtes. Les mandats, contrats, recommandations et opportunités restent sur '
  'l''ancien compte : ils sont signés ou couvrent d''autres compteurs. Rend le détail de ce qui a '
  'suivi et de ce qui est resté. Demandé le 07/09/2026 ; le cas fondateur est GI155378, corrigé à '
  'la main en base le 13/08/2026 faute d''écran.';

grant execute on function public.fn_contact_rattache_au_compte(uuid, uuid) to authenticated;
grant execute on function public.fn_deplacer_compteur(uuid, uuid, boolean, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- GARDE-FOU : on déplace vraiment un compteur, et on vérifie ce qui a suivi
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Deux comptes, deux sites, un compteur avec un signal et une requête. Après le déplacement, le
-- compteur, le signal et la requête doivent TOUS être chez le second compte. Une migration qui
-- déplacerait le compteur seul serait pire que l'absence de fonctionnalité : elle fabriquerait
-- l'incohérence silencieuse que cet écran existe pour réparer.
do $$
declare
  v_type_compte  uuid;
  v_type_energie uuid;
  v_type_signal  uuid;
  v_statut_signal uuid;
  v_compte_a uuid; v_compte_b uuid;
  v_site_a   uuid; v_site_b   uuid;
  v_compteur uuid; v_signal uuid; v_requete uuid;
  v_resultat jsonb;
  v_site_final uuid; v_signal_site uuid; v_requete_compte uuid;
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

  insert into compteurs (numero_point, site_id, type_energie_id)
  values ('00000000000001', v_site_a, v_type_energie) returning id into v_compteur;

  insert into signaux (site_id, compteur_id, type_signal_id, statut_id, date_detection, origine)
  values (v_site_a, v_compteur, v_type_signal, v_statut_signal, now(), 'MANUEL')
  returning id into v_signal;

  insert into requetes (compte_id, site_id, compteur_id, objet)
  values (v_compte_a, v_site_a, v_compteur, 'ZZZ test déplacement')
  returning id into v_requete;

  -- LE MOMENT DE VÉRITÉ.
  v_resultat := fn_deplacer_compteur(v_compteur, v_site_b, false, 'garde-fou de migration');

  select site_id into v_site_final from compteurs where id = v_compteur;
  select site_id into v_signal_site from signaux where id = v_signal;
  select compte_id into v_requete_compte from requetes where id = v_requete;

  if v_site_final <> v_site_b then
    raise exception 'Le compteur n''a pas suivi : site % au lieu de %.', v_site_final, v_site_b;
  end if;
  if v_signal_site <> v_site_b then
    raise exception 'Le signal est resté sur l''ancien site (%). Rien n''est appliqué.', v_signal_site;
  end if;
  if v_requete_compte <> v_compte_b then
    raise exception 'La requête est restée sur l''ancien compte (%). Rien n''est appliqué.', v_requete_compte;
  end if;
  if (v_resultat -> 'suivis' ->> 'signaux')::int <> 1 or (v_resultat -> 'suivis' ->> 'requetes')::int <> 1 then
    raise exception 'Le compte rendu ne correspond pas à ce qui a été écrit : %', v_resultat;
  end if;

  -- On efface la trace du test : ni la corbeille ni l'historique n'ont à la garder.
  delete from requetes where id = v_requete;
  delete from signaux where id = v_signal;
  delete from compteurs where id = v_compteur;
  delete from sites where id in (v_site_a, v_site_b);
  delete from comptes where id in (v_compte_a, v_compte_b);
  delete from historiques_entites
   where entite_id in (v_compteur, v_signal, v_requete, v_site_a, v_site_b, v_compte_a, v_compte_b);

  raise notice 'Garde-fou passé : le compteur, son signal et sa requête ont suivi ensemble.';
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APRÈS APPLICATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Qui a déplacé quoi, et d'où vers où (réservé aux administrateurs par la politique de lecture
-- posée le 07/09/2026) :
--
--   select h.date_modification, p.prenom || ' ' || p.nom as par_qui,
--          h.ancienne_valeur ->> 'site_nom' as depuis, h.nouvelle_valeur ->> 'site_nom' as vers,
--          h.motif
--     from historiques_entites h
--     left join profils p on p.id = h.auteur_profil_id
--    where h.entite_type = 'compteurs' and h.champs_modifies = array['site_id']
--    order by h.date_modification desc;
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
