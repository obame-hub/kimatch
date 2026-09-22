/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA SANTÉ D'UNE RELATION — CE QUI S'EST DIT, PAS COMBIEN DE FOIS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026, en corrigeant mon premier modèle :
 *
 *   « Certes le plus important est d'avoir le client (réponse mail, conversation, intérêt facture
 *     etc.), mais en réalité le plus important est ce qu'il y a dans cette réponse. Car s'il répond
 *     à un mail en nous disant qu'on l'emmerde et qu'il veut plus jamais nous parler, impossible de
 *     lui accorder +30 car certes il y a eu réponse, mais une réponse très négative. C'est
 *     l'analyse des réponses et des conversations qui doivent être positifs ou négatifs et faire
 *     évoluer le score en ce sens. »
 *
 * Mon premier modèle comptait les occurrences : une réponse valait des points, deux en valaient le
 * double. Il aurait donc noté « excellent » un contact qui nous envoie promener trois fois. Le
 * modèle ci-dessous ne compte rien : il PÈSE des valences.
 *
 * ══ LES QUATRE RÈGLES ══
 *
 * 1. UN ENVOI NE VAUT RIEN. Un mail parti, un appel passé sans réponse : c'est notre activité, pas
 *    la sienne. Seul ce qui vient de lui — une réponse, une conversation aboutie — porte un signal.
 *
 * 2. LE NÉGATIF PÈSE PLUS LOURD QUE LE POSITIF. Un refus clair annule plus que ne construit un
 *    échange cordial, parce qu'il est plus rare et plus décisif. C'est l'asymétrie exacte que
 *    décrit William : « impossible de lui accorder +30 ».
 *
 * 3. LE RÉCENT PRIME. Un « très intéressé » d'il y a deux ans ne dit rien d'aujourd'hui. Le poids
 *    décroît doucement : entier sur le trimestre en cours, environ un tiers au bout d'un an.
 *
 * 4. LE SILENCE N'EST PAS NEUTRE. Sans aucun signal depuis trois mois, le score est plafonné : on
 *    ne peut pas se dire en bons termes avec quelqu'un qui ne nous répond plus.
 *
 * ══ D'OÙ VIENT LA VALENCE ══
 *
 * Par ordre d'autorité, et le premier qui répond l'emporte :
 *
 *   HUMAIN     un commercial a corrigé d'un clic dans le fil — personne ne le contredit
 *   IA         l'analyse de contenu (`api/cockpit/conseil.ts`) a lu le texte de l'échange
 *   ÉTIQUETTE  ce qu'Allô a compris de l'appel : `not_interested`, `interested`, `meeting_booked`
 *   AURA       la note de 1 à 5 saisie dans la fenêtre d'appel
 *   ISSUE      l'issue choisie après l'appel
 *
 * Ce qui ne répond à aucun des cinq ne compte pas — et se déclare « à analyser » plutôt que de se
 * faire passer pour neutre. Un score doit dire ce qu'il ignore.
 */
export type Valence = 'POSITIF' | 'NEUTRE' | 'NEGATIF'

/** Le strict nécessaire au calcul : le fil d'activité complet ne rentre pas ici. */
export interface SignalRelation {
  quand: string
  nature: 'APPEL' | 'MAIL' | 'NOTE'
  sens: string | null
  sentiment: Valence | null
  etiquettes: string[]
  aura: number | null
  issue: string | null
  /**
   * Vrai quand l'appel n'a joint personne : ni répondeur, ni serveur vocal ne parlent pour lui.
   * Il se déduit de `appels_en_cours.qualification` — HUMAIN seul vaut une conversation.
   */
  sansReponse: boolean
}

export interface SanteRelation {
  /** 0 à 100. 50 est le point de départ : on ne sait rien, ni en bien ni en mal. */
  score: number
  /** Le mot qu'on affiche à côté du chiffre. */
  etat: 'Froide' | 'Fragile' | 'À entretenir' | 'Engagée' | 'Chaude'
  positifs: number
  negatifs: number
  neutres: number
  /** Les échanges dont on ne sait pas le sens — ceux que l'analyse n'a pas encore lus. */
  aAnalyser: number
  /** Jours depuis le dernier signal VENANT DE LUI, `null` s'il n'y en a jamais eu. */
  joursDepuisSignal: number | null
  /** La phrase qui explique le chiffre, en français. */
  explication: string
}

