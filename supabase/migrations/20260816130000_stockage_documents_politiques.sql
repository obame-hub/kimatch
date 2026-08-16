-- ============================================================================================
-- STOCKAGE : autoriser le depot de fichiers dans le bucket « documents »
-- ============================================================================================
-- Le brief de William demande le glisser-deposer de fichiers, « imperatif, sur toutes les fiches,
-- avec categorisation ». L'onglet Fichiers en avait bien l'apparence — une zone en pointilles qui
-- reagit au survol — mais le depot ne faisait qu'ouvrir une modale reclamant une URL : le fichier
-- glisse etait purement et simplement perdu.
--
-- LA CAUSE N'ETAIT PAS DANS L'INTERFACE. Le bucket « documents » ne porte AUCUNE politique
-- (constate le 16/08/2026 : storage.objects n'en compte que quatre, toutes sur « avatars »).
-- Sans politique d'ecriture, aucun utilisateur connecte ne peut y deposer quoi que ce soit — le
-- formulaire par URL etait le seul chemin possible, et c'est pour cela qu'il existait.
--
-- Seul le serveur ecrivait jusqu'ici, avec la cle de service, pour archiver les mandats DocuSign
-- (voir api/docusign/_archivage.ts). Ce chemin continue de fonctionner : la cle de service ignore
-- la RLS, ces politiques ne la genent pas.
--
-- CE QUE L'ON OUVRE, ET CE QUE L'ON N'OUVRE PAS.
--   lecture   : deja publique, le bucket est en `public = true` et les URL sont partagees telles
--               quelles dans la table documents. Rien ne change.
--   ecriture  : reservee aux utilisateurs connectes. C'est le minimum pour que le depot marche.
--   remplacement et suppression : reserves eux aussi aux utilisateurs connectes.
--
-- On ne restreint pas au proprietaire du fichier, contrairement au bucket « avatars » ou chacun
-- n'ecrit que dans son dossier : un document appartient a la fiche, pas a celui qui l'a depose, et
-- l'equipe doit pouvoir corriger un fichier mal categorise. C'est la meme logique que la
-- suppression ouverte a tous le 16/08/2026 (voir useCanManage) et que la visibilite des comptes
-- tranchee le 14/08 — l'outil est celui d'une equipe de dix personnes qui se remplacent.
-- ============================================================================================

begin;

-- Depot d'un nouveau fichier.
drop policy if exists documents_authenticated_insert on storage.objects;
create policy documents_authenticated_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents');

-- Remplacement d'un fichier existant : c'est ce que fait `x-upsert`, utilise a l'archivage du
-- mandat signe pour ecraser la version envoyee.
drop policy if exists documents_authenticated_update on storage.objects;
create policy documents_authenticated_update
  on storage.objects for update to authenticated
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');

-- Suppression, pour retirer une piece jointe posee par erreur.
drop policy if exists documents_authenticated_delete on storage.objects;
create policy documents_authenticated_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents');

-- Lecture explicite. Le bucket est deja public, mais l'ecrire evite de dependre uniquement de ce
-- reglage : si quelqu'un repasse le bucket en prive un jour, les fiches continueront d'afficher
-- leurs documents pour les personnes connectees.
drop policy if exists documents_read on storage.objects;
create policy documents_read
  on storage.objects for select to public
  using (bucket_id = 'documents');

commit;

-- ============================================================================================
-- CONTROLE APRES APPLICATION
-- ============================================================================================
--   select policyname, cmd, roles::text
--   from pg_policies where schemaname='storage' and tablename='objects'
--     and policyname like 'documents%' order by policyname;
--
-- Attendu : quatre politiques — delete, insert, read, update.
--
-- Puis, dans l'application : ouvrir une fiche compte, onglet Fichiers, glisser un PDF. Il doit
-- apparaitre dans la liste sans passer par un formulaire d'URL.
