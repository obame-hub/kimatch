-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- DEUX CONTRATS SIGNÉS CHEZ DOCUSIGN ÉTAIENT RESTÉS « NOUVEAU »
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, réunion du 08/09/2026, rapporté par Naoëlle : « il y a des contrats qui sont signés sur
-- DocuSign mais qui passent pas à signé. »
--
-- ══ CE QUE LA MESURE DIT ══
--
-- Six contrats portent une enveloppe DocuSign. Quatre sont signés. Sur ces quatre, DEUX avaient
-- bien `statut_signature = 'SIGNE'` — la signature était donc parfaitement enregistrée — mais leur
-- statut métier n'avait jamais quitté « Nouveau » :
--
--   CT-01598  signé le 21/08/2026 à 15:04   début 15/02/2027   statut « Nouveau »
--   CT-01599  signé le 21/08/2026 à 15:18   début 01/05/2027   statut « Nouveau »
--
-- ══ POURQUOI, ET POURQUOI PAS LES AUTRES ══
--
-- Le webhook DocuSign n'écrivait alors que `statut_signature`, sans toucher au statut métier. Le
-- correctif date du 31/08/2026 18:18 (commit 16744d4, « Un contrat signé passait à Signé sans
-- quitter Nouveau ») : les contrats signés APRÈS — CT-01600 et CT-01603 — sont bien passés à
-- « À venir ». Ces deux-là ont été signés dix jours plus tôt, et personne n'est revenu les reprendre.
--
-- Ce n'est donc pas une panne en cours : c'est un reste. Mais un reste que personne ne pouvait
-- voir, faute de bloc de suivi visible sur un contrat déjà signé — corrigé le même jour.
--
-- ══ LA RÈGLE APPLIQUÉE EST CELLE DU CODE, PAS UNE AUTRE ══
--
-- `statutMetierContrat` (api/docusign/_decision.ts) : un contrat signé dont la fenêtre n'a pas
-- commencé est « À venir », un contrat en cours est « Actif », un contrat échu « Terminé », et sans
-- date de début il reste « Signé ». Réécrire cette règle en SQL avec une variante ferait divergre
-- la base et le code à la première signature suivante — c'est la même, à la lettre.
--
-- ══ ON NE FAIT AVANCER QUE CE QUI EST EN RETARD ══
--
-- Seuls « Nouveau », « En préparation » et « À signer » sont repris : ce sont les trois états qui
-- précèdent une signature. Un contrat « Résilié » ou « Annulé » ne redevient pas « Actif » parce
-- qu'il a été signé un jour — la résiliation est postérieure à la signature, et l'écraser
-- ressusciterait un contrat mort.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

update contrats c
   set statut_id = cible.id,
       date_modification = now()
  from statuts_contrats depart,
       statuts_contrats cible
 where c.statut_id = depart.id
   and depart.code in ('NOUVEAU', 'EN_PREPARATION', 'A_SIGNER')
   and c.statut_signature = 'SIGNE'
   and cible.code = case
         when c.date_debut is null then 'SIGNE'
         when c.date_debut > current_date then 'A_VENIR'
         when c.date_fin is not null and c.date_fin < current_date then 'TERMINE'
         else 'ACTIF'
       end;

-- ── GARDE-FOU : plus aucun contrat signé ne doit rester dans un état d'avant-signature ──
do $$
declare
  v_restants integer;
begin
  select count(*) into v_restants
    from contrats c
    join statuts_contrats s on s.id = c.statut_id
   where c.statut_signature = 'SIGNE'
     and s.code in ('NOUVEAU', 'EN_PREPARATION', 'A_SIGNER');

  if v_restants > 0 then
    raise exception 'Garde-fou : % contrat(s) signe(s) restent avant-signature', v_restants;
  end if;

  raise notice 'Garde-fou passe : aucun contrat signe ne reste en Nouveau, En preparation ou A signer.';
end $$;

commit;

-- Les statistiques du planificateur : deux lignes ne les déplacent pas, mais `contrats` est lue par
-- tous les écrans de portefeuille et la consigne du 07/09/2026 est de réanalyser après écriture.
analyze contrats;
