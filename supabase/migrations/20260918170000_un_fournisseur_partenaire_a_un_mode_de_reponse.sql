-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN FOURNISSEUR PARTENAIRE A UN MODE DE RÉPONSE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 18/09/2026 : « un champ disponible sur les fournisseurs partenaires nommé "Mode de
-- réponse" me semble indispensable », puis « il faut le faire uniquement sur les fournisseurs qui
-- sont partenaires, pas pour les autres ».
--
-- ══ C'EST LE CHAMP DONT TOUT LE RESTE DÉPEND ══
--
-- Il décide de ce que Kimatch doit dire à Erwan, et QUAND :
--
--   · MAIL       → une demande part par e-mail, DÈS LA CRÉATION de la version.
--   · TRADEO     → Erwan saisit la demande sur la plateforme du partenaire, DÈS LA CRÉATION aussi.
--   · PLATEFORME → rien ne part ; Erwan va chercher les prix LE JOUR DE LA LIVRAISON SOUHAITÉE.
--   · GRILLE     → idem : les prix se lisent dans une grille, le jour J.
--
-- Sans lui, aucun écran ne peut distinguer « tu dois écrire maintenant » de « tu iras chercher
-- vendredi », et les relances de confirmation à 24 h s'appliqueraient à des fournisseurs qui n'ont
-- jamais reçu de demande.
--
-- ══ POURQUOI IL REMPLACE `mode_consultation` SANS LE SUPPRIMER ══
--
-- `mode_consultation` ne connaît que EMAIL et OUTIL_EN_LIGNE, et vaut EMAIL sur 50 fournisseurs sur
-- 51 : c'est le défaut de la colonne, pas un choix. Le reprendre tel quel aurait inscrit dix-huit
-- mensonges dans la nouvelle colonne.
--
-- ELLE NAÎT DONC VIDE, ET C'EST VOLONTAIRE. NULL veut dire « personne ne l'a encore dit », ce qui se
-- distingue d'un mode choisi — et les écrans peuvent le réclamer au lieu de se tromper en silence.
-- Une seule valeur est reprise : ILEK, le seul fournisseur qu'on a délibérément marqué OUTIL_EN_LIGNE
-- le 17/08/2026, devient PLATEFORME.
--
-- L'ancienne colonne reste le temps que les écrans basculent : elle est lue par la fiche
-- recommandation, par le Pricing et par la vue v_pricing_versions.
--
-- ══ SEULEMENT LES PARTENAIRES ══
--
-- La contrainte ne porte que sur les valeurs, pas sur qui peut en avoir une : un fournisseur qu'on
-- ne consulte pas n'a simplement pas de mode, et sa ligne reste à NULL. Mesuré le 18/09/2026 :
-- 19 fournisseurs sont au statut de partenariat ACTIF, 32 restent À QUALIFIER. Ce sont ces 19 que
-- William renseigne.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

alter table comptes_fournisseurs
  add column if not exists mode_reponse text;

alter table comptes_fournisseurs
  drop constraint if exists comptes_fournisseurs_mode_reponse_check;

alter table comptes_fournisseurs
  add constraint comptes_fournisseurs_mode_reponse_check
  check (mode_reponse is null or mode_reponse in ('MAIL', 'TRADEO', 'PLATEFORME', 'GRILLE'));

comment on column comptes_fournisseurs.mode_reponse is
  'Comment ce partenaire répond à une demande d''offre : MAIL et TRADEO reçoivent une demande dès la création de la version ; PLATEFORME et GRILLE se consultent le jour de la livraison souhaitée. NULL = pas encore renseigné. Voir la migration du 18/09/2026.';

-- LE SEUL MODE JAMAIS CHOISI DÉLIBÉRÉMENT est repris : ILEK a été marqué « outil en ligne » le
-- 17/08/2026 après la réunion où Michel l'a donné en exemple. Les 18 autres attendent William.
update comptes_fournisseurs
set mode_reponse = 'PLATEFORME'
where mode_consultation = 'OUTIL_EN_LIGNE' and mode_reponse is null;
