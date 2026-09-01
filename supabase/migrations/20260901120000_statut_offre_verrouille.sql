-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE STATUT D'UNE OFFRE NE PEUT PLUS PRENDRE N'IMPORTE QUELLE VALEUR
--
-- Trouvé en retirant la propagation consultation → offre le 01/09/2026 : le code applicatif faisait
-- la même chose que le déclencheur, et PIRE.
--
-- `useChangerStatutConsultation` écrivait sur les offres du fournisseur :
--
--     consultation ACCEPTEE  →  offres 'ACCEPTEE'
--     consultation REFUSEE   →  offres 'REFUSEE'
--
-- Or une offre n'a que TROIS statuts : EN_ATTENTE, DISPONIBLE, INDISPONIBLE. « ACCEPTEE » et
-- « REFUSEE » n'appartiennent pas à son vocabulaire — ce sont ceux de la CONSULTATION. Le code
-- recopiait le statut d'un objet dans un autre qui ne parle pas la même langue.
--
-- ══ ET RIEN NE L'EN EMPÊCHAIT ══
--
-- `offres_fournisseurs` porte quatre contraintes CHECK — sur la durée, le pourcentage d'économie,
-- la nature, le prix — mais AUCUNE sur `statut`. La colonne acceptait n'importe quelle chaîne.
--
-- Mesuré ce jour : 61 offres, dont **une porte encore 'REFUSEE'**. Une seule, parce que le geste est
-- rare — mais elle suffit à fausser le nouveau calcul, qui compte les offres EN_ATTENTE et
-- DISPONIBLE : une offre 'REFUSEE' n'est ni l'une ni l'autre, donc elle poussait silencieusement sa
-- consultation vers « Demande refusée ».
--
-- ══ TROIS NIVEAUX, PARCE QU'UN SEUL NE TIENT PAS ══
--
--   1. la donnée      l'offre égarée retrouve le bon statut
--   2. la contrainte  la colonne refuse désormais tout ce qui n'est pas l'un des trois codes
--   3. le code        la répercussion est retirée de `useChangerStatutConsultation` (autre commit)
--
-- Réparer sans contraindre laisserait le prochain clic recommencer. Contraindre sans réparer ferait
-- échouer la migration sur la ligne existante.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. L'offre égarée ──
-- 'REFUSEE' au niveau d'une offre voulait dire « ce fournisseur ne propose rien ici » : c'est
-- exactement INDISPONIBLE dans le vocabulaire de l'offre. On traduit, on n'invente pas.
update public.offres_fournisseurs
   set statut = 'INDISPONIBLE', date_modification = now()
 where statut = 'REFUSEE';

-- 'ACCEPTEE' n'a laissé aucune ligne aujourd'hui, mais le même chemin pouvait l'écrire : au niveau
-- d'une offre, « le fournisseur a accepté de coter » se dit DISPONIBLE.
update public.offres_fournisseurs
   set statut = 'DISPONIBLE', date_modification = now()
 where statut = 'ACCEPTEE';

-- ── 2. La contrainte ──
alter table public.offres_fournisseurs drop constraint if exists offres_fournisseurs_statut_check;
alter table public.offres_fournisseurs add constraint offres_fournisseurs_statut_check check (
  statut is null or statut in ('EN_ATTENTE', 'DISPONIBLE', 'INDISPONIBLE')
);

-- ── 3. Les consultations concernées se recalculent ──
-- Sans ça, celle qui portait l'offre égarée garderait le statut déduit d'une donnée fausse.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select distinct f.optimisation_fournisseur_id
      from public.offres_fournisseurs f
     where f.actif and f.optimisation_fournisseur_id is not null
  loop
    perform public.recalculer_statut_consultation(v_id);
  end loop;
end;
$$;

commit;
