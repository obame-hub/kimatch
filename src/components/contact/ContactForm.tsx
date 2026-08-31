import { useMemo, useState } from 'react'
import {
  AlertTriangle, Briefcase, Check, ClipboardList, Crown, Loader2, Mail, Phone, ShieldCheck,
  Smartphone, Sparkles, User, UserCircle2, UserRound, Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/form'
import { useContacts, useCreateContact, findContactDuplicates, type ContactDuplicate } from '@/lib/data/contacts'
import { toUpperFR, toTitleCaseFR, formatPhoneFR, isValidPhoneFR, isValidEmail } from '@/lib/textFormat'
import { contactRoleOptions } from '@/lib/contactRoles'
import { cn } from '@/lib/utils'
import type { Contact } from '@/types/domain'

const DUPLICATE_FIELD_LABEL: Record<ContactDuplicate['fields'][number], string> = {
  email: 'Email',
  phone: 'Tél fixe',
  mobile: 'Mobile',
  fullName: 'Prénom + Nom',
}

const ROLE_META: Record<string, { icon: typeof Crown; desc: string; active: string }> = {
  Décisionnaire: { icon: Crown, desc: 'Signe et valide les contrats', active: 'border-amber-400/60 bg-amber-50 text-amber-700' },
  Administratif: { icon: ClipboardList, desc: 'Gère les démarches & documents', active: 'border-sky-400/60 bg-sky-50 text-sky-700' },
  'Conseil syndical': { icon: Users, desc: 'Représente les copropriétaires', active: 'border-violet-400/60 bg-violet-50 text-violet-700' },
}

/** Encadré de section, calqué sur les Card de Tools (ContactCreationForm) : en-tête icône +
 * titre en majuscules discrètes, contenu à l'intérieur. */
function Section({ icon: Icon, title, action, children }: { icon: typeof User; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-xl border border-km-line bg-white p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-km-faint" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-km-faint">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  )
}

/** Champ avec une icône à l'intérieur (à gauche) et un éventuel indicateur à droite, comme Tools. */
function IconInput({
  icon: Icon, right, className, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: typeof Mail; right?: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-km-faint" />
      <Input {...props} className={cn('pl-9', className)} />
      {right && <span className="absolute right-3 top-1/2 -translate-y-1/2">{right}</span>}
    </div>
  )
}

/** Formulaire de création de contact, réutilisable dans le dialogue de la page Contacts et dans
 * le panneau latéral post-création de compte (Tools : ContactCreationForm en mode embedded). */
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
  const { data: allContacts, isLoading: contactsLoading } = useContacts()
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

  const hasSignal =
    (prenom.trim().length >= 2 && nom.trim().length >= 2) ||
    (!!email && isValidEmail(email)) ||
    (!!telephone && isValidPhoneFR(formatPhoneFR(telephone))) ||
    (!!telephoneMobile && isValidPhoneFR(formatPhoneFR(telephoneMobile)))

  const duplicates = useMemo(() => {
    if (!allContacts || !hasSignal) return []
    return findContactDuplicates(allContacts, {
      prenom,
      nom,
      email: email || null,
      telephone: telephone ? formatPhoneFR(telephone) : null,
      telephoneMobile: telephoneMobile ? formatPhoneFR(telephoneMobile) : null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allContacts, hasSignal, prenom, nom, email, telephone, telephoneMobile])
  const matchedFields = useMemo(() => new Set(duplicates.flatMap((d) => d.fields)), [duplicates])
  const matched = (f: ContactDuplicate['fields'][number]) => matchedFields.has(f)
  const matchedRing = (f: ContactDuplicate['fields'][number]) => (matched(f) ? 'border-amber-400 ring-2 ring-amber-100' : undefined)

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
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* En-tête de contexte (Tools : « NOUVEAU CONTACT POUR / {compte} » + badge du type) */}
      <div className="flex items-center gap-3 rounded-xl border border-km-line bg-km-bg/60 p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kiwi-50 text-km-green">
          <Briefcase className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-km-xs uppercase tracking-wide text-km-faint">Nouveau contact pour</p>
          <p className="truncate font-semibold text-km-text">{compteNom}</p>
        </div>
        {segment && <Badge tone="neutral" className="ml-auto shrink-0">{segment}</Badge>}
      </div>

      {duplicates.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="mb-1.5 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {duplicates.length === 1
              ? 'Un contact similaire est déjà présent'
              : `${duplicates.length} contacts similaires sont déjà présents`}
          </p>
          <p className="mb-2">
            Champs en correspondance :
            {Array.from(matchedFields).map((f) => (
              <span key={f} className="ml-1 rounded border border-amber-500 bg-km-amber-soft px-1.5 py-0.5 text-km-xs font-medium">
                {DUPLICATE_FIELD_LABEL[f]}
              </span>
            ))}
          </p>
          <ul className="space-y-1">
            {duplicates.slice(0, 3).map((d) => (
              <li key={d.contact.id}>
                <span className="font-medium">{d.contact.prenom} {d.contact.nom}</span>
                <span className="text-amber-700"> — {d.contact.compte_nom}</span>
                {d.contact.email && <span className="text-amber-700"> · {d.contact.email}</span>}
              </li>
            ))}
          </ul>
          {duplicates.length > 3 && <p className="mt-1 text-amber-700">+{duplicates.length - 3} autre{duplicates.length - 3 > 1 ? 's' : ''}…</p>}
          <p className="mt-2">Les champs concernés sont surlignés ci-dessous. Vérifie qu'il ne s'agit pas du même contact avant de créer.</p>
        </div>
      )}

      <Section icon={User} title="Identité">
        <div>
          <Label>Civilité <span className="text-red-500">*</span></Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(['M.', 'Mme'] as const).map((c) => {
              const Icon = c === 'M.' ? UserCircle2 : UserRound
              const active = civilite === c
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCivilite(c)}
                  className={cn(
                    'flex h-9 items-center justify-center gap-1.5 rounded-lg border-2 text-sm transition-colors',
                    active ? 'border-km-green bg-kiwi-50 font-semibold text-km-green' : 'border-km-line text-km-muted hover:border-kiwi-300',
                  )}
                >
                  <Icon className="h-4 w-4" /> {c}
                </button>
              )
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Prénom</Label>
            <Input
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              onBlur={(e) => setPrenom(toTitleCaseFR(e.target.value))}
              placeholder="Julien"
              autoComplete="given-name"
              className={matchedRing('fullName')}
            />
            <p className="mt-1 text-km-label text-km-faint">
              {matched('fullName')
                ? <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3 w-3" /> Doublon Prénom + Nom</span>
                : 'Auto-formaté'}
            </p>
          </div>
          <div>
            <Label>Nom <span className="text-red-500">*</span></Label>
            <Input
              value={nom}
              onChange={(e) => setNom(toUpperFR(e.target.value))}
              placeholder="DUPONT"
              autoComplete="family-name"
              required
              className={matchedRing('fullName')}
            />
            <p className="mt-1 text-km-label text-km-faint">MAJUSCULES auto</p>
          </div>
        </div>
      </Section>

      <Section
        icon={Mail}
        title="Coordonnées"
        action={
          contactsLoading && hasSignal ? (
            <span className="inline-flex items-center gap-1 text-km-label text-km-faint">
              <Loader2 className="h-3 w-3 animate-spin" /> Vérification doublons…
            </span>
          ) : undefined
        }
      >
        <div>
          <Label>Email professionnel</Label>
          <IconInput
            icon={Mail}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value.trim())}
            onBlur={() => setEmailTouched(true)}
            placeholder="julien.dupont@entreprise.fr"
            autoComplete="email"
            className={matchedRing('email')}
            right={
              matched('email') ? <AlertTriangle className="h-4 w-4 text-amber-600" />
              : !emailInvalid && email && isValidEmail(email) ? <Check className="h-4 w-4 text-km-green" />
              : undefined
            }
          />
          {emailError ? (
            <p className="mt-1 text-xs text-km-red">{emailError}</p>
          ) : matched('email') ? (
            <p className="mt-1 text-xs text-amber-700">Cet email existe déjà sur un autre contact</p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Téléphone fixe</Label>
            <IconInput
              icon={Phone}
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              onBlur={(e) => setTelephone(e.target.value ? formatPhoneFR(e.target.value) : '')}
              placeholder="01 23 45 67 89"
              autoComplete="tel"
              className={matchedRing('phone')}
              right={matched('phone') ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : undefined}
            />
            {telError ? (
              <p className="mt-1 text-xs text-km-red">{telError}</p>
            ) : matched('phone') ? (
              <p className="mt-1 text-xs text-amber-700">Numéro déjà utilisé par un contact</p>
            ) : null}
          </div>
          <div>
            <Label>Téléphone mobile</Label>
            <IconInput
              icon={Smartphone}
              value={telephoneMobile}
              onChange={(e) => setTelephoneMobile(e.target.value)}
              onBlur={(e) => setTelephoneMobile(e.target.value ? formatPhoneFR(e.target.value) : '')}
              placeholder="06 12 34 56 78"
              autoComplete="tel"
              className={matchedRing('mobile')}
              right={matched('mobile') ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : undefined}
            />
            {mobError ? (
              <p className="mt-1 text-xs text-km-red">{mobError}</p>
            ) : matched('mobile') ? (
              <p className="mt-1 text-xs text-amber-700">Numéro déjà utilisé par un contact</p>
            ) : null}
          </div>
        </div>
        <p className="flex items-center gap-1 text-km-label text-km-faint">
          <Sparkles className="h-3 w-3 shrink-0" /> Les numéros sont automatiquement convertis au format international (+33…)
        </p>
      </Section>

      <Section icon={ShieldCheck} title="Rôle dans le compte">
        <div>
          <Label>Fonction</Label>
          <Input value={fonction} onChange={(e) => setFonction(e.target.value)} placeholder="Ex : Directeur Général, Responsable achats…" />
        </div>
        <div>
          <Label>Rôle dans le compte <span className="text-red-500">*</span></Label>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {roleOptions.map((r) => {
              const meta = ROLE_META[r]
              const Icon = meta?.icon ?? User
              const active = role === r
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRole(active ? '' : r)}
                  className={cn(
                    'relative flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all sm:block',
                    active ? cn(meta?.active ?? 'border-km-green bg-kiwi-50 text-km-green', 'shadow-sm') : 'border-km-line bg-white hover:border-kiwi-300',
                  )}
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:mb-2', active ? 'bg-white/70' : 'bg-km-bg text-km-faint')}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm font-semibold leading-tight', !active && 'text-km-text')}>{r}</span>
                    {meta?.desc && <span className="mt-0.5 block text-km-label leading-snug text-km-muted">{meta.desc}</span>}
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 sm:absolute sm:right-3 sm:top-3" />}
                </button>
              )
            })}
          </div>
          {role === 'Décisionnaire' && (
            <p className="mt-2 flex items-center gap-1 text-km-label text-km-green">
              <Check className="h-3 w-3 shrink-0" /> Ce contact sera marqué comme décisionnaire — tu pourras l'affecter à des points de livraison juste après.
            </p>
          )}
        </div>
      </Section>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-km-line bg-white/90 py-3 backdrop-blur">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={createContact.isPending}>Annuler</Button>
        <Button type="submit" disabled={createContact.isPending || !canSubmit}>
          {createContact.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Création en cours…</> : submitLabel}
        </Button>
      </div>
    </form>
  )
}
