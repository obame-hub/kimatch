import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { useMandats } from '@/lib/data/mandats'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_MANDATS, STATUT_MANDAT_TONE } from '@/lib/referenceFallbacks'

export default function MandatDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: mandats } = useMandats()
  const { data: statutsRef } = useReferenceTable('statuts_mandats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_MANDATS
  const mandat = mandats?.find((m) => m.id === id)

  return (
    <div>
      <Topbar title={mandat ? `Mandat — ${mandat.compte_nom}` : 'Mandat'} />
      <div className="p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/mandats')}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux mandats
        </Button>

        {!mandat ? (
          <p className="text-sm text-navy-500">Mandat introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <CardTitle><EntityLink to={`/comptes/${mandat.compte_id}`}>{mandat.compte_nom}</EntityLink></CardTitle>
            </CardHeader>
            <CardContent className="px-0 space-y-3 text-sm">
              <p>
                <span className="text-navy-400">Statut :</span>{' '}
                <Badge tone={STATUT_MANDAT_TONE[mandat.statut] ?? 'neutral'}>
                  {statuts.find((s) => s.code === mandat.statut)?.libelle ?? mandat.statut}
                </Badge>
              </p>
              <p><span className="text-navy-400">Sites couverts :</span> {mandat.nb_sites_couverts}</p>
              <p><span className="text-navy-400">Date de signature :</span> {mandat.date_signature ? new Date(mandat.date_signature).toLocaleDateString('fr-FR') : '—'}</p>
              {mandat.contact_signataire_nom && (
                <p>
                  <span className="text-navy-400">Contact signataire :</span>{' '}
                  {mandat.contact_signataire_id ? (
                    <EntityLink to={`/contacts/${mandat.contact_signataire_id}`}>{mandat.contact_signataire_nom}</EntityLink>
                  ) : (
                    mandat.contact_signataire_nom
                  )}
                </p>
              )}
              <p className="text-xs text-navy-400">
                Le mandat définit le périmètre de sites que KiWee est autorisé à analyser — une recommandation peut ne porter que sur une partie de ce périmètre.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
