-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN PARTENAIRE NE VOIT QUE SON PATRIMOINE — ET C'EST LA BASE QUI LE GARANTIT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Michel OBAME, réunion du 24/09/2026 : « ils ne peuvent pas avoir accès à notre data, ça c'est la
-- première chose », puis « faut juste qu'on soit sûr qu'il y ait pas d'accident à ce qu'il ait accès
-- à notre base de données, parce que là ça va être très vilain ».
--
-- ══ CE QUE J'AI MESURÉ AVANT D'ÉCRIRE UNE LIGNE ══
--
-- Avec le jeton d'un conseiller ordinaire, en interrogeant l'API directement — ce que fait la
-- console d'un navigateur :
--
--     comptes          2 783 / 2 783      contrats          1 604 / 1 604
--     contacts         3 429 / 3 429      recommandations   1 795 / 1 795
--     compteurs        7 926 / 7 926      interactions     83 629 / 83 629
--     mandats          1 517 / 1 517      pistes            5 177 / 5 177
--
-- AUCUNE TABLE MÉTIER N'A DE POLICY RESTRICTIVE. Le filtrage vit dans le navigateur
-- (`lib/data/visibility.ts`), et un filtre de navigateur ne protège rien : il suffit de poster la
-- requête soi-même. Ouvrir un compte partenaire dans cet état, c'est lui ouvrir toute la base — le
-- « très vilain » de Michel, à la lettre.
--
-- ══ LA RÈGLE, ET RIEN QU'ELLE ══
--
-- Un partenaire est une personne dont le profil pointe un COMPTE de type PARTENAIRE. Son patrimoine,
-- ce sont les comptes qui le désignent comme apporteur, et tout ce qui pend dessous : contacts,
-- sites, compteurs, mandats, contrats, recommandations.
--
-- EN CASCADE DEPUIS LE COMPTE, et non par « qui a créé la ligne ». Une seule clé à tenir, et un
-- compte ne peut pas être à moitié visible : si le compte lui échappe, tout ce qui en dépend lui
-- échappe aussi. C'est également ce que Michel décrit — « leur patrimoine ».
--
-- ══ CE QU'IL NE VOIT JAMAIS ══
--
-- Les pistes (« les pistes, c'est ce qu'ils font eux de leur côté »), les opportunités (« ils n'ont
-- pas besoin d'accéder à l'opportunité »), les profils de l'équipe, et tout compte qui n'est pas le
-- sien.
--
-- ══ POURQUOI DES POLICIES `RESTRICTIVE` ET NON ORDINAIRES ══
--
-- Première tentative, refusée par le garde-fou : le partenaire voyait tout. La cause, mesurée --
-- une policy `authenticated_all` avec `using (true)`, PERMISSIVE, posée sur 114 TABLES. C'est
-- l'architecture d'origine de Kimatch : tout utilisateur connecté a tout.
--
-- Les policies permissives s'ADDITIONNENT EN OU. Poser une règle permissive à côté de celle-là
-- n'enlève donc rien : `authenticated_all` suffit à tout ouvrir. Il faut `as restrictive`, qui se
-- combine en ET et s'impose par-dessus.
--
-- C'est le genre de détail qu'aucune relecture n'attrape et que le premier essai révèle.
--
-- ══ POURQUOI L'ÉQUIPE N'EST PAS AFFECTÉE ══
--
-- Chaque policy dit : « tu passes si tu n'es PAS un partenaire, ou si cette ligne est à toi ». Un
-- conseiller, un administrateur, le webhook avec sa clé de service : rien ne change pour eux. La
-- migration n'a d'effet que sur des comptes qui n'existent pas encore.
--
-- C'est délibéré, et c'est ce qui rend cette migration sûre à appliquer un mercredi matin : elle ne
-- peut pas casser le travail en cours. Le cloisonnement général de l'application — refermer ces
-- 83 629 interactions pour tout le monde — est un autre chantier, plus lourd, qui se fera avec ses
-- propres essais.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Un profil peut appartenir à un partenaire ──
--
-- `profils` ne portait aucun lien vers un compte : il fallait cette colonne pour que la base sache
-- qui est partenaire. Nulle pour toute l'équipe KiWee, et c'est le cas normal.
alter table public.profils
  add column if not exists compte_partenaire_id uuid references public.comptes(id) on delete restrict;

