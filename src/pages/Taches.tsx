import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Check, Circle } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { useActions, useCreateAction, useCompleteAction } from '@/lib/data/actions'
import { useSites } from '@/lib/data/sites'
import { useContacts } from '@/lib/data/contacts'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_ACTIONS, FALLBACK_STATUTS_ACTIONS, STATUT_ACTION_TONE } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'
import { ActivityCard } from '@/components/ui/activity-card'

function CreateActionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: sites } = useSites()
  const { data: contacts } = useContacts()
  const { data: typesRef } = useReferenceTable('types_actions')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_ACTIONS
  const { data: statutsRef } = useReferenceTable('statuts_actions')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_ACTIONS
  const createAction = useCreateAction()

  const [titre, setTitre] = useState('')
  const [typeId, setTypeId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [contactId, setContactId] = useState('')
  const [echeance, setEcheance] = useState('')
  const [priorite, setPriorite] = useState(50)
  const [commentaire, setCommentaire] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setTitre('')
    setTypeId('')
    setSiteId('')
    setContactId('')
    setEcheance('')
    setPriorite(50)
    setCommentaire('')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const type = types.find((t) => t.id === typeId)
    const site = sites?.find((s) => s.id === siteId)
    const contact = contacts?.find((c) => c.id === contactId)
    const statutAFaire = statuts.find((s) => s.code === 'A_FAIRE')

    const result = await createAction.mutateAsync({
      titre,
      type_action_id: typeId || null,
      type_action_libelle: type?.libelle ?? '',
      site_id: siteId || null,
      site_nom: site?.nom ?? '',
      contact_id: contactId || null,
      contact_nom: contact ? `${contact.prenom} ${contact.nom}` : '',
      priorite,
      echeance: echeance || null,
      commentaire: commentaire || null,
      statut_id: statutAFaire?.id ?? null,
    })
    setFeedback(result.persisted ? 'Tâche créée.' : 'Tâche ajoutée localement (non synchronisée avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouvelle tâche" description="Ajouter une tâche à faire.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Titre">
          <Input value={titre} onChange={(e) => setTitre(e.target.value)} required placeholder="Ex. Relancer le client" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Type">
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Sélectionner…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
            </Select>
          </FormField>
          <FormField label="Échéance">
            <Input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Site (optionnel)">
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">—</option>
              {sites?.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </Select>
          </FormField>
          <FormField label="Contact (optionnel)">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">—</option>
              {contacts?.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField label="Commentaire">
          <Textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
        </FormField>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createAction.isPending}>Créer la tâche</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Taches() {
  const { data: actions, isLoading } = useActions()
  const { data: statutsRef } = useReferenceTable('statuts_actions')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_ACTIONS
  const completeAction = useCompleteAction()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  const { query, setQuery, sortKey, setSortKey, items: filteredActions } = useListControls(actions, {
    searchFields: (a) => [a.titre, a.cible_label, a.contact_nom, a.responsable, a.type_action],
    sorters: {
      echeance: (a, b) => (a.echeance ?? '').localeCompare(b.echeance ?? ''),
      titre: (a, b) => a.titre.localeCompare(b.titre),
      priorite: (a, b) => b.priorite - a.priorite,
    },
    defaultSort: 'echeance',
  })

  const ouvertes = (filteredActions ?? []).filter((a) => a.statut !== 'TERMINEE' && a.statut !== 'ANNULEE')
  const terminees = (filteredActions ?? []).filter((a) => a.statut === 'TERMINEE' || a.statut === 'ANNULEE')

  return (
    <div>
      <Topbar title="Tâches" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Tâches"
          description="Les actions à faire pour vos comptes et sites — relances, préparations de mandat, présentations."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouvelle tâche</Button>}
        />

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher une tâche, un site, un contact…" count={filteredActions?.length}>
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            <option value="echeance">Trier par échéance</option>
            <option value="titre">Trier par titre</option>
            <option value="priorite">Trier par priorité</option>
          </Select>
        </ListToolbar>

        {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}

        <div className="space-y-2.5">
          {ouvertes.map((a) => (
            <ActivityCard
              key={a.id}
              styleKey="action"
              leading={
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); completeAction.mutate(a.id) }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-navy-300 text-navy-400 transition-colors hover:border-kiwi-500 hover:text-kiwi-600"
                  title="Marquer terminée"
                >
                  <Circle className="h-3.5 w-3.5" />
                </button>
              }
              title={a.titre}
              subtitle={
                <>
                  {a.type_action}
                  {a.site_id && (
                    <>
                      {' · '}
                      <EntityLink to={`/sites/${a.site_id}`}>{a.cible_label}</EntityLink>
                    </>
                  )}
                  {a.contact_id && (
                    <>
                      {' · '}
                      <EntityLink to={`/contacts/${a.contact_id}`}>{a.contact_nom}</EntityLink>
                    </>
                  )}
                  {a.responsable && ` · ${a.responsable}`}
                </>
              }
              trailing={
                <span className="flex flex-col items-end gap-1">
                  <Badge tone={STATUT_ACTION_TONE[a.statut] ?? 'neutral'}>{statuts.find((s) => s.code === a.statut)?.libelle ?? a.statut}</Badge>
                  {a.echeance && <span className="text-navy-400">{new Date(a.echeance).toLocaleDateString('fr-FR')}</span>}
                </span>
              }
              onClick={() => navigate(`/taches/${a.id}`)}
            />
          ))}
          {!isLoading && ouvertes.length === 0 && (
            <p className="py-8 text-center text-sm text-navy-400">Aucune tâche ouverte — tout est à jour ✓</p>
          )}
        </div>

        {terminees.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">Terminées récemment</p>
            <div className="space-y-1.5">
              {terminees.slice(0, 10).map((a) => (
                <div
                  key={a.id}
                  onClick={() => navigate(`/taches/${a.id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-navy-400 hover:bg-navy-50/60"
                >
                  <Check className="h-3.5 w-3.5 text-kiwi-600" />
                  <span className="flex-1 line-through">{a.titre}</span>
                  {a.site_id && <EntityLink to={`/sites/${a.site_id}`}>{a.cible_label}</EntityLink>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <CreateActionDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
