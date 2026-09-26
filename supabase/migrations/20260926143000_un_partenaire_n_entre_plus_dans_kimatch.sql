-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN PARTENAIRE N'ENTRE PLUS DANS KIMATCH
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 26/09/2026 : « oui il faut fermer Kimatch à un partenaire s'il a son interface
-- externe ».
--
-- ══ POURQUOI DEUX PORTES VALAIENT MOINS QU'UNE ══
--
-- Depuis ce matin, un partenaire a `kimatch.fr/partenaire` : une page publique, une session née
-- d'un lien reçu par mail, et deux points d'entrée en lecture. La surface à tenir s'y compte en
-- ressources, pas en tables.
--
-- L'accès Kimatch, lui, donne une session dans une application de 188 tables, 25 vues, 69 points
-- d'entrée et 26 fonctions `security definer`. Chacun doit refuser, individuellement, et pour
-- toujours. Sept failles ont été mesurées en deux jours — dont une dans une correction écrite la
-- veille par quelqu'un qui cherchait précisément ce genre de faille.
--
-- Garder les deux, c'était tenir la grande surface POUR RIEN : tout ce que l'espace Kimatch
-- montrait à un partenaire, la page externe le montre mieux, et davantage (sept objets au lieu de
-- six onglets à moitié vides).
--
-- ══ CE QUE CETTE MIGRATION FERME, ET CE QU'ELLE NE FERME PAS ══
--
-- Elle empêche un profil d'être RATTACHÉ à un compte partenaire. Sans rattachement,
-- `est_partenaire()` rend faux, et il n'y a plus de « session partenaire » dans Kimatch du tout.
--
-- Elle ne touche ni aux policies, ni aux gardes, ni à `comptes_du_partenaire()` : tout cela reste
-- en place et continue de protéger. On ferme la porte, on ne démonte pas les serrures — le jour où
-- l'on voudrait rouvrir, il n'y aurait que cette migration à défaire.
--
-- ══ PERSONNE N'EST COUPÉ ══
--
-- Mesuré avant d'écrire : ZÉRO profil rattaché à un compte partenaire. Un seul accès autorisé
-- désigne un contact partenaire — celui de Naoëlle, pour ses essais — et aucun profil n'en est né.
-- La fermeture ne prive donc personne de rien.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.protege_rattachement_partenaire()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  /* ══ LE RATTACHEMENT NE S'OUVRE PLUS — 26/09/2026 ══
   *
   * Un partenaire passe par `kimatch.fr/partenaire`, pas par Kimatch. Rattacher un profil à un
   * compte partenaire lui ouvrirait une session dans l'application complète — exactement ce que la
   * page externe existe pour éviter.
   *
   * ON N'INTERDIT PAS DE DÉTACHER : le jour où il faut retirer un rattachement resté d'une
   * ancienne configuration, il faut pouvoir le faire. C'est l'OUVERTURE qui est fermée. */
  if new.compte_partenaire_id is not null
     and new.compte_partenaire_id is distinct from old.compte_partenaire_id then
    raise exception
      'Un partenaire n''accède plus à Kimatch : son espace est sur kimatch.fr/partenaire, où il '
      'demande son lien avec son adresse e-mail. Ouvrez-lui l''accès depuis Administration → '
      'Accès autorisés → « Ouvrir Kimatch à un contact de partenaire ».'
      using errcode = 'insufficient_privilege';
  end if;

  /* ══ ET IL NE SE DÉTACHE PAS LUI-MÊME ══
   *
   * La règle du 24/09, inchangée : un profil rattaché qui mettrait `compte_partenaire_id` à null
   * verrait toute la base. Le garde vaut toujours pour les rattachements existants — il n'y en a
   * aucun aujourd'hui, mais la règle ne dépend pas de cela. */
  if old.compte_partenaire_id is not null
     and new.compte_partenaire_id is null
     and auth.uid() = old.id then
    raise exception 'Le rattachement à un partenaire ne se change que depuis l''administration.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

comment on function public.protege_rattachement_partenaire() is
  'Refuse tout NOUVEAU rattachement d''un profil à un compte partenaire : depuis le 26/09/2026, un '
  'partenaire passe par `kimatch.fr/partenaire` et n''a plus de session Kimatch. Refuse aussi '
  'qu''un profil déjà rattaché se détache lui-même (règle du 24/09, inchangée).';

