-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA SEULE MARGE FIXE SAISIE COMME UN FORFAIT
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Jusqu'au 03/09/2026, l'écran de saisie des prix annonçait « Marge fixe (durée totale) », en euros,
-- et son aide insistait : « ni au mégawattheure, ni par an ». C'était la règle rapportée par Naoëlle
-- le 20/08 et confirmée par Michel le 21/08.
--
-- William l'a corrigée le 03/09 : « une marge fixe c'est en €/MWh du style 4 €/MWh. Donc y'a pas de
-- montant de l'affaire sans calcul. » Naoëlle a tranché : « fais ce que William dit, il est mieux
-- renseigné que Michel. » Le champ est donc désormais un prix au mégawattheure, et le montant de
-- l'affaire le multiplie par le volume et la durée.
--
-- ── CE QUE LE CHANGEMENT D'UNITÉ FAIT AUX VALEURS DÉJÀ SAISIES ──
--
-- Toute la base compte DEUX marges fixes renseignées, aucune sur une offre retenue :
--
--   120 €  TOTAL ENERGIES  36 mois  227 MWh   CABINET MOLINIER - SDC LE FONTENAY
--     6 €  GAZ EUROPEEN    33 mois    8 MWh   KIWEE ENERGIE FRANCE - TEST TEST TEST TEST
--
-- Le 6 est plausible tel quel : 6 €/MWh est exactement l'ordre de grandeur que William décrit, et la
-- ligne vit sur une cotation de test. On n'y touche pas.
--
-- Le 120 ne l'est pas. Lu au mégawattheure, il vaudrait 227 ÷ 12 × 36 × 120 × 50 % = 40 860 € de
-- montant d'affaire là où le forfait qu'on croyait saisir en valait 120. L'offre n'est pas retenue,
-- donc rien n'en dépend aujourd'hui — mais il suffit qu'on la retienne pour qu'un tableau de bord
-- affiche quarante mille euros de rien.
--
-- ── POURQUOI ON EFFACE PLUTÔT QUE DE CONVERTIR ──
--
-- La conversion serait 120 € ÷ 681 MWh = 0,176 €/MWh. Elle suppose que la personne pensait bien à un
-- forfait pour trois ans, ce que rien ne prouve : l'écran disait « durée totale », mais on ne sait pas
-- ce qu'elle avait dans son propre carnet. Inventer 0,176 €/MWh donnerait un chiffre précis, faux et
-- indiscutable — le pire des trois.
--
-- Un champ vide, lui, se voit : la fiche dira « l'offre retenue n'a pas de marge saisie » si un jour
-- on la retient, et quelqu'un ira demander le vrai chiffre au fournisseur. L'ancienne valeur reste
-- écrite dans le commentaire de la ligne, avec sa date, pour qu'on puisse la retrouver.
--
-- ── L'ÉCRAN ALERTE DÉJÀ, INDÉPENDAMMENT DE CETTE MIGRATION ──
--
-- L'aide du champ signale toute marge fixe au-delà de 20 €/MWh comme un probable ancien forfait. Elle
-- suit la valeur et non la date de saisie : elle protège donc aussi des reprises de données à venir,
-- là où cette migration ne règle que le passé.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  n_touchees integer;
  v_marge numeric;
begin
  -- GARDE-FOU. On ne corrige QUE la ligne constatée, identifiée par son id et sa valeur. Si elle a
  -- changé entre l'écriture de cette migration et son application — quelqu'un l'a corrigée à la main,
  -- ou l'offre a été supprimée — la migration s'arrête au lieu de deviner.
  select marge_fixe_eur into v_marge
  from offres_fournisseurs_compteurs
  where id = '0b729d81-d44c-4109-8cb8-300795c1d115';

  if v_marge is null then
    raise exception 'La ligne visée n''a plus de marge fixe : quelqu''un est passé avant. Rien à faire.';
  end if;
  if v_marge <> 120 then
    raise exception 'La ligne visée porte % et non 120 : la situation a changé, à revoir à la main.', v_marge;
  end if;

  update offres_fournisseurs_compteurs
     set marge_fixe_eur = null,
         commentaire = trim(both E' \n' from
           coalesce(commentaire, '')
           || E'\n[03/09/2026] Marge fixe effacée : 120 avait été saisi comme un forfait en euros pour '
           || 'toute la durée, sous l''ancienne définition du champ. Le champ est désormais un prix au '
           || 'mégawattheure (règle de William), où 120 vaudrait 40 860 € de montant d''affaire. '
           || 'Valeur à redemander au fournisseur.'),
         date_modification = now()
   where id = '0b729d81-d44c-4109-8cb8-300795c1d115';

  get diagnostics n_touchees = row_count;
  raise notice 'Marge fixe effacée sur % ligne (TOTAL ENERGIES, CABINET MOLINIER - SDC LE FONTENAY).', n_touchees;

  -- On vérifie aussi qu'aucune AUTRE marge fixe suspecte n'est apparue entre-temps : l'écran alerte
  -- au-delà de 20 €/MWh, autant le dire ici à celui qui applique.
  select count(*) into n_touchees
  from offres_fournisseurs_compteurs
  where type_marge = 'FIXE' and marge_fixe_eur > 20;
  if n_touchees > 0 then
    raise notice 'ATTENTION : % autre(s) marge(s) fixe(s) au-delà de 20 €/MWh — probablement d''anciens forfaits eux aussi.', n_touchees;
  end if;
end $$;

commit;
