-- Permettre d'attacher un fichier à un COMPTEUR.
--
-- SIGNALÉ LE 21/08/2026 : Agathe n'arrive pas à déposer une facture sur la fiche compteur
-- « SDC 6 MIDI ». L'écran affiche le message brut de PostgreSQL :
--
--     new row for relation "documents" violates check constraint "documents_entite_type_check"
--
-- L'onglet « Fichiers » du compteur existe depuis le début et envoie `entite_type = 'compteur'`,
-- la vue de liste `documents` joint déjà `entite_type = 'compteur'` pour retrouver le compteur
-- (migration 20260816120000), et la page Documents propose « compteur » dans son sélecteur — mais
-- la contrainte CHECK, elle, ne l'a jamais accepté. Aucun fichier n'a donc JAMAIS pu être déposé
-- sur un compteur : la répartition en base le confirme, 0 ligne sur 6 470.
--
-- La migration 20260818120000 l'avait annoncé mot pour mot : « cette contrainte devra encore être
-- étendue le jour où l'on rattachera des fichiers à un compteur ou à un contact. » C'est ce jour.
--
-- ON ÉTEND, ON NE SUPPRIME PAS. La liste fermée est ce qui empêche une faute de frappe de créer un
-- rattachement fantôme, invisible partout parce que rattaché à rien. Le prix est de revenir ici à
-- chaque nouveau type d'objet porteur de fichiers ; il vaut mieux le payer.
--
-- 'contact' N'EST PAS AJOUTÉ. Aucun écran ne dépose de fichier sur un contact aujourd'hui.
-- Autoriser une valeur que personne n'écrit ne fait que relâcher la contrainte sans rien permettre.

begin;

alter table public.documents drop constraint if exists documents_entite_type_check;

alter table public.documents
  add constraint documents_entite_type_check
  check (entite_type = any (array[
    'site', 'compte', 'mandat', 'recommandation', 'version_recommandation', 'contrat',
    'offre_fournisseur',
    -- Nouveau : la facture, le contrat ou la photo d'un point de livraison précis.
    'compteur'
  ]));

commit;

-- Vérification après application (à coller tel quel) :
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'documents_entite_type_check';
--   -- attendu : les 8 valeurs, dont 'compteur'
--
--   select entite_type, count(*) from public.documents group by 1 order by 2 desc;
--   -- attendu : mandat 3568, contrat 2877, recommandation 22, site 3 — inchangés
--
-- Puis, dans l'application : fiche compteur → onglet Fichiers → déposer un PDF. Le fichier doit
-- apparaître dans la liste juste en dessous, et le badge de l'onglet passer à 1.
