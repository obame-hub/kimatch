-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES PARTENAIRES REÇOIVENT UNE CLÉ D'API
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 25/09/2026 : « si tu vois qu'il y a trop de failles […] on pourrait avoir l'option de
-- faire une interface externe où le partenaire pourra se connecter, récupérer nos données via clé
-- API, via endpoint, si trop de failles sont présentes dans notre code pour qu'il rentre à
-- l'intérieur. Je trouve que c'est même une très bonne solution. »
--
-- ══ POURQUOI ON BASCULE : CE QUI A ÉTÉ MESURÉ EN DEUX JOURS ══
--
-- Faire entrer un externe dans Kimatch, c'est lui donner une session valide dans une application
-- qui compte 188 tables, 25 vues, 69 points d'entrée et 26 fonctions `security definer`. Chacun de
-- ces objets doit refuser, individuellement, et pour toujours. Le relevé :
--
--     24/09  le seau `documents` servait 20 000 fichiers à Internet
--     24/09  107 tables ouvertes par défaut, 20 laissaient fuir
--     24/09  19 vues rendaient tout ce que leur propriétaire voyait
--     24/09  `fn_deplacer_site` laissait voler le site d'un client
--     25/09  6 points d'entrée appelaient un service externe sans vérifier le périmètre
--     25/09  le `state` OAuth Gmail permettait d'usurper la boîte d'un collègue
--     25/09  ma propre policy de la veille ouvrait les 20 000 fichiers à tout compte CONNECTÉ
--
-- Le dernier point est le plus parlant : une correction écrite et vérifiée la veille, par quelqu'un
-- qui cherchait précisément cette faille, laissait la porte ouverte d'un cran. Ce n'est pas un
-- défaut d'attention, c'est la surface qui est trop grande pour être tenue objet par objet.
--
-- ══ CE QUE CHANGE UNE PORTE UNIQUE ══
--
-- Le partenaire n'a plus de session Kimatch. Il a une clé, et un seul point d'entrée qui rend ce
-- qu'on a décidé de rendre. Le raisonnement s'inverse : au lieu de vérifier que 300 objets
-- refusent, on écrit ce qu'un seul accepte.
--
-- Ajouter demain une table, une vue ou un endpoint n'ouvre alors rien — c'est ce qui manquait à
-- toutes les corrections précédentes, qui étaient des états et non des invariants.
--
-- ══ LA CLÉ NE SE RELIT PAS ══
--
-- On stocke son empreinte SHA-256, jamais la clé. Une base volée ne donne aucune clé utilisable, et
-- personne chez KiWee ne peut relire celle d'un partenaire — s'il la perd, on en émet une autre.
-- C'est aussi ce qui permet de la montrer UNE FOIS à la création, et de l'assumer.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists cles_api_partenaires (
  id                uuid primary key default gen_random_uuid(),
  compte_id         uuid not null references comptes(id) on delete cascade,
  libelle           text not null,
  empreinte         text not null unique,
  prefixe           text not null,
  actif             boolean not null default true,
  creee_par_id      uuid references profils(id) on delete set null,
  date_creation     timestamptz not null default now(),
  derniere_utilisee timestamptz,
  nb_appels         bigint not null default 0,
  revoquee_le       timestamptz,
  revoquee_par_id   uuid references profils(id) on delete set null
);

comment on table cles_api_partenaires is
  'Les clés d''accès à l''API partenaire. Une clé vaut pour UN compte partenaire et ne donne accès '
  'qu''à ce que `api/partenaire/` expose, en lecture seule. Les partenaires n''ont pas de session '
  'Kimatch : c''est la porte unique décidée le 25/09/2026, après deux jours d''audit qui ont montré '
  'qu''une surface de 188 tables et 69 points d''entrée ne se tient pas objet par objet.';

comment on column cles_api_partenaires.compte_id is
  'Le compte partenaire que cette clé représente. Tout ce que l''API rend est borné à son '
  'périmètre : son compte, et les comptes dont il est l''apporteur (`apporteur_partenaire_id`).';
comment on column cles_api_partenaires.empreinte is
  'SHA-256 de la clé, en hexadécimal. LA CLÉ ELLE-MÊME N''EST JAMAIS STOCKÉE : une base volée ne '
  'donne aucune clé utilisable, et personne chez KiWee ne peut relire celle d''un partenaire.';
comment on column cles_api_partenaires.prefixe is
  'Les huit premiers caractères de la clé, en clair. Sert à la reconnaître dans une liste ou un '
  'journal (« kw_3f9a… ») sans rien révéler d''exploitable.';
comment on column cles_api_partenaires.libelle is
  'À quoi sert cette clé, dit par celui qui l''émet : « intégration CRM », « export mensuel ». Une '
  'clé sans nom ne se révoque jamais, faute de savoir ce qu''on casserait.';
comment on column cles_api_partenaires.derniere_utilisee is
  'Dernier appel reçu avec cette clé. Une clé inutilisée depuis des mois est une clé à révoquer.';
comment on column cles_api_partenaires.nb_appels is
  'Nombre d''appels servis. Donne la mesure d''un usage anormal sans avoir à journaliser chaque '
  'requête.';
comment on column cles_api_partenaires.revoquee_le is
  'Quand la clé a été retirée. On ne supprime pas la ligne : savoir qu''une clé a existé et quand '
  'elle a cessé de valoir fait partie de ce qu''on doit pouvoir répondre.';

create index if not exists idx_cles_api_empreinte on cles_api_partenaires (empreinte) where actif;
create index if not exists idx_cles_api_compte on cles_api_partenaires (compte_id);