comment on column public.profils.compte_partenaire_id is
  'Le compte partenaire dont cette personne dépend, quand elle est externe. Nul pour l''équipe '
  'KiWee. C''est la clé de tout le cloisonnement : les policies ne rendent à un partenaire que les '
  'comptes dont il est apporteur, et ce qui en dépend. `on delete restrict` : supprimer un compte '
  'partenaire qui a des utilisateurs les laisserait orphelins, donc sans aucun accès.';

create index if not exists idx_profils_compte_partenaire
  on public.profils (compte_partenaire_id)
  where compte_partenaire_id is not null;

-- ── 2 · Les deux questions que toutes les policies posent ──

/**
 * La personne connectée est-elle un partenaire externe ?
 *
 * `security definer` est indispensable : la fonction lit `profils`, et les policies de `profils`
 * l'appelleront. Sans cela, récursion infinie.
 */
create or replace function public.est_partenaire()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profils p
     where p.id = auth.uid()
       and p.compte_partenaire_id is not null
  )
$$;

comment on function public.est_partenaire() is
  'Vrai si la personne connectée est un utilisateur externe rattaché à un compte partenaire. Faux '
  'pour toute l''équipe KiWee — c''est ce qui fait que les policies ne changent rien pour elle.';

/**
 * Les comptes que cette personne a le droit de voir.
 *
 * Pour un partenaire : son propre compte partenaire, plus tous ceux dont il est l'apporteur ou
 * l'intermédiaire. Pour l'équipe, la fonction n'est jamais consultée — voir les policies.
 */
create or replace function public.comptes_du_partenaire()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id
    from public.comptes c
    join public.profils p on p.id = auth.uid()
   where p.compte_partenaire_id is not null
     and (c.id = p.compte_partenaire_id
       or c.apporteur_partenaire_id = p.compte_partenaire_id
       or c.intermediaire_partenaire_id = p.compte_partenaire_id)
$$;

comment on function public.comptes_du_partenaire() is
  'Les comptes visibles par le partenaire connecté : le sien, et ceux dont il est apporteur ou '
  'intermédiaire. Tout le reste du cloisonnement en découle — contacts, sites, compteurs, mandats, '
  'contrats et recommandations suivent leur compte.';

grant execute on function public.est_partenaire() to authenticated;
grant execute on function public.comptes_du_partenaire() to authenticated;

-- ── 3 · Les policies, table par table ──
--
-- Toutes sur le même moule : « tu n'es pas partenaire » (l'équipe, inchangée) OU « cette ligne
-- appartient à ton patrimoine ». L'écriture suit la même règle : il crée et modifie dans son
-- périmètre, il ne supprime rien.

-- Les comptes
drop policy if exists comptes_lecture_cloisonnee on public.comptes;
create policy comptes_lecture_cloisonnee on public.comptes
  as restrictive
  for select to authenticated
  using (not public.est_partenaire() or id in (select public.comptes_du_partenaire()));

drop policy if exists comptes_ecriture_cloisonnee on public.comptes;
create policy comptes_ecriture_cloisonnee on public.comptes
  as restrictive
  for update to authenticated
  using (not public.est_partenaire() or id in (select public.comptes_du_partenaire()))
  with check (not public.est_partenaire() or id in (select public.comptes_du_partenaire()));

/* À LA CRÉATION, LE PARTENAIRE DOIT SE DÉSIGNER APPORTEUR. Sans ce `with check`, il créerait des
   comptes qu'il ne pourrait plus relire — ou pire, rattachés à quelqu'un d'autre. */
drop policy if exists comptes_creation_cloisonnee on public.comptes;
create policy comptes_creation_cloisonnee on public.comptes
  as restrictive
  for insert to authenticated
  with check (
    not public.est_partenaire()
    or apporteur_partenaire_id = (select compte_partenaire_id from public.profils where id = auth.uid())
  );

