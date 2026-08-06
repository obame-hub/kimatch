import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Coins, Loader2, Search, Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Label } from '@/components/ui/form'
import { ContactPicker } from '@/components/contact/ContactPicker'
import { useComptes } from '@/lib/data/comptes'
import { useContacts } from '@/lib/data/contacts'
import { useCompteurs } from '@/lib/data/compteurs'
import { useContrats, useCreateContrat } from '@/lib/data/contrats'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_CONTRATS, FALLBACK_TYPES_ENERGIES } from '@/lib/referenceFallbacks'
import { ZONE_ORDER_CONTRAT, ZONE_LABEL_CONTRAT, zoneDuFournisseur } from '@/lib/fournisseurZones'
import { nomJourFerieFR } from '@/lib/joursFeries'
import { cn } from '@/lib/utils'
import type { Recommandation } from '@/types/domain'

const ETAPES = ['Fournisseur', 'Durée', 'Préférences', 'Signataire']

/** Seuls ces deux fournisseurs proposent une clause de renégociation anticipée -- règle énoncée
 * par William en réunion, et reprise telle quelle de Tools (`SPECIAL_SUPPLIERS`). */
const FOURNISSEURS_RENEGOCIATION = ['GAZ EUROPEEN', 'SEFE']

function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Demande de contrat, en 4 étapes, à partir d'une opportunité — transposition du `ContratWizard`
 * de Tools : mêmes étapes, mêmes règles, et surtout **même point de départ**. Tous les PDL de
 * l'opportunité sont embarqués sans sélection, et la demande naît au statut « Nouveau ».
 *
 * Écart assumé vs Tools, demandé par William en réunion : quand un seul fournisseur est
 * disponible, on le sélectionne et on enchaîne — « si tu as un choix unique, je n'ai pas besoin de
 * faire deux clics ». Le bouton Précédent reste toujours accessible.
 */
