import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, UserPlus, X } from 'lucide-react'
import { Sheet } from '@/components/ui/sheet'
import { ContactForm } from '@/components/contact/ContactForm'
import { cn } from '@/lib/utils'
import type { Contact } from '@/types/domain'

function initiales(c: Contact): string {
  const i = `${(c.prenom ?? '').charAt(0)}${(c.nom ?? '').charAt(0)}`.trim().toUpperCase()
  return i || '?'
}

function correspond(c: Contact, q: string): boolean {
  if (!q) return true
  const hay = `${c.prenom} ${c.nom} ${c.email ?? ''} ${c.compte_nom ?? ''} ${c.fonction ?? ''}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((mot) => hay.includes(mot))
}

function Avatar({ contact, className }: { contact: Contact; className?: string }) {
  return (
    <span
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-100 text-[10px] font-semibold text-navy-600',
        className,
      )}
    >
      {initiales(contact)}
    </span>
  )
}

function Ligne({ contact, actif, onClick, montrerCompte }: { contact: Contact; actif: boolean; onClick: () => void; montrerCompte?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
        actif ? 'bg-kiwi-50' : 'hover:bg-navy-50',
      )}
    >
      <Avatar contact={contact} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-navy-800">{contact.prenom} {contact.nom}</span>
        <span className="block truncate text-[11px] text-navy-400">
          {contact.email || 'Pas d’email'}
          {montrerCompte && contact.compte_nom ? ` · ${contact.compte_nom}` : ''}
        </span>
      </span>
    </button>
  )
}

/** Sélecteur de contact à deux onglets -- réplique le ContactPicker de Tools (champ « Responsable »
 * du PDL, contact décisionnaire de l'opportunité) :
 *  - onglet « Contacts du compte (N) » : les contacts rattachés au compte courant
 *  - onglet « Autre contact » : recherche sur tout le CRM, pour les cas où le bon interlocuteur est
 *    rattaché ailleurs (cabinet de syndic gérant plusieurs entités, par exemple)
 *  - pied de liste « + Créer un nouveau contact » : création en ligne, sans quitter le formulaire
 *  - une fois choisi : avatar + nom, email en dessous, lien « retirer » à droite
 *
 * Le panneau de création est monté via un portail sur `document.body` : ce composant vit souvent
 * à l'intérieur d'un `<form>` (brouillon de PDL) et le formulaire de contact en contient un autre —
 * imbriquer deux `<form>` dans le DOM n'est pas valide. */
export function ContactPicker({
  value,
  onChange,
  contactsDuCompte,
  allContacts,
  compteId,
  compteNom,
  segment,
  invalid,
  disabled,
  placeholder = 'Sélectionner un contact…',
}: {
  value: string
  onChange: (contactId: string, contact: Contact | null) => void
  contactsDuCompte: Contact[]
  /** Tous les contacts du CRM, pour l'onglet « Autre contact ». */
  allContacts: Contact[]
  compteId: string
  compteNom: string
  segment?: string | null
  /** Surlignage ambre quand le champ est requis et encore vide (même affordance que Tools). */
  invalid?: boolean
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [onglet, setOnglet] = useState<'compte' | 'autre'>('compte')
  const [filtre, setFiltre] = useState('')
  const [creationOuverte, setCreationOuverte] = useState(false)
  // Filet : un contact tout juste créé peut ne pas encore être revenu dans les listes du parent.
  const [dernierChoisi, setDernierChoisi] = useState<Contact | null>(null)
  const conteneurRef = useRef<HTMLDivElement>(null)

  const selection = useMemo(
    () =>
      allContacts.find((c) => c.id === value) ??
      contactsDuCompte.find((c) => c.id === value) ??
      (dernierChoisi?.id === value ? dernierChoisi : null),
    [allContacts, contactsDuCompte, value, dernierChoisi],
  )

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!conteneurRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const listeCompte = useMemo(() => contactsDuCompte.filter((c) => correspond(c, filtre)), [contactsDuCompte, filtre])
  const idsDuCompte = useMemo(() => new Set(contactsDuCompte.map((c) => c.id)), [contactsDuCompte])
  const listeAutres = useMemo(() => {
    if (filtre.trim().length < 2) return []
    return allContacts.filter((c) => !idsDuCompte.has(c.id) && correspond(c, filtre)).slice(0, 50)
  }, [allContacts, idsDuCompte, filtre])

  function choisir(c: Contact) {
    setDernierChoisi(c)
    onChange(c.id, c)
    setOpen(false)
    setFiltre('')
  }

  function ouvrir(onglet_: 'compte' | 'autre' = 'compte') {
    if (disabled) return
    setOnglet(onglet_)
    setOpen((v) => !v)
  }

  return (
    <div ref={conteneurRef} className="relative">
      {selection ? (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5',
            invalid ? 'border-amber-500 bg-amber-50/40' : 'border-navy-200',
          )}
        >
          <Avatar contact={selection} />
          <button
            type="button"
            disabled={disabled}
            onClick={() => ouvrir('compte')}
            className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
          >
            <span className="block truncate text-sm text-navy-800">{selection.prenom} {selection.nom}</span>
            <span className="block truncate text-[11px] text-navy-400">{selection.email || 'Pas d’email'}</span>
          </button>
          {!disabled && (
            <button
              type="button"
              onClick={() => { onChange('', null); setOpen(false) }}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-navy-400 transition-colors hover:bg-navy-50 hover:text-red-600"
            >
              <X className="h-3 w-3" /> retirer
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => ouvrir('compte')}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-lg border bg-white px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60',
            invalid ? 'border-amber-500 bg-amber-50/40 text-navy-600' : 'border-navy-200 text-navy-400 hover:border-kiwi-300',
          )}
        >
          {placeholder}
          <ChevronDown className="h-4 w-4 shrink-0 text-navy-400" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-xl border border-navy-200 bg-white p-2 shadow-xl">
          <div className="mb-2 flex gap-1 rounded-lg bg-navy-50 p-0.5">
            {([
              ['compte', `Contacts du compte (${contactsDuCompte.length})`],
              ['autre', 'Autre contact'],
            ] as const).map(([code, libelle]) => (
              <button
                key={code}
                type="button"
                onClick={() => setOnglet(code)}
                className={cn(
                  'flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  onglet === code ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700',
                )}
              >
                {libelle}
              </button>
            ))}
          </div>

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy-400" />
            <input
              autoFocus
              value={filtre}
              onChange={(e) => setFiltre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
              placeholder={onglet === 'compte' ? 'Filtrer les contacts liés…' : 'Rechercher dans tout le CRM…'}
              className="h-8 w-full rounded-lg border border-navy-200 pl-8 pr-2 text-sm text-navy-800 placeholder:text-navy-400 focus:border-kiwi-500 focus:outline-none focus:ring-1 focus:ring-kiwi-500"
            />
          </div>

          <div className="max-h-52 space-y-0.5 overflow-y-auto">
            {onglet === 'compte' ? (
              listeCompte.length > 0 ? (
                listeCompte.map((c) => <Ligne key={c.id} contact={c} actif={c.id === value} onClick={() => choisir(c)} />)
              ) : (
                <p className="px-2 py-3 text-center text-[11px] text-navy-400">
                  {contactsDuCompte.length === 0
                    ? 'Aucun contact rattaché à ce compte.'
                    : 'Aucun contact ne correspond au filtre.'}
                </p>
              )
            ) : filtre.trim().length < 2 ? (
              <p className="px-2 py-3 text-center text-[11px] text-navy-400">Tape au moins 2 caractères pour chercher dans tout le CRM.</p>
            ) : listeAutres.length > 0 ? (
              listeAutres.map((c) => <Ligne key={c.id} contact={c} actif={c.id === value} onClick={() => choisir(c)} montrerCompte />)
            ) : (
              <p className="px-2 py-3 text-center text-[11px] text-navy-400">Aucun contact trouvé dans le reste du CRM.</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => { setOpen(false); setCreationOuverte(true) }}
            className="mt-1 flex w-full items-center gap-1.5 border-t border-navy-100 px-2 pt-2 text-[11px] font-medium text-kiwi-700 hover:underline"
          >
            <UserPlus className="h-3.5 w-3.5" /> Créer un nouveau contact
          </button>
        </div>
      )}

      {createPortal(
        <Sheet
          open={creationOuverte}
          onClose={() => setCreationOuverte(false)}
          title="Ajouter un contact"
          description={`Rattaché à ${compteNom}`}
        >
          {creationOuverte && (
            <ContactForm
              compteId={compteId}
              compteNom={compteNom}
              segment={segment}
              onCancel={() => setCreationOuverte(false)}
              onCreated={(contact) => {
                setCreationOuverte(false)
                setDernierChoisi(contact)
                onChange(contact.id, contact)
              }}
            />
          )}
        </Sheet>,
        document.body,
      )}
    </div>
  )
}
