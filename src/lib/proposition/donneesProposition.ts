import { moleculePresentee } from '@/lib/calculs/prixOffre'
import { contratSecurise, pointsDesClauses } from '@/lib/offres/clauses'
import type { ClausesOffre, Compteur, OffreFournisseur, OffreFournisseurCompteur, VersionRecommandation } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES DONNÉES DE LA PROPOSITION COMMERCIALE, PRÊTES À AFFICHER
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Réunion du 30/09/2026 : William a validé avec Michel et les commerciaux un modèle de proposition
 * en trois pages (« Offre B v3 » pour le gaz, « Offre Electricite »). Naoëlle récupère les données ;
 * William fait le document. Ce module est la frontière entre les deux : il rend, pour une version,
 * EXACTEMENT les chiffres que le modèle affiche, dans ses unités. Le document n'a plus qu'à les poser.
 *
 * ══ LES FORMULES SONT CELLES DU MODÈLE, VÉRIFIÉES SUR SES PROPRES CHIFFRES ══
 *
 *   GAZ    abonnement = abonnement annuel                                    (336 = 28 €/mois × 12)
 *          énergie    = CAR × (molécule + CEE + CPB)                  (13 823 = 285 × 48,50, GME)
 *          taxes      = CAR × (TQD + accise) + CTA        (8 016 = 285 × (10,62 + 16,39) + 318)
 *
 *   ÉLEC   abonnement = abonnement annuel
 *          énergie    = Σ prix du poste × conso du poste + capacité × conso + CEE × conso
 *                                                               (63 047 € pour GME, au centime)
 *          TURPE      = le TURPE annuel
 *          taxes      = accise + CTA                          (12 715 = 22,50 × 510 + 1 240)
 *
 * Les tests (`propositionCommerciale.test.ts`) reprennent les lignes des deux PDF.
 *
 * ══ UN ÉCART AVEC LE BUDGET DE LA FICHE, À TRANCHER ══
 *
 * En électricité, l'« énergie » du modèle INCLUT la capacité et les CEE. `budgetsDepuisPrix` (règles
 * de Michel du 19/08/2026) ne les compte pas, et range l'abonnement DANS l'énergie. Ce module suit le
 * modèle validé le 30/09, le plus récent ; la fiche garde sa règle jusqu'à décision. Question posée
 * à William et Michel.
 *
 * ══ LES UNITÉS DU DOCUMENT NE SONT PAS CELLES DE LA BASE ══
 *
 *   abonnement   base en €/an         document en €/mois       ÷ 12
 *   accise élec  base en €/an         document en €/MWh        ÷ conso totale
 *   capacité     base par poste       document en un seul prix moyenne pondérée par la conso
 *
 * `null` partout où la donnée manque, jamais zéro : un prix absent n'est pas un prix gratuit.
 */

const POSTES_ELEC = ['POINTE', 'HPH', 'HCH', 'HPE', 'HCE', 'HP', 'HC', 'BASE'] as const

export interface PrixUnitairesGaz {
  abonnement_mois: number | null
  molecule: number | null
  cee: number | null
  cpb: number | null
  total_energie_mwh: number | null
  tqd: number | null
  accise: number | null
  cta_an: number | null
}

export interface PrixUnitairesElec {
  abonnement_mois: number | null
  par_poste: Record<string, number>
  capacite: number | null
  cee: number | null
  accise_mwh: number | null
  cta_an: number | null
}

export interface LigneComparatif {
  offreId: string
  fournisseur: string
  fournisseurCompteId: string | null
  typePrix: string | null
  dureeMois: number | null
  actuelle: boolean
  abonnement: number | null
  energie: number | null
  /** Électricité seulement. */
  turpe: number | null
  taxes: number | null
  total: number | null
  /** Contre l'offre actuelle : négatif = moins cher. `null` sans offre actuelle chiffrée. */
  ecartAn: number | null
  rang: number | null
  prixGaz: PrixUnitairesGaz | null
  prixElec: PrixUnitairesElec | null
  clauses: ClausesOffre & { contrat_securise: boolean }
  /** Le décompte sur lequel la note A→E se posera — la règle reste à fixer avec William. */
  pointsClauses: ReturnType<typeof pointsDesClauses>
  validite: string | null
  complete: boolean
}

function somme(...v: (number | null | undefined)[]): number | null {
  return v.reduce<number | null>((t, x) => (x == null ? t : (t ?? 0) + x), null)
}
const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100)

function detailSur(offre: OffreFournisseur, lienId: string): OffreFournisseurCompteur | undefined {
  return offre.details_par_compteur.find((d) => d.version_recommandation_compteur_id === lienId)
}

