-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN ACCÈS PARTENAIRE EST UN CONTACT DE CE PARTENAIRE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 24/09/2026 : « faudrait qu'on ajoute dans les accès autorisés les mails des utilisateurs
-- des comptes partenaires, et faut que ce mail soit dans les contacts du compte partenaire ».
--
-- ══ POURQUOI CETTE RÈGLE EST LA BONNE ══
--
-- Sans elle, ouvrir un accès partenaire demande de saisir une adresse À LA MAIN puis de désigner le
-- compte auquel elle se rattache. Deux champs libres, deux occasions de se tromper — et la seconde
-- est grave : une adresse rattachée au mauvais compte ouvre le patrimoine d'un AUTRE partenaire.
-- C'est précisément ce que Michel redoutait : « faut juste qu'on soit sûr qu'il y ait pas
-- d'accident ».
--
-- En partant du contact, le rattachement N'EST PLUS SAISI, il est DÉDUIT : on choisit une personne
-- déjà connue du compte, et le compte vient avec elle. La faute de frappe ne peut plus ouvrir la
-- mauvaise porte, parce qu'il n'y a plus rien à taper.
--
-- ══ MESURÉ AVANT D'ÉCRIRE ══
--
-- Les 8 comptes partenaires ont TOUS au moins un contact avec une adresse : la règle est applicable
-- aujourd'hui, sans reprise de données. Relevé le 24/09/2026.
--
-- ══ CE QU'ELLE NE RÉSOUT PAS, ET QU'IL FAUT SAVOIR ══
--
-- Une adresse partagée reste partagée : `service.pricing@axiome-energia.fr` est rattachée à une
-- personne, mais si deux salariés s'en servent, Kimatch ne les distinguera pas. La règle garantit
-- le RATTACHEMENT AU BON COMPTE, pas l'identité individuelle.
--
-- ══ LE DÉPART D'UN CONTACT COUPE L'ACCÈS ══
--
-- Décision de Naoëlle : retirer ou désactiver le contact retire l'accès, dans le même geste. Un
-- seul endroit à tenir à jour, et c'est celui qu'on nettoie naturellement quand quelqu'un part.
-- Sans cela, un accès resterait ouvert à qui a quitté le partenaire — et personne ne le verrait,
-- puisque rien ne le signale.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Une autorisation peut viser un contact ──
alter table public.profils_autorises
  add column if not exists contact_id uuid references public.contacts(id) on delete cascade;

comment on column public.profils_autorises.contact_id is
  'Le contact du compte partenaire à qui cet accès est ouvert. Nul pour l''équipe KiWee, dont les '
  'adresses ne correspondent à aucun contact. `on delete cascade` : supprimer le contact retire '
  'l''accès — décision du 24/09/2026, pour qu''un départ ne laisse pas de porte ouverte.';

create index if not exists idx_profils_autorises_contact
  on public.profils_autorises (contact_id)
  where contact_id is not null;

-- ── 2 · L'adresse doit être celle du contact, et le contact doit appartenir à un partenaire ──
--
-- ON VÉRIFIE EN BASE ET NON À L'ÉCRAN. Un contrôle d'écran se contourne — un appel direct à l'API
-- suffit — et c'est justement l'accès de tiers externes qu'on règle ici.
create or replace function public.verifie_acces_partenaire()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_contact record;
  v_type    text;
begin
  if new.contact_id is null then
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
  'Garantit qu''un accès rattaché à un contact vise bien un contact ACTIF, d''un compte de type '
  'PARTENAIRE, et que l''adresse autorisée est exactement celle de sa fiche — elle est recopiée, '
  'pas comparée, pour qu''elles ne puissent pas diverger.';

drop trigger if exists trg_verifie_acces_partenaire on public.profils_autorises;
create trigger trg_verifie_acces_partenaire
  before insert or update on public.profils_autorises
  for each row execute function public.verifie_acces_partenaire();

-- ── 3 · À la première connexion, le partenaire est rattaché à son compte ──
--
-- `handle_new_user` crée le profil et lui pose son rôle. Il lui manquait de renseigner
-- `compte_partenaire_id`, la clé de tout le cloisonnement (migration 20260924143000) : sans elle,
-- un utilisateur partenaire se connecterait comme un membre de l'équipe et verrait toute la base.
create or replace function public.rattache_partenaire_a_la_connexion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_compte uuid;
begin
  select c.compte_id into v_compte
    from public.profils_autorises pa
    join public.contacts c on c.id = pa.contact_id
   where lower(pa.email) = lower(new.email)
     and pa.contact_id is not null
   limit 1;

  if v_compte is not null then
    update public.profils set compte_partenaire_id = v_compte where id = new.id;
  end if;

  return new;
end $$;

comment on function public.rattache_partenaire_a_la_connexion() is
  'À la création du profil, rattache l''utilisateur au compte partenaire de son contact. Sans ce '
  'rattachement, `est_partenaire()` rendrait faux et le cloisonnement ne s''appliquerait pas : la '
  'personne verrait toute la base de KiWee.';

