import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Star } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { useContacts } from '@/lib/data/contacts'

export default function ContactDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: contacts } = useContacts()
  const contact = contacts?.find((c) => c.id === id)

  return (
    <div>
      <Topbar title={contact ? `${contact.prenom} ${contact.nom}` : 'Contact'} />
      <div className="p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/contacts')}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux contacts
        </Button>

        {!contact ? (
          <p className="text-sm text-navy-500">Contact introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                    <User className="h-5 w-5" />
                  </span>
                  <CardTitle className="font-display text-base">{contact.civilite ? `${contact.civilite} ` : ''}{contact.prenom} {contact.nom}</CardTitle>
                </div>
                {contact.contact_principal && (
                  <Badge tone="amber"><Star className="h-3 w-3" /> Contact principal</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-0 space-y-3 text-sm">
              <p><span className="text-navy-400">Compte :</span> <EntityLink to={`/comptes/${contact.compte_id}`}>{contact.compte_nom}</EntityLink></p>
              <p><span className="text-navy-400">Fonction :</span> {contact.fonction || '—'}</p>
              <p><span className="text-navy-400">Téléphone :</span> {contact.telephone || '—'}</p>
              <p><span className="text-navy-400">Email :</span> {contact.email || '—'}</p>
              <p><span className="text-navy-400">Statut :</span> <Badge tone={contact.actif ? 'kiwi' : 'neutral'}>{contact.actif ? 'actif' : 'inactif'}</Badge></p>
              {contact.sites.length > 0 && (
                <div>
                  <span className="text-navy-400">Sites :</span>
                  <div className="mt-1.5 space-y-1">
                    {contact.sites.map((s) => (
                      <p key={s.id}>
                        <EntityLink to={`/sites/${s.id}`}>{s.nom}</EntityLink>
                        {s.fonction_sur_site && <span className="text-navy-400"> — {s.fonction_sur_site}</span>}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
