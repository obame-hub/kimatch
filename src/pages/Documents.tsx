import { useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { useDocuments } from '@/lib/data/documents'
import { entityRoute } from '@/lib/entityRoute'

export default function Documents() {
  const { data: documents, isLoading } = useDocuments()
  const navigate = useNavigate()

  return (
    <div>
      <Topbar title="Documents" />
      <div className="p-6">
        <PageHeader
          title="Documents"
          description="Tous les documents (mandats, factures, contrats, recommandations) centralisés en un seul endroit."
        />

        <div className="space-y-2.5">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {documents?.map((doc) => (
            <Card
              key={doc.id}
              onClick={() => navigate(`/documents/${doc.id}`)}
              className="animate-fade-up flex cursor-pointer items-center justify-between gap-4 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-navy-800">{doc.nom}</p>
                  <p className="text-xs text-navy-500">
                    {entityRoute(doc.entite_type, doc.entite_id) ? (
                      <EntityLink to={entityRoute(doc.entite_type, doc.entite_id) as string}>{doc.objet_lie}</EntityLink>
                    ) : (
                      doc.objet_lie
                    )}
                    {' · '}{doc.auteur}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone="neutral">{doc.type_document}</Badge>
                <span className="text-xs text-navy-400">{new Date(doc.date_creation).toLocaleDateString('fr-FR')}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
