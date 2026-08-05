import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Mail, Lock, Pencil, Trash2, Sparkle, RefreshCw, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { EtapeStepper } from '@/components/ui/etape-stepper'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import {
  useRecommandations,
  useUpdateRecommandation,
  useDeleteRecommandation,
  useAjouterFournisseurConsulte,
  useAjouterSuiviConsultation,
  useCreateVersion,
} from '@/lib/data/recommandations'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useContacts } from '@/lib/data/contacts'
import { useComptes } from '@/lib/data/comptes'
import { useCompteurs } from '@/lib/data/compteurs'
import { useEligibilityRules } from '@/lib/data/eligibilityRules'
import { useMappingRules } from '@/lib/data/mappingRules'
import { checkEligibility, type EligibilityResult } from '@/lib/eligibility'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { sendEmail, useGmailConnection, connectGmail } from '@/lib/data/gmail'
import { ConnectionGate } from '@/components/ui/connection-gate'
import { FALLBACK_ETAPES_RECOMMANDATION, FALLBACK_STATUTS_VERSIONS, STATUT_VERSION_TONE } from '@/lib/referenceFallbacks'
import { useGoBack } from '@/lib/useGoBack'
import { ZONE_ORDER_COTATION, ZONE_LABEL_COTATION, zoneDuFournisseur } from '@/lib/fournisseurZones'
import { computeEstimatedCommission } from '@/lib/commission'
import type { Recommandation, VersionRecommandation, Optimisation, FournisseurConsulte } from '@/types/domain'
const MISE_EN_CONCURRENCE = 'MISE_EN_CONCURRENCE'

const DUREES_PRESETS = [12, 24, 36, 48, 60]