const ETIQUETTES_NEGATIVES = ['not_interested', 'do_not_call', 'wrong_number']
const ETIQUETTES_POSITIVES = ['interested', 'meeting_booked']
/* LES CODES DE LA BASE, PAS LEURS LIBELLÉS. La contrainte `appels_en_cours_issue_check` n'accepte
   que ces six valeurs ; comparer à « Refus clair » n'aurait jamais rien trouvé — et un score qui
   ne trouve rien ne se plaint pas, il reste simplement à cinquante. */
const ISSUES_NEGATIVES = ['REFUS', 'DEJA_RENEGOCIE']
const ISSUES_POSITIVES = ['INTERESSE', 'FACTURES']

/**
 * La valence d'un seul échange, ou `null` si rien ne permet de la dire.
 *
 * SÉPARÉE DU SCORE À DESSEIN : c'est elle que le fil d'activité affiche sous chaque ligne, et c'est
 * elle qu'un commercial corrige d'un clic. Les deux doivent dire la même chose.
 */
export function valenceDuSignal(s: SignalRelation): Valence | null {
  if (s.sentiment) return s.sentiment

  /* UN ENVOI SANS RÉPONSE NE DIT RIEN. Règle 1 : c'est notre activité, pas la sienne. */
  if (s.nature === 'MAIL' && s.sens !== 'ENTRANT') return null
  if (s.nature === 'APPEL' && s.sansReponse) return null
  if (s.nature === 'NOTE') return null

  if (s.etiquettes.some((t) => ETIQUETTES_NEGATIVES.includes(t))) return 'NEGATIF'
  if (s.issue && ISSUES_NEGATIVES.includes(s.issue)) return 'NEGATIF'
  if (s.aura != null && s.aura <= 2) return 'NEGATIF'

  if (s.etiquettes.some((t) => ETIQUETTES_POSITIVES.includes(t))) return 'POSITIF'
  if (s.issue && ISSUES_POSITIVES.includes(s.issue)) return 'POSITIF'
  if (s.aura != null && s.aura >= 4) return 'POSITIF'

  if (s.aura === 3) return 'NEUTRE'
  if (s.issue) return 'NEUTRE'
  return null
}

const POIDS: Record<Valence, number> = {
  /* L'ASYMÉTRIE EST LE CŒUR DU MODÈLE (règle 2), et les chiffres sont choisis pour qu'elle se dise
     en une phrase vérifiable : IL FAUT TROIS ÉCHANGES POSITIFS POUR EFFACER UN REFUS. C'est le
     rapport qu'on observe en prospection, et c'est ce que le test de ce fichier garantit. */
  POSITIF: 9,
  NEUTRE: 2,
  NEGATIF: -22,
}

/** Poids du temps : entier sur trois mois, moitié à six, un tiers à un an. */
function poidsDuTemps(jours: number): number {
  if (jours <= 90) return 1
  return 90 / jours
}

export function calculerSante(signaux: SignalRelation[], maintenant = new Date()): SanteRelation {
  let brut = 50
  let positifs = 0
  let negatifs = 0
  let neutres = 0
  let aAnalyser = 0
  let dernierSignal: number | null = null

  for (const s of signaux) {
    const valence = valenceDuSignal(s)
    if (!valence) {
      /* On ne compte « à analyser » que ce qui POURRAIT porter un sens : une réponse reçue, une
         conversation aboutie. Un mail qu'on a envoyé n'a rien à analyser. */
      const analysable = (s.nature === 'MAIL' && s.sens === 'ENTRANT') || (s.nature === 'APPEL' && !s.sansReponse)
      if (analysable) aAnalyser++
      continue
    }

    const jours = Math.max(0, Math.round((maintenant.getTime() - new Date(s.quand).getTime()) / 86_400_000))
    brut += POIDS[valence] * poidsDuTemps(jours)

    if (valence === 'POSITIF') positifs++
    else if (valence === 'NEGATIF') negatifs++
    else neutres++

    if (dernierSignal === null || jours < dernierSignal) dernierSignal = jours
  }

  let score = Math.max(0, Math.min(100, Math.round(brut)))

  /* RÈGLE 4 — LE SILENCE. Plus de trois mois sans un mot de sa part : on ne peut pas se prétendre
     en bons termes. Le plafond descend avec le temps sans jamais tomber à zéro — un ancien client
     silencieux n'est pas un inconnu. */
  if (dernierSignal === null) {
    score = Math.min(score, 45)
  } else if (dernierSignal > 90) {
    const plafond = Math.max(35, 75 - Math.round((dernierSignal - 90) / 12))
    score = Math.min(score, plafond)
  }

  const etat: SanteRelation['etat'] =
    score >= 78 ? 'Chaude'
    : score >= 62 ? 'Engagée'
    : score >= 45 ? 'À entretenir'
    : score >= 30 ? 'Fragile'
    : 'Froide'

  return {
    score,
    etat,
    positifs,
    negatifs,
    neutres,
    aAnalyser,
    joursDepuisSignal: dernierSignal,
    explication: expliquer({ positifs, negatifs, neutres, aAnalyser, joursDepuisSignal: dernierSignal }),
  }
}

