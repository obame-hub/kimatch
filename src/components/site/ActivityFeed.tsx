import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Mail, Users, Radio, CheckSquare, FileText, Send } from 'lucide-react'
import { Textarea } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { ActivityCard, type ActivityStyleKey } from '@/components/ui/activity-card'
import { useCreateInteraction } from '@/lib/data/interactions'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_INTERACTIONS } from '@/lib/referenceFallbacks'
import { cn } from '@/lib/utils'
import type { Signal, Interaction, ActionItem, DocumentItem } from '@/types/domain'

interface ActivityItem {
  id: string
  date: string
  kind: 'signal' | 'interaction' | 'action' | 'document'
  title: string
  subtitle: string
  to?: string
  href?: string
  siteNom?: string
  contactNom?: string
}

function fromSignaux(signaux: Signal[]): ActivityItem[] {
  return signaux.map((s) => ({
    id: `sig-${s.id}`,
    date: s.date_creation,
    kind: 'signal',
    title: s.type_signal,
    subtitle: s.description || s.statut,
    siteNom: s.site_nom,
  }))
}

function fromInteractions(interactions: Interaction[]): ActivityItem[] {
  return interactions.map((i) => ({
    id: `int-${i.id}`,
    date: i.date_interaction,
    kind: 'interaction',
    title: i.objet || i.type_interaction,
    subtitle: [i.auteur, i.resume].filter(Boolean).join(' — '),
    to: `/interactions/${i.id}`,
    siteNom: i.site_nom || undefined,
    contactNom: i.contact_nom || undefined,
  }))
}

function fromActions(actions: ActionItem[]): ActivityItem[] {
  const items: ActivityItem[] = []
  for (const a of actions) {
    const tag = { contactNom: a.contact_nom || undefined }
    if (a.date_realisation) {
      items.push({ id: `act-done-${a.id}`, date: a.date_realisation, kind: 'action', title: `Terminée : ${a.titre}`, subtitle: a.type_action, to: '/taches', ...tag })
    } else if (a.echeance) {
      items.push({ id: `act-${a.id}`, date: a.echeance, kind: 'action', title: a.titre, subtitle: `À faire · ${a.type_action}`, to: '/taches', ...tag })
    }
  }
  return items
}

function fromDocuments(documents: DocumentItem[]): ActivityItem[] {
  return documents.map((d) => ({
    id: `doc-${d.id}`,
    date: d.date_creation,
    kind: 'document',
    title: d.nom,
    subtitle: `${d.type_document} · ${d.auteur}`,
    href: d.url,
  }))
}

const KIND_ICON: Record<ActivityItem['kind'], typeof Phone> = {
  signal: Radio,
  interaction: Mail,
  action: CheckSquare,
  document: FileText,
}

function interactionStyleKey(titre: string): 'appel' | 'note' | 'email' {
  const t = titre.toLowerCase()
  if (t.includes('note')) return 'note'
  if (t.includes('appel')) return 'appel'
  return 'email'
}

function styleKeyFor(item: ActivityItem): ActivityStyleKey {
  if (item.kind === 'interaction') return interactionStyleKey(item.title)
  if (item.kind === 'action') return 'action'
  return item.kind
}

function interactionIcon(titre: string) {
  const t = titre.toLowerCase()
  if (t.includes('appel')) return Phone
  if (t.includes('réunion') || t.includes('visite')) return Users
  return Mail
}

// Regroupe par date relative comme chez William : Demain / Aujourd'hui / Hier, puis dates absolues.
function relativeGroupLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const startOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000)
  if (diffDays === 0) return "Aujourd'hui"
  if (diffDays === 1) return 'Demain'
  if (diffDays === -1) return 'Hier'
  if (diffDays > 1 && diffDays <= 6) return d.toLocaleDateString('fr-FR', { weekday: 'long' })
  return d.toLocaleDateString('fr-FR')
}

