import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, CheckSquare, Check } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Select, Textarea } from '@/components/ui/form'
import { useSignaux, useCreateSignal } from '@/lib/data/signaux'
import { useSites } from '@/lib/data/sites'
import { useCreateAction } from '@/lib/data/actions'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_SIGNAUX, FALLBACK_TYPES_SIGNAUX, FALLBACK_STATUTS_ACTIONS } from '@/lib/referenceFallbacks'
import { EntityLink } from '@/components/ui/entity-link'
import type { Signal } from '@/types/domain'
import { cn } from '@/lib/utils'
import { ListToolbar } from '@/components/ui/list-toolbar'

function SignalCard({ signal }: { signal: Signal }) {
  const navigate = useNavigate()
  const createAction = useCreateAction()
  const { data: statutsActionsRef } = useReferenceTable('statuts_actions')
  const statutsActions = statutsActionsRef && statutsActionsRef.length > 0 ? statutsActionsRef : FALLBACK_STATUTS_ACTIONS
  const [tacheCree, setTacheCree] = useState(false)

  function creerTache() {
    const statutAFaire = statutsActions.find((s) => s.code === 'A_FAIRE')
    createAction.mutate({
      titre: `Traiter le signal — ${signal.type_signal}`,
      type_action_id: null,
      type_action_libelle: 'Suivi de signal',
      site_id: signal.site_id,
      site_nom: signal.site_nom,
      contact_id: null,
      contact_nom: '',
      priorite: 40,
      echeance: null,
      commentaire: signal.description || null,
      statut_id: statutAFaire?.id ?? null,
    })
    setTacheCree(true)
  }

  return (
    <Card className="animate-fade-up p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/signaux/${signal.id}`)}
        onKeyDown={(e) => e.key === 'Enter' && navigate(`/signaux/${signal.id}`)}
        className="cursor-pointer"
      >
        <p className="text-sm font-medium text-navy-800"><EntityLink to={`/sites/${signal.site_id}`}>{signal.site_nom}</EntityLink></p>
        <p className="mt-1 text-xs text-navy-500">{signal.type_signal}</p>
        <p className="mt-2 line-clamp-2 text-xs text-navy-400">{signal.description}</p>
        <div className="mt-3 flex items-center justify-between text-[11px] text-navy-400">
          <span>{signal.conseiller}</span>
          <span>{new Date(signal.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-navy-100 pt-2.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={creerTache}
          disabled={tacheCree}
          className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium text-navy-500 hover:bg-navy-100 disabled:opacity-50"
          title="Créer une tâche de suivi"
        >
          <CheckSquare className="h-3 w-3" />
          {tacheCree ? 'Tâche créée' : 'Créer une tâche'}
        </button>
      </div>
    </Card>
  )
}

function CreateSignalDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: sites } = useSites()
  const { data: typesRef } = useReferenceTable('types_signaux')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_SIGNAUX
  const { data: statutsRef } = useReferenceTable('statuts_signaux')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_SIGNAUX
  const createSignal = useCreateSignal()

  const [siteId, setSiteId] = useState('')
  const [typeSignalId, setTypeSignalId] = useState('')
  const [description, setDescription] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setSiteId('')
    setTypeSignalId('')
    setDescription('')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const site = sites?.find((s) => s.id === siteId)
    const type = types.find((t) => t.id === typeSignalId)
    const statutNouveau = statuts.find((s) => s.code === 'NOUVEAU')
    if (!site) return

    const result = await createSignal.mutateAsync({
      site_id: site.id,
      site_nom: site.nom,
      type_signal_id: typeSignalId || null,
      type_signal_libelle: type?.libelle ?? '',
      statut_id: statutNouveau?.id ?? null,
      description,
    })
    setFeedback(result.persisted ? 'Signal créé.' : 'Signal ajouté localement (non synchronisé avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouveau signal" description="Signaler un événement à surveiller sur un site.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Site">
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
            <option value="">Sélectionner un site…</option>
            {sites?.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </Select>
        </FormField>
        <FormField label="Type de signal">
          <Select value={typeSignalId} onChange={(e) => setTypeSignalId(e.target.value)}>
            <option value="">Sélectionner un type…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </Select>
        </FormField>
        <FormField label="Description">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Détails du signal…" />
        </FormField>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createSignal.isPending}>Créer le signal</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Signaux() {
  const { data: signaux, isLoading } = useSignaux()
  const { data: statutsRef } = useReferenceTable('statuts_signaux')
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')
  const [avecClos, setAvecClos] = useState(false)

  /**
   * SEULS LES SIGNAUX ACTIFS. Michel, 25/08/2026 à 14 h 29 : « pareil pour [...] les signaux ».
   * « Converti » et « Écarté » sont les deux fins de sa diapositive 13 — 542 et 84 signaux, contre
   * 831 encore à qualifier. Un signal converti se relit depuis l'opportunité qu'il a produite.
   *
   * L'ORDRE DE CES LIGNES COMPTE. `columns` lit `avecClos` : déclaré après, il vaut une page blanche
   * — « Cannot access before initialization ». Le typecheck ne l'a PAS vu, parce que la référence
   * vit dans la fonction passée à `.filter` et que TypeScript suppose qu'elle s'exécutera plus tard.
   * Le build non plus. C'est le navigateur qui l'a dit, et il faut donc y aller voir.
   */
  const tousLesStatuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_SIGNAUX
  const estVivant = (code: string) => code !== 'CONVERTI' && code !== 'ECARTE'
  const columns = tousLesStatuts.filter((c) => avecClos || estVivant(c.code))

  const q = query.trim().toLowerCase()
  const visibles = (signaux ?? [])
    // Le compteur du bandeau doit dire ce que le tableau montre : sans ce filtre il annoncerait
    // 1 457 signaux au-dessus de colonnes qui n'en affichent que 831.
    .filter((s) => avecClos || estVivant(s.statut))
    .filter((s) =>
      !q || [s.site_nom, s.type_signal, s.description, s.conseiller].some((f) => (f ?? '').toLowerCase().includes(q)),
    )

  return (
    <div>
      <Topbar title="Signaux" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Signaux"
          description="Un signal attire l'attention — il ne déclenche jamais automatiquement une recommandation. Il suit un cycle : détection, contact, intérêt confirmé, puis mandat."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau signal</Button>}
        />

        <div className="mb-3.5 flex flex-wrap items-center gap-3">
          <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un site, un type de signal…" count={visibles.length} />
        {/* INCLURE LES DOSSIERS CLOS. Demandé par Naoëlle le 25/08/2026, après que j'aie signalé la
            conséquence de la règle de Michel : un dossier clos ne se trouvait plus par la recherche
            de cette page, et c'est le genre de chose qu'on découvre au mauvais moment.
            Décoché par défaut — sa règle reste la règle, la case est l'exception. */}
        <button
          type="button"
          onClick={() => setAvecClos((v) => !v)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-kw-md border px-2.5 py-1.5 text-kw-sm font-bold transition-colors',
            avecClos
              ? 'border-ink-800 bg-ink-800 text-white'
              : 'border-kw-border-strong bg-white text-kw-meta hover:bg-kw-subtle',
          )}
        >
          <span className={cn(
            'flex h-3.5 w-3.5 items-center justify-center rounded-[3px]',
            avecClos ? 'bg-white/25' : 'border border-kw-border-strong',
          )}>
            {avecClos && <Check className="h-2.5 w-2.5" />}
          </span>
          Inclure les dossiers clos
        </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-navy-400">Chargement…</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {columns.map((col) => {
              const items = visibles.filter((s) => s.statut === col.code)
              return (
                <div
                  key={col.id}
                  style={{ borderTopColor: col.couleur ?? undefined }}
                  className={cn('flex w-[240px] shrink-0 flex-col rounded-xl border-t-4 bg-navy-50/60 p-3')}
                >
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.couleur ?? '#8698ba' }} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">{col.libelle}</p>
                    <span className="ml-auto rounded-full bg-navy-200/70 px-1.5 py-0.5 text-[10px] font-medium text-navy-600">
                      {items.length}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2.5">
                    {items.length === 0 && <p className="px-1 text-[11px] text-navy-400">Vide</p>}
                    {items.map((signal) => (
                      <SignalCard key={signal.id} signal={signal} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {showCreate && <CreateSignalDialog open={showCreate} onClose={() => setShowCreate(false)} />}
    </div>
  )
}
