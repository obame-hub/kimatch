import { useMemo } from 'react'
import { useSignaux } from '@/lib/data/signaux'
import { useRecommandations } from '@/lib/data/recommandations'
import { useActions } from '@/lib/data/actions'
import { useContrats } from '@/lib/data/contrats'
import { useMandats } from '@/lib/data/mandats'

const SIGNAUX_FERMES = ['CLOTURE', 'REFUSE', 'TRANSFORME']
const RECOS_FERMEES = ['CLOTUREE', 'REFUSEE', 'ACCEPTEE']
const ACTIONS_FERMEES = ['TERMINEE', 'ANNULEE']
/** Un contrat « à suivre » n'est ni actif, ni terminé : il reste quelque chose à faire dessus. */
const CONTRATS_A_SUIVRE = ['NOUVEAU', 'EN_PREPARATION', 'A_SIGNER', 'SIGNE']

/** Nombre de jours écoulés depuis une date ISO. */
function joursDepuis(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / 86_400_000)
}

export interface LigneAction {
  id: string
  titre: string
  sousTitre: string
  /** Compte à rebours ou ancienneté, affiché à droite en police à chasse fixe. */
  echeance: string
  /** Vrai quand la ligne mérite d'être traitée en priorité (rouge plutôt qu'ambre). */
  urgent: boolean
  to: string
}

export interface GroupeAction {
  libelle: string
  lignes: LigneAction[]
  /** Message affiché quand le groupe est vide — plus utile qu'une liste vide. */
  siVide: string
}

export interface SectionAction {
  cle: 'mandat' | 'reco' | 'contrat' | 'signal'
  titre: string
  precision: string
  total: number
  groupes: GroupeAction[]
}

/**
 * Données du tableau de bord, organisées comme la maquette de William (11/08/2026) : quatre
 * indicateurs en tête, puis les listes d'actions à mener, regroupées par urgence.
 *
 * Les hooks utilisés chargent des tables entières. C'est acceptable ici — le tableau de bord est
 * une page d'arrivée, consultée une fois par session, et ces mêmes données sont déjà en cache pour
 * les autres écrans. Ne pas reproduire ce motif sur les fiches de détail.
 */
