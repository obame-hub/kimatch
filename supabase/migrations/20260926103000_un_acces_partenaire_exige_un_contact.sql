-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN ACCÈS PARTENAIRE EXIGE UN CONTACT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 26/09/2026 : « pour faire le test j'ai ajouté mon adresse perso à la liste autorisée
-- SANS COMPTE PARTENAIRE et j'ai essayé de m'envoyer un lien de connexion, ça ne fonctionne pas et
-- c'est normal mais vérifie que c'est bien grâce à notre sécurité ».
--
-- ══ CE N'ÉTAIT PAS NOTRE SÉCURITÉ ══
--
-- Mesuré en reproduisant le geste sur des adresses jetables :
--
--     POST /auth/v1/otp  ->  HTTP 422  « signup_disabled — Signups not allowed for this instance »
--
-- C'est un réglage de Supabase qui refuse TOUTE inscription par lien magique, quelle que soit
-- l'adresse. Rien à voir avec le cloisonnement : la porte était fermée pour tout le monde.
--
-- ══ ET DERRIÈRE CETTE PORTE, LE CLOISONNEMENT NE TENAIT PAS ══
--
-- Une adresse autorisée AVEC le rôle PARTENAIRE mais SANS contact a été créée, puis interrogée :
--
--     est_partenaire()  ->  false
--     comptes           ->  2 787
--     contacts          ->  3 434
--     documents         ->  19 703
--
-- Autrement dit : un accès « partenaire » ouvert de cette façon entre comme un COMMERCIAL, avec
-- toute la base. Si l'inscription avait été active, le test de Naoëlle aurait réussi — et lui
-- aurait montré l'intégralité du portefeuille de KiWee.
--
-- ══ POURQUOI LE RÔLE NE PROTÈGE RIEN ══
--
-- `est_partenaire()` ne regarde QUE `profils.compte_partenaire_id`. Le rôle `PARTENAIRE` de
-- `roles_acces` n'y entre pas, et c'est délibéré : le cloisonnement suit un RATTACHEMENT réel à un
-- compte, pas une étiquette. Un rôle se choisit dans une liste déroulante ; un rattachement se
-- déduit d'un contact qui existe, chez un compte qui existe.
--
-- Le rôle reste utile — il décide de ce que l'écran affiche — mais il ne décide de RIEN en matière
-- de données, et il ne faut pas croire l'inverse en le choisissant.
--
-- ══ LA PORTE QUI RESTAIT OUVERTE ══
--
-- `verifie_acces_partenaire` contrôle déjà beaucoup : que le contact existe, qu'il appartienne à un
-- compte de type PARTENAIRE, qu'il ait une adresse, qu'il soit actif. Mais sa toute première ligne
-- est :
--
--     if new.contact_id is null then return new; end if;
--
-- Sans contact, il ne vérifie rien. C'était voulu — l'immense majorité des accès sont ceux de
-- l'équipe KiWee, qui n'ont pas de contact — mais cela laisse passer le cas précis où quelqu'un
-- choisit le rôle PARTENAIRE sans désigner personne.
--
-- ON NE FERME PAS AUX ACCÈS ORDINAIRES : un accès sans rôle, ou avec le rôle CONSEILLER, ADMIN ou
-- tout autre, continue de se créer sans contact, exactement comme avant. Seule la combinaison
-- « rôle PARTENAIRE + aucun contact » est refusée, et elle l'est avec un message qui dit quoi faire.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.verifie_acces_partenaire()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_contact record;
  v_type    text;
  v_role    text;
begin
  /* ══ LE RÔLE PARTENAIRE SANS CONTACT EST REFUSÉ — 26/09/2026 ══
   *
   * Choisir « Partenaire » dans la liste déroulante donne le sentiment d'avoir cloisonné quelqu'un.
   * Il n'en est rien : `est_partenaire()` ne lit que `profils.compte_partenaire_id`, que seul un
   * contact renseigne. Un accès ouvert ainsi entre avec TOUTE la base (mesuré : 2 787 comptes,
   * 19 703 documents).
   *
   * Plutôt que de laisser croire, on refuse — en disant quoi faire. */
  if new.contact_id is null then
    select r.code into v_role
      from public.roles_acces r where r.id = new.role_acces_id;

    if v_role = 'PARTENAIRE' then
      raise exception
        'Un accès partenaire doit désigner un contact du compte partenaire. Sans lui, cet accès '
        'entrerait avec toute la base de KiWee : le rôle seul ne cloisonne rien. Utilisez le bloc '
        '« Ouvrir Kimatch à un contact de partenaire », en haut de la page.'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end if;

  select c.email, c.actif, c.compte_id, co.type_compte_id
    into v_contact
    from public.contacts c
    join public.comptes co on co.id = c.compte_id
   where c.id = new.contact_id;

  if not found then
    raise exception 'Ce contact n''existe pas.';
  end if;

  select t.code into v_type
    from public.types_comptes t where t.id = v_contact.type_compte_id;

  if v_type is distinct from 'PARTENAIRE' then
    raise exception 'Ce contact appartient à un compte de type %, pas à un partenaire. Un accès partenaire ne s''ouvre que sur un compte partenaire.', coalesce(v_type, 'inconnu');
  end if;

  if coalesce(btrim(v_contact.email), '') = '' then
    raise exception 'Ce contact n''a pas d''adresse email : renseignez-la sur sa fiche avant de lui ouvrir un accès.';
  end if;

  if not v_contact.actif then
    raise exception 'Ce contact est inactif : réactivez-le avant de lui ouvrir un accès.';
  end if;

  /* L'ADRESSE EST CELLE DU CONTACT, TOUJOURS. On ne la compare pas, on la RECOPIE : comparer
     laisserait la possibilité d'une divergence le jour où la fiche contact change d'adresse et pas
     l'autorisation. Ici, les deux ne peuvent pas diverger. */
  new.email := lower(btrim(v_contact.email));
  return new;
