import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, CheckSquare } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader, Indicateurs } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Select, Textarea } from '@/components/ui/form'
import { useSignaux, useCreateSignal } from '@/lib/data/signaux'
import { useSites } from '@/lib/data/sites'
import { useCreateAction } from '@/lib/data/actions'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_SIGNAUX, FALLBACK_TYPES_SIGNAUX, FALLBACK_STATUTS_ACTIONS } from '@/lib/referenceFallbacks'
import type { Signal } from '@/types/domain'
import { cn } from '@/lib/utils'
import { estIdReel } from '@/lib/referenceFallbacks'
import { prochaineActionSignal } from '@/lib/prochaineActionSignal'
import { ListToolbar, BasculeOption } from '@/components/ui/list-toolbar'
import { usePerimetreListe, BasculePerimetre } from '@/lib/perimetre'
import { useOuvrirCreation } from '@/lib/ouvrirCreation'

function SignalCard({ signal }: { signal: Signal }) {
  const navigate = useNavigate()
  const createAction = useCreateAction()
  const { data: statutsActionsRef } = useReferenceTable('statuts_actions')
  const statutsActions = statutsActionsRef && statutsActionsRef.length > 0 ? statutsActionsRef : FALLBACK_STATUTS_ACTIONS
  const [tacheCree, setTacheCree] = useState(false)

  /**
  * LA PROCHAINE ACTION DE SA MAQUETTE, ET ELLE FAIT VRAIMENT QUELQUE CHOSE.
  *
  * Son écran porte en pied de carte « Prochaine action » et un libellé — « Qualifier la variation »,
  * « Vérifier la date », « Créer une piste ». Sur une maquette c'est un texte ; ici le clic CRÉE la
  * tâche portant ce nom, rattachée au signal.
  *
  * C'est le seul choix qui donne son sens au libellé : afficher « Vérifier la date » sans permettre
  * de l'inscrire quelque part obligerait le commercial à la retenir de tête, et le mot « prochaine »
  * n'aurait servi qu'à décorer. La tâche apparaît alors dans « Ma journée », sous Signaux — la boucle
  * de sa page 1 se ferme.
  */
  const suivante = prochaineActionSignal(signal.type_signal_code, signal.statut)

  function creerTache() {
    const statutAFaire = statutsActions.find((s) => s.code === 'A_FAIRE')
    createAction.mutate({
      titre: suivante ? suivante.libelle : `Traiter le signal — ${signal.type_signal}`,
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

  /**
   * LA STRUCTURE DE SES CARTES, page 3 du PDF du 25/08/2026 : une étiquette de NATURE en tête, le
   * client, le MOTIF dans son cadre, et une action en pied.
   *
   * LE TYPE DE SIGNAL MONTE EN TÊTE et le site devient le titre — l'inverse de ce qui était affiché.
   * C'est la bonne hiérarchie : sur une colonne de dix cartes, ce qu'on cherche d'abord est de quoi
   * il s'agit, pas où. Le type est aussi ce qui décide de l'action à mener, donc il doit se lire en
   * premier.
   *
   * LE PIED GARDE SON ACTION. Ses maquettes portent une action par carte — « Qualifier la variation »,
   * « Associer au contact », « Compléter les données » — et le libellé exact dépend du type de signal,
   * une règle que lui seul peut donner. En attendant, la carte garde la seule action générique qui
   * existe déjà et qui ne suppose rien : créer la tâche de suivi.
   */
  return (
    <div className="overflow-hidden rounded-km-md border border-km-line bg-white transition-shadow hover:shadow-km-metric">
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/signaux/${signal.id}`)}
        onKeyDown={(e) => e.key === 'Enter' && navigate(`/signaux/${signal.id}`)}
        className="cursor-pointer px-3 pb-2.5 pt-3"
      >
        <span className="mb-1.5 inline-block max-w-full truncate rounded-[3px] bg-km-soft px-1.5 py-px text-km-label font-bold uppercase tracking-[0.06em] text-km-muted">
          {signal.type_signal}
        </span>
        <p className="truncate text-km-body font-bold text-km-text">{signal.site_nom}</p>
        {signal.description && (
          <p className="mt-1.5 line-clamp-2 rounded-[4px] bg-km-soft px-1.5 py-1 text-km-label leading-snug text-km-muted">
            {signal.description}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2 text-km-label text-km-faint">
          <span className="truncate">{signal.conseiller}</span>
          <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
            {/* ══ LE SCORE DE PRIORITÉ, SUR LA CARTE ══
                Barème de Michel du 01/09/2026 : échéance 50 · acceptation 25 · interactions 15 ·
                potentiel 10. Il décide de l'ordre de la colonne — l'afficher est ce qui rend cet
                ordre lisible. Sans lui, une liste triée par score ressemble à une liste triée au
                hasard.
                Le seuil de 60 marque la tranche haute : 29 contacts sur 596 dépassent 80, 143 sont
                entre 60 et 79. Au-delà de 60, le dossier mérite l'appel du jour. */}
            {signal.gravite != null && (
              <span
                title="Score de priorité sur 100 — échéance, taux d’acceptation, interactions, potentiel"
                className={cn(
                  'rounded-km-sm px-1.5 py-px font-bold',
                  signal.gravite >= 60 ? 'bg-km-green-soft text-km-green' : 'bg-km-soft text-km-muted',
                )}
              >
                {signal.gravite}
              </span>
            )}
            {new Date(signal.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
          </span>
        </div>
      </div>

      {suivante && (
        <div
          className="flex items-center gap-2 border-t border-km-line bg-km-soft px-2.5 py-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-km-label text-km-faint">Prochaine action</span>
          <button
            type="button"
            onClick={creerTache}
            disabled={tacheCree}
            className="ml-auto flex items-center gap-1 truncate rounded-km px-1 py-0.5 text-km-label font-bold text-km-green hover:bg-white disabled:opacity-60"
            title={tacheCree ? 'Tâche créée' : `Créer la tâche « ${suivante.libelle} »`}
          >
            {tacheCree ? (
              <>
                <CheckSquare className="h-3 w-3" />
                Tâche créée
              </>
            ) : (
              <>
                {suivante.libelle}
                <span aria-hidden>→</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
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
    // MÊME GARDE QUE SUR LES TÂCHES : `signaux.statut_id` et `signaux.type_signal_id` sont NOT NULL.
    if (!estIdReel(statutNouveau?.id)) {
      setFeedback('Les statuts de signal ne sont pas chargés : rechargez la page avant de créer le signal.')
      return
    }
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
          {/* OBLIGATOIRE : `signaux.type_signal_id` est NOT NULL sans valeur par défaut. */}
          <Select value={typeSignalId} onChange={(e) => setTypeSignalId(e.target.value)} required>
            <option value="">Sélectionner un type…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </Select>
        </FormField>
        <FormField label="Description">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Détails du signal…" />
        </FormField>
        {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
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
  // `?creer=1` ouvre ce formulaire depuis le menu « Créer » de la barre du haut.
  useOuvrirCreation(() => setShowCreate(true))
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

  /* UN SIGNAL NE PORTE AUCUN PROPRIETAIRE — verifie le 30/08/2026 : 0 sur 1 456, ni proprietaire
     ni responsable. Il suit donc le SITE sur lequel il est apparu, et le site suit son compte.
     C'est la bonne question de toute facon : « ce signal est-il sur un de mes sites ? ». */
  const { perimetre, setPerimetre, visibles: signauxDuPerimetre } = usePerimetreListe(
    'signaux', signaux, { siteId: (s) => s.site_id },
  )

  /**
   * LES QUATRE INDICATEURS DE L'ÉCRAN — son modele commun : « quatre mesures maximum, uniquement
   * si elles servent la decision ».
   *
   * Ils sont calculés sur TOUS les signaux, jamais sur ceux que la recherche laisse passer : un
   * indicateur qui bouge quand on tape dans le champ de recherche ne mesure plus rien. C'est le
   * tableau qui suit la recherche, pas le bandeau.
   *
   * « À DÉCIDER » EN PREMIER, ET C'EST CE QUE DIT LE LISERÉ VERT. Les trois autres racontent ce qui
   * s'est passé ; celui-là dit ce qui reste à faire, et c'est la question qu'on se pose en ouvrant
   * l'écran. Son dossier : « une page doit rendre immédiatement compréhensibles le statut, le
   * prochain geste et le blocage éventuel ».
   */
  const tous = signaux ?? []
  const mesures = [
    {
      libelle: 'À décider',
      valeur: String(tous.filter((x) => estVivant(x.statut)).length),
      precision: 'Ouvrir une opportunité, ou écarter',
    },
    {
      libelle: 'Convertis',
      valeur: String(tous.filter((x) => x.statut === 'CONVERTI').length),
      precision: 'Une opportunité a suivi',
    },
    {
      libelle: 'Écartés',
      valeur: String(tous.filter((x) => x.statut === 'ECARTE').length),
      precision: 'Avec un motif',
    },
    {
      libelle: 'Détectés',
      valeur: String(tous.length),
      precision: 'Tous créés automatiquement',
    },
  ]

  const q = query.trim().toLowerCase()
  const visibles = (signauxDuPerimetre ?? [])
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

        <Indicateurs mesures={mesures} />

        <div className="mb-3.5 flex flex-wrap items-center gap-3">
          <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un site, un type de signal…" count={visibles.length}>
            <BasculePerimetre
              valeur={perimetre}
              onChange={setPerimetre}
              libelleMien="Mes signaux"
              libelleTous="Tous les signaux"
            />
            {/* INCLURE LES DOSSIERS CLOS. Demandé par Naoëlle le 25/08/2026, après que j'aie signalé la
            conséquence de la règle de Michel : un dossier clos ne se trouvait plus par la recherche
            de cette page, et c'est le genre de chose qu'on découvre au mauvais moment.
            Décoché par défaut — sa règle reste la règle, la case est l'exception. */}
            <BasculeOption actif={avecClos} onChange={setAvecClos} libelle="Inclure les signaux clos" />
          </ListToolbar>
        </div>

        {isLoading ? (
          <p className="text-sm text-km-faint">Chargement…</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {columns.map((col) => {
              const items = visibles.filter((s) => s.statut === col.code)
              return (
                <div
                  key={col.id}
                  style={{ borderTopColor: col.couleur ?? undefined }}
                  className={cn('flex w-[236px] shrink-0 flex-col rounded-km-md border-t-[3px] bg-km-soft/70 p-2.5')}
                >
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.couleur ?? '#8698ba' }} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-km-muted">{col.libelle}</p>
                    <span className="ml-auto rounded-full bg-km-line/70 px-1.5 py-0.5 text-km-xs font-medium text-km-muted">
                      {items.length}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2.5">
                    {items.length === 0 && <p className="px-1 text-km-label text-km-faint">Vide</p>}
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
