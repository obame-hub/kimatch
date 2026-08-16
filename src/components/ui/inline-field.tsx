import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useInlineEdit } from '@/lib/useInlineEdit'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'

/**
 * Édition inline générique — cf. handoff-fiche-compte/00-PROMPT-CLAUDE-CODE.md
 * (section "Système d'édition inline"). Un seul clic -> édition, Entrée valide,
 * Échap annule, blur valide. Placeholder en pointillés cliquable quand vide.
 * Toast + callback à la charge de l'appelant (chaque page a déjà son propre `showToast`).
 */

interface InlineFieldCommonProps {
  label?: string
  emptyLabel?: string
  onSaved?: () => void
  onError?: (err: Error) => void
  className?: string
  disabled?: boolean
  /** Rendu en mono (SIRET, montants, dates, PDL, kVA, MWh — cf. charte typographique). */
  mono?: boolean
}

interface TextFieldProps extends InlineFieldCommonProps {
  variant: 'text'
  value: string
  onCommit: (value: string) => Promise<void>
}

interface LongTextFieldProps extends InlineFieldCommonProps {
  variant: 'longtext'
  value: string
  onCommit: (value: string) => Promise<void>
  rows?: number
}

interface SelectFieldProps extends InlineFieldCommonProps {
  variant: 'select'
  value: string
  options: { value: string; label: string }[]
  onCommit: (value: string) => Promise<void>
}

interface NumberFieldProps extends InlineFieldCommonProps {
  variant: 'number'
  value: number | null
  unit: string
  onCommit: (value: number | null) => Promise<void>
}

/**
 * Adresse : concatenee en lecture, eclatee en Rue / Code postal / Ville a l'edition, avec une
 * recherche qui remplit les trois d'un coup.
 *
 * Demande du brief de William (section « Champ Adresse — comportement specifique »). Il parle
 * d'une recherche Google ; on passe par la Base Adresse Nationale, deja integree au projet
 * (`AddressAutocomplete`) et deja utilisee par Tools — gratuite, francaise, sans clef ni compte,
 * et c'est elle qui a servi a geolocaliser les 5432 villes de sites le 15/08/2026.
 */
interface AddressFieldProps extends InlineFieldCommonProps {
  variant: 'address'
  rue: string
  codePostal: string
  ville: string
  onCommit: (valeur: { rue: string; codePostal: string; ville: string }) => Promise<void>
}

/**
 * Date — demandee par le brief Fiche Site pour la date de derniere AG.
 *
 * Lue au format francais (JJ/MM/AAAA, la convention de toutes les fiches), editee dans un champ
 * `date` natif qui attend et rend de l'ISO. La conversion se fait ici, une bonne fois, plutot que
 * dans chaque page qui utiliserait le champ.
 */
interface DateFieldProps extends InlineFieldCommonProps {
  variant: 'date'
  /** Date ISO (AAAA-MM-JJ) ou null. */
  value: string | null
  onCommit: (value: string | null) => Promise<void>
}

export type InlineFieldProps =
  | TextFieldProps
  | LongTextFieldProps
  | SelectFieldProps
  | NumberFieldProps
  | AddressFieldProps
  | DateFieldProps

const inputBase =
  'w-full rounded-kw-sm border border-kw-green bg-kw-surface px-1.5 py-0.5 text-kw-lg text-kw-ink outline-none focus:ring-1 focus:ring-kw-green'

function EmptyPlaceholder({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-kw-sm border border-dashed border-kw-border-strong px-1.5 py-0.5 text-kw-lg text-kw-faint transition-colors hover:border-kw-green hover:text-kw-green"
    >
      ＋ {label}
    </button>
  )
}

export function InlineField(props: InlineFieldProps) {
  switch (props.variant) {
    case 'text': return <TextInlineField {...props} />
    case 'longtext': return <LongTextInlineField {...props} />
    case 'select': return <SelectInlineField {...props} />
    case 'number': return <NumberInlineField {...props} />
    case 'address': return <AddressInlineField {...props} />
    case 'date': return <DateInlineField {...props} />
  }
}

