import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Plus, Search, User, UserPlus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { ContactForm } from '@/components/contact/ContactForm'
import { cn } from '@/lib/utils'
import type { Contact } from '@/types/domain'

function initials(prenom: string, nom: string): string {
  return `${(prenom || '?')[0]}${(nom || '?')[0]}`.toUpperCase()
}

function joinNameParts(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** Sélecteur de contact à deux onglets -- transposition du `ContactPicker` de Tools
 * (`src/components/pdl/ContactPicker.tsx`) : même déclencheur combobox, mêmes onglets
 * « Contacts du compte (N) » / « Autre contact », mêmes textes vides, même pied
 * « Créer un nouveau contact », et la ligne « ✉ email · ☎ téléphone … × retirer » SOUS le champ.
 *
 * Une seule adaptation technique : le panneau de création est monté via un portail sur
 * `document.body`. Ce composant vit à l'intérieur d'un `<form>` (brouillon de PDL) et le
 * formulaire de contact en contient un autre — imbriquer deux `<form>` dans le DOM n'est pas
 * valide. Tools n'a pas le problème : son dialogue passe déjà par un portail Radix. */
export function ContactPicker({
  value,
  onChange,
  accountContacts,
  allContacts,
  loading,
  accountId,
  accountNom,
  segment,
  /** Aucun compte rattaché : seule la recherche globale est proposée (comme `noAccount` de Tools). */
  noAccount,
}: {
  value: string
  onChange: (contactId: string, contact: Contact | null) => void
  accountContacts: Contact[]
  /** Tous les contacts du CRM -- alimente l'onglet « Autre contact ». */
  allContacts: Contact[]
  loading?: boolean
  accountId?: string | null
  accountNom?: string
  segment?: string | null
  noAccount?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [tab, setTab] = useState<'linked' | 'global'>(noAccount ? 'global' : 'linked')
  const [linkedSearch, setLinkedSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  // Filet : un contact tout juste créé peut ne pas encore être revenu dans les listes du parent.
  const [dernierChoisi, setDernierChoisi] = useState<Contact | null>(null)
  const conteneurRef = useRef<HTMLDivElement>(null)

  const canCreate = !!accountId && !noAccount

  const selected = useMemo(
    () =>
      accountContacts.find((c) => c.id === value) ??
      allContacts.find((c) => c.id === value) ??
      (dernierChoisi?.id === value ? dernierChoisi : null),
    [accountContacts, allContacts, value, dernierChoisi],
  )
  const isExternal = !!selected && !accountContacts.some((c) => c.id === selected.id)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!conteneurRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const filteredLinked = useMemo(() => {
    if (!linkedSearch.trim()) return accountContacts
    const q = linkedSearch.toLowerCase()
    return accountContacts.filter((c) =>
      joinNameParts(c.prenom, c.nom, c.fonction, c.email).toLowerCase().includes(q),
    )
  }, [accountContacts, linkedSearch])

  const idsDuCompte = useMemo(() => new Set(accountContacts.map((c) => c.id)), [accountContacts])
  const globalResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase()
    if (q.length < 2) return []
    return allContacts
      .filter((c) => noAccount || !idsDuCompte.has(c.id))
      .filter((c) => joinNameParts(c.prenom, c.nom, c.fonction, c.email, c.compte_nom).toLowerCase().includes(q))
      .slice(0, 50)
  }, [allContacts, idsDuCompte, globalSearch, noAccount])

  function select(c: Contact) {
    setDernierChoisi(c)
    onChange(c.id, c)
    setOpen(false)
    setLinkedSearch('')
    setGlobalSearch('')
  }

  // Fonction de rendu (et non sous-composant) : un composant redéfini à chaque rendu remonterait
  // toute la liste, ce qui ferait perdre le focus du champ de filtre.
  function ligne(contact: Contact, montrerCompte?: boolean) {
    const estSelectionne = value === contact.id
    return (
      <button
        key={contact.id}
        type="button"
        onClick={() => select(contact)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors',
          estSelectionne ? 'bg-kiwi-50 ring-1 ring-kiwi-200' : 'hover:bg-km-bg',
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-km-soft text-[10px] font-bold text-km-muted">
          {initials(contact.prenom, contact.nom)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-km-text">{joinNameParts(contact.prenom, contact.nom)}</span>
            {montrerCompte && contact.compte_nom && (
              <Badge tone="neutral" className="shrink-0 px-1 py-0 text-[9px] font-normal">{contact.compte_nom}</Badge>
            )}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-km-faint">
            {contact.fonction && <span className="truncate">{contact.fonction}</span>}
            {contact.fonction && contact.email && <span>·</span>}
            {contact.email && <span className="truncate">{contact.email}</span>}
          </span>
        </span>
        {estSelectionne && <Check className="h-3.5 w-3.5 shrink-0 text-km-green" />}
      </button>
    )
  }

  return (
    <div ref={conteneurRef} className="relative space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-auto min-h-9 w-full items-center justify-between rounded-lg border border-km-line bg-white px-3 py-2 text-sm font-normal transition-colors hover:bg-km-bg',
          !selected && 'text-km-faint',
        )}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-km-green text-[10px] font-bold text-white">
              {initials(selected.prenom, selected.nom)}
            </span>
            <span className="truncate text-sm text-km-text">{selected.prenom} {selected.nom}</span>
            {isExternal && <Badge tone="neutral" className="shrink-0 px-1.5 py-0 text-[9px]">Externe</Badge>}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4" />
            Sélectionner un responsable…
          </span>
        )}
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-km-faint" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-40 rounded-xl border border-km-line bg-white shadow-xl">
          {!noAccount && (
            <div className="flex border-b border-km-line">
              <button
                type="button"
                onClick={() => setTab('linked')}
                className={cn(
                  'flex-1 py-2.5 text-xs font-medium transition-colors',
                  tab === 'linked' ? 'border-b-2 border-kiwi-600 text-km-text' : 'text-km-faint hover:text-km-text',
                )}
              >
                Contacts du compte
                <span className="ml-1 text-[10px] opacity-70">({accountContacts.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('global')}
                className={cn(
                  'flex-1 py-2.5 text-xs font-medium transition-colors',
                  tab === 'global' ? 'border-b-2 border-kiwi-600 text-km-text' : 'text-km-faint hover:text-km-text',
                )}
              >
                <UserPlus className="mr-1 inline h-3 w-3" />
                Autre contact
              </button>
            </div>
          )}

          <div className="p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-km-faint" />
              <input
                autoFocus
                placeholder={tab === 'linked' ? 'Filtrer les contacts liés…' : 'Rechercher dans tous les contacts…'}
                value={tab === 'linked' ? linkedSearch : globalSearch}
                onChange={(e) => (tab === 'linked' ? setLinkedSearch(e.target.value) : setGlobalSearch(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                className="h-8 w-full rounded-lg border border-km-line pl-8 pr-2 text-xs text-km-text placeholder:text-km-faint focus:border-km-green focus:outline-none focus:ring-1 focus:ring-kiwi-500"
              />
            </div>
          </div>

          <div className="max-h-[280px] space-y-1 overflow-y-auto px-2 pb-2">
            {tab === 'linked' ? (
              loading ? (
                <p className="py-6 text-center text-xs text-km-faint">Chargement…</p>
              ) : filteredLinked.length === 0 ? (
                <p className="py-6 text-center text-xs text-km-faint">
                  {accountContacts.length === 0 ? 'Aucun contact lié à ce compte' : 'Aucun résultat'}
                </p>
              ) : (
                filteredLinked.map((c) => ligne(c))
              )
            ) : globalSearch.trim().length < 2 ? (
              <p className="py-6 text-center text-xs text-km-faint">Saisissez au moins 2 caractères</p>
            ) : globalResults.length === 0 ? (
              <p className="py-6 text-center text-xs text-km-faint">Aucun contact trouvé</p>
            ) : (
              globalResults.map((c) => ligne(c, true))
            )}
          </div>

          {canCreate && (
            <div className="border-t border-km-line p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start gap-2 text-xs"
                onClick={() => { setOpen(false); setCreateOpen(true) }}
              >
                <Plus className="h-3.5 w-3.5" />
                Créer un nouveau contact
              </Button>
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="flex items-center gap-2 px-1 text-[11px] text-km-faint">
          {selected.email && <span className="truncate">✉ {selected.email}</span>}
          {selected.email && (selected.telephone || selected.telephone_mobile) && <span>·</span>}
          {(selected.telephone || selected.telephone_mobile) && <span>☎ {selected.telephone ?? selected.telephone_mobile}</span>}
          <button
            type="button"
            onClick={() => { setDernierChoisi(null); onChange('', null) }}
            className="ml-auto inline-flex items-center gap-0.5 transition-colors hover:text-km-red"
            aria-label="Retirer le contact"
          >
            <X className="h-3 w-3" /> retirer
          </button>
        </div>
      )}

      {canCreate &&
        createPortal(
          <Sheet
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            title="Ajouter un contact"
            description={accountNom ? `Rattaché à ${accountNom}` : undefined}
          >
            {createOpen && (
              <ContactForm
                compteId={accountId as string}
                compteNom={accountNom ?? ''}
                segment={segment}
                onCancel={() => setCreateOpen(false)}
                onCreated={(contact) => {
                  setCreateOpen(false)
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
