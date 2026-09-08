-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- QUALIFIER L'APPEL EN UN CLIC
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, réunion du 08/09/2026 : « au moins que tous les appels soient qualifiés au minimum, grand
-- minimum : est-ce que j'ai réussi à avoir quelqu'un au téléphone, ou est-ce que j'ai eu personne ?
-- C'est le minimum du minimum. »
--
-- Michel, dans la même réunion, et c'est lui qui fixe la limite : « il faut mettre en place ce que
-- les commerciaux vont vraiment faire dans la réalité. Si c'est mettre "je l'ai eu, je l'ai pas eu"
-- et que dans l'application c'est obligatoire, ils le feront, il n'y a pas de problème. Mais qu'à
-- chaque fois ils mettent une note, ils ne le feront quasiment jamais. »
--
-- D'où QUATRE VALEURS ET PAS UNE DE PLUS. Un clic, pas un formulaire.
--
-- ══ POURQUOI ON NE PEUT PAS SE FIER À ALLO POUR ÇA ══
--
-- William : « si tu tombes sur un serveur interactif vocal, ils estiment que ça a répondu. Il y a
-- plein de fois où Fabien tombait sur un répondeur et ça nous disait que ça avait décroché —
-- c'était marqué answered. Ça me faisait même un résumé IA du serveur interactif vocal. »
--
-- C'est exact, et à moitié réparable sans rien demander au commercial : `call.completed` porte
-- `ivr_result`, la liste des touches du menu vocal traversées. Non vide, l'appel a rencontré une
-- machine, quoi que dise `result`. C'est déjà enregistré dans `ivr_touches`.
--
-- Mais `ivr_result` ne dit rien d'un répondeur personnel ni d'une secrétaire qui filtre. Seul
-- l'humain qui a l'écouteur le sait. D'où ce champ, et d'où le fait qu'il soit rempli à la main.
--
-- ══ LE RÉSUMÉ IA NE SUIT QUE SI QUELQU'UN A RÉPONDU ══
--
-- William : « je veux un résumé IA uniquement quand j'ai joint un humain. Peu importe que ce soit la
-- secrétaire, le décisionnaire ou la comptable — mais quand tu as quelqu'un au téléphone, mets-moi
-- un résumé de ce qu'on s'est dit, et le lien d'enregistrement. Par contre quand tu as un répondeur,
-- marque juste répondeur. »
--
-- `fn_resume_a_afficher` applique cette règle en base plutôt que dans chaque écran : le résumé d'Allo
-- ne remonte que sur un appel qualifié HUMAIN. Ailleurs, il reste stocké — on ne jette pas une donnée
-- — mais il ne s'affiche pas, et c'est toute la différence entre un historique lisible et un
-- historique rempli de résumés de serveurs vocaux.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.appels_en_cours
  add column if not exists qualification text,
  add column if not exists qualifie_le timestamptz,
  add column if not exists qualifie_par uuid references public.profils (id) on delete set null;

-- QUATRE VALEURS. Chacune correspond à un clic, et à une question qu'un commercial peut trancher
-- sans réfléchir pendant qu'il a l'écouteur à l'oreille.
--
--   HUMAIN         quelqu'un a répondu, qui que ce soit
--   REPONDEUR      messagerie vocale
--   SERVEUR_VOCAL  un menu, un standard automatique
--   PAS_DE_REPONSE ça a sonné dans le vide
--
-- `NON_QUALIFIE` n'existe pas comme valeur : l'absence de qualification, c'est `null`. Une valeur
-- « non qualifié » se met à ressembler à un choix, et on finit par la compter comme tel.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appels_en_cours_qualification_check') then
    alter table public.appels_en_cours
      add constraint appels_en_cours_qualification_check
      check (qualification is null or qualification in
             ('HUMAIN', 'REPONDEUR', 'SERVEUR_VOCAL', 'PAS_DE_REPONSE'));
  end if;
end $$;

comment on column public.appels_en_cours.qualification is
  'Ce que le commercial a réellement eu au bout du fil, en un clic. Existe parce qu''Allo compte un '
  'serveur vocal comme un décroché : `result` vaut ANSWERED et son résumé IA décrit le menu. '
  'Demandé par William le 08/09/2026, borné à quatre valeurs par Michel — « il faut mettre en place '
  'ce que les commerciaux vont vraiment faire ».';

-- Ce que l'écran des KPI comptera : les appels qualifiés, par personne et par jour.
create index if not exists appels_en_cours_qualification_idx
  on public.appels_en_cours (profil_id, qualification, demarre_le desc)
  where qualification is not null;

/**
 * Le résumé à MONTRER, qui n'est pas toujours le résumé stocké.
 *
 * Règle de William : le résumé d'Allo ne vaut que si un humain a répondu. Sur un serveur vocal, Allo
 * produit un résumé du MENU — parfaitement rédigé, totalement inutile, et il pollue l'historique.
 *
 * L'ORDRE DES TESTS COMPTE. `ivr_touches` passe AVANT la qualification : quand Allo a détecté un
 * menu vocal, c'est un fait machine, plus fiable qu'un clic pris à la volée. La qualification humaine
 * tranche ensuite les cas qu'Allo ne sait pas distinguer.
 */
