/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES CONTRATS PROSPECTS — leurs dates, et l'échéance qu'ils donnent au compteur
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 01/10/2026 : « au lieu d'éditer un champ échéance déclarée, tu vas venir créer des
 * contrats prospects […] et les positionner dans la frise. » Trois réponses suffisent, chacune
 * pouvant rester inconnue : la nouvelle échéance, le nouveau fournisseur, la durée.
 *
 * Son cas d'école : un contrat client finit le 31/12/2027 ; le client a déjà signé chez EDF
 * jusqu'au 31/12/2029. Le commercial saisit l'échéance et le fournisseur, la durée se PROPOSE
 * (24 mois, du lendemain de la dernière fin connue à la nouvelle échéance), et le début s'en déduit.
 *
 * Tout est en dates ISO « AAAA-MM-JJ », calculées en UTC sur la chaîne : `new Date('2028-01-01')`
 * lu en heure locale recule d'un jour en UTC+2 (le piège déjà noté dans `echeance.ts`).
 */

export interface DatesContrat {
  date_debut: string | null
  date_fin: string | null
}

function versUtc(iso: string): Date {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, (m ?? 1) - 1, j ?? 1))
}

function versIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function ajouterJours(iso: string, n: number): string {
  const d = versUtc(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return versIso(d)
}

/** Ajoute des mois en gardant le jour, ramené au dernier jour du mois quand il n'existe pas (31/01 + 1 mois → 28/02). */
export function ajouterMois(iso: string, n: number): string {
  const d = versUtc(iso)
  const jour = d.getUTCDate()
  const cible = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate()
  cible.setUTCDate(Math.min(jour, dernier))
  return versIso(cible)
}

/** La durée en mois d'un contrat qui court du `debut` au `fin` inclus : 01/01/2028 → 31/12/2029 = 24. */
export function moisEntre(debut: string, fin: string): number {
  const a = versUtc(debut)
  const b = versUtc(ajouterJours(fin, 1))
  const mois = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  /* Un reste de plus d'un demi-mois compte pour un mois : 01/01 → 30/06 donne 6, pas 5. */
  const reste = (b.getTime() - versUtc(ajouterMois(debut, mois)).getTime()) / 86_400_000
  return mois + (reste >= 15 ? 1 : reste <= -15 ? -1 : 0)
}

/** Le début d'un contrat qui finit le `fin` après `duree` mois : 31/12/2029 sur 24 mois → 01/01/2028. */
export function debutDepuisFin(fin: string, duree: number): string {
  return ajouterMois(ajouterJours(fin, 1), -duree)
}

/** La fin d'un contrat qui commence le `debut` pour `duree` mois : 01/01/2028 sur 24 mois → 31/12/2029. */
export function finDepuisDebut(debut: string, duree: number): string {
  return ajouterJours(ajouterMois(debut, duree), -1)
}

/**
 * La dernière fin connue AVANT le contrat qu'on saisit : celle dont il prend la suite.
 *
 * `limite` exclut ce qui finit après la fin saisie — en modification, un contrat plus récent que
 * celui qu'on corrige n'est pas son prédécesseur. Sans fin saisie, toutes les fins comptent.
 */
export function derniereFinConnue(contrats: DatesContrat[], limite?: string | null): string | null {
  const fins = contrats
    .map((c) => c.date_fin?.slice(0, 10) ?? null)
    .filter((f): f is string => !!f && (!limite || f < limite.slice(0, 10)))
    .sort()
  return fins.length ? fins[fins.length - 1] : null
}

/** La durée à proposer : du lendemain de la dernière fin connue à la nouvelle échéance. */
export function dureeProposee(finPrecedente: string | null, fin: string | null): number | null {
  if (!finPrecedente || !fin || fin <= finPrecedente) return null
  const m = moisEntre(ajouterJours(finPrecedente, 1), fin)
  return m >= 1 && m <= 240 ? m : null
}

export interface SaisieProspect {
  /** `null` = Indéterminée. */
  fin: string | null
  /** `null` = Indéterminée. */
  duree: number | null
  finPrecedente: string | null
}

/**
 * Ce que la base retiendra, à partir des trois réponses.
 *
 *   fin et durée connues     → le début se déduit de la fin
 *   fin seule                → le contrat prend la suite du précédent, s'il y en a un
 *   durée seule              → il prend la suite du précédent, et sa fin s'en déduit
 *   rien                     → il prend la suite du précédent, fin Indéterminée
 */
export function datesRetenues(s: SaisieProspect): { date_debut: string | null; date_fin: string | null; calculee: 'debut' | 'fin' | null } {
  const suite = s.finPrecedente ? ajouterJours(s.finPrecedente, 1) : null
  if (s.fin && s.duree) return { date_debut: debutDepuisFin(s.fin, s.duree), date_fin: s.fin, calculee: 'debut' }
  if (s.fin) return { date_debut: suite && suite <= s.fin ? suite : null, date_fin: s.fin, calculee: suite && suite <= s.fin ? 'debut' : null }
  if (s.duree && suite) return { date_debut: suite, date_fin: finDepuisDebut(suite, s.duree), calculee: 'fin' }
  return { date_debut: suite, date_fin: null, calculee: suite ? 'debut' : null }
}