export function useDashboardStats() {
  const signaux = useSignaux()
  const recommandations = useRecommandations()
  const actions = useActions()
  const contrats = useContrats()
  const mandats = useMandats()

  const isLoading =
    signaux.isLoading || recommandations.isLoading || actions.isLoading || contrats.isLoading || mandats.isLoading

  const data = useMemo(() => {
    // ── Mandats à relancer : envoyés, jamais signés, et ça traîne ──────────────────────────
    const mandatsEnAttente = (mandats.data ?? [])
      .filter((m) => !m.date_signature && m.statut !== 'EXPIRE')
      .map((m) => ({ ...m, age: joursDepuis(m.date_envoi) }))
      .filter((m) => m.age !== null && m.age >= 7)
      .sort((a, b) => (b.age ?? 0) - (a.age ?? 0))

    const ligneMandat = (m: (typeof mandatsEnAttente)[number]): LigneAction => ({
      id: m.id,
      titre: m.compte_nom || 'Compte inconnu',
      sousTitre: m.date_envoi ? `Envoyé le ${new Date(m.date_envoi).toLocaleDateString('fr-FR')}` : 'Date d’envoi inconnue',
      echeance: `${m.age} j`,
      urgent: (m.age ?? 0) > 14,
      to: `/mandats/${m.id}`,
    })

    // ── Recommandations à traiter ──────────────────────────────────────────────────────────
    const recosOuvertes = (recommandations.data ?? []).filter((r) => !RECOS_FERMEES.includes(r.etape))
    const recosPretes = recosOuvertes.filter((r) => r.etape === 'PRETE')
    const recosEnCours = recosOuvertes.filter((r) => r.etape !== 'PRETE')

    const ligneReco = (r: (typeof recosOuvertes)[number], prete: boolean): LigneAction => ({
      id: r.id,
      titre: r.titre,
      sousTitre: r.compte_nom,
      echeance: prete ? 'Prête' : r.etape.replace(/_/g, ' ').toLowerCase(),
      urgent: prete,
      to: `/recommandations/${r.id}`,
    })

    // ── Contrats à suivre ─────────────────────────────────────────────────────────────────
    const contratsASuivre = (contrats.data ?? []).filter((c) => CONTRATS_A_SUIVRE.includes(c.statut))
    const contratsASigner = contratsASuivre.filter((c) => c.statut === 'A_SIGNER')
    const contratsAPreparer = contratsASuivre.filter((c) => c.statut !== 'A_SIGNER')

    const ligneContrat = (c: (typeof contratsASuivre)[number], aSigner: boolean): LigneAction => ({
      id: c.id,
      titre: c.compte_nom || c.site_nom || 'Contrat',
      sousTitre: [c.fournisseur_nom, c.type_energie === 'gaz' ? 'Gaz' : 'Électricité'].filter(Boolean).join(' · '),
      echeance: aSigner ? 'À signer' : c.statut.replace(/_/g, ' ').toLowerCase(),
      urgent: aSigner,
      to: `/contrats/${c.id}`,
    })

    // ── Signaux à traiter ─────────────────────────────────────────────────────────────────
    const signauxOuvertsList = (signaux.data ?? []).filter((s) => !SIGNAUX_FERMES.includes(s.statut))
    const signauxNouveaux = signauxOuvertsList.filter((s) => s.statut === 'NOUVEAU')
    const signauxEnCours = signauxOuvertsList.filter((s) => s.statut !== 'NOUVEAU')

    const ligneSignal = (s: (typeof signauxOuvertsList)[number], nouveau: boolean): LigneAction => ({
      id: s.id,
      titre: s.site_nom || 'Signal',
      sousTitre: s.type_signal || 'Signal',
      echeance: nouveau ? 'Nouveau' : s.statut.replace(/_/g, ' ').toLowerCase(),
      urgent: nouveau,
      to: `/signaux/${s.id}`,
    })

    // Les listes sont bornées à 6 lignes : au-delà, l'écran devient une liste et non un tableau
    // de bord. Le compteur de la section indique le total, et un lien mène à la liste complète.
    const LIMITE = 6

    const sections: SectionAction[] = [
      {
        cle: 'signal',
        titre: 'Signaux à traiter',
        precision: 'opportunités détectées, non encore qualifiées',
        total: signauxOuvertsList.length,
        groupes: [
          { libelle: 'Nouveaux', lignes: signauxNouveaux.slice(0, LIMITE).map((s) => ligneSignal(s, true)), siVide: 'Aucun signal nouveau.' },
          { libelle: 'En cours de qualification', lignes: signauxEnCours.slice(0, LIMITE).map((s) => ligneSignal(s, false)), siVide: 'Aucun signal en cours.' },
        ],
      },
      {
        cle: 'reco',
        titre: 'Opportunités à traiter',
        precision: 'en attente d’une action de votre part',
        total: recosOuvertes.length,
        groupes: [
          { libelle: 'Prêtes à présenter', lignes: recosPretes.slice(0, LIMITE).map((r) => ligneReco(r, true)), siVide: 'Aucune opportunité prête.' },
          { libelle: 'En préparation', lignes: recosEnCours.slice(0, LIMITE).map((r) => ligneReco(r, false)), siVide: 'Aucune opportunité en préparation.' },
        ],
      },
      {
        cle: 'mandat',
        titre: 'Mandats à relancer',
        precision: 'sans signature depuis 7 jours ou plus',
        total: mandatsEnAttente.length,
        groupes: [
          {
            libelle: 'Plus de 14 jours',
            lignes: mandatsEnAttente.filter((m) => (m.age ?? 0) > 14).slice(0, LIMITE).map(ligneMandat),
            siVide: 'Aucun mandat en souffrance.',
          },
          {
            libelle: '7 à 14 jours',
            lignes: mandatsEnAttente.filter((m) => (m.age ?? 0) <= 14).slice(0, LIMITE).map(ligneMandat),
            siVide: 'Aucun mandat récent à relancer.',
          },
        ],
      },
      {
        cle: 'contrat',
        titre: 'Contrats à suivre',
        precision: 'ni actifs ni terminés — il reste une étape',
        total: contratsASuivre.length,
        groupes: [
          { libelle: 'À signer', lignes: contratsASigner.slice(0, LIMITE).map((c) => ligneContrat(c, true)), siVide: 'Aucun contrat à signer.' },
          { libelle: 'En préparation', lignes: contratsAPreparer.slice(0, LIMITE).map((c) => ligneContrat(c, false)), siVide: 'Aucun contrat en préparation.' },
        ],
      },
    ]

    return {
      // Indicateurs de tête
      signauxOuverts: signauxOuvertsList.length,
      signauxNouveaux: signauxNouveaux.length,
      recommandationsEnCours: recosOuvertes.length,
      recosPretes: recosPretes.length,
      mandatsARelancer: mandatsEnAttente.length,
      mandatsTresEnRetard: mandatsEnAttente.filter((m) => (m.age ?? 0) > 14).length,
      contratsASuivre: contratsASuivre.length,
      contratsASigner: contratsASigner.length,
      actionsEnAttente: (actions.data ?? []).filter((a) => !ACTIONS_FERMEES.includes(a.statut)).length,

      sections,
      // Conservés pour les écrans qui s'en servent déjà.
      actionsPrioritaires: (actions.data ?? []).slice(0, 4),
      signauxRecents: signauxOuvertsList.slice(0, 5),
    }
  }, [signaux.data, recommandations.data, actions.data, contrats.data, mandats.data])

  return { data, isLoading }
}