end $$;

comment on function public.verifie_acces_partenaire() is
  'Garde des accès autorisés. Un accès avec le rôle PARTENAIRE doit désigner un contact d''un '
  'compte partenaire, dont il recopie l''adresse — sans contact, `compte_partenaire_id` reste nul '
  'et l''accès entrerait avec toute la base (mesuré le 26/09/2026). Les accès ordinaires de '
  'l''équipe KiWee, eux, se créent sans contact comme avant.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : ON REFUSE LE CAS DANGEREUX, ET SEULEMENT LUI
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le risque est des deux côtés, et le second se verrait dès la prochaine embauche : un garde trop
-- large empêcherait d'ouvrir un accès à un commercial de KiWee.
do $$
declare
  v_rp      uuid;
  v_rc      uuid;
  v_tp      uuid;
  v_part    uuid;
  v_ct      uuid;
  v_ok      boolean := false;
begin
  select id into v_rp from roles_acces where code = 'PARTENAIRE';
  select id into v_rc from roles_acces where code = 'CONSEILLER';
  select id into v_tp from types_comptes where code = 'PARTENAIRE';

  -- ① LE CAS DANGEREUX EST REFUSÉ.
  begin
    insert into profils_autorises (email, prenom, nom, role_acces_id)
    values ('zzz.gf.sanscontact@kiwee-energie.invalid', 'Z', 'GF', v_rp);
    raise exception 'Un accès PARTENAIRE sans contact a été accepté : il entrerait avec toute la base.';
  exception
    when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Le refus attendu n''a pas eu lieu.';
  end if;
  raise notice 'Garde-fou 1 : un accès PARTENAIRE sans contact est refusé.';

  -- ② UN ACCÈS ORDINAIRE PASSE TOUJOURS. Sans cela, plus personne n'ouvre un accès à l'équipe.
  insert into profils_autorises (email, prenom, nom, role_acces_id)
  values ('zzz.gf.conseiller@kiwee-energie.invalid', 'Z', 'GF', v_rc);
  raise notice 'Garde-fou 2 : un accès CONSEILLER sans contact passe, comme avant.';

  -- ③ UN ACCÈS SANS RÔLE DU TOUT PASSE AUSSI.
  insert into profils_autorises (email, prenom, nom)
  values ('zzz.gf.sansrole@kiwee-energie.invalid', 'Z', 'GF');
  raise notice 'Garde-fou 3 : un accès sans rôle passe, comme avant.';

  -- ④ UN ACCÈS PARTENAIRE AVEC CONTACT PASSE, et recopie l'adresse du contact.
  insert into comptes (nom, type_compte_id) values ('ZZZ GF ACCES', v_tp) returning id into v_part;
  insert into contacts (nom, prenom, email, compte_id, actif)
  values ('GF', 'Z', 'zzz.gf.contact@kiwee-energie.invalid', v_part, true) returning id into v_ct;

  insert into profils_autorises (email, prenom, nom, contact_id, role_acces_id)
  values ('autre@exemple.invalid', 'Z', 'GF', v_ct, v_rp);

  if not exists (
    select 1 from profils_autorises
     where contact_id = v_ct and email = 'zzz.gf.contact@kiwee-energie.invalid'
  ) then
    raise exception 'L''adresse du contact n''a pas été recopiée.';
  end if;
  raise notice 'Garde-fou 4 : un accès partenaire AVEC contact passe, et prend l''adresse du contact.';

  raise exception 'GARDE-FOU OK';
exception
  when others then
    if sqlerrm <> 'GARDE-FOU OK' then
      raise;
    end if;
    raise notice 'Garde-fou : seul le cas dangereux est refusé, rien n''est écrit.';
end $$;

commit;
