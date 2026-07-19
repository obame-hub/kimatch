import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { useInteractions } from '@/lib/data/interactions'

export default function InteractionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: interactions } = useInteractions()
  const interaction = interactions?.find((i) => i.id === id)

  return (
    <div>
      <Topbar title={interaction?.objet || interaction?.type_interaction || 'Interaction'} />
      <div className="p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/interactions')}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux interactions
        </Button>

        {!interaction ? (
          <p className="text-sm text-navy-500">Interaction introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <CardTitle className="font-display text-base">{interaction.objet || interaction.type_interaction}</CardTitle>
                </div>
                <Badge tone="neutral">{interaction.type_interaction}</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-0 space-y-3 text-sm">
              <p>
                <span className="text-navy-400">Compte :</span>{' '}
                {interaction.compte_id ? (
                  <EntityLink to={`/comptes/${interaction.compte_id}`}>{interaction.compte_nom}</EntityLink>
                ) : (
                  interaction.compte_nom || '—'
                )}
              </p>
              <p>
                <span className="text-navy-400">Site :</span>{' '}
                {interaction.site_id ? (
                  <EntityLink to={`/sites/${interaction.site_id}`}>{interaction.site_nom}</EntityLink>
                ) : (
                  interaction.site_nom || '—'
                )}
              </p>
              {interaction.contact_nom && (
                <p>
                  <span className="text-navy-400">Contact :</span>{' '}
                  {interaction.contact_id ? (
                    <EntityLink to={`/contacts/${interaction.contact_id}`}>{interaction.contact_nom}</EntityLink>
                  ) : (
                    interaction.contact_nom
                  )}
                </p>
              )}
              {interaction.sens && (
                <p><span className="text-navy-400">Sens :</span> {interaction.sens}</p>
              )}
              {interaction.resume && (
                <p><span className="text-navy-400">Résumé :</span> {interaction.resume}</p>
              )}
              {interaction.resultat && (
                <p><span className="text-navy-400">Résultat :</span> {interaction.resultat}</p>
              )}
              {interaction.issue_libelle && (
                <p><span className="text-navy-400">Motif / issue :</span> <Badge tone="amber">{interaction.issue_libelle}</Badge></p>
              )}
              <p><span className="text-navy-400">Auteur :</span> {interaction.auteur}</p>
              <p><span className="text-navy-400">Date :</span> {new Date(interaction.date_interaction).toLocaleDateString('fr-FR')}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
