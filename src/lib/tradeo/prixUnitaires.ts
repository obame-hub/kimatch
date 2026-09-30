/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES PRIX UNITAIRES DANS UNE RÉPONSE DE CALCUL TRADEO
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, réunion du 28/09/2026 : « faut faire très attention à ne pas récupérer des budgets parce
 * que certains fournisseurs vont utiliser une consommation, d'autres vont utiliser une autre ».
 * Le budget se recalcule dans Kimatch ; ce qu'il faut sortir de Tradeo, ce sont les PRIX.
 *
 * Or `calculer-budget-energie` est d'abord une route de budget. Les prix y sont, mais à trois
 * endroits selon la forme de l'offre :
 *
 *   · offre annuelle (`typePrix: "annuelle"`) : une clé par période « AAAA-MM-JJ->AAAA-MM-JJ »,
 *     chacune avec `dataMoyenne.lesPrixFinal` — c'est le prix de CETTE année ;
 *   · `lesPrix` : la moyenne sur toute la durée, quand Tradeo la donne ;
 *   · à la racine de l'offre (`prixMolucule` — sic — `prixHp`…) pour les offres simples.
 *
 * Une offre qui ne porte AUCUN de ces champs est signalée `sansPrixUnitaire` au lieu d'être
 * complétée : c'est exactement le cas que la règle de William interdit d'utiliser, et le dire est
 * la seule façon de le savoir. Dans l'exemple de la documentation v1.4, SaveEnergies est dans ce
 * cas — seulement un budget.
 *
 * CE MODULE NE CALCULE PAS DE P0. Tradeo applique une marge (`margeAppliquer`, `preMarge`) dont la
 * documentation ne dit ni l'unité ni si elle est déjà dans le prix rendu. `comparerMarges` sert à le
 * mesurer : deux calculs, deux marges, et l'on regarde si le prix bouge d'autant.
 */

export type Energie = 'ELEC' | 'GAZ'

export interface PeriodePrix {
  debut: string | null
  fin: string | null
  /** Chaque prix rendu, sous son nom Tradeo (`prixHp`, `prixMolecule`, `abo`, `cee`…). */
  prix: Record<string, number>
  margeAppliquee: number | null
  preMarge: number | null
}

export interface OffreTradeo {
  numCompteur: string
  fournisseur: string
  typeFournisseur: string | null
  typeOffre: string | null
  succes: boolean
  message: string | null
  actuel: boolean
  budgetHt: number | null
  budgetTtc: number | null
  marge: number | null
  debut: string | null
  fin: string | null
  dureeMois: number | null
  /** Une par année pour une offre annuelle, une seule sinon. Vide si Tradeo n'a rendu aucun prix. */
  periodes: PeriodePrix[]
  /** La moyenne sur la durée (`lesPrix`), quand Tradeo la donne. */
  prixMoyens: Record<string, number> | null
  sansPrixUnitaire: boolean
  /**
   * LES COMPOSANTES RÉGLEMENTÉES DU GAZ, telles que Tradeo les applique — identiques pour tous les
   * fournisseurs d'un même compteur (`resultatFinal.dataCta`, repris à la racine d'une offre
   * annuelle). Noms Tradeo : `ARTD` (l'ATRD, part variable en €/MWh — la « TQD » de la
   * proposition), `TICGN` (l'accise sur le gaz, €/MWh), `CTA` (€/an). `null` en électricité : la
   * documentation v1.4 ne rend ni TURPE, ni accise, ni CTA pour elle.
   */
  reglementaire: { atrd: number | null; accise: number | null; cta: number | null } | null
  /** Le type de capacité en électricité : `Valeur` (€/MWh), `Coef` (coefficient) ou `Inclus`. */
  typeCapa: string | null
  brut: Record<string, unknown>
}

const CLE_PERIODE = /^\d{4}-\d{2}-\d{2}->\d{4}-\d{2}-\d{2}$/

/** Les champs qui sont des PRIX. `prixMolucule` est la faute de frappe de Tradeo, rangée sous le bon nom. */
function estChampPrix(cle: string): boolean {
  return /^prix/i.test(cle) || cle === 'abo' || cle === 'cee'
}
function nomPrix(cle: string): string {
  return cle === 'prixMolucule' ? 'prixMolecule' : cle
}

