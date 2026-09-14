-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES RÔLES D'UN CONTACT SE DÉDUISENT DES FAITS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 14/09/2026 :
--   « Les contacts sont renseignés en double s'ils sont à la fois signataire et administratif.
--     Ce n'est pas possible »
--   « Un contact est "Signataire" s'il est renseigné sur un mandat ou sur un contrat »
--   « Un contact est "Décisionnaire" s'il a au minimum un compteur d'affilié »
--   « Un contact administratif ne peut pas avoir de compteurs liés »
--
-- ══ TROIS RÔLES SUR QUATRE CESSENT D'ÊTRE UN CHOIX ══
--
-- Décisionnaire, Signataire et Conseil syndical ne se décrètent plus : ils se CONSTATENT. Les
-- laisser cochables, c'était accepter qu'ils disent autre chose que la réalité — et c'est
-- exactement ce qui s'était produit : l'amorçage du 13/09 déduisait « décisionnaire » de l'intitulé
-- de poste, ce qui donnait 311 décisionnaires sans le moindre compteur.
--
-- ADMINISTRATIF RESTE LE SEUL CHOIX, et il est résiduel : on ne peut pas le déduire. Quelqu'un sans
-- compteur et sans signature est peut-être une comptable, peut-être un contact qu'on n'a pas encore
-- qualifié. Seul un humain sait. Mais il ne survit à aucun fait contraire.
--
-- ══ CE QUI DISPARAÎT, ET C'ÉTAIT LE SYMPTÔME SIGNALÉ ══
--
-- 477 contacts portaient Signataire ET Administratif, 121 Décisionnaire ET Administratif : ils
-- apparaissaient DEUX FOIS dans l'onglet Contacts, dans deux zones à la fois. La règle
-- d'exclusivité règle le doublon À LA SOURCE plutôt qu'à l'affichage — dédoublonner à l'écran
-- aurait laissé la donnée fausse et fait mentir le décompte de chaque bande.
--
-- 853 administratifs avaient des compteurs liés. Ils deviennent décisionnaires, ce qu'ils étaient.
--
-- ══ MESURE AVANT / APRÈS ══
--
--   Décisionnaires      1 560  →  2 463   (le compteur fait foi, plus l'intitulé de poste)
--   Signataires         1 078  →  1 061   (mandat ou contrat seulement ; les recommandations
--                                          servaient d'appoint à 23 contacts, elles sortent —
--                                          une étude n'engage pas, un contrat si)
--   Administratifs      1 301  →    369
--   Conseil syndical       87  →     45   (le lien compteur fait foi, plus la fonction en texte)
--   À qualifier           506  →    389
--   Incohérences          598  →      0
--
-- ══ UNE RÈGLE DEVIENT INUTILE ══
--
-- Le forçage du 13/09 — « en syndic bénévole, un membre CS est forcément décisionnaire et
-- signataire » — n'a plus lieu d'être : il est VRAI PAR CONSTRUCTION. Dans une copropriété qui se
-- gère elle-même, le conseil syndical porte les compteurs et signe les contrats, donc les faits lui
-- donnent les deux rôles sans qu'on ait à les poser.
--
-- ══ POURQUOI DES DÉCLENCHEURS ET NON UNE VUE ══
--
-- Une vue calculerait juste à chaque lecture, mais `contacts.roles` est lu partout — listes, fiches,
-- sélecteurs — et il faudrait réécrire chacun de ces appels. Les faits, eux, changent rarement :
-- un compteur réaffecté, un mandat signé. Le recalcul se fait donc à l'écriture, là où c'est rare,
-- plutôt qu'à la lecture, où c'est constant.
--
-- LES DEUX CÔTÉS DU CHANGEMENT SONT RECALCULÉS. Réaffecter un compteur retire un rôle à l'ancien
-- responsable autant qu'il en donne un au nouveau : ne traiter que `new` laisserait le précédent
-- décisionnaire d'un compteur qu'il n'a plus.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.fn_roles_contact(p_contact_id uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select array_remove(array[
    case when exists (select 1 from compteurs m where m.responsable_contact_id = p_contact_id)
         then 'DECISIONNAIRE' end,
    case when exists (select 1 from mandats  x where x.contact_signataire_id = p_contact_id)
           or exists (select 1 from contrats y where y.contact_signataire_id = p_contact_id)
         then 'SIGNATAIRE' end,
    case when 'ADMINISTRATIF' = any(coalesce((select c.roles from contacts c where c.id = p_contact_id), '{}'))
          and not exists (select 1 from compteurs m where m.responsable_contact_id = p_contact_id)
          and not exists (select 1 from mandats  x where x.contact_signataire_id = p_contact_id)
          and not exists (select 1 from contrats y where y.contact_signataire_id = p_contact_id)
          and not exists (select 1 from compteurs m where m.contact_conseil_syndical_id = p_contact_id)
         then 'ADMINISTRATIF' end,
    case when exists (select 1 from compteurs m where m.contact_conseil_syndical_id = p_contact_id)
         then 'CONSEIL_SYNDICAL' end
  ], null);
