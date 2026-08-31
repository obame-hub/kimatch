-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CORRIGER LE COMPTE PRINCIPAL D'UN CONTACT
--
-- Michel, 31/08/2026 : « rattacher un compte à un contact ».
--
-- ══ CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT ══
--
-- Un contact peut être rattaché à PLUSIEURS comptes depuis le 13/08/2026 : l'onglet
-- « Rattachements » de sa fiche ajoute et retire des liens dans `contacts_comptes`. Mesuré ce jour :
-- 3 391 contacts, 3 537 liens, donc 146 rattachements secondaires portés par 77 contacts.
--
-- Ce que cet onglet REFUSE, et à raison, c'est de toucher au compte principal. Il vit en deux
-- endroits qui doivent s'accorder : la colonne `contacts.compte_id` et la ligne
-- `contacts_comptes.relation_directe = true`. `useDelierContactCompte` filtre donc sur
-- `relation_directe = false` — sinon un clic laisserait les deux sources en désaccord.
--
-- Conséquence : un contact créé sous le mauvais compte ne pouvait plus être corrigé depuis
-- l'interface. C'est le trou que cette fonction bouche.
--
-- ══ POURQUOI UNE FONCTION ET NON DEUX APPELS DEPUIS L'ÉCRAN ══
--
-- Le changement touche trois lignes : la colonne du contact, l'ancienne ligne de lien, la nouvelle.
-- Le client Supabase ne sait pas les écrire dans une transaction — un échec au deuxième appel
-- laisserait précisément le désaccord que le code se donne du mal à éviter. Ici, tout réussit ou
-- rien ne change.
--
-- L'ACCORD EST VÉRIFIÉ AVANT DE RENDRE LA MAIN. Les trois contrôles finaux sont l'invariant même
-- qu'on protège : une ligne principale, une seule, et le même compte que la colonne. Mesuré avant
-- écriture de cette migration : 0 contact sans ligne principale, 0 en désaccord, 0 avec deux
-- lignes principales. On part d'un état sain, on ne le quitte pas.
--
-- ══ L'ANCIEN COMPTE : GARDÉ OU RETIRÉ, C'EST À L'UTILISATEUR DE DIRE ══
--
-- Deux situations que rien ne distingue de l'extérieur. Un contact saisi sous le mauvais compte :
-- l'ancien lien est une erreur, il doit disparaître. Un contact qui change d'employeur mais reste
-- l'interlocuteur de l'ancien : le lien devient secondaire. `conserver_ancien_lien` tranche, et
-- l'écran pose la question — deviner à sa place produirait un rattachement fantôme une fois sur
-- deux.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.changer_compte_principal_contact(
  p_contact_id uuid,
  p_compte_id uuid,
  p_conserver_ancien_lien boolean default false
) returns void
language plpgsql
security invoker
as $$
declare
  v_ancien_compte_id uuid;
  v_nb integer;
begin
  select compte_id into v_ancien_compte_id from public.contacts where id = p_contact_id;
  if not found then
    raise exception 'Contact introuvable.';
  end if;

  if not exists (select 1 from public.comptes where id = p_compte_id) then
    raise exception 'Compte introuvable.';
  end if;

  -- Rien à faire, et surtout : ne pas retirer le lien qu'on est censé installer.
  if v_ancien_compte_id = p_compte_id then
    return;
  end if;

  -- ── L'ANCIENNE LIGNE PRINCIPALE ──
  if p_conserver_ancien_lien then
    update public.contacts_comptes
       set relation_directe = false, date_modification = now()
     where contact_id = p_contact_id and compte_id = v_ancien_compte_id;
  else
    delete from public.contacts_comptes
     where contact_id = p_contact_id and compte_id = v_ancien_compte_id;
  end if;

  -- ── LA NOUVELLE ──
  -- Le contact peut déjà être rattaché à ce compte en secondaire : la contrainte d'unicité
  -- (contact_id, compte_id) interdit d'insérer une deuxième ligne, il faut promouvoir celle-là.
  update public.contacts_comptes
     set relation_directe = true, actif = true, date_modification = now()
   where contact_id = p_contact_id and compte_id = p_compte_id;

  if not found then
    insert into public.contacts_comptes (contact_id, compte_id, relation_directe, actif)
    values (p_contact_id, p_compte_id, true, true);
  end if;

  update public.contacts
     set compte_id = p_compte_id, date_modification = now()
   where id = p_contact_id;

  -- ── L'INVARIANT, VÉRIFIÉ ──
  select count(*) into v_nb
    from public.contacts_comptes
   where contact_id = p_contact_id and relation_directe;
  if v_nb <> 1 then
    raise exception 'Incohérence : % ligne(s) principale(s) après le changement.', v_nb;
  end if;

  if not exists (
    select 1 from public.contacts c
      join public.contacts_comptes cc on cc.contact_id = c.id and cc.relation_directe
     where c.id = p_contact_id and cc.compte_id = c.compte_id
  ) then
    raise exception 'Incohérence : la ligne principale ne désigne pas le compte du contact.';
  end if;
end;
$$;

comment on function public.changer_compte_principal_contact(uuid, uuid, boolean) is
  'Déplace le compte principal d''un contact en gardant `contacts.compte_id` et la ligne `contacts_comptes.relation_directe` d''accord (Michel, 31/08/2026). `p_conserver_ancien_lien` garde l''ancien compte en rattachement secondaire au lieu de le retirer.';

grant execute on function public.changer_compte_principal_contact(uuid, uuid, boolean)
  to authenticated, service_role;

commit;
