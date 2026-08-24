import type { Compteur, Contrat, Mandat, Recommandation, Signal } from '@/types/domain'

export interface SiteHealth {
  score: number
  label: 'Bonne santé' | 'Attention' | 'Critique'
  tone: 'kiwi' | 'amber' | 'red'
  raisons: string[]
}

const SIGNAUX_FERMES = new Set(['CONVERTI', 'ECARTE'])
const VERSIONS_INACTIVES = new Set(['REFUSEE', 'EXPIREE', 'ARCHIVEE', 'REMPLACEE'])
const SEUIL_ECHEANCE_JOURS = 90

// Malus par signal ouvert, pondéré par sa gravité individuelle (colonne signaux.gravite,
// 0-100, ajoutée par Michel — indépendante de poids_defaut sur types_signaux qui sert
// au tri de priorité ailleurs dans l'app). On la ramène sur l'échelle -4 (mineur) à -10
// (critique) décrite dans le doc métier ; en son absence (signal pas encore qualifié),
// on retombe sur le poids moyen validé par l'exemple (3 signaux ouverts = -12, soit -4/signal).
const MALUS_SIGNAL_MIN = 4
const MALUS_SIGNAL_MAX = 10
const MALUS_PERIMETRE = 6
const BONUS_RECO_ACTIVE = 8

function malusSignal(gravite: number | null): number {
  if (gravite == null) return MALUS_SIGNAL_MIN
  return Math.round(MALUS_SIGNAL_MIN + (gravite / 100) * (MALUS_SIGNAL_MAX - MALUS_SIGNAL_MIN))
}

function malusEcheance(joursRestants: number): number {
  return Math.min(20, Math.round((20 * (90 - joursRestants)) / 90))
}

export function computeSiteHealth({
  signaux,
  contrats,
  recommandations,
  mandat,
  compteurs,
}: {
  signaux: Signal[]
  contrats: Contrat[]
  recommandations: Recommandation[]
  mandat: Mandat | undefined
  compteurs: Compteur[]
}): SiteHealth {
  let score = 100
  const raisons: string[] = []

  const signauxOuverts = signaux.filter((s) => !SIGNAUX_FERMES.has(s.statut))
  if (signauxOuverts.length > 0) {
    const malus = signauxOuverts.reduce((sum, s) => sum + malusSignal(s.gravite), 0)
    score -= malus
    raisons.push(`${signauxOuverts.length} ${signauxOuverts.length > 1 ? 'signaux' : 'signal'} ouvert${signauxOuverts.length > 1 ? 's' : ''} (-${malus})`)
  }

  if (!mandat || mandat.statut !== 'ACTIF') {
    score -= MALUS_PERIMETRE
    raisons.push(`Hors périmètre du mandat actif (-${MALUS_PERIMETRE})`)
  }

  for (const c of compteurs) {
    const contratsDuCompteur = contrats.filter((ct) => ct.compteurs.some((cc) => cc.id === c.id))
    const contratActif = contratsDuCompteur.find((ct) => ct.statut === 'ACTIF') ?? contratsDuCompteur[0]
    if (!contratActif?.date_fin) continue
    const joursRestants = Math.floor((new Date(contratActif.date_fin).getTime() - Date.now()) / 86400000)
    if (joursRestants >= SEUIL_ECHEANCE_JOURS) continue

    const malus = malusEcheance(joursRestants)
    score -= malus
    raisons.push(`Échéance ${c.utilisation || c.numero_pdl} dans ${Math.max(0, joursRestants)} j (-${malus})`)

    const couvert = recommandations.some((r) =>
      r.versions.some((v) => !VERSIONS_INACTIVES.has(v.statut) && v.compteur_ids.includes(c.id)),
    )
    if (couvert) {
      score += BONUS_RECO_ACTIVE
      raisons.push(`Recommandation active sur cette échéance (+${BONUS_RECO_ACTIVE})`)
    }
  }

  score = Math.max(0, Math.min(100, score))
  if (raisons.length === 0) raisons.push('Rien à signaler')

  return { ...habiller(score), raisons }
}

/** Seuils d'affichage, partagés par les deux chemins de calcul. */
function habiller(score: number): Omit<SiteHealth, 'raisons'> {
  return { score, label: labelDuScore(score), tone: tonDuScore(score) }
}

export function labelDuScore(score: number): SiteHealth['label'] {
  return score >= 80 ? 'Bonne santé' : score >= 50 ? 'Attention' : 'Critique'
}

/** Couleur seule — ce dont la carte a besoin, sans avoir à reconstruire un détail qu'elle n'affiche pas. */
export function tonDuScore(score: number): SiteHealth['tone'] {
  return score >= 80 ? 'kiwi' : score >= 50 ? 'amber' : 'red'
}

/** Une échéance proche, telle que la fonction `liste_sites` la renvoie. */
export interface EcheanceSante {
  libelle: string
  jours: number
  malus: number
  couvert: boolean
}

/**
 * Santé d'un site calculée EN BASE (fonction `liste_sites`).
 *
 * Le score arrive tout fait ; il ne reste qu'à rédiger l'infobulle qui explique d'où il vient.
 * Le texte est volontairement écrit ici, mot pour mot comme dans computeSiteHealth ci-dessus :
 * la base compte, l'interface rédige. Les deux formulations doivent rester identiques, sinon un
 * même site se décrirait différemment selon qu'on le regarde dans la liste ou sur sa fiche.
 */
export function construireSante(ligne: {
  score_sante: number
  nb_signaux_ouverts: number
  malus_signaux: number
  sous_mandat_actif: boolean
  echeances: EcheanceSante[] | null
}): SiteHealth {
  const raisons: string[] = []

  const n = ligne.nb_signaux_ouverts
  if (n > 0) raisons.push(`${n} ${n > 1 ? 'signaux' : 'signal'} ouvert${n > 1 ? 's' : ''} (-${ligne.malus_signaux})`)

  if (!ligne.sous_mandat_actif) raisons.push(`Hors périmètre du mandat actif (-${MALUS_PERIMETRE})`)

  for (const e of ligne.echeances ?? []) {
    raisons.push(`Échéance ${e.libelle} dans ${Math.max(0, e.jours)} j (-${e.malus})`)
    if (e.couvert) raisons.push(`Recommandation active sur cette échéance (+${BONUS_RECO_ACTIVE})`)
  }

  if (raisons.length === 0) raisons.push('Rien à signaler')

  return { ...habiller(ligne.score_sante), raisons }
}