-- ══ QUI PEUT VOIR ET GÉRER CES CLÉS ══════════════════════════════════════════════════════════
--
-- Personne, sauf un administrateur. Un partenaire n'a pas de session Kimatch — il n'a donc rien à
-- lire ici — et un commercial n'a pas à manipuler des clés d'accès.
alter table cles_api_partenaires enable row level security;

-- ══ UNE PERMISSIVE POUR OUVRIR, UNE RESTRICTIVE POUR FERMER ══
--
-- Le garde-fou de cette migration a attrapé mon erreur au premier essai : j'avais écrit la seule
-- RESTRICTIVE, et l'administrateur ne voyait rien non plus. Une policy restrictive ne DONNE jamais
-- l'accès, elle ne fait que retrancher ; sur une table neuve, sans permissive, tout est refusé.
--
-- Les deux ensemble disent la règle sans ambiguïté : la permissive accorde aux administrateurs, la
-- restrictive garantit que rien d'autre — pas même une permissive ajoutée plus tard, comme le
-- `authenticated_all` présent sur 114 tables — ne pourra rouvrir.
create policy cles_api_lecture on cles_api_partenaires
  for all to authenticated
  using (public.peut_administrer())
  with check (public.peut_administrer());

create policy cles_api_administration on cles_api_partenaires
  as restrictive for all to authenticated
  using (public.peut_administrer())
  with check (public.peut_administrer());

comment on policy cles_api_administration on cles_api_partenaires is
  'Seul un administrateur voit et gère les clés. RESTRICTIVE, en plus de la permissive '
  '`cles_api_lecture` : une permissive ajoutée plus tard — comme le `authenticated_all` présent sur '
  '114 tables — se combinerait en OR et rouvrirait la table. La restrictive, elle, se combine en '
  'AND et tient quoi qu''on ajoute.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LA TABLE EXISTE, ET ELLE NE S'OUVRE PAS AUX AUTRES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Une table de clés d'accès qui serait lisible par ceux qu'elle protège n'aurait aucun sens. On
-- éprouve les trois regards : un administrateur, un commercial, un partenaire.
do $$
declare
  v_tp      uuid;
  v_part    uuid;
  v_profil  uuid;
  v_commer  uuid;
  v_admin   uuid;
  v_n       integer;
begin
  select id into v_tp from types_comptes where code = 'PARTENAIRE';
  insert into comptes (nom, type_compte_id) values ('ZZZ GF CLES', v_tp) returning id into v_part;

  insert into cles_api_partenaires (compte_id, libelle, empreinte, prefixe)
  values (v_part, 'essai du garde-fou', encode(sha256('zzz-essai'::bytea), 'hex'), 'kw_zzzes');

  -- ① UN PARTENAIRE NE VOIT RIEN — pas même sa propre clé : il n'a pas de session Kimatch.
  select p.id into v_profil
    from profils p
    join profils_roles_acces pra on pra.profil_id = p.id
    join roles_acces r on r.id = pra.role_acces_id
   where p.actif and not r.ouvre_administration limit 1;
  update profils set compte_partenaire_id = v_part where id = v_profil;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from cles_api_partenaires;
  reset role;
  perform set_config('request.jwt.claims', null, true);
  if v_n > 0 then
    raise exception 'Un partenaire voit % clé(s) : la table des clés lui est ouverte.', v_n;
  end if;
  raise notice 'Garde-fou 1 : un partenaire ne voit aucune clé.';

  -- ② UN COMMERCIAL NON PLUS.
  select p.id into v_commer
    from profils p
    join profils_roles_acces pra on pra.profil_id = p.id
    join roles_acces r on r.id = pra.role_acces_id
   where p.actif and not r.ouvre_administration
     and p.compte_partenaire_id is null
     and p.email like '%@kiwee-energie.fr' limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_commer::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from cles_api_partenaires;
  reset role;
  perform set_config('request.jwt.claims', null, true);
  if v_n > 0 then
    raise exception 'Un commercial voit % clé(s) : les clés ne sont pas réservées à l''administration.', v_n;
  end if;
  raise notice 'Garde-fou 2 : un commercial ne voit aucune clé.';

  -- ③ UN ADMINISTRATEUR, LUI, DOIT VOIR — sinon personne ne peut en émettre.
  -- LE MÊME CRITÈRE QUE `peut_administrer()`, `r.actif` COMPRIS. Le choisir autrement ferait
  -- échouer le garde-fou sur un rôle désactivé, et l'on chercherait la faute dans la policy.
  select p.id into v_admin
    from profils p
    join profils_roles_acces pra on pra.profil_id = p.id
    join roles_acces r on r.id = pra.role_acces_id
   where p.actif and r.ouvre_administration and r.actif limit 1;

  if v_admin is null then
    raise exception 'Aucun administrateur actif : le garde-fou ne peut pas vérifier que les clés restent émettables.';
  end if;

  if v_admin is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from cles_api_partenaires;
    reset role;
    perform set_config('request.jwt.claims', null, true);
    if v_n = 0 then
      raise exception 'Un administrateur ne voit aucune clé : personne ne pourrait en émettre.';
    end if;
    raise notice 'Garde-fou 3 : un administrateur voit les clés (% ligne(s)).', v_n;
  end if;

  raise exception 'GARDE-FOU OK';
exception
  when others then
    if sqlerrm <> 'GARDE-FOU OK' then
      raise;
    end if;
    raise notice 'Garde-fou : les clés ne se lisent que depuis l''administration, rien n''est écrit.';
end $$;

commit;
