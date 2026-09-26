-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- L'USAGE D'UNE SESSION PARTENAIRE SE RELÈVE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Même raisonnement que `marquer_usage_cle_api`, posée hier : une session dont on ne sait rien ne
-- se révoque jamais, faute de savoir ce qu'on couperait. Deux chiffres suffisent — la dernière
-- visite et le nombre d'appels.
--
-- ══ ELLE NE RÉVÈLE RIEN ET NE PEUT RIEN OUVRIR ══
--
-- Elle ne rend aucune valeur, ne lit aucune donnée, et n'accepte qu'un identifiant de session déjà
-- vérifié par empreinte. Appelée avec un identifiant au hasard, elle ne fait rien — pas même une
-- erreur qui apprendrait si cet identifiant existe.
--
-- ELLE NE PROLONGE PAS LA SESSION. `sess_expire_le` n'est pas touché : trente jours après
-- l'ouverture, elle expire, qu'on s'en soit servi ou non. Une session qui se prolonge à l'usage ne
-- s'arrête jamais.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.marquer_vue_session_partenaire(p_session_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update sessions_partenaires
     set derniere_vue = now(),
         nb_appels = nb_appels + 1
   where id = p_session_id
     and revoquee_le is null
     and sess_expire_le > now();
$$;

comment on function public.marquer_vue_session_partenaire(uuid) is
  'Relève l''usage d''une session partenaire : dernière visite et compteur. Ne rend rien, ne lit '
  'rien, et NE PROLONGE PAS la session — `sess_expire_le` reste ce qu''il était.';

-- PERSONNE NE L'APPELLE DEPUIS L'APPLICATION. Le point d'entrée porte la clé de service ; laisser
-- `authenticated` l'appeler donnerait à tout utilisateur connecté le moyen de brouiller la seule
-- mesure dont on dispose.
revoke all on function public.marquer_vue_session_partenaire(uuid) from public;
revoke all on function public.marquer_vue_session_partenaire(uuid) from authenticated;
grant execute on function public.marquer_vue_session_partenaire(uuid) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : ELLE COMPTE, NE PROLONGE PAS, ET RESTE HORS DE PORTÉE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_tp     uuid;
  v_part   uuid;
  v_ct     uuid;
  v_sess   uuid;
  v_n      bigint;
  v_avant  timestamptz;
  v_apres  timestamptz;
  v_profil uuid;
  v_ok     boolean := false;
begin
  select id into v_tp from types_comptes where code = 'PARTENAIRE';
  insert into comptes (nom, type_compte_id) values ('ZZZ GF VUE', v_tp) returning id into v_part;
  insert into contacts (nom, prenom, email, compte_id, actif)
  values ('GF', 'Z', 'zzz.gf.vue@kiwee-energie.invalid', v_part, true) returning id into v_ct;

  insert into sessions_partenaires
    (contact_id, compte_id, empreinte_lien, lien_expire_le, empreinte_sess, ouverte_le, sess_expire_le)
  values
    (v_ct, v_part, encode(sha256('zzz-vue-lien'::bytea), 'hex'), now() + interval '24 hours',
     encode(sha256('zzz-vue-sess'::bytea), 'hex'), now(), now() + interval '30 days')
  returning id, sess_expire_le into v_sess, v_avant;

  -- ① ELLE COMPTE.
  perform public.marquer_vue_session_partenaire(v_sess);
  select nb_appels, sess_expire_le into v_n, v_apres from sessions_partenaires where id = v_sess;
  if v_n <> 1 then
    raise exception 'Le relevé n''a pas eu lieu : nb_appels = %.', v_n;
  end if;
  raise notice 'Garde-fou 1 : un appel est compté.';

  -- ② ELLE NE PROLONGE PAS.
  if v_apres is distinct from v_avant then
    raise exception 'La session a été prolongée : % -> %. Elle ne s''arrêterait jamais.', v_avant, v_apres;
  end if;
  raise notice 'Garde-fou 2 : la date d''expiration n''a pas bougé.';

  -- ③ UNE SESSION EXPIRÉE NE COMPTE PLUS.
  update sessions_partenaires set sess_expire_le = now() - interval '1 day' where id = v_sess;
  perform public.marquer_vue_session_partenaire(v_sess);
  select nb_appels into v_n from sessions_partenaires where id = v_sess;
  if v_n <> 1 then
    raise exception 'Une session expirée compte encore ses appels (nb_appels = %).', v_n;
  end if;
  raise notice 'Garde-fou 3 : une session expirée ne compte plus.';

  -- ④ UN UTILISATEUR CONNECTÉ NE PEUT PAS L'APPELER.
  select p.id into v_profil
    from profils p
    join profils_roles_acces pra on pra.profil_id = p.id
    join roles_acces r on r.id = pra.role_acces_id
   where p.actif and not r.ouvre_administration limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.marquer_vue_session_partenaire(v_sess);
  exception
    when insufficient_privilege then v_ok := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  if not v_ok then
    raise exception 'Un utilisateur connecté peut appeler la fonction : le compteur est falsifiable.';
  end if;
  raise notice 'Garde-fou 4 : un utilisateur connecté ne peut pas l''appeler.';

  raise exception 'GARDE-FOU OK';
exception
  when others then
    if sqlerrm <> 'GARDE-FOU OK' then
      raise;
    end if;
    raise notice 'Garde-fou : le relevé compte, ne prolonge pas, et reste hors de portée.';
end $$;

commit;
