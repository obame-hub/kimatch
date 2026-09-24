-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN PARTENAIRE NE PEUT PAS SE DÉTACHER LUI-MÊME
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 24/09/2026 : « crée-toi un compte et contact de test, essaie de te connecter et teste en
-- boucle jusqu'à ce que tu ne trouves plus aucune faille ».
--
-- C'est ce compte de test, un vrai, qui a révélé celle-ci. Les essais précédents empruntaient un
-- profil existant : ils ne pouvaient pas la voir.
--
-- ══ LA FAILLE, MESURÉE ══
--
-- `profils_self_update` autorise chacun à modifier SON profil : `using (auth.uid() = id)`. C'est
-- juste pour la photo, le prénom, l'adresse Allo.
--
-- MAIS `compte_partenaire_id` EST SUR CE PROFIL. Un partenaire pouvait donc écrire :
--
--     PATCH /profils?id=eq.<le sien>   { "compte_partenaire_id": null }
--
-- et `est_partenaire()` rendait alors faux. Toutes les policies de cloisonnement — celles qui
-- disent « tu passes si tu n'es PAS partenaire » — le laissaient passer. En une requête, depuis la
-- console de son navigateur, il ouvrait les 2 789 comptes, les 3 433 contacts, les 83 630
-- interactions et les 5 181 pistes de KiWee.
--
-- C'est très exactement ce que Michel redoutait : « faut juste qu'on soit sûr qu'il y ait pas
-- d'accident à ce qu'il ait accès à notre base de données, parce que là ça va être très vilain ».
--
-- ══ POURQUOI JE NE L'AVAIS PAS VUE ══
--
-- Le cloisonnement se lisait comme un tout cohérent : les tables métier étaient bornées, les vues
-- corrigées, les pistes et opportunités fermées. Mais la CLÉ du cloisonnement était, elle, dans une
-- table que l'utilisateur a le droit de modifier. Une serrure solide sur une porte dont l'occupant
-- tient la clé.
--
-- ══ LA CORRECTION ══
--
-- Une policy restrictive : personne ne peut changer son propre rattachement partenaire. Seul un
-- administrateur le peut — ou le déclencheur de première connexion, qui s'exécute en
-- `security definer` et n'est donc pas soumis aux policies.
--
-- ON NE RETIRE PAS `profils_self_update` : chacun doit continuer de régler sa photo et son nom.
-- On interdit UNE colonne, pas la table.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

/**
 * ══ UN DÉCLENCHEUR, ET NON UNE POLICY — ÉPROUVÉ LE 24/09/2026 ══
 *
 * Ma première version était une policy `with check` comparant la colonne à sa valeur actuelle, lue
 * par une fonction `security definer`. Le garde-fou l'a refusée, et il avait raison : cette fonction
 * lit la ligne DÉJÀ MODIFIÉE. La comparaison était donc toujours vraie, et le détachement passait.
 *
 * Une policy ne voit que la ligne d'après. Seul un déclencheur `before update` dispose de `OLD` —
 * c'est-à-dire de ce qu'on est en train de remplacer. C'est la seule façon de dire « cette colonne
 * ne bouge pas ».
 */
create or replace function public.protege_rattachement_partenaire()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.compte_partenaire_id is distinct from old.compte_partenaire_id
     and not public.peut_administrer()
     /* LE SERVICE ET LES MIGRATIONS PASSENT :  est nul quand on ecrit avec la cle de
        service. Ce n est pas quelqu un qui se detache, c est l administration qui pose un
        rattachement — sans quoi ouvrir un acces partenaire depuis le serveur serait impossible. */
     and auth.uid() is not null then
    raise exception 'Le rattachement à un partenaire ne se change que depuis l''administration.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

comment on function public.protege_rattachement_partenaire() is
  'Empêche quiconque de changer son propre compte_partenaire_id. Sans lui, un partenaire se '
  'détachait en une requête — profils_self_update autorise chacun à modifier son profil — et '
  'est_partenaire() rendait alors faux : tout le cloisonnement tombait d''un coup.';

drop trigger if exists trg_protege_rattachement_partenaire on public.profils;
create trigger trg_protege_rattachement_partenaire
  before update on public.profils
  for each row execute function public.protege_rattachement_partenaire();

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : IL NE PEUT PAS SE LIBÉRER, MAIS IL PEUT ENCORE SE RENOMMER
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le RISQUE est des deux côtés, et le second est le plus probable : en verrouillant `profils`, on
-- casserait la page « Mon profil » de toute l'équipe — photo, prénom, adresse Allo. On éprouve donc
-- que le détachement est refusé ET que le reste passe encore.
--
do $$
declare
  v_partenaire uuid;
  v_profil     uuid;
  v_type_p     uuid;
  v_apres      uuid;
  v_prenom     text;
  v_origine    text;
begin
  select id into v_type_p from public.types_comptes where code = 'PARTENAIRE';
  /* UN PROFIL NON ADMINISTRATEUR, et c est tout l objet du controle : mon premier garde-fou prenait
     le premier profil actif venu — un ADMIN — pour qui le detachement est LEGITIME. Il concluait
     donc a une faille sur un declencheur qui faisait son travail. */
  select p.id, p.prenom into v_profil, v_origine
    from public.profils p
    join public.profils_roles_acces pra on pra.profil_id = p.id
    join public.roles_acces r on r.id = pra.role_acces_id
   where p.actif and not r.ouvre_administration
   limit 1;
  if v_type_p is null or v_profil is null then
    raise notice 'Garde-fou ignoré : type PARTENAIRE ou profil actif manquant.';
    return;
  end if;

  insert into public.comptes (nom, type_compte_id)
  values ('zzz garde-fou detachement', v_type_p) returning id into v_partenaire;
  update public.profils set compte_partenaire_id = v_partenaire where id = v_profil;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ① LE CAS QUI DOIT ÉCHOUER : se détacher pour tout voir.
  begin
    update public.profils set compte_partenaire_id = null where id = v_profil;
  exception when others then
    null; -- un refus par exception convient aussi
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  select compte_partenaire_id into v_apres from public.profils where id = v_profil;

  if v_apres is distinct from v_partenaire then
    raise exception 'Un partenaire a pu se détacher lui-même : toute la base de KiWee lui serait ouverte.';
  end if;

  -- ② CE QUI DOIT CONTINUER DE MARCHER : régler son propre profil.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profils set prenom = 'zzz essai prenom' where id = v_profil;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  select prenom into v_prenom from public.profils where id = v_profil;
  if v_prenom is distinct from 'zzz essai prenom' then
    raise exception 'Plus personne ne peut modifier son propre profil : la page « Mon profil » est cassée pour toute l''équipe.';
  end if;

  -- On remet tout.
  update public.profils set prenom = v_origine, compte_partenaire_id = null where id = v_profil;
  delete from public.comptes where id = v_partenaire;

  raise notice 'Garde-fou : un partenaire ne peut pas se détacher, et chacun règle toujours son profil.';
end $$;

commit;
