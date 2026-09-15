-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- DIX NOUVEAUTÉS RETROUVENT LEUR AUTEUR
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 15/09/2026 : « pourquoi dans les nouveautés je ne vois plus le nom de William, est-ce
-- que c'est lui qui a enlevé cette info ? » puis « faut mettre des noms aux nouveautés sans auteur,
-- vérifie ce que j'ai fait moi et ce qu'a fait William ».
--
-- ══ NON, IL N'A RIEN ENLEVÉ ══════════════════════════════════════════════════════════════════
--
-- Ses 21 publications du 04 au 11/09 sont intactes. Ce qui a changé, c'est que douze nouveautés
-- publiées le 14/09 sous le compte de Naoëlle — par le script, comme elle l'a demandé le 07/09 —
-- les ont poussées plus bas dans la liste.
--
-- En revanche DIX publications n'ont ni `auteur_id` ni `cree_par_id`. Elles s'affichent sans nom,
-- et c'est ce qui a donné l'impression d'une disparition.
--
-- ══ D'OÙ VIENNENT-ELLES, PUISQUE LES DEUX CHEMINS SIGNENT ════════════════════════════════════
--
-- L'écran pose `auteur_id: utilisateur.id` à l'insertion. Le script pose `AUTEUR_PAR_DEFAUT`.
-- Aucun des deux ne peut produire une ligne anonyme : ces dix viennent d'un troisième chemin, du
-- SQL écrit à la main.
--
-- ══ SUR QUOI REPOSE L'ATTRIBUTION ════════════════════════════════════════════════════════════
--
-- Deux d'entre elles reprennent MOT POUR MOT des commits de William :
--
--   « Les mails partent avec leurs pièces jointes, et la typologie se choisit »   14/09 13:33
--       ↔ « Un mail peut emporter des pièces jointes »                            14/09 15:26
--       ↔ « La typologie d'un compte se choisit dans une liste qui dit la vérité » 14/09 15:26
--
--   « L'onglet Contacts sait qui décide, qui administre, et qui reste »           13/09 21:11
--       ↔ « L'onglet Contacts range les gens par ce qu'ils peuvent faire »        13/09 23:05
--
-- Les huit autres, publiées entre 22 h 16 et 22 h 23 le 14/09, décrivent la fiche compte, l'onglet
-- Compteurs, le volet d'activité, l'historique des recommandations — le terrain de ses commits des
-- 12, 13 et 14/09. Aucune ne correspond à un travail de Naoëlle, dont les douze publications du
-- jour sont toutes signées.
--
-- L'ATTRIBUTION DES DEUX PREMIÈRES EST CERTAINE, celle des huit autres repose sur le contenu et
-- sur l'élimination. C'est écrit ici pour que ce soit corrigeable si l'une d'elles n'est pas de
-- lui : `cree_par_id` reste nul sur les huit, et le distingue des deux.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── LES DEUX CERTAINES : auteur ET créateur ───────────────────────────────────────────────────
update public.publications
   set auteur_id = '14483439-27d3-4e48-b0db-b074b4fe2f4a',
       cree_par_id = '14483439-27d3-4e48-b0db-b074b4fe2f4a'
 where auteur_id is null
   and titre in (
     'L''onglet Contacts sait qui décide, qui administre, et qui reste',
     'Les mails partent avec leurs pièces jointes, et la typologie se choisit'
   );

-- ── LES HUIT AUTRES : auteur seul, `cree_par_id` reste nul pour marquer la différence ─────────
update public.publications
   set auteur_id = '14483439-27d3-4e48-b0db-b074b4fe2f4a'
 where auteur_id is null
   and date_publication is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : PLUS UNE SEULE NOUVEAUTÉ PUBLIÉE SANS NOM
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Et surtout : on ne touche PAS aux 99 autres. Une migration qui réattribuerait par erreur les
-- publications de quelqu'un d'autre ferait pire que le silence qu'elle répare.
--
do $$
declare
  sans_nom   integer;
  a_william  integer;
  a_naoelle  integer;
begin
  select count(*)::integer into sans_nom
    from public.publications where auteur_id is null and date_publication is not null;
  if sans_nom > 0 then
    raise exception '% nouveauté(s) publiée(s) restent sans nom.', sans_nom;
  end if;

  select count(*)::integer into a_william from public.publications
   where auteur_id = '14483439-27d3-4e48-b0db-b074b4fe2f4a';
  select count(*)::integer into a_naoelle from public.publications
   where auteur_id = '22c7cc2e-64d4-436c-8e6e-3a6f31fa304f';

  -- 21 publications signées William avant cette migration, 10 rendues : 31 attendues.
  if a_william <> 31 then
    raise exception 'William porte % publications au lieu des 31 attendues : l''attribution a débordé.', a_william;
  end if;
  -- Les 78 de Naoëlle ne doivent pas avoir bougé d'une ligne.
  if a_naoelle <> 78 then
    raise exception 'Naoëlle porte % publications au lieu de 78 : on a touché aux siennes.', a_naoelle;
  end if;

  raise notice 'Garde-fou : 10 nouveautés rendues à William (31 au total), les 78 de Naoëlle intactes, aucune publiée sans nom.';
end $$;

commit;
