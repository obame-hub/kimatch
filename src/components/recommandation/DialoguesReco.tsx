import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { WizardConnectionGate } from '@/components/ui/connection-gate'
import {
  useAjouterFournisseurConsulte,
  useCreateVersion,
} from '@/lib/data/recommandations'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useComptes } from '@/lib/data/comptes'
import { useCompteurs } from '@/lib/data/compteurs'
import { useEligibilityRules } from '@/lib/data/eligibilityRules'
import { useMappingRules } from '@/lib/data/mappingRules'
import { checkEligibility, type EligibilityResult } from '@/lib/eligibility'
import { sendEmail } from '@/lib/data/gmail'
import { notifyEmail } from '@/lib/data/emailSettings'
import { ZONE_ORDER_COTATION, ZONE_LABEL_COTATION, zoneDuFournisseur } from '@/lib/fournisseurZones'
import { computeEstimatedCommission } from '@/lib/commission'
import { trouverParCode } from '@/lib/codeReferentiel'
import type { Recommandation, VersionRecommandation, Optimisation } from '@/types/domain'

/**
 * Dialogues de la fiche Recommandation.
 *
 * Sortis de `RecommandationDetail.tsx` le 17/08/2026 en portant la maquette : la page passait à
 * trois colonnes et quatre onglets, garder 600 lignes de dialogues dans le même fichier l'aurait
 * rendue illisible. Le code des dialogues est inchangé, à une exception près, signalée sur place :
 * le wizard de cotation accepte désormais un pré-remplissage, pour le geste « Dupliquer la
 * version » du design.
 */

const MISE_EN_CONCURRENCE = 'MISE_EN_CONCURRENCE'
const DUREES_PRESETS = [12, 24, 36, 48, 60]

/** Reprise d'une version existante, pour « Dupliquer V2 ». */
export interface PrefillCotation {
  dureesParCompteur: Record<string, number[]>
  typesPrix: string[]
  fournisseurIds: string[]
  dateSouhaitee: string
}

