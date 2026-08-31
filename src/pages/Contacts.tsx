import { useEffect, useMemo, useState } from 'react'
import { useTranchesAffichage } from '@/lib/useTranchesAffichage'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, User, Star, AlertTriangle, CheckCircle2, UserCircle2, UserRound, Crown, ClipboardList, Users, ExternalLink, Check } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { HubCreation } from '@/components/compte/HubCreation'
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
import { usePerimetreListe, BasculePerimetre } from '@/lib/perimetre'
import { toUpperFR, toTitleCaseFR, formatPhoneFR, isValidPhoneFR, isValidEmail } from '@/lib/textFormat'
import { contactRoleOptions } from '@/lib/contactRoles'
import type { Contact } from '@/types/domain'
import { useOuvrirCreation } from '@/lib/ouvrirCreation'

const DUPLICATE_FIELD_LABEL: Record<ContactDuplicate['fields'][number], string> = {
  email: 'Email',
  phone: 'Tél fixe',
  mobile: 'Mobile',
  fullName: 'Prénom + Nom',
}

const ROLE_META: Record<string, { icon: typeof Crown; desc: string; active: string }> = {
  Décisionnaire: { icon: Crown, desc: 'Signe et valide les contrats', active: 'border-amber-400/60 bg-amber-50 text-amber-700' },
  Administratif: { icon: ClipboardList, desc: 'Gère les démarches et documents', active: 'border-sky-400/60 bg-sky-50 text-sky-700' },
  'Conseil syndical': { icon: Users, desc: 'Représente les copropriétaires', active: 'border-violet-400/60 bg-violet-50 text-violet-700' },
}

