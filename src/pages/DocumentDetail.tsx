import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { useDocuments } from '@/lib/data/documents'
import { entityRoute } from '@/lib/entityRoute'

export default function DocumentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: documents } = useDocuments()
  const doc = documents?.find((d) => d.id === id)

  return (
    <div>
      <Topbar title={doc?.nom ?? 'Document'} />
      <div className="p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/documents')}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux documents
        </Button>

        {!doc ? (
          <p className="text-sm text-navy-500">Document introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                  <FileText className="h-5 w-5" />
                </span>
                <CardTitle className="font-display text-base">{doc.nom}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-0 space-y-3 text-sm">
              <p><span className="text-navy-400">Type :</span> <Badge tone="neutral">{doc.type_document}</Badge></p>
              <p>
                <span className="text-navy-400">Objet lié :</span>{' '}
                {entityRoute(doc.entite_type, doc.entite_id) ? (
                  <EntityLink to={entityRoute(doc.entite_type, doc.entite_id) as string}>{doc.objet_lie}</EntityLink>
                ) : (
                  doc.objet_lie
                )}
              </p>
              <p><span className="text-navy-400">Auteur :</span> {doc.auteur}</p>
              <p><span className="text-navy-400">Date :</span> {new Date(doc.date_creation).toLocaleDateString('fr-FR')}</p>
              {doc.url && (
                <p>
                  <a href={doc.url} target="_blank" rel="noreferrer" className="text-kiwi-700 underline hover:text-kiwi-800">
                    Ouvrir le document ↗
                  </a>
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
