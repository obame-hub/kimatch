-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- NAOËLLE OPÈRE LE COMPTE ALLO DE WILLIAM, LE TEMPS DES ESSAIS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 08/09/2026 : « je suis connectée sur le compte de Will », puis « pour le moment Will ne
-- peut pas ajouter mon numéro, faut qu'on teste sans mon numéro ».
--
-- ══ POURQUOI UNE MIGRATION POUR UNE SEULE LIGNE ══
--
-- Parce que c'est le seul outil disponible. Je lui avais donné cet `update` en SQL brut ; elle l'a
-- collé dans PowerShell, qui a répondu « le terme "update" n'est pas reconnu comme nom d'applet de
-- commande ». C'était ma faute : donner du SQL sans dire par quoi le faire passer, à quelqu'un qui a
-- justement demandé à ne pas ouvrir Supabase.
--
-- Elle se lance donc comme les autres :
--
--   node scripts/appliquer-migration.cjs 20260908190000
--
-- ══ CE QUE ÇA FAIT, ET CE QUE ÇA NE FAIT PAS ══
--
-- `profils.email_allo` ne sert QU'À CHOISIR LA FILE D'APPEL où déposer un numéro, et la carte
-- d'appel à l'écran. L'attribution des appels dans l'historique reste sur `profils.email` : un appel
-- passé depuis le compte de William restera un appel de William. Rien n'est falsifié — voir le
-- commentaire de la colonne, posé par la migration 20260908180000.
--
-- Conséquence à assumer pendant les essais : Naoëlle et William verront LA MÊME carte d'appel, parce
-- qu'ils opèrent le même compte Allo. C'est exact plutôt que gênant.
--
-- ══ À RETIRER, ET C'EST ÉCRIT ══
--
-- Le jour où Naoëlle aura son propre compte Allo — ce que la facturation refusée empêche
-- aujourd'hui :
--
--   update profils set email_allo = null where email = 'n.ghouma@kiwee-energie.fr';
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  v_naoelle uuid;
  v_william text := 'w.goupil@kiwee-energie.fr';
  v_rendu   text;
begin
  select id into v_naoelle from profils where lower(email) = 'n.ghouma@kiwee-energie.fr';
  if v_naoelle is null then
    raise exception 'Profil de Naoëlle introuvable. Rien n''est appliqué.';
  end if;

  -- LE COMPTE VISÉ DOIT EXISTER DANS KIMATCH. Ce n'est pas une garantie qu'il existe chez Allo —
  -- seule l'API le sait — mais une adresse mal recopiée se verrait ici plutôt qu'à l'écran par un
  -- 404 muet.
  if not exists (select 1 from profils where lower(email) = v_william) then
    raise exception 'Aucun profil Kimatch pour % : adresse mal recopiée ? Rien n''est appliqué.', v_william;
  end if;

  update profils set email_allo = v_william where id = v_naoelle;

  v_rendu := fn_email_allo(v_naoelle);
  if v_rendu <> v_william then
    raise exception 'fn_email_allo rend « % » au lieu de « % ». Rien n''est appliqué.', v_rendu, v_william;
  end if;

  raise notice 'Naoëlle vise désormais la file d''appel de %. Son historique reste à son nom.', v_william;
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APRÈS APPLICATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Qui vise quoi :
--
--   select prenom || ' ' || nom as qui, email, email_allo
--     from profils where email_allo is not null;
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
