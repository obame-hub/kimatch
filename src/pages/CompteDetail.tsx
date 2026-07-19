import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Gauge, Loader2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useComptes, useUpdateCompteScore } from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'
import { useContacts } from '@/lib/data/contacts'
import { useEllisphereScore } from '@/lib/data/ellisphere'
import type { TypeCompte } from '@/types/domain'

const typeMeta: Record<TypeCompte, { label: string; tone: 'kiwi' | 'blue' | 'amber' | 'neutral' }> = {
  client: { label: 'Client', tone: 'kiwi' },
  fournisseur: { label: 'Fournisseur', tone: 'blue' },
  partenaire: { label: 'Partenaire', tone: 'amber' },
  kiwee: { label: 'KiWee', tone: 'neutral' },
}

export default function CompteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: contacts } = useContacts()
  const ellisphereScore = useEllisphereScore()
  const updateScore = useUpdateCompteScore()
  const compte = comptes?.find((c) => c.id === id)
  const sitesDuCompte = sites?.filter((s) => s.compte_nom === compte?.nom) ?? []
  const contactsDuCompte = contacts?.filter((c) => c.compte_id === id) ?? []

  async function handleScoreClick() {
    if (!compte?.siren) return
    const score = await ellisphereScore.mutateAsync(compte.siren)
    updateScore.mutate({ compteId: compte.id, score })
  }

  return (
    <div>
      <Topbar title={compte?.nom ?? 'Compte'} />
      <div className="p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/comptes')}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux comptes
        </Button>

        {!compte ? (
          <p className="text-sm text-navy-500">Compte introuvable.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Informations générales</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><span className="text-navy-400">Type :</span> <Badge tone={typeMeta[compte.type_compte].tone}>{typeMeta[compte.type_compte].label}</Badge></p>
                  <p><span className="text-navy-400">Segment :</span> {compte.segment}</p>
                  <p><span className="text-navy-400">Ville :</span> {compte.ville}</p>
                  <p><span className="text-navy-400">Sites rattachés :</span> {compte.nb_sites}</p>
                  {compte.siren && <p><span className="text-navy-400">SIREN :</span> {compte.siren}</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Score Ellisphere</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {!compte.siren ? (
                    <p className="text-navy-400">Aucun SIREN renseigné pour ce compte — impossible d'interroger Ellisphere.</p>
                  ) : (
                    <>
                      {compte.score_ellipro ? (
                        <div className="flex items-center gap-2 rounded-lg bg-kiwi-50 px-3 py-2">
                          <Gauge className="h-4 w-4 text-kiwi-700" />
                          <p className="text-kiwi-800">
                            Score actuel : <span className="font-semibold">{compte.score_ellipro}</span>
                            {compte.score_ellipro_scale && ` / ${compte.score_ellipro_scale}`}
                          </p>
                        </div>
                      ) : (
                        <p className="text-navy-400">Aucun score interrogé pour le moment.</p>
                      )}
                      {compte.score_ellipro_maj && (
                        <p className="text-xs text-navy-400">
                          Dernière interrogation : {new Date(compte.score_ellipro_maj).toLocaleString('fr-FR')}
                        </p>
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleScoreClick}
                        disabled={ellisphereScore.isPending}
                      >
                        {ellisphereScore.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
                        {ellisphereScore.isPending ? 'Interrogation…' : 'Interroger Ellisphere'}
                      </Button>

                      {ellisphereScore.isError && (
                        <p className="text-xs text-red-600">{(ellisphereScore.error as Error).message}</p>
                      )}
                      {updateScore.isSuccess && (
                        <p className="text-xs text-navy-400">
                          {updateScore.data.changed ? 'Score mis à jour.' : 'Score inchangé depuis la dernière interrogation.'}
                          {!updateScore.data.persisted && ' (enregistré localement uniquement — écriture Supabase indisponible)'}
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Sites rattachés</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sitesDuCompte.length === 0 && <p className="text-sm text-navy-400">Aucun site rattaché à ce compte.</p>}
                {sitesDuCompte.map((site) => (
                  <div
                    key={site.id}
                    className="cursor-pointer rounded-lg border border-navy-100 p-3 transition-colors hover:bg-navy-50"
                    onClick={() => navigate(`/sites/${site.id}`)}
                  >
                    <p className="text-sm font-medium text-navy-800">{site.nom}</p>
                    <p className="text-xs text-navy-500">{site.type_site} · {site.ville} ({site.code_postal})</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contacts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {contactsDuCompte.length === 0 && <p className="text-sm text-navy-400">Aucun contact enregistré pour ce compte.</p>}
                {contactsDuCompte.map((contact) => (
                  <div
                    key={contact.id}
                    className="cursor-pointer rounded-lg border border-navy-100 p-3 transition-colors hover:bg-navy-50"
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                  >
                    <p className="text-sm font-medium text-navy-800">{contact.prenom} {contact.nom}</p>
                    <p className="text-xs text-navy-500">{contact.fonction || '—'} {contact.email ? `· ${contact.email}` : ''}</p>
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