function DateInlineField({ value, onCommit, label, emptyLabel = 'ajouter une date', onSaved, onError, className, disabled }: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [texte, setTexte] = useState(value ?? '')
  const [editing, setEditing] = useState(false)
  const [enCours, setEnCours] = useState(false)

  function start() {
    if (disabled) return
    setTexte(value ?? '')
    setEditing(true)
  }
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.showPicker?.() } }, [editing])

  async function valider() {
    if (enCours) return
    setEnCours(true)
    try {
      await onCommit(texte.trim() === '' ? null : texte)
      setEditing(false)
      onSaved?.()
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className={cn('min-w-0', className)}>
      {label && <div className="mb-0.5 text-kw-xs font-semibold uppercase tracking-wide text-kw-faint">{label}</div>}
      {editing ? (
        <input
          ref={inputRef}
          type="date"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={valider}
          onKeyDown={(e) => { if (e.key === 'Enter') valider(); if (e.key === 'Escape') setEditing(false) }}
          className={cn(inputBase, 'font-mono')}
        />
      ) : value ? (
        <button
          type="button"
          disabled={disabled}
          onClick={start}
          className="rounded-kw-sm px-1.5 py-0.5 text-left font-mono text-kw-lg text-kw-ink transition-colors hover:bg-kw-muted"
        >
          {new Date(value).toLocaleDateString('fr-FR')}
        </button>
      ) : (
        <EmptyPlaceholder label={emptyLabel} onClick={start} />
      )}
    </div>
  )
}

function AddressInlineField({
  rue, codePostal, ville, onCommit, label = 'Adresse', emptyLabel = 'ajouter une adresse',
  onSaved, onError, className, disabled,
}: AddressFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ rue, codePostal, ville })
  const [recherche, setRecherche] = useState('')
  const [enCours, setEnCours] = useState(false)
  const premierRef = useRef<HTMLInputElement>(null)

  // La ligne telle qu'elle se lit : « 6 AVENUE CHARLES, 95870 BEZONS ».
  const concatenee = [rue, [codePostal, ville].filter(Boolean).join(' ')].filter((p) => p && p.trim()).join(', ')

  function start() {
    if (disabled) return
    setDraft({ rue, codePostal, ville })
    setRecherche('')
    setEditing(true)
  }

  useEffect(() => { if (editing) premierRef.current?.focus() }, [editing])

  async function valider() {
    if (enCours) return
    setEnCours(true)
    try {
      await onCommit({ rue: draft.rue.trim(), codePostal: draft.codePostal.trim(), ville: draft.ville.trim() })
      setEditing(false)
      onSaved?.()
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setEnCours(false)
    }
  }

  if (!editing) {
    return (
      <div className={cn('min-w-0', className)}>
        {label && <div className="mb-0.5 text-kw-xs font-semibold uppercase tracking-wide text-kw-faint">{label}</div>}
        {concatenee ? (
          <button
            type="button"
            disabled={disabled}
            onClick={start}
            className="block w-full rounded-kw-sm px-1.5 py-0.5 text-left text-kw-lg text-kw-ink transition-colors hover:bg-kw-muted"
          >
            {concatenee}
          </button>
        ) : (
          <EmptyPlaceholder label={emptyLabel} onClick={start} />
        )}
      </div>
    )
  }

  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      {label && <div className="text-kw-xs font-semibold uppercase tracking-wide text-kw-faint">{label}</div>}

      {/* La recherche remplit les trois champs d'un coup : c'est elle qui normalise le format,
          et c'est ce qui evite les « 6 av. Charles » a cote des « 6 AVENUE CHARLES ». */}
      <AddressAutocomplete
        value={recherche}
        onChange={setRecherche}
        onSelect={(a) => {
          setDraft({
            rue: (a.rue ?? '').toUpperCase(),
            codePostal: a.codePostal ?? '',
            ville: (a.ville ?? '').toUpperCase(),
          })
          setRecherche('')
        }}
        placeholder="Rechercher une adresse…"
      />

      <input
        ref={premierRef}
        value={draft.rue}
        onChange={(e) => setDraft((d) => ({ ...d, rue: e.target.value }))}
        onKeyDown={(e) => { if (e.key === 'Enter') valider(); if (e.key === 'Escape') setEditing(false) }}
        placeholder="Rue"
        className={inputBase}
      />
      <div className="flex gap-1.5">
        <input
          value={draft.codePostal}
          onChange={(e) => setDraft((d) => ({ ...d, codePostal: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') valider(); if (e.key === 'Escape') setEditing(false) }}
          placeholder="Code postal"
          className={cn(inputBase, 'w-28 font-mono')}
        />
        <input
          value={draft.ville}
          onChange={(e) => setDraft((d) => ({ ...d, ville: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') valider(); if (e.key === 'Escape') setEditing(false) }}
          placeholder="Ville"
          className={inputBase}
        />
      </div>
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={() => setEditing(false)} className="rounded-kw-sm px-2 py-0.5 text-kw-sm text-kw-meta hover:bg-kw-muted">
          Annuler
        </button>
        <button type="button" onClick={valider} disabled={enCours} className="rounded-kw-sm bg-kw-green px-2 py-0.5 text-kw-sm font-semibold text-white disabled:opacity-50">
          {enCours ? 'Enregistrement…' : 'Valider'}
        </button>
      </div>
    </div>
  )
}

function TextInlineField({ value, onCommit, label, emptyLabel = 'ajouter', onSaved, onError, className, disabled, mono }: TextFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { editing, draft, setDraft, displayValue, start, commit, handleKeyDown } = useInlineEdit({
    value, onCommit, onSaved, onError,
  })

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
  }, [editing])

  return (
    <div className={cn('min-w-0', className)}>
      {label && <div className="mb-0.5 text-kw-xs font-semibold uppercase tracking-wide text-kw-faint">{label}</div>}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className={cn(inputBase, mono && 'font-mono')}
        />
      ) : displayValue ? (
        <button
          type="button"
          disabled={disabled}
          onClick={start}
          className={cn('block w-full truncate rounded-kw-sm px-1.5 py-0.5 text-left text-kw-lg text-kw-ink transition-colors hover:bg-kw-muted', mono && 'font-mono')}
        >
          {displayValue}
        </button>
      ) : (
        <EmptyPlaceholder label={emptyLabel} onClick={start} />
      )}
    </div>
  )
}

function LongTextInlineField({ value, onCommit, label, emptyLabel = 'ajouter un commentaire', onSaved, onError, className, rows = 5 }: LongTextFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const { editing, draft, setDraft, displayValue, start, commit } = useInlineEdit({ value, onCommit, onSaved, onError })

  useEffect(() => { if (editing && ref.current) { ref.current.focus() } }, [editing])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); ref.current?.blur() }
  }

  return (
    <div className={className}>
      {label && <div className="mb-1 text-kw-xs font-semibold uppercase tracking-wide text-kw-faint">{label}</div>}
      {editing ? (
        <textarea
          ref={ref}
          rows={rows}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className={cn(inputBase, 'resize-none leading-relaxed')}
        />
      ) : displayValue ? (
        <p onClick={start} className="cursor-pointer whitespace-pre-wrap rounded-kw-sm p-1 text-kw-lg leading-relaxed text-kw-body hover:bg-kw-muted">
          {displayValue}
        </p>
      ) : (
        <EmptyPlaceholder label={emptyLabel} onClick={start} />
      )}
    </div>
  )
}

