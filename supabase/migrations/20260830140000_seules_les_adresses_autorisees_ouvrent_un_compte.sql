begin;

-- N'IMPORTE QUELLE ADRESSE E-MAIL POUVAIT S'OUVRIR UN COMPTE.
--
-- Trois faits se combinaient :
--   1. Le projet Supabase accepte les inscriptions (disable_signup = false).
--   2. L'application demandait un lien magique sans interdire la création d'un compte au passage
--      (corrigé le 30/08/2026 côté écran par shouldCreateUser: false).
--   3. handle_new_user donnait À TOUT NOUVEAU COMPTE un profil actif et le rôle CONSEILLER, sans
--      jamais regarder la liste des accès autorisés — elle ne s'en servait que pour PRÉ-REMPLIR le
--      prénom, le nom et le rôle quand la personne s'y trouvait.
-- Et comme les politiques RLS sont ouvertes à tout utilisateur authentifié, la personne voyait
-- ensuite les 1 600 contrats, les 66 646 échanges et l'ensemble des clients.
--
-- Autrement dit : connaître l'adresse de Kimatch suffisait pour entrer.
--
-- POURQUOI ICI ET PAS SUR auth.users.
--
-- La barrière naturelle serait un déclencheur BEFORE INSERT sur auth.users. Le rôle postgres de
-- Supabase n'a pas les droits sur le schéma auth (42501, permission denied) : cette voie est
-- fermée, et c'est très bien qu'elle le soit.
--
-- Mais le déclencheur on_auth_user_created, lui, appelle une fonction qui vit dans public et nous
-- appartient. Elle s'exécute APRÈS l'insertion, DANS LA MÊME TRANSACTION : une exception levée ici
-- annule l'insertion de l'utilisateur. Le résultat est identique, sans toucher au schéma auth.
--
-- Cette barrière est la seule des trois qui ne dépende ni d'un réglage de tableau de bord ni du
-- code de l'application : elle tient même si quelqu'un appelle directement l'API
-- d'authentification sans passer par nos écrans.
--
-- ELLE NE CONCERNE QUE LA CRÉATION D'UN COMPTE. Les dix personnes déjà inscrites se connectent par
-- une mise à jour de leur ligne, jamais par une insertion : leur accès n'est pas touché, et cette
-- fonction ne s'exécute même pas pour elles.
--
-- Pour ouvrir l'accès à quelqu'un : l'ajouter dans Administration → accès autorisés, puis lui
-- demander sa première connexion. L'écran cesse d'être décoratif.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autorise record;
  v_organisation_id uuid;
  v_role_acces_id uuid;
begin
  -- La comparaison est insensible à la casse : « M.Bruere@… » et « m.bruere@… » sont la même
  -- personne, et une majuscule de trop dans le champ d'invitation ne doit pas fermer la porte.
  select prenom, nom, role_acces_id, poste_id
    into v_autorise
    from public.profils_autorises
   where lower(email) = lower(new.email)
   limit 1;

  if not found then
    raise exception
      'Adresse non autorisée : %. Elle doit d''abord être ajoutée dans Administration → accès autorisés.',
      new.email
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.profils where id = new.id) then
    insert into public.profils (id, prenom, nom, email, actif)
    values (
      new.id,
      coalesce(v_autorise.prenom, new.raw_user_meta_data ->> 'prenom', ''),
      coalesce(v_autorise.nom, new.raw_user_meta_data ->> 'nom', ''),
      new.email,
      true
    );
  end if;

  select id into v_organisation_id from public.organisations where code = 'KIWEE_FR' limit 1;
  if v_organisation_id is not null and not exists (
    select 1 from public.profils_organisations
     where profil_id = new.id and organisation_id = v_organisation_id
  ) then
    insert into public.profils_organisations (profil_id, organisation_id, est_principale)
    values (new.id, v_organisation_id, true);
  end if;

  -- Une invitation sans rôle précisé donne CONSEILLER : c'est le rôle de base, celui qui voit et
  -- travaille ses dossiers sans rien administrer. Inchangé.
  v_role_acces_id := v_autorise.role_acces_id;
  if v_role_acces_id is null then
    select id into v_role_acces_id from public.roles_acces where code = 'CONSEILLER' limit 1;
  end if;
  if v_role_acces_id is not null and not exists (
    select 1 from public.profils_roles_acces
     where profil_id = new.id and role_acces_id = v_role_acces_id
  ) then
    insert into public.profils_roles_acces (profil_id, role_acces_id)
    values (new.id, v_role_acces_id);
  end if;

  if v_autorise.poste_id is not null and not exists (
    select 1 from public.profils_postes where profil_id = new.id and poste_id = v_autorise.poste_id
  ) then
    insert into public.profils_postes (profil_id, poste_id)
    values (new.id, v_autorise.poste_id);
  end if;

  return new;
end;
$$;

commit;