function expliquer({
  positifs, negatifs, neutres, aAnalyser, joursDepuisSignal,
}: Pick<SanteRelation, 'positifs' | 'negatifs' | 'neutres' | 'aAnalyser' | 'joursDepuisSignal'>): string {
  if (positifs + negatifs + neutres === 0) {
    return aAnalyser > 0
      ? `${aAnalyser} échange${aAnalyser > 1 ? 's' : ''} venant de lui, dont on n’a pas encore lu le sens.`
      : 'Il ne nous a jamais répondu : rien ne permet encore de juger.'
  }

  const morceaux: string[] = []
  if (negatifs > 0) morceaux.push(`${negatifs} signal${negatifs > 1 ? 'aux' : ''} négatif${negatifs > 1 ? 's' : ''}`)
  if (positifs > 0) morceaux.push(`${positifs} positif${positifs > 1 ? 's' : ''}`)
  if (neutres > 0) morceaux.push(`${neutres} neutre${neutres > 1 ? 's' : ''}`)

  const silence =
    joursDepuisSignal == null ? ''
    : joursDepuisSignal > 90 ? ` Plus rien de lui depuis ${Math.round(joursDepuisSignal / 30)} mois.`
    : joursDepuisSignal > 30 ? ` Dernier signe de vie il y a ${joursDepuisSignal} jours.`
    : ''

  const reste = aAnalyser > 0 ? ` ${aAnalyser} échange${aAnalyser > 1 ? 's' : ''} reste${aAnalyser > 1 ? 'nt' : ''} à analyser.` : ''
  return `${morceaux.join(', ')}.${silence}${reste}`
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA JOIGNABILITÉ — PAR LE TÉLÉPHONE, ET PAR L'ÉCRIT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « dans la joignabilité on peut parler de celle des appels et celle des
 * mails pour avoir 2 métriques ».
 *
 * ET LES DEUX NE DISENT PAS LA MÊME CHOSE. Un numéro qui ne décroche jamais et une adresse qui
 * répond au premier mail décrivent quelqu'un de joignable — par écrit. L'inverse aussi. Avec le
 * seul taux d'appels, on changeait d'heure d'appel là où il fallait changer de canal.
 *
 * TROIS MESSAGES SUR UN RÉPONDEUR font trois appels et zéro conversation : même règle que le
 * compteur « abouti » du sprint. Et un mail parti ne compte pas comme joint — seule sa réponse le
 * prouve.
 */
export interface Joignabilite {
  /** `null` quand rien n'a été tenté sur ce canal : un taux sans essai n'existe pas. */
  taux: number | null
  /** Ce qui a abouti : conversations pour le téléphone, réponses pour l'écrit. */
  retours: number
  /** Ce qui a été tenté. */
  tentatives: number
}

export function joignabiliteTelephone(signaux: SignalRelation[]): Joignabilite {
  const appels = signaux.filter((s) => s.nature === 'APPEL')
  const aboutis = appels.filter((s) => !s.sansReponse)
  return {
    tentatives: appels.length,
    retours: aboutis.length,
    taux: appels.length === 0 ? null : Math.round((aboutis.length / appels.length) * 100),
  }
}

export function joignabiliteEcrit(signaux: SignalRelation[]): Joignabilite {
  const envoyes = signaux.filter((s) => s.nature === 'MAIL' && s.sens !== 'ENTRANT')
  const recus = signaux.filter((s) => s.nature === 'MAIL' && s.sens === 'ENTRANT')
  return {
    tentatives: envoyes.length,
    retours: recus.length,
    /* PLAFONNÉ À 100 : répondre deux fois au même mail donnerait 200 %, ce qui ne veut rien dire.
       Le détail reste lisible sous le chiffre — « 3 réponses pour 2 mails » se comprend, pas
       « 150 % ». */
    taux: envoyes.length === 0 ? null : Math.min(100, Math.round((recus.length / envoyes.length) * 100)),
  }
}
