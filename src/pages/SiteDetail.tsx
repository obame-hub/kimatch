import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { useSites } from '@/lib/data/sites'
import { useSignaux } from '@/lib/data/signaux'
import { useCompteurs } from '@/lib/data/compteurs'
import { useRecommandations } from '@/lib/data/recommandations'
import { useContrats } from '@/lib/data/contrats'
import { useInteractions } from '@/lib/data/interactions'
import { useContacts } from '@/lib/data/contacts'
import { EnergyTimeline } from '@/components/site/EnergyTimeline'

export default function SiteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: sites } = useSites()
  const { data: signaux } = useSignaux()
  const { data: compteurs } = useCompteurs()
  const { data: recommandations } = useRecommandations()
  const { data: contrats } = useContrats()
  const { data: interactions } = useInteractions()
  const { data: contacts } = useContacts()

  const site = sites?.find((s) => s.id === id)
  const signauxDuSite = signaux?.filter((s) => s.site_id === id) ?? []
  const compteursDuSite = compteurs?.filter((c) => c.site_id === id) ?? []
  const recommandationsDuSite = recommandations?.filter((r) => r.sites.some((s) => s.id === id)) ?? []
  const contratsDuSite = contrats?.filter((c) => c.site_id === id) ?? []
  const interactionsDuSite = interactions?.filter((i) => i.site_id === id) ?? []
  const contactsDuSite = contacts?.filter((c) => c.sites.some((s) => s.id === id)) ?? []

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
                <p><span className="text-navy-400">Compte :</span> <EntityLink to={`/comptes/${site.compte_id}`}>{site.compte_nom}</EntityLink></p>
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

            <Card>
              <CardHeader>
                <CardTitle>Compteurs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {compteursDuSite.length === 0 && <p className="text-sm text-navy-400">Aucun compteur.</p>}
                {compteursDuSite.map((c) => (
                  <div
                    key={c.id}
                    className="cursor-pointer rounded-lg border border-navy-100 p-3 transition-colors hover:bg-navy-50"
                    onClick={() => navigate(`/compteurs/${c.id}`)}
                  >
                    <p className="text-sm font-medium text-navy-800">{c.utilisation}</p>
                    <p className="text-xs text-navy-500">{c.numero_pdl}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Recommandations liées</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recommandationsDuSite.length === 0 && <p className="text-sm text-navy-400">Aucune recommandation pour ce site.</p>}
                {recommandationsDuSite.map((r) => (
                  <div
                    key={r.id}
                    className="cursor-pointer rounded-lg border border-navy-100 p-3 transition-colors hover:bg-navy-50"
                    onClick={() => navigate(`/recommandations/${r.id}`)}
                  >
                    <p className="text-sm font-medium text-navy-800">{r.titre}</p>
                    <p className="text-xs text-navy-500">{r.objectif}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Frise énergétique</CardTitle>
              </CardHeader>
              <CardContent>
                {compteursDuSite.length === 0 ? (
                  <p className="text-sm text-navy-400">Aucun compteur pour ce site.</p>
                ) : (
                  <EnergyTimeline compteurs={compteursDuSite} contrats={contratsDuSite} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contrats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {contratsDuSite.length === 0 && <p className="text-sm text-navy-400">Aucun contrat.</p>}
                {contratsDuSite.map((c) => (
                  <div
                    key={c.id}
                    className="cursor-pointer rounded-lg border border-navy-100 p-3 transition-colors hover:bg-navy-50"
                    onClick={() => navigate(`/contrats/${c.id}`)}
                  >
                    <p className="text-sm font-medium text-navy-800">{c.fournisseur_nom}</p>
                    <p className="text-xs text-navy-500">{c.type_energie === 'gaz' ? 'Gaz' : 'Électricité'}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Interactions liées</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {interactionsDuSite.length === 0 && <p className="text-sm text-navy-400">Aucune interaction pour ce site.</p>}
                {interactionsDuSite.map((i) => (
                  <div
                    key={i.id}
                    className="cursor-pointer rounded-lg border border-navy-100 p-3 transition-colors hover:bg-navy-50"
                    onClick={() => navigate(`/interactions/${i.id}`)}
                  >
                    <p className="text-sm font-medium text-navy-800">{i.objet || i.type_interaction}</p>
                    <p className="text-xs text-navy-500">{i.auteur} · {new Date(i.date_interaction).toLocaleDateString('fr-FR')}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contacts sur ce site</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {contactsDuSite.length === 0 && <p className="text-sm text-navy-400">Aucun contact rattaché à ce site.</p>}
                {contactsDuSite.map((c) => (
                  <div
                    key={c.id}
                    className="cursor-pointer rounded-lg border border-navy-100 p-3 transition-colors hover:bg-navy-50"
                    onClick={() => navigate(`/contacts/${c.id}`)}
                  >
                    <p className="text-sm font-medium text-navy-800">{c.prenom} {c.nom}</p>
                    <p className="text-xs text-navy-500">{c.fonction || '—'}</p>
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