$$;

comment on function public.fn_roles_contact(uuid) is
  'Les rôles d''un contact, déduits des faits. Seul ADMINISTRATIF vient d''une saisie, et il ne '
  'survit à aucun fait contraire (règles de William du 14/09/2026).';

create or replace function public.fn_recalculer_roles_contact(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_contact_id is null then return; end if;
  update contacts
     set roles = fn_roles_contact(p_contact_id)
   where id = p_contact_id
     and roles is distinct from fn_roles_contact(p_contact_id);
end;
$$;

create or replace function public.fn_trg_roles_depuis_les_faits()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_table_name = 'compteurs' then
    if tg_op in ('UPDATE', 'DELETE') then
      perform fn_recalculer_roles_contact(old.responsable_contact_id);
      perform fn_recalculer_roles_contact(old.contact_conseil_syndical_id);
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      perform fn_recalculer_roles_contact(new.responsable_contact_id);
      perform fn_recalculer_roles_contact(new.contact_conseil_syndical_id);
    end if;
  else
    if tg_op in ('UPDATE', 'DELETE') then perform fn_recalculer_roles_contact(old.contact_signataire_id); end if;
    if tg_op in ('INSERT', 'UPDATE') then perform fn_recalculer_roles_contact(new.contact_signataire_id); end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_roles_depuis_compteurs on compteurs;
create trigger trg_roles_depuis_compteurs
  after insert or update of responsable_contact_id, contact_conseil_syndical_id or delete on compteurs
  for each row execute function fn_trg_roles_depuis_les_faits();

drop trigger if exists trg_roles_depuis_mandats on mandats;
create trigger trg_roles_depuis_mandats
  after insert or update of contact_signataire_id or delete on mandats
  for each row execute function fn_trg_roles_depuis_les_faits();

drop trigger if exists trg_roles_depuis_contrats on contrats;
create trigger trg_roles_depuis_contrats
  after insert or update of contact_signataire_id or delete on contrats
  for each row execute function fn_trg_roles_depuis_les_faits();

update contacts c set roles = fn_roles_contact(c.id)
 where c.roles is distinct from fn_roles_contact(c.id);

do $$
declare incoherents int;
begin
  select count(*) into incoherents
    from contacts c
   where 'ADMINISTRATIF' = any(c.roles)
     and ( exists (select 1 from compteurs m where m.responsable_contact_id = c.id)
        or exists (select 1 from mandats  x where x.contact_signataire_id = c.id)
        or exists (select 1 from contrats y where y.contact_signataire_id = c.id)
        or exists (select 1 from compteurs m where m.contact_conseil_syndical_id = c.id) );

  if incoherents > 0 then
    raise exception 'ARRÊT : % contacts restent administratifs malgré un fait contraire.', incoherents;
  end if;
end $$;

commit;

-- ══ CONTRÔLE APRÈS APPLICATION ══
--
--   select unnest(roles) role, count(*) from contacts group by 1 order by 2 desc;
--   -- appliqué le 14/09/2026 : DECISIONNAIRE 2463, SIGNATAIRE 1061, ADMINISTRATIF 369,
--   --                          CONSEIL_SYNDICAL 45 — et 389 contacts sans aucun rôle.
