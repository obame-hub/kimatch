-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE PÉRIMÈTRE D'UN CONTRAT DIT CE QUI EST CAPTÉ ET CE QUI EST RENOUVELÉ
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 25/09/2026, pour la fiche de suivi : « Captation ou renouvellement — si dans le contrat
-- c'était des compteurs préalablement client, alors c'est du renouvellement, alors que si c'était
-- des prospects, c'est de la captation. »
--
-- ══ LA RÈGLE, ÉCRITE UNE FOIS ══
--
-- Un compteur est RENOUVELÉ quand un contrat ANTÉRIEUR — un autre contrat, commençant avant
-- celui-ci — le portait déjà. Il est CAPTÉ sinon. Le contrat, lui, est un renouvellement dès qu'un
-- seul de ses compteurs l'est : on ne perd pas un cabinet qu'on avait déjà.
--
-- ══ CE QUE ÇA DONNE, MESURÉ ══
--
-- Sur les 1 583 suivis : 298 renouvellements, 1 242 captations, et 43 suivis dont le contrat ne
-- porte AUCUN compteur — ceux-là n'ont pas de nature, et l'écran doit le dire au lieu de les
-- compter en captation par défaut.
--
-- ══ POURQUOI UNE VUE, ET PAS UN CALCUL DANS L'ÉCRAN ══
--
-- Parce que la question se reposera : dans un rapport, dans le cockpit, dans un export. Une règle
-- métier recopiée dans deux écrans finit toujours par diverger — c'est ce qui est arrivé aux deux
-- « Montant » d'une recommandation. Ici elle est écrite une fois, au même endroit que les données.
--
-- `security_invoker = true` : la vue s'exécute avec les droits de l'appelant, donc les policies de
-- `contrats`, `compteurs` et `contrats_compteurs` s'appliquent. Sans cela elle contournerait le
-- cloisonnement partenaire posé le 24/09/2026 — exactement ce que la migration de ce jour-là a
-- corrigé sur cinq vues.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace view public.v_perimetre_contrat
with (security_invoker = true)
as
select
  cc.contrat_id,
  m.id                              as compteur_id,
  m.numero_point,
  m.libelle,
  m.libelle_site,
  m.consommation_annuelle_mwh,
  m.date_echeance,
  m.compte_id,
  te.code                           as energie_code,
  te.libelle                        as energie_libelle,
  f.nom                             as fournisseur_nom,
  m.fournisseur_actuel_compte_id    as fournisseur_compte_id,
  /* ── LE DRAPEAU ──
     Un contrat antérieur portait-il déjà ce compteur ? `date_debut` fait foi plutôt que la date de
     signature : c'est la prise d'effet qui dit qui fournissait le client, et deux contrats signés
     le même jour ne se départagent que par elle. */
  exists (
    select 1
      from public.contrats_compteurs cc2
      join public.contrats ant on ant.id = cc2.contrat_id
     where cc2.compteur_id = m.id
       and ant.id <> cc.contrat_id
       and ant.date_debut < c.date_debut
  )                                 as deja_client
from public.contrats_compteurs cc
join public.contrats  c  on c.id = cc.contrat_id
join public.compteurs m  on m.id = cc.compteur_id
left join public.types_energies te on te.id = m.type_energie_id
left join public.comptes f on f.id = m.fournisseur_actuel_compte_id;

comment on view public.v_perimetre_contrat is
  'Les compteurs d''un contrat, avec ce qu''il faut pour les lire sur une fiche de suivi, et le '
  'drapeau deja_client : vrai quand un contrat anterieur portait deja ce compteur (renouvellement), '
  'faux sinon (captation). Regle posee le 25/09/2026 ; voir la migration du meme nom.';
