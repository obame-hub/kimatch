import { useEffect, useState } from 'react'
import { useTranchesAffichage } from '@/lib/useTranchesAffichage'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { MandatWizard } from '@/components/mandat/MandatWizard'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, FileCheck2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { useMandats } from '@/lib/data/mandats'
import { WizardConnectionGate } from '@/components/ui/connection-gate'
import { useComptes } from '@/lib/data/comptes'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_MANDATS, STATUT_MANDAT_TONE } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'

/**
 * Création d'un mandat depuis la liste : le compte n'est pas connu, on le demande, puis on passe la
 * main au wizard en quatre étapes.
 *
 * Le formulaire d'origine — un seul écran avec tous les champs — a été retiré. Garder deux chemins
 * de création aurait produit deux comportements : celui de la fiche compte enchaînant sur DocuSign,
 * celui-ci s'arrêtant au mandat. C'est exactement ainsi qu'un double champ de renégociation est
 * apparu début août.
 */
export function CreateMandatDialog({
  open,
  onClose,
  initialCompteId,
}: {
  open: boolean
  onClose: () => void
  initialCompteId?: string
  /** Conservés pour les appelants existants ; le wizard fait sa propre sélection de PDL. */
  initialCompteurIds?: string[]
  initialContactId?: string
}) {
  const { data: comptes } = useComptes()
  const [compteId, setCompteId] = useState(initialCompteId ?? '')
  const [recherche, setRecherche] = useState('')

  useEffect(() => {
    if (open && initialCompteId) setCompteId(initialCompteId)
    if (!open) {
      setCompteId('')
      setRecherche('')
    }
  }, [open, initialCompteId])

  // Le parc dépasse 2700 comptes : on filtre avant d'afficher, une liste déroulante brute serait
  // inutilisable.
  const q = recherche.trim().toLowerCase()
  const filtres = (comptes ?? [])
    .filter((c) => !q || c.nom.toLowerCase().includes(q))
    .slice(0, 50)

  return (
    <Dialog
      open={open}
      onClose={() => { setCompteId(''); onClose() }}
      title="Nouveau mandat"
      description={compteId ? undefined : 'Sur quel compte porte ce mandat ?'}
      className="max-w-2xl"
    >
      {open && !compteId && (
        <div className="flex flex-col gap-3">
          <FormField label="Rechercher un compte">
            <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom du compte…" autoFocus />
          </FormField>
          <div className="max-h-[320px] overflow-y-auto rounded-xl border border-navy-100">
            {filtres.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCompteId(c.id)}
                className="flex w-full items-center gap-2 border-b border-navy-50 px-3 py-2.5 text-left last:border-b-0 hover:bg-navy-50/60"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-navy-800">{c.nom}</span>
                {c.ville && <span className="shrink-0 text-[10.5px] text-navy-400">{c.ville}</span>}
              </button>
            ))}
            {filtres.length === 0 && <p className="p-4 text-center text-xs text-navy-400">Aucun compte trouvé.</p>}
          </div>
          {!q && (comptes?.length ?? 0) > 50 && (
            <p className="text-[10.5px] text-navy-400">
              50 comptes sur {comptes?.length} affichés — précisez la recherche.
            </p>
          )}
        </div>
      )}

      {open && compteId && (
        <WizardConnectionGate required={['crm', 'docusign']} feature="création de mandat">
          <MandatWizard compteId={compteId} onClose={() => { setCompteId(''); onClose() }} />
        </WizardConnectionGate>
      )}
    </Dialog>
  )
}


