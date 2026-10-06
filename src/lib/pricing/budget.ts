/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE BUDGET D'UNE OFFRE, TEL QUE LE COMPARATIF LE PRÉSENTE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Les formules sont celles des deux comparatifs que William a dessinés le 01/10/2026
 * (`Offre B v3.pdf` au gaz, `Offre Electricite.pdf`), vérifiées à l'euro sur leurs chiffres —
 * `__tests__/budgetPricing.test.ts` les rejoue.
 *
 *   GAZ    molécule présentée = P0 + marge
 *          total €/MWh        = molécule présentée + CEE + CPB
 *          abonnement         = abonnement €/mois × 12
 *          énergie            = CAR × total €/MWh (CPB compris, 06/10/2026)
 *          acheminement       = CAR × TQD
 *          taxes              = CAR × accise AG + CTA
 *          budget             = abonnement + énergie + taxes
 *
 *   ÉLEC   prix présenté d'un poste = P0 du poste + marge
 *          abonnement         = abonnement €/mois × 12
 *          énergie            = Σ conso du poste × prix présenté + conso totale × (capacité + CEE)
 *          TURPE              = le TURPE du PDL, €/an
 *          taxes              = conso totale × accise AE + CTA
 *          budget             = abonnement + énergie + TURPE + taxes
 *
 * TQD, accise, CTA et TURPE sont « identiques pour tous » les fournisseurs. William, 01/10/2026 :
 * « supprime complètement le concept du bloc communs, je vais te proposer plus tard un fonctionnement
 * plus solide et sans aucune saisie ». En attendant, ils ne se saisissent plus nulle part ; inconnus,
 * ils comptent pour zéro, et le budget s'entend hors acheminement et taxes.
 *
 * ══ CHAQUE PRIX SAISI COMPTE ══
 * William, même jour : « chaque renseignement de prix doit participer au calcul des budgets ». Une
 * case vide compte pour zéro, et le budget se construit au fil de la saisie ; `complet` dit si toutes
 * les cases propres à l'offre sont remplies. Seul un budget complet se classe, se compare à la
 * référence et s'écrit en base. `null` seulement quand rien n'est saisi, ou sans volume.
 *
 * Les montants sont arrondis au centime (« deux décimales maximum »).
 */

export const POSTES_ELEC = ['POINTE', 'HPH', 'HCH', 'HPE', 'HCE', 'HP', 'HC', 'BASE'] as const

/**
 * ══ LA CAPACITÉ, 2 €/MWh POUR TOUT LE MONDE — William, 06/10/2026 ══
 * « Les CAPA c'est un peu spécial et les prix par API ne retranscrivent pas exactement la réalité.
 * Pour l'instant, les CAPA sont fixées à 2 €/MWh par défaut, pour tout le monde. » Une case vide
 * vaut 2 ; la lecture d'une proposition (IA ou API Tradéo) ne reprend plus la capacité lue.
 */
export const CAPACITE_DEFAUT_MWH = 2

/** Les communs du gaz : TQD, AG (accise), CTA et CPB — tous fixés par la réglementation, lus en base. */
export interface CommunsGaz { car: number | null; tqd: number | null; accise: number | null; cta: number | null; cpb?: number | null }
/**
 * CE QUE LE P0 INCLUT DÉJÀ — William, 02/10/2026 : « sur une facture ENDESA (offre actuelle), est inclus
 * dans le même prix le P0 + TQd + CEE + CPB […] si c'est inclus, il ne faut pas prendre en compte ce qui
 * est inclus dans le calcul final, de peur de calculer deux fois une même composante. » Rien par défaut.
 */
export type ComposanteIncluse = 'CEE' | 'TQD' | 'CPB' | 'ACCISE' | 'CAPACITE'
/* Sans l'accise au gaz — William, 05/10/2026 : « le "+" dans le P0 en gaz ne doit pas proposer
   "Accise" ». Aucune offre ne l'avait cochée ; le calcul la sait toujours retirer, le cas échéant. */
