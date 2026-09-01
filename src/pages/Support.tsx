import { useState } from 'react'
import { Bug, Lightbulb, Plus, LifeBuoy } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'
import {
  useDemandesSupport,
  useCreateDemandeSupport,
  useUpdateStatutDemandeSupport,
  type StatutDemandeSupport,
  type TypeDemandeSupport,
} from '@/lib/data/support'
import { useMonProfil, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { sendEmail } from '@/lib/data/gmail'

const TYPE_META: Record<TypeDemandeSupport, { label: string; icon: typeof Bug; tone: 'red' | 'amber' }> = {
  bug: { label: 'Bug', icon: Bug, tone: 'red' },
  evolution: { label: "Demande d'évolution", icon: Lightbulb, tone: 'amber' },
}

const STATUT_META: Record<StatutDemandeSupport, { label: string; tone: 'neutral' | 'kiwi' | 'blue' | 'amber' }> = {
  NOUVELLE: { label: 'Nouvelle', tone: 'blue' },
  EN_COURS: { label: 'En cours', tone: 'amber' },
  RESOLUE: { label: 'Résolue', tone: 'kiwi' },
  REJETEE: { label: 'Rejetée', tone: 'neutral' },
}

const STATUT_OPTIONS: StatutDemandeSupport[] = ['NOUVELLE', 'EN_COURS', 'RESOLUE', 'REJETEE']

function CreateDemandeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: monProfil } = useMonProfil()
  const { data: profilsAdmin } = useProfilsAdmin()
  const createDemande = useCreateDemandeSupport()

  const [type, setType] = useState<TypeDemandeSupport>('bug')
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setType('bug')
    setTitre('')
    setDescription('')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const auteurNom = monProfil ? `${monProfil.prenom} ${monProfil.nom}`.trim() : 'Inconnu'

    await createDemande.mutateAsync({
      type,
      titre,
      description,
      auteurId: monProfil?.id ?? null,
      auteurNom,
    })

    const admins = (profilsAdmin ?? []).filter((p) => p.role_acces?.code === 'SUPER_ADMIN' || p.role_acces?.code === 'ADMIN')
    const sujet = `[Kimatch] Nouvelle ${type === 'bug' ? 'demande de bug' : "demande d'évolution"} — ${titre}`
    const corps = `${auteurNom} a signalé :\n\n${titre}\n\n${description || 'Pas de description.'}`
    await Promise.all(
      admins.map((admin) => sendEmail({ to: admin.email, subject: sujet, text: corps }).catch(() => undefined)),
    )

    setFeedback('Demande envoyée — merci !')
    setTimeout(() => {
      reset()
      onClose()
    }, 900)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Signaler un problème ou une idée" description="Visible par toute l'équipe — les administrateurs sont notifiés par email.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as TypeDemandeSupport)}>
            <option value="bug">Bug</option>
            <option value="evolution">Demande d'évolution</option>
          </Select>
        </FormField>
        <FormField label="Titre">
          <Input value={titre} onChange={(e) => setTitre(e.target.value)} required placeholder="Ex. Le bouton Modifier ne répond pas sur la fiche Site" />
        </FormField>
        <FormField label="Description">
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Détaille le contexte, les étapes pour reproduire, ce que tu attendais…" />
        </FormField>
        {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createDemande.isPending || !titre}>Envoyer</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Support() {
  const { data: demandes, isLoading } = useDemandesSupport()
  const isAdmin = useIsAdmin()
  const updateStatut = useUpdateStatutDemandeSupport()
  const [showCreate, setShowCreate] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')

  const demandesFiltreesParType = typeFilter ? demandes?.filter((d) => d.type === typeFilter) : demandes

  const { query, setQuery, sortKey, setSortKey, items: filteredDemandes } = useListControls(demandesFiltreesParType, {
    searchFields: (d) => [d.titre, d.description, d.auteur_nom],
    sorters: {
      date_creation: (a, b) => b.date_creation.localeCompare(a.date_creation),
      statut: (a, b) => a.statut.localeCompare(b.statut),
      titre: (a, b) => a.titre.localeCompare(b.titre),
    },
    defaultSort: 'date_creation',
  })

  return (
    <div>
      <Topbar title="Support" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Support"
          description="Signale un bug ou propose une amélioration — visible par toute l'équipe, les administrateurs reçoivent un email."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Signaler</Button>}
        />

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher une demande, un auteur…" count={filteredDemandes?.length}>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-auto">
            <option value="">Tous les types</option>
            <option value="bug">Bug</option>
            <option value="evolution">Demande d'évolution</option>
          </Select>
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            <option value="date_creation">Trier par date</option>
            <option value="statut">Trier par statut</option>
            <option value="titre">Trier par titre</option>
          </Select>
        </ListToolbar>

        {isLoading && <p className="text-sm text-km-faint">Chargement…</p>}
        {!isLoading && demandes?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-km-faint">
            <LifeBuoy className="h-8 w-8" />
            <p className="text-sm">Aucune demande pour l'instant.</p>
          </div>
        )}
        {!isLoading && demandes && demandes.length > 0 && filteredDemandes?.length === 0 && (
          <p className="py-8 text-center text-sm text-km-faint">Aucune demande ne correspond à la recherche.</p>
        )}

        <div className="space-y-2.5">
          {filteredDemandes?.map((d) => {
            const typeMeta = TYPE_META[d.type]
            const Icon = typeMeta.icon
            return (
              <Card key={d.id} className="animate-fade-up p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-km-soft text-km-muted">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-km-text">{d.titre}</p>
                      {d.description && <p className="mt-1 text-xs text-km-muted">{d.description}</p>}
                      <p className="mt-2 text-xs text-km-faint">
                        {d.auteur_nom} · {new Date(d.date_creation).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={typeMeta.tone}>{typeMeta.label}</Badge>
                    {isAdmin ? (
                      <Select
                        value={d.statut}
                        onChange={(e) => updateStatut.mutate({ id: d.id, statut: e.target.value as StatutDemandeSupport })}
                        className="h-7 w-auto py-0 text-xs"
                      >
                        {STATUT_OPTIONS.map((s) => <option key={s} value={s}>{STATUT_META[s].label}</option>)}
                      </Select>
                    ) : (
                      <Badge tone={STATUT_META[d.statut]?.tone ?? 'neutral'}>{STATUT_META[d.statut]?.label ?? d.statut}</Badge>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
      {showCreate && <CreateDemandeDialog open={showCreate} onClose={() => setShowCreate(false)} />}
    </div>
  )
}
