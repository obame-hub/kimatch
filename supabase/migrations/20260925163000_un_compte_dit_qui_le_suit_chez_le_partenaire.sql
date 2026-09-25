-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN COMPTE DIT QUI LE SUIT, CHEZ LE PARTENAIRE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 25/09/2026 : « il faudrait ajouter au moment de la création de compte, dans tous les
-- formulaires de création de compte, une option qui spécifie si ce compte doit être créé pour un
-- partenaire ou géré par un partenaire. Si c'est le cas, il faudra choisir un compte type
-- partenaire et choisir un contact du compte partenaire. »
--
-- ══ LE PARTENAIRE SE DÉSIGNAIT DÉJÀ, LA PERSONNE NON ══
--
-- `apporteur_partenaire_id` existe depuis des mois et porte le COMPTE partenaire. Il ne dit pas
-- QUI, chez eux, suit l'affaire — or c'est la personne qu'on rappelle, pas la société.
--
-- ══ POURQUOI UNE COLONNE SUR `comptes`, ET NON UNE TABLE DE LIAISON ══
--
-- Un compte a UN partenaire d'origine, et chez ce partenaire UNE personne qui le suit. Une table
-- de liaison permettrait d'en mettre plusieurs — et la question « lequel rappelle-t-on ? »
-- reviendrait sans réponse. Le jour où un compte aura deux référents chez le partenaire, la table
-- se créera avec un cas d'usage pour la dessiner correctement.
--
-- ══ CE QUE LA CONTRAINTE INTERDIT, ET POURQUOI ══
--
-- Le contact doit appartenir au compte partenaire désigné. Sans ce garde, on enregistrerait le
-- contact d'un client comme référent chez l'apporteur : l'écran le proposerait à rappeler, et
-- personne ne saurait d'où vient l'erreur. `fk` ne suffit pas — elle garantit que le contact
-- existe, pas qu'il soit du bon côté.
--
-- Il n'est pas possible de l'écrire en `check` : la règle porte sur une AUTRE table
-- (`contacts.compte_id`). C'est donc un déclencheur, qui refuse en disant pourquoi.
--
-- ══ CE QUE ÇA NE CHANGE PAS ══
--
-- La visibilité du partenaire tient à `apporteur_partenaire_id`, que `comptes_du_partenaire()`
-- reconnaît déjà. Cette colonne-ci est une information de suivi, pas un droit d'accès : la
-- renseigner n'ouvre rien de plus, l'oublier ne ferme rien.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table comptes
  add column if not exists contact_partenaire_id uuid references contacts(id) on delete set null;

comment on column comptes.contact_partenaire_id is
  'La personne qui suit ce compte CHEZ LE PARTENAIRE apporteur : celle qu''on rappelle de leur '
  'côté. Elle doit appartenir au compte désigné par `apporteur_partenaire_id` — un déclencheur le '
  'vérifie. Information de suivi, sans effet sur les droits : la visibilité du partenaire tient à '
  '`apporteur_partenaire_id` seul.';

-- ══ LE CONTACT VIENT DE CHEZ LE PARTENAIRE, PAS D'AILLEURS ══════════════════════════════════

create or replace function public.fn_contact_partenaire_coherent()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_compte_du_contact uuid;
begin
  if new.contact_partenaire_id is null then
    return new;
  end if;

  if new.apporteur_partenaire_id is null then
    raise exception 'Un référent chez le partenaire suppose un partenaire : renseignez d''abord l''apporteur.'
      using errcode = 'check_violation';
  end if;

  select compte_id into v_compte_du_contact
    from contacts where id = new.contact_partenaire_id;

  if v_compte_du_contact is distinct from new.apporteur_partenaire_id then
    raise exception 'Ce contact n''appartient pas au partenaire désigné : choisissez quelqu''un de chez eux.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