export const INCLUSIONS_GAZ: ComposanteIncluse[] = ['CEE', 'TQD', 'CPB']
export const INCLUSIONS_ELEC: ComposanteIncluse[] = ['CEE', 'CAPACITE']
export const LIBELLE_INCLUSION: Record<ComposanteIncluse, string> = { CEE: 'CEE', TQD: 'TQD', CPB: 'CPB', ACCISE: 'Accise', CAPACITE: 'Capacité' }

export interface SaisieGaz { abonnementMois: number | null; p0: number | null; marge: number | null; cee: number | null; cpb: number | null; inclus?: string[] }

export interface CommunsElec {
  /** Conso par poste, en MWh — seuls les postes que le compteur consomme. */
  conso: Record<string, number>
  turpe: number | null
  accise: number | null
  cta: number | null
}
export interface SaisieElec {
  abonnementMois: number | null
  /** P0 par poste, hors marge, €/MWh. */
  p0: Record<string, number | null>
  marge: number | null
  capacite: number | null
  cee: number | null
  inclus?: string[]
}

export interface BudgetOffre {
  abonnement: number
  energie: number
  /** TURPE en électricité, 0 au gaz. */
  turpe: number
  /** L'acheminement : le TURPE en électricité, CAR × TQD au gaz. */
  acheminement: number
  /** Les taxes : conso × AE (+ CTA) en électricité ; CAR × (AG + CPB) + CTA au gaz. */
  taxes: number
  total: number
  /** Gaz : le total €/MWh de l'énergie (molécule présentée + CEE + CPB). */
  totalMwh: number | null
  /** Toutes les cases propres à l'offre sont remplies : le budget est définitif. */
  complet: boolean
}

const connu = (x: number | null | undefined): x is number => x != null && Number.isFinite(x)
/** Une case vide compte pour zéro. */
const z = (x: number | null | undefined) => (connu(x) ? x : 0)
/** Au centime. */
export const auCentime = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

/** TVA à 20 % sur toute la facture d'électricité et de gaz depuis le 01/08/2025. */
export const TAUX_TVA = 0.2
/** Le TTC d'un montant HTVA tout à 20 %, au centime. */
export const enTTC = (ht: number) => auCentime(ht * (1 + TAUX_TVA))
/** Le TTC d'un budget : 20 % sur tout, CTA comprise — William, 02/10/2026 : « en fait mets toute la
 *  TVA à 20 % » (la CTA avait d'abord été à 5,5 %). Le même calcul que la colonne de la base. */
export const ttcDuBudget = (b: Pick<BudgetOffre, 'total'>) => enTTC(b.total)

/**
 * GAZ — William, 01/10/2026 : « les CPB doivent disparaître car ils seront gérés comme TURPE, CTA,
 * TQD ». Le CPB ne se saisit plus : il vient des communs (la base le moyenne sur les années de la
 * fourniture).
 *
 * ══ LE CPB EST DANS L'ÉNERGIE — William, 06/10/2026 ══
 * « Dans le calcul des prix gaz, il faut inclure les CPB dans le budget énergie et non pas le budget
 * taxes. » Il était rangé avec les taxes ; il passe dans l'énergie, comme dans le total €/MWh et dans
 * la base (`fn_reglementaire_version_compteur`). Le budget total ne bouge pas.
 */
