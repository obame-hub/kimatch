import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, User, Star } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { PhoneLink, EmailLink } from '@/components/ui/contact-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { useContacts, useCreateContact } from '@/lib/data/contacts'
import { useComptes } from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'

const CIVILITE_OPTIONS = ['M.', 'Mme', 'Autre']

function CreateContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const createContact = useCreateContact()

  const [compteId, setCompteId] = useState('')
  const [civilite, setCivilite] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [fonction, setFonction] = useState('')
  const [telephone, setTelephone] = useState('')
  const [email, setEmail] = useState('')
  const [contactPrincipal, setContactPrincipal] = useState(false)
  const [siteIds, setSiteIds] = useState<string[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)

  const sitesDuCompte = sites?.filter((s) => s.compte_id === compteId) ?? []

  function reset() {
    setCompteId('')
    setCivilite('')
    setPrenom('')
    setNom('')
    setFonction('')
    setTelephone('')
    setEmail('')
    setContactPrincipal(false)
    setSiteIds([])
    setFeedback(null)
  }

  function toggleSite(id: string) {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const compte = comptes?.find((c) => c.id === compteId)
    if (!compte) return
    const sitesChoisis = sitesDuCompte.filter((s) => siteIds.includes(s.id)).map((s) => ({ id: s.id, nom: s.nom }))

    const result = await createContact.mutateAsync({
      compte_id: compte.id,
      compte_nom: compte.nom,
      civilite: civilite || null,
      prenom,
      nom,
      fonction: fonction || null,
      telephone: telephone || null,
      email: email || null,
      contact_principal: contactPrincipal,
      site_ids: siteIds,
      sites: sitesChoisis.map((s) => ({ ...s, fonction_sur_site: null })),
    })
    setFeedback(result.persisted ? 'Contact créé.' : 'Contact ajouté localement (non synchronisé avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouveau contact" description="Ajouter une personne à un compte.">
      <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
        <FormField label="Compte">
          <Select value={compteId} onChange={(e) => { setCompteId(e.target.value); setSiteIds([]) }} required>
            <option value="">Sélectionner un compte…</option>
            {comptes?.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </Select>
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Civilité">
            <Select value={civilite} onChange={(e) => setCivilite(e.target.value)}>
              <option value="">—</option>
              {CIVILITE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </FormField>
          <FormField label="Prénom">
            <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
          </FormField>
          <FormField label="Nom">
            <Input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </FormField>
        </div>
        <FormField label="Fonction">
          <Input value={fonction} onChange={(e) => setFonction(e.target.value)} placeholder="Ex. Directeur technique" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Téléphone">
            <Input value={telephone} onChange={(e) => setTelephone(e.target.value)} />
          </FormField>
          <FormField label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm text-navy-700">
          <input type="checkbox" checked={contactPrincipal} onChange={(e) => setContactPrincipal(e.target.checked)} />
          Contact principal du compte
        </label>
        {compteId && (
          <FormField label="Rattaché aux sites (optionnel)">
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
          <Button type="submit" disabled={createContact.isPending}>Créer le contact</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Contacts() {
  const { data: contacts, isLoading } = useContacts()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div>
      <Topbar title="Contacts" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Contacts"
          description="Les personnes chez vos comptes — signataires, interlocuteurs commerciaux ou techniques."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau contact</Button>}
        />

        {!isLoading && contacts?.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">
            Aucun contact pour l'instant — un contact est une personne chez un compte (signataire, gestionnaire, interlocuteur technique…). Utilise « Nouveau contact » pour en créer un.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {contacts?.map((c) => (
            <Card
              key={c.id}
              onClick={() => navigate(`/contacts/${c.id}`)}
              className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                    <User className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-display font-medium text-navy-800">{c.civilite ? `${c.civilite} ` : ''}{c.prenom} {c.nom}</p>
                    <p className="text-xs text-navy-500">{c.fonction || '—'}</p>
                  </div>
                </div>
                {c.contact_principal && <Star className="h-4 w-4 shrink-0 text-amber-500" />}
              </div>
              <div className="mt-4 space-y-1 text-xs text-navy-500">
                <p><EntityLink to={`/comptes/${c.compte_id}`}>{c.compte_nom}</EntityLink></p>
                {c.email && <p><EmailLink value={c.email} /></p>}
                {c.telephone && <p><PhoneLink value={c.telephone} /></p>}
              </div>
              {c.sites.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.sites.map((s) => <Badge key={s.id} tone="neutral">{s.nom}</Badge>)}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
      <CreateContactDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
