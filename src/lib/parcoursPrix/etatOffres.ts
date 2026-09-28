import { estJourOuvreFR } from '@/lib/joursFeries'
import type { Compteur, OffreFournisseur, OffreFournisseurCompteur, VersionRecommandation } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'ÉTAT D'UNE OFFRE : « PRIX DISPONIBLE » OU « EN ATTENTE POUR LE … »
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Michel, 28/09/2026, étape 2 du parcours : « KiMatch affiche chaque offre au statut "Prix
 * disponible" ou "En attente pour le [date prévisionnelle]". »
 *
 * ══ « DISPONIBLE » SE CONSTATE, IL NE SE DÉCLARE PAS ══
 *
 * Une offre a son prix quand CHAQUE compteur de la version porte un prix fournisseur (le P0) —
 * c'est ce qui permet d'en calculer le budget. Le statut écrit en base (`offres_fournisseurs.statut`)
 * n'y suffit pas : 18 offres « DISPONIBLE » au 28/09/2026, posées à la main, dont on ne sait pas si
 * elles sont chiffrées. Le seul statut qu'on reprend tel quel est le refus (INDISPONIBLE) : c'est
 * une réponse du fournisseur, pas un fait qu'on pourrait recalculer.
 *
 * ══ LA DATE PRÉVISIONNELLE SUIT LE CIRCUIT DU FOURNISSEUR ══
 *
 * C'est la règle posée par `mode_reponse` (migration du 18/09/2026) :
 *   · MAIL et TRADEO reçoivent la demande DÈS LA CRÉATION de la version : la réponse est attendue
 *     `response_delay_days` jours ouvrés plus tard, délai lu sur la fiche du fournisseur ;
 *   · PLATEFORME et GRILLE se relèvent LE JOUR DE LA LIVRAISON SOUHAITÉE : leur prix est attendu
 *     ce jour-là, pas avant.
 * Faute de mode ou de délai, on retombe sur la date de livraison souhaitée, EN LE DISANT : la date
 * affichée n'est alors pas une prévision mais l'échéance du commercial.
 *
 * EN JOURS OUVRÉS, fériés compris, par la même fonction que tout Kimatch (`estJourOuvreFR`) :
 * William, 18/09/2026, « il doit être impossible de demander une offre pour le samedi ».
 */

export type ModeReponse = 'MAIL' | 'TRADEO' | 'PLATEFORME' | 'GRILLE'

export interface CircuitFournisseur {
  mode_reponse: ModeReponse | null
  response_delay_days: number | null
}

export type EtatOffre = 'DISPONIBLE' | 'EN_ATTENTE' | 'INDISPONIBLE'

export interface Prevision {
  date: string | null
  /** D'où vient la date, en clair : c'est ce qui dit s'il faut s'y fier. */
  raison: string
  /** Vrai quand la date n'est pas une prévision mais la livraison souhaitée par défaut. */
  parDefaut: boolean
}

export interface EtatDOffre {
  etat: EtatOffre
  chiffres: number
  total: number
  prevision: Prevision | null
  enRetard: boolean
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Le jour d'une date ISO, à midi : un décalage de fuseau ne le fait pas changer de jour. */
function jour(dateIso: string): Date {
  return new Date(`${dateIso.slice(0, 10)}T12:00:00`)
}

/**
 * Ajoute `n` jours ouvrés. `n = 0` rend le jour même s'il est ouvré, sinon le suivant : une demande
 * faite un samedi à un fournisseur qui répond « dans la journée » répond le lundi.
 */
export function ajouterJoursOuvres(depuis: string, n: number): string {
  const d = jour(depuis)
  while (!estJourOuvreFR(d)) d.setDate(d.getDate() + 1)
  let restant = n
  while (restant > 0) {
    d.setDate(d.getDate() + 1)
    if (estJourOuvreFR(d)) restant -= 1
  }
  return iso(d)
}

export function datePrevisionnelle(
  circuit: CircuitFournisseur | undefined,
  version: Pick<VersionRecommandation, 'date_creation' | 'date_souhaitee'>,
): Prevision {
  const souhaitee = version.date_souhaitee ? version.date_souhaitee.slice(0, 10) : null
  const parDefaut = (raison: string): Prevision => ({ date: souhaitee, raison, parDefaut: true })
  const mode = circuit?.mode_reponse ?? null

  if (mode === 'MAIL' || mode === 'TRADEO') {
    const delai = circuit?.response_delay_days
    if (delai == null) return parDefaut('délai de réponse non renseigné sur la fiche du fournisseur')
    return {
      date: ajouterJoursOuvres(version.date_creation, delai),
      raison: `${mode === 'TRADEO' ? 'demande Tradeo' : 'demande par mail'} à la création, réponse sous ${delai} j ouvré${delai > 1 ? 's' : ''}`,
      parDefaut: false,
    }
  }
  if (mode === 'PLATEFORME' || mode === 'GRILLE') {
    return souhaitee
      ? { date: souhaitee, raison: `prix relevés ${mode === 'GRILLE' ? 'dans la grille' : 'sur la plateforme'} le jour de la livraison souhaitée`, parDefaut: false }
      : { date: null, raison: 'prix relevés le jour de la livraison souhaitée, qui n’est pas renseignée', parDefaut: true }
  }
  return parDefaut('mode de réponse du fournisseur non renseigné')
}

/** Le détail d'une offre sur un compteur de la version. */
export function detailSur(offre: OffreFournisseur, lienId: string): OffreFournisseurCompteur | undefined {
  return offre.details_par_compteur.find((d) => d.version_recommandation_compteur_id === lienId)
}

/** Un compteur est chiffré quand le fournisseur a donné son prix : le P0, et non le prix présenté. */
export function compteurChiffre(detail: OffreFournisseurCompteur | undefined, gaz: boolean): boolean {
  if (!detail) return false
  if (gaz) return detail.prix_gaz?.prix_molecule_p0_mwh != null
  return Object.values(detail.prix_electricite?.p0_mwh_par_classe ?? {}).some((v) => v != null)
}

export function etatDOffre(
  offre: OffreFournisseur,
  version: VersionRecommandation,
  compteurs: Map<string, Compteur>,
  circuit: CircuitFournisseur | undefined,
  aujourdHui: Date = new Date(),
): EtatDOffre {
  const total = version.compteurs.length
  const chiffres = version.compteurs.filter((l) =>
    compteurChiffre(detailSur(offre, l.lien_id), compteurs.get(l.compteur_id)?.type_energie === 'gaz'),
  ).length

  if (offre.statut === 'INDISPONIBLE' || offre.statut === 'REFUSEE') {
    return { etat: 'INDISPONIBLE', chiffres, total, prevision: null, enRetard: false }
  }
  if (total > 0 && chiffres === total) {
    return { etat: 'DISPONIBLE', chiffres, total, prevision: null, enRetard: false }
  }
  const prevision = datePrevisionnelle(circuit, version)
  return {
    etat: 'EN_ATTENTE',
    chiffres,
    total,
    prevision,
    enRetard: prevision.date != null && prevision.date < iso(aujourdHui),
  }
}

/**
 * La version peut-elle passer « Disponible » ? William, 18/09/2026 : « lorsque l'ensemble des
 * offres de la version ont été reçues » — et le passage est PROPOSÉ, jamais imposé (migration
 * 20260918130000). Une offre refusée a répondu : elle ne bloque pas.
 */
export function versionPrete(etats: EtatDOffre[]): boolean {
  return etats.length > 0 && etats.every((e) => e.etat !== 'EN_ATTENTE') && etats.some((e) => e.etat === 'DISPONIBLE')
}
