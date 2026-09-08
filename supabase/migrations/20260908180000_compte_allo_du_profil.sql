-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- L'ADRESSE ALLO D'UN PROFIL, QUAND ELLE N'EST PAS LA SIENNE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 08/09/2026, en essayant le bouton « Appeler » : « je suis connectée sur le compte de
-- Will. »
--
-- ══ LE PROBLÈME, MESURÉ ══
--
-- Le bouton « Appeler » dépose le numéro dans la file du Power Dialer de la personne connectée à
-- Kimatch, en visant son adresse e-mail. Vérifié à l'instant contre l'API :
--
--   file de n.ghouma@kiwee-energie.fr    →  404  ASSIGNEE_NOT_FOUND
--   file de m.thonnard@kiwee-energie.fr  →  200  file vide, prête
--
-- L'espace Allo compte SEPT membres — William en MANAGER, six commerciaux en MEMBER. Michel, Erwan
-- et Naoëlle n'en font pas partie, et la facturation refusée empêche de les ajouter.
--
-- LES DEUX SYSTÈMES N'ONT DONC PAS LA MÊME IDENTITÉ pour la même personne. Ce n'est pas un cas de
-- test : le jour où un commercial aura une adresse Allo différente de son adresse Kimatch, le bouton
-- échouera en silence pour lui aussi, avec un 404 que personne ne saura lire.
--
-- ══ CETTE COLONNE NE SERT QU'AUX APPELS SORTANTS ══
--
-- Et c'est une décision, pas un raccourci. Elle répond à « dans quelle file je dépose ce numéro ».
-- Elle ne répond PAS à « qui a passé cet appel » : cette seconde question reste résolue par
-- `profils.email`, dans le webhook.
--
-- Si les deux l'utilisaient, un appel de William deviendrait ambigu dès que quelqu'un d'autre
-- pointe vers son compte — deux profils correspondraient au même `user_email`, et l'appel
-- s'attribuerait au hasard. Séparer les deux sens supprime l'ambiguïté au lieu de la gérer.
--
-- Aucune contrainte d'unicité, pour la même raison : plusieurs profils peuvent viser le même compte
-- Allo, et c'est exactement l'usage du jour.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.profils
  add column if not exists email_allo text;

comment on column public.profils.email_allo is
  'L''adresse du compte ALLO de cette personne, quand elle diffère de son adresse Kimatch. Nulle, '
  'c''est `email` qui sert. Utilisée uniquement pour choisir la file d''appel où déposer un numéro — '
  'jamais pour attribuer un appel entrant, qui reste résolu par `email` afin qu''un compte Allo '
  'partagé ne rende pas l''attribution ambiguë. Ajoutée le 08/09/2026 : sept membres dans l''espace '
  'Allo, dix profils actifs dans Kimatch.';

-- ── LA VUE QUE LE SERVEUR INTERROGE ───────────────────────────────────────────────────────────
--
-- Une fonction plutôt qu'un `coalesce` recopié dans chaque appelant : le jour où la règle se
-- complique — une adresse par défaut d'équipe, par exemple — elle ne se complique qu'ici.
create or replace function public.fn_email_allo(p_profil_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(nullif(trim(coalesce(p.email_allo, '')), ''), p.email)
    from profils p where p.id = p_profil_id
$$;

comment on function public.fn_email_allo(uuid) is
  'L''adresse à viser dans Allo pour ce profil : son `email_allo` s''il en a un, son `email` sinon.';

grant execute on function public.fn_email_allo(uuid) to authenticated;

-- ── GARDE-FOU ─────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_profil uuid;
  v_avant  text;
  v_rendu  text;
begin
  select id, email into v_profil, v_avant from profils where actif limit 1;

  -- Sans `email_allo`, c'est l'adresse Kimatch qui sert.
  if fn_email_allo(v_profil) is distinct from v_avant then
    raise exception 'Sans email_allo, la fonction ne rend pas l''adresse Kimatch. Rien n''est appliqué.';
  end if;

  -- Avec, c'est elle qui l'emporte.
  update profils set email_allo = 'zzz.test@kiwee-energie.fr' where id = v_profil;
  if fn_email_allo(v_profil) <> 'zzz.test@kiwee-energie.fr' then
    raise exception 'email_allo ne l''emporte pas. Rien n''est appliqué.';
  end if;

  -- Une chaîne vide ou des espaces ne comptent pas : sinon un champ effacé à l'écran viderait
  -- l'adresse au lieu de revenir au défaut, et le bouton « Appeler » échouerait sans raison lisible.
  update profils set email_allo = '   ' where id = v_profil;
  if fn_email_allo(v_profil) is distinct from v_avant then
    raise exception 'Un email_allo vide ne retombe pas sur l''adresse Kimatch. Rien n''est appliqué.';
  end if;

  update profils set email_allo = null where id = v_profil;
  raise notice 'Garde-fou passé : email_allo l''emporte quand il existe, et un champ vide retombe sur l''adresse Kimatch.';
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APRÈS APPLICATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pour que Naoëlle puisse essayer le bouton « Appeler » avec le compte Allo de William :
--
--   update profils set email_allo = 'w.goupil@kiwee-energie.fr'
--    where email = 'n.ghouma@kiwee-energie.fr';
--
-- À retirer le jour où elle aura son propre compte Allo :
--
--   update profils set email_allo = null where email = 'n.ghouma@kiwee-energie.fr';
--
-- Qui vise quoi, aujourd'hui :
--
--   select prenom || ' ' || nom as qui, email, email_allo
--     from profils where email_allo is not null;
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
