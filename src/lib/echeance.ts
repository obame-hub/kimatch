/**
 * LA NATURE D'UNE ÉCHÉANCE — prouvée, estimée, ou absente.
 *
 * Diapositive 6 de la présentation de Michel du 24/08/2026, mot pour mot :
 *
 *   ÉCHÉANCE PROUVÉE — « Contrat rattaché dans Kiwee »
 *   ÉCHÉANCE ESTIMÉE — « Date déclarée par le client, sans preuve »
 *   « Sans échéance contractuelle — prouvée ou estimée — la piste reste à qualifier. »
 *
 * ELLE NE SE STOCKE PAS, ELLE SE DÉDUIT. Une colonne « prouvée » ou une case à cocher se coche sans
 * preuve : ce serait exactement le contournement que sa définition cherche à fermer. La preuve, c'est
 * le contrat lui-même, et la base la porte déjà — `compteurs.date_echeance` EST la date déclarée,
 * `contrats_compteurs` EST la preuve. Aucune migration n'a été nécessaire.
 *
 * LA PREUVE DOIT ÊTRE VIVANTE. Un contrat terminé ne prouve rien sur l'échéance à venir : le client a
 * signé ailleurs depuis, et la date déclarée parle de ce contrat-là, absent de Kimatch. Mesuré sur la
 * production le 24/08/2026 : sur les 634 compteurs dont l'échéance diffère de leur contrat, 252 ont
 * un contrat déjà terminé — la divergence y est normale, pas fautive.
 *
 * Répartition mesurée, la preuve restreinte aux contrats non terminés :
 *   1 036 prouvées · 6 275 estimées · 588 sans aucune échéance (sur 7 899 compteurs)
 *
 * LES CONTRADICTIONS SE SIGNALENT, ELLES NE SE TRANCHENT PAS. 238 compteurs portent un écart de moins
 * d'un mois avec leur contrat en cours — une affaire de convention de dernier jour, pas un désaccord.
 * Mais 144 le contredisent de plus d'un mois, jusqu'à quatre ans d'écart. Choisir une date à leur
 * place ferait disparaître le problème de l'écran sans le résoudre : on affiche les deux et on le dit.
 */

/** Tolérance en jours avant de parler de contradiction : en dessous, c'est une convention de date. */
const TOLERANCE_JOURS = 31

export type NatureEcheance = 'PROUVEE' | 'ESTIMEE' | 'ABSENTE'

export interface EcheanceCompteur {
  nature: NatureEcheance
  /** La date à retenir : celle du contrat quand il y en a un, la déclarée sinon. */
  date: string | null
  /** `compteurs.date_echeance` — ce que le client a déclaré. */
  dateDeclaree: string | null
  /** La fin du contrat en cours rattaché au compteur, quand il en existe un. */
  datePreuve: string | null
  /** Vrai quand un contrat en cours contredit la date déclarée de plus d'un mois. */
  contredit: boolean
}

/**
 * Lit une date ISO « AAAA-MM-JJ » en millisecondes UTC.
 *
 * `new Date('2026-08-24')` puis une comparaison locale décale d'un jour en UTC+2 — le piège qui
 * m'avait fait lire 20/08 là où la base portait 21/08 (21/08/2026). On découpe donc la chaîne.
 */
function msUtc(iso: string): number {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(a, (m ?? 1) - 1, j ?? 1)
}

function joursEntre(a: string, b: string): number {
  return Math.abs(msUtc(a) - msUtc(b)) / 86_400_000
}

/**
 * @param dateDeclaree `compteurs.date_echeance`
 * @param contrats les contrats rattachés à CE compteur — seule leur `date_fin` est lue
 * @param aujourdHui injectable pour les tests ; par défaut le jour courant
 */
export function natureEcheance(
  dateDeclaree: string | null | undefined,
  contrats: { date_fin: string | null }[],
  aujourdHui: Date = new Date(),
): EcheanceCompteur {
  const declaree = dateDeclaree ?? null

  // Le jour courant en ISO, sans passer par toISOString() qui repasse en UTC et peut reculer d'un jour.
  const jour = `${aujourdHui.getFullYear()}-${String(aujourdHui.getMonth() + 1).padStart(2, '0')}-${String(aujourdHui.getDate()).padStart(2, '0')}`

  // La preuve la plus lointaine parmi les contrats encore en cours ou à venir : si le compteur est
  // couvert par plusieurs contrats successifs, c'est le dernier qui dit quand la couverture s'arrête.
  const finsVivantes = contrats
    .map((c) => c.date_fin)
    .filter((d): d is string => !!d && d.slice(0, 10) >= jour)
    .sort()
  const preuve = finsVivantes.length ? finsVivantes[finsVivantes.length - 1] : null

  if (preuve) {
    return {
      nature: 'PROUVEE',
      date: preuve,
      dateDeclaree: declaree,
      datePreuve: preuve,
      contredit: !!declaree && joursEntre(declaree, preuve) > TOLERANCE_JOURS,
    }
  }

  if (declaree) {
    return { nature: 'ESTIMEE', date: declaree, dateDeclaree: declaree, datePreuve: null, contredit: false }
  }

  return { nature: 'ABSENTE', date: null, dateDeclaree: null, datePreuve: null, contredit: false }
}

/** Ce que la nature veut dire, dans les mots de la diapositive 6 — pour les infobulles. */
export const SENS_NATURE_ECHEANCE: Record<NatureEcheance, string> = {
  PROUVEE: 'Un contrat rattaché dans Kimatch porte cette date de fin.',
  ESTIMEE: 'Date déclarée par le client, sans contrat pour l’attester.',
  ABSENTE: 'Aucune échéance, ni prouvée ni estimée : le compteur reste à qualifier.',
}