function nombre(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function texte(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function lirePrix(objet: Record<string, unknown> | undefined | null): Record<string, number> {
  const prix: Record<string, number> = {}
  if (!objet) return prix
  for (const [cle, valeur] of Object.entries(objet)) {
    if (!estChampPrix(cle)) continue
    const n = nombre(valeur)
    if (n !== null) prix[nomPrix(cle)] = n
  }
  return prix
}

function lireOffre(numCompteur: string, o: Record<string, unknown>, dataCta?: Record<string, unknown>): OffreTradeo {
  const periodes: PeriodePrix[] = []

  const clesPeriodes = Array.isArray(o.lesCleAnnuelleDesPeriode)
    ? (o.lesCleAnnuelleDesPeriode as string[])
    : Object.keys(o).filter((k) => CLE_PERIODE.test(k))
  for (const cle of clesPeriodes) {
    const bloc = (o[cle] as { dataMoyenne?: Record<string, unknown> } | undefined)?.dataMoyenne
    if (!bloc) continue
    const final = bloc.lesPrixFinal as Record<string, unknown> | undefined
    const [debut, fin] = cle.split('->')
    periodes.push({
      debut: texte(final?.dateDebut) ?? debut,
      fin: texte(final?.dateFin) ?? fin,
      prix: lirePrix(final),
      margeAppliquee: nombre(final?.margeAppliquer ?? bloc.margeAppliquer),
      preMarge: nombre(final?.preMarge),
    })
  }

  const prixMoyens = o.lesPrix && typeof o.lesPrix === 'object' ? lirePrix(o.lesPrix as Record<string, unknown>) : null

  /* OFFRE SIMPLE : les prix sont à la racine. On ne les lit que s'il n'y a pas de périodes, sinon
     on mélangerait la moyenne (`prixMolucule` à la racine d'une offre annuelle) aux prix annuels. */
  if (periodes.length === 0) {
    const prix = lirePrix(o)
    if (Object.keys(prix).length > 0) {
      periodes.push({
        debut: texte(o.dateDebut),
        fin: texte(o.dateFin),
        prix,
        margeAppliquee: nombre(o.margeAppliquer ?? o.marge),
        preMarge: nombre(o.preMarge),
      })
    }
  }

  const succes = o.success !== false
  const sansPrix = periodes.every((p) => Object.keys(p.prix).length === 0) && !(prixMoyens && Object.keys(prixMoyens).length > 0)

  return {
    numCompteur,
    fournisseur: texte(o.fournisseur) ?? texte(o.nomFournisseur) ?? '(sans nom)',
    typeFournisseur: texte(o.typeFournisseur),
    typeOffre: texte(o.typeOffre),
    succes,
    message: texte(o.message),
    actuel: o.actuel === true || o.typeFournisseur === 'actuel',
    budgetHt: nombre(o.budgetHt),
    budgetTtc: nombre(o.budgetTTC ?? o.BudgetTTC),
    marge: nombre(o.marge),
    debut: texte(o.dateDebut),
    fin: texte(o.dateFin),
    dureeMois: nombre(o.DUREE ?? o.duree),
    periodes,
    prixMoyens: prixMoyens && Object.keys(prixMoyens).length > 0 ? prixMoyens : null,
    sansPrixUnitaire: succes && sansPrix,
    reglementaire: (() => {
      const src = { ...(dataCta ?? {}), ...Object.fromEntries(['ARTD', 'TICGN', 'CTA'].filter((k) => o[k] != null).map((k) => [k, o[k]])) }
      const atrd = nombre(src.ARTD), accise = nombre(src.TICGN), cta = nombre(src.CTA)
      return atrd == null && accise == null && cta == null ? null : { atrd, accise, cta }
    })(),
    typeCapa: texte(o.typeCapa)
      ?? texte((clesPeriodes.map((k) => (o[k] as { dataMoyenne?: { lesPrixFinal?: { typeCapa?: unknown } } } | undefined)?.dataMoyenne?.lesPrixFinal?.typeCapa).find(Boolean)))
      ?? null,
    brut: o,
  }
}

/**
 * Lit la réponse de `calculer-budget-energie`. Accepte la réponse entière
 * (`{ "GI110001": { result, resultatFinal } }`) comme l'enveloppe du banc (`{ reponse: … }`).
 */
export function lireOffresTradeo(reponse: unknown): { offres: OffreTradeo[]; erreurs: { numCompteur: string; message: string }[] } {
  const offres: OffreTradeo[] = []
  const erreurs: { numCompteur: string; message: string }[] = []
  if (!reponse || typeof reponse !== 'object') return { offres, erreurs }

  for (const [num, bloc] of Object.entries(reponse as Record<string, unknown>)) {
    if (!bloc || typeof bloc !== 'object') continue
    const b = bloc as { result?: unknown; message?: unknown; resultatFinal?: { result?: Record<string, unknown>; dataCta?: Record<string, unknown> } }
    if (b.result === false) {
      erreurs.push({ numCompteur: num, message: texte(b.message) ?? 'Tradeo a refusé ce compteur.' })
      continue
    }
    const parCompteur = b.resultatFinal?.result ?? {}
    for (const [numInterne, liste] of Object.entries(parCompteur)) {
      if (!Array.isArray(liste)) continue
      for (const o of liste) {
        if (o && typeof o === 'object') offres.push(lireOffre(numInterne || num, o as Record<string, unknown>, b.resultatFinal?.dataCta))
      }
    }
  }
  return { offres, erreurs }
}

export interface EcartMarge {
  numCompteur: string
  fournisseur: string
  periode: string
  champ: string
  prixA: number
  prixB: number
  ecartPrix: number
  /** `ecartPrix − (margeB − margeA)`. Proche de zéro : la marge est dans le prix, en €/MWh. */
  residu: number
}

/**
 * Compare deux calculs lancés avec deux marges différentes, fournisseur par fournisseur. C'est la
 * preuve qui manque à la documentation : si le prix bouge exactement de l'écart de marge, la marge
 * est incluse dans le prix rendu, et le P0 s'obtient en la retirant.
 */
export function comparerMarges(a: OffreTradeo[], b: OffreTradeo[], margeA: number, margeB: number): EcartMarge[] {
  const ecarts: EcartMarge[] = []
  const indexB = new Map(b.map((o) => [`${o.numCompteur}|${o.fournisseur}|${o.typeOffre ?? ''}`, o]))
  for (const oa of a) {
    const ob = indexB.get(`${oa.numCompteur}|${oa.fournisseur}|${oa.typeOffre ?? ''}`)
    if (!ob) continue
    oa.periodes.forEach((pa, i) => {
      const pb = ob.periodes[i]
      if (!pb) return
      for (const [champ, prixA] of Object.entries(pa.prix)) {
        const prixB = pb.prix[champ]
        if (prixB === undefined || champ === 'abo' || champ === 'cee') continue
        const ecartPrix = prixB - prixA
        ecarts.push({
          numCompteur: oa.numCompteur,
          fournisseur: oa.fournisseur,
          periode: `${pa.debut ?? '?'} → ${pa.fin ?? '?'}`,
          champ,
          prixA,
          prixB,
          ecartPrix: arrondir(ecartPrix),
          residu: arrondir(ecartPrix - (margeB - margeA)),
        })
      }
    })
  }
  return ecarts
}

function arrondir(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * Rapproche un nom de fournisseur Tradeo (`Gaz_de_Bordeaux`, `la_bellenergie`, `SaveEnergies`) d'un
 * compte fournisseur Kimatch (`GAZ DE BORDEAUX`, `LA BELLENERGIE`, `SAVE`). Les deux listes n'ont
 * pas été écrites par les mêmes personnes : on compare sans accents, sans séparateurs, et l'on
 * accepte qu'un nom commence par l'autre — mais pas en dessous de quatre lettres, où « EDF » finirait
 * par coller à « EDFENR ».
 */
export function compacterNom(nom: string): string {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function rapprocherFournisseur<T extends { nom: string }>(nomTradeo: string, fournisseurs: T[]): T | null {
  const cible = compacterNom(nomTradeo)
  if (!cible) return null
  const exact = fournisseurs.find((f) => compacterNom(f.nom) === cible)
  if (exact) return exact
  const candidats = fournisseurs.filter((f) => {
    const n = compacterNom(f.nom)
    const court = n.length < cible.length ? n : cible
    return court.length >= 4 && (n.startsWith(cible) || cible.startsWith(n))
  })
  return candidats.length === 1 ? candidats[0] : null
}
