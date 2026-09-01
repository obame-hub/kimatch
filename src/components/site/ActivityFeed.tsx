import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Mail, Users, Radio, CheckSquare, FileText, Send } from 'lucide-react'
import { Textarea } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { ActivityCard, type ActivityStyleKey } from '@/components/ui/activity-card'
import { useCreateInteraction } from '@/lib/data/interactions'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_INTERACTIONS } from '@/lib/referenceFallbacks'
import { InteractionSentence, classifyInteraction } from '@/lib/interactionSentence'
import { cn } from '@/lib/utils'
import type { Signal, Interaction, ActionItem, DocumentItem } from '@/types/domain'

interface ActivityItem {
  id: string
  date: string
  kind: 'signal' | 'interaction' | 'action' | 'document'
  title: string
  subtitle: ReactNode
  /** Ce qui a été écrit — le corps de la note. Le sous-titre dit qui a fait quoi ; sans ce
   *  champ, le fil annonçait « Untel a ajouté une note » sans jamais montrer la note. */
  body?: string
  to?: string
  href?: string
  siteNom?: string
  contactNom?: string
  interaction?: Interaction
}

function fromSignaux(signaux: Signal[]): ActivityItem[] {
  return signaux.map((s) => ({
    id: `sig-${s.id}`,
    date: s.date_creation,
    kind: 'signal',
    title: s.type_signal,
    subtitle: s.description || s.statut,
    to: `/signaux/${s.id}`,
    siteNom: s.site_nom,
  }))
}

