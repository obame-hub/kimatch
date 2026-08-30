begin;

-- N'IMPORTE QUELLE ADRESSE E-MAIL POUVAIT S'OUVRIR UN COMPTE.
--
-- Trois faits se combinaient :
--   1. Le projet Supabase accepte les inscriptions (disable_signup = false).
--   2. L'application demande un lien magique sans interdire la création d'un compte au passage :
--      signInWithOtp crée l'utilisateur par défaut si l'adresse est inconnue.
--   3. Le déclencheur handle_new_user donne alors À TOUT NOUVEAU COMPTE un profil actif et le rôle
--      CONSEILLER, sans jamais regarder la liste des accès autorisés.
-- Et comme les politiques RLS sont ouvertes à tout utilisateur authentifié, la personne voyait
-- ensuite les 1 600 contrats, les 66 646 échanges et l'ensemble des clients.
--
-- Autrement dit : connaître l'adresse de Kimatch suffisait pour entrer.
--
-- Cette barrière-ci est la seule des trois qui ne dépende ni d'un réglage de tableau de bord ni du
-- code de l'application : elle est dans la base, donc elle tient même si quelqu'un appelle
-- directement l'API d'authentification sans passer par nos écrans.
--
-- Elle ne concerne QUE la création d'un compte. Les dix personnes déjà inscrites se connectent par
-- une mise à jour de leur ligne, jamais par une insertion : leur accès n'est pas touché.
--
-- Pour ouvrir l'accès à quelqu'un : l'ajouter dans Administration → accès autorisés (c'est ce que
-- fait profils_autorises), puis lui demander sa première connexion. L'écran cesse d'être décoratif.

create or replace function auth.refuser_les_adresses_non_autorisees()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.profils_autorises a
    where lower(a.email) = lower(new.email)
  ) then
    raise exception 'Adresse non autorisée : %. Demander son ajout dans Administration → accès autorisés.', new.email
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refuser_les_adresses_non_autorisees on auth.users;

create trigger trg_refuser_les_adresses_non_autorisees
  before insert on auth.users
  for each row
  execute function auth.refuser_les_adresses_non_autorisees();

commit;
