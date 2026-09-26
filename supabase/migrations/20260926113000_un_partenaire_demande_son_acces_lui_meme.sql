-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN PARTENAIRE DEMANDE SON ACCÈS LUI-MÊME
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 26/09/2026 : « pour la clé je suis pas trop fan du processus, je préfère qu'ils
-- reçoivent ou un code ou un lien ou quelque chose dans leur boîte mail afin qu'ils soient
-- indépendants et n'attendent pas notre clé de notre part qu'on leur envoie ».
--
-- ══ CE QUI CHANGE ══
--
-- Avant : KiWee émet une clé, la copie, l'envoie par un moyen quelconque. Le partenaire attend.
-- Après : il saisit son adresse sur `/partenaire`, et reçoit un lien. Personne n'attend personne.
--
-- ══ LE LIEN EST UN SAS, PAS UN ACCÈS ══
--
-- Vingt-quatre heures, comme un lien de connexion Kimatch. Il ne DONNE pas l'accès : il ouvre une
-- session dans le navigateur, qui dure ensuite trente jours. Un mail qui traîne dans une boîte —
-- ou qui a été transféré — ne vaut donc plus rien le lendemain.
--
-- C'est la différence avec une clé d'API, qui reste valable jusqu'à révocation : la clé sert un
-- programme, le lien sert une personne, et une personne se reconnecte.
--
-- ══ ON NE DIT JAMAIS QUI EXISTE ══
--
-- Une adresse inconnue reçoit exactement la même réponse qu'une adresse connue : « si cette
-- adresse nous est connue, vous allez recevoir un lien ». Distinguer les deux permettrait
-- d'éprouver des adresses une par une pour savoir qui travaille avec KiWee.
--
-- ══ POURQUOI UNE TABLE À PART, ET NON `cles_api_partenaires` ══
--
-- Une clé d'API et une session de navigateur ne vivent pas la même vie : l'une est émise une fois
-- pour un programme et se révoque à la main, l'autre naît à chaque connexion et expire seule. Les
-- mêler obligerait à distinguer les deux cas partout, et la première liste — celle que
-- l'administration montre — se remplirait de sessions.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists sessions_partenaires (
  id             uuid primary key default gen_random_uuid(),
  contact_id     uuid not null references contacts(id) on delete cascade,
  compte_id      uuid not null references comptes(id) on delete cascade,
  empreinte_lien text not null unique,
  empreinte_sess text unique,
  demandee_le    timestamptz not null default now(),
  lien_expire_le timestamptz not null,
  ouverte_le     timestamptz,
  sess_expire_le timestamptz,
  derniere_vue   timestamptz,
  nb_appels      bigint not null default 0,
  ip_demande     text,
  revoquee_le    timestamptz
);

comment on table sessions_partenaires is
  'Les sessions de l''espace partenaire externe (`/partenaire`). Un partenaire saisit son adresse, '
  'reçoit un lien valable 24 h, et ce lien ouvre une session de 30 jours dans son navigateur. '
  'Distincte de `cles_api_partenaires` : une clé sert un programme et se révoque à la main, une '
  'session sert une personne et expire seule.';

comment on column sessions_partenaires.empreinte_lien is
  'SHA-256 du jeton envoyé par mail. LE JETON N''EST JAMAIS STOCKÉ : une base volée ne donne aucun '
  'lien utilisable.';
comment on column sessions_partenaires.empreinte_sess is
  'SHA-256 du jeton de session, posé dans le navigateur une fois le lien ouvert. Nul tant que le '
  'lien n''a pas servi.';
comment on column sessions_partenaires.lien_expire_le is
  'Vingt-quatre heures après la demande. Passé ce délai, le lien ne vaut plus rien — y compris s''il '
  'a été transféré ou s''il traîne dans une boîte.';
comment on column sessions_partenaires.sess_expire_le is
  'Trente jours après l''ouverture. C''est la session du navigateur, pas le lien.';
comment on column sessions_partenaires.ip_demande is
  'L''adresse qui a demandé le lien. Sert à repérer une série de demandes automatisées, jamais à '
  'restreindre : un partenaire change de réseau entre son bureau et son téléphone.';

