import { useMemo, useState } from 'react'
import { AlertTriangle, ClipboardList, Crown, User, UserCircle2, UserRound, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/form'
import { useContacts, useCreateContact, findContactDuplicates, type ContactDuplicate } from '@/lib/data/contacts'
import { toUpperFR, toTitleCaseFR, formatPhoneFR, isValidPhoneFR, isValidEmail } from '@/lib/textFormat'
import { contactRoleOptions } from '@/lib/contactRoles'
import type { Contact } from '@/types/domain'

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

/** Formulaire de création de contact, extrait pour être réutilisable à la fois dans le dialogue
 * de la page Contacts et dans le panneau latéral "Que faire ensuite ?" post-création de compte
 * (Tools : ContactCreationForm, mode embedded via `onCreated`). Fait la création elle-même. */
export function ContactForm({
  compteId,
  compteNom,
  segment,
  onCreated,
  onCancel,
  submitLabel = 'Créer le contact',
}: {
  compteId: string
  compteNom: string
  segment: string | null | undefined
  onCreated: (contact: Contact) => void
  onCancel: () => void
  submitLabel?: string
}) {
  const { data: allContacts } = useContacts()
  const createContact = useCreateContact()

  const [civilite, setCivilite] = useState('M.')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [fonction, setFonction] = useState('')
  const [telephone, setTelephone] = useState('')
  const [telephoneMobile, setTelephoneMobile] = useState('')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [role, setRole] = useState('')

  const roleOptions = contactRoleOptions(segment)

  const duplicates = useMemo(() => {
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

  const emailInvalid = emailTouched && !!email && !isValidEmail(email)
  const emailError = emailInvalid ? "Format d'email invalide" : null
  const telError = telephone && !isValidPhoneFR(telephone) ? 'Format invalide (attendu : +33…)' : null
  const mobError = telephoneMobile && !isValidPhoneFR(telephoneMobile) ? 'Format invalide (attendu : +33…)' : null
  const canSubmit = nom.trim().length > 0 && !!role && !emailError && !telError && !mobError

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const result = await createContact.mutateAsync({
      compte_id: compteId,
      compte_nom: compteNom,
      civilite: civilite || null,
      prenom: toTitleCaseFR(prenom),
      nom: toUpperFR(nom),
      fonction: fonction || null,
      telephone: telephone || null,
      telephone_mobile: telephoneMobile || null,
      email: email || null,
      role,
      site_ids: [],
      sites: [],
    })
    onCreated(result.contact)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
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
                  civilite === c ? 'border-navy-400/60 bg-navy-50 text-navy-700' : 'border-navy-200 text-navy-500 hover:bg-navy-50'
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
                onClick={() => setRole(r)}
                className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left text-xs transition-colors ${
                  active ? meta?.active ?? 'border-navy-400/60 bg-navy-50 text-navy-700' : 'border-navy-200 text-navy-500 hover:bg-navy-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="font-medium">{r}</span>
                {meta?.desc && <span className="text-[11px] opacity-80">{meta.desc}</span>}
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
          {telError && <p className="mt-1 text-xs text-red-600">{telError}</p>}
        </FormField>
        <FormField label="Mobile">
          <Input
            value={telephoneMobile}
            onChange={(e) => setTelephoneMobile(e.target.value)}
            onBlur={(e) => setTelephoneMobile(e.target.value ? formatPhoneFR(e.target.value) : '')}
            className={matchedFields.has('mobile') ? 'ring-1 ring-amber-400' : undefined}
          />
          {mobError && <p className="mt-1 text-xs text-red-600">{mobError}</p>}
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
        {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
      </FormField>

      {duplicates.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
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

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button type="submit" disabled={createContact.isPending || !canSubmit}>{submitLabel}</Button>
      </div>
    </form>
  )
}
