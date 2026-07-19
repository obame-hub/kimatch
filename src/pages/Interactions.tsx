import { useNavigate } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { useInteractions } from '@/lib/data/interactions'

export default function Interactions() {
  const { data: interactions, isLoading } = useInteractions()
  const navigate = useNavigate()

  return (
    <div>
      <Topbar title="Interactions" />
      <div className="p-6">
        <PageHeader
          title="Interactions"
          description="Historique des échanges (appels, emails, réunions) avec les comptes et contacts."
        />

        <div className="space-y-2.5">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {interactions?.map((i) => (
            <Card
              key={i.id}
              onClick={() => navigate(`/interactions/${i.id}`)}
              className="animate-fade-up flex cursor-pointer items-start justify-between gap-4 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                  <MessageSquare className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-navy-800">{i.objet || i.type_interaction}</p>
                  <p className="text-xs text-navy-500">
                    {i.compte_id ? <EntityLink to={`/comptes/${i.compte_id}`}>{i.compte_nom}</EntityLink> : i.compte_nom}
                    {i.site_id && (
                      <>
                        {' · '}
                        <EntityLink to={`/sites/${i.site_id}`}>{i.site_nom}</EntityLink>
                      </>
                    )}
                    {i.contact_id && (
                      <>
                        {' · '}
                        <EntityLink to={`/contacts/${i.contact_id}`}>{i.contact_nom}</EntityLink>
                      </>
                    )}
                    {' · '}{i.auteur}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge tone="neutral">{i.type_interaction}</Badge>
                <span className="text-xs text-navy-400">{new Date(i.date_interaction).toLocaleDateString('fr-FR')}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