function fromInteractions(interactions: Interaction[]): ActivityItem[] {
  return interactions.map((i) => ({
    id: `int-${i.id}`,
    date: i.date_interaction,
    kind: 'interaction',
    title: i.objet || i.type_interaction,
    // Reproduit le fil d'activite Salesforce : "{auteur} a une prochaine tache avec {contact}
    // sur {related}", chaque entite cliquable -- demande explicite du 31/07/2026.
    subtitle: <InteractionSentence interaction={i} />,
    // Le compte rendu de l'échange, ou le texte de la note. `resultat` complète le `resume` sur
    // les interactions importées de Salesforce, qui remplissaient parfois l'un ou l'autre.
    body: i.resume?.trim() || i.resultat?.trim() || undefined,
    to: `/interactions/${i.id}`,
    siteNom: i.site_nom || undefined,
    contactNom: i.contact_nom || undefined,
    interaction: i,
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

// classifyInteraction() regarde le type ET l'objet (les titres importes de Salesforce sont
// parfois en anglais/sans accent, ex. "Missed Call from...", "REUNION - ...") -- plus fiable
// que l'ancienne heuristique basee sur le seul titre.
function styleKeyFor(item: ActivityItem): ActivityStyleKey {
  if (item.kind === 'interaction') {
    if (!item.interaction) return 'email'
    const cat = classifyInteraction(item.interaction)
    return cat === 'appel' || cat === 'note' ? cat : 'email'
  }
  if (item.kind === 'action') return 'action'
  return item.kind
}

function interactionIcon(interaction: Interaction) {
  const cat = classifyInteraction(interaction)
  if (cat === 'appel') return Phone
  if (cat === 'reunion' || cat === 'visite') return Users
  return Mail
}

// Regroupe par date relative comme chez William : Demain / Aujourd'hui / Hier, puis dates absolues.
function relativeGroupLabel(dateStr: string): { label: string; diffDays: number } {
  const d = new Date(dateStr)
  const startOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000)
  if (diffDays === 0) return { label: "Aujourd'hui", diffDays }
  if (diffDays === 1) return { label: 'Demain', diffDays }
  if (diffDays === -1) return { label: 'Hier', diffDays }
  if (diffDays > 1 && diffDays <= 6) return { label: d.toLocaleDateString('fr-FR', { weekday: 'long' }), diffDays }
  return { label: d.toLocaleDateString('fr-FR'), diffDays }
}

// Pastille pleine par séparateur de date (mesuré pixel pour pixel dans la référence William :
// #0d7a5f aujourd'hui, #b57a24 à venir, #16181d passé) -- remplace l'ancien "text-km-xs
// text-km-faint" explicitement signalé trop discret dans le prompt de handoff.
function groupBadgeClass(diffDays: number): string {
  if (diffDays === 0) return 'bg-km-green'
  if (diffDays > 0) return 'bg-km-amber'
  return 'bg-km-text'
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
  recommandationId,
  recommandationNom,
  suiviContratId,
  actionsRapides,
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
  /** Rattache les notes écrites ici à une recommandation. Sans cela, une note saisie sur la fiche
   *  recommandation partirait au niveau du compte et ne reviendrait jamais dans ce fil. */
  recommandationId?: string | null
  recommandationNom?: string
  /** Même rôle pour un suivi de contrat : une note écrite sur sa fiche doit y rester (31/08/2026). */
  suiviContratId?: string | null
  /** Boutons d'action rapide au-dessus du champ de note — « Rappel » et « Loguer un appel » dans la
   *  maquette de la fiche Recommandation. La fiche fournit le geste, le fil fournit la place. */
  actionsRapides?: ReactNode
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
  const rows: Array<{ type: 'header'; label: string; diffDays: number } | { type: 'item'; item: ActivityItem }> = []
  let lastLabel: string | null = null
  for (const item of filteredItems) {
    const { label, diffDays } = relativeGroupLabel(item.date)
    if (label !== lastLabel) {
      rows.push({ type: 'header', label, diffDays })
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
      recommandation_id: recommandationId ?? null,
      recommandation_nom: recommandationNom ?? null,
      suivi_contrat_id: suiviContratId ?? null,
    })
    setNote('')
    setFeedback(result.persisted ? 'Note ajoutée.' : 'Note ajoutée localement (non synchronisée avec Supabase).')
    setTimeout(() => setFeedback(null), 2000)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {filterDimension === 'site' && (
        <div className="flex gap-0.5 rounded-lg bg-km-soft p-0.5">
          {(['site', 'contact'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setFilterValue(null) }}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-km-label font-medium transition-colors',
                mode === m ? 'bg-white text-km-text shadow-sm' : 'text-km-muted hover:text-km-text',
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
              'rounded-full px-2.5 py-1 text-km-label font-semibold',
              filterValue === null ? 'bg-ink-800 text-white' : 'bg-km-soft text-km-muted hover:bg-km-line',
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
                'rounded-full px-2.5 py-1 text-km-label font-semibold',
                filterValue === v ? 'bg-ink-800 text-white' : 'bg-km-soft text-km-muted hover:bg-km-line',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {rows.length === 0 && <p className="text-sm text-km-faint">Aucune activité pour le moment.</p>}
        {rows.map((row, idx) =>
          row.type === 'header' ? (
            <div key={`h-${idx}`} className="flex items-center gap-2.5 pt-2.5 first:pt-0">
              {/* 12px et non plus 10 : « les separateurs de date sont trop discrets, "A venir" /
                  "Aujourd'hui" / "Hier" doivent se lire au premier coup d'oeil » (brief de
                  William). Le trait qui suit passe en teinte de la pastille plutot qu'en gris
                  neutre, pour que l'oeil suive la ligne. */}
              <span className={cn('rounded-full px-2.5 py-1 text-km-label font-semibold text-white shadow-sm', groupBadgeClass(row.diffDays))}>
                {row.label}
              </span>
              <div className={cn('h-0.5 flex-1 rounded-full opacity-25', groupBadgeClass(row.diffDays))} />
            </div>
          ) : (
            <ActivityCard
              key={row.item.id}
              styleKey={styleKeyFor(row.item)}
              icon={row.item.kind === 'interaction' && row.item.interaction ? interactionIcon(row.item.interaction) : KIND_ICON[row.item.kind]}
              title={row.item.title}
              subtitle={row.item.subtitle}
              body={row.item.body}
              trailing={new Date(row.item.date).toLocaleDateString('fr-FR')}
              onClick={row.item.to ? () => navigate(row.item.to!) : undefined}
              href={row.item.href}
            />
          ),
        )}
      </div>

      {actionsRapides && <div className="flex gap-1.5 border-t border-km-line pt-2.5">{actionsRapides}</div>}

      <form onSubmit={envoyerNote} className={cn('flex items-start gap-2 pt-2.5', !actionsRapides && 'border-t border-km-line')}>
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
      {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
    </div>
  )
}