create or replace function public.fn_resume_a_afficher(
  p_qualification text,
  p_ivr_touches jsonb,
  p_resume text
)
returns text
language sql
immutable
as $$
  select case
    when p_ivr_touches is not null and jsonb_array_length(p_ivr_touches) > 0
      then 'Serveur vocal — aucun échange.'
    when p_qualification = 'REPONDEUR'      then 'Répondeur.'
    when p_qualification = 'PAS_DE_REPONSE' then 'Pas de réponse.'
    when p_qualification = 'SERVEUR_VOCAL'  then 'Serveur vocal — aucun échange.'
    when p_qualification = 'HUMAIN'         then nullif(trim(coalesce(p_resume, '')), '')
    -- PAS ENCORE QUALIFIÉ : on ne montre rien plutôt qu'un résumé peut-être faux. Le commercial
    -- vient de raccrocher, il va cliquer ; afficher le résumé d'Allo en attendant reviendrait à
    -- afficher précisément ce qu'on cherche à ne plus afficher.
    else null
  end;
$$;

comment on function public.fn_resume_a_afficher(text, jsonb, text) is
  'Le résumé d''appel tel qu''on le montre : celui d''Allo seulement si un humain a répondu. '
  '« Je veux un résumé IA uniquement quand j''ai joint un humain » (William, 08/09/2026). Un menu '
  'vocal détecté par Allo l''emporte sur la qualification : c''est un fait machine.';

grant execute on function public.fn_resume_a_afficher(text, jsonb, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LE TEMPS RÉEL, RENDU DISPONIBLE SANS ÊTRE UTILISÉ
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Relevé le 08/09/2026 : `supabase_realtime` ne publie AUCUNE table, et aucun écran de Kimatch
-- n'appelle `.channel()`. Le temps réel n'a jamais servi ici.
--
-- L'écran de la carte d'appel s'ouvre donc par INTERROGATION RÉGULIÈRE et non par websocket. Ce
-- n'est pas l'outil le plus élégant, c'est celui dont je connais les modes de panne sans avoir à
-- l'éprouver : introduire une première dépendance websocket la veille d'un test, sur une
-- application dont l'équipe a été arrêtée une heure hier, serait mal choisir son moment.
--
-- La table rejoint quand même la publication : c'est instantané, sans effet de bord, et le jour où
-- la latence de quatre secondes gênera, le passage au temps réel ne demandera plus de migration —
-- seulement de remplacer l'intervalle par un abonnement dans `appelEnCours.ts`.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appels_en_cours'
  ) then
    alter publication supabase_realtime add table public.appels_en_cours;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- GARDE-FOU
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_appel uuid;
  v_refuse boolean := false;
begin
  insert into public.appels_en_cours (user_email, numero, sens, demarre_le)
  values ('zzz.test@kiwee-energie.fr', '+33999999997', 'SORTANT', now())
  returning id into v_appel;

  -- Les quatre valeurs passent.
  update public.appels_en_cours set qualification = 'HUMAIN' where id = v_appel;
  update public.appels_en_cours set qualification = 'REPONDEUR' where id = v_appel;
  update public.appels_en_cours set qualification = 'SERVEUR_VOCAL' where id = v_appel;
  update public.appels_en_cours set qualification = 'PAS_DE_REPONSE' where id = v_appel;

  -- Une cinquième ne passe pas : sans ce contrôle, un écran mal câblé écrirait n'importe quoi et les
  -- KPI compteraient des catégories inventées.
  begin
    update public.appels_en_cours set qualification = 'PEUT_ETRE' where id = v_appel;
  exception when check_violation then
    v_refuse := true;
  end;

  delete from public.appels_en_cours where id = v_appel;

  if not v_refuse then
    raise exception 'La contrainte de qualification n''agit pas. Rien n''est appliqué.';
  end if;

  -- ══ LA RÈGLE DU RÉSUMÉ ══
  if fn_resume_a_afficher('HUMAIN', null, 'Bon échange, à rappeler') is distinct from 'Bon échange, à rappeler' then
    raise exception 'Le résumé ne remonte pas sur un appel humain. Rien n''est appliqué.';
  end if;
  if fn_resume_a_afficher('HUMAIN', '[{"dtmf_key":"2"}]'::jsonb, 'Résumé du menu vocal') <> 'Serveur vocal — aucun échange.' then
    raise exception 'Un menu vocal détecté par Allo ne l''emporte pas sur la qualification. Rien n''est appliqué.';
  end if;
  if fn_resume_a_afficher('REPONDEUR', null, 'Résumé inutile du répondeur') <> 'Répondeur.' then
    raise exception 'Le résumé d''Allo remonte sur un répondeur. Rien n''est appliqué.';
  end if;
  if fn_resume_a_afficher(null, null, 'Résumé pas encore validé') is not null then
    raise exception 'Un appel non qualifié montre déjà son résumé. Rien n''est appliqué.';
  end if;

  raise notice 'Garde-fou passé : quatre qualifications admises, une cinquième refusée, et le résumé ne remonte que sur un humain.';
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APRÈS APPLICATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Combien d'appels sont partis sans qualification, par personne :
--
--   select p.prenom || ' ' || p.nom as qui,
--          count(*) filter (where a.qualification is null)::int as a_qualifier,
--          count(*)::int as total
--     from appels_en_cours a left join profils p on p.id = a.profil_id
--    where a.termine_le is not null
--    group by 1 order by 2 desc;
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