function SelectInlineField({ value, options, onCommit, label, emptyLabel = 'choisir', onSaved, onError, className, disabled }: SelectFieldProps) {
  const ref = useRef<HTMLSelectElement>(null)
  const { editing, draft, setDraft, displayValue, start, commit, cancel } = useInlineEdit({ value, onCommit, onSaved, onError })
  const currentLabel = options.find((o) => o.value === displayValue)?.label

  useEffect(() => { if (editing && ref.current) ref.current.focus() }, [editing])

  return (
    <div className={cn('min-w-0', className)}>
      {label && <div className="mb-0.5 text-kw-xs font-semibold uppercase tracking-wide text-kw-faint">{label}</div>}
      {editing ? (
        <select
          ref={ref}
          value={draft}
          onChange={(e) => { setDraft(e.target.value) }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Escape') cancel() }}
          className={inputBase}
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : currentLabel ? (
        <button type="button" disabled={disabled} onClick={start} className="block w-full truncate rounded-kw-sm px-1.5 py-0.5 text-left text-kw-lg text-kw-ink transition-colors hover:bg-kw-muted">
          {currentLabel}
        </button>
      ) : (
        <EmptyPlaceholder label={emptyLabel} onClick={start} />
      )}
    </div>
  )
}

function NumberInlineField({ value, unit, onCommit, label, emptyLabel = 'ajouter', onSaved, onError, className, disabled }: NumberFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(value != null ? String(value) : '')
  const { editing, displayValue, start: startBase, commit: commitBase, cancel, handleKeyDown } = useInlineEdit<number | null>({
    value, onCommit, onSaved, onError,
  })

  function start() { setText(value != null ? String(value) : ''); startBase() }
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select() } }, [editing])

  async function commit() {
    const n = text.trim() === '' ? null : Number(text)
    if (n !== null && Number.isNaN(n)) return cancel()
    await onCommit(n)
    commitBase()
  }

  return (
    <div className={className}>
      {label && <div className="mb-0.5 text-kw-xs font-semibold uppercase tracking-wide text-kw-faint">{label}</div>}
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="number"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            className={cn(inputBase, 'font-mono')}
          />
          <span className="text-kw-sm text-kw-meta">{unit}</span>
        </div>
      ) : displayValue != null ? (
        <button type="button" disabled={disabled} onClick={start} className="rounded-kw-sm px-1.5 py-0.5 text-left font-mono text-kw-lg text-kw-ink transition-colors hover:bg-kw-muted">
          {displayValue.toLocaleString('fr-FR')} <span className="text-kw-meta">{unit}</span>
        </button>
      ) : (
        <EmptyPlaceholder label={emptyLabel} onClick={start} />
      )}
    </div>
  )
}
