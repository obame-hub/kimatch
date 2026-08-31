import { useEffect, useState } from 'react'
import { useListeServeur } from '@/lib/useListeServeur'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { MandatWizard } from '@/components/mandat/MandatWizard'
import { useSearchParams } from 'react-router-dom'
import { Plus, FileCheck2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { WizardConnectionGate } from '@/components/ui/connection-gate'
import { useComptes } from '@/lib/data/comptes'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_MANDATS, STATUT_MANDAT_TONE } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { usePerimetre, BasculePerimetre } from '@/lib/perimetre'
import { useMonProfil } from '@/lib/data/roles'
import { useOuvrirCreation } from '@/lib/ouvrirCreation'

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
          <div className="max-h-[320px] overflow-y-auto rounded-xl border border-km-line">
            {filtres.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCompteId(c.id)}
                className="flex w-full items-center gap-2 border-b border-navy-50 px-3 py-2.5 text-left last:border-b-0 hover:bg-km-bg/60"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-km-text">{c.nom}</span>
                {c.ville && <span className="shrink-0 text-[10.5px] text-km-faint">{c.ville}</span>}
              </button>
            ))}
            {filtres.length === 0 && <p className="p-4 text-center text-xs text-km-faint">Aucun compte trouvé.</p>}
          </div>
          {!q && (comptes?.length ?? 0) > 50 && (
            <p className="text-[10.5px] text-km-faint">
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


/** Une carte de la liste, telle que `v_mandats_liste` la renvoie. */
interface LigneMandat {
  id: string
  compte_id: string
  compte_nom: string | null
  id_salesforce: string | null
  statut: string
  date_signature: string | null
  nb_sites_couverts: number
}

/**
 * ENCAPSULABLE DANS LA PAGE PATRIMOINE. `sansEntete` masque la barre du haut quand cette liste est
 * affichée comme onglet de /patrimoine (diapositive 8 de Michel : « la page Patrimoine rassemble ces
 * objets et permet de naviguer du compte jusqu'au compteur et au contrat »). L'en-tête de page, lui,
 * reste : il porte le bouton de création et la phrase qui dit ce qu'est l'objet.
 */
export default function Mandats({ sansEntete }: { sansEntete?: boolean }) {
  const { data: statutsRef } = useReferenceTable('statuts_mandats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_MANDATS
  const [searchParams, setSearchParams] = useSearchParams()
  const compteFromUrl = searchParams.get('compte')
  const pdlsFromUrl = searchParams.get('pdls')
  const contactFromUrl = searchParams.get('contact')
  const [showCreate, setShowCreate] = useState(!!compteFromUrl)
  // `?creer=1` ouvre ce formulaire depuis le menu « Créer » de la barre du haut.
  useOuvrirCreation(() => setShowCreate(true))
  const [statutFilter, setStatutFilter] = useState('')

  useEffect(() => {
    if (compteFromUrl) {
      setShowCreate(true)
      setSearchParams((prev) => { prev.delete('compte'); prev.delete('pdls'); prev.delete('contact'); return prev }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**

   * « LES MIENS » PAR DEFAUT, « TOUS » D'UN CLIC. Ce n'est pas une restriction : la base

   * laisse tout passer, et c'est la decision du 14/08 qu'on ne defait pas. Seul l'affichage

   * par defaut change, parce qu'on travaille d'abord son propre portefeuille — et il se

   * defait d'un clic quand on reprend celui d'un collegue absent.

   *

   * Le filtre part en base : le total du pied de liste suit, sans quoi il annoncerait un

   * nombre que la liste ne montre pas.

   */

  const { data: monProfil } = useMonProfil()

  const { perimetre, setPerimetre } = usePerimetre('mandats')

  const filtreProprietaire = perimetre === 'moi' && monProfil?.id ? monProfil.id : null


  const liste = useListeServeur<LigneMandat>({
    vue: 'v_mandats_liste',
    colonnesRecherche: ['compte_nom', 'id_salesforce', 'reference'],
    triParDefaut: 'compte_nom',
    filtres: { proprietaire_id: filtreProprietaire, statut: statutFilter || null },
  })

  return (
    <div>
      {!sansEntete && <Topbar title="Mandats" />}
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Mandats"
          description="Le mandat autorise KiWee à intervenir sur un périmètre de sites — il ne se confond pas avec le périmètre étudié par une recommandation."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau mandat</Button>}
        />

        <ListToolbar query={liste.query} onQueryChange={liste.setQuery} placeholder="Rechercher un compte…" count={liste.total}>
          <BasculePerimetre valeur={perimetre} onChange={setPerimetre} libelleMien="Mes mandats" libelleTous="Tous les mandats" />
          <Select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} className="w-auto">
            <option value="">Tous les statuts</option>
            {statuts.map((s) => <option key={s.id} value={s.code}>{s.libelle}</option>)}
          </Select>
          <Select value={liste.tri} onChange={(e) => liste.trierPar(e.target.value)} className="w-auto">
            <option value="compte_nom">Trier par compte</option>
            <option value="date_signature">Trier par date de signature</option>
            <option value="nb_sites_couverts">Trier par nb. de sites</option>
          </Select>
        </ListToolbar>

        {liste.erreur && <p className="mb-4 text-sm text-km-red">{liste.erreur}</p>}
        {!liste.isLoading && !liste.erreur && liste.lignes.length === 0 && (
          <p className="mb-4 text-sm text-km-faint">
            {liste.query.trim() || statutFilter
              ? 'Aucun mandat ne correspond à la recherche.'
              : "Aucun mandat pour l'instant — le mandat signé par le client autorise KiWee à négocier sur un périmètre de sites précis. Utilise « Nouveau mandat » pour en créer un."}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {liste.isLoading && <p className="text-sm text-km-faint">Chargement…</p>}
          {liste.lignes.map((m) => {
            const label = statuts.find((s) => s.code === m.statut)?.libelle ?? m.statut
            return (
              <Card
                key={m.id}
                to={`/mandats/${m.id}`}
                className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-km-amber-soft text-amber-600">
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                    <div>
                      {m.id_salesforce && <p className="font-mono text-[11px] text-km-faint">{m.id_salesforce}</p>}
                      <p className="font-display font-medium text-km-text">
                        <EntityLink to={`/comptes/${m.compte_id}`}>{m.compte_nom}</EntityLink>
                      </p>
                    </div>
                  </div>
                  <Badge tone={STATUT_MANDAT_TONE[m.statut] ?? 'neutral'}>{label}</Badge>
                </div>
                <div className="mt-4 space-y-1 text-xs text-km-muted">
                  <p>Sites couverts : <span className="font-medium text-km-text">{m.nb_sites_couverts}</span></p>
                  <p>Signé le : {m.date_signature ? new Date(m.date_signature).toLocaleDateString('fr-FR') : '—'}</p>
                </div>
              </Card>
            )
          })}
          <PiedDeListe
            affiches={liste.lignes.length}
            total={liste.total}
            reste={liste.reste}
            onAfficherPlus={liste.afficherPlus}
            tailleTrancheSuivante={liste.tailleTrancheSuivante}
            libelle="mandats"
          />
        </div>
      </div>
      {showCreate && (
        <CreateMandatDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          initialCompteId={compteFromUrl ?? undefined}
          initialCompteurIds={pdlsFromUrl ? pdlsFromUrl.split(',').filter(Boolean) : undefined}
          initialContactId={contactFromUrl ?? undefined}
        />
      )}
    </div>
  )
}
