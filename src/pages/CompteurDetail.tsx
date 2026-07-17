import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Flame } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useCompteurs } from '@/lib/data/compteurs'

export default function CompteurDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: compteurs } = useCompteurs()
  const compteur = compteurs?.find((c) => c.id === id)

  return (
    <div>
      <Topbar title={compteur ? `Compteur ${compteur.numero_pdl}` : 'Compteur'} />
      <div className="p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/compteurs')}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux compteurs
        </Button>

        {!compteur ? (
          <p className="text-sm text-navy-500">Compteur introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <CardTitle>Détail du compteur</CardTitle>
            </CardHeader>
            <CardContent className="px-0 space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <span
                  className={
                    'flex h-10 w-10 items-center justify-center rounded-lg ' +
                    (compteur.type_energie === 'electricite' ? 'bg-amber-gradient text-white' : 'bg-navy-800 text-white')
                  }
                >
                  {compteur.type_energie === 'electricite' ? <Zap className="h-5 w-5" /> : <Flame className="h-5 w-5" />}
                </span>
                <div>
                  <p className="font-display font-medium text-navy-800">{compteur.utilisation}</p>
                  <p className="font-mono text-xs text-navy-400">{compteur.numero_pdl}</p>
                </div>
              </div>
              <p><span className="text-navy-400">Type d'énergie :</span> {compteur.type_energie === 'electricite' ? 'Électricité' : 'Gaz'}</p>
              <p><span className="text-navy-400">Statut :</span> <Badge tone={compteur.statut === 'actif' ? 'kiwi' : 'neutral'}>{compteur.statut}</Badge></p>
              <p
                className="cursor-pointer text-navy-600 hover:text-kiwi-700 hover:underline"
                onClick={() => navigate(`/sites/${compteur.site_id}`)}
              >
                Site : {compteur.site_nom} →
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
