/**
 * LA RELANCE APRÈS DEUX JOURS OUVRÉS.
 *
 * Michel, appel du 24/08/2026, à 31:16 puis 31:57 :
 *
 *   « On est sur des dates de validité dans le général d'un jour. En général c'est DEUX JOURS
 *     OUVRÉS. Une recommandation, quand elle est lancée, c'est comme si j'ai lancé un appel
 *     d'offres : j'ai une date fixe. »
 *
 *   « Pour les rappels, dans un premier temps on va pas indiquer, on va juste dire que nos
 *     commerciaux pourront se dire que cette offre a été envoyée il y a deux jours, vous n'avez
 *     toujours pas de retour, SOUHAITEZ-VOUS RELANCER — fin du game. »
 *
 *   « Kimatch va juste lui dire : voilà ce que tu devrais faire. À lui de décider de le faire ou
 *     pas. »
 *
 * KIMATCH PROPOSE, IL N'AGIT PAS. C'est la phrase qui commande tout ce fichier : la suggestion
 * s'affiche, le commercial décide. Aucune relance ne part toute seule, et le bouton ne fait que
 * consigner l'appel ou le message qu'il a réellement passé.
 *
 * LA SUGGESTION EST ÉTROITE, ET C'EST VOULU. Mesuré en production le 24/08/2026 : 760 versions
 * portent une date de présentation et AUCUNE ne porte de date de décision — la reprise Salesforce ne
 * l'a jamais remplie. Une règle naïve « présentée sans décision » se déclencherait donc sur 760
 * dossiers, dont 303 déjà acceptés et 267 refusés ou abandonnés. Une suggestion qui crie sur des
 * dossiers clos n'est pas une aide, c'est du bruit qu'on apprend à ignorer.
 *
 * Trois conditions, donc :
 *   1. la recommandation est encore ouverte — ni acceptée, ni refusée, ni abandonnée ;
 *   2. c'est la version ACTUELLE qui a été présentée (une version remplacée par une plus récente
 *      n'attend plus de réponse : 169 des 190 cas restants sont dans ce cas, la recommandation étant
 *      repartie en consultation) ;
 *   3. deux jours ouvrés sont passés.
 *
 * LES JOURS FÉRIÉS NE SONT PAS TRAITÉS. « Ouvrés » exclut ici les samedis et dimanches, rien de
 * plus : la liste des fériés français est une donnée que nous n'avons pas, et l'inventer déplacerait
 * silencieusement le seuil. Une suggestion qui arrive un jour trop tôt le 15 août reste une
 * suggestion — le commercial décide.
 */

/** Les étapes terminales de la diapositive 13 : au-delà, plus rien à relancer. */
const ETAPES_FERMEES = ['ACCEPTEE', 'REFUSEE', 'ABANDONNEE']

const SEUIL_JOURS_OUVRES = 2

function msUtc(iso: string): number {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(a, (m ?? 1) - 1, j ?? 1)
}

/**
 * Jours ouvrés écoulés depuis une date, le jour de la date lui-même non compté.
 *
 * On avance jour par jour plutôt que de diviser par sept : sur deux ou trois jours, une division
 * fausserait le compte selon le jour de la semaine où l'on part — présenter un vendredi et regarder
 * le lundi fait UN jour ouvré, pas trois.
 */
export function joursOuvresDepuis(iso: string, maintenant: Date = new Date()): number {
  const debut = msUtc(iso)
  const fin = Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
  if (fin <= debut) return 0

  let compte = 0
  for (let t = debut + 86_400_000; t <= fin; t += 86_400_000) {
    const jour = new Date(t).getUTCDay()
    if (jour !== 0 && jour !== 6) compte++
  }
  return compte
}

export interface SuggestionRelance {
  /** Nombre de jours ouvrés écoulés depuis la présentation, ou depuis la dernière relance. */
  joursOuvres: number
  /** Vrai quand le décompte part d'une relance déjà consignée et non de la présentation. */
  relancee: boolean
  /** La phrase, dans les mots de Michel. */
  texte: string
}

/**
 * @param etape code de l'étape de la recommandation
 * @param version la version ACTUELLE, avec ses deux dates
 * @param derniereRelance date ISO de la dernière relance consignée, s'il y en a une
 *
 * LA RELANCE REPART LE COMPTEUR. Sans ce paramètre, la suggestion se réafficherait à l'identique
 * juste après avoir été suivie : le commercial vient d'appeler, et l'écran lui redemande d'appeler.
 * Le point de départ est donc la plus RÉCENTE des deux dates — présentation ou dernière relance.
 */
export function suggestionRelance(
  etape: string,
  version: { version_actuelle?: boolean; date_presentation_client: string | null; date_decision_client: string | null } | null | undefined,
  derniereRelance?: string | null,
  maintenant: Date = new Date(),
): SuggestionRelance | null {
  if (!version) return null
  if (ETAPES_FERMEES.includes(etape)) return null
  if (version.version_actuelle === false) return null
  if (!version.date_presentation_client) return null
  if (version.date_decision_client) return null

  const depart =
    derniereRelance && derniereRelance.slice(0, 10) > version.date_presentation_client.slice(0, 10)
      ? derniereRelance
      : version.date_presentation_client
  const relancee = depart !== version.date_presentation_client

  const joursOuvres = joursOuvresDepuis(depart, maintenant)
  if (joursOuvres < SEUIL_JOURS_OUVRES) return null

  const duree = joursOuvres === SEUIL_JOURS_OUVRES ? 'deux jours ouvrés' : `${joursOuvres} jours ouvrés`
  return {
    joursOuvres,
    relancee,
    texte: relancee
      ? `Relancée il y a ${duree}, toujours sans retour du client. Souhaitez-vous relancer à nouveau ?`
      : `Présentée il y a ${duree}, sans retour du client. Souhaitez-vous relancer ?`,
  }
}