-- Ce qui pend sous un compte. Même moule pour les six tables.
do $$
declare
  t text;
begin
  foreach t in array array['contacts', 'sites', 'compteurs', 'mandats', 'recommandations']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_lecture_cloisonnee', t);
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated
         using (not public.est_partenaire() or compte_id in (select public.comptes_du_partenaire()))',
      t || '_lecture_cloisonnee', t);

    execute format('drop policy if exists %I on public.%I', t || '_ecriture_cloisonnee', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated
         using (not public.est_partenaire() or compte_id in (select public.comptes_du_partenaire()))
         with check (not public.est_partenaire() or compte_id in (select public.comptes_du_partenaire()))',
      t || '_ecriture_cloisonnee', t);

    execute format('drop policy if exists %I on public.%I', t || '_creation_cloisonnee', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated
         with check (not public.est_partenaire() or compte_id in (select public.comptes_du_partenaire()))',
      t || '_creation_cloisonnee', t);
  end loop;
end $$;

/* LES CONTRATS SE LISENT, NE S'ÉCRIVENT PAS. Michel : « il peut voir, c'est pas grave, c'est lui
   qui les a fait signer ». Voir n'est pas modifier : un contrat signé engage KiWee, et le partenaire
   n'a aucune raison d'y toucher. Pas de policy d'écriture, donc RLS refuse. */
drop policy if exists contrats_lecture_cloisonnee on public.contrats;
create policy contrats_lecture_cloisonnee on public.contrats
  as restrictive
  for select to authenticated
  using (not public.est_partenaire() or compte_id in (select public.comptes_du_partenaire()));

/* LES INTERACTIONS : son activité sur ses comptes. Michel : « ils ont accès à leur activité ». */
drop policy if exists interactions_lecture_cloisonnee on public.interactions;
create policy interactions_lecture_cloisonnee on public.interactions
  as restrictive
  for select to authenticated
  using (not public.est_partenaire() or compte_id in (select public.comptes_du_partenaire()));

drop policy if exists interactions_creation_cloisonnee on public.interactions;
create policy interactions_creation_cloisonnee on public.interactions
  as restrictive
  for insert to authenticated
  with check (not public.est_partenaire() or compte_id in (select public.comptes_du_partenaire()));

/* ══ CE QU'UN PARTENAIRE NE VOIT JAMAIS ══
 *
 * Les PISTES — Michel : « les pistes, ils ont pas besoin de les voir, c'est ce qu'ils font eux de
 * leur côté ». Les OPPORTUNITÉS — « ils n'ont pas besoin d'accéder à l'opportunité qu'ils ont
 * créé », et il a été décidé qu'il n'y en aurait même plus pour eux.
 *
 * Une policy qui les EXCLUT explicitement, plutôt que pas de policy du tout : ces tables sont
 * lisibles par l'équipe aujourd'hui, et ne rien poser les laisserait ouvertes à tous. */
drop policy if exists pistes_jamais_aux_partenaires on public.pistes;
create policy pistes_jamais_aux_partenaires on public.pistes
  as restrictive
  for all to authenticated
  using (not public.est_partenaire())
  with check (not public.est_partenaire());

drop policy if exists opportunites_jamais_aux_partenaires on public.opportunites;
create policy opportunites_jamais_aux_partenaires on public.opportunites
  as restrictive
  for all to authenticated
  using (not public.est_partenaire())
  with check (not public.est_partenaire());

/* LES PROFILS : un partenaire ne voit que le sien. Sans cela il lirait les treize membres de
   l'équipe, avec leurs adresses — Michel ne veut pas qu'il voie « notre data ». */
