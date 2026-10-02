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
/**
 * UN CONTRAT CLIENT NE COMPTE QUE SIGNÉ ET VALIDÉ — William, 02/10/2026 : « un contrat client ne doit
 * être pris en compte pour les échéances, frises etc. uniquement quand ce dernier a été signé ET
 * validé ». La même règle que la base (`fn_contrat_compte`) : un contrat créé, à signer ou signé mais
 * pas encore validé reste visible dans la liste du compteur, mais ne fait ni l'échéance, ni la frise,
 * ni le « contrat en cours ».
 */
export function contratCompte(c: { actif?: boolean; date_signature?: string | null; avancement?: string | null; date_validation?: string | null }): boolean {
  return c.actif !== false && !!c.date_validation && (!!c.date_signature || c.avancement === 'SIGNE')
}

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

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'ÉCHÉANCE DU COMPTEUR, CONTRATS PROSPECTS COMPRIS — William, 01/10/2026
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * « Au lieu d'éditer un champ échéance déclarée, tu vas venir créer des contrats prospects et les
 * positionner dans la frise. » L'échéance devient la fin du DERNIER contrat connu, client ou
 * prospect (`dernierContrat`).
 *
 *   · le dernier est un contrat prospect → sa fin, déclarée (nature ESTIMEE), ou « Indéterminée » ;
 *   · sinon → la règle d'avant, inchangée (`natureEcheance`) : le contrat client en cours, à défaut
 *     la date déclarée sur le compteur.
 *
 * Un compteur sans contrat prospect se lit donc exactement comme hier : rien ne bouge tant qu'un
 * commercial n'en a pas saisi un. La date déclarée (`compteurs.date_echeance`) n'est ni effacée ni
 * réécrite — William : « je ne veux aucune perte de data ».
 *
 * ⚠️ Cette règle vaut pour la FICHE. Le cockpit, les échéances à traiter et la qualité du
 * portefeuille lisent encore `compteurs.date_echeance` en base (`v_compteurs_liste` et suivantes) :
 * ils basculeront quand William aura validé le parcours.
 */
export interface EcheanceDuCompteur extends EcheanceCompteur {
  source: 'CONTRAT_PROSPECT' | 'REGLE_CLIENT'
  /** Le dernier contrat connu est un contrat prospect sans fin : « Indéterminée ». */
  indeterminee: boolean
  /** L'identifiant du contrat prospect qui donne l'échéance, quand c'en est un. */
  prospectId: string | null
}

type DatesDeContrat = { date_debut?: string | null; date_fin: string | null; date_creation?: string | null }

/**
 * LE DERNIER CONTRAT CONNU : celui qui finit le plus tard.
 *
 * Une fin Indéterminée finit après tout (« il a renouvelé, on ne sait pas jusqu'à quand »), SAUF
 * face à un contrat qui commence en même temps ou après lui : celui-là est une information plus
 * récente qui le remplace. À égalité, le contrat saisi le plus récemment l'emporte.
 */
export function dernierContrat<T extends DatesDeContrat>(contrats: T[]): T | null {
  const jour = (d: string | null | undefined) => d?.slice(0, 10) ?? null
  const remplace = (i: T) => contrats.some((c) => c !== i && jour(c.date_fin) && jour(c.date_debut) && jour(i.date_debut) && jour(c.date_debut)! >= jour(i.date_debut)!)
  const plusRecent = (a: T, b: T) => ((a.date_creation ?? '') >= (b.date_creation ?? '') ? a : b)

  const ouverts = contrats.filter((c) => !jour(c.date_fin) && !remplace(c))
  if (ouverts.length) return ouverts.reduce(plusRecent)
  const fermes = contrats.filter((c) => jour(c.date_fin))
  if (!fermes.length) return null
  return fermes.reduce((a, b) => (jour(a.date_fin)! > jour(b.date_fin)! ? a : jour(b.date_fin)! > jour(a.date_fin)! ? b : plusRecent(a, b)))
}

export function echeanceDuCompteur(
  dateDeclaree: string | null | undefined,
  contratsClients: DatesDeContrat[],
  prospects: (DatesDeContrat & { id: string })[],
  aujourdHui: Date = new Date(),
): EcheanceDuCompteur {
  const regle = natureEcheance(dateDeclaree, contratsClients, aujourdHui)
  const tous: (DatesDeContrat & { prospectId: string | null })[] = [
    ...contratsClients.map((c) => ({ ...c, prospectId: null })),
    ...prospects.map((p) => ({ ...p, prospectId: p.id })),
  ]
  const dernier = dernierContrat(tous)

  if (dernier?.prospectId) {
    const fin = dernier.date_fin?.slice(0, 10) ?? null
    return {
      nature: 'ESTIMEE',
      date: fin,
      dateDeclaree: dateDeclaree ?? null,
      datePreuve: regle.datePreuve,
      contredit: false,
      source: 'CONTRAT_PROSPECT',
      indeterminee: !fin,
      prospectId: dernier.prospectId,
    }
  }
  return { ...regle, source: 'REGLE_CLIENT', indeterminee: false, prospectId: null }
}