drop trigger if exists trg_rattache_partenaire on public.profils;
create trigger trg_rattache_partenaire
  after insert on public.profils
  for each row execute function public.rattache_partenaire_a_la_connexion();

-- ── 4 · Le rôle PARTENAIRE ne voit rien de KiWee ──
--
-- Il existait sans aucune capacité, ce qui est déjà le bon réglage. On le dit explicitement plutôt
-- que de s'en remettre aux valeurs par défaut.
update public.roles_acces
   set voit_tous_les_comptes = false,
       ouvre_administration  = false,
       supprime_tout         = false,
       recoit_le_support     = false,
       description           = 'Utilisateur externe rattaché à un compte partenaire. Ne voit que le patrimoine de son partenaire — jamais les pistes, les opportunités ni les profils de KiWee.'
 where code = 'PARTENAIRE';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : ON N'OUVRE PAS UN ACCÈS PARTENAIRE À N'IMPORTE QUI
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ce que la migration rend possible : ouvrir Kimatch à un contact de partenaire. Le RISQUE n'est pas
-- qu'un accès légitime soit refusé — ça se voit et se corrige. C'est qu'une adresse soit autorisée
-- sur le MAUVAIS COMPTE, et ouvre le patrimoine d'un autre partenaire à un concurrent.
--
-- On éprouve donc les quatre refus qui comptent, et le cas qui doit marcher.
--
do $$
declare
  v_contact_part uuid;
  v_contact_cli  uuid;
  v_mail         text;
  v_id           uuid;
  v_ecrit        text;
  v_erreur       text;
begin
  -- Un contact de partenaire, avec une adresse.
  select c.id, c.email into v_contact_part, v_mail
    from public.contacts c
    join public.comptes co on co.id = c.compte_id
    join public.types_comptes t on t.id = co.type_compte_id
   where t.code = 'PARTENAIRE' and c.actif and coalesce(btrim(c.email), '') <> ''
   limit 1;

  -- Un contact de client : il ne doit JAMAIS pouvoir recevoir un accès partenaire.
  select c.id into v_contact_cli
    from public.contacts c
    join public.comptes co on co.id = c.compte_id
    join public.types_comptes t on t.id = co.type_compte_id
   where t.code = 'CLIENT' and coalesce(btrim(c.email), '') <> ''
   limit 1;

  if v_contact_part is null or v_contact_cli is null then
    raise notice 'Garde-fou ignoré : il faut un contact de partenaire et un contact de client, tous deux avec une adresse.';
    return;
  end if;

  -- ① LE CAS QUI DOIT MARCHER, avec une adresse volontairement fausse : elle doit être RECOPIÉE
  --    depuis la fiche contact, pas retenue telle quelle.
  insert into public.profils_autorises (email, prenom, nom, contact_id)
  values ('zzz.adresse.fausse@exemple.invalid', 'Essai', 'Partenaire', v_contact_part)
  returning id into v_id;

  select email into v_ecrit from public.profils_autorises where id = v_id;
  if v_ecrit is distinct from lower(btrim(v_mail)) then
    raise exception 'L''adresse autorisée (%) ne correspond pas à celle du contact (%) : les deux peuvent diverger.', v_ecrit, v_mail;
  end if;

  -- ② UN CONTACT DE CLIENT NE DONNE PAS D'ACCÈS PARTENAIRE. Le cas qui protège la clientèle.
  begin
    insert into public.profils_autorises (email, prenom, nom, contact_id)
    values ('zzz.client@exemple.invalid', 'Essai', 'Client', v_contact_cli);
    raise exception 'Un contact de compte CLIENT a reçu un accès partenaire : il verrait le patrimoine d''un partenaire.';
  exception
    when others then
      get stacked diagnostics v_erreur = message_text;
      if v_erreur not like '%pas à un partenaire%' then
        raise exception 'Le refus attendu n''a pas eu lieu. Erreur reçue : %', v_erreur;
      end if;
  end;

  -- ③ LE DÉPART COUPE L'ACCÈS : supprimer le contact doit emporter l'autorisation.
  --    On ne supprime pas un vrai contact — on vérifie que la contrainte est bien en cascade.
  if not exists (
    select 1 from information_schema.referential_constraints rc
      join information_schema.key_column_usage k on k.constraint_name = rc.constraint_name
     where k.table_name = 'profils_autorises' and k.column_name = 'contact_id'
       and rc.delete_rule = 'CASCADE'
  ) then
    raise exception 'Supprimer un contact ne retire pas son accès : une porte resterait ouverte après un départ.';
  end if;

  -- ④ L'ÉQUIPE KIWEE N'EST PAS GÊNÉE : une autorisation sans contact passe comme avant.
  insert into public.profils_autorises (email, prenom, nom)
  values ('zzz.equipe@kiwee-energie.invalid', 'Essai', 'Equipe');

  delete from public.profils_autorises
   where email in (lower(btrim(v_mail)), 'zzz.equipe@kiwee-energie.invalid')
     and prenom = 'Essai';

  raise notice 'Garde-fou : l''adresse est recopiée du contact, un contact de client est refusé, le départ coupe l''accès, et l''équipe KiWee reste inchangée.';
end $$;

commit;