export function ContratWizard({
  open,
  onClose,
  reco,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  reco: Recommandation
  onCreated: (message: string) => void
}) {
  const { data: comptes } = useComptes()
  const { data: contacts } = useContacts()
  const { data: compteurs } = useCompteurs()
  const { data: contratsExistants } = useContrats()
  const { data: statutsRef } = useReferenceTable('statuts_contrats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_CONTRATS
  const { data: energiesRef } = useReferenceTable('types_energies')
  const energies = energiesRef && energiesRef.length > 0 ? energiesRef : FALLBACK_TYPES_ENERGIES
  const createContrat = useCreateContrat()

  const [etape, setEtape] = useState(1)
  const [fournisseurId, setFournisseurId] = useState('')
  const [rechercheFournisseur, setRechercheFournisseur] = useState('')
  const [dateReception, setDateReception] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dureeMois, setDureeMois] = useState('36')
  const [typePrix, setTypePrix] = useState('')
  const [renegociation, setRenegociation] = useState(false)
  const [strategie, setStrategie] = useState<'marge_fixe' | 'prix_cible'>('marge_fixe')
  const [montant, setMontant] = useState('')
  const [contactId, setContactId] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const typeEnergie: 'electricite' | 'gaz' = reco.type_energie === 'gaz' ? 'gaz' : 'electricite'
  const estGaz = typeEnergie === 'gaz'
  const optionsTypePrix = useMemo(() => (estGaz ? ['Fixe', 'Indexé'] : ['Marché']), [estGaz])
  const pdls = useMemo(
    () => (compteurs ?? []).filter((c) => (reco.compteur_ids ?? []).includes(c.id)),
    [compteurs, reco.compteur_ids],
  )
  const contactsDuCompte = useMemo(
    () => (contacts ?? []).filter((c) => c.compte_id === reco.compte_id),
    [contacts, reco.compte_id],
  )
  const compteCible = comptes?.find((c) => c.id === reco.compte_id)

  // Fournisseurs proposés : ceux réellement consultés dans la cotation. C'est ce qui fait qu'un
  // « choix unique » se produit vraiment (quand une seule offre a été retenue). À défaut de
  // cotation, on retombe sur tous les fournisseurs actifs.
  const fournisseursConsultes = useMemo(() => {
    const ids = new Set(
      reco.versions.flatMap((v) => v.optimisations.flatMap((o) => o.fournisseurs_consultes.map((f) => f.fournisseur_compte_id))),
    )
    const tous = (comptes ?? []).filter((c) => c.type_compte === 'fournisseur' && c.fournisseur_actif !== false)
    const retenus = tous.filter((f) => ids.has(f.id))
    return retenus.length > 0 ? retenus : tous
  }, [reco.versions, comptes])

  const fournisseursFiltres = useMemo(() => {
    const q = rechercheFournisseur.trim().toLowerCase()
    if (!q) return fournisseursConsultes
    return fournisseursConsultes.filter((f) => f.nom.toLowerCase().includes(q))
  }, [fournisseursConsultes, rechercheFournisseur])

  const fournisseur = fournisseursConsultes.find((f) => f.id === fournisseurId)
  const renegociationProposee = !!fournisseur && FOURNISSEURS_RENEGOCIATION.some((n) => fournisseur.nom.toUpperCase().includes(n))

  // Un seul fournisseur possible → on le choisit et on passe à la suite (demande de William).
  useEffect(() => {
    if (!open || etape !== 1 || fournisseursConsultes.length !== 1 || fournisseurId) return
    setFournisseurId(fournisseursConsultes[0].id)
    const t = setTimeout(() => setEtape(2), 400)
    return () => clearTimeout(t)
  }, [open, etape, fournisseursConsultes, fournisseurId])

  // Date de début préremplie à l'échéance + 1 jour, uniquement si l'opportunité porte 1 seul PDL.
  useEffect(() => {
    if (pdls.length !== 1 || dateDebut) return
    const e = pdls[0].date_echeance
    if (!e) return
    const d = new Date(e)
    d.setDate(d.getDate() + 1)
    setDateDebut(iso(d))
  }, [pdls, dateDebut])

  useEffect(() => {
    if (!typePrix && optionsTypePrix.length > 0) setTypePrix(optionsTypePrix[0])
  }, [optionsTypePrix, typePrix])

  // Signataire prérempli avec le contact décisionnaire de l'opportunité, comme Tools. L'étape 4
  // l'annonçait déjà sans le faire : sans opportunité portant un décisionnaire, le champ restait
  // vide. Reste modifiable, y compris vers un contact d'un autre compte.
  useEffect(() => {
    if (!open || contactId || !reco.contact_signataire_id) return
    setContactId(reco.contact_signataire_id)
  }, [open, contactId, reco.contact_signataire_id])

  // « Prix cible » réservé au prix Fixe : repli silencieux sinon, comme Tools.
  useEffect(() => {
    if (typePrix !== 'Fixe' && strategie === 'prix_cible') setStrategie('marge_fixe')
  }, [typePrix, strategie])

  const receptionInvalide = useMemo(() => {
    if (!dateReception) return null
    const d = new Date(dateReception)
    if (Number.isNaN(d.getTime())) return null
    const aujourdhui = new Date()
    aujourdhui.setHours(0, 0, 0, 0)
    if (d < aujourdhui) return 'Cette date est déjà passée.'
    const jour = d.getDay()
    if (jour === 0 || jour === 6) return 'Choisis un jour ouvré (lundi-vendredi).'
    const ferie = nomJourFerieFR(d)
    if (ferie) return `${ferie} : aucun fournisseur ne traitera la demande ce jour-là.`
    return null
  }, [dateReception])

  const dateFin = useMemo(() => {
    const d = new Date(dateDebut)
    const n = Number(dureeMois)
    if (!dateDebut || Number.isNaN(d.getTime()) || !n || n < 1) return ''
    return iso(addMonths(d, n))
  }, [dateDebut, dureeMois])

  const dejaSousContrat = useMemo(() => {
    const couverts = new Set((contratsExistants ?? []).flatMap((c) => c.compteurs.map((cc) => cc.id)))
    return pdls.filter((p) => couverts.has(p.id))
  }, [contratsExistants, pdls])

  const peutContinuer = (() => {
    if (etape === 1) return !!fournisseurId
    if (etape === 2) return !!dateReception && !receptionInvalide && !!dateDebut && Number(dureeMois) > 0
    if (etape === 3) return !!typePrix && !!montant
    if (etape === 4) return !!contactId
    return false
  })()

  function reset() {
    setEtape(1)
    setFournisseurId('')
    setRechercheFournisseur('')
    setDateReception('')
    setDateDebut('')
    setDureeMois('36')
    setTypePrix('')
    setRenegociation(false)
    setStrategie('marge_fixe')
    setMontant('')
    setContactId('')
    setFeedback(null)
  }

  async function handleSubmit() {
    if (!peutContinuer || pdls.length === 0) return
    const statutNouveau = statuts.find((s) => s.code === 'NOUVEAU') ?? statuts.find((s) => s.code === 'ACTIF')
    const energie = energies.find((e) => (e.code ?? '').toLowerCase() === typeEnergie)
    const contact = (contacts ?? []).find((c) => c.id === contactId)
    const siteId = pdls[0].site_id

    const result = await createContrat.mutateAsync({
      compte_id: reco.compte_id,
      site_id: siteId,
      site_nom: pdls[0].site_nom ?? '',
      fournisseur_compte_id: fournisseurId || null,
      fournisseur_nom: fournisseur?.nom ?? '',
      type_energie_id: energie?.id ?? null,
      type_energie: typeEnergie,
      statut_id: statutNouveau?.id ?? null,
      statut_code: 'NOUVEAU',
      reference_fournisseur: null,
      date_debut: dateDebut || null,
      date_fin: dateFin || null,
      duree_mois: Number(dureeMois),
      date_reception_souhaitee: dateReception || null,
      compteur_ids: pdls.map((p) => p.id),
      compteurs: pdls.map((p) => ({ id: p.id, numero_pdl: p.numero_pdl, utilisation: p.utilisation })),
      contact_signataire_id: contactId || null,
      contact_signataire_nom: contact ? `${contact.prenom} ${contact.nom}` : undefined,
      type_prix: typePrix,
      strategie_tarifaire: strategie,
      prix_molecule_eur_mwh: Number(montant),
      recommandation_id: reco.id,
      version_recommandation_id: reco.versions.find((v) => v.version_actuelle)?.id ?? null,
      // UN SEUL champ pour la renégociation. J'avais écrit les deux (`renegociation_anticipee` ET
      // la clause), reproduisant exactement la confusion de Tools que la doc du projet dit de ne
      // pas reproduire. On garde `clause_renegociation_anticipee`, qui préexistait et fait partie
      // de la famille des 6 clauses affichées ensemble sur la fiche contrat.
      clauses: renegociationProposee ? { clause_renegociation_anticipee: renegociation } : undefined,
    })

    setFeedback(result.persisted ? 'Demande de contrat créée.' : 'Demande ajoutée localement (non synchronisée).')
    onCreated(`✓ Demande de contrat créée — ${fournisseur?.nom ?? ''}`)
    setTimeout(() => { reset(); onClose() }, 800)
  }

  if (pdls.length === 0) {
    return (
      <Dialog open={open} onClose={onClose} title="Demande de contrat" description={reco.titre}>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="font-medium text-navy-800">Aucun point de livraison</p>
          <p className="max-w-sm text-sm text-navy-500">
            Aucun point de livraison n'est rattaché à cette opportunité. Impossible de créer une demande de contrat.
          </p>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onClose() }}
      title="Nouvelle demande de contrat"
      description={`${reco.compte_nom} · ${pdls.length} PDL · ${estGaz ? 'Gaz' : 'Électricité'}`}
      className="max-w-2xl"
    >
      <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
        {/* Stepper */}
        <div className="flex items-center gap-2">
          {ETAPES.map((label, i) => {
            const idx = i + 1
            const actif = idx === etape
            const fait = idx < etape
            return (
              <div key={label} className="flex flex-1 items-center gap-2">
                <span className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  fait && 'bg-kiwi-600 text-white',
                  actif && 'bg-kiwi-50 text-kiwi-700 ring-2 ring-kiwi-300',
                  !actif && !fait && 'bg-navy-100 text-navy-400',
                )}>
                  {fait ? <Check className="h-4 w-4" /> : idx}
                </span>
                <span className={cn('hidden truncate text-xs font-medium sm:inline', actif ? 'text-navy-800' : 'text-navy-400')}>{label}</span>
              </div>
            )
          })}
        </div>

        {/* ÉTAPE 1 — Fournisseur */}
        {etape === 1 && (
          <div className="space-y-3">
            <div>
              <h3 className="font-display text-base font-semibold text-navy-900">Chez quel fournisseur signer ?</h3>
              <p className="mt-0.5 text-sm text-navy-500">
                {fournisseursConsultes.length === 1
                  ? 'Un seul fournisseur a été consulté — sélection automatique.'
                  : 'Fournisseurs consultés lors de la cotation.'}
              </p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
              <Input
                value={rechercheFournisseur}
                onChange={(e) => setRechercheFournisseur(e.target.value)}
                placeholder="Rechercher un fournisseur…"
                className="pl-9"
              />
            </div>
            <div className="space-y-3">
              {[...ZONE_ORDER_CONTRAT, 'autre'].map((zone) => {
                const list = fournisseursFiltres.filter((f) => zoneDuFournisseur(f.intermediary, f.partnership) === zone)
                if (list.length === 0) return null
                return (
                  <div key={zone}>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-navy-400">
                      {ZONE_LABEL_CONTRAT[zone] ?? 'Autre'}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {list.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => { setFournisseurId(f.id); setEtape(2) }}
                          className={cn(
                            'rounded-xl border-2 p-3 text-left text-sm transition-all hover:-translate-y-0.5 hover:shadow-sm',
                            fournisseurId === f.id ? 'border-kiwi-500 bg-kiwi-50 font-semibold text-kiwi-700' : 'border-navy-200 hover:border-kiwi-300',
                          )}
                        >
                          {f.nom}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
              {fournisseursFiltres.length === 0 && (
                <p className="text-xs text-navy-400">Aucun fournisseur ne correspond à la recherche.</p>
              )}
            </div>
          </div>
        )}

        {/* ÉTAPE 2 — Dates & durée */}
        {etape === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-navy-900">Dates & durée du contrat</h3>
              <p className="mt-0.5 text-sm text-navy-500">La date de fin est calculée automatiquement.</p>
            </div>
            <FormField label="Date de réception souhaitée" required>
              <Input type="date" value={dateReception} onChange={(e) => setDateReception(e.target.value)} />
              {receptionInvalide ? (
                <p className="mt-1 text-xs text-amber-700">{receptionInvalide}</p>
              ) : (
                <p className="mt-1 text-xs text-navy-400">Jour ouvré, hors week-ends et jours fériés.</p>
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Date de début" required>
                <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
                {pdls.length === 1 && <p className="mt-1 text-xs text-navy-400">Préremplie à l'échéance du PDL + 1 jour.</p>}
              </FormField>
              <FormField label="Durée (mois)" required>
                <Input type="number" min={1} value={dureeMois} onChange={(e) => setDureeMois(e.target.value)} />
              </FormField>
            </div>
            <div className="rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-xs text-navy-500">
              Date de fin (calculée) : <span className="font-medium text-navy-700">{dateFin ? new Date(dateFin).toLocaleDateString('fr-FR') : '—'}</span>
            </div>
            {dejaSousContrat.length > 0 && (
              <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {dejaSousContrat.length} PDL de cette opportunité {dejaSousContrat.length > 1 ? 'sont déjà couverts' : 'est déjà couvert'} par un contrat existant.
              </p>
            )}
          </div>
        )}

        {/* ÉTAPE 3 — Préférences */}
        {etape === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-navy-900">Préférences contractuelles</h3>
              <p className="mt-0.5 text-sm text-navy-500">Type de prix, clause et stratégie tarifaire.</p>
            </div>
            <div>
              <Label>Type de prix <span className="text-red-500">*</span></Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {optionsTypePrix.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setTypePrix(o)}
                    className={cn(
                      'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                      typePrix === o ? 'border-kiwi-500 bg-kiwi-50 text-kiwi-700' : 'border-navy-200 hover:border-kiwi-300',
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>

            {/* Un seul mécanisme de renégociation, et uniquement chez les fournisseurs qui la
                proposent -- Tools en a deux qui se chevauchent, on ne reproduit pas la confusion. */}
            {renegociationProposee ? (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-navy-200 p-3">
                <span>
                  <span className="block text-sm font-medium text-navy-800">Renégociation anticipée</span>
                  <span className="mt-0.5 block text-xs text-navy-500">Proposée par {fournisseur?.nom}.</span>
                </span>
                <input type="checkbox" checked={renegociation} onChange={(e) => setRenegociation(e.target.checked)} />
              </label>
            ) : (
              <p className="rounded-lg border border-navy-100 bg-navy-50 p-3 text-xs text-navy-500">
                {fournisseur?.nom} ne propose pas de clause de renégociation anticipée — seuls {FOURNISSEURS_RENEGOCIATION.join(' et ')} le font.
              </p>
            )}

            <div>
              <Label>Stratégie tarifaire <span className="text-red-500">*</span></Label>
              <div className="mt-1 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setStrategie('marge_fixe')}
                  className={cn(
                    'rounded-xl border-2 p-3 text-left transition-all',
                    strategie === 'marge_fixe' ? 'border-kiwi-500 bg-kiwi-50' : 'border-navy-200 hover:border-kiwi-300',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-navy-800"><Coins className="h-4 w-4 text-kiwi-700" /> Marge fixe</span>
                  <span className="mt-1 block text-xs text-navy-500">Marge en €/MWh</span>
                </button>
                <button
                  type="button"
                  disabled={typePrix !== 'Fixe'}
                  onClick={() => setStrategie('prix_cible')}
                  className={cn(
                    'rounded-xl border-2 p-3 text-left transition-all',
                    typePrix !== 'Fixe' && 'cursor-not-allowed opacity-50',
                    strategie === 'prix_cible' ? 'border-kiwi-500 bg-kiwi-50' : 'border-navy-200 hover:border-kiwi-300',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-navy-800"><Target className="h-4 w-4 text-kiwi-700" /> Prix cible</span>
                  <span className="mt-1 block text-xs text-navy-500">
                    {typePrix === 'Fixe' ? 'Prix cible en €/MWh' : 'Disponible uniquement pour un prix « Fixe »'}
                  </span>
                </button>
              </div>
            </div>
            <FormField label={strategie === 'prix_cible' ? 'Prix cible (€/MWh)' : 'Marge (€/MWh)'} required>
              <Input type="number" step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} />
            </FormField>
          </div>
        )}

        {/* ÉTAPE 4 — Signataire */}
        {etape === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-navy-900">Signataire du contrat</h3>
              <p className="mt-0.5 text-sm text-navy-500">Prérempli avec le contact décisionnaire de l'opportunité.</p>
            </div>
            <ContactPicker
              value={contactId}
              onChange={(id) => setContactId(id)}
              accountContacts={contactsDuCompte}
              allContacts={contacts ?? []}
              accountId={reco.compte_id}
              accountNom={reco.compte_nom}
              segment={compteCible?.segment}
            />
            <div className="rounded-lg border border-navy-100 bg-navy-50 p-3 text-xs text-navy-600">
              <p><span className="text-navy-400">Fournisseur :</span> <span className="font-medium">{fournisseur?.nom}</span></p>
              <p className="mt-0.5"><span className="text-navy-400">Période :</span> <span className="font-medium">{dateDebut ? new Date(dateDebut).toLocaleDateString('fr-FR') : '—'} → {dateFin ? new Date(dateFin).toLocaleDateString('fr-FR') : '—'}</span> ({dureeMois} mois)</p>
              <p className="mt-0.5"><span className="text-navy-400">Prix :</span> <span className="font-medium">{typePrix}</span> · {strategie === 'prix_cible' ? 'prix cible' : 'marge'} {montant} €/MWh</p>
              <p className="mt-0.5"><span className="text-navy-400">Périmètre :</span> <span className="font-medium">{pdls.length} PDL</span></p>
            </div>
          </div>
        )}

        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}

        <div className="flex items-center justify-between gap-2 border-t border-navy-100 pt-3">
          <Button type="button" variant="ghost" onClick={() => (etape === 1 ? (reset(), onClose()) : setEtape((e) => e - 1))}>
            {etape === 1 ? 'Annuler' : <><ChevronLeft className="h-4 w-4" /> Précédent</>}
          </Button>
          {etape < ETAPES.length ? (
            <Button type="button" disabled={!peutContinuer} onClick={() => setEtape((e) => e + 1)}>
              Continuer <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" disabled={!peutContinuer || createContrat.isPending} onClick={handleSubmit}>
              {createContrat.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Création…</> : 'Créer la demande'}
            </Button>
          )}
        </div>

        {etape === 1 && fournisseursConsultes.length === 1 && (
          <p className="text-center text-[11px] text-navy-400">
            <Badge tone="neutral" className="mr-1">Choix unique</Badge>
            Sélection automatique — utilise « Précédent » depuis l'étape suivante pour revenir.
          </p>
        )}
      </div>
    </Dialog>
  )
}