/** Une offre sur un compteur de gaz : prix unitaires et budgets, selon le modèle. */
export function ligneGaz(detail: OffreFournisseurCompteur | undefined, compteur: Compteur | undefined) {
  const g = detail?.prix_gaz
  const car = detail?.consommation_annuelle_reference_mwh ?? g?.car_reference_mwh ?? compteur?.car_mwh ?? null
  const molecule = g?.prix_energie_mwh ?? moleculePresentee(g?.prix_molecule_p0_mwh, detail?.marge_reelle_eur_mwh, detail?.type_marge ?? 'VARIABLE')
  const totalEnergie = molecule == null ? null : somme(molecule, g?.prix_cee_mwh, g?.prix_cpb_mwh)
  const prix: PrixUnitairesGaz = {
    abonnement_mois: g?.abonnement_fourniture_annuel_ht == null ? null : r2(g.abonnement_fourniture_annuel_ht / 12),
    molecule, cee: g?.prix_cee_mwh ?? null, cpb: g?.prix_cpb_mwh ?? null,
    total_energie_mwh: r2(totalEnergie),
    tqd: g?.prix_atrd_mwh ?? null, accise: g?.prix_agn_mwh ?? null, cta_an: g?.cta_annuel_ht ?? null,
  }
  const energie = car == null || totalEnergie == null ? null : car * totalEnergie
  const taxesMwh = somme(g?.prix_atrd_mwh, g?.prix_agn_mwh)
  const taxes = car == null || (taxesMwh == null && g?.cta_annuel_ht == null) ? null : (taxesMwh ?? 0) * car + (g?.cta_annuel_ht ?? 0)
  return { prix, abonnement: g?.abonnement_fourniture_annuel_ht ?? null, energie, taxes, turpe: null as number | null }
}

/** Une offre sur un compteur d'électricité : prix unitaires et budgets, selon le modèle. */
export function ligneElec(detail: OffreFournisseurCompteur | undefined, compteur: Compteur | undefined) {
  const e = detail?.prix_electricite
  const conso = compteur?.consoParClasseMwh ?? {}
  const volumeTotal = Object.values(conso).reduce((a, b) => a + (b ?? 0), 0) || compteur?.consommation_annuelle_mwh || null
  const parPoste: Record<string, number> = {}
  for (const poste of POSTES_ELEC) {
    const p0 = e?.p0_mwh_par_classe?.[poste]
    const presente = e?.prix_mwh_par_classe?.[poste] ?? moleculePresentee(p0, detail?.marge_reelle_eur_mwh, detail?.type_marge ?? 'VARIABLE')
    if (presente != null) parPoste[poste] = presente
  }
  let energiePostes: number | null = null
  for (const [poste, prix] of Object.entries(parPoste)) {
    const volume = conso[poste] ?? (Object.keys(parPoste).length === 1 ? volumeTotal : null)
    if (volume != null) energiePostes = (energiePostes ?? 0) + prix * volume
  }
  // LA CAPACITÉ EN UN PRIX : la base en a un par poste, le document un seul — la moyenne pondérée
  // par la consommation, ce qui redonne exactement le même budget.
  let capaBudget: number | null = null
  for (const [poste, prix] of Object.entries(e?.capacite_mwh_par_classe ?? {})) {
    const volume = conso[poste] ?? null
    if (prix != null && volume != null) capaBudget = (capaBudget ?? 0) + prix * volume
  }
  const capacite = capaBudget != null && volumeTotal ? capaBudget / volumeTotal : null
  const ceeBudget = e?.prix_cee_mwh != null && volumeTotal ? e.prix_cee_mwh * volumeTotal : null
  const prix: PrixUnitairesElec = {
    abonnement_mois: e?.abonnement_fourniture_annuel_ht == null ? null : r2(e.abonnement_fourniture_annuel_ht / 12),
    par_poste: parPoste,
    capacite: r2(capacite),
    cee: e?.prix_cee_mwh ?? null,
    accise_mwh: e?.accise_annuel_ht != null && volumeTotal ? r2(e.accise_annuel_ht / volumeTotal) : null,
    cta_an: e?.cta_annuel_ht ?? null,
  }
  return {
    prix,
    abonnement: e?.abonnement_fourniture_annuel_ht ?? null,
    energie: energiePostes == null ? null : somme(energiePostes, capaBudget, ceeBudget),
    turpe: e?.prix_turpe_annuel_ht ?? detail?.cout_acheminement_annuel_ht ?? null,
    taxes: somme(e?.accise_annuel_ht, e?.cta_annuel_ht) ?? detail?.cout_taxes_annuel ?? null,
  }
}