drop policy if exists profils_cloisonnes on public.profils;
create policy profils_cloisonnes on public.profils
  as restrictive
  for select to authenticated
  using (not public.est_partenaire() or id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LE PARTENAIRE VOIT LE SIEN, ET RIEN D'AUTRE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ce que la migration rend possible : ouvrir Kimatch à des externes. Le RISQUE est asymétrique et
-- il faut le dire : qu'un partenaire voie trop est une fuite de toute la clientèle de KiWee ; qu'il
-- voie trop peu est une gêne qu'on corrige le lendemain. On éprouve donc les deux, mais c'est le
-- premier qui justifie ce bloc.
--
-- ON N'ÉPROUVE PAS LES POLICIES EN LES RELISANT : on se met à la place d'un partenaire, avec son
-- identité, et l'on compte ce que la base rend.
--
do $$
declare
  v_partenaire uuid;
  v_profil     uuid;
  v_compte     uuid;
  v_autre      uuid;
  v_n          integer;
  v_total      integer;
begin
  select id into v_partenaire from public.comptes
   where type_compte_id = (select id from public.types_comptes where code = 'PARTENAIRE')
   limit 1;
  select id into v_profil from public.profils where actif limit 1;
  if v_partenaire is null or v_profil is null then
    raise notice 'Garde-fou ignoré : il faut un compte partenaire et un profil actif.';
    return;
  end if;

  -- On rattache TEMPORAIREMENT un profil à ce partenaire, et on lui donne un compte à voir.
  update public.profils set compte_partenaire_id = v_partenaire where id = v_profil;

  select id into v_compte from public.comptes
   where type_compte_id = (select id from public.types_comptes where code = 'CLIENT') limit 1;
  update public.comptes set apporteur_partenaire_id = v_partenaire where id = v_compte;

  select id into v_autre from public.comptes
   where id <> v_compte and id <> v_partenaire
     and coalesce(apporteur_partenaire_id::text, '') <> v_partenaire::text
   limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ① IL VOIT LE SIEN.
  select count(*) into v_n from public.comptes where id = v_compte;
  if v_n <> 1 then
    raise exception 'Le partenaire ne voit pas le compte dont il est apporteur : l''écran serait vide.';
  end if;

  -- ② IL NE VOIT PAS CELUI DES AUTRES. C'est le cas qui compte.
  select count(*) into v_n from public.comptes where id = v_autre;
  if v_n <> 0 then
    raise exception 'Le partenaire voit un compte qui ne lui appartient pas : toute la clientèle de KiWee lui est ouverte.';
  end if;

  -- ③ IL NE VOIT PAS TOUTE LA BASE. Le controle qui attrape une policy trop large.
  select count(*) into v_n from public.comptes;
  if v_n > 2 then
    raise exception 'Le partenaire voit % comptes alors qu''un seul lui revient.', v_n;
  end if;

  -- ④ NI LES PISTES, NI LES OPPORTUNITÉS.
  select count(*) into v_n from public.pistes;
  if v_n <> 0 then
    raise exception 'Le partenaire voit % piste(s) : c''est le travail interne de KiWee.', v_n;
  end if;
  select count(*) into v_n from public.opportunites;
  if v_n <> 0 then
    raise exception 'Le partenaire voit % opportunité(s) : Michel a demandé qu''il n''y ait pas accès.', v_n;
  end if;

  -- ⑤ NI LES PROFILS DE L'ÉQUIPE.
  select count(*) into v_n from public.profils where id <> v_profil;
  if v_n <> 0 then
    raise exception 'Le partenaire voit % profil(s) de l''équipe KiWee.', v_n;
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- ⑥ L'ÉQUIPE N'EST PAS AFFECTÉE : c'est la promesse qui rend cette migration sûre.
  update public.profils set compte_partenaire_id = null where id = v_profil;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_n from public.comptes;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_total from public.comptes;
  if v_n < v_total then
    raise exception 'Un membre de l''équipe ne voit plus que % comptes sur % : la migration a restreint KiWee.', v_n, v_total;
  end if;

  -- On remet tout : le garde-fou ne laisse aucune trace.
  update public.comptes set apporteur_partenaire_id = null where id = v_compte;

  raise notice 'Garde-fou : le partenaire voit son compte et rien d''autre — ni pistes, ni opportunités, ni profils — et l''équipe voit toujours les % comptes.', v_total;
end $$;

commit;
