import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Mail, Users, Radio, CheckSquare, FileText, Send } from 'lucide-react'
import { Textarea } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { ActivityCard, type ActivityStyleKey } from '@/components/ui/activity-card'
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
        {items.map((item) => (
          <ActivityCard
            key={item.id}
            styleKey={styleKeyFor(item)}
            icon={item.kind === 'interaction' ? interactionIcon(item.title) : KIND_ICON[item.kind]}
            title={item.title}
            subtitle={item.subtitle}
            trailing={new Date(item.date).toLocaleDateString('fr-FR')}
            onClick={item.to ? () => navigate(item.to!) : undefined}
            href={item.href}
          />
        ))}
      </div>
    </div>
  )
}