export default function Mandats() {
  const { data: mandats, isLoading } = useMandats()
  const { data: statutsRef } = useReferenceTable('statuts_mandats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_MANDATS
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const compteFromUrl = searchParams.get('compte')
  const pdlsFromUrl = searchParams.get('pdls')
  const contactFromUrl = searchParams.get('contact')
  const [showCreate, setShowCreate] = useState(!!compteFromUrl)
  const [statutFilter, setStatutFilter] = useState('')

  useEffect(() => {
    if (compteFromUrl) {
      setShowCreate(true)
      setSearchParams((prev) => { prev.delete('compte'); prev.delete('pdls'); prev.delete('contact'); return prev }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mandatsFiltresParStatut = statutFilter ? mandats?.filter((m) => m.statut === statutFilter) : mandats

  const { query, setQuery, sortKey, setSortKey, items: filteredMandats } = useListControls(mandatsFiltresParStatut, {
    searchFields: (m) => [m.compte_nom, m.id_salesforce],
    sorters: {
      compte_nom: (a, b) => a.compte_nom.localeCompare(b.compte_nom),
      date_signature: (a, b) => (a.date_signature ?? '').localeCompare(b.date_signature ?? ''),
      nb_sites_couverts: (a, b) => a.nb_sites_couverts - b.nb_sites_couverts,
    },
    defaultSort: 'compte_nom',
  })

  const tranche = useTranchesAffichage(filteredMandats, `${query}|${sortKey}`)

  return (
    <div>
      <Topbar title="Mandats" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Mandats"
          description="Le mandat autorise KiWee à intervenir sur un périmètre de sites — il ne se confond pas avec le périmètre étudié par une recommandation."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau mandat</Button>}
        />

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un compte…" count={filteredMandats?.length}>
          <Select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} className="w-auto">
            <option value="">Tous les statuts</option>
            {statuts.map((s) => <option key={s.id} value={s.code}>{s.libelle}</option>)}
          </Select>
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            <option value="compte_nom">Trier par compte</option>
            <option value="date_signature">Trier par date de signature</option>
            <option value="nb_sites_couverts">Trier par nb. de sites</option>
          </Select>
        </ListToolbar>

        {!isLoading && mandats?.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">
            Aucun mandat pour l'instant — le mandat signé par le client autorise KiWee à négocier sur un périmètre de sites précis. Utilise « Nouveau mandat » pour en créer un.
          </p>
        )}
        {!isLoading && mandats && mandats.length > 0 && filteredMandats?.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">Aucun mandat ne correspond à la recherche.</p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {tranche.visibles.map((m) => {
            const label = statuts.find((s) => s.code === m.statut)?.libelle ?? m.statut
            return (
              <Card
                key={m.id}
                onClick={() => navigate(`/mandats/${m.id}`)}
                className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                    <div>
                      {m.id_salesforce && <p className="font-mono text-[11px] text-navy-400">{m.id_salesforce}</p>}
                      <p className="font-display font-medium text-navy-800">
                        <EntityLink to={`/comptes/${m.compte_id}`}>{m.compte_nom}</EntityLink>
                      </p>
                    </div>
                  </div>
                  <Badge tone={STATUT_MANDAT_TONE[m.statut] ?? 'neutral'}>{label}</Badge>
                </div>
                <div className="mt-4 space-y-1 text-xs text-navy-500">
                  <p>Sites couverts : <span className="font-medium text-navy-700">{m.nb_sites_couverts}</span></p>
                  <p>Signé le : {m.date_signature ? new Date(m.date_signature).toLocaleDateString('fr-FR') : '—'}</p>
                </div>
              </Card>
            )
          })}
          <PiedDeListe
            affiches={tranche.visibles.length}
            total={tranche.total}
            reste={tranche.reste}
            onAfficherPlus={tranche.afficherPlus}
            tailleTrancheSuivante={tranche.tailleTrancheSuivante}
            libelle="mandats"
          />
        </div>
      </div>
      <CreateMandatDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        initialCompteId={compteFromUrl ?? undefined}
        initialCompteurIds={pdlsFromUrl ? pdlsFromUrl.split(',').filter(Boolean) : undefined}
        initialContactId={contactFromUrl ?? undefined}
      />
    </div>
  )
}
