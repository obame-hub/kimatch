-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- AUCUN FOURNISSEUR NE BUTE PLUS AVANT 2031
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 14/09/2026 : « il faut que tous les fournisseurs qui ont une date max inférieure ou
-- égale au 01/01/2030 doivent passer au 01/01/2031 », puis, après vérification de la donnée :
-- « les 8 → tout ce qui est ≤ 31/12/2030 passe au 01/01/2031 ».
--
-- ══ POURQUOI LE SEUIL A BOUGÉ ENTRE LA DEMANDE ET L'APPLICATION ══
--
-- Pris au mot, le seuil du 01/01/2030 n'aurait touché que TROIS fournisseurs — GEDIA, OHM ENERGIE
-- et TOTAL ENERGIES, tous au 31/12/2029. Aucun fournisseur n'est exactement au 01/01/2030.
--
-- Mais CINQ AUTRES étaient au 31/12/2030, et ce sont précisément ceux que le problème décrit
-- écarte. `src/lib/eligibility.ts` compare la fin de fourniture calculée à cette date : un compteur
-- à échéance 01/01/2027 consulté sur 48 mois finit au 01/01/2031, et un fournisseur plafonné au
-- 31/12/2030 devient inéligible POUR UN JOUR. Quatre fournisseurs — SEFE, ENERGEM, PRIMEO, GAZEL —
-- étaient d'ailleurs déjà au 01/01/2031, ce qui ressemblait à un alignement commencé à la main.
--
-- Les huit concernés, vérifiés en essai à blanc avant application :
--   ENDESA, GAZ EUROPEEN, GEG, GME FRANCE, MET ENERGIE  (31/12/2030)
--   GEDIA, OHM ENERGIE, TOTAL ENERGIES                   (31/12/2029)
--
-- ══ CE QUI N'EST PAS TOUCHÉ ══
--
-- Les 35 fournisseurs sans `max_dff` : une date absente n'est pas une date basse, et le moteur
-- d'éligibilité n'applique tout simplement pas le critère — ils ne sont bloqués par rien. Leur
-- poser une date les soumettrait à une limite qu'ils n'avaient pas.
--
-- `max_ddf`, la date de DÉBUT de fourniture maximale, n'est renseignée que sur PRIMEO et GAZEL
-- (01/01/2029). C'est un autre critère, une autre question : elle reste en l'état.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare cibles int;
begin
  select count(*) into cibles
    from comptes_fournisseurs
   where max_dff <= date '2030-12-31';

  if cibles <> 8 then
    raise exception 'Attendu 8 fournisseurs à repousser, trouvé % — la donnée a bougé depuis la mesure du 14/09/2026.', cibles;
  end if;
end $$;

update comptes_fournisseurs
   set max_dff = date '2031-01-01'
 where max_dff <= date '2030-12-31';

commit;

-- ══ CONTRÔLE APRÈS APPLICATION ══
--
--   select f.max_dff, count(*) from comptes_fournisseurs f where f.max_dff is not null
--    group by 1 order by 1;
--   -- appliqué le 14/09/2026 : 01/01/2031 → 12 fournisseurs, 31/12/2031 → 1 (ILEK),
--   --                          01/01/2032 → 2 (SAVE, SELIA), 01/04/2032 → 1 (PICOTY)
