import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { useMandats, useCreateMandat } from '@/lib/data/mandats'
import { useComptes } from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'
import { useContacts } from '@/lib/data/contacts'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_MANDATS, STATUT_MANDAT_TONE } from '@/lib/referenceFallbacks'

function CreateMandatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: contacts } = useContacts()
  const createMandat = useCreateMandat()

  const [compteId, setCompteId] = useState('')
  const [dateSignature, setDateSignature] = useState('')
  const [siteIds, setSiteIds] = useState<string[]>([])
  const [contactSignataireId, setContactSignataireId] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const sitesDuCompte = sites?.filter((s) => s.compte_id === compteId) ?? []
  const contactsDuCompte = contacts?.filter((c) => c.compte_id === compteId) ?? []

  function reset() {
    setCompteId('')
    setDateSignature('')
    setSiteIds([])
    setContactSignataireId('')
    setFeedback(null)
  }

  function toggleSite(id: string) {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const compte = comptes?.find((c) => c.id === compteId)
    if (!compte) return
    const contactSignataire = contactsDuCompte.find((c) => c.id === contactSignataireId)

    const result = await createMandat.mutateAsync({
      compte_id: compte.id,
      compte_nom: compte.nom,
      site_ids: siteIds,
      date_signature: dateSignature || null,
      contact_signataire_id: contactSignataireId || null,
      contact_signataire_nom: contactSignataire ? `${contactSignataire.prenom} ${contactSignataire.nom}` : undefined,
    })
    setFeedback(result.persisted ? 'Mandat créé.' : 'Mandat ajouté localement (non synchronisé avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouveau mandat" description="Le mandat autorise KiWee à intervenir sur un périmètre de sites d'un compte.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Compte">
          <Select value={compteId} onChange={(e) => { setCompteId(e.target.value); setSiteIds([]) }} required>
            <option value="">Sélectionner un compte…</option>
            {comptes?.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </Select>
        </FormField>
        <FormField label="Date de signature">
          <Input type="date" value={dateSignature} onChange={(e) => setDateSignature(e.target.value)} />
        </FormField>
        {compteId && contactsDuCompte.length > 0 && (
          <FormField label="Contact signataire (optionnel)">
            <Select value={contactSignataireId} onChange={(e) => setContactSignataireId(e.target.value)}>
              <option value="">Sélectionner…</option>
              {contactsDuCompte.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </Select>
          </FormField>
        )}
        {compteId && (
          <FormField label="Sites couverts">
            {sitesDuCompte.length === 0 ? (
              <p className="text-xs text-navy-400">Ce compte n'a aucun site.</p>
            ) : (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-navy-200 p-2">
                {sitesDuCompte.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-navy-700">
                    <input type="checkbox" checked={siteIds.includes(s.id)} onChange={() => toggleSite(s.id)} />
                    {s.nom}
                  </label>
                ))}
              </div>
            )}
          </FormField>
        )}
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createMandat.isPending}>Créer le mandat</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Mandats() {
  const { data: mandats, isLoading } = useMandats()
  const { data: statutsRef } = useReferenceTable('statuts_mandats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_MANDATS
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div>
      <Topbar title="Mandats" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Mandats"
          description="Le mandat autorise KiWee à intervenir sur un périmètre de sites — il ne se confond pas avec le périmètre étudié par une recommandation."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau mandat</Button>}
        />

        {!isLoading && mandats?.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">
            Aucun mandat pour l'instant — le mandat signé par le client autorise KiWee à négocier sur un périmètre de sites précis. Utilise « Nouveau mandat » pour en créer un.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {mandats?.map((m) => {
            const label = statuts.find((s) => s.code === m.statut)?.libelle ?? m.statut
            return (
              <Card
                key={m.id}
                onClick={() => navigate(`/mandats/${m.id}`)}
                className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <p className="font-display font-medium text-navy-800">
                    <EntityLink to={`/comptes/${m.compte_id}`}>{m.compte_nom}</EntityLink>
                  </p>
                  <Badge tone={STATUT_MANDAT_TONE[m.statut] ?? 'neutral'}>{label}</Badge>
                </div>
                <div className="mt-4 space-y-1 text-xs text-navy-500">
                  <p>Sites couverts : <span className="font-medium text-navy-700">{m.nb_sites_couverts}</span></p>
                  <p>Signé le : {m.date_signature ? new Date(m.date_signature).toLocaleDateString('fr-FR') : '—'}</p>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
      <CreateMandatDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
