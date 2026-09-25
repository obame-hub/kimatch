-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- L'USAGE D'UNE CLÉ D'API SE RELÈVE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Une clé qu'on a émise et dont on ne sait plus rien ne se révoque jamais : on ignore ce qu'on
-- casserait. Deux chiffres suffisent à décider — la date du dernier appel, et le nombre d'appels.
--
-- ══ POURQUOI UNE FONCTION, ET NON UN `update` DEPUIS LE CODE ══
--
-- Le relevé se fait à chaque requête servie. Un `update` ordinaire depuis le point d'entrée
-- exigerait d'y écrire les colonnes à toucher — et rien n'empêcherait, un jour, d'en toucher
-- d'autres par la même occasion. La fonction fixe une fois pour toutes ce que ce geste change :
-- une date et un compteur, rien d'autre.
--
-- ══ ELLE NE RÉVÈLE RIEN ET NE PEUT RIEN OUVRIR ══
--
-- Elle ne rend aucune valeur, ne lit aucune donnée du partenaire, et n'accepte qu'un identifiant de
-- clé déjà vérifié par empreinte. Appelée avec un identifiant au hasard, elle ne fait rien — pas
-- même une erreur qui apprendrait si cet identifiant existe.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.marquer_usage_cle_api(p_cle_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update cles_api_partenaires
     set derniere_utilisee = now(),
         nb_appels = nb_appels + 1
   where id = p_cle_id
     and actif
     and revoquee_le is null;
$$;

comment on function public.marquer_usage_cle_api(uuid) is
  'Relève l''usage d''une clé d''API : date du dernier appel et compteur. Ne rend rien, ne lit rien, '
  'et ne touche que ces deux colonnes. Appelée par `api/partenaire/` après chaque requête servie, '
  'sans bloquer la réponse.';

-- PERSONNE NE L'APPELLE DEPUIS L'APPLICATION. Le point d'entrée porte la clé de service ; laisser
-- `authenticated` l'appeler donnerait à tout utilisateur connecté le moyen de gonfler le compteur
-- d'une clé, donc de brouiller la seule mesure dont on dispose.
revoke all on function public.marquer_usage_cle_api(uuid) from public;
revoke all on function public.marquer_usage_cle_api(uuid) from authenticated;
grant execute on function public.marquer_usage_cle_api(uuid) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : ELLE COMPTE, ET PERSONNE D'AUTRE NE PEUT L'APPELER
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_tp    uuid;
  v_part  uuid;
  v_cle   uuid;
  v_n     bigint;
  v_date  timestamptz;
  v_ok    boolean := false;
  v_profil uuid;
begin
  select id into v_tp from types_comptes where code = 'PARTENAIRE';
  insert into comptes (nom, type_compte_id) values ('ZZZ GF USAGE', v_tp) returning id into v_part;
  insert into cles_api_partenaires (compte_id, libelle, empreinte, prefixe)
  values (v_part, 'essai', encode(sha256('zzz-usage'::bytea), 'hex'), 'kw_zzzus')
  returning id into v_cle;

  -- ① ELLE COMPTE.
  perform public.marquer_usage_cle_api(v_cle);
  select nb_appels, derniere_utilisee into v_n, v_date from cles_api_partenaires where id = v_cle;
  if v_n <> 1 or v_date is null then
    raise exception 'Le relevé n''a pas eu lieu : nb_appels = %, derniere_utilisee = %.', v_n, v_date;
  end if;
  raise notice 'Garde-fou 1 : un appel est compté (nb_appels = %).', v_n;

  -- ② UNE CLÉ RÉVOQUÉE NE COMPTE PLUS — sinon on croirait une clé morte encore en usage.
  update cles_api_partenaires set revoquee_le = now(), actif = false where id = v_cle;
  perform public.marquer_usage_cle_api(v_cle);
  select nb_appels into v_n from cles_api_partenaires where id = v_cle;
  if v_n <> 1 then
    raise exception 'Une clé révoquée compte encore ses appels (nb_appels = %).', v_n;
  end if;
  raise notice 'Garde-fou 2 : une clé révoquée ne compte plus.';

  -- ③ UN UTILISATEUR CONNECTÉ NE PEUT PAS L'APPELER.
  select p.id into v_profil
    from profils p
    join profils_roles_acces pra on pra.profil_id = p.id
    join roles_acces r on r.id = pra.role_acces_id
   where p.actif and not r.ouvre_administration limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.marquer_usage_cle_api(v_cle);
  exception
    when insufficient_privilege then v_ok := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  if not v_ok then
    raise exception 'Un utilisateur connecté peut appeler marquer_usage_cle_api : le compteur est falsifiable.';
  end if;
  raise notice 'Garde-fou 3 : un utilisateur connecté ne peut pas l''appeler.';

  raise exception 'GARDE-FOU OK';
exception
  when others then
    if sqlerrm <> 'GARDE-FOU OK' then
      raise;
    end if;
    raise notice 'Garde-fou : le relevé compte, s''arrête à la révocation, et reste hors de portée.';
end $$;

commit;
