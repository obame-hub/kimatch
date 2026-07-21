import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Mail, Users, Radio, CheckSquare, FileText, Send } from 'lucide-react'
import { Textarea } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { useCreateInteraction } from '@/lib/data/interactions'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_INTERACTIONS } from '@/lib/referenceFallbacks'
import type { Signal, Interaction, ActionItem, DocumentItem } from '@/types/domain'

interface ActivityItem {
  id: string
  date: string
  kind: 'signal' | 'interaction' | 'action' | 'document'
  title: string
  subtitle: string
  to?: string
  href?: string
}

function fromSignaux(signaux: Signal[]): ActivityItem[] {
  return signaux.map((s) => ({
    id: `sig-${s.id}`,
    date: s.date_creation,
    kind: 'signal',
    title: s.type_signal,
    subtitle: s.description || s.statut,
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
  }))
}

function fromActions(actions: ActionItem[]): ActivityItem[] {
  const items: ActivityItem[] = []
  for (const a of actions) {
    if (a.date_realisation) {
      items.push({ id: `act-done-${a.id}`, date: a.date_realisation, kind: 'action', title: `Terminée : ${a.titre}`, subtitle: a.type_action, to: '/taches' })
    } else if (a.echeance) {
      items.push({ id: `act-${a.id}`, date: a.echeance, kind: 'action', title: a.titre, subtitle: `À faire · ${a.type_action}`, to: '/taches' })
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

// Un type d'activité = un fond teinté + une ligne de couleur à gauche, comme chez William.
type StyleKey = 'action' | 'note' | 'appel' | 'email' | 'signal' | 'document'
const TYPE_STYLE: Record<StyleKey, { bg: string; border: string; accent: string; plate: string; fg: string }> = {
  action: { bg: '#fdf9f0', border: '#f0e4cd', accent: '#b57a24', plate: '#f3e3c8', fg: '#8a6420' },
  note: { bg: '#fbf8f3', border: '#f0e9de', accent: '#8a6d3b', plate: '#efe6d4', fg: '#8a6d3b' },
  appel: { bg: '#f7fbf9', border: '#dcece5', accent: '#0d7a5f', plate: '#eaf4f0', fg: '#0d7a5f' },
  email: { bg: '#ffffff', border: '#e7e6e2', accent: '#3b5f8a', plate: '#eef0f4', fg: '#3b5f8a' },
  signal: { bg: '#fdf2ef', border: '#f5d9d0', accent: '#c2452d', plate: '#fbeae5', fg: '#c2452d' },
  document: { bg: '#f6f6f4', border: '#e7e6e2', accent: '#5c5f66', plate: '#f0efec', fg: '#5c5f66' },
}

function interactionStyleKey(titre: string): 'appel' | 'note' | 'email' {
  const t = titre.toLowerCase()
  if (t.includes('note')) return 'note'
  if (t.includes('appel')) return 'appel'
  return 'email'
}

function styleKeyFor(item: ActivityItem): StyleKey {
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

export function ActivityFeed({
  siteId,
  siteNom,
  compteId,
  compteNom,
  signaux,
  interactions,
  actions,
  documents,
}: {
  siteId: string
  siteNom: string
  compteId: string
  compteNom: string
  signaux: Signal[]
  interactions: Interaction[]
  actions: ActionItem[]
  documents: DocumentItem[]
}) {
  const navigate = useNavigate()
  const createInteraction = useCreateInteraction()
  const { data: typesRef } = useReferenceTable('types_interactions')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_INTERACTIONS
  const [note, setNote] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const items = [
    ...fromSignaux(signaux),
    ...fromInteractions(interactions),
    ...fromActions(actions),
    ...fromDocuments(documents),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

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
      site_id: siteId,
      site_nom: siteNom,
      contact_id: null,
      contact_nom: '',
      issue_interaction_id: null,
    })
    setNote('')
    setFeedback(result.persisted ? 'Note ajoutée.' : 'Note ajoutée localement (non synchronisée avec Supabase).')
    setTimeout(() => setFeedback(null), 2000)
  }

  return (
    <div className="space-y-3">
      <form onSubmit={envoyerNote} className="flex items-start gap-2">
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ajouter une note rapide sur ce site…"
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={createInteraction.isPending || !note.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
      {feedback && <p className="text-xs text-navy-500">{feedback}</p>}

      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {items.length === 0 && <p className="text-sm text-navy-400">Aucune activité pour ce site.</p>}
        {items.map((item) => {
          const Icon = item.kind === 'interaction' ? interactionIcon(item.title) : KIND_ICON[item.kind]
          const style = TYPE_STYLE[styleKeyFor(item)]
          const content = (
            <div
              className="flex items-start gap-2.5 rounded-lg p-2.5 transition-colors"
              style={{ background: style.bg, border: `1px solid ${style.border}`, borderLeft: `3px solid ${style.accent}` }}
            >
              <span
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{ background: style.plate, color: style.fg }}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-navy-800">{item.title}</p>
                {item.subtitle && <p className="truncate text-[11px] text-navy-500">{item.subtitle}</p>}
              </div>
              <span className="shrink-0 text-[10px] font-medium" style={{ color: style.accent }}>
                {new Date(item.date).toLocaleDateString('fr-FR')}
              </span>
            </div>
          )
          if (item.to) {
            return <div key={item.id} role="button" tabIndex={0} onClick={() => navigate(item.to!)} className="cursor-pointer">{content}</div>
          }
          if (item.href) {
            return <a key={item.id} href={item.href} target="_blank" rel="noreferrer">{content}</a>
          }
          return <div key={item.id}>{content}</div>
        })}
      </div>
    </div>
  )
}