export interface DonneesProposition {
  energie: 'gaz' | 'electricite'
  /** « AO-2026-0418 » : la référence d'appel d'offres de la version. */
  reference: string | null
  /** « Valable jusqu'au » : la plus proche des validités d'offres, faute de quoi celle de la version. */
  validite: string | null
  consultation: string
  lignes: LigneComparatif[]
  meilleure: LigneComparatif | null
  actuelle: LigneComparatif | null
  economie: { an: number; mois: number; pourcentage: number; surDuree: number | null; dureeMois: number | null } | null
}

/**
 * Les données du comparatif pour une version. Les offres sont triées de la moins chère à la plus
 * chère ; l'offre ACTUELLE (nature « en cours », ou l'offre de référence) sert d'étalon et reste à part.
 */
export function donneesProposition(opts: {
  version: VersionRecommandation
  compteurs: Map<string, Compteur>
  offres: { offre: OffreFournisseur; fournisseurCompteId: string | null }[]
}): DonneesProposition {
  const { version, compteurs, offres } = opts
  const gaz = version.compteurs.some((l) => compteurs.get(l.compteur_id)?.type_energie === 'gaz')

  const lignes: LigneComparatif[] = offres
    .filter(({ offre }) => offre.statut !== 'INDISPONIBLE')
    .map(({ offre, fournisseurCompteId }) => {
      let abonnement: number | null = null, energie: number | null = null, turpe: number | null = null, taxes: number | null = null
      let prixGaz: PrixUnitairesGaz | null = null, prixElec: PrixUnitairesElec | null = null
      let complete = version.compteurs.length > 0
      for (const lien of version.compteurs) {
        const compteur = compteurs.get(lien.compteur_id)
        const detail = detailSur(offre, lien.lien_id)
        const l = compteur?.type_energie === 'gaz' ? ligneGaz(detail, compteur) : ligneElec(detail, compteur)
        if (l.energie == null) complete = false
        abonnement = somme(abonnement, l.abonnement); energie = somme(energie, l.energie)
        turpe = somme(turpe, l.turpe); taxes = somme(taxes, l.taxes)
        // Les prix unitaires affichés sont ceux du premier compteur : le modèle est monosite, un
        // multisite passera par une annexe (William, 30/09 : « il faudra créer une annexe »).
        if ('molecule' in l.prix) prixGaz ??= l.prix; else prixElec ??= l.prix
      }
      const clauses = offre.clauses ?? { tacite_reconduction: true, depot_garantie: false, engagement_consommation: false, renegociation_anticipee: false, swap: false }
      return {
        offreId: offre.id,
        fournisseur: offre.fournisseur_nom,
        fournisseurCompteId,
        // « Indexé PEG » : le type de prix, suivi de l'indice quand l'offre est indexée.
        typePrix: [offre.type_prix, contratSecurise(offre.type_prix) ? null : offre.indice_indexation].filter(Boolean).join(' ') || null,
        dureeMois: offre.duree_mois,
        actuelle: offre.nature_offre === 'EN_COURS' || (offre.est_offre_reference && offre.nature_offre !== 'PROPOSEE'),
        abonnement: r2(abonnement), energie: r2(energie), turpe: r2(turpe), taxes: r2(taxes),
        total: complete ? r2(somme(abonnement, energie, turpe, taxes)) : null,
        ecartAn: null, rang: null,
        prixGaz, prixElec,
        clauses: { ...clauses, contrat_securise: contratSecurise(offre.type_prix) },
        pointsClauses: pointsDesClauses(clauses, offre.type_prix),
        validite: offre.date_validite?.slice(0, 10) ?? null,
        complete,
      }
    })

  const actuelle = lignes.find((l) => l.actuelle && l.total != null) ?? null
  const proposees = lignes.filter((l) => !l.actuelle).sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))
  proposees.forEach((l, i) => {
    if (l.total != null) l.rang = i + 1
    if (actuelle?.total != null && l.total != null) l.ecartAn = r2(l.total - actuelle.total)
  })
  const meilleure = proposees.find((l) => l.total != null) ?? null
  const validites = proposees.map((l) => l.validite).filter((v): v is string => Boolean(v)).sort()

  let economie: DonneesProposition['economie'] = null
  if (actuelle?.total != null && meilleure?.total != null && meilleure.total < actuelle.total) {
    const an = actuelle.total - meilleure.total
    economie = {
      an: r2(an)!, mois: r2(an / 12)!, pourcentage: Math.round((an / actuelle.total) * 1000) / 10,
      surDuree: meilleure.dureeMois ? r2((an * meilleure.dureeMois) / 12) : null, dureeMois: meilleure.dureeMois,
    }
  }

  return {
    energie: gaz ? 'gaz' : 'electricite',
    reference: version.reference_appel_offres ?? null,
    validite: validites[0] ?? null,
    consultation: version.date_creation.slice(0, 10),
    lignes: [...(actuelle ? [actuelle] : []), ...proposees],
    meilleure, actuelle, economie,
  }
}