comment on function public.fn_contact_partenaire_coherent() is
  'Refuse un `contact_partenaire_id` qui ne serait pas un contact du compte `apporteur_partenaire_id`. '
  'Sans lui, le contact d''un client pouvait être enregistré comme référent chez l''apporteur.';

drop trigger if exists trg_contact_partenaire_coherent on comptes;
create trigger trg_contact_partenaire_coherent
  before insert or update of contact_partenaire_id, apporteur_partenaire_id on comptes
  for each row execute function public.fn_contact_partenaire_coherent();

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LE BON CONTACT PASSE, LE MAUVAIS EST REFUSÉ
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le risque est des deux côtés. Un déclencheur trop strict refuserait une saisie légitime et le
-- commercial croirait l'écran cassé ; trop lâche, il laisserait entrer n'importe quel contact.
-- On éprouve les deux, sur des données fabriquées puis annulées.
do $$
declare
  v_tp        uuid;
  v_tc        uuid;
  v_part      uuid;
  v_client    uuid;
  v_ct_part   uuid;
  v_ct_client uuid;
  v_ok        boolean := false;
begin
  select id into v_tp from types_comptes where code = 'PARTENAIRE';
  select id into v_tc from types_comptes where code = 'CLIENT';

  insert into comptes (nom, type_compte_id) values ('ZZZ GF PARTENAIRE', v_tp) returning id into v_part;
  insert into comptes (nom, type_compte_id) values ('ZZZ GF CLIENT', v_tc) returning id into v_client;
  insert into contacts (nom, prenom, compte_id, actif) values ('GF', 'Chez le partenaire', v_part, true)
    returning id into v_ct_part;
  insert into contacts (nom, prenom, compte_id, actif) values ('GF', 'Chez le client', v_client, true)
    returning id into v_ct_client;

  -- ① LE BON CONTACT PASSE. Sans cela, la saisie légitime serait refusée.
  update comptes
     set apporteur_partenaire_id = v_part, contact_partenaire_id = v_ct_part
   where id = v_client;
  raise notice 'Garde-fou 1 : un contact de chez le partenaire est accepté.';

  -- ② LE CONTACT D'AILLEURS EST REFUSÉ.
  begin
    update comptes set contact_partenaire_id = v_ct_client where id = v_client;
    raise exception 'Le contact d''un client a été accepté comme référent chez le partenaire : le garde ne joue pas.';
  exception
    when check_violation then
      v_ok := true;
  end;
  if not v_ok then
    raise exception 'Le refus attendu n''a pas eu lieu.';
  end if;
  raise notice 'Garde-fou 2 : un contact venu d''ailleurs est refusé.';

  -- ③ SANS PARTENAIRE, PAS DE RÉFÉRENT.
  v_ok := false;
  begin
    update comptes
       set apporteur_partenaire_id = null, contact_partenaire_id = v_ct_part
     where id = v_client;
    raise exception 'Un référent a été accepté sans partenaire désigné.';
  exception
    when check_violation then
      v_ok := true;
  end;
  if not v_ok then
    raise exception 'Le refus attendu n''a pas eu lieu.';
  end if;
  raise notice 'Garde-fou 3 : un référent sans partenaire est refusé.';

  -- ④ LE PARTENAIRE VOIT-IL CE COMPTE ? C'est `apporteur_partenaire_id` qui l'ouvre, et lui seul.
  if not exists (
    select 1 from comptes c
     where c.id = v_client and c.apporteur_partenaire_id = v_part
  ) then
    raise exception 'Le rattachement par apporteur n''a pas tenu.';
  end if;
  raise notice 'Garde-fou 4 : le compte porte bien son apporteur, donc il entre dans son périmètre.';

  raise exception 'GARDE-FOU OK';
exception
  when others then
    if sqlerrm <> 'GARDE-FOU OK' then
      raise;
    end if;
    raise notice 'Garde-fou : le bon contact passe, le mauvais est refusé, rien n''est écrit.';
end $$;

commit;