function CotationWizard({ open, onClose, reco }: { open: boolean; onClose: () => void; reco: Recommandation }) {
  const { data: comptes } = useComptes()
  const { data: compteurs } = useCompteurs()
  const { data: eligibilityRules } = useEligibilityRules()
  const { data: mappingRules } = useMappingRules()
  const { data: motifsRef } = useReferenceTable('motifs_versions_recommandation')
  const { data: statutsVersionsRef } = useReferenceTable('statuts_versions_recommandation')
  const { data: typesOptimisationsRef } = useReferenceTable('types_optimisations')
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const createVersion = useCreateVersion()
  const gmail = useGmailConnection()

  const estActualisation = reco.versions.length > 0
  const [durees, setDurees] = useState<number[]>([36])
  const [dureeLibre, setDureeLibre] = useState('')
  const [typesPrix, setTypesPrix] = useState<string[]>(['Fixe'])
  const [dateSouhaitee, setDateSouhaitee] = useState('')
  const [fournisseurIds, setFournisseurIds] = useState<string[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const compte = comptes?.find((c) => c.id === reco.compte_id)
  const compteursDeLaReco = (compteurs ?? []).filter((c) => (reco.compteur_ids ?? []).includes(c.id))

  function toggleDuree(d: number) {
    setDurees((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : prev.length < 3 ? [...prev, d] : prev))
  }
  // Durée hors préréglages : Tools propose 12/24/36/48/60 + une saisie libre « Autre » avec un
  // bouton « + », pour les durées négociées au cas par cas (18 mois, 30 mois…).
  const dureesHorsPresets = durees.filter((d) => !DUREES_PRESETS.includes(d)).sort((a, b) => a - b)
  const dureeLibreNum = Number(dureeLibre)
  const dureeLibreValide =
    dureeLibre.trim() !== '' &&
    Number.isInteger(dureeLibreNum) &&
    dureeLibreNum >= 1 &&
    dureeLibreNum <= 120 &&
    !durees.includes(dureeLibreNum) &&
    durees.length < 3
  function ajouterDureeLibre() {
    if (!dureeLibreValide) return
    setDurees((prev) => [...prev, dureeLibreNum])
    setDureeLibre('')
  }
  function toggleTypePrix(t: string) {
    setTypesPrix((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }
  function toggleFournisseur(id: string) {
    setFournisseurIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const resultats: EligibilityResult[] = useMemo(() => {
    if (!compte) return []
    const fournisseurs = (comptes ?? []).filter((c) => c.type_compte === 'fournisseur' && c.fournisseur_actif !== false)
    return fournisseurs.map((f) =>
      checkEligibility(
        f,
        compte,
        compteursDeLaReco,
        { durations: durees, desiredDate: dateSouhaitee ? new Date(dateSouhaitee) : undefined, requestType: estActualisation ? 'actualisation' : 'premiere_demande' },
        eligibilityRules ?? [],
        mappingRules ?? [],
      ),
    )
  }, [compte, comptes, compteursDeLaReco, durees, dateSouhaitee, estActualisation, eligibilityRules, mappingRules])

  const commissionEstimee = useMemo(() => computeEstimatedCommission(compteursDeLaReco, durees), [compteursDeLaReco, durees])

  const parZone = useMemo(() => {
    const map = new Map<string, EligibilityResult[]>()
    for (const r of resultats) {
      const zone = zoneDuFournisseur(r.fournisseur.intermediary, r.fournisseur.partnership)
      const list = map.get(zone) ?? []
      list.push(r)
      map.set(zone, list)
    }
    return map
  }, [resultats])

  // Auto-éviction : si un fournisseur choisi devient inéligible (changement de durée/date), on le
  // retire automatiquement de la sélection avec un toast d'avertissement -- même comportement et
  // même message que StepSuppliers.tsx dans Tools.
  useEffect(() => {
    setFournisseurIds((prev) => {
      const kept = prev.filter((id) => resultats.find((r) => r.fournisseur.id === id)?.eligible)
      const removedCount = prev.length - kept.length
      if (removedCount > 0) {
        showToast(`${removedCount} fournisseur${removedCount > 1 ? 's' : ''} retiré${removedCount > 1 ? 's' : ''} de la sélection (devenu${removedCount > 1 ? 's' : ''} inéligible${removedCount > 1 ? 's' : ''})`)
      }
      return kept
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultats])

  function reset() {
    setDurees([36])
    setDureeLibre('')
    setTypesPrix(['Fixe'])
    setDateSouhaitee('')
    setFournisseurIds([])
    setFeedback(null)
  }

  async function handleValider() {
    const motif = (motifsRef ?? []).find((m) => /actualis/i.test(m.code)) ?? (motifsRef ?? [])[0]
    const statutBrouillon = (statutsVersionsRef ?? []).find((s) => s.code === 'BROUILLON')
    const typeOptim = (typesOptimisationsRef ?? []).find((t) => t.code === MISE_EN_CONCURRENCE)
    const etapeEnAnalyse = (etapesRef ?? []).find((e) => e.code === 'EN_ANALYSE')

    await createVersion.mutateAsync({
      recommandation_id: reco.id,
      compteur_ids: reco.compteur_ids ?? [],
      motif_id: motif?.id ?? null,
      statut_brouillon_id: statutBrouillon?.id ?? null,
      type_optimisation_mise_en_concurrence_id: typeOptim?.id ?? null,
      fournisseur_ids: fournisseurIds,
      resume: `Durée${durees.length > 1 ? 's' : ''} ${durees.join('/')} mois — ${typesPrix.join(', ')} — ${fournisseurIds.length} fournisseur${fournisseurIds.length > 1 ? 's' : ''} consulté${fournisseurIds.length > 1 ? 's' : ''} — commission estimée ${Math.round(commissionEstimee).toLocaleString('fr-FR')} €`,
      contexte_et_hypotheses: dateSouhaitee ? `Date souhaitée : ${new Date(dateSouhaitee).toLocaleDateString('fr-FR')}` : null,
      etape_en_analyse_id: etapeEnAnalyse?.id ?? null,
    })
    setFeedback('Cotation créée.')
    setTimeout(() => { reset(); onClose() }, 700)
  }

  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onClose() }}
      title={estActualisation ? 'Actualiser la cotation' : 'Nouvelle cotation'}
      description="Sélectionne les durées, la date souhaitée puis les fournisseurs à consulter — l'éligibilité est vérifiée automatiquement par PDL."
      className="max-w-2xl"
    >
      <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
      {/* Garde-fou de connexion avant cotation -- Tools exige Gmail à cet endroit (les demandes de
          cotation partent depuis l'adresse du commercial, pas d'une boîte partagée). Dans Kimatch
          l'envoi est une action séparée sur la version, donc la création reste possible sans : la
          sortie « Créer la cotation sans email » est explicite plutôt qu'implicite. */}
      <ConnectionGate
        action="une demande de cotation"
        connexions={[
          {
            nom: 'Gmail',
            raison: 'Nécessaire pour envoyer les notifications de cotation depuis votre adresse.',
            connecte: !!gmail.data,
            chargement: gmail.isLoading,
            onConnect: () => { connectGmail().catch(() => {}) },
            connectLabel: 'Connecter Gmail',
          },
        ]}
        autoriserSkip
        skipLabel="Créer la cotation sans email"
      >
        <FormField label="Durées (jusqu'à 3)">
          <div className="flex flex-wrap items-center gap-2">
            {DUREES_PRESETS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDuree(d)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${durees.includes(d) ? 'border-kiwi-500 bg-kiwi-50 text-kiwi-700' : 'border-navy-200 text-navy-600 hover:bg-navy-50'}`}
              >
                {d} mois
              </button>
            ))}
            {dureesHorsPresets.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDuree(d)}
                title="Retirer cette durée"
                className="inline-flex items-center gap-1 rounded-full border border-kiwi-500 bg-kiwi-50 px-3 py-1 text-sm text-kiwi-700"
              >
                {d} mois <X className="h-3 w-3" />
              </button>
            ))}
            <span className="inline-flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={120}
                value={dureeLibre}
                onChange={(e) => setDureeLibre(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterDureeLibre() } }}
                placeholder="Autre"
                className="h-8 w-20 rounded-full text-center text-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={ajouterDureeLibre} disabled={!dureeLibreValide} className="h-8 w-8 rounded-full p-0">
                +
              </Button>
            </span>
          </div>
          {durees.length >= 3 && (
            <p className="mt-1 text-[11px] text-navy-400">Maximum atteint — retire une durée pour en ajouter une autre.</p>
          )}
        </FormField>
        <p className="rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-xs text-navy-500">
          Commission estimée : <span className="font-medium text-navy-700">{commissionEstimee.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</span>
          <span className="text-navy-400"> (C5 : forfait 140 €/PDL · autres : conso/12 × durée max × 3)</span>
        </p>
        <FormField label="Type de prix">
          <div className="flex gap-4">
            {['Fixe', 'Indexé'].map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-navy-700">
                <input type="checkbox" checked={typesPrix.includes(t)} onChange={() => toggleTypePrix(t)} /> {t}
              </label>
            ))}
          </div>
        </FormField>
        <FormField label="Date souhaitée">
          <Input type="date" value={dateSouhaitee} onChange={(e) => setDateSouhaitee(e.target.value)} />
        </FormField>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">
              Fournisseurs à consulter
              {resultats.length > 0 && (
                <span className="ml-1.5 normal-case text-navy-400">
                  ({resultats.filter((r) => r.eligible).length} éligible{resultats.filter((r) => r.eligible).length > 1 ? 's' : ''} · {fournisseurIds.length} sélectionné{fournisseurIds.length > 1 ? 's' : ''})
                </span>
              )}
            </p>
            {resultats.some((r) => r.eligible) && (
              <button
                type="button"
                className="text-xs font-medium text-kiwi-700 hover:underline"
                onClick={() => {
                  const eligibleIds = resultats.filter((r) => r.eligible).map((r) => r.fournisseur.id)
                  const toutSelectionne = eligibleIds.length > 0 && eligibleIds.every((id) => fournisseurIds.includes(id))
                  setFournisseurIds(toutSelectionne ? [] : eligibleIds)
                }}
              >
                {resultats.filter((r) => r.eligible).every((r) => fournisseurIds.includes(r.fournisseur.id)) ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            )}
          </div>
          <div className="space-y-3">
            {[...ZONE_ORDER_COTATION, 'autre'].map((zone) => {
              const list = parZone.get(zone) ?? []
              if (list.length === 0) return null
              return (
                <div key={zone}>
                  <p className="mb-1 text-[11px] font-semibold text-navy-500">{ZONE_LABEL_COTATION[zone] ?? 'Autre'}</p>
                  <div className="space-y-1 rounded-lg border border-navy-200 p-2">
                    {list.map((r) => (
                      <label key={r.fournisseur.id} className={`flex items-start gap-2 rounded-md p-1.5 text-sm ${r.eligible ? 'text-navy-700 hover:bg-navy-50' : 'text-navy-300'}`}>
                        <input type="checkbox" disabled={!r.eligible} checked={fournisseurIds.includes(r.fournisseur.id)} onChange={() => toggleFournisseur(r.fournisseur.id)} className="mt-0.5" />
                        <span className="flex-1">
                          {r.fournisseur.nom}
                          {r.eligible ? (
                            <CheckCircle2 className="ml-1.5 inline h-3 w-3 text-kiwi-600" />
                          ) : (
                            <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] text-amber-600" title={r.reasons.join(' · ')}>
                              <AlertTriangle className="h-3 w-3" /> {r.reasons[0]}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
            {resultats.length === 0 && <p className="text-xs text-navy-400">Aucun fournisseur actif configuré.</p>}
          </div>
        </div>

        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 border-t border-navy-100 pt-3">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="button" onClick={handleValider} disabled={createVersion.isPending || durees.length === 0 || fournisseurIds.length === 0}>
            {estActualisation ? 'Actualiser' : 'Créer la cotation'}
          </Button>
        </div>
      </ConnectionGate>
      </div>
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </Dialog>
  )
}

const PRIORITE_LABEL: Record<number, string> = { 1: 'Haute', 2: 'Normale', 3: 'Basse' }

function EnvoyerEmailDialog({
  open,
  onClose,
  reco,
  version,
  defaultEmail,
}: {
  open: boolean
  onClose: () => void
  reco: Recommandation
  version: VersionRecommandation
  defaultEmail: string
}) {
  const [to, setTo] = useState(defaultEmail)
  const [subject, setSubject] = useState(`KiWee Énergie — ${reco.titre}${version.nom ? ` (${version.nom})` : ''}`)
  const [text, setText] = useState(
    `Bonjour,\n\nVoici notre recommandation "${reco.titre}"${version.nom ? ` (${version.nom})` : ''} :\n${version.resume}\n\nCordialement,`,
  )
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  async function envoyer() {
    setSending(true)
    setFeedback(null)
    try {
      await sendEmail({ to, subject, text })
      setFeedback('Email envoyé ✓')
      setTimeout(onClose, 1200)
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Envoyer par email" description="Envoie cette version au destinataire choisi depuis votre propre compte Gmail.">
      <div className="space-y-3">
        <FormField label="Destinataire">
          <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@exemple.fr" />
        </FormField>
        <FormField label="Objet">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </FormField>
        <FormField label="Message">
          <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        </FormField>
        {feedback && <p className="text-xs text-navy-600">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="button" onClick={envoyer} disabled={sending || !to}>
            {sending ? 'Envoi…' : 'Envoyer'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function AjouterFournisseurConsulteDialog({
  open,
  onClose,
  optimisation,
}: {
  open: boolean
  onClose: () => void
  optimisation: Optimisation | null
}) {
  const { data: comptes } = useComptes()
  const fournisseurs = (comptes ?? []).filter((c) => c.type_compte === 'fournisseur')
  const ajouter = useAjouterFournisseurConsulte()

  const [fournisseurId, setFournisseurId] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setFournisseurId('')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fournisseur = fournisseurs.find((f) => f.id === fournisseurId)
    if (!optimisation || !fournisseur) return
    try {
      await ajouter.mutateAsync({ optimisationId: optimisation.id, fournisseurCompteId: fournisseur.id, fournisseurNom: fournisseur.nom })
      reset()
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Ajouter un fournisseur consulté" description="Suivi de mise en concurrence — qui a été sollicité pour cette optimisation.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Fournisseur">
          <Select value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)} required>
            <option value="">Sélectionner…</option>
            {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </Select>
        </FormField>
        {feedback && <p className="text-xs text-red-600">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={ajouter.isPending}>Ajouter</Button>
        </div>
      </form>
    </Dialog>
  )
}

function AjouterSuiviDialog({
  open,
  onClose,
  optimisationId,
  fournisseurConsulte,
}: {
  open: boolean
  onClose: () => void
  optimisationId: string | null
  fournisseurConsulte: FournisseurConsulte | null
}) {
  const { data: statutsRef } = useReferenceTable('statuts_consultations_fournisseurs')
  const ajouter = useAjouterSuiviConsultation()

  const [statutId, setStatutId] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setStatutId('')
    setCommentaire('')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const statut = (statutsRef ?? []).find((s) => s.id === statutId)
    if (!fournisseurConsulte || !optimisationId || !statut) return
    try {
      await ajouter.mutateAsync({
        optimisationId,
        optimisationFournisseurId: fournisseurConsulte.id,
        statutId: statut.id,
        statutLibelle: statut.libelle,
        commentaire: commentaire || null,
      })
      reset()
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onClose() }}
      title="Suivi de consultation"
      description={fournisseurConsulte ? `Nouvel événement pour ${fournisseurConsulte.fournisseur_nom}.` : undefined}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Statut">
          <Select value={statutId} onChange={(e) => setStatutId(e.target.value)} required>
            <option value="">Sélectionner…</option>
            {(statutsRef ?? []).map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
          </Select>
        </FormField>
        <FormField label="Commentaire">
          <Textarea rows={3} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Optionnel" />
        </FormField>
        {feedback && <p className="text-xs text-red-600">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={ajouter.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function RecommandationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: recommandations } = useRecommandations()
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const { data: statutsVersionsRef } = useReferenceTable('statuts_versions_recommandation')
  const { data: contacts } = useContacts()
  const [emailDialogVersion, setEmailDialogVersion] = useState<VersionRecommandation | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [ajouterFournisseurFor, setAjouterFournisseurFor] = useState<Optimisation | null>(null)
  const [showCotationWizard, setShowCotationWizard] = useState(false)
  const [suiviFor, setSuiviFor] = useState<{ optimisationId: string; fc: FournisseurConsulte } | null>(null)
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const statutsVersions = statutsVersionsRef && statutsVersionsRef.length > 0 ? statutsVersionsRef : FALLBACK_STATUTS_VERSIONS
  const reco = recommandations?.find((r) => r.id === id)
  const canManage = useCanManage(reco?.proprietaire_id)
  const deleteRecommandation = useDeleteRecommandation()
  const goBack = useGoBack('/recommandations')
  const contactPrincipal = contacts?.find((c) => c.compte_id === reco?.compte_id && c.contact_principal)

  async function handleDelete() {
    if (!reco) return
    await deleteRecommandation.mutateAsync(reco.id)
    navigate('/recommandations')
  }

  return (
    <div>
      <Topbar crumb="Recommandations" title={reco?.titre ?? 'Recommandation'} />
      <div className="p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux recommandations
        </Button>

        {!reco ? (
          <p className="text-sm text-navy-500">Recommandation introuvable.</p>
        ) : (
          <>
            <Card className="mb-4 p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                    <Sparkle className="h-5 w-5" />
                  </span>
                  <p className="font-display text-lg font-semibold text-navy-900">{reco.titre}</p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Modifier
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </Button>
                  </div>
                )}
              </div>
              <EtapeStepper steps={etapes} currentCode={reco.etape} />
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Dossier</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><span className="text-navy-400">Compte :</span> <EntityLink to={`/comptes/${reco.compte_id}`}>{reco.compte_nom}</EntityLink></p>
                  <p>
                    <span className="text-navy-400">Sites :</span>{' '}
                    {reco.sites.map((s, i) => (
                      <span key={s.id}>
                        {i > 0 && ', '}
                        <EntityLink to={`/sites/${s.id}`}>{s.nom}</EntityLink>
                      </span>
                    ))}
                  </p>
                  {reco.origine && <p><span className="text-navy-400">Origine :</span> {reco.origine}</p>}
                  <p><span className="text-navy-400">Priorité :</span> {PRIORITE_LABEL[reco.priorite] ?? reco.priorite}</p>
                  <p><span className="text-navy-400">Conseiller :</span> {reco.conseiller}</p>
                  <p><span className="text-navy-400">Créée le :</span> {new Date(reco.date_creation).toLocaleDateString('fr-FR')}</p>
                  {reco.type_energie && <p><span className="text-navy-400">Énergie :</span> {reco.type_energie === 'gaz' ? 'Gaz' : 'Électricité'}</p>}
                  {reco.type_opportunite && <p><span className="text-navy-400">Type d'opportunité :</span> {reco.type_opportunite}</p>}
                  {reco.date_cloture && <p><span className="text-navy-400">Clôture visée :</span> {new Date(reco.date_cloture).toLocaleDateString('fr-FR')}</p>}
                  {reco.contact_signataire_id && (
                    <div className="space-y-1 rounded-lg bg-navy-50 p-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">Contact</p>
                      <p><EntityLink to={`/contacts/${reco.contact_signataire_id}`}>{reco.contact_signataire_nom}</EntityLink></p>
                      {reco.contact_signataire_email && <p className="text-xs text-navy-500">{reco.contact_signataire_email}</p>}
                      {reco.contact_signataire_telephone && <p className="text-xs text-navy-500">{reco.contact_signataire_telephone}</p>}
                    </div>
                  )}
                  {(reco.marge_brute != null || reco.marge_nette != null || reco.marge_nette_coeff != null || reco.marge_apporteur != null) && (
                    <div className="space-y-1 rounded-lg bg-navy-50 p-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">Marges</p>
                      {reco.marge_brute != null && <p><span className="text-navy-400">Marge brute :</span> {reco.marge_brute.toLocaleString('fr-FR')} €</p>}
                      {reco.marge_nette != null && <p><span className="text-navy-400">Marge nette :</span> {reco.marge_nette.toLocaleString('fr-FR')} €</p>}
                      {reco.marge_nette_coeff != null && <p><span className="text-navy-400">Marge nette avec coeff :</span> {reco.marge_nette_coeff.toLocaleString('fr-FR')} €</p>}
                      {reco.marge_apporteur != null && <p><span className="text-navy-400">Marge apporteur d'affaires :</span> {reco.marge_apporteur.toLocaleString('fr-FR')} €</p>}
                    </div>
                  )}
                  {reco.description && <p className="text-navy-600">{reco.description}</p>}
                  {reco.commentaire_interne && (
                    <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Note interne : {reco.commentaire_interne}</p>
                  )}
                  <HistoriqueDiscret tableNom="recommandations" ligneId={reco.id} />
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Historique des versions</CardTitle>
                  {canManage && (
                    <Button size="sm" onClick={() => setShowCotationWizard(true)}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      {reco.versions.length > 0 ? 'Actualiser' : 'Nouvelle cotation'}
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {reco.versions.length === 0 && (
                    <p className="text-sm text-navy-400">Aucune version produite pour le moment — analyse en cours.</p>
                  )}
                  {reco.versions.map((version) => {
                    const statutLabel = statutsVersions.find((s) => s.code === version.statut)?.libelle ?? version.statut
                    return (
                      <div key={version.id} className="rounded-lg border border-navy-100 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-navy-800">
                            {version.nom || 'Version'}
                            {version.est_figee && <Lock className="h-3 w-3 text-navy-400" />}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {version.version_actuelle && <Badge tone="kiwi">Actuelle</Badge>}
                            <Badge tone={STATUT_VERSION_TONE[version.statut] ?? 'neutral'}>{statutLabel}</Badge>
                          </div>
                        </div>
                        <p className="mt-1 text-sm text-navy-600">{version.resume}</p>
                        {version.contexte_et_hypotheses && <p className="mt-1 text-xs text-navy-500">{version.contexte_et_hypotheses}</p>}

                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-navy-400">
                          {version.economie_pourcentage !== null && (
                            <span>Économie : <span className="font-medium text-kiwi-700">{version.economie_pourcentage}%</span></span>
                          )}
                          {version.niveau_confiance !== null && <span>Confiance : {version.niveau_confiance}%</span>}
                          {version.date_presentation_client && (
                            <span>Présentée le {new Date(version.date_presentation_client).toLocaleDateString('fr-FR')}</span>
                          )}
                          {version.date_decision_client && (
                            <span>Décision le {new Date(version.date_decision_client).toLocaleDateString('fr-FR')}</span>
                          )}
                        </div>

                        <div className="mt-2 flex items-center justify-between text-xs text-navy-400">
                          <span>Motif : {version.motif_creation}</span>
                          {version.gains_estimes !== null && (
                            <span className="font-medium text-kiwi-700">Gain estimé : {version.gains_estimes.toLocaleString('fr-FR')} €</span>
                          )}
                        </div>
                        {version.contact_id && (
                          <div className="mt-1 text-xs text-navy-400">
                            Contact de la cotation : <EntityLink to={`/contacts/${version.contact_id}`}>{version.contact_nom}</EntityLink>
                          </div>
                        )}

                        {version.optimisations.length > 0 && (
                          <div className="mt-3 space-y-2 border-t border-navy-100 pt-3">
                            {version.optimisations.map((optimisation) => (
                              <div key={optimisation.id} className="pl-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-medium text-navy-600">{optimisation.nom || optimisation.type_optimisation}</p>
                                  {optimisation.est_retenue && <Badge tone="kiwi">Retenue</Badge>}
                                </div>
                                {optimisation.gain_estime_annuel !== null && (
                                  <p className="text-[11px] text-navy-500">
                                    Gain estimé : {optimisation.gain_estime_annuel.toLocaleString('fr-FR')} €/an
                                    {optimisation.roi_mois !== null ? ` · ROI ${optimisation.roi_mois} mois` : ''}
                                  </p>
                                )}
                                {optimisation.offres.length === 0 ? (
                                  <p className="pl-2 text-xs text-navy-400">Aucune offre pour cette optimisation.</p>
                                ) : (
                                  <div className="mt-1 space-y-1.5 pl-2">
                                    {optimisation.offres.map((offre) => (
                                      <div key={offre.id} className="rounded-md bg-navy-50 px-2.5 py-1.5">
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <p className="text-xs font-medium text-navy-800">{offre.fournisseur_nom}</p>
                                            <p className="text-[11px] text-navy-500">{offre.nom || offre.reference_offre}{offre.duree_mois ? ` · ${offre.duree_mois} mois` : ''}</p>
                                          </div>
                                          <div className="text-right">
                                            {offre.montant_annuel_ht !== null && (
                                              <p className="text-xs font-semibold text-navy-800">{offre.montant_annuel_ht.toLocaleString('fr-FR')} €/an</p>
                                            )}
                                            {offre.economie_pourcentage !== null && (
                                              <p className="text-[11px] font-medium text-kiwi-700">-{offre.economie_pourcentage}%</p>
                                            )}
                                          </div>
                                        </div>
                                        {offre.details_par_compteur.length > 0 && (
                                          <details className="mt-1.5">
                                            <summary className="cursor-pointer text-[10.5px] text-navy-400 hover:text-navy-600">
                                              Détail par compteur ({offre.details_par_compteur.length})
                                            </summary>
                                            <div className="mt-1 space-y-1 border-t border-navy-100 pt-1.5">
                                              {offre.details_par_compteur.map((d) => (
                                                <div key={d.id} className="flex items-center justify-between text-[11px]">
                                                  <span className="text-navy-600">{d.compteur_label || '—'}</span>
                                                  <span className="font-medium text-navy-700">
                                                    {d.cout_total_annuel_estime_ht !== null ? `${d.cout_total_annuel_estime_ht.toLocaleString('fr-FR')} €/an` : '—'}
                                                    {d.economie_pourcentage !== null ? ` · -${d.economie_pourcentage}%` : ''}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </details>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {optimisation.type_optimisation_code === MISE_EN_CONCURRENCE && (
                                  <div className="mt-2 border-t border-navy-100 pt-2">
                                    <div className="flex items-center justify-between">
                                      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-navy-400">Fournisseurs consultés</p>
                                      <button
                                        type="button"
                                        onClick={() => setAjouterFournisseurFor(optimisation)}
                                        className="text-[11px] font-medium text-kiwi-700 hover:underline"
                                      >
                                        + Ajouter
                                      </button>
                                    </div>
                                    {optimisation.fournisseurs_consultes.length === 0 ? (
                                      <p className="pl-2 text-xs text-navy-400">Aucun fournisseur consulté pour l'instant.</p>
                                    ) : (
                                      <div className="mt-1 space-y-1">
                                        {optimisation.fournisseurs_consultes.map((fc) => (
                                          <div key={fc.id} className="flex items-center justify-between rounded-md bg-navy-50 px-2.5 py-1.5">
                                            <div>
                                              <p className="text-xs font-medium text-navy-800">{fc.fournisseur_nom}</p>
                                              {fc.historique.length > 0 && (
                                                <details className="mt-0.5">
                                                  <summary className="cursor-pointer text-[10.5px] text-navy-400 hover:text-navy-600">
                                                    Historique ({fc.historique.length})
                                                  </summary>
                                                  <div className="mt-1 space-y-0.5 border-t border-navy-100 pt-1">
                                                    {fc.historique.map((h) => (
                                                      <p key={h.id} className="text-[11px] text-navy-500">
                                                        {new Date(h.date_evenement).toLocaleDateString('fr-FR')} — {h.statut}
                                                        {h.commentaire ? ` · ${h.commentaire}` : ''}
                                                      </p>
                                                    ))}
                                                  </div>
                                                </details>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                              {fc.statut_actuel && <Badge tone="neutral">{fc.statut_actuel}</Badge>}
                                              <button
                                                type="button"
                                                onClick={() => setSuiviFor({ optimisationId: optimisation.id, fc })}
                                                className="text-[11px] font-medium text-kiwi-700 hover:underline"
                                              >
                                                + Suivi
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="mt-2 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setEmailDialogVersion(version)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-kiwi-700 hover:underline"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Envoyer par email
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
      {reco && emailDialogVersion && (
        <EnvoyerEmailDialog
          open={!!emailDialogVersion}
          onClose={() => setEmailDialogVersion(null)}
          reco={reco}
          version={emailDialogVersion}
          defaultEmail={contactPrincipal?.email ?? ''}
        />
      )}
      {reco && (
        <EditRecommandationDialog open={editOpen} onClose={() => setEditOpen(false)} reco={reco} onSaved={() => {}} />
      )}
      {reco && (
        <CotationWizard open={showCotationWizard} onClose={() => setShowCotationWizard(false)} reco={reco} />
      )}
      <AjouterFournisseurConsulteDialog
        open={!!ajouterFournisseurFor}
        onClose={() => setAjouterFournisseurFor(null)}
        optimisation={ajouterFournisseurFor}
      />
      <AjouterSuiviDialog
        open={!!suiviFor}
        onClose={() => setSuiviFor(null)}
        optimisationId={suiviFor?.optimisationId ?? null}
        fournisseurConsulte={suiviFor?.fc ?? null}
      />
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer cette recommandation ?"
        description="Cette action est irréversible. Les versions, optimisations et offres liées à cette recommandation seront également perdues."
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
          <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={deleteRecommandation.isPending} onClick={handleDelete}>
            Supprimer définitivement
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function EditRecommandationDialog({
  open,
  onClose,
  reco,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  reco: Recommandation
  onSaved: () => void
}) {
  const updateRecommandation = useUpdateRecommandation()
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()
  const [titre, setTitre] = useState(reco.titre)
  const [description, setDescription] = useState(reco.description)
  const [commentaireInterne, setCommentaireInterne] = useState(reco.commentaire_interne)
  const [priorite, setPriorite] = useState(String(reco.priorite))
  const [proprietaireId, setProprietaireId] = useState(reco.proprietaire_id ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitre(reco.titre)
    setDescription(reco.description)
    setCommentaireInterne(reco.commentaire_interne)
    setPriorite(String(reco.priorite))
    setProprietaireId(reco.proprietaire_id ?? '')
    setFeedback(null)
  }, [open, reco])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateRecommandation.mutateAsync({
        id: reco.id,
        titre,
        description,
        commentaire_interne: commentaireInterne,
        priorite: Number(priorite),
        proprietaire_id: proprietaireId || null,
      })
      onSaved()
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modifier la recommandation" description="Mettre à jour les informations de la recommandation.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Titre">
          <Input value={titre} onChange={(e) => setTitre(e.target.value)} required />
        </FormField>
        <FormField label="Description">
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
        <FormField label="Commentaire interne">
          <Textarea rows={3} value={commentaireInterne} onChange={(e) => setCommentaireInterne(e.target.value)} />
        </FormField>
        <FormField label="Priorité">
          <Select value={priorite} onChange={(e) => setPriorite(e.target.value)}>
            <option value="1">{PRIORITE_LABEL[1]}</option>
            <option value="2">{PRIORITE_LABEL[2]}</option>
            <option value="3">{PRIORITE_LABEL[3]}</option>
          </Select>
        </FormField>
        {isAdmin && (
          <FormField label="Propriétaire">
            <Select value={proprietaireId} onChange={(e) => setProprietaireId(e.target.value)}>
              <option value="">Aucun</option>
              {profilsAdmin?.map((p) => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
            </Select>
          </FormField>
        )}
        {feedback && <p className="text-xs text-red-600">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={updateRecommandation.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}
