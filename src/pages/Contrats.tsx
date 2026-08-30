import { useEffect, useMemo, useState } from 'react'
import { useTranchesAffichage } from '@/lib/useTranchesAffichage'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { addMonths, format, isValid } from 'date-fns'
import { FileSignature, Zap, Flame, Plus, FileText } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { useContrats, useCreateContrat } from '@/lib/data/contrats'
import { useSites } from '@/lib/data/sites'
import { useComptes } from '@/lib/data/comptes'
import { useCompteurs } from '@/lib/data/compteurs'
import { useContacts } from '@/lib/data/contacts'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_CONTRATS, STATUT_CONTRAT_TONE, FALLBACK_TYPES_ENERGIES } from '@/lib/referenceFallbacks'
import { ZONE_ORDER_CONTRAT, ZONE_LABEL_CONTRAT, zoneDuFournisseur } from '@/lib/fournisseurZones'
import { nomJourFerieFR } from '@/lib/joursFeries'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'
import { ExtractDocumentButton } from '@/components/ui/document-extraction'
import { cn } from '@/lib/utils'

// Fournisseurs pour lesquels Tools recommande la renégociation anticipée (ContratWizard.tsx,
// SPECIAL_SUPPLIERS) -- juste un indice visuel ici, la case reste éditable pour tous (contrairement
// à Tools qui la masque entièrement pour les autres fournisseurs).
const FOURNISSEURS_RENEGOCIATION_RECOMMANDEE = ['GAZ EUROPEEN', 'SEFE']

/**
 * L'ALERTE DE RECONDUCTION TACITE, telle qu'elle se lit dans une liste.
 *
 * LE DÉLAI VIENT DU CONTRAT. Michel, 21/08/2026 : « dépend du fournisseur, on peut pas calculer,
 * c'est le commercial qui le met. » Les 90 jours ne sont plus qu'un repli, pour qu'un contrat non
 * renseigné soit signalé quand même plutôt que de passer inaperçu.
 *
 * Au-delà du délai, on ne dit rien : une liste où tout est signalé ne signale plus rien.
 */
function alerteTacite(
  jourISO: string | null | undefined,
  joursAlerte: number | null | undefined,
): { texte: string; passee: boolean } | null {
  if (!jourISO) return null
  const jour = new Date(jourISO)
  if (Number.isNaN(jour.getTime())) return null
  const aujourdhui = new Date()
  aujourdhui.setHours(0, 0, 0, 0)
  const jours = Math.round((jour.getTime() - aujourdhui.getTime()) / 86400000)
  if (jours < 0) {
    return { texte: `Reconduit — date limite passée le ${jour.toLocaleDateString('fr-FR')}`, passee: true }
  }
  if (jours > (joursAlerte ?? 90)) return null
  if (jours === 0) return { texte: 'Dernier jour pour résilier', passee: false }
  return {
    texte: `À résilier sous ${jours} jour${jours > 1 ? 's' : ''} — avant le ${jour.toLocaleDateString('fr-FR')}`,
    passee: false,
  }
}

const CLAUSES: { key: 'clause_tacite_reconduction' | 'clause_renegociation_anticipee' | 'clause_engagement_consommation' | 'clause_energie_verte' | 'clause_indexation_prix' | 'clause_penalites_resiliation'; label: string }[] = [
  { key: 'clause_tacite_reconduction', label: 'Tacite reconduction' },
  { key: 'clause_renegociation_anticipee', label: 'Renégociation anticipée' },
  { key: 'clause_engagement_consommation', label: "Engagement de consommation" },
  { key: 'clause_energie_verte', label: 'Énergie verte' },
  { key: 'clause_indexation_prix', label: 'Indexation du prix' },
  { key: 'clause_penalites_resiliation', label: 'Pénalités de résiliation' },
]

function CreateContratDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: sites } = useSites()
  const { data: comptes } = useComptes()
  const { data: compteurs } = useCompteurs()
  const { data: contacts } = useContacts()
  const { data: energiesRef } = useReferenceTable('types_energies')
  const energies = energiesRef && energiesRef.length > 0 ? energiesRef : FALLBACK_TYPES_ENERGIES
  const { data: statutsRef } = useReferenceTable('statuts_contrats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_CONTRATS
  const createContrat = useCreateContrat()

  const [siteId, setSiteId] = useState('')
  const [fournisseurId, setFournisseurId] = useState('')
  const [typeEnergieId, setTypeEnergieId] = useState('')
  const [referenceFournisseur, setReferenceFournisseur] = useState('')
  const [dateReceptionSouhaitee, setDateReceptionSouhaitee] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  // Durée en mois, saisie libre (pas de préréglages) -- la date de fin n'est jamais saisie à la
  // main, elle est calculée automatiquement à partir de la date de début + cette durée, même
  // règle que ContratWizard.tsx dans Tools.
  const [dureeMois, setDureeMois] = useState('')
  const [compteurIds, setCompteurIds] = useState<string[]>([])
  const [contactSignataireId, setContactSignataireId] = useState('')
  const [typePrix, setTypePrix] = useState('')
  const [strategieTarifaire, setStrategieTarifaire] = useState<'marge_fixe' | 'prix_cible'>('marge_fixe')
  const [prixMolecule, setPrixMolecule] = useState('')
  const [clauses, setClauses] = useState<Record<string, boolean>>({})
  const [feedback, setFeedback] = useState<string | null>(null)

  const fournisseurs = comptes?.filter((c) => c.type_compte === 'fournisseur') ?? []
  const compteursDuSite = compteurs?.filter((c) => c.site_id === siteId) ?? []
  const compteDuSite = sites?.find((s) => s.id === siteId)?.compte_id
  const contactsDuSite = contacts?.filter((c) => c.compte_id === compteDuSite) ?? []
  const energieChoisie = energies.find((e) => e.id === typeEnergieId)
  const estGaz = (energieChoisie?.code ?? '').toLowerCase() === 'gaz'
  // Électricité : "Marché" est la seule option (pas un vrai choix) -- Gaz : Fixe/Indexé, un vrai
  // choix -- même règle que Tools.
  const optionsTypePrix = estGaz ? ['Fixe', 'Indexé'] : ['Marché']

  const fournisseursParZone = new Map<string, typeof fournisseurs>()
  for (const f of fournisseurs) {
    const zone = zoneDuFournisseur(f.intermediary, f.partnership)
    fournisseursParZone.set(zone, [...(fournisseursParZone.get(zone) ?? []), f])
  }

  // Date de fin calculée, jamais saisie à la main -- même règle que Tools.
  const dateFin = useMemo(() => {
    const debut = new Date(dateDebut)
    const mois = Number(dureeMois)
    if (!dateDebut || !isValid(debut) || !dureeMois || !Number.isFinite(mois) || mois < 1) return ''
    return format(addMonths(debut, mois), 'yyyy-MM-dd')
  }, [dateDebut, dureeMois])

  // Date de réception souhaitée : jour ouvré uniquement (lundi-vendredi), à partir d'aujourd'hui
  // -- même règle que Tools, en alerte non bloquante plutôt qu'en désactivant des jours dans un
  // calendrier custom (Kimatch utilise l'input date natif du navigateur).
  const receptionInvalide = useMemo(() => {
    if (!dateReceptionSouhaitee) return null
    const d = new Date(dateReceptionSouhaitee)
    if (!isValid(d)) return null
    const aujourdhui = new Date()
    aujourdhui.setHours(0, 0, 0, 0)
    if (d < aujourdhui) return 'Cette date est déjà passée.'
    const jour = d.getDay()
    if (jour === 0 || jour === 6) return 'Choisis un jour ouvré (lundi-vendredi).'
    // Les fériés comptent autant que les week-ends : aucun fournisseur ne traite une demande le
    // 15 août (remarque de William en réunion, jugée « loin d'être optionnelle »).
    const ferie = nomJourFerieFR(d)
    if (ferie) return `${ferie} : aucun fournisseur ne traitera la demande ce jour-là.`
    return null
  }, [dateReceptionSouhaitee])

  // Stratégie tarifaire "Prix cible" seulement disponible si le type de prix est "Fixe" --
  // repli silencieux vers "Marge fixe" sinon (même règle que Tools).
  useEffect(() => {
    if (typePrix !== 'Fixe' && strategieTarifaire === 'prix_cible') setStrategieTarifaire('marge_fixe')
  }, [typePrix, strategieTarifaire])

  // Type de prix prérempli automatiquement sur la première option disponible dès que l'énergie
  // est choisie -- même règle que Tools (pour l'Électricité, "Marché" est la seule option, donc
  // ceci l'auto-sélectionne sans clic).
  useEffect(() => {
    if (typeEnergieId && !typePrix && optionsTypePrix.length > 0) setTypePrix(optionsTypePrix[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeEnergieId, estGaz])

  // Date de début préremplie uniquement si un seul compteur est sélectionné (échéance + 1 jour)
  // -- les sélections multi-PDL n'ont aucun préremplissage, saisie 100% manuelle (même règle que
  // Tools).
  useEffect(() => {
    if (compteurIds.length !== 1) return
    const c = compteursDuSite.find((cc) => cc.id === compteurIds[0])
    if (c?.date_echeance && !dateDebut) {
      const d = new Date(c.date_echeance)
      d.setDate(d.getDate() + 1)
      setDateDebut(d.toISOString().slice(0, 10))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compteurIds])

  // Un contrat sans compteur n'a aucun périmètre : Tools refuse carrément d'ouvrir le wizard
  // (« Aucun point de livraison … Impossible de créer une demande de contrat »). Kimatch laissait
  // créer un contrat vide, invisible ensuite dans la couverture des sites.
  const canSubmit = !!siteId && compteurIds.length > 0 && !receptionInvalide

  function reset() {
    setSiteId('')
    setFournisseurId('')
    setTypeEnergieId('')
    setReferenceFournisseur('')
    setDateReceptionSouhaitee('')
    setDateDebut('')
    setDureeMois('')
    setCompteurIds([])
    setContactSignataireId('')
    setTypePrix('')
    setStrategieTarifaire('marge_fixe')
    setPrixMolecule('')
    setClauses({})
    setFeedback(null)
  }

  function toggleCompteur(id: string) {
    setCompteurIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function handleExtracted(fields: Record<string, { value: string | number | null; confidence: number }>) {
    const refFournisseur = fields.reference_fournisseur?.value
    if (typeof refFournisseur === 'string' && refFournisseur) setReferenceFournisseur(refFournisseur)
    const debut = fields.date_debut?.value
    if (typeof debut === 'string' && debut) setDateDebut(debut)
    const fin = fields.date_fin?.value
    if (typeof fin === 'string' && fin) {
      const debutStr = typeof debut === 'string' && debut ? debut : dateDebut
      const d1 = new Date(debutStr)
      const d2 = new Date(fin)
      if (debutStr && isValid(d1) && isValid(d2)) {
        const mois = Math.max(1, Math.round((d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth())))
        setDureeMois(String(mois))
      }
    }
    const fournNom = (fields.fournisseur_nom?.value ?? '').toString().toLowerCase()
    if (fournNom) {
      const match = fournisseurs.find((f) => f.nom.toLowerCase().includes(fournNom) || fournNom.includes(f.nom.toLowerCase()))
      if (match) setFournisseurId(match.id)
    }
    const energieCode = (fields.type_energie?.value ?? '').toString().toLowerCase()
    if (energieCode) {
      const match = energies.find((en) => en.code?.toLowerCase() === energieCode)
      if (match) setTypeEnergieId(match.id)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const site = sites?.find((s) => s.id === siteId)
    const fournisseur = fournisseurs.find((f) => f.id === fournisseurId)
    const energie = energies.find((en) => en.id === typeEnergieId)
    const contactSignataire = contactsDuSite.find((c) => c.id === contactSignataireId)
    const statutActif = statuts.find((s) => s.code === 'ACTIF')
    const compteursChoisis = compteursDuSite.filter((c) => compteurIds.includes(c.id)).map((c) => ({ id: c.id, contrat_compteur_id: null, numero_pdl: c.numero_pdl, utilisation: c.utilisation }))
    if (!site) return
    const typeEnergie = (energie?.code?.toLowerCase() === 'gaz' ? 'gaz' : 'electricite') as 'electricite' | 'gaz'

    const result = await createContrat.mutateAsync({
      site_id: site.id,
      site_nom: site.nom,
      fournisseur_compte_id: fournisseurId || null,
      fournisseur_nom: fournisseur?.nom ?? '',
      type_energie_id: typeEnergieId || null,
      type_energie: typeEnergie,
      statut_id: statutActif?.id ?? null,
      reference_fournisseur: referenceFournisseur || null,
      date_debut: dateDebut || null,
      date_fin: dateFin || null,
      duree_mois: dureeMois ? Number(dureeMois) : null,
      date_reception_souhaitee: dateReceptionSouhaitee || null,
      compteur_ids: compteurIds,
      compteurs: compteursChoisis,
      contact_signataire_id: contactSignataireId || null,
      contact_signataire_nom: contactSignataire ? `${contactSignataire.prenom} ${contactSignataire.nom}` : undefined,
      type_prix: typePrix || null,
      strategie_tarifaire: strategieTarifaire,
      prix_molecule_eur_mwh: prixMolecule ? Number(prixMolecule) : null,
      clauses,
    })
    setFeedback(result.persisted ? 'Contrat créé.' : 'Contrat ajouté localement (non synchronisé avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouveau contrat" description="Contrat de fourniture d'énergie pour un site.">
      <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
        <ExtractDocumentButton onExtracted={handleExtracted} />
        <FormField label="Site">
          <Select value={siteId} onChange={(e) => { setSiteId(e.target.value); setCompteurIds([]); setContactSignataireId('') }} required>
            <option value="">Sélectionner un site…</option>
            {sites?.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </Select>
        </FormField>
        <FormField label="Fournisseur">
          <Select value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)}>
            <option value="">Sélectionner…</option>
            {[...ZONE_ORDER_CONTRAT, 'autre'].map((zone) => {
              const list = fournisseursParZone.get(zone) ?? []
              if (list.length === 0) return null
              return (
                <optgroup key={zone} label={ZONE_LABEL_CONTRAT[zone]}>
                  {list.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </optgroup>
              )
            })}
          </Select>
        </FormField>
        <FormField label="Énergie">
          <Select value={typeEnergieId} onChange={(e) => { setTypeEnergieId(e.target.value); setTypePrix('') }} required>
            <option value="">Sélectionner…</option>
            {energies.map((en) => <option key={en.id} value={en.id}>{en.libelle}</option>)}
          </Select>
        </FormField>
        {typeEnergieId && (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Type de prix">
              <Select value={typePrix} onChange={(e) => setTypePrix(e.target.value)} required>
                <option value="">Sélectionner…</option>
                {optionsTypePrix.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </FormField>
            <FormField label="Stratégie tarifaire">
              <Select value={strategieTarifaire} onChange={(e) => setStrategieTarifaire(e.target.value as 'marge_fixe' | 'prix_cible')} disabled={typePrix !== 'Fixe'}>
                <option value="marge_fixe">Marge fixe</option>
                <option value="prix_cible" disabled={typePrix !== 'Fixe'}>Prix cible</option>
              </Select>
            </FormField>
          </div>
        )}
        <FormField label={strategieTarifaire === 'prix_cible' ? 'Prix cible (€/MWh)' : 'Marge (€/MWh)'}>
          <Input type="number" step="0.01" value={prixMolecule} onChange={(e) => setPrixMolecule(e.target.value)} required />
        </FormField>
        <FormField label="Référence fournisseur">
          <Input value={referenceFournisseur} onChange={(e) => setReferenceFournisseur(e.target.value)} />
        </FormField>
        <FormField label="Date de réception souhaitée">
          <Input type="date" value={dateReceptionSouhaitee} onChange={(e) => setDateReceptionSouhaitee(e.target.value)} />
          {receptionInvalide ? (
            <p className="mt-1 text-xs text-amber-700">{receptionInvalide}</p>
          ) : (
            <p className="mt-1 text-xs text-navy-400">Jour ouvré (lundi-vendredi), à partir d'aujourd'hui.</p>
          )}
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Date de début">
            <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
            {compteurIds.length === 1 && <p className="mt-1 text-xs text-navy-400">Préremplie à l'échéance du PDL + 1 jour.</p>}
          </FormField>
          <FormField label="Durée (mois)">
            <Input type="number" min={1} value={dureeMois} onChange={(e) => setDureeMois(e.target.value)} />
          </FormField>
        </div>
        <div className="rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-xs text-navy-500">
          Date de fin (calculée) : <span className="font-medium text-navy-700">{dateFin ? new Date(dateFin).toLocaleDateString('fr-FR') : '—'}</span>
        </div>
        {siteId && contactsDuSite.length > 0 && (
          <FormField label="Contact signataire (optionnel)">
            <Select value={contactSignataireId} onChange={(e) => setContactSignataireId(e.target.value)}>
              <option value="">Sélectionner…</option>
              {contactsDuSite.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </Select>
          </FormField>
        )}
        {siteId && (
          <FormField label="Compteurs couverts">
            {compteursDuSite.length === 0 ? (
              <p className="text-xs text-navy-400">Ce site n'a aucun compteur.</p>
            ) : (
              <div className={`max-h-32 space-y-1 overflow-y-auto rounded-lg border p-2 ${compteurIds.length === 0 ? 'border-amber-500 bg-amber-50/40' : 'border-navy-200'}`}>
                {compteursDuSite.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-navy-700">
                    <input type="checkbox" checked={compteurIds.includes(c.id)} onChange={() => toggleCompteur(c.id)} />
                    {c.numero_pdl} — {c.utilisation}
                  </label>
                ))}
              </div>
            )}
            {compteurIds.length === 0 && compteursDuSite.length > 0 && (
              <p className="mt-1 text-xs text-amber-700">Sélectionne au moins un compteur : un contrat sans périmètre ne couvre rien.</p>
            )}
          </FormField>
        )}
        <FormField label="Clauses">
          <div className="grid grid-cols-2 gap-1.5">
            {CLAUSES.map((c) => {
              const fournisseurActuel = fournisseurs.find((f) => f.id === fournisseurId)
              const recommandee = c.key === 'clause_renegociation_anticipee' && fournisseurActuel
                && FOURNISSEURS_RENEGOCIATION_RECOMMANDEE.some((n) => fournisseurActuel.nom.toUpperCase().includes(n))
              return (
                <label key={c.key} className="flex items-center gap-2 text-sm text-navy-700">
                  <input type="checkbox" checked={!!clauses[c.key]} onChange={(e) => setClauses((prev) => ({ ...prev, [c.key]: e.target.checked }))} />
                  {c.label}
                  {recommandee && <span className="text-[10px] text-kiwi-700">— recommandée pour {fournisseurActuel!.nom}</span>}
                </label>
              )
            })}
          </div>
        </FormField>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 border-t border-navy-100 pt-3">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createContrat.isPending || !canSubmit}>Créer le contrat</Button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * ENCAPSULABLE DANS LA PAGE PATRIMOINE. `sansEntete` masque la barre du haut quand cette liste est
 * affichée comme onglet de /patrimoine (diapositive 8 de Michel : « la page Patrimoine rassemble ces
 * objets et permet de naviguer du compte jusqu'au compteur et au contrat »). L'en-tête de page, lui,
 * reste : il porte le bouton de création et la phrase qui dit ce qu'est l'objet.
 */
export default function Contrats({ sansEntete }: { sansEntete?: boolean }) {
  const { data: contrats, isLoading } = useContrats()
  const { data: statutsRef } = useReferenceTable('statuts_contrats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_CONTRATS
  const [showCreate, setShowCreate] = useState(false)
  const [statutFilter, setStatutFilter] = useState('')
  /**
   * LES 549 CONTRATS SANS FOURNISSEUR DEVIENNENT TRAVAILLABLES.
   *
   * Le trou est connu depuis plusieurs jours et la question posée à Michel est restée sans réponse.
   * En attendant, ces contrats étaient noyés dans les 1 600 autres : on savait qu'ils existaient sans
   * pouvoir les ouvrir un par un. Un filtre suffit à en faire une liste d'appels — c'est exactement
   * ce que Michel demande cette semaine, que le commercial sache ce qu'il a à faire.
   *
   * Le compte s'affiche sur le bouton : un filtre qui ne dit pas combien il cache n'incite personne
   * à cliquer dessus.
   */
  const [sansFournisseur, setSansFournisseur] = useState(false)
  const nbSansFournisseur = (contrats ?? []).filter((c) => !c.fournisseur_nom).length

  const contratsFiltresParStatut = (() => {
    let liste = statutFilter ? contrats?.filter((c) => c.statut === statutFilter) : contrats
    if (sansFournisseur) liste = liste?.filter((c) => !c.fournisseur_nom)
    return liste
  })()

  const { query, setQuery, sortKey, setSortKey, items: filteredContrats } = useListControls(contratsFiltresParStatut, {
    searchFields: (c) => [c.fournisseur_nom, c.site_nom, c.reference_fournisseur, c.id_salesforce],
    sorters: {
      site_nom: (a, b) => a.site_nom.localeCompare(b.site_nom),
      fournisseur_nom: (a, b) => a.fournisseur_nom.localeCompare(b.fournisseur_nom),
      date_debut: (a, b) => (a.date_debut ?? '').localeCompare(b.date_debut ?? ''),
      date_fin: (a, b) => (a.date_fin ?? '').localeCompare(b.date_fin ?? ''),
    },
    defaultSort: 'site_nom',
  })

  const tranche = useTranchesAffichage(filteredContrats, `${query}|${sortKey}`)

  return (
    <div>
      {!sansEntete && <Topbar title="Contrats" />}
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Contrats"
          description="Contrats de fourniture d'énergie liés à chaque site — électricité et gaz."
          actions={
            // Point d'entrée unique, comme Tools : une demande de contrat naît d'une opportunité,
            // jamais d'un site isolé. Ce bouton reste pour saisir un contrat déjà signé hors
            // circuit (reprise, contrat direct fournisseur), qui n'existe pas dans Tools.
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />Saisir un contrat existant
            </Button>
          }
        />
        <p className="mb-4 flex items-start gap-1.5 text-xs text-navy-400">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Une <span className="font-medium text-navy-600">demande</span> de contrat se crée depuis la recommandation, une fois la cotation faite — elle embarque alors tous ses points de livraison.
        </p>

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un fournisseur, un site…" count={filteredContrats?.length}>
          <Select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} className="w-auto">
            <option value="">Tous les statuts</option>
            {statuts.map((s) => <option key={s.id} value={s.code}>{s.libelle}</option>)}
          </Select>
          {nbSansFournisseur > 0 && (
            <button
              type="button"
              onClick={() => setSansFournisseur((v) => !v)}
              title="Contrats dont le fournisseur n'est pas renseigné : la donnée est à compléter avant de pouvoir comparer une offre."
              className={
                sansFournisseur
                  ? 'shrink-0 rounded-kw-md border border-ink-800 bg-ink-800 px-2.5 py-1.5 text-kw-xs font-semibold text-white'
                  : 'shrink-0 rounded-kw-md border border-kw-border bg-white px-2.5 py-1.5 text-kw-xs font-semibold text-kw-meta hover:bg-kw-subtle'
              }
            >
              Sans fournisseur
              <span className={sansFournisseur ? 'ml-1.5 font-mono text-white/70' : 'ml-1.5 font-mono text-kw-meta'}>
                {nbSansFournisseur}
              </span>
            </button>
          )}
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            <option value="site_nom">Trier par site</option>
            <option value="fournisseur_nom">Trier par fournisseur</option>
            <option value="date_debut">Trier par date de début</option>
            <option value="date_fin">Trier par date de fin</option>
          </Select>
        </ListToolbar>

        {!isLoading && contrats && contrats.length > 0 && filteredContrats?.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">Aucun contrat ne correspond à la recherche.</p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {tranche.visibles.map((c) => {
            const label = statuts.find((s) => s.code === c.statut)?.libelle ?? c.statut
            const Icon = c.type_energie === 'gaz' ? Flame : Zap
            return (
              <Card
                key={c.id}
                to={`/contrats/${c.id}`}
                className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', c.type_energie === 'gaz' ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-500')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      {c.id_salesforce && <p className="font-mono text-[11px] text-navy-400">{c.id_salesforce}</p>}
                      <p className="font-display font-medium text-navy-800">{c.fournisseur_nom}</p>
                    </div>
                  </div>
                  <Badge tone={STATUT_CONTRAT_TONE[c.statut] ?? 'neutral'}>{label}</Badge>
                </div>
                <div className="mt-4 space-y-1 text-xs text-navy-500">
                  <p>Site : <EntityLink to={`/sites/${c.site_id}`}>{c.site_nom}</EntityLink></p>
                  {c.reference_fournisseur && <p>Référence : {c.reference_fournisseur}</p>}
                  <p>
                    {c.date_debut ? new Date(c.date_debut).toLocaleDateString('fr-FR') : '—'}
                    {' → '}
                    {c.date_fin ? new Date(c.date_fin).toLocaleDateString('fr-FR') : '—'}
                  </p>
                  {c.compteurs.length > 0 && <p>{c.compteurs.length} compteur{c.compteurs.length > 1 ? 's' : ''} couvert{c.compteurs.length > 1 ? 's' : ''}</p>}
                  {/* LA RECONDUCTION TACITE, DANS LA LISTE. Une échéance qu'il faut ouvrir chaque
                      fiche pour découvrir n'alerte personne : sur les 465 contrats qui portent cette
                      date, 11 tombent dans les six prochains mois. C'est ici qu'on les voit. */}
                  {(() => {
                    const alerte = alerteTacite(c.date_declenchement_tacite, c.jours_alerte_tacite)
                    if (!alerte) return null
                    return (
                      <p className={cn('font-semibold', alerte.passee ? 'text-red-600' : 'text-amber-700')}>
                        {alerte.texte}
                      </p>
                    )
                  })()}
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
            libelle="contrats"
          />
        </div>
        {!isLoading && contrats?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-navy-400">
            <FileSignature className="h-8 w-8" />
            <p className="text-sm">Aucun contrat pour le moment.</p>
          </div>
        )}
      </div>
      {showCreate && <CreateContratDialog open={showCreate} onClose={() => setShowCreate(false)} />}
    </div>
  )
}
