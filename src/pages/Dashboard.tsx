import { useNavigate } from 'react-router-dom'
import { Radio, ListChecks, FileText, MapPin } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { StatCard } from '@/components/ui/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useDashboardStats } from '@/lib/data/dashboard'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_SIGNAUX, FALLBACK_STATUTS_ACTIONS, STATUT_ACTION_TONE } from '@/lib/referenceFallbacks'
import { SignalTypeChart } from '@/components/charts/SignalTypeChart'

const SIGNAL_TONE: Record<string, 'neutral' | 'amber' | 'kiwi' | 'blue'> = {
  NOUVEAU: 'neutral',
  A_CONTACTER: 'amber',
  CONTACTE: 'blue',
  REPORTE: 'neutral',
  INTERET_CONFIRME: 'kiwi',
  REFUSE: 'neutral',
  TRANSFORME: 'kiwi',
  CLOTURE: 'neutral',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { data } = useDashboardStats()
  const { data: statutsSignauxRef } = useReferenceTable('statuts_signaux')
  const { data: statutsActionsRef } = useReferenceTable('statuts_actions')
  const statutsSignaux = statutsSignauxRef && statutsSignauxRef.length > 0 ? statutsSignauxRef : FALLBACK_STATUTS_SIGNAUX
  const statutsActions = statutsActionsRef && statutsActionsRef.length > 0 ? statutsActionsRef : FALLBACK_STATUTS_ACTIONS

  return (
    <div>
      <Topbar title="Tableau de bord" />
      <div className="p-4 sm:p-6">
        <div className="mb-6 animate-fade-up overflow-hidden rounded-xl bg-navy-950 px-6 py-7 text-white shadow-card">
          <div className="relative">
            <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-kiwi-500/25 blur-3xl" />
            <p className="font-display text-2xl font-semibold">Bonjour 👋</p>
            <p className="mt-1 max-w-lg text-sm text-navy-300">
              Voici les signaux, actions et recommandations qui méritent votre attention aujourd'hui — du patrimoine énergétique à la recommandation.
            </p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Signaux ouverts" value={data?.signauxOuverts ?? 0} icon={Radio} tone="amber" />
          <StatCard label="Actions en attente" value={data?.actionsEnAttente ?? 0} icon={ListChecks} tone="navy" />
          <StatCard label="Recommandations en cours" value={data?.recommandationsEnCours ?? 0} icon={FileText} tone="kiwi" />
          <StatCard label="Sites actifs" value={data?.sitesActifs ?? 0} icon={MapPin} tone="navy" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="animate-fade-up lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-display text-base">Signaux récents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data?.signauxRecents.map((signal) => {
                const label = statutsSignaux.find((s) => s.code === signal.statut)?.libelle ?? signal.statut
                return (
                  <div
                    key={signal.id}
                    onClick={() => navigate(`/sites/${signal.site_id}`)}
                    className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-navy-100 p-3 transition-colors hover:bg-navy-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-navy-800">{signal.site_nom}</p>
                      <p className="text-xs text-navy-500">{signal.type_signal}</p>
                    </div>
                    <Badge tone={SIGNAL_TONE[signal.statut] ?? 'neutral'}>{label}</Badge>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card className="animate-fade-up">
            <CardHeader>
              <CardTitle className="font-display text-base">Répartition des signaux</CardTitle>
            </CardHeader>
            <CardContent>
              <SignalTypeChart signaux={data?.signauxRecents ?? []} />
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4 animate-fade-up">
          <CardHeader>
            <CardTitle className="font-display text-base">Dossiers prioritaires</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data?.actionsPrioritaires.map((action) => {
              const label = statutsActions.find((s) => s.code === action.statut)?.libelle ?? action.statut
              return (
                <div
                  key={action.id}
                  onClick={() => action.site_id && navigate(`/sites/${action.site_id}`)}
                  className={`flex items-start justify-between gap-3 rounded-lg border border-navy-100 p-3 transition-colors hover:bg-navy-50 ${action.site_id ? 'cursor-pointer' : ''}`}
                >
                  <div>
                    <p className="text-sm font-medium text-navy-800">{action.type_action}</p>
                    <p className="text-xs text-navy-500">{action.cible_label} · {action.responsable}</p>
                  </div>
                  <Badge tone={STATUT_ACTION_TONE[action.statut] ?? 'neutral'}>{label}</Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
