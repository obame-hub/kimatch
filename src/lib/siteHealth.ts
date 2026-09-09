import type { Compteur, Contrat, Mandat, Recommandation } from '@/types/domain'

export interface SiteHealth {
  score: number
  label: 'Bonne santé' | 'Attention' | 'Critique'
  tone: 'kiwi' | 'amber' | 'red'
  raisons: string[]
}

// Une version morte n'a plus qu'un statut : « Clôturée » (Michel, 28/08/2026). Les anciens codes
// restent listés pour les données non encore migrées et l'historique.
const VERSIONS_INACTIVES = new Set(['CLOTUREE', 'REFUSEE', 'EXPIREE', 'ARCHIVEE', 'REMPLACEE'])
const SEUIL_ECHEANCE_JOURS = 90

/* ══ LES SIGNAUX NE PÈSENT PLUS SUR LA SANTÉ D'UN SITE ═════════════════════════════════════════

   Naoëlle, 02/09/2026 : le sujet quitte toute l'application (voir `cycleNavItems`). Un malus
   qu'aucun écran n'explique plus serait pire que pas de malus du tout — on verrait un site à 62
   sans savoir pourquoi, et sans aucun moyen d'aller voir.

   829 signaux sont ouverts en base (819 « Nouveau », 10 « À qualifier ») : c'est beaucoup de sites
   dont le score remonte. C'est voulu, et c'est la conséquence assumée du retrait.

   La fonction `liste_sites` continue de calculer `malus_signaux` en base — rien n'y est supprimé,
   conformément à la consigne. `construireSante` le REND au score plutôt que de le taire. */
const MALUS_PERIMETRE = 6
const BONUS_RECO_ACTIVE = 8

function malusEcheance(joursRestants: number): number {
  return Math.min(20, Math.round((20 * (90 - joursRestants)) / 90))
}

export function computeSiteHealth({
  contrats,
  recommandations,
  mandat,
  compteurs,
}: {
  contrats: Contrat[]
  recommandations: Recommandation[]
  mandat: Mandat | undefined
  compteurs: Compteur[]
}): SiteHealth {
  let score = 100
  const raisons: string[] = []

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

/* ── `EcheanceSante` ET `construireSante` SONT PARTIS AVEC LA LISTE DES SITES ─────────────────
   Ces deux exports n'existaient que pour habiller le score que la fonction SQL `liste_sites`
   renvoyait tout calculé. L'écran de liste supprimé le 09/09/2026 et la fonction avec lui, ils
   n'avaient plus un seul lecteur.

   `computeSiteHealth` ci-dessus reste : c'est la version qui calcule le score DANS le navigateur,
   et c'est elle que la fiche site et la carte du compte utilisent. Les deux voies existaient pour
   que la liste et la fiche décrivent un site avec les mêmes mots ; il n'y a plus qu'une voie, donc
   plus de risque de divergence à surveiller. */
