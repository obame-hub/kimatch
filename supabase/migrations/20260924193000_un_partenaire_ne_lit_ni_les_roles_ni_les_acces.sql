-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN PARTENAIRE NE LIT NI LES RÔLES NI LES ACCÈS AUTORISÉS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 24/09/2026 : « teste en boucle jusqu'à ce que tu ne trouves plus aucune faille ».
--
-- Troisième tour de boucle, avec un vrai compte de test. Deux fuites restaient :
--
--     GET /roles_acces        -> 206, 9 lignes
--     GET /profils_autorises  -> 206, 11 lignes
--
-- ══ CE QUE CELA LUI DONNAIT ══
--
-- `profils_autorises` porte les ADRESSES EMAIL de toute l'équipe KiWee, avec les prénoms et les
-- noms. C'est un annuaire interne complet, servi à un externe.
--
-- `roles_acces` est moins sensible mais dit la structure des droits : qui peut administrer, qui voit
-- tout le portefeuille. C'est la carte des serrures. On n'a aucune raison de la donner.
--
-- ══ POURQUOI ELLES ÉTAIENT OUVERTES ══
--
-- `roles_acces` a reçu des policies d'écriture le 24/09 (migration 20260924113000), et la lecture y
-- est restée volontairement ouverte : la page Rôles s'affiche pour toute l'équipe, et savoir qui
-- peut quoi n'est pas un privilège. Ce raisonnement valait pour l'équipe ; il ne vaut plus depuis
-- qu'un externe peut se connecter.
--
-- `profils_autorises`, elle, n'a jamais eu de policy restrictive : personne d'extérieur n'était
-- censé lire cette base.
--
-- ══ LA CORRECTION ══
--
-- Deux policies restrictives, sur le même moule que les autres : « tu passes si tu n'es PAS
-- partenaire ». L'équipe ne voit aucune différence — c'est le garde-fou qui le vérifie, pas moi.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop policy if exists roles_acces_pas_aux_partenaires on public.roles_acces;
create policy roles_acces_pas_aux_partenaires on public.roles_acces
  as restrictive
  for select to authenticated
  using (not public.est_partenaire());

drop policy if exists profils_autorises_pas_aux_partenaires on public.profils_autorises;
create policy profils_autorises_pas_aux_partenaires on public.profils_autorises
  as restrictive
  for all to authenticated
  using (not public.est_partenaire())
  with check (not public.est_partenaire());

comment on table public.profils_autorises is
  'Les adresses qui peuvent ouvrir un compte Kimatch. Fermée aux partenaires depuis le 24/09/2026 : '
  'elle porte les adresses, prénoms et noms de toute l''équipe — un annuaire interne qu''un externe '
  'lisait intégralement.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : FERMÉ AU PARTENAIRE, OUVERT À L'ÉQUIPE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le RISQUE, en fermant `profils_autorises`, est de casser l'écran « Accès autorisés » de
-- l'administration — celui par lequel on ouvre justement les accès partenaire. On éprouve donc les
-- deux sens, et le second est celui qui se verrait le lendemain matin.
--
do $$
declare
  v_partenaire uuid;
  v_profil     uuid;
  v_type_p     uuid;
  v_roles      integer;
  v_acces      integer;
  v_roles_eq   integer;
  v_acces_eq   integer;
begin
  select id into v_type_p from public.types_comptes where code = 'PARTENAIRE';
  /* UN PROFIL NON ADMINISTRATEUR : pour un ADMIN, tout ceci est légitime, et l'essai ne prouverait
     rien. C'est l'erreur qu'a faite mon garde-fou précédent. */
  select p.id into v_profil
    from public.profils p
    join public.profils_roles_acces pra on pra.profil_id = p.id
    join public.roles_acces r on r.id = pra.role_acces_id
   where p.actif and not r.ouvre_administration
   limit 1;
  if v_type_p is null or v_profil is null then
    raise notice 'Garde-fou ignoré : type PARTENAIRE ou profil non administrateur manquant.';
    return;
  end if;

  insert into public.comptes (nom, type_compte_id)
  values ('zzz garde-fou roles', v_type_p) returning id into v_partenaire;
  update public.profils set compte_partenaire_id = v_partenaire where id = v_profil;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_roles from public.roles_acces;
  select count(*) into v_acces from public.profils_autorises;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  if v_roles <> 0 then
    raise exception 'Un partenaire lit % rôle(s) : il connaît la structure des droits de KiWee.', v_roles;
  end if;
  if v_acces <> 0 then
    raise exception 'Un partenaire lit % accès autorisé(s) : il a l''annuaire des adresses de l''équipe.', v_acces;
  end if;

  -- L'ÉQUIPE CONTINUE DE LIRE : sans cela, l'administration ne peut plus ouvrir d'accès.
  update public.profils set compte_partenaire_id = null where id = v_profil;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_roles_eq from public.roles_acces;
  select count(*) into v_acces_eq from public.profils_autorises;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  if v_roles_eq = 0 or v_acces_eq = 0 then
    raise exception 'L''équipe ne lit plus les rôles (%) ou les accès (%) : l''administration est cassée.', v_roles_eq, v_acces_eq;
  end if;

  delete from public.comptes where id = v_partenaire;

  raise notice 'Garde-fou : le partenaire lit 0 rôle et 0 accès, l''équipe en lit % et %.', v_roles_eq, v_acces_eq;
end $$;

commit;