export function budgetGaz(c: CommunsGaz, s: SaisieGaz): BudgetOffre | null {
  /* Une composante incluse dans le P0 ne se compte pas une seconde fois, et sa case n'est plus due. */
  const inclus = (k: ComposanteIncluse) => !!s.inclus?.includes(k)
  const cee = inclus('CEE') ? 0 : s.cee
  const prix = [s.abonnementMois, s.p0, s.marge, ...(inclus('CEE') ? [] : [s.cee])]
  if (!connu(c.car) || c.car <= 0 || !prix.some(connu)) return null
  const cpb = inclus('CPB') ? 0 : z(c.cpb ?? s.cpb)
  const tqd = inclus('TQD') ? 0 : z(c.tqd)
  const accise = inclus('ACCISE') ? 0 : z(c.accise)
  const totalMwh = z(s.p0) + z(s.marge) + z(cee) + cpb
  const abonnement = z(s.abonnementMois) * 12
  const energie = c.car * (z(s.p0) + z(s.marge) + z(cee) + cpb)
  const acheminement = c.car * tqd
  const taxes = c.car * accise + z(c.cta)
  return {
    abonnement: auCentime(abonnement), energie: auCentime(energie), turpe: 0, acheminement: auCentime(acheminement), taxes: auCentime(taxes),
    total: auCentime(abonnement + energie + acheminement + taxes), totalMwh: auCentime(totalMwh), complet: prix.every(connu),
  }
}

/**
 * LES POSTES D'UN COMPTEUR ÉLECTRIQUE, dans l'ordre du comparatif. William, 01/10/2026 : « quand c'est
 * de l'élec, je dois toujours voir Pointe, HPH, HCH, HPE, HCE » — même un poste à 0 MWh. Base, HP et
 * HC s'y ajoutent seulement quand le compteur y consomme : sans eux, le budget de ces compteurs
 * (356 en base ce jour-là, ventilés uniquement en Base ou HP/HC) serait faux.
 */
export const POSTES_TOUJOURS = ['POINTE', 'HPH', 'HCH', 'HPE', 'HCE'] as const
export function postesDuCompteur(conso: Record<string, number> | undefined): string[] {
  const enPlus = POSTES_ELEC.filter((p) => !(POSTES_TOUJOURS as readonly string[]).includes(p) && (conso?.[p] ?? 0) > 0)
  return [...POSTES_TOUJOURS, ...enPlus]
}

/**
 * Les postes qu'il FAUT prix pour que la ligne soit complète : ceux où le compteur consomme — un
 * poste à 0 MWh se lit mais ne bloque pas. Sans aucune consommation connue, les cinq postes.
 */
export function postesAPricer(conso: Record<string, number> | undefined): string[] {
  const postes = postesDuCompteur(conso)
  const consommes = postes.filter((p) => (conso?.[p] ?? 0) > 0)
  return consommes.length ? consommes : [...POSTES_TOUJOURS]
}

export function budgetElec(c: CommunsElec, s: SaisieElec): BudgetOffre | null {
  const postes = postesDuCompteur(c.conso)
  const consoTotale = postes.reduce((t, p) => t + (c.conso[p] ?? 0), 0)
  if (consoTotale <= 0) return null
  const inclus = (k: ComposanteIncluse) => !!s.inclus?.includes(k)
  const capacite = inclus('CAPACITE') ? 0 : s.capacite
  const cee = inclus('CEE') ? 0 : s.cee
  const prix = [s.abonnementMois, s.marge, ...(inclus('CAPACITE') ? [] : [s.capacite]), ...(inclus('CEE') ? [] : [s.cee]), ...postesAPricer(c.conso).map((p) => s.p0[p])]
  if (![...prix, ...postes.map((p) => s.p0[p])].some(connu)) return null
  const abonnement = z(s.abonnementMois) * 12
  const energie = postes.reduce((t, p) => t + (c.conso[p] ?? 0) * (z(s.p0[p]) + z(s.marge)), 0) + consoTotale * (z(capacite) + z(cee))
  const taxes = consoTotale * z(c.accise) + z(c.cta)
  const turpe = z(c.turpe)
  return {
    abonnement: auCentime(abonnement), energie: auCentime(energie), turpe: auCentime(turpe), acheminement: auCentime(turpe), taxes: auCentime(taxes),
    total: auCentime(abonnement + energie + turpe + taxes), totalMwh: null, complet: prix.every(connu),
  }
}

/** Lit un nombre saisi à la française (« 1 240,50 »), `null` si la case est vide ou illisible. */
export function lireNombre(v: string | number | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = v.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
