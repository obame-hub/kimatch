-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA TYPOLOGIE D'UN COMPTE DEVIENT UNE LISTE, ET LA LISTE DIT LA VÉRITÉ
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 14/09/2026 : « j'ai l'impression que le champ typologie est un champ texte alors que ça
-- devrait être une liste déroulante plutôt non ? »
--
-- Oui — et la table de référence existait déjà. Personne ne l'avait branchée, et elle avait divergé
-- de la donnée au point de devenir dangereuse.
--
-- ══ UNE SEULE DES SIX VALEURS RÉELLES Y FIGURAIT ══
--
--   Entreprise                 2 174 comptes   ✔ dans la liste
--   Syndic professionnel         533           ✘ absente
--   Fournisseur                   52           ✘ absente
--   Partenaire                     7           ✘ absente
--   Syndic non professionnel       7           ✘ absente
--   Courtier                       2           ✘ absente
--
-- Et la liste proposait en retour quatre valeurs à zéro compte : Syndic, Collectivité, Bailleur,
-- Autre. BRANCHER LE MENU TEL QUEL AURAIT RENDU 533 SYNDICS PROFESSIONNELS INQUALIFIABLES — leur
-- valeur n'aurait plus été proposée, et le premier enregistrement les aurait basculés ailleurs.
--
-- Les six bonnes valeurs existaient pourtant, codées en dur dans le parcours de création
-- (`CompteCreate.tsx`). C'est donc le vocabulaire de la création qui fait foi ici : la table le
-- rejoint, elle ne l'invente pas.
--
-- ══ « SYNDIC » TOUT COURT EST DEVENU UN PIÈGE LE 13/09 ══
--
-- Depuis l'onglet Contacts à trois zones, c'est la distinction professionnel / non professionnel
-- qui décide de ce qui s'affiche : trois bandes chez un cabinet, deux chez un syndic bénévole, où
-- il n'y a aucun cabinet à perdre. Un compte marqué « Syndic » ne serait ni l'un ni l'autre — pas
-- de zone « Qui reste », et rien pour le dire. William, 14/09/2026, sur le maintien des deux
-- valeurs distinctes : « Oui ».
--
-- ══ DÉSACTIVÉES, PAS SUPPRIMÉES ══
--
-- Collectivité, Bailleur et Autre sortent du menu à la demande de William. `actif = false` plutôt
-- qu'un `delete` : la colonne existe pour ça, aucune ne porte de compte, et le jour où le métier en
-- redemande une, c'est un booléen à rebasculer plutôt qu'une ligne à réécrire de mémoire.
--
-- ══ LA TYPOLOGIE DÉPEND DU TYPE DE COMPTE ══
--
-- « Fournisseur » et « Partenaire » ne sont pas des typologies de client : ce sont des redites du
-- type de compte, et elles n'ont rien à faire dans le menu d'un client. D'où `types_comptes`, un
-- TABLEAU et non une valeur unique — « Courtier » existe aussi bien sur un client que sur un
-- partenaire, et le forcer dans une seule case obligerait à dupliquer la ligne.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table segments_comptes
  add column if not exists types_comptes text[] not null default '{client}';

comment on column segments_comptes.types_comptes is
  'Types de compte auxquels cette typologie est proposée. Un tableau : « Courtier » vaut pour un '
  'client comme pour un partenaire.';

-- ══ LES VALEURS RÉELLES ENTRENT DANS LA LISTE ══

insert into segments_comptes (code, libelle, ordre, actif, types_comptes) values
  ('SYNDIC_PRO',      'Syndic professionnel',     10, true, array['client']),
  ('SYNDIC_BENEVOLE', 'Syndic non professionnel', 15, true, array['client']),
  ('COURTIER',        'Courtier',                 30, true, array['client', 'partenaire']),
  ('FOURNISSEUR',     'Fournisseur',              40, true, array['fournisseur']),
  ('PARTENAIRE',      'Partenaire',               50, true, array['partenaire'])
on conflict (code) do update
  set libelle = excluded.libelle,
      ordre = excluded.ordre,
      actif = true,
      types_comptes = excluded.types_comptes;

update segments_comptes
   set ordre = 20, types_comptes = array['client'], actif = true
 where code = 'ENTREPRISE';

-- ══ ET LES VALEURS MORTES EN SORTENT ══

update segments_comptes
   set actif = false
 where code in ('SYNDIC', 'COLLECTIVITE', 'BAILLEUR', 'AUTRE');

-- ══ GARDE : ON NE DÉSACTIVE PAS UNE VALEUR QUI PORTE DES COMPTES ══
--
-- Les quatre sont à zéro au 14/09/2026. Si l'une d'elles en portait, la désactiver la rendrait
-- inqualifiable — exactement ce que William a demandé d'éviter (« Ne jamais rendre une valeur
-- inqualifiable = Oui »). Mieux vaut échouer ici que découvrir le trou dans six mois.

do $$
declare orphelins int;
begin
  select count(*) into orphelins
    from comptes c
    join segments_comptes s on s.libelle = c.segment
   where s.actif = false;

  if orphelins > 0 then
    raise exception 'ARRÊT : % comptes portent une typologie qu''on vient de désactiver.', orphelins;
  end if;
end $$;

commit;

-- ══ CONTRÔLE APRÈS APPLICATION ══
--
--   select s.libelle, s.ordre, s.types_comptes,
--          (select count(*) from comptes c where c.segment = s.libelle) comptes
--     from segments_comptes s where s.actif order by s.ordre;
--   -- appliqué le 14/09/2026 : Syndic professionnel 533, Syndic non professionnel 7,
--   --                          Entreprise 2174, Courtier 2, Fournisseur 52, Partenaire 7
