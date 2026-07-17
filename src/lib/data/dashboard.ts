import { useMemo } from 'react'
import { useSignaux } from '@/lib/data/signaux'
import { useSites } from '@/lib/data/sites'
import { useRecommandations } from '@/lib/data/recommandations'
import { useActions } from '@/lib/data/actions'

const SIGNAUX_FERMES = ['CLOTURE', 'REFUSE', 'TRANSFORME']
const RECOMMANDATIONS_FERMEES = ['CLOTUREE', 'REFUSEE']
const ACTIONS_FERMEES = ['TERMINEE', 'ANNULEE']

export function useDashboardStats() {
  const signaux = useSignaux()
  const sites = useSites()
  const recommandations = useRecommandations()
  const actions = useActions()

  const isLoading = signaux.isLoading || sites.isLoading || recommandations.isLoading || actions.isLoading

  const data = useMemo(() => {
    const signauxOuverts = (signaux.data ?? []).filter((s) => !SIGNAUX_FERMES.includes(s.statut)).length
    const actionsEnAttente = (actions.data ?? []).filter((a) => !ACTIONS_FERMEES.includes(a.statut)).length
    const recommandationsEnCours = (recommandations.data ?? []).filter((r) => !RECOMMANDATIONS_FERMEES.includes(r.etape)).length
    const sitesActifs = (sites.data ?? []).filter((s) => s.statut === 'actif').length

    return {
      signauxOuverts,
      actionsEnAttente,
      recommandationsEnCours,
      sitesActifs,
      actionsPrioritaires: (actions.data ?? []).slice(0, 4),
      signauxRecents: (signaux.data ?? []).slice(0, 5),
    }
  }, [signaux.data, sites.data, recommandations.data, actions.data])

  return { data, isLoading }
}