export function ActivityFeed({
  siteId,
  siteNom,
  compteId,
  compteNom,
  signaux,
  interactions,
  actions,
  documents,
  filterDimension,
}: {
  siteId?: string | null
  siteNom?: string
  compteId: string
  compteNom: string
  signaux: Signal[]
  interactions: Interaction[]
  actions: ActionItem[]
  documents: DocumentItem[]
  /** Active le sélecteur "Par site / Par contact" (fiche Compte). Sans ce prop, seuls les chips "Par contact" apparaissent si des contacts sont taggés. */
  filterDimension?: 'site'
}) {
  const navigate = useNavigate()
  const createInteraction = useCreateInteraction()
  const { data: typesRef } = useReferenceTable('types_interactions')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_INTERACTIONS
  const [note, setNote] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [mode, setMode] = useState<'site' | 'contact'>('site')
  const [filterValue, setFilterValue] = useState<string | null>(null)

  const items = useMemo(
    () =>
      [
        ...fromSignaux(signaux),
        ...fromInteractions(interactions),
        ...fromActions(actions),
        ...fromDocuments(documents),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [signaux, interactions, actions, documents],
  )

  const activeDimension = filterDimension === 'site' ? mode : 'contact'
  const chipOptions = useMemo(() => {
    const key = activeDimension === 'site' ? 'siteNom' : 'contactNom'
    const values = new Set<string>()
    items.forEach((i) => { const v = i[key]; if (v) values.add(v) })
    return [...values]
  }, [items, activeDimension])

  const filteredItems = filterValue
    ? items.filter((i) => (activeDimension === 'site' ? i.siteNom : i.contactNom) === filterValue)
    : items

  // Insère un en-tête à chaque changement de libellé de date relative (les items sont déjà triés du plus récent au plus ancien).
  const rows: Array<{ type: 'header'; label: string } | { type: 'item'; item: ActivityItem }> = []
  let lastLabel: string | null = null
  for (const item of filteredItems) {
    const label = relativeGroupLabel(item.date)
    if (label !== lastLabel) {
      rows.push({ type: 'header', label })
      lastLabel = label
    }
    rows.push({ type: 'item', item })
  }

  async function envoyerNote(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    const typeAutre = types.find((t) => t.code === 'AUTRE')
    const result = await createInteraction.mutateAsync({
      type_interaction_id: typeAutre?.id ?? null,
      type_interaction_libelle: typeAutre?.libelle ?? 'Note',
      date_interaction: new Date().toISOString(),
      sens: null,
      objet: 'Note rapide',
      resume: note.trim(),
      resultat: null,
      compte_id: compteId || null,
      compte_nom: compteNom,
      site_id: siteId || null,
      site_nom: siteNom ?? '',
      contact_id: null,
      contact_nom: '',
      issue_interaction_id: null,
    })
    setNote('')
    setFeedback(result.persisted ? 'Note ajoutée.' : 'Note ajoutée localement (non synchronisée avec Supabase).')
    setTimeout(() => setFeedback(null), 2000)
  }

  return (
    <div className="flex h-full flex-col gap-2.5">
      {filterDimension === 'site' && (
        <div className="flex gap-0.5 rounded-lg bg-navy-100 p-0.5">
          {(['site', 'contact'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setFilterValue(null) }}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
                mode === m ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700',
              )}
            >
              {m === 'site' ? 'Par site' : 'Par contact'}
            </button>
          ))}
        </div>
      )}

      {chipOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilterValue(null)}
            className={cn(
              'rounded-full px-2.5 py-1 text-[10.5px] font-semibold',
              filterValue === null ? 'bg-ink-800 text-white' : 'bg-navy-100 text-navy-600 hover:bg-navy-200',
            )}
          >
            Tous
          </button>
          {chipOptions.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setFilterValue(v)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[10.5px] font-semibold',
                filterValue === v ? 'bg-ink-800 text-white' : 'bg-navy-100 text-navy-600 hover:bg-navy-200',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        {rows.length === 0 && <p className="text-sm text-navy-400">Aucune activité pour le moment.</p>}
        {rows.map((row, idx) =>
          row.type === 'header' ? (
            <div key={`h-${idx}`} className="flex items-center gap-2 pt-2 first:pt-0">
              <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">{row.label}</span>
              <div className="h-px flex-1 bg-navy-100" />
            </div>
          ) : (
            <ActivityCard
              key={row.item.id}
              styleKey={styleKeyFor(row.item)}
              icon={row.item.kind === 'interaction' ? interactionIcon(row.item.title) : KIND_ICON[row.item.kind]}
              title={row.item.title}
              subtitle={row.item.subtitle}
              trailing={new Date(row.item.date).toLocaleDateString('fr-FR')}
              onClick={row.item.to ? () => navigate(row.item.to!) : undefined}
              href={row.item.href}
            />
          ),
        )}
      </div>

      <form onSubmit={envoyerNote} className="flex items-start gap-2 border-t border-navy-100 pt-2.5">
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Écrire une note… (Entrée ↵)"
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={createInteraction.isPending || !note.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
      {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
    </div>
  )
}