export function CotationWizard({
  open,
  onClose,
  reco,
  prefill,
  onCree,
}: {
  open: boolean
  onClose: () => void
  reco: Recommandation
  /** Valeurs de départ reprises d'une version précédente. `null` = version vierge. */
  prefill?: PrefillCotation | null
  /** Appelé avec la version créée : la fiche l'affiche aussitôt, sans attendre un rechargement. */
  onCree?: (versionId: string) => void
}) {
  const { data: comptes } = useComptes()
  const { data: compteurs } = useCompteurs()
  const { data: eligibilityRules } = useEligibilityRules()
  const { data: mappingRules } = useMappingRules()
  const { data: motifsRef } = useReferenceTable('motifs_versions_recommandation')
  const { data: statutsVersionsRef } = useReferenceTable('statuts_versions_recommandation')
  const { data: typesOptimisationsRef } = useReferenceTable('types_optimisations')
  const createVersion = useCreateVersion()

  const estActualisation = reco.versions.length > 0
  // Durées PAR PDL, comme Tools (StepCharacteristics.pdlDurations) : chaque compteur a sa propre
  // sélection de 1 à 3 durées, et `durees` en est l'union aplatie -- c'est elle que consomment le
  // moteur d'éligibilité et le calcul de commission.
  const [dureesParCompteur, setDureesParCompteur] = useState<Record<string, number[]>>({})
  const [dureeLibre, setDureeLibre] = useState<Record<string, string>>({})
  const [typesPrix, setTypesPrix] = useState<string[]>(['Fixe'])
  const [dateSouhaitee, setDateSouhaitee] = useState('')
  const [fournisseurIds, setFournisseurIds] = useState<string[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Recherche dans la liste des fournisseurs -- réclamée par William : 52 fournisseurs répartis en
  // zones, retrouver le bon à l'œil est pénible.
  const [rechercheFournisseur, setRechercheFournisseur] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const compte = comptes?.find((c) => c.id === reco.compte_id)
  // Mémoïsé : sans cela le tableau change d'identité à chaque rendu, ce qui invalide le `useMemo`
  // de `resultats` en cascade et relance l'effet d'auto-éviction sans fin.
  const compteursDeLaReco = useMemo(
    () => (compteurs ?? []).filter((c) => (reco.compteur_ids ?? []).includes(c.id)),
    [compteurs, reco.compteur_ids],
  )

  // Par défaut chaque PDL démarre à 36 mois (défaut historique de Kimatch, aligné sur le mandat) --
  // sauf duplication, où l'on reprend les durées de la version dupliquée.
  useEffect(() => {
    if (!open) return
    setDureesParCompteur((prev) => {
      const next = { ...prev }
      let change = false
      for (const c of compteursDeLaReco) {
        if (!next[c.id]) {
          next[c.id] = prefill?.dureesParCompteur[c.id]?.length ? [...prefill.dureesParCompteur[c.id]] : [36]
          change = true
        }
      }
      return change ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, compteursDeLaReco.map((c) => c.id).join(',')])

  // Le reste du pré-remplissage, posé une seule fois à l'ouverture. Les fournisseurs passent par le
  // même filtre d'éligibilité que d'habitude : ceux devenus inéligibles depuis la version d'origine
  // sont retirés par l'effet d'auto-éviction plus bas, avec son avertissement.
  useEffect(() => {
    if (!open || !prefill) return
    if (prefill.typesPrix.length > 0) setTypesPrix(prefill.typesPrix)
    if (prefill.dateSouhaitee) setDateSouhaitee(prefill.dateSouhaitee)
    if (prefill.fournisseurIds.length > 0) setFournisseurIds(prefill.fournisseurIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const durees = useMemo(
    () => [...new Set(Object.values(dureesParCompteur).flat())].sort((a, b) => a - b),
    [dureesParCompteur],
  )

  function toggleDuree(compteurId: string, d: number) {
    setDureesParCompteur((prev) => {
      const courant = prev[compteurId] ?? []
      if (courant.includes(d)) return { ...prev, [compteurId]: courant.filter((x) => x !== d) }
      if (courant.length >= 3) return prev
      return { ...prev, [compteurId]: [...courant, d].sort((a, b) => a - b) }
    })
  }

  // Saisie libre « Autre » + bouton « + » -- mêmes règles que `addCustomDuration` de Tools
  // (StepCharacteristics) : entier 1-60, refusé si déjà présent ou si les 3 durées sont prises,
  // saisie filtrée aux chiffres, validation à la touche Entrée.
  function ajouterDureeLibre(compteurId: string) {
    const num = parseInt(dureeLibre[compteurId] ?? '', 10)
    if (!num || num < 1 || num > 60) return
    const courant = dureesParCompteur[compteurId] ?? []
    if (courant.includes(num) || courant.length >= 3) return
    setDureesParCompteur((prev) => ({ ...prev, [compteurId]: [...courant, num].sort((a, b) => a - b) }))
    setDureeLibre((prev) => ({ ...prev, [compteurId]: '' }))
  }

  // Comme Tools : on ne peut pas continuer tant qu'un PDL n'a aucune durée.
  const toutesDureesRenseignees = compteursDeLaReco.every((c) => (dureesParCompteur[c.id] ?? []).length > 0)
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
    const q = rechercheFournisseur.trim().toLowerCase()
    const map = new Map<string, EligibilityResult[]>()
    for (const r of resultats) {
      if (q && !r.fournisseur.nom.toLowerCase().includes(q)) continue
      const zone = zoneDuFournisseur(r.fournisseur.intermediary, r.fournisseur.partnership)
      const list = map.get(zone) ?? []
      list.push(r)
      map.set(zone, list)
    }
    return map
  }, [resultats, rechercheFournisseur])

  // Auto-éviction : si un fournisseur choisi devient inéligible (changement de durée/date), on le
  // retire automatiquement de la sélection avec un toast d'avertissement -- même comportement et
  // même message que StepSuppliers.tsx dans Tools.
  useEffect(() => {
    setFournisseurIds((prev) => {
      const kept = prev.filter((id) => resultats.find((r) => r.fournisseur.id === id)?.eligible)
      const removedCount = prev.length - kept.length
      // Renvoyer `prev` tel quel quand rien n'est retiré est INDISPENSABLE : `filter` produit
      // toujours un nouveau tableau, donc une nouvelle référence d'état, donc un rendu de plus
      // qui recalcule `resultats`, qui redéclenche cet effet — boucle infinie. Elle tournait en
      // permanence (ce composant reste monté même dialogue fermé) et affamait React au point
      // qu'aucun changement de route n'était jamais validé : l'URL changeait, la page non.
      if (removedCount === 0) return prev
      showToast(`${removedCount} fournisseur${removedCount > 1 ? 's' : ''} retiré${removedCount > 1 ? 's' : ''} de la sélection (devenu${removedCount > 1 ? 's' : ''} inéligible${removedCount > 1 ? 's' : ''})`)
      return kept
    })
  }, [resultats])

  function reset() {
    setDureesParCompteur({})
    setDureeLibre({})
    setTypesPrix(['Fixe'])
    setDateSouhaitee('')
    setFournisseurIds([])
    setFeedback(null)
  }

  async function handleValider() {
    // La toute première cotation est une « Création initiale », pas une actualisation -- c'est
    // d'ailleurs ce que porte tout l'historique repris de Salesforce.
    const codeMotif = estActualisation ? 'ACTUALISATION_MARCHE' : 'CREATION_INITIALE'
    const motif = (motifsRef ?? []).find((m) => m.code === codeMotif) ?? (motifsRef ?? [])[0]
    const statutBrouillon = trouverParCode(statutsVersionsRef, 'EN_CONSTRUCTION', 'BROUILLON')
    const typeOptim = (typesOptimisationsRef ?? []).find((t) => t.code === MISE_EN_CONCURRENCE)
    // LE DOSSIER NE SE POUSSE PLUS À LA MAIN (Michel, 28/08/2026). Créer une version fait passer
    // le dossier en « Active » tout seul, par déclencheur en base — voir la migration 20260828120000.
    // Lui pousser une étape ici reviendrait à écrire au même endroit deux fois, et c'est exactement
    // le désordre qu'on corrige : « je m'embrouille avec les recommandations et les versions ».
    const etapeEnAnalyse = null

    const rapport = await createVersion.mutateAsync({
      recommandation_id: reco.id,
      compteur_ids: reco.compteur_ids ?? [],
      motif_id: motif?.id ?? null,
      statut_brouillon_id: statutBrouillon?.id ?? null,
      type_optimisation_mise_en_concurrence_id: typeOptim?.id ?? null,
      fournisseur_ids: fournisseurIds,
      // Ces trois-là sont désormais VRAIMENT enregistrés (migration du 06/08/2026) et plus
      // seulement résumés en texte libre.
      durees_par_compteur: Object.fromEntries(
        Object.entries(dureesParCompteur).filter(([, d]) => d.length > 0),
      ),
      types_prix: typesPrix,
      date_souhaitee: dateSouhaitee || null,
      resume: `Durée${durees.length > 1 ? 's' : ''} ${durees.join('/')} mois — ${typesPrix.join(', ')} — ${fournisseurIds.length} fournisseur${fournisseurIds.length > 1 ? 's' : ''} consulté${fournisseurIds.length > 1 ? 's' : ''} — commission estimée ${Math.round(commissionEstimee).toLocaleString('fr-FR')} €`,
      contexte_et_hypotheses: dateSouhaitee ? `Date souhaitée : ${new Date(dateSouhaitee).toLocaleDateString('fr-FR')}` : null,
      // Toujours null : le dossier passe en « Active » par déclencheur en base dès qu'une version
      // existe. Le champ reste dans l'entrée de la mutation pour ne pas casser ses autres appels.
      etape_en_analyse_id: etapeEnAnalyse,
    })
    // Email de cotation -- Tools en envoie un à chaque cotation. Destinataires configurables dans
    // Paramètres, comme pour la demande de contrat.
    const nomsFournisseurs = fournisseurIds
      .map((id) => resultats.find((r) => r.fournisseur.id === id)?.fournisseur.nom)
      .filter(Boolean)
      .join(', ')
    void notifyEmail(
      'cotation',
      { cotationName: reco.titre, accountName: reco.compte_nom ?? '' },
      [
        `Une cotation vient d'être créée.`,
        ``,
        `Compte        : ${reco.compte_nom || '—'}`,
        `Opportunité   : ${reco.titre}`,
        `Durées        : ${durees.join(' / ')} mois`,
        `Type de prix  : ${typesPrix.join(', ') || '—'}`,
        `Date souhaitée : ${dateSouhaitee ? new Date(dateSouhaitee).toLocaleDateString('fr-FR') : '—'}`,
        `Fournisseurs consultés (${fournisseurIds.length}) : ${nomsFournisseurs || '—'}`,
        `Points de livraison : ${(reco.compteur_ids ?? []).length}`,
        ``,
        `${window.location.origin}/recommandations/${reco.id}`,
      ].join('\n'),
    )

    /**
     * Ce que la cotation a vraiment produit, dit au conseiller.
     *
     * Les offres attendues (une par durée × type de prix et par fournisseur) sont ce qu'il va
     * remplir à mesure des réponses : s'il n'en a aucune, il doit l'apprendre ici et pas en
     * découvrant un écran vide. C'est précisément le silence — un `console.error` — qui a laissé la
     * création d'offres cassée du 16 au 17/08/2026.
     */
    const morceaux = [`Version créée avec ${rapport.offresCreees} offre${rapport.offresCreees > 1 ? 's' : ''} attendue${rapport.offresCreees > 1 ? 's' : ''}.`]
    if (rapport.offresEchouees > 0) {
      morceaux.push(`⚠ ${rapport.offresEchouees} offre(s) attendue(s) n'ont pas pu être créées : le suivi des réponses sera à saisir à la main.`)
    }
    if (rapport.fournisseursSansFiche > 0) {
      morceaux.push(`⚠ ${rapport.fournisseursSansFiche} fournisseur(s) consulté(s) sans fiche fournisseur : aucune offre suivie pour eux.`)
    }
    // La fiche sélectionne la nouvelle version avant que le dialogue ne se ferme.
    if (rapport.versionId) onCree?.(rapport.versionId)
    setFeedback(morceaux.join(' '))
    // Laissé plus longtemps à l'écran quand il y a un avertissement à lire.
    setTimeout(() => { reset(); onClose() }, morceaux.length > 1 ? 3500 : 700)
  }

  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onClose() }}
      title={prefill ? 'Dupliquer la version' : 'Nouvelle version'}
      description="Sélectionne les durées, la date souhaitée puis les fournisseurs à consulter — l'éligibilité est vérifiée automatiquement par PDL."
      className="max-w-2xl"
    >
      <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
      {/* Garde-fou de connexion, même emplacement et mêmes outils que dans Tools (CotationPage :
          required={["salesforce","gmail"]}) -- les demandes de cotation partent depuis l'adresse
          Gmail du commercial. */}
      <WizardConnectionGate required={['crm', 'gmail']} feature="création de version">
        {estActualisation && (
          <p className="rounded-km-md border border-[#f0e4cd] bg-km-amber-soft px-3 py-2 text-xs text-km-muted">
            La version en cours passera au statut <b>Clôturée</b>, résultat <b>Expirée</b> : la nouvelle devient la version
            active du dossier.
          </p>
        )}
        {/* Une carte par PDL, chacune avec ses propres durées -- structure de Tools
            (StepCharacteristics) : « Choisis les durées de contrat » puis une carte par compteur. */}
        <div className="space-y-1">
          <p className="text-sm font-medium text-km-text">Choisis les durées de contrat</p>
          <p className="text-xs text-km-muted">
            Pour chaque compteur, sélectionne une ou plusieurs durées.
          </p>
        </div>
        <div className="space-y-3">
          {compteursDeLaReco.map((c) => {
            const selection = dureesParCompteur[c.id] ?? []
            const peutAjouter = selection.length < 3
            const saisie = dureeLibre[c.id] ?? ''
            return (
              <div key={c.id} className={`rounded-xl border p-4 ${selection.length === 0 ? 'border-amber-300 bg-amber-50/40' : 'border-km-line'}`}>
                <div className="mb-3 flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-km-bg text-base">
                    {c.type_energie === 'gaz' ? '🔥' : '⚡'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-km-text">{c.site_nom || 'Sans libellé'}</p>
                    <p className="truncate font-mono text-km-label text-km-faint">{c.numero_pdl}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-xs text-km-faint">{selection.length}/3</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {DUREES_PRESETS.map((d) => {
                    const isSelected = selection.includes(d)
                    const isDisabled = !isSelected && !peutAjouter
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDuree(c.id, d)}
                        disabled={isDisabled}
                        className={`inline-flex select-none items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-km-green text-white shadow-sm hover:bg-kiwi-700'
                            : isDisabled
                              ? 'cursor-not-allowed bg-km-bg text-km-faint'
                              : 'bg-km-soft text-km-muted hover:bg-km-line hover:text-km-text'
                        }`}
                      >
                        {d} mois
                      </button>
                    )
                  })}
                  {/* Saisie libre « Autre » */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      step={1}
                      placeholder="Autre"
                      value={saisie}
                      onChange={(e) => setDureeLibre((prev) => ({ ...prev, [c.id]: e.target.value.replace(/\D/g, '') }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterDureeLibre(c.id) } }}
                      disabled={!peutAjouter}
                      className="w-20 rounded-lg border border-km-line bg-white px-3 py-2 text-sm text-km-text placeholder:text-km-faint focus:outline-none focus:ring-2 focus:ring-kiwi-500/20 disabled:cursor-not-allowed disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => ajouterDureeLibre(c.id)}
                      disabled={!peutAjouter || !saisie}
                      className="rounded-lg bg-kiwi-50 px-3 py-2 text-sm font-medium text-km-green transition-colors hover:bg-km-green-soft disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>

                {selection.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-km-line pt-2">
                    {selection.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDuree(c.id, d)}
                        className="group inline-flex cursor-pointer items-center gap-2 rounded-lg bg-km-bg px-3 py-1.5 text-sm transition-colors hover:bg-km-red-soft"
                      >
                        <span className="font-medium text-km-text">{d} mois</span>
                        <X className="h-3 w-3 text-km-faint group-hover:text-km-red" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-km-label text-amber-700">Sélectionne au moins une durée pour ce PDL.</p>
                )}
              </div>
            )
          })}
          {compteursDeLaReco.length === 0 && (
            <p className="text-xs text-km-faint">Aucun PDL rattaché à cette recommandation.</p>
          )}
        </div>
        <p className="rounded-lg border border-km-line bg-km-bg px-3 py-2 text-xs text-km-muted">
          Commission estimée : <span className="font-medium text-km-text">{commissionEstimee.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</span>
          <span className="text-km-faint"> (C5 : forfait 140 €/PDL · autres : conso/12 × durée max × 3)</span>
        </p>
        <FormField label="Type de prix">
          <div className="flex gap-4">
            {['Fixe', 'Indexé'].map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-km-text">
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
            <p className="text-xs font-semibold uppercase tracking-wide text-km-faint">
              Fournisseurs à consulter
              {resultats.length > 0 && (
                <span className="ml-1.5 normal-case text-km-faint">
                  ({resultats.filter((r) => r.eligible).length} éligible{resultats.filter((r) => r.eligible).length > 1 ? 's' : ''} · {fournisseurIds.length} sélectionné{fournisseurIds.length > 1 ? 's' : ''})
                </span>
              )}
            </p>
            {resultats.some((r) => r.eligible) && (
              <button
                type="button"
                className="text-xs font-medium text-km-green hover:underline"
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
          <Input
            value={rechercheFournisseur}
            onChange={(e) => setRechercheFournisseur(e.target.value)}
            placeholder="Rechercher un fournisseur…"
            className="mb-2"
          />
          <div className="space-y-3">
            {[...ZONE_ORDER_COTATION, 'autre'].every((z) => (parZone.get(z) ?? []).length === 0) && (
              <p className="rounded-lg border border-dashed border-km-line p-3 text-center text-xs text-km-faint">
                Aucun fournisseur ne correspond à « {rechercheFournisseur} ».
              </p>
            )}
            {[...ZONE_ORDER_COTATION, 'autre'].map((zone) => {
              const list = parZone.get(zone) ?? []
              if (list.length === 0) return null
              return (
                <div key={zone}>
                  <p className="mb-1 text-km-label font-semibold text-km-muted">{ZONE_LABEL_COTATION[zone] ?? 'Autre'}</p>
                  <div className="space-y-1 rounded-lg border border-km-line p-2">
                    {list.map((r) => (
                      <label key={r.fournisseur.id} className={`flex items-start gap-2 rounded-md p-1.5 text-sm ${r.eligible ? 'text-km-text hover:bg-km-bg' : 'text-km-faint'}`}>
                        <input type="checkbox" disabled={!r.eligible} checked={fournisseurIds.includes(r.fournisseur.id)} onChange={() => toggleFournisseur(r.fournisseur.id)} className="mt-0.5" />
                        <span className="flex-1">
                          {r.fournisseur.nom}
                          {r.eligible ? (
                            <CheckCircle2 className="ml-1.5 inline h-3 w-3 text-km-green" />
                          ) : (
                            <span className="ml-1.5 inline-flex items-center gap-1 text-km-label text-amber-600" title={r.reasons.join(' · ')}>
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
            {resultats.length === 0 && <p className="text-xs text-km-faint">Aucun fournisseur actif configuré.</p>}
          </div>
        </div>

        {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
        <div className="flex justify-end gap-2 border-t border-km-line pt-3">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="button" onClick={handleValider} disabled={createVersion.isPending || !toutesDureesRenseignees || durees.length === 0 || fournisseurIds.length === 0}>
            Créer la version
          </Button>
        </div>
      </WizardConnectionGate>
      </div>
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </Dialog>
  )
}

export function EnvoyerEmailDialog({
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
        {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
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

export function AjouterFournisseurConsulteDialog({
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
        {feedback && <p className="text-xs text-km-red">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={ajouter.isPending}>Ajouter</Button>
        </div>
      </form>
    </Dialog>
  )
}
