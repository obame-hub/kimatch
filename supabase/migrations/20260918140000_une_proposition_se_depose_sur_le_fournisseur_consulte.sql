-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE PROPOSITION SE DÉPOSE SUR LE FOURNISSEUR CONSULTÉ
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 18/09/2026 : « ajoute une zone où un fichier — en l'occurrence l'offre au format PDF —
-- peut être déposé au niveau de la version. Mais également au niveau de chaque offre (GAZ EUROPEEN,
-- PICOTY…) afin de stocker les propositions au format PDF reçues de la part de ce fournisseur
-- (plusieurs propositions peuvent être déposées). »
--
-- ══ LE NIVEAU VERSION EXISTAIT DÉJÀ, ET SERT BEAUCOUP ══
--
-- 3 314 documents sont attachés à une version, dont 3 296 de type « Recommandation » : c'est la
-- proposition commerciale, celle qu'on envoie au client. Rien à créer de ce côté.
--
-- ══ LE NIVEAU FOURNISSEUR N'EXISTAIT PAS ══
--
-- `documents.entite_type` est verrouillé par une contrainte listant treize objets, et le fournisseur
-- consulté n'en faisait pas partie. `consultation_fournisseur` s'y ajoute — il désigne une ligne
-- d'`optimisations_fournisseurs`, c'est-à-dire UN fournisseur sur UNE version.
--
-- ══ POURQUOI PAS `offre_fournisseur`, QUI EXISTAIT DÉJÀ ══
--
-- Ce type est dans la liste depuis l'origine et un composant l'utilise — `FichierOffre`, écrit après
-- la réunion du 17/08/2026. Il n'a JAMAIS servi : zéro document le porte.
--
-- Et il vise le mauvais niveau. Une « offre » est ici une combinaison durée × type de prix : un
-- fournisseur consulté sur 24 et 36 mois en a deux. Or une proposition reçue par mail couvre le plus
-- souvent les deux d'un coup — la ranger sous l'une des deux obligerait à choisir arbitrairement, ou
-- à déposer le même PDF deux fois. Le fournisseur est le niveau auquel le document arrive.
--
-- `offre_fournisseur` RESTE DANS LA LISTE : il ne coûte rien, et le jour où les prix seront saisis
-- par combinaison, une grille tarifaire par durée y aura sa place.
--
-- ══ LA CONTRAINTE EST RECRÉÉE, PAS ÉTENDUE ══
--
-- PostgreSQL ne sait pas ajouter une valeur à un `check` : on le remplace. Les treize types
-- existants sont réécrits à l'identique — vérifié avant, aucun document ne porte un type absent de
-- cette liste.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

alter table documents drop constraint if exists documents_entite_type_check;

alter table documents add constraint documents_entite_type_check check (
  entite_type = any (array[
    'site', 'compte', 'contact', 'mandat', 'recommandation', 'version_recommandation',
    'contrat', 'offre_fournisseur', 'consultation_fournisseur', 'compteur',
    'opportunite', 'piste', 'requete', 'remuneration'
  ])
);
