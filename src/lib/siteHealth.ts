import type { Compteur, Contrat, Mandat, Recommandation, Signal } from '@/types/domain'

export interface SiteHealth {
  score: number
  label: 'Bonne santé' | 'Attention' | 'Critique'
  tone: 'kiwi' | 'amber' | 'red'
  raisons: string[]
}

const SIGNAUX_FERMES = new Set(['CLOTURE', 'REFUSE', 'TRANSFORME'])
const VERSIONS_INACTIVES = new Set(['REFUSEE', 'EXPIREE', 'ARCHIVEE', 'REMPLACEE'])
const SEUIL_ECHEANCE_JOURS = 90

// Malus moyen par signal ouvert. Le champ gravité (poids_defaut de types_signaux,
// échelle 0-60) sert au tri de priorité des signaux ailleurs dans l'app — ce n'est
// pas l'échelle "4 à 10 pts" décrite pour ce score, donc on applique le poids moyen
// validé par l'exemple métier (3 signaux ouverts = -12, soit -4/signal).
const MALUS_SIGNAL_OUVERT = 4
const MALUS_PERIMETRE = 6
const BONUS_RECO_ACTIVE = 8

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
    const malus = signauxOuverts.length * MALUS_SIGNAL_OUVERT
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
  const label = score >= 80 ? 'Bonne santé' : score >= 50 ? 'Attention' : 'Critique'
  const tone = score >= 80 ? 'kiwi' : score >= 50 ? 'amber' : 'red'
  if (raisons.length === 0) raisons.push('Rien à signaler')

  return { score, label, tone, raisons }
}