-- ══ LE RATTACHEMENT AUTOMATIQUE N'A PLUS LIEU D'ÊTRE ═════════════════════════════════════════
--
-- `rattache_partenaire_a_la_connexion` posait `compte_partenaire_id` à la naissance d'un profil,
-- quand l'adresse correspondait à un contact de partenaire. Laissé en l'état, il ferait maintenant
-- lever le garde ci-dessus — et la CRÉATION DU PROFIL échouerait, avec une erreur brute pour
-- quelqu'un qui ne comprendrait pas pourquoi.
--
-- On le vide de son geste plutôt que de le supprimer : la fonction reste, documentée, et le jour
-- où l'on voudrait rouvrir, c'est une ligne à remettre. Supprimer le déclencheur ferait disparaître
-- l'histoire avec lui.
create or replace function public.rattache_partenaire_a_la_connexion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  /* ══ PLUS AUCUN RATTACHEMENT AUTOMATIQUE — 26/09/2026 ══
   *
   * Cette fonction posait `compte_partenaire_id` quand l'adresse d'un nouveau profil correspondait
   * à un contact de partenaire. C'est ce qui ouvrait l'espace partenaire DANS Kimatch.
   *
   * Depuis que `kimatch.fr/partenaire` existe, ce chemin n'a plus de raison d'être — et le garde
   * de `protege_rattachement_partenaire` le refuserait de toute façon, en faisant échouer la
   * création du profil au passage.
   *
   * ON GARDE LA FONCTION ET SON DÉCLENCHEUR. Les supprimer effacerait la trace de ce qui existait ;
   * le jour où l'on voudrait rouvrir, c'est ce commentaire qu'on relirait. */
  return new;
end $$;

comment on function public.rattache_partenaire_a_la_connexion() is
  'Ne fait plus rien depuis le 26/09/2026 : un partenaire n''a plus de session Kimatch, son espace '
  'est sur `kimatch.fr/partenaire`. Conservée, vide, pour garder la trace du mécanisme — le corps '
  'd''origine posait `compte_partenaire_id` depuis `profils_autorises.contact_id`.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LA PORTE EST FERMÉE, ET RIEN D'AUTRE NE BOUGE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le risque est des deux côtés. Un garde trop large empêcherait une écriture ordinaire sur
-- `profils` — un changement de nom, une désactivation — et l'administration ne fonctionnerait plus.
do $$
declare
  v_tp     uuid;
  v_part   uuid;
  v_profil uuid;
  v_nom    text;
  v_ok     boolean := false;
begin
  select id into v_tp from types_comptes where code = 'PARTENAIRE';
  insert into comptes (nom, type_compte_id) values ('ZZZ GF FERME', v_tp) returning id into v_part;

  select p.id, p.nom into v_profil, v_nom
    from profils p
    join profils_roles_acces pra on pra.profil_id = p.id
    join roles_acces r on r.id = pra.role_acces_id
   where p.actif and not r.ouvre_administration and p.compte_partenaire_id is null limit 1;

  -- ① LE RATTACHEMENT EST REFUSÉ, même par la clé de service.
  begin
    update profils set compte_partenaire_id = v_part where id = v_profil;
    raise exception 'Un profil a été rattaché à un compte partenaire : la porte est restée ouverte.';
  exception
    when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Le refus attendu n''a pas eu lieu.';
  end if;
  raise notice 'Garde-fou 1 : un profil ne se rattache plus à un compte partenaire.';

  -- ② UNE ÉCRITURE ORDINAIRE SUR `profils` PASSE TOUJOURS.
  update profils set nom = nom where id = v_profil;
  raise notice 'Garde-fou 2 : les autres écritures sur profils passent, comme avant.';

  -- ③ LE CLOISONNEMENT RESTE EN PLACE. On ne démonte pas les serrures en fermant la porte.
  if to_regprocedure('public.est_partenaire()') is null
     or to_regprocedure('public.comptes_du_partenaire()') is null then
    raise exception 'Les fonctions de cloisonnement ont disparu : la fermeture ne doit rien démonter.';
  end if;
  raise notice 'Garde-fou 3 : est_partenaire() et comptes_du_partenaire() sont intactes.';

  -- ④ LE RATTACHEMENT AUTOMATIQUE NE POSE PLUS RIEN.
  --
  -- C'est le risque de cette migration : `rattache_partenaire_a_la_connexion` posait un
  -- rattachement à la naissance d'un profil, ce que le garde ① refuse désormais. Si la fonction
  -- n'avait pas été vidée, la CRÉATION DU PROFIL échouerait — et quelqu'un verrait une erreur
  -- brute en se connectant.
  --
  -- On ne peut pas créer un profil ici pour l'éprouver : `profils.id` référence `auth.users`, et
  -- fabriquer un utilisateur d'authentification depuis une migration serait pire que le mal. On
  -- vérifie donc que la fonction ne contient plus AUCUNE écriture — ce qui est la même garantie,
  -- lue à la source.
  if exists (
    select 1 from pg_proc
     where proname = 'rattache_partenaire_a_la_connexion'
       and prosrc ~* 'update|insert'
  ) then
    raise exception 'Le rattachement automatique écrit encore : la création d''un profil de contact partenaire échouerait.';
  end if;
  raise notice 'Garde-fou 4 : le rattachement automatique ne pose plus rien.';

  raise exception 'GARDE-FOU OK';
exception
  when others then
    if sqlerrm <> 'GARDE-FOU OK' then
      raise;
    end if;
    raise notice 'Garde-fou : la porte est fermée, le reste est intact, rien n''est écrit.';
end $$;

commit;
