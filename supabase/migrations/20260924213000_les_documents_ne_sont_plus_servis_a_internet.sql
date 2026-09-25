-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES DOCUMENTS NE SONT PLUS SERVIS À INTERNET
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 24/09/2026 : « vérifie ce que tu n'as pas pu vérifier, je veux qu'à la fin de ta boucle
-- il n'y ait plus rien à vérifier ».
--
-- Le stockage était justement ce que je n'avais pas regardé. Voici ce qu'il contenait.
--
-- ══ CE QUI ÉTAIT OUVERT, MESURÉ ══
--
--     HEAD /storage/v1/object/public/documents/contrats/…   ->  HTTP 200, 2,5 Mo servis
--
-- Sans compte. Sans session. Sans même la clé publique de l'application. Le seau `documents` était
-- déclaré PUBLIC, et sa policy de lecture ouverte au rôle `public` — c'est-à-dire à tout le monde.
--
--     mandats                  7 325 fichiers   des mandats signés par les clients
--     contrats                 5 845
--     version_recommandation   3 337            les offres chiffrées
--     compteur                 2 450            les relevés
--     compte                     666
--     ─────────────────────────────────
--                             20 000 fichiers
--
-- Il suffisait de connaître l'adresse — et l'adresse est dans `documents.url`, que tout utilisateur
-- connecté lisait, partenaires compris avant le cloisonnement de ce matin.
--
-- ══ POURQUOI ON NE FERME QUE MAINTENANT ══
--
-- Naoëlle : « ne pas fermer car les commerciaux travaillent encore, et régler le problème de
-- suite ». Fermer d'abord aurait coupé l'accès aux mandats en pleine journée de travail.
--
-- Le code qui ouvre les documents a donc été repris AVANT cette migration, et éprouvé pendant que
-- le seau était encore public : chaque ouverture demande maintenant une adresse signée, valable une
-- heure (`lib/data/lienDocument.ts`). Mesuré avant de fermer : la signature s'obtient, le fichier
-- arrive.
--
-- `api/gmail/send.ts` télécharge désormais avec la clé de service : c'est KiWee qui envoie le mail,
-- pas le destinataire qui vient se servir.
--
-- ══ CE QUI CHANGE POUR L'ÉQUIPE ══
--
-- Rien de visible : on clique, le document s'ouvre. La différence est qu'un lien copié ne vaut plus
-- qu'une heure, et qu'il ne fonctionne pas pour qui n'a pas de session.
--
-- ══ LES AVATARS RESTENT PUBLICS, ET C'EST VOULU ══
--
-- Une photo de profil s'affiche dans un `<img>` sur chaque écran : la signer obligerait à une
-- requête par image et par heure. Le seau contient UN fichier, et une photo de trombinoscope n'est
-- pas un mandat signé.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Le seau cesse d'être public ──
update storage.buckets set public = false where id = 'documents';

-- ── 2 · La lecture demande une session ──
--
-- La policy visait le rôle `public`, qui inclut `anon` : n'importe quel visiteur obtenait une URL
-- signée pour n'importe quel fichier. La signer ne protégeait donc rien.
drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects
  for select to authenticated
  using (bucket_id = 'documents');

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : PERSONNE DEHORS, TOUT LE MONDE DEDANS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le RISQUE est des deux côtés, et le second se verrait dans l'heure : fermer trop et l'équipe ne
-- peut plus ouvrir un mandat en clientèle. On éprouve donc les deux.
--
do $$
declare
  v_public boolean;
  v_anon   integer;
  v_auth   integer;
begin
  select public into v_public from storage.buckets where id = 'documents';
  if v_public then
    raise exception 'Le seau documents est encore public : les 20 000 fichiers restent servis à Internet.';
  end if;

  -- ① PERSONNE SANS SESSION. On compte ce que le rôle `anon` voit des objets du seau.
  set local role anon;
  select count(*) into v_anon from storage.objects where bucket_id = 'documents';
  reset role;
  if v_anon > 0 then
    raise exception 'Un visiteur sans compte voit encore % fichier(s).', v_anon;
  end if;

  -- ② L'ÉQUIPE VOIT TOUJOURS. Sans cela, plus personne n'ouvre un mandat.
  set local role authenticated;
  select count(*) into v_auth from storage.objects where bucket_id = 'documents';
  reset role;
  if v_auth = 0 then
    raise exception 'Un utilisateur connecté ne voit plus aucun document : l''équipe ne peut plus travailler.';
  end if;

  raise notice 'Garde-fou : le seau est privé, un visiteur voit 0 fichier, un utilisateur connecté en voit %.', v_auth;
end $$;

commit;
