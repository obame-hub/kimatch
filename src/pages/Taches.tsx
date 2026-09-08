import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, Check, Circle, Clock, Pencil } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { Select } from '@/components/ui/form'
import { echeanceLisible } from '@/lib/heureTache'
import { useActions, useCompleteAction } from '@/lib/data/actions'
import { useGestesTache } from '@/lib/data/gestesTache'
import { MenuReport } from '@/components/tache/MenuReport'
import { PanneauEditionTache } from '@/components/tache/PanneauEditionTache'
import { DialogNouvelleTache } from '@/components/tache/DialogNouvelleTache'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_ACTIONS, STATUT_ACTION_TONE } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'
import { usePerimetreListe, BasculePerimetre } from '@/lib/perimetre'
import { ActivityCard } from '@/components/ui/activity-card'
import { useOuvrirCreation } from '@/lib/ouvrirCreation'

export default function Taches() {
  const { data: actions, isLoading } = useActions()
  const { data: statutsRef } = useReferenceTable('statuts_actions')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_ACTIONS
  const completeAction = useCompleteAction()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  /**
   * LE REPORT ARRIVE SUR LA LISTE — William, 08/09/2026 : « que ce soit dans une liste, sur la page
   * vue d'ensemble ou dans un fil d'activité ». C'était le seul des trois écrans à ne rien proposer :
   * repousser une échéance depuis ici obligeait à ouvrir la fiche de la tâche.
   */
  const { reporter, reporterA } = useGestesTache()
  const [reportOuvert, setReportOuvert] = useState<string | null>(null)
  const [editionOuverte, setEditionOuverte] = useState<string | null>(null)
  // `?creer=1` ouvre ce formulaire depuis le menu « Créer » de la barre du haut.
  useOuvrirCreation(() => setShowCreate(true))

  /* Une tache appartient d'abord a QUI DOIT LA FAIRE : le responsable prime sur le proprietaire,
     et le site ne sert que de dernier recours pour les taches qui n'ont ni l'un ni l'autre. */
  const { perimetre, setPerimetre, visibles: actionsDuPerimetre } = usePerimetreListe(
    'taches', actions,
    { proprietaireId: (a) => a.responsable_id ?? a.proprietaire_id, siteId: (a) => a.site_id },
  )

  const { query, setQuery, sortKey, setSortKey, items: filteredActions } = useListControls(actionsDuPerimetre, {
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
            <BasculePerimetre
              valeur={perimetre}
              onChange={setPerimetre}
              libelleMien="Mes tâches"
              libelleTous="Toutes les tâches"
            />
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            <option value="echeance">Trier par échéance</option>
            <option value="titre">Trier par titre</option>
            <option value="priorite">Trier par priorité</option>
          </Select>
        </ListToolbar>

        {isLoading && <p className="text-sm text-km-faint">Chargement…</p>}

        <div className="space-y-2.5">
          {ouvertes.map((a) => (
            <div key={a.id}>
            <ActivityCard
              styleKey="action"
              leading={
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); completeAction.mutate(a.id) }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-km-line text-km-faint transition-colors hover:border-km-green hover:text-km-green"
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
                  {a.echeance && <span className="text-km-faint">{echeanceLisible(a.echeance)}</span>}
                  {/* La carte entière navigue : sans ces deux arrêts, ouvrir le report ouvrirait
                      aussi la fiche de la tâche, et le panneau se refermerait aussitôt. */}
                  {/* Les mêmes gestes que dans le volet d'activité, dans le même ordre — la
                      suppression reste sur la fiche, elle n'a pas sa place dans une liste qu'on
                      parcourt vite. */}
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setEditionOuverte((v) => (v === a.id ? null : a.id))
                        setReportOuvert(null)
                      }}
                      aria-expanded={editionOuverte === a.id}
                      title="Modifier"
                      className="inline-flex items-center gap-1 rounded-km-sm px-1.5 py-0.5 text-km-tiny font-semibold text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
                    >
                      <Pencil className="h-3 w-3" />
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setReportOuvert((v) => (v === a.id ? null : a.id))
                        setEditionOuverte(null)
                      }}
                      aria-expanded={reportOuvert === a.id}
                      title="Reporter"
                      className="inline-flex items-center gap-1 rounded-km-sm px-1.5 py-0.5 text-km-tiny font-semibold text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
                    >
                      <Clock className="h-3 w-3" />
                      Reporter
                    </button>
                  </span>
                </span>
              }
              body={a.commentaire || undefined}
              to={`/taches/${a.id}`}
              onClick={() => navigate(`/taches/${a.id}`)}
            />
            {/* Le panneau se déplie SOUS la carte, hors de son `<a>` : un formulaire à l'intérieur
                d'un lien se soumet au premier clic sur un champ de date. */}
            {editionOuverte === a.id && (
              <PanneauEditionTache
                className="mx-2.5 mt-0"
                action={{ id: a.id, titre: a.titre, echeance: a.echeance || null, commentaire: a.commentaire }}
                onFini={() => setEditionOuverte(null)}
              />
            )}
            {reportOuvert === a.id && (
              <MenuReport
                className="mx-2.5 mt-0"
                echeance={a.echeance || null}
                onReporterPreset={(r) => {
                  reporter(a.id, a.echeance || null, r)
                  setReportOuvert(null)
                }}
                onReporterDate={(instant) => {
                  reporterA(a.id, instant)
                  setReportOuvert(null)
                }}
              />
            )}
            </div>
          ))}
          {!isLoading && ouvertes.length === 0 && (
            <p className="py-8 text-center text-sm text-km-faint">Aucune tâche ouverte — tout est à jour ✓</p>
          )}
        </div>

        {terminees.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-km-faint">Terminées récemment</p>
            <div className="space-y-1.5">
              {terminees.slice(0, 10).map((a) => (
                <div
                  key={a.id}
                  onClick={() => navigate(`/taches/${a.id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-km-faint hover:bg-km-bg/60"
                >
                  <Check className="h-3.5 w-3.5 text-km-green" />
                  <span className="flex-1 line-through">
                    <Link to={`/taches/${a.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                      {a.titre}
                    </Link>
                  </span>
                  {a.site_id && <EntityLink to={`/sites/${a.site_id}`}>{a.cible_label}</EntityLink>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Le formulaire a déménagé dans `components/tache` : les fiches recommandation,
          opportunité et piste ouvrent le MÊME (Michel, 31/08/2026). Sans rattachement, il garde
          ses sélecteurs de site et de contact — c'est la création libre. */}
      {showCreate && <DialogNouvelleTache open={showCreate} onClose={() => setShowCreate(false)} />}
    </div>
  )
}
