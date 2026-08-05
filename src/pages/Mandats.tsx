import { useEffect, useState } from 'react'
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
import { useMandats, useCreateMandat } from '@/lib/data/mandats'
import { useComptes } from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'
import { useCompteurs } from '@/lib/data/compteurs'
import { useContacts } from '@/lib/data/contacts'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_MANDATS, STATUT_MANDAT_TONE, FALLBACK_TYPES_COURTIERS_MANDAT } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'
import { ExtractDocumentButton } from '@/components/ui/document-extraction'

function CreateMandatDialog({
  open,
  onClose,
  initialCompteId,
  initialCompteurIds,
  initialContactId,
}: {
  open: boolean
  onClose: () => void
  initialCompteId?: string
  initialCompteurIds?: string[]
  initialContactId?: string
}) {
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: compteurs } = useCompteurs()
  const { data: contacts } = useContacts()
  const { data: courtiersRef } = useReferenceTable('types_courtiers_mandat')
  const courtiers = courtiersRef && courtiersRef.length > 0 ? courtiersRef : FALLBACK_TYPES_COURTIERS_MANDAT
  const createMandat = useCreateMandat()

  const [compteId, setCompteId] = useState(initialCompteId ?? '')
  const [dateSignature, setDateSignature] = useState('')
  const [dureeMois, setDureeMois] = useState(36)
  const [compteurIds, setCompteurIds] = useState<string[]>(initialCompteurIds ?? [])
  const [contactSignataireId, setContactSignataireId] = useState(initialContactId ?? '')
  const [courtierCodes, setCourtierCodes] = useState<string[]>(['KIWI', 'ENERGIX'])
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (initialCompteId) setCompteId(initialCompteId)
    if (initialCompteurIds) setCompteurIds(initialCompteurIds)
    if (initialContactId) setContactSignataireId(initialContactId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCompteId, initialCompteurIds?.join(','), initialContactId])

  const sitesDuCompte = sites?.filter((s) => s.compte_id === compteId) ?? []
  const compteursDuCompte = compteurs?.filter((c) => sitesDuCompte.some((s) => s.id === c.site_id)) ?? []
  const contactsDuCompte = contacts?.filter((c) => c.compte_id === compteId) ?? []

  function reset() {
    setCompteId('')
    setDateSignature('')
    setDureeMois(36)
    setCompteurIds([])
    setContactSignataireId('')
    setCourtierCodes(['KIWI', 'ENERGIX'])
    setFeedback(null)
  }

  function toggleCompteur(id: string) {
    setCompteurIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  // "Mandat Kiwi" est toujours inclus, impossible de l'omettre -- même règle que Tools (codé en
  // dur à true côté PDF Kiwi). Seul Energix est un vrai choix.
  function toggleCourtier(code: string) {
    if (code === 'KIWI') return
    setCourtierCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  function handleExtracted(fields: Record<string, { value: string | number | null; confidence: number }>) {
    const signature = fields.date_signature?.value
    if (typeof signature === 'string' && signature) setDateSignature(signature)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const compte = comptes?.find((c) => c.id === compteId)
    if (!compte) return
    const contactSignataire = contactsDuCompte.find((c) => c.id === contactSignataireId)
    const compteursChoisis = compteursDuCompte.filter((c) => compteurIds.includes(c.id)).map((c) => ({ id: c.id, site_id: c.site_id }))

    const result = await createMandat.mutateAsync({
      compte_id: compte.id,
      compte_nom: compte.nom,
      compteur_ids: compteurIds,
      compteurs: compteursChoisis,
      date_signature: dateSignature || null,
      duree_mois: dureeMois,
      contact_signataire_id: contactSignataireId || null,
      contact_signataire_nom: contactSignataire ? `${contactSignataire.prenom} ${contactSignataire.nom}` : undefined,
      courtier_codes: courtierCodes,
      courtier_type_ids: courtiers.filter((c) => courtierCodes.includes(c.code)).map((c) => c.id),
    })
    setFeedback(result.persisted ? 'Mandat créé.' : 'Mandat ajouté localement (non synchronisé avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouveau mandat" description="Le mandat autorise KiWee à intervenir sur un périmètre de sites d'un compte.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <ExtractDocumentButton onExtracted={handleExtracted} />
        <FormField label="Compte">
          <Select value={compteId} onChange={(e) => { setCompteId(e.target.value); setCompteurIds([]) }} required>
            <option value="">Sélectionner un compte…</option>
            {comptes?.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Date de signature">
            <Input type="date" value={dateSignature} onChange={(e) => setDateSignature(e.target.value)} />
          </FormField>
          <FormField label="Durée">
            <Select value={dureeMois} onChange={(e) => setDureeMois(Number(e.target.value))}>
              {[12, 24, 36, 48].map((d) => <option key={d} value={d}>{d} mois</option>)}
            </Select>
          </FormField>
        </div>
        <FormField label="Courtiers couverts">
          <div className="flex gap-4">
            {courtiers.map((c) => (
              <label key={c.id} className={`flex items-center gap-2 text-sm ${c.code === 'KIWI' ? 'text-navy-400' : 'text-navy-700'}`}>
                <input type="checkbox" checked={courtierCodes.includes(c.code)} disabled={c.code === 'KIWI'} onChange={() => toggleCourtier(c.code)} />
                {c.libelle}{c.code === 'KIWI' && ' (toujours inclus)'}
              </label>
            ))}
          </div>
        </FormField>
        {compteId && contactsDuCompte.length > 0 && (
          <FormField label="Contact signataire (optionnel)">
            <Select value={contactSignataireId} onChange={(e) => setContactSignataireId(e.target.value)}>
              <option value="">Sélectionner…</option>
              {contactsDuCompte.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </Select>
          </FormField>
        )}
        {compteId && (
          <FormField label="Compteurs couverts">
            {sitesDuCompte.length === 0 ? (
              <p className="text-xs text-navy-400">Ce compte n'a aucun site.</p>
            ) : compteursDuCompte.length === 0 ? (
              <p className="text-xs text-navy-400">Aucun compteur pour ce compte.</p>
            ) : (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-navy-200 p-2">
                {sitesDuCompte.map((s) => {
                  const compteursDuSite = compteursDuCompte.filter((c) => c.site_id === s.id)
                  if (compteursDuSite.length === 0) return null
                  return (
                    <div key={s.id}>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-navy-400">{s.nom}</p>
                      {compteursDuSite.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 pl-1 text-sm text-navy-700">
                          <input type="checkbox" checked={compteurIds.includes(c.id)} onChange={() => toggleCompteur(c.id)} />
                          {c.utilisation || c.numero_pdl}
                        </label>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </FormField>
        )}
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createMandat.isPending}>Créer le mandat</Button>
        </div>
      </form>
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
          {filteredMandats?.map((m) => {
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
