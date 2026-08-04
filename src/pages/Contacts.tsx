import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, User, Star, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { PhoneLink, EmailLink } from '@/components/ui/contact-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { useContacts, useCreateContact, findContactDuplicates, type ContactDuplicate } from '@/lib/data/contacts'
import { useComptes } from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'
import { useCompteurs, useAssignCompteurContact } from '@/lib/data/compteurs'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'
import { toUpperFR, toTitleCaseFR, formatPhoneFR, isValidPhoneFR, isValidEmail } from '@/lib/textFormat'
import { contactRoleOptions } from '@/lib/contactRoles'
import type { Contact } from '@/types/domain'

const CIVILITE_OPTIONS = ['M.', 'Mme', 'Autre']
const DUPLICATE_FIELD_LABEL: Record<ContactDuplicate['fields'][number], string> = {
  email: 'même email',
  phone: 'même téléphone',
  fullName: 'même nom complet',
}

function CreateContactDialog({ open, onClose, initialCompteId }: { open: boolean; onClose: () => void; initialCompteId?: string }) {
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: allContacts } = useContacts()
  const { data: compteurs } = useCompteurs()
  const createContact = useCreateContact()
  const assignCompteurContact = useAssignCompteurContact()

  const [step, setStep] = useState<'form' | 'pdl'>('form')
  const [createdContact, setCreatedContact] = useState<Contact | null>(null)
  const [compteId, setCompteId] = useState(initialCompteId ?? '')

  useEffect(() => {
    if (open && initialCompteId) setCompteId(initialCompteId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCompteId])
  const [civilite, setCivilite] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [fonction, setFonction] = useState('')
  const [telephone, setTelephone] = useState('')
  const [telephoneMobile, setTelephoneMobile] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [siteIds, setSiteIds] = useState<string[]>([])
  const [compteurIds, setCompteurIds] = useState<string[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)

  const compte = comptes?.find((c) => c.id === compteId) ?? null
  const roleOptions = contactRoleOptions(compte?.segment)
  const sitesDuCompte = sites?.filter((s) => s.compte_id === compteId) ?? []
  const compteurIdsDuCompte = new Set((sites ?? []).filter((s) => s.compte_id === compteId).map((s) => s.id))
  const compteursDuCompte = (compteurs ?? []).filter((c) => compteurIdsDuCompte.has(c.site_id))

  const duplicates = useMemo(() => {
    const hasSignal = (prenom.trim().length >= 2 && nom.trim().length >= 2) || email || telephone || telephoneMobile
    if (!allContacts || !hasSignal) return []
    return findContactDuplicates(allContacts, {
      prenom,
      nom,
      email: email || null,
      telephone: telephone ? formatPhoneFR(telephone) : null,
      telephoneMobile: telephoneMobile ? formatPhoneFR(telephoneMobile) : null,
    })
  }, [allContacts, prenom, nom, email, telephone, telephoneMobile])

  const emailError = email && !isValidEmail(email) ? "Format d'email invalide." : null
  const telError = telephone && !isValidPhoneFR(formatPhoneFR(telephone)) ? 'Numéro de téléphone invalide.' : null
  const mobError = telephoneMobile && !isValidPhoneFR(formatPhoneFR(telephoneMobile)) ? 'Numéro de mobile invalide.' : null
  const canSubmit = !!compteId && prenom.trim().length > 0 && nom.trim().length > 0 && !!role && !emailError && !telError && !mobError

  function reset() {
    setStep('form')
    setCreatedContact(null)
    setCompteId('')
    setCivilite('')
    setPrenom('')
    setNom('')
    setFonction('')
    setTelephone('')
    setTelephoneMobile('')
    setEmail('')
    setRole('')
    setSiteIds([])
    setCompteurIds([])
    setFeedback(null)
  }

  function toggleSite(id: string) {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  function toggleCompteur(id: string) {
    setCompteurIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!compte || !canSubmit) return
    const sitesChoisis = sitesDuCompte.filter((s) => siteIds.includes(s.id)).map((s) => ({ id: s.id, nom: s.nom }))

    const result = await createContact.mutateAsync({
      compte_id: compte.id,
      compte_nom: compte.nom,
      civilite: civilite || null,
      prenom: toTitleCaseFR(prenom),
      nom: toUpperFR(nom),
      fonction: fonction || null,
      telephone: telephone || null,
      telephone_mobile: telephoneMobile || null,
      email: email || null,
      role,
      site_ids: siteIds,
      sites: sitesChoisis.map((s) => ({ ...s, fonction_sur_site: null })),
    })
    setFeedback(result.persisted ? 'Contact créé.' : 'Contact ajouté localement (non synchronisé avec Supabase).')
    setCreatedContact(result.contact)

    // Comme dans Tools : si le contact est Décisionnaire (ou Conseil syndical), on propose de le
    // rattacher à un ou plusieurs PDL existants du compte avant de fermer.
    if (result.persisted && (role === 'Décisionnaire' || role === 'Conseil syndical') && compteursDuCompte.length > 0) {
      setStep('pdl')
    } else {
      setTimeout(() => { reset(); onClose() }, 700)
    }
  }

  async function handleFinishPdl() {
    if (createdContact && compteurIds.length > 0) {
      await assignCompteurContact.mutateAsync({
        compteurIds,
        contactId: createdContact.id,
        field: role === 'Conseil syndical' ? 'contact_conseil_syndical_id' : 'responsable_contact_id',
      })
    }
    reset()
    onClose()
  }

  const dialogTitle = step === 'form' ? 'Nouveau contact' : 'Rattacher à un PDL'
  const dialogDesc = step === 'form' ? 'Ajouter une personne à un compte.' : `${createdContact?.prenom} ${createdContact?.nom} est ${role.toLowerCase()} — le rattacher à un ou plusieurs PDL existants ?`

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title={dialogTitle} description={dialogDesc}>
      {step === 'form' && (
        <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
          <FormField label="Compte">
            <Select value={compteId} onChange={(e) => { setCompteId(e.target.value); setSiteIds([]); setRole('') }} required>
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
              <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} onBlur={(e) => setPrenom(toTitleCaseFR(e.target.value))} required />
            </FormField>
            <FormField label="Nom">
              <Input value={nom} onChange={(e) => setNom(toUpperFR(e.target.value))} required />
            </FormField>
          </div>
          <FormField label="Rôle">
            <Select value={role} onChange={(e) => setRole(e.target.value)} required disabled={!compteId}>
              <option value="">Sélectionner…</option>
              {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </FormField>
          <FormField label="Fonction">
            <Input value={fonction} onChange={(e) => setFonction(e.target.value)} placeholder="Ex. Directeur technique" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Téléphone fixe">
              <Input value={telephone} onChange={(e) => setTelephone(e.target.value)} onBlur={(e) => setTelephone(e.target.value ? formatPhoneFR(e.target.value) : '')} />
              {telError && <p className="mt-1 text-xs text-red-600">{telError}</p>}
            </FormField>
            <FormField label="Mobile">
              <Input value={telephoneMobile} onChange={(e) => setTelephoneMobile(e.target.value)} onBlur={(e) => setTelephoneMobile(e.target.value ? formatPhoneFR(e.target.value) : '')} />
              {mobError && <p className="mt-1 text-xs text-red-600">{mobError}</p>}
            </FormField>
          </div>
          <FormField label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
          </FormField>

          {duplicates.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="mb-1.5 flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Doublon(s) potentiel(s) détecté(s)</p>
              <ul className="space-y-1">
                {duplicates.slice(0, 5).map((d) => (
                  <li key={d.contact.id}>
                    {d.contact.prenom} {d.contact.nom} ({d.contact.compte_nom}) — {d.fields.map((f) => DUPLICATE_FIELD_LABEL[f]).join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
            <Button type="submit" disabled={createContact.isPending || !canSubmit}>Créer le contact</Button>
          </div>
        </form>
      )}

      {step === 'pdl' && (
        <div className="space-y-3">
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-navy-200 p-2">
            {compteursDuCompte.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-navy-700">
                <input type="checkbox" checked={compteurIds.includes(c.id)} onChange={() => toggleCompteur(c.id)} />
                {c.numero_pdl} — {c.site_nom}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Passer</Button>
            <Button type="button" onClick={handleFinishPdl} disabled={assignCompteurContact.isPending}>
              <CheckCircle2 className="h-4 w-4" /> Terminer
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

export default function Contacts() {
  const { data: contacts, isLoading } = useContacts()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const compteFromUrl = searchParams.get('compte')
  const [showCreate, setShowCreate] = useState(!!compteFromUrl)

  useEffect(() => {
    if (compteFromUrl) {
      setShowCreate(true)
      setSearchParams((prev) => { prev.delete('compte'); return prev }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { query, setQuery, sortKey, setSortKey, items: filteredContacts } = useListControls(contacts, {
    searchFields: (c) => [c.prenom, c.nom, c.fonction, c.compte_nom, c.email, c.telephone],
    sorters: {
      nom: (a, b) => a.nom.localeCompare(b.nom),
      compte_nom: (a, b) => a.compte_nom.localeCompare(b.compte_nom),
      fonction: (a, b) => (a.fonction ?? '').localeCompare(b.fonction ?? ''),
    },
    defaultSort: 'nom',
  })

  return (
    <div>
      <Topbar title="Contacts" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Contacts"
          description="Les personnes chez vos comptes — signataires, interlocuteurs commerciaux ou techniques."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau contact</Button>}
        />

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un contact, un compte…" count={filteredContacts?.length}>
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            <option value="nom">Trier par nom</option>
            <option value="compte_nom">Trier par compte</option>
            <option value="fonction">Trier par fonction</option>
          </Select>
        </ListToolbar>

        {!isLoading && contacts?.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">
            Aucun contact pour l'instant — un contact est une personne chez un compte (signataire, gestionnaire, interlocuteur technique…). Utilise « Nouveau contact » pour en créer un.
          </p>
        )}
        {!isLoading && contacts && contacts.length > 0 && filteredContacts?.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">Aucun contact ne correspond à la recherche.</p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {filteredContacts?.map((c) => (
            <Card
              key={c.id}
              onClick={() => navigate(`/contacts/${c.id}`)}
              className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-500">
                    <User className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-display font-medium text-navy-800">{c.civilite ? `${c.civilite} ` : ''}{c.prenom} {c.nom}</p>
                    <p className="text-xs text-navy-500">{c.fonction || '—'}</p>
                  </div>
                </div>
                {c.contact_principal && <Star className="h-4 w-4 shrink-0 text-amber-500" />}
              </div>
              {c.role && <Badge tone={c.role === 'Décisionnaire' ? 'kiwi' : 'neutral'} className="mt-2">{c.role}</Badge>}
              <div className="mt-4 space-y-1 text-xs text-navy-500">
                <p><EntityLink to={`/comptes/${c.compte_id}`}>{c.compte_nom}</EntityLink></p>
                {c.email && <p><EmailLink value={c.email} /></p>}
                {c.telephone && <p><PhoneLink value={c.telephone} /></p>}
                {c.telephone_mobile && <p><PhoneLink value={c.telephone_mobile} /></p>}
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
      <CreateContactDialog open={showCreate} onClose={() => setShowCreate(false)} initialCompteId={compteFromUrl ?? undefined} />
    </div>
  )
}
