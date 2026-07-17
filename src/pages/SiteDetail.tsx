import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSites } from '@/lib/data/sites'
import { useSignaux } from '@/lib/data/signaux'

export default function SiteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: sites } = useSites()
  const { data: signaux } = useSignaux()

  const site = sites?.find((s) => s.id === id)
  const signauxDuSite = signaux?.filter((s) => s.site_id === id) ?? []

  return (
    <div>
      <Topbar title={site?.nom ?? 'Site'} />
      <div className="p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/sites')}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux sites
        </Button>

        {!site ? (
          <p className="text-sm text-navy-500">Site introuvable.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Informations générales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="text-navy-400">Compte :</span> {site.compte_nom}</p>
                <p><span className="text-navy-400">Type :</span> {site.type_site}</p>
                <p><span className="text-navy-400">Adresse :</span> {site.ville} ({site.code_postal})</p>
                <p><span className="text-navy-400">Compteurs :</span> {site.nb_compteurs}</p>
                <p><span className="text-navy-400">Statut :</span> <Badge tone={site.statut === 'actif' ? 'kiwi' : 'neutral'}>{site.statut}</Badge></p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Signaux liés à ce site</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {signauxDuSite.length === 0 && <p className="text-sm text-navy-400">Aucun signal ouvert.</p>}
                {signauxDuSite.map((signal) => (
                  <div key={signal.id} className="rounded-lg border border-navy-100 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-navy-800">{signal.type_signal}</p>
                      <Badge tone="amber">{signal.priorite}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-navy-500">{signal.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
