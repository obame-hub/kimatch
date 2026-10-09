-- ══ LES FACTURES DÉPOSÉES SANS FICHE REJOIGNENT LEUR COMPTEUR ══
-- Matthieu, 09/10/2026 : « je joins la facture à la création du compteur, elle ne se retrouve pas
-- dans les fichiers du compteur ». Sept factures déposées à la création d'un compteur sont arrivées
-- dans le stockage sans leur fiche `documents` (l'écriture de la fiche avait échoué en silence) :
-- le fichier existe, le compteur ne le montre pas. On leur crée la fiche qui manque, en « Facture »,
-- au nom de celui qui les a déposées et à la date du dépôt.
--
-- Seules les factures sans ambiguïté sont reprises (5 de Matthieu le 02/10, 1 de Marie le 01/10,
-- 1 de Guillaume le 28/09). Les autres fichiers orphelins (août : un mandat déposé deux fois, des
-- doublons) sont laissés tels quels.
insert into public.documents (nom, nom_fichier, url, mime_type, taille_octets, entite_type, entite_id,
                              type_document_id, cree_par_id, proprietaire_id, date_creation)
select regexp_replace(split_part(o.name, '/', 3), '^[0-9]+_', ''),
       regexp_replace(split_part(o.name, '/', 3), '^[0-9]+_', ''),
       'https://llktvzbbfadmnhfjatrh.supabase.co/storage/v1/object/public/documents/' || o.name,
       o.metadata->>'mimetype',
       (o.metadata->>'size')::bigint,
       'compteur',
       split_part(o.name, '/', 2)::uuid,
       (select id from public.types_documents where code = 'FACTURE'),
       o.owner_id::uuid,
       o.owner_id::uuid,
       o.created_at
  from storage.objects o
 where o.bucket_id = 'documents'
   and o.name in (
     'compteur/9e1a2d8d-fc14-43ba-aba3-34510bb925ac/1790934084501_202609240010.pdf',
     'compteur/cd46e5e9-cc91-4b57-9007-0fba7ef2dbd7/1790935855619_lbb.pdf',
     'compteur/65b7ea49-a3bf-43c8-bceb-ebbbed17b5e8/1790935855815_lbb2.pdf',
     'compteur/8bc52f15-4457-4590-90d6-f90bb12f2a43/1790935855936_lbb3.pdf',
     'compteur/6b1a6b70-31c5-4b02-82e3-a3a96ac130e9/1790935856116_lbb4.pdf',
     'compteur/f5602e56-0865-430d-a55d-7d947d1b895f/1790868845294_01.26.pdf',
     'compteur/20196336-51ff-4928-89e1-9fe6f9c6a9f1/1790588615111_MARLIER_IMMOBILIER_GAZ_FACTURE_TOTAL_202608_1_.pdf'
   )
   and exists (select 1 from public.compteurs k where k.id = split_part(o.name, '/', 2)::uuid)
   and not exists (select 1 from public.documents d where d.url like '%/documents/' || o.name);