function CreateContactDialog({ open, onClose, initialCompteId }: { open: boolean; onClose: () => void; initialCompteId?: string }) {
  const navigate = useNavigate()
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: allContacts } = useContacts()
  const { data: compteurs } = useCompteurs()
  const createContact = useCreateContact()
  const assignCompteurContact = useAssignCompteurContact()

  const [step, setStep] = useState<'form' | 'pdl' | 'final'>('form')
  const [createdContact, setCreatedContact] = useState<Contact | null>(null)
  const [compteId, setCompteId] = useState(initialCompteId ?? '')

  useEffect(() => {
    if (open && initialCompteId) setCompteId(initialCompteId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCompteId])
  const [civilite, setCivilite] = useState('M.')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [fonction, setFonction] = useState('')
  const [telephone, setTelephone] = useState('')
  const [telephoneMobile, setTelephoneMobile] = useState('')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
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
    // Comme dans Tools : ne cherche des doublons que si au moins un signal fiable existe (email
    // valide, téléphone valide, ou prénom+nom renseignés) -- évite de flasher le bandeau sur une
    // saisie encore incomplète.
    const hasSignal =
      (prenom.trim().length >= 2 && nom.trim().length >= 2) ||
      (!!email && isValidEmail(email)) ||
      (!!telephone && isValidPhoneFR(formatPhoneFR(telephone))) ||
      (!!telephoneMobile && isValidPhoneFR(formatPhoneFR(telephoneMobile)))
    if (!allContacts || !hasSignal) return []
    return findContactDuplicates(allContacts, {
      prenom,
      nom,
      email: email || null,
      telephone: telephone ? formatPhoneFR(telephone) : null,
      telephoneMobile: telephoneMobile ? formatPhoneFR(telephoneMobile) : null,
    })
  }, [allContacts, prenom, nom, email, telephone, telephoneMobile])
  const matchedFields = useMemo(() => new Set(duplicates.flatMap((d) => d.fields)), [duplicates])

  // Email : pas d'erreur avant le premier blur (comme Tools), puis live ensuite.
  const emailInvalid = emailTouched && !!email && !isValidEmail(email)
  const emailError = emailInvalid ? "Format d'email invalide" : null
  // Téléphone : erreur live dès la saisie tant que le blur n'a pas normalisé la valeur en +33...
  // (valide sur la valeur BRUTE, pas sur une version pré-formatée -- sinon l'erreur ne s'affiche
  // jamais pendant la frappe).
  const telError = telephone && !isValidPhoneFR(telephone) ? 'Format invalide (attendu : +33…)' : null
  const mobError = telephoneMobile && !isValidPhoneFR(telephoneMobile) ? 'Format invalide (attendu : +33…)' : null
  const canSubmit = !!compteId && nom.trim().length > 0 && !!role && !emailError && !telError && !mobError

  function reset() {
    setStep('form')
    setCreatedContact(null)
    setCompteId('')
    // Civilité n'est volontairement pas réinitialisée (comme Tools : le dernier choix persiste).
    setPrenom('')
    setNom('')
    setFonction('')
    setTelephone('')
    setTelephoneMobile('')
    setEmail('')
    setEmailTouched(false)
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
    // rattacher à un ou plusieurs PDL existants du compte avant l'écran final -- sinon on passe
    // directement à l'écran final "Que veux-tu faire ensuite ?".
    if (result.persisted && (role === 'Décisionnaire' || role === 'Conseil syndical') && compteursDuCompte.length > 0) {
      setStep('pdl')
    } else {
      setStep('final')
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
    setStep('final')
  }

  // Comme dans Tools : après création, on revient sur un formulaire vierge prêt pour une nouvelle
  // saisie plutôt que de fermer le dialogue -- "Créer un autre contact" garde le contexte compte.
  function handleCreateAnother() {
    const keepCompteId = compteId
    reset()
    setCompteId(keepCompteId)
  }

  const dialogTitle = step === 'form' ? 'Nouveau contact' : step === 'pdl' ? 'Rattacher à un PDL' : 'Contact créé avec succès'
  const dialogDesc =
    step === 'form'
      ? 'Ajouter une personne à un compte.'
      : step === 'pdl'
        ? `${createdContact?.prenom} ${createdContact?.nom} est ${role.toLowerCase()} — le rattacher à un ou plusieurs PDL existants ?`
        : 'Que veux-tu faire ensuite ?'

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
          <FormField label="Civilité">
            <div className="flex gap-2">
              {(['M.', 'Mme'] as const).map((c) => {
                const Icon = c === 'M.' ? UserCircle2 : UserRound
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCivilite(c)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      civilite === c ? 'border-navy-400/60 bg-km-bg text-km-text' : 'border-km-line text-km-muted hover:bg-km-bg'
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {c}
                  </button>
                )
              })}
            </div>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Prénom">
              <Input
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                onBlur={(e) => setPrenom(toTitleCaseFR(e.target.value))}
                className={matchedFields.has('fullName') ? 'ring-1 ring-amber-400' : undefined}
              />
            </FormField>
            <FormField label="Nom">
              <Input
                value={nom}
                onChange={(e) => setNom(toUpperFR(e.target.value))}
                required
                className={matchedFields.has('fullName') ? 'ring-1 ring-amber-400' : undefined}
              />
            </FormField>
          </div>
          <FormField label="Rôle">
            <div className="grid grid-cols-3 gap-2">
              {roleOptions.map((r) => {
                const meta = ROLE_META[r]
                const Icon = meta?.icon ?? User
                const active = role === r
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={!compteId}
                    onClick={() => setRole(r)}
                    className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      active ? meta?.active ?? 'border-navy-400/60 bg-km-bg text-km-text' : 'border-km-line text-km-muted hover:bg-km-bg'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{r}</span>
                    {meta?.desc && <span className="text-km-label opacity-80">{meta.desc}</span>}
                  </button>
                )
              })}
            </div>
          </FormField>
          <FormField label="Fonction">
            <Input value={fonction} onChange={(e) => setFonction(e.target.value)} placeholder="Ex. Directeur technique" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Téléphone fixe">
              <Input
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                onBlur={(e) => setTelephone(e.target.value ? formatPhoneFR(e.target.value) : '')}
                className={matchedFields.has('phone') ? 'ring-1 ring-amber-400' : undefined}
              />
              {telError && <p className="mt-1 text-xs text-km-red">{telError}</p>}
            </FormField>
            <FormField label="Mobile">
              <Input
                value={telephoneMobile}
                onChange={(e) => setTelephoneMobile(e.target.value)}
                onBlur={(e) => setTelephoneMobile(e.target.value ? formatPhoneFR(e.target.value) : '')}
                className={matchedFields.has('mobile') ? 'ring-1 ring-amber-400' : undefined}
              />
              {mobError && <p className="mt-1 text-xs text-km-red">{mobError}</p>}
            </FormField>
          </div>
          <FormField label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              className={matchedFields.has('email') ? 'ring-1 ring-amber-400' : undefined}
            />
            {emailError && <p className="mt-1 text-xs text-km-red">{emailError}</p>}
          </FormField>

          {duplicates.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-km-amber">
              <p className="mb-1.5 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                {duplicates.length === 1 ? 'Un contact similaire existe déjà' : `${duplicates.length} contacts similaires existent déjà`}
              </p>
              <ul className="space-y-1">
                {duplicates.slice(0, 5).map((d) => (
                  <li key={d.contact.id}>
                    {d.contact.prenom} {d.contact.nom} ({d.contact.compte_nom}) — même {d.fields.map((f) => DUPLICATE_FIELD_LABEL[f]).join(' + ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {compteId && (
            <FormField label="Rattaché aux sites (optionnel)">
              {sitesDuCompte.length === 0 ? (
                <p className="text-xs text-km-faint">Ce compte n'a aucun site.</p>
              ) : (
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-km-line p-2">
                  {sitesDuCompte.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm text-km-text">
                      <input type="checkbox" checked={siteIds.includes(s.id)} onChange={() => toggleSite(s.id)} />
                      {s.nom}
                    </label>
                  ))}
                </div>
              )}
            </FormField>
          )}
          {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
            <Button type="submit" disabled={createContact.isPending || !canSubmit}>Créer le contact</Button>
          </div>
        </form>
      )}

      {step === 'pdl' && (
        <div className="space-y-3">
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-km-line p-2">
            {compteursDuCompte.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-km-text">
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

      {step === 'final' && createdContact && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-kiwi-200 bg-kiwi-50 p-3 text-sm text-km-green">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="font-medium">{createdContact.civilite ? `${createdContact.civilite} ` : ''}{createdContact.prenom} {createdContact.nom}</span> a bien été
              ajouté{createdContact.civilite === 'Mme' ? 'e' : ''} à {compte?.nom}.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="ghost" onClick={handleCreateAnother}>
              <Plus className="h-4 w-4" /> Créer un autre contact
            </Button>
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>
              Terminer la session
            </Button>
          </div>
          <Button type="button" className="w-full" onClick={() => { const id = createdContact.id; reset(); onClose(); navigate(`/contacts/${id}`) }}>
            <ExternalLink className="h-4 w-4" /> Voir la fiche contact
          </Button>
        </div>
      )}
    </Dialog>
  )
}

/**
 * ENCAPSULABLE DANS LA PAGE PATRIMOINE. `sansEntete` masque la barre du haut quand cette liste est
 * affichée comme onglet de /patrimoine (diapositive 8 de Michel : « la page Patrimoine rassemble ces
 * objets et permet de naviguer du compte jusqu'au compteur et au contrat »). L'en-tête de page, lui,
 * reste : il porte le bouton de création et la phrase qui dit ce qu'est l'objet.
 */
export default function Contacts({ sansEntete }: { sansEntete?: boolean }) {
  const { data: contacts, isLoading } = useContacts()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const compteFromUrl = searchParams.get('compte')
  const [showCreate, setShowCreate] = useState(!!compteFromUrl)
  // `?creer=1` ouvre ce formulaire depuis le menu « Créer » de la barre du haut.
  useOuvrirCreation(() => setShowCreate(true))

  useEffect(() => {
    if (compteFromUrl) {
      setShowCreate(true)
      setSearchParams((prev) => { prev.delete('compte'); return prev }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { perimetre, setPerimetre, visibles: contactsDuPerimetre } = usePerimetreListe(
    'contacts', contacts, { proprietaireId: (c) => c.proprietaire_id, compteId: (c) => c.compte_id },
  )

  const { query, setQuery, sortKey, setSortKey, items: filteredContacts } = useListControls(contactsDuPerimetre, {
    searchFields: (c) => [c.prenom, c.nom, c.fonction, c.compte_nom, c.email, c.telephone],
    sorters: {
      nom: (a, b) => a.nom.localeCompare(b.nom),
      compte_nom: (a, b) => a.compte_nom.localeCompare(b.compte_nom),
      fonction: (a, b) => (a.fonction ?? '').localeCompare(b.fonction ?? ''),
    },
    defaultSort: 'nom',
  })

  const tranche = useTranchesAffichage(filteredContacts, `${query}|${sortKey}`)

  return (
    <div>
      {!sansEntete && <Topbar title="Contacts" />}
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Contacts"
          description="Les personnes chez vos comptes — signataires, interlocuteurs commerciaux ou techniques."
          actions={
            /* Le hub de création SEUL : « il faut également le mettre sur les autres objets, parce
               que c'est un bouton que de n'importe où je peux venir faire quelque chose »
               (William, 13/08/2026). Le bouton « Nouveau contact » qui doublonnait à côté a été
               retiré le 16/08/2026 — le hub propose déjà la création de contact, et deux boutons
               pour la même action encombraient l'en-tête. */
            <HubCreation
              onAction={(cle) => {
                if (cle === 'contact') setShowCreate(true)
                if (cle === 'compte') navigate('/comptes', { state: { openCreate: true } })
                if (cle === 'site') navigate('/sites', { state: { openCreate: true } })
                if (cle === 'compteur') navigate('/compteurs')
                if (cle === 'mandat') navigate('/mandats')
                if (cle === 'recommandation') navigate('/recommandations')
              }}
            />
          }
        />

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un contact, un compte…" count={filteredContacts?.length}>
            <BasculePerimetre
              valeur={perimetre}
              onChange={setPerimetre}
              libelleMien="Mes contacts"
              libelleTous="Tous les contacts"
            />
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            <option value="nom">Trier par nom</option>
            <option value="compte_nom">Trier par compte</option>
            <option value="fonction">Trier par fonction</option>
          </Select>
        </ListToolbar>

        {!isLoading && contacts?.length === 0 && (
          <p className="mb-4 text-sm text-km-faint">
            Aucun contact pour l'instant — un contact est une personne chez un compte (signataire, gestionnaire, interlocuteur technique…). Utilise « Créer » pour en ajouter un.
          </p>
        )}
        {!isLoading && contacts && contacts.length > 0 && filteredContacts?.length === 0 && (
          <p className="mb-4 text-sm text-km-faint">Aucun contact ne correspond à la recherche.</p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-km-faint">Chargement…</p>}
          {tranche.visibles.map((c) => (
            <Card
              key={c.id}
              to={`/contacts/${c.id}`}
              className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-500">
                    <User className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-display font-medium text-km-text">{c.civilite ? `${c.civilite} ` : ''}{c.prenom} {c.nom}</p>
                    <p className="text-xs text-km-muted">{c.fonction || '—'}</p>
                  </div>
                </div>
                {c.contact_principal && <Star className="h-4 w-4 shrink-0 text-amber-500" />}
              </div>
              {c.role && <Badge tone={c.role === 'Décisionnaire' ? 'kiwi' : 'neutral'} className="mt-2">{c.role}</Badge>}
              <div className="mt-4 space-y-1 text-xs text-km-muted">
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
          <PiedDeListe
            affiches={tranche.visibles.length}
            total={tranche.total}
            reste={tranche.reste}
            onAfficherPlus={tranche.afficherPlus}
            tailleTrancheSuivante={tranche.tailleTrancheSuivante}
            libelle="contacts"
          />
        </div>
      </div>
      {showCreate && <CreateContactDialog open={showCreate} onClose={() => setShowCreate(false)} initialCompteId={compteFromUrl ?? undefined} />}
    </div>
  )
}
