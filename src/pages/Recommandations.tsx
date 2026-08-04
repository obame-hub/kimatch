import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Sparkle, AlertTriangle } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { EtapeCompact } from '@/components/ui/etape-stepper'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { useRecommandations, useCreateRecommandation, compteursDejaEngages } from '@/lib/data/recommandations'
import { useMandats } from '@/lib/data/mandats'
import { useCompteurs } from '@/lib/data/compteurs'
import { useContacts } from '@/lib/data/contacts'
import { useContrats } from '@/lib/data/contrats'
import { useComptes, useUpdateCompteScore } from '@/lib/data/comptes'
import { useEllisphereScore } from '@/lib/data/ellisphere'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_ETAPES_RECOMMANDATION, ETAPE_TONE, FALLBACK_TYPES_ORIGINES, FALLBACK_TYPES_ENERGIES } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'

const PRIORITE_OPTIONS = [
  { value: 1, label: 'Haute' },
  { value: 2, label: 'Normale' },
  { value: 3, label: 'Basse' },
]

const STATUTS_CONTRAT_CLIENT = new Set(['ACTIF', 'A_RENOUVELER'])

function CreateRecommandationDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (recoId: string) => void }) {
  const { data: mandats } = useMandats()
  const { data: compteurs } = useCompteurs()
  const { data: contacts } = useContacts()
  const { data: contrats } = useContrats()
  const { data: recommandations } = useRecommandations()
  const { data: comptes } = useComptes()
  const ellisphereScore = useEllisphereScore()
  const updateCompteScore = useUpdateCompteScore()
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const { data: origines_Ref } = useReferenceTable('types_origines')
  const origines = origines_Ref && origines_Ref.length > 0 ? origines_Ref : FALLBACK_TYPES_ORIGINES
  const { data: energiesRef } = useReferenceTable('types_energies')
  const energies = energiesRef && energiesRef.length > 0 ? energiesRef : FALLBACK_TYPES_ENERGIES
  const createRecommandation = useCreateRecommandation()

  const [titre, setTitre] = useState('')
  const [mandatId, setMandatId] = useState('')
  const [typeEnergieId, setTypeEnergieId] = useState('')
  const [compteurIds, setCompteurIds] = useState<string[]>([])
  const [contactId, setContactId] = useState('')
  const [dateClotureManuelle, setDateClotureManuelle] = useState('')
  const [origineId, setOrigineId] = useState('')
  const [priorite, setPriorite] = useState(2)
  const [description, setDescription] = useState('')
  const [commentaireInterne, setCommentaireInterne] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const mandat = mandats?.find((m) => m.id === mandatId)
  const typeEnergie = (energies.find((e) => e.id === typeEnergieId)?.code?.toLowerCase() === 'gaz' ? 'gaz' : 'electricite') as 'electricite' | 'gaz'
  const engages = useMemo(() => compteursDejaEngages(recommandations ?? []), [recommandations])

  // PDL éligibles : mandat actif du compte, énergie choisie, pas déjà engagé ailleurs -- même
  // règle que Tools (Flot Opportunité).
  const compteursEligibles = useMemo(() => {
    if (!mandat || mandat.statut !== 'ACTIF' || !typeEnergieId) return []
    return (compteurs ?? []).filter(
      (c) => mandat.compteur_ids.includes(c.id) && c.type_energie === typeEnergie && !engages.has(c.id),
    )
  }, [mandat, typeEnergieId, typeEnergie, compteurs, engages])

  const contactsDuCompte = contacts?.filter((c) => c.compte_id === mandat?.compte_id) ?? []
  const compteursChoisis = compteursEligibles.filter((c) => compteurIds.includes(c.id))

  // Mix client/prospect : "client" = un contrat ACTIF/A_RENOUVELER couvre déjà ce PDL pour cette
  // énergie, "prospect" sinon -- blocage dur si le mix est mélangé (garde-fou Tools), type
  // d'opportunité dérivé automatiquement, jamais choisi.
  const contratsParCompteurId = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const c of contrats ?? []) {
      if (!STATUTS_CONTRAT_CLIENT.has(c.statut)) continue
      for (const cpt of c.compteurs) map.set(cpt.id, true)
    }
    return map
  }, [contrats])
  const mixStatuts = new Set(compteursChoisis.map((c) => (contratsParCompteurId.get(c.id) ? 'client' : 'prospect')))
  const mixInvalide = mixStatuts.size > 1
  const typeOpportunite = mixStatuts.has('client') ? 'Renouvellement' : 'Captation'

  // Contact décisionnaire : auto-suggéré si un seul PDL sélectionné et qu'il a un responsable ;
  // sinon libre choix + alerte non bloquante si absent des responsables des PDL choisis.
  const responsableSuggere = compteursChoisis.length === 1 ? compteursChoisis[0].responsable_contact_id : null
  const contactEffectifId = contactId || responsableSuggere || ''
  const responsablesDesPdl = new Set(compteursChoisis.map((c) => c.responsable_contact_id).filter(Boolean))
  const contactHorsResponsables = !!contactEffectifId && responsablesDesPdl.size > 0 && !responsablesDesPdl.has(contactEffectifId)

  // Date de clôture par défaut : échéance du PDL la plus proche, moins le préavis réel du
  // contrat actuel s'il existe (Kimatch a ce champ, contrairement à Tools qui code -2 mois en
  // dur faute de l'avoir), sinon repli -2 mois.
  const dateClotureSuggeree = useMemo(() => {
    if (compteursChoisis.length === 0) return ''
    const echeances = compteursChoisis
      .map((c) => {
        if (!c.date_echeance) return null
        const contratActuel = (contrats ?? []).find((ct) => STATUTS_CONTRAT_CLIENT.has(ct.statut) && ct.compteurs.some((cpt) => cpt.id === c.id))
        const preavisJours = contratActuel?.preavis_resiliation_jours ?? 60
        const d = new Date(c.date_echeance)
        d.setDate(d.getDate() - preavisJours)
        return d
      })
      .filter((d): d is Date => d != null)
    if (echeances.length === 0) return ''
    const plusProche = echeances.reduce((a, b) => (a < b ? a : b))
    return plusProche.toISOString().slice(0, 10)
  }, [compteursChoisis, contrats])
  const dateCloture = dateClotureManuelle || dateClotureSuggeree

  function reset() {
    setTitre('')
    setMandatId('')
    setTypeEnergieId('')
    setCompteurIds([])
    setContactId('')
    setDateClotureManuelle('')
    setOrigineId('')
    setPriorite(2)
    setDescription('')
    setCommentaireInterne('')
    setFeedback(null)
  }

  function toggleCompteur(id: string) {
    setCompteurIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!mandat || mixInvalide || compteursChoisis.length === 0) return
    const origine = origines.find((o) => o.id === origineId)
    const etapeAPreparer = etapes.find((e) => e.code === 'A_PREPARER')

    const result = await createRecommandation.mutateAsync({
      titre,
      mandat_id: mandat.id,
      compte_id: mandat.compte_id,
      compte_nom: mandat.compte_nom,
      type_energie_id: typeEnergieId || null,
      type_energie: typeEnergie,
      compteurs: compteursChoisis.map((c) => ({ id: c.id, site_id: c.site_id, site_nom: c.site_nom })),
      contact_signataire_id: contactEffectifId || null,
      date_cloture: dateCloture || null,
      type_opportunite: typeOpportunite,
      etape_id: etapeAPreparer?.id ?? null,
      origine_id: origineId || null,
      origine_libelle: origine?.libelle,
      priorite,
      description,
      commentaire_interne: commentaireInterne,
    })
    setFeedback(result.persisted ? 'Recommandation créée.' : 'Recommandation ajoutée localement (non synchronisée avec Supabase).')

    // Rafraîchissement du score Ellisphere à la création d'opportunité -- mécanisme séparé de
    // celui du compte, best-effort, ne bloque jamais la création (même esprit que Tools, sans
    // le limiteur de débit dédié faute de volume qui le justifie ici).
    const compte = comptes?.find((c) => c.id === mandat.compte_id)
    const scoreRecent = compte?.score_ellipro_maj && Date.now() - new Date(compte.score_ellipro_maj).getTime() < 24 * 3600 * 1000
    if (compte?.siren && !scoreRecent) {
      ellisphereScore.mutateAsync(compte.siren).then((score) => {
        updateCompteScore.mutate({ compteId: compte.id, score })
      }).catch(() => {})
    }

    if (result.persisted) onCreated(result.recommandation.id)
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  const canSubmit = !!mandat && !!typeEnergieId && compteursChoisis.length > 0 && !mixInvalide && titre.trim().length > 0

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouvelle recommandation" description="Créer une opportunité sur un ou plusieurs points de livraison d'un compte." className="max-w-xl">
      <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
        <FormField label="Titre">
          <Input value={titre} onChange={(e) => setTitre(e.target.value)} required placeholder="Ex. Renouvellement contrat — Résidence Les Tilleuls" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Mandat">
            <Select value={mandatId} onChange={(e) => { setMandatId(e.target.value); setCompteurIds([]); setContactId('') }} required>
              <option value="">Sélectionner un mandat…</option>
              {mandats?.map((m) => <option key={m.id} value={m.id}>{m.compte_nom}{m.statut !== 'ACTIF' ? ` (${m.statut.toLowerCase()})` : ''}</option>)}
            </Select>
          </FormField>
          <FormField label="Énergie">
            <Select value={typeEnergieId} onChange={(e) => { setTypeEnergieId(e.target.value); setCompteurIds([]) }} required>
              <option value="">Sélectionner…</option>
              {energies.map((en) => <option key={en.id} value={en.id}>{en.libelle}</option>)}
            </Select>
          </FormField>
        </div>
        {mandat && mandat.statut !== 'ACTIF' && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Ce mandat n'est pas actif — aucun PDL éligible tant qu'il n'est pas signé.</p>
        )}
        {mandat && typeEnergieId && (
          <FormField label="Points de livraison couverts">
            {compteursEligibles.length === 0 ? (
              <p className="text-xs text-navy-400">Aucun PDL éligible pour cette énergie (mandat inactif, énergie différente, ou déjà engagé sur une autre opportunité en cours).</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-navy-200 p-2">
                {compteursEligibles.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-navy-700">
                    <input type="checkbox" checked={compteurIds.includes(c.id)} onChange={() => toggleCompteur(c.id)} />
                    {c.utilisation || c.numero_pdl} <span className="text-navy-400">— {c.site_nom}</span>
                    {contratsParCompteurId.get(c.id) && <Badge tone="kiwi">Client</Badge>}
                  </label>
                ))}
              </div>
            )}
          </FormField>
        )}
        {mixInvalide && (
          <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Impossible de mélanger des PDL clients et prospects dans la même opportunité — choisis l'un ou l'autre.
          </p>
        )}
        {compteursChoisis.length > 0 && !mixInvalide && (
          <p className="text-xs text-navy-500">Type d'opportunité (dérivé automatiquement) : <span className="font-medium text-navy-700">{typeOpportunite}</span></p>
        )}
        {contactsDuCompte.length > 0 && (
          <FormField label="Contact décisionnaire">
            <Select value={contactEffectifId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Sélectionner…</option>
              {contactsDuCompte.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </Select>
            {contactHorsResponsables && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Ce contact n'est responsable d'aucun des PDL sélectionnés.</p>
            )}
          </FormField>
        )}
        <FormField label="Date de clôture visée">
          <Input type="date" value={dateCloture} onChange={(e) => setDateClotureManuelle(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Origine">
            <Select value={origineId} onChange={(e) => setOrigineId(e.target.value)}>
              <option value="">Sélectionner…</option>
              {origines.map((o) => <option key={o.id} value={o.id}>{o.libelle}</option>)}
            </Select>
          </FormField>
          <FormField label="Priorité">
            <Select value={priorite} onChange={(e) => setPriorite(Number(e.target.value))}>
              {PRIORITE_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
        <FormField label="Commentaire interne">
          <Textarea rows={2} value={commentaireInterne} onChange={(e) => setCommentaireInterne(e.target.value)} placeholder="Visible en interne uniquement" />
        </FormField>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 border-t border-navy-100 pt-3">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createRecommandation.isPending || !canSubmit}>Créer la recommandation</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Recommandations() {
  const { data: recommandations, isLoading } = useRecommandations()
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [etapeFilter, setEtapeFilter] = useState('')

  const recommandationsFiltreesParEtape = etapeFilter ? recommandations?.filter((r) => r.etape === etapeFilter) : recommandations

  const { query, setQuery, sortKey, setSortKey, items: filteredRecommandations } = useListControls(recommandationsFiltreesParEtape, {
    searchFields: (r) => [r.titre, r.compte_nom, r.conseiller],
    sorters: {
      titre: (a, b) => a.titre.localeCompare(b.titre),
      compte_nom: (a, b) => a.compte_nom.localeCompare(b.compte_nom),
      priorite: (a, b) => a.priorite - b.priorite,
    },
    defaultSort: 'titre',
  })

  return (
    <div>
      <Topbar title="Recommandations" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Recommandations"
          description="Le véritable produit de KiWee — jamais figée, elle évolue par versions successives."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouvelle recommandation</Button>}
        />

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher une recommandation, un compte…" count={filteredRecommandations?.length}>
          <Select value={etapeFilter} onChange={(e) => setEtapeFilter(e.target.value)} className="w-auto">
            <option value="">Toutes les étapes</option>
            {etapes.map((e) => <option key={e.id} value={e.code}>{e.libelle}</option>)}
          </Select>
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            <option value="titre">Trier par titre</option>
            <option value="compte_nom">Trier par compte</option>
            <option value="priorite">Trier par priorité</option>
          </Select>
        </ListToolbar>

        {!isLoading && recommandations?.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">
            Aucune recommandation pour l'instant — c'est le cœur du métier KiWee : une proposition chiffrée (optimisations, offres) pour un ou plusieurs sites. Utilise « Nouvelle recommandation » pour en créer une.
          </p>
        )}
        {!isLoading && recommandations && recommandations.length > 0 && filteredRecommandations?.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">Aucune recommandation ne correspond à la recherche.</p>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {filteredRecommandations?.map((reco) => {
            const etapeLabel = etapes.find((e) => e.code === reco.etape)?.libelle ?? reco.etape
            return (
              <Card
                key={reco.id}
                className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                onClick={() => navigate(`/recommandations/${reco.id}`)}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                      <Sparkle className="h-4 w-4" />
                    </span>
                    <p className="font-display font-medium text-navy-800">{reco.titre}</p>
                  </div>
                  <Badge tone={ETAPE_TONE[reco.etape] ?? 'neutral'}>{etapeLabel}</Badge>
                </div>
                <p className="text-xs text-navy-500">
                  <EntityLink to={`/comptes/${reco.compte_id}`}>{reco.compte_nom}</EntityLink>
                  {' · '}
                  {reco.sites.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && ', '}
                      <EntityLink to={`/sites/${s.id}`}>{s.nom}</EntityLink>
                    </span>
                  ))}
                </p>

                <div className="mt-4">
                  <EtapeCompact steps={etapes} currentCode={reco.etape} />
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-navy-400">
                  <span>{reco.conseiller}</span>
                  <span>{reco.versions.length} version{reco.versions.length > 1 ? 's' : ''}</span>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
      <CreateRecommandationDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(recoId) => navigate(`/recommandations/${recoId}`)}
      />
    </div>
  )
}
