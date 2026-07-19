import type { ActionItem, Compteur, Contrat, Mandat, Recommandation, Signal } from '@/types/domain'

export interface SiteHealth {
  score: number
  label: 'Sain' | 'À surveiller' | 'Critique'
  tone: 'kiwi' | 'amber' | 'red'
  raisons: string[]
}

const SEVERITE_PENALTY: Record<Signal['severite'], number> = { basse: 5, normale: 10, haute: 15, critique: 25 }
const SIGNAUX_FERMES = new Set(['CLOTURE', 'REFUSE', 'TRANSFORME'])
const VERSIONS_INACTIVES = new Set(['REFUSEE', 'EXPIREE', 'ARCHIVEE', 'REMPLACEE'])
const SEUIL_ECHEANCE_JOURS = 90

function estSnooze(signal: Signal): boolean {
  return !!signal.date_snooze && new Date(signal.date_snooze).getTime() > Date.now()
}

export function computeSiteHealth({
  signaux,
  contrats,
  recommandations,
  mandat,
  actions,
  compteurs,
}: {
  signaux: Signal[]
  contrats: Contrat[]
  recommandations: Recommandation[]
  mandat: Mandat | undefined
  actions: ActionItem[]
  compteurs: Compteur[]
}): SiteHealth {
  let score = 100
  const raisons: string[] = []

  const signauxOuverts = signaux.filter((s) => !SIGNAUX_FERMES.has(s.statut) && !estSnooze(s))
  if (signauxOuverts.length > 0) {
    for (const s of signauxOuverts) score -= SEVERITE_PENALTY[s.severite] ?? 10
    raisons.push(`${signauxOuverts.length} signal${signauxOuverts.length > 1 ? 'aux' : ''} ouvert${signauxOuverts.length > 1 ? 's' : ''}`)
  }

  if (!mandat || mandat.statut !== 'ACTIF') {
    score -= 20
    raisons.push('Aucun mandat actif')
  }

  let compteursNonCouverts = 0
  for (const c of compteurs) {
    const contratsDuCompteur = contrats.filter((ct) => ct.compteurs.some((cc) => cc.id === c.id))
    const contratActif = contratsDuCompteur.find((ct) => ct.statut === 'ACTIF') ?? contratsDuCompteur[0]
    if (!contratActif?.date_fin) continue
    const jours = Math.floor((new Date(contratActif.date_fin).getTime() - Date.now()) / 86400000)
    if (jours > SEUIL_ECHEANCE_JOURS) continue
    const couvert = recommandations.some((r) =>
      r.versions.some((v) => !VERSIONS_INACTIVES.has(v.statut) && v.compteur_ids.includes(c.id)),
    )
    if (!couvert) compteursNonCouverts++
  }
  if (compteursNonCouverts > 0) {
    score -= compteursNonCouverts * 15
    raisons.push(`${compteursNonCouverts} compteur${compteursNonCouverts > 1 ? 's' : ''} avec échéance proche sans recommandation active`)
  }

  const now = Date.now()
  const actionsEnRetard = actions.filter(
    (a) => a.statut !== 'TERMINEE' && a.statut !== 'ANNULEE' && a.echeance && new Date(a.echeance).getTime() < now,
  )
  if (actionsEnRetard.length > 0) {
    score -= actionsEnRetard.length * 5
    raisons.push(`${actionsEnRetard.length} tâche${actionsEnRetard.length > 1 ? 's' : ''} en retard`)
  }

  score = Math.max(0, Math.min(100, score))
  const label = score >= 80 ? 'Sain' : score >= 50 ? 'À surveiller' : 'Critique'
  const tone = score >= 80 ? 'kiwi' : score >= 50 ? 'amber' : 'red'
  if (raisons.length === 0) raisons.push('Rien à signaler')

  return { score, label, tone, raisons }
}