create index if not exists idx_sessions_part_lien on sessions_partenaires (empreinte_lien)
  where revoquee_le is null;
create index if not exists idx_sessions_part_sess on sessions_partenaires (empreinte_sess)
  where revoquee_le is null;
create index if not exists idx_sessions_part_contact on sessions_partenaires (contact_id);

-- ══ PERSONNE NE LIT CETTE TABLE DEPUIS L'APPLICATION ═════════════════════════════════════════
--
-- Le point d'entrée porte la clé de service ; aucun utilisateur connecté n'a de raison d'y accéder,
-- et un partenaire n'a même pas de session Kimatch. Seul un administrateur voit, pour pouvoir
-- répondre à « depuis quand a-t-il accès ? ».
alter table sessions_partenaires enable row level security;

create policy sessions_part_lecture on sessions_partenaires
  for all to authenticated
  using (public.peut_administrer())
  with check (public.peut_administrer());

create policy sessions_part_restrictive on sessions_partenaires
  as restrictive for all to authenticated
  using (public.peut_administrer())
  with check (public.peut_administrer());

comment on policy sessions_part_restrictive on sessions_partenaires is
  'RESTRICTIVE en plus de la permissive : une permissive ajoutée plus tard — comme le '
  '`authenticated_all` présent sur 114 tables — se combinerait en OR et rouvrirait la table.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LA TABLE EXISTE, ET ELLE NE S'OUVRE À PERSONNE D'AUTRE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_tp      uuid;
  v_part    uuid;
  v_ct      uuid;
  v_profil  uuid;
  v_admin   uuid;
  v_n       integer;
begin
  select id into v_tp from types_comptes where code = 'PARTENAIRE';
  insert into comptes (nom, type_compte_id) values ('ZZZ GF SESS', v_tp) returning id into v_part;
  insert into contacts (nom, prenom, email, compte_id, actif)
  values ('GF', 'Z', 'zzz.gf.sess@kiwee-energie.invalid', v_part, true) returning id into v_ct;

  insert into sessions_partenaires (contact_id, compte_id, empreinte_lien, lien_expire_le)
  values (v_ct, v_part, encode(sha256('zzz-lien'::bytea), 'hex'), now() + interval '24 hours');

  -- ① UN UTILISATEUR ORDINAIRE NE VOIT RIEN.
  select p.id into v_profil
    from profils p
    join profils_roles_acces pra on pra.profil_id = p.id
    join roles_acces r on r.id = pra.role_acces_id
   where p.actif and not r.ouvre_administration limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from sessions_partenaires;
  reset role;
  perform set_config('request.jwt.claims', null, true);
  if v_n > 0 then
    raise exception 'Un utilisateur ordinaire voit % session(s) : les jetons lui sont ouverts.', v_n;
  end if;
  raise notice 'Garde-fou 1 : un utilisateur ordinaire ne voit aucune session.';

  -- ② UN ADMINISTRATEUR VOIT, sinon personne ne peut répondre « depuis quand ? ».
  select p.id into v_admin
    from profils p
    join profils_roles_acces pra on pra.profil_id = p.id
    join roles_acces r on r.id = pra.role_acces_id
   where p.actif and r.ouvre_administration and r.actif limit 1;

  if v_admin is null then
    raise exception 'Aucun administrateur actif : le garde-fou ne peut rien vérifier.';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from sessions_partenaires;
  reset role;
  perform set_config('request.jwt.claims', null, true);
  if v_n = 0 then
    raise exception 'Un administrateur ne voit aucune session.';
  end if;
  raise notice 'Garde-fou 2 : un administrateur voit les sessions (% ligne(s)).', v_n;

  raise exception 'GARDE-FOU OK';
exception
  when others then
    if sqlerrm <> 'GARDE-FOU OK' then
      raise;
    end if;
    raise notice 'Garde-fou : les sessions ne se lisent que depuis l''administration, rien n''est écrit.';
end $$;

commit;
