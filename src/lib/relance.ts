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
 * ══ ELLE N'A JAMAIS FONCTIONNÉ, ET ON PEUT DATER LA CASSE (18/09/2026) ══
 *
 * Écrite les 24-25/08, elle s'appuyait sur une étape de DOSSIER appelée « Présentée ». Le 28/08,
 * Michel a déplacé cette notion de l'étape vers le statut de la VERSION, sous le nom « En décision ».
 * Le commentaire de ce fichier l'a noté — mais l'appel, lui, a continué de passer `reco.etape`.
 *
 * La comparaison était donc « ACTIVE » ou « CLÔTURÉE » contre « EN_DECISION » : fausse pour tous les
 * dossiers, depuis trois semaines, sans qu'aucune erreur ne se produise jamais. Le pire genre de
 * panne — celle qui ressemble à « personne n'a besoin d'être relancé ».
 *
 * Et « En décision » a disparu à son tour le 18/09, la version n'ayant plus que trois statuts.
 *
 * ══ ELLE S'APPUIE DÉSORMAIS SUR UN FAIT, PLUS SUR UN STATUT ══
 *
 * `date_presentation_client` dit ce qui s'est réellement passé : l'offre est partie chez le client.
 * C'est indiscutable, ça ne se renomme pas, et aucune refonte de référentiel ne peut le casser — la
 * leçon des trois semaines précédentes.
 *
 * L'ÉTAPE NE SERT PLUS QU'À ÉCARTER LES DOSSIERS CLOS, ce qu'elle sait faire. Mesuré le 18/09 : la
 * règle proposerait UNE relance aujourd'hui. Pas 91, pas 760 — une. C'est l'esprit d'origine, où
 * Michel préférait trois suggestions justes à quatre-vingt-onze dont on apprend à ignorer le
 * bandeau.
 *
 * Le chiffre est bas parce que personne ne remplit cette date à la main. Elle se posera désormais
 * toute seule au moment d'envoyer la proposition au client depuis la fiche : envoyer démarre le
 * compteur, et la suggestion arrive deux jours ouvrés plus tard.
 *
 * Quatre conditions, donc :
 *   1. la recommandation est à l'étape « Active » — un dossier clos n'attend plus rien ;
 *   2. la version porte une DATE DE PRÉSENTATION : l'offre est partie chez le client ;
 *   3. c'est la version ACTUELLE qui a été présentée — une version remplacée par une plus récente
 *      n'attend plus de réponse ;
 *   4. deux jours ouvrés sont passés.
 *
 * LES JOURS FÉRIÉS NE SONT PAS TRAITÉS. « Ouvrés » exclut ici les samedis et dimanches, rien de
 * plus : la liste des fériés français est une donnée que nous n'avons pas, et l'inventer déplacerait
 * silencieusement le seuil. Une suggestion qui arrive un jour trop tôt le 15 août reste une
 * suggestion — le commercial décide.
 */

/**
 * ══ ON NOMME LES ÉTAPES OÙ L'ON RELANCE, PAS CELLES OÙ L'ON S'ARRÊTE ══
 *
 * Ce fichier listait trois étapes « fermées » — ACCEPTEE, REFUSEE, ABANDONNEE — tirées de la
 * diapositive 13 de Michel. Vérifié le 18/09/2026 : ces trois codes existent bien dans
 * `etapes_recommandation`, mais ils y sont DÉSACTIVÉS et ne portent AUCUN dossier. Les quatre codes
 * réellement utilisés sont Clôturée (1 623), Active (103), À réactiver (55) et Brouillon (1).
 *
 * Le filtre ne filtrait donc rien, et `CLOTUREE` — de loin le plus fréquent — passait au travers.
 * Recâbler la suggestion sans corriger cela l'aurait fait crier sur des dossiers terminés.
 *
 * LA LISTE EST INVERSÉE, ET C'EST LE VRAI CORRECTIF. Énumérer les étapes où l'on s'arrête oblige à
 * penser à chaque nouvelle étape ; énumérer celle où l'on relance fait qu'une étape inconnue ne
 * déclenche RIEN par défaut. Entre une suggestion oubliée et une suggestion sur un dossier clos, le
 * silence est le bon défaut.
 *
 * « À réactiver » n'y est pas : un dossier dormant n'attend pas la réponse du client à une offre, il
 * attend qu'on le reprenne. C'est un autre geste.
 */
const ETAPES_OU_L_ON_RELANCE = ['ACTIVE']

/**
 * ══ CE FILTRE EST LE SEUL ARRÊT DE LA RELANCE, ET C'EST VOULU ══
 *
 * La condition « le client n'a pas encore répondu » s'appuie sur `date_decision_client`. Mesuré le
 * 18/09/2026 : cette colonne est VIDE sur les 2 106 versions, et aucun écran ne l'écrit.
 *
 * Ce n'est pas un oubli. William, 18/09/2026 : « c'est la clôture de la recommandation qui arrête
 * la relance ». Un commercial ne va pas cocher « le client a répondu » puis clôturer le dossier —
 * il clôture, point, et ce geste-là existe déjà, il est obligatoire et il porte un motif.
 *
 * LA CONDITION SUR `date_decision_client` RESTE quand même, un cran plus bas : elle ne coûte rien,
 * elle dit juste ce qu'elle veut dire, et le jour où une décision client se consignera vraiment
 * elle fonctionnera sans qu'on ait à y revenir. Mais elle ne porte rien aujourd'hui — NE PAS la
 * « réparer » en câblant un bouton « le client a répondu » : ce serait ajouter un geste pour
 * obtenir ce que la clôture donne déjà.
 */


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
  if (!ETAPES_OU_L_ON_RELANCE.includes(etape)) return null
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
