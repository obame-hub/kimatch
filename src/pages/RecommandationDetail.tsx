import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Trash2,
  Sparkle,
  Plus,
  FileText,
  Zap,
  Flame,
  Copy,
  FilePlus2,
  Clock,
  Phone,
  ArrowLeftRight,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { InlineField } from '@/components/ui/inline-field'
import { ActivityFeed } from '@/components/site/ActivityFeed'
import { RailCycleVie, etapeSuivanteDuRail } from '@/components/recommandation/RailCycleVie'
import { ComparatifVersions, coutPrestationEstime } from '@/components/recommandation/ComparatifVersions'
import { VoletGaucheReco } from '@/components/recommandation/VoletGaucheReco'
import { OngletCommandeClient } from '@/components/recommandation/OngletCommandeClient'
import { OngletPerimetre } from '@/components/recommandation/OngletPerimetre'
import { OngletDocuments } from '@/components/recommandation/OngletDocuments'
import { DetailVersion } from '@/components/recommandation/DetailVersion'
import {
  CotationWizard,
  EnvoyerEmailDialog,
  AjouterFournisseurConsulteDialog,
  type PrefillCotation,
} from '@/components/recommandation/DialoguesReco'
import { ContratWizard } from '@/components/contrat/ContratWizard'
import { FINALITES_RECOMMANDATION, CLES_FINALITES, exigeDateReactivation, type CleFinalite } from '@/lib/finalitesRecommandation'
import { cn } from '@/lib/utils'
import {
  useRecommandation,
  useUpdateRecommandationPartiel,
  useUpdateVersionPartiel,
  useCloturerRecommandation,
  useRouvrirRecommandation,
  useAvancerEtapeRecommandation,
  useDeleteRecommandation,
  useDeleteVersion,
  useChangerStatutConsultation,
  CODES_STATUT_CONSULTATION_PROPOSES,
  type PatchRecommandation,
} from '@/lib/data/recommandations'
import { useObjectifsRecommandation } from '@/lib/data/objectifsClient'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useContactsParCompte } from '@/lib/data/contacts'
import { useCompte } from '@/lib/data/comptes'
import { useCompteurs } from '@/lib/data/compteurs'
import { useInteractionsParRecommandation } from '@/lib/data/interactions'
import { useActionsParRecommandation, useCreateAction } from '@/lib/data/actions'
import { useSignauxParRecommandation } from '@/lib/data/signaux'
import { useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { useCreateInteraction } from '@/lib/data/interactions'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { useGoBack } from '@/lib/useGoBack'
import { useRaccourcisOnglets } from '@/lib/useRaccourcisOnglets'
import {
  FALLBACK_ETAPES_RECOMMANDATION,
  FALLBACK_STATUTS_VERSIONS,
  FALLBACK_TYPES_DOCUMENTS,
  FALLBACK_TYPES_ACTIONS,
  FALLBACK_TYPES_INTERACTIONS,
} from '@/lib/referenceFallbacks'
import type { VersionRecommandation, Optimisation } from '@/types/domain'

/**
 * Fiche Recommandation — portage de la maquette « Fiche Recommandation.dc.html » de William.
 *
 * Trois colonnes (volet gauche · onglets · fil d'activité) et quatre onglets : Recommandation,
 * Commande du client, Périmètre, Documents. La page tenait auparavant en deux cartes empilées
 * (« Dossier » et « Historique des versions »), ce qui déroulait toutes les versions les unes sous
 * les autres sans jamais permettre de les comparer.
 *
 * ÉCARTS ASSUMÉS PAR RAPPORT AU DESSIN, tous pour la même raison — ne rien afficher qui n'existe
 * pas en base :
 *
 *  · La référence « RC-2026-027 » : la colonne `reference` existe mais est vide sur les 1703
 *    recommandations. La fiche affiche le nom du dossier, et la référence dès qu'il y en aura une.
 *  · Le comparatif ne rend modifiables que les économies estimées ; le reste appartient à l'offre
 *    retenue (voir l'en-tête de ComparatifVersions.tsx).
 *  · La visionneuse PDF maison est remplacée par un vrai aperçu du vrai fichier.
 *  · L'ordre des onglets suit le design : « Commande du client » passe en premier tant que le
 *    dossier est au Diagnostic — à ce stade, ce qu'a demandé le client est ce qu'on vient lire.
 */

const PRIORITE_LABEL: Record<number, string> = { 1: 'Haute', 2: 'Normale', 3: 'Basse' }

type CleOnglet = 'reco' | 'cmd' | 'perimetre' | 'docs'

export default function RecommandationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: reco } = useRecommandation(id)
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const { data: statutsVersionsRef } = useReferenceTable('statuts_versions_recommandation')
  const { data: typesDocumentsRef } = useReferenceTable('types_documents')
  const { data: typesActionsRef } = useReferenceTable('types_actions')
  const { data: typesInteractionsRef } = useReferenceTable('types_interactions')
  const { data: statutsActionsRef } = useReferenceTable('statuts_actions')
  const { data: statutsConsultationRef } = useReferenceTable('statuts_consultations_fournisseurs')
  const { data: contacts } = useContactsParCompte(reco?.compte_id)
  const { data: compte } = useCompte(reco?.compte_id)
  const { data: compteurs } = useCompteurs()
  const { data: objectifs } = useObjectifsRecommandation(reco?.id)

  // Fil d'activité : les trois sources filtrées côté serveur sur la recommandation elle-même.
  const { data: interactions } = useInteractionsParRecommandation(reco?.id)
  const { data: actions } = useActionsParRecommandation(reco?.id)
  const { data: signaux } = useSignauxParRecommandation(reco?.id)
  // Documents du dossier ET de chacune de ses versions — l'onglet les range par version.
  const entitesDocuments = useMemo(
    () => (reco ? [reco.id, ...reco.versions.map((v) => v.id)] : undefined),
    [reco],
  )
  const { data: documents } = useDocumentsParEntites(entitesDocuments)

  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const statutsVersions = statutsVersionsRef && statutsVersionsRef.length > 0 ? statutsVersionsRef : FALLBACK_STATUTS_VERSIONS
  const typesDocuments = typesDocumentsRef && typesDocumentsRef.length > 0 ? typesDocumentsRef : FALLBACK_TYPES_DOCUMENTS

  const canManage = useCanManage(reco?.proprietaire_id)
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()

  const updateRecoPartiel = useUpdateRecommandationPartiel()
  const updateVersion = useUpdateVersionPartiel()
  const cloturerReco = useCloturerRecommandation()
  const rouvrirReco = useRouvrirRecommandation()
  const avancerEtape = useAvancerEtapeRecommandation()
  const deleteRecommandation = useDeleteRecommandation()
  const deleteVersion = useDeleteVersion()
  const changerStatutConsultation = useChangerStatutConsultation()
  const televerser = useTeleverserDocuments()
  const createAction = useCreateAction()
  const createInteraction = useCreateInteraction()
  const suppression = useSuppression()
  const goBack = useGoBack('/recommandations')

  const [onglet, setOnglet] = useState<CleOnglet>('reco')
  const [versionAfficheeId, setVersionAfficheeId] = useState<string | null>(null)
  const [clotureOuverte, setClotureOuverte] = useState(false)
  const [finaliteChoisie, setFinaliteChoisie] = useState<CleFinalite | null>(null)
  const [motifBrouillon, setMotifBrouillon] = useState('')
  const [reactivationBrouillon, setReactivationBrouillon] = useState('')
  const [nouvelleVersionOuverte, setNouvelleVersionOuverte] = useState(false)
  const [wizardCotation, setWizardCotation] = useState<{ prefill: PrefillCotation | null } | null>(null)
  const [showContratWizard, setShowContratWizard] = useState(false)
  const [emailDialogVersion, setEmailDialogVersion] = useState<VersionRecommandation | null>(null)
  const [ajouterFournisseurFor, setAjouterFournisseurFor] = useState<Optimisation | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [versionASupprimer, setVersionASupprimer] = useState<VersionRecommandation | null>(null)
  const [coutOuvert, setCoutOuvert] = useState(false)
  const [coutBrouillon, setCoutBrouillon] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  function signaler(message: string) {
    setToast(message)
    setTimeout(() => setToast(null), 2400)
  }

  const retourInline = {
    onSaved: () => signaler('✓ enregistré'),
    onError: (e: Error) => signaler(`Erreur : ${e.message}`),
  }

  const majReco = async (patch: PatchRecommandation) => {
    await updateRecoPartiel.mutateAsync({ id: id as string, patch })
  }

  // `estClose` se lit sur la finalité et non sur l'étape : une recommandation peut être posée sur
  // l'étape Clôture sans qualification finale (130 lignes en base), et l'inverse n'existe pas.
  const finalite = (reco?.finalite_cloture ?? null) as CleFinalite | null
  const estClose = Boolean(finalite && FINALITES_RECOMMANDATION[finalite])

  // Version affichée : celle choisie à la main, sinon l'active, sinon la plus récente. Les versions
  // arrivent déjà triées du plus récent au plus ancien.
  const versionAffichee = useMemo(() => {
    if (!reco || reco.versions.length === 0) return null
    return (
      reco.versions.find((v) => v.id === versionAfficheeId)
      ?? reco.versions.find((v) => v.version_actuelle)
      ?? reco.versions[0]
    )
  }, [reco, versionAfficheeId])

  const versionActive = reco?.versions.find((v) => v.version_actuelle) ?? reco?.versions[0] ?? null
  const contactPrincipal =
    contacts?.find((c) => c.id === reco?.contact_signataire_id)
    ?? contacts?.find((c) => c.contact_principal)
    ?? contacts?.[0]

  /**
   * Ordre des onglets : « Commande du client » d'abord tant que le dossier est au Diagnostic et pas
   * clos — c'est la règle `cmdFirst` de la maquette. À ce stade il n'y a encore rien à comparer, et
   * ce qu'on ouvre la fiche pour lire, c'est la demande du client.
   */
  const commandeDabord = reco?.etape === 'DIAGNOSTIC' && !estClose
  const onglets: { cle: CleOnglet; libelle: string; badge?: string }[] = useMemo(() => {
    const cmd = { cle: 'cmd' as CleOnglet, libelle: 'Commande du client', badge: (objectifs ?? []).length > 0 ? `${(objectifs ?? []).length} obj.` : undefined }
    const rec = { cle: 'reco' as CleOnglet, libelle: 'Recommandation', badge: reco && reco.versions.length > 0 ? `${reco.versions.length} vers.` : undefined }
    return [
      ...(commandeDabord ? [cmd, rec] : [rec, cmd]),
      { cle: 'perimetre', libelle: 'Périmètre', badge: (reco?.compteur_ids ?? []).length > 0 ? String((reco?.compteur_ids ?? []).length) : undefined },
      { cle: 'docs', libelle: 'Documents', badge: (documents ?? []).length > 0 ? String((documents ?? []).length) : undefined },
    ]
  }, [commandeDabord, objectifs, reco, documents])

  useRaccourcisOnglets(
    useMemo(() => onglets.map((o) => o.cle), [onglets]),
    setOnglet,
  )

  // L'onglet par défaut suit la même règle que l'ordre : au Diagnostic, on ouvre sur la commande.
  useEffect(() => {
    if (commandeDabord) setOnglet('cmd')
  }, [commandeDabord])

  const etapeSuivante = reco ? etapeSuivanteDuRail(etapes, reco.etape) : null
  const clotureValide = Boolean(
    finaliteChoisie
    && motifBrouillon.trim()
    && (!exigeDateReactivation(finaliteChoisie) || reactivationBrouillon.trim()),
  )

  async function confirmerCloture() {
    if (!reco || !finaliteChoisie) return signaler('Choisissez une qualification finale')
    if (!motifBrouillon.trim()) return signaler('Le motif est obligatoire')
    if (exigeDateReactivation(finaliteChoisie) && !reactivationBrouillon.trim()) {
      return signaler('La date de réactivation est obligatoire')
    }
    try {
      await cloturerReco.mutateAsync({
        id: reco.id,
        finalite: finaliteChoisie,
        motif: motifBrouillon,
        dateReactivation: reactivationBrouillon || null,
        etapeClotureId: etapes.find((e) => e.code === 'CLOTURE')?.id ?? null,
      })
      setClotureOuverte(false)
      signaler(
        finaliteChoisie === 'ACCEPTEE'
          ? '✓ Recommandation acceptée'
          : finaliteChoisie === 'REFUSEE'
            ? '✗ Recommandation refusée'
            : '— Recommandation expirée',
      )
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function rouvrir() {
    if (!reco) return
    try {
      // Retour sur la première étape active du cycle, pas sur une étape codée en dur : les étapes
      // sont pilotées par la table de référence et ont déjà changé une fois (12/08).
      await rouvrirReco.mutateAsync({
        id: reco.id,
        etapeReouvertureId: etapes.find((e) => e.code !== 'CLOTURE')?.id ?? null,
      })
      signaler('↻ Recommandation rouverte')
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function avancer() {
    if (!reco || !etapeSuivante) return
    try {
      await avancerEtape.mutateAsync({ id: reco.id, etapeSuivanteId: etapeSuivante.id })
      signaler(`→ Étape suivante : ${etapeSuivante.libelle}`)
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function handleDelete() {
    if (!reco) return
    suppression.supprimer(
      () => deleteRecommandation.mutateAsync(reco.id),
      () => navigate('/recommandations'),
    )
  }

  /** « Rappel » du fil d'activité : une tâche à demain 9 h, rattachée à la recommandation. */
  async function planifierRappel() {
    if (!reco) return
    const types = typesActionsRef && typesActionsRef.length > 0 ? typesActionsRef : FALLBACK_TYPES_ACTIONS
    const type = types.find((t) => t.code === 'RELANCE') ?? types.find((t) => t.code === 'APPEL') ?? types[0]
    const statut = (statutsActionsRef ?? []).find((s) => s.code === 'A_FAIRE') ?? (statutsActionsRef ?? [])[0]
    const demain = new Date()
    demain.setDate(demain.getDate() + 1)
    demain.setHours(9, 0, 0, 0)
    try {
      await createAction.mutateAsync({
        titre: `Suivre la recommandation ${reco.titre}`,
        type_action_id: type?.id ?? null,
        type_action_libelle: type?.libelle ?? 'Relance',
        site_id: reco.sites[0]?.id ?? null,
        site_nom: reco.sites[0]?.nom ?? '',
        contact_id: contactPrincipal?.id ?? null,
        contact_nom: contactPrincipal ? `${contactPrincipal.prenom} ${contactPrincipal.nom}` : '',
        priorite: reco.priorite,
        echeance: demain.toISOString(),
        commentaire: 'Rappel planifié depuis la fiche Recommandation.',
        statut_id: statut?.id ?? null,
        recommandation_id: reco.id,
        recommandation_titre: reco.titre,
      })
      signaler('⏰ Rappel planifié demain 09:00')
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** « Loguer un appel » : une interaction d'appel sortant sur la recommandation. */
  async function loguerAppel() {
    if (!reco) return
    const types = typesInteractionsRef && typesInteractionsRef.length > 0 ? typesInteractionsRef : FALLBACK_TYPES_INTERACTIONS
    const type = types.find((t) => t.code === 'APPEL') ?? types[0]
    try {
      await createInteraction.mutateAsync({
        type_interaction_id: type?.id ?? null,
        type_interaction_libelle: type?.libelle ?? 'Appel',
        date_interaction: new Date().toISOString(),
        sens: 'sortant',
        objet: contactPrincipal ? `Appel — ${contactPrincipal.prenom} ${contactPrincipal.nom}` : 'Appel sortant',
        resume: null,
        resultat: null,
        compte_id: reco.compte_id || null,
        compte_nom: reco.compte_nom,
        site_id: reco.sites[0]?.id ?? null,
        site_nom: reco.sites[0]?.nom ?? '',
        contact_id: contactPrincipal?.id ?? null,
        contact_nom: contactPrincipal ? `${contactPrincipal.prenom} ${contactPrincipal.nom}` : '',
        issue_interaction_id: null,
        recommandation_id: reco.id,
        recommandation_nom: reco.titre,
      })
      signaler('📞 Appel loggé — complétez le compte rendu depuis le fil')
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (!reco) {
    return (
      <div>
        <Topbar crumb="Recommandations" title="Recommandation" />
        <div className="p-4 sm:p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Retour aux recommandations
          </Button>
          <p className="text-sm text-navy-500">{id ? 'Recommandation introuvable.' : 'Chargement…'}</p>
        </div>
      </div>
    )
  }

  /**
   * « Nouvelle version » depuis le bandeau, quel que soit l'onglet affiché.
   *
   * Le bouton ne faisait rien quand on venait de créer la recommandation : il basculait bien l'état
   * du panneau, mais ce panneau vit dans l'onglet « Recommandation » — et sur un dossier au
   * Diagnostic la fiche s'ouvre sur « Commande du client ». Le clic partait donc dans le vide.
   *
   * Sans aucune version, on va droit au wizard : le panneau n'aurait proposé qu'un seul choix,
   * puisqu'il n'y a rien à dupliquer.
   */
  function ouvrirNouvelleVersion() {
    if (!reco || reco.versions.length === 0) {
      setWizardCotation({ prefill: null })
      return
    }
    setOnglet('reco')
    setNouvelleVersionOuverte((v) => !v)
  }

  const coutSuggere = coutPrestationEstime(versionAffichee?.gains_estimes)
  const filActivite = (
    <ActivityFeed
      compteId={reco.compte_id}
      compteNom={reco.compte_nom}
      siteId={reco.sites[0]?.id ?? null}
      siteNom={reco.sites[0]?.nom ?? ''}
      signaux={signaux ?? []}
      interactions={interactions ?? []}
      actions={actions ?? []}
      documents={documents ?? []}
      recommandationId={reco.id}
      recommandationNom={reco.titre}
      actionsRapides={
        canManage ? (
          <>
            <button
              type="button"
              onClick={planifierRappel}
              disabled={createAction.isPending}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-kw-md border border-kw-border-strong bg-white px-1 py-[7px] text-kw-sm font-bold text-kw-amber-dark hover:border-[#e0c48a] hover:bg-kw-amber-light disabled:opacity-60"
            >
              <Clock className="h-[11px] w-[11px]" /> Rappel
            </button>
            <button
              type="button"
              onClick={loguerAppel}
              disabled={createInteraction.isPending}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-kw-md border border-kw-border-strong bg-white px-1 py-[7px] text-kw-sm font-bold text-kw-green hover:border-[#c4ddd3] hover:bg-kw-green-tint disabled:opacity-60"
            >
              <Phone className="h-[11px] w-[11px]" /> Loguer un appel
            </button>
          </>
        ) : undefined
      }
    />
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar crumb="Recommandations" title={reco.titre} />

      {/* ── Bandeau ── */}
      <div className="flex flex-none flex-wrap items-center gap-3.5 border-b border-kw-border bg-white px-4 py-3 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux recommandations">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-white" style={{ background: 'linear-gradient(135deg,#8a4b2a,#cf9a5e)' }}>
          <Sparkle className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* La référence quand elle existe (aucune des 1703 n'en a aujourd'hui), le nom sinon —
                et c'est le nom qui reste modifiable, puisque c'est lui qui identifie le dossier
                dans les listes. */}
            {reco.reference && (
              <span className="font-mono text-[15px] font-bold tracking-[-0.01em] text-kw-ink">{reco.reference}</span>
            )}
            {canManage ? (
              <InlineField
                variant="text"
                value={reco.titre}
                className="text-[17px] font-bold tracking-tight text-kw-ink"
                onCommit={async (titre) => {
                  // `nom` est NOT NULL en base -- et c'est la seule colonne affichée dans la liste
                  // des recommandations : vide, la ligne devient introuvable.
                  if (titre.trim() === '') throw new Error('Le titre de la recommandation est obligatoire.')
                  await majReco({ nom: titre.trim() })
                }}
                {...retourInline}
              />
            ) : (
              <span className="text-[17px] font-bold tracking-tight text-kw-ink">{reco.titre}</span>
            )}
            <span
              className="whitespace-nowrap rounded-kw-pill border px-[11px] py-[3px] text-kw-xs font-extrabold tracking-[0.05em]"
              style={
                estClose && finalite
                  ? { color: FINALITES_RECOMMANDATION[finalite].couleur, background: FINALITES_RECOMMANDATION[finalite].fond, borderColor: FINALITES_RECOMMANDATION[finalite].bordure }
                  : { color: '#8a4b2a', background: '#f7ece3', borderColor: '#ecdcc2' }
              }
            >
              {estClose && finalite
                ? FINALITES_RECOMMANDATION[finalite].libelle.toUpperCase()
                : `EN COURS${versionActive ? ` · ${versionActive.nom || `V${versionActive.numero_version ?? ''}`} ACTIVE` : ''}`}
            </span>
            {reco.type_energie && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-kw-pill border px-2.5 py-[3px] text-kw-xs font-bold tracking-[0.04em]',
                  reco.type_energie === 'gaz'
                    ? 'border-[#c9dcea] bg-kw-gas-light text-kw-gas'
                    : 'border-[#f2dd96] bg-kw-gold-light text-kw-gold',
                )}
              >
                {reco.type_energie === 'gaz' ? <Flame className="h-[11px] w-[11px]" /> : <Zap className="h-[11px] w-[11px]" />}
                {reco.type_energie === 'gaz' ? 'GAZ' : 'ÉLECTRICITÉ'}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-kw-xs text-kw-faint">
            {reco.compte_nom} · créée le {new Date(reco.date_creation).toLocaleDateString('fr-FR')}
            {reco.conseiller ? ` · ${reco.conseiller}` : ''}
          </p>
        </div>

        <div className="hidden items-center gap-1.5 lg:flex">
          {canManage && (
            <Button size="sm" onClick={ouvrirNouvelleVersion}>
              <Plus className="h-3.5 w-3.5" />
              Nouvelle version
            </Button>
          )}
          {canManage && reco.versions.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowContratWizard(true)}>
              <FileText className="h-3.5 w-3.5" />
              Demande de contrat
            </Button>
          )}
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </Button>
          )}
        </div>

        {/* Propriétaire — réattribuable par un administrateur, comme dans le design. */}
        <div className="hidden flex-none flex-col items-start gap-0.5 rounded-kw-xl border border-kw-border-subtle bg-kw-subtle px-2.5 py-1.5 lg:flex">
          {isAdmin ? (
            <InlineField
              variant="select"
              label="Propriétaire"
              emptyLabel="aucun"
              value={reco.proprietaire_id ?? ''}
              options={(profilsAdmin ?? []).map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom}` }))}
              onCommit={(v) => majReco({ proprietaire_id: v || null })}
              {...retourInline}
            />
          ) : (
            <span className="text-kw-xs font-bold text-kw-label">
              <ArrowLeftRight className="mr-1 inline h-2.5 w-2.5 text-kw-ghost" />
              {reco.conseiller || 'Sans propriétaire'}
            </span>
          )}
          {canManage ? (
            <InlineField
              variant="select"
              label="Priorité"
              value={String(reco.priorite)}
              options={Object.entries(PRIORITE_LABEL).map(([value, label]) => ({ value, label }))}
              onCommit={(v) => majReco({ priorite: Number(v) })}
              {...retourInline}
            />
          ) : (
            <span className="whitespace-nowrap text-kw-tiny text-kw-faint">
              Priorité {PRIORITE_LABEL[reco.priorite] ?? reco.priorite}
            </span>
          )}
        </div>
      </div>

      {/* ── Onglets ── */}
      <div className="flex flex-none gap-0.5 overflow-x-auto border-b border-kw-border bg-white px-4 pt-2.5 sm:px-6">
        {onglets.map((o) => {
          const actif = onglet === o.cle
          return (
            <button
              key={o.cle}
              type="button"
              onClick={() => setOnglet(o.cle)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[2.5px] px-3.5 py-2.5 text-kw-xl font-semibold transition-colors',
                actif ? 'border-[#8a4b2a] text-kw-ink' : 'border-transparent text-kw-meta hover:text-kw-ink',
              )}
            >
              {o.libelle}
              {o.badge && (
                <span
                  className={cn(
                    'rounded-[9px] px-[7px] py-px text-[9.5px] font-extrabold',
                    actif ? 'bg-kw-amber-light text-[#8a4b2a]' : 'bg-kw-muted text-kw-meta',
                  )}
                >
                  {o.badge}
                </span>
              )}
            </button>
          )
        })}
        <div className="flex-1" />
        <span className="hidden self-center font-mono text-kw-xs text-kw-ghost lg:inline">
          1–{onglets.length} pour naviguer
        </span>
      </div>

      {/* ── 3 colonnes ── */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[256px_minmax(0,1fr)_292px]">
        {/* Volet gauche */}
        <div className="hidden border-r border-kw-border lg:block">
          <VoletGaucheReco
            reco={reco}
            compte={compte}
            contacts={contacts ?? []}
            contactPrincipal={contactPrincipal}
            versionAffichee={versionAffichee}
            onChoisirVersion={(v) => { setVersionAfficheeId(v.id); setOnglet('reco') }}
            onMajContactSignataire={async (contactId) => {
              try {
                await majReco({ contact_signataire_id: contactId })
                signaler('✓ Contact principal mis à jour')
              } catch (e) {
                signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
              }
            }}
            coutEstimeSuggere={coutSuggere}
            onFixerCout={() => {
              setCoutBrouillon(
                reco.cout_prestation_reel != null
                  ? String(reco.cout_prestation_reel)
                  : reco.cout_prestation_estime != null
                    ? String(reco.cout_prestation_estime)
                    : coutSuggere != null
                      ? String(coutSuggere)
                      : '',
              )
              setCoutOuvert(true)
            }}
            onDefinirEstime={async (montant) => {
              try {
                await majReco({ cout_prestation_estime: montant })
                signaler(`✓ Coût estimé : ${montant.toLocaleString('fr-FR')} €`)
              } catch (e) {
                signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
              }
            }}
            peutModifier={canManage}
            signaler={signaler}
          />
        </div>

        {/* Centre */}
        <div className="overflow-y-auto bg-kw-bg px-4 py-4 sm:px-5">
          {onglet === 'reco' && (
            <div className="flex animate-kw-fade-slide flex-col gap-3.5">
              <RailCycleVie
                etapes={etapes}
                codeCourant={reco.etape}
                finalite={estClose ? finalite : null}
                peutModifier={canManage}
                clotureOuverte={clotureOuverte}
                onOuvrirCloture={() => {
                  setClotureOuverte((v) => !v)
                  setFinaliteChoisie(null)
                  setMotifBrouillon('')
                }}
                onAvancer={avancer}
                onRouvrir={rouvrir}
                avanceEnCours={avancerEtape.isPending}
              >
                {clotureOuverte && !estClose && (
                  <div className="mt-2.5 animate-kw-fade-slide rounded-kw-xl border-[1.5px] border-[#dcc39c] bg-kw-amber-light px-[13px] py-[11px]">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="min-w-[160px] flex-1 self-center text-kw-base text-kw-meta">
                        Quelle clôture a eu lieu ?
                      </span>
                      {/* Les trois finalités de la base, pas les cinq du dessin : remapper aurait
                          réinterprété 1573 recommandations closes (décision du 16/08/2026). */}
                      {CLES_FINALITES.map((cle) => {
                        const f = FINALITES_RECOMMANDATION[cle]
                        const actif = finaliteChoisie === cle
                        return (
                          <button
                            key={cle}
                            type="button"
                            onClick={() => setFinaliteChoisie(cle)}
                            className="rounded-kw-md px-3.5 py-2 text-kw-md font-bold transition-colors"
                            style={{
                              color: actif ? '#fff' : f.couleur,
                              background: actif ? f.couleur : '#fff',
                              border: `1.5px solid ${f.bordure}`,
                              boxShadow: actif ? `0 3px 9px ${f.couleur}4d` : 'none',
                            }}
                          >
                            {cle === 'ACCEPTEE' ? '✓ ' : cle === 'REFUSEE' ? '✗ ' : '— '}
                            {f.libelle}
                          </button>
                        )
                      })}
                    </div>
                    <label className="mb-1 block text-kw-xs font-bold uppercase tracking-wide text-kw-faint" htmlFor="motif-cloture">
                      Motif <span className="text-kw-red">*</span>
                    </label>
                    <textarea
                      id="motif-cloture"
                      rows={2}
                      value={motifBrouillon}
                      onChange={(e) => setMotifBrouillon(e.target.value)}
                      placeholder="Pourquoi cette recommandation est-elle close ?"
                      className="w-full rounded-kw-md border border-kw-border-strong bg-white px-2.5 py-1.5 text-kw-lg text-kw-ink outline-none focus:ring-1 focus:ring-kw-green"
                    />
                    {/* La date de réactivation n'apparaît que si la finalité l'exige. Aucune des
                        trois valeurs actuelles ne le fait ; le champ est prêt pour le jour où une
                        finalité de report sera ajoutée. */}
                    {finaliteChoisie && exigeDateReactivation(finaliteChoisie) && (
                      <div className="mt-2">
                        <label className="mb-1 block text-kw-xs font-bold uppercase tracking-wide text-kw-faint" htmlFor="date-reactivation">
                          Date de réactivation <span className="text-kw-red">*</span>
                        </label>
                        <input
                          id="date-reactivation"
                          type="date"
                          value={reactivationBrouillon}
                          onChange={(e) => setReactivationBrouillon(e.target.value)}
                          className="rounded-kw-md border border-kw-border-strong bg-white px-2.5 py-1.5 font-mono text-kw-lg text-kw-ink outline-none focus:ring-1 focus:ring-kw-green"
                        />
                      </div>
                    )}
                    <div className="mt-2.5 flex items-center justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setClotureOuverte(false)}>
                        Annuler
                      </Button>
                      <Button type="button" size="sm" onClick={confirmerCloture} disabled={!clotureValide || cloturerReco.isPending}>
                        {cloturerReco.isPending ? 'Clôture…' : 'Confirmer la clôture'}
                      </Button>
                    </div>
                  </div>
                )}
              </RailCycleVie>

              {/* Une fois close, la fiche dit laquelle et pourquoi — c'est tout l'objet du motif
                  obligatoire : le dossier se relit sans avoir à demander à son auteur. */}
              {estClose && finalite && (
                <div
                  className="rounded-kw-xl border px-3.5 py-3"
                  style={{
                    background: FINALITES_RECOMMANDATION[finalite].fond,
                    borderColor: FINALITES_RECOMMANDATION[finalite].bordure,
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {reco.date_cloture && (
                      <span className="font-mono text-kw-base text-kw-label">
                        close le {new Date(reco.date_cloture).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                    {reco.date_reactivation && (
                      <span className="font-mono text-kw-base text-kw-label">
                        · à reprendre le {new Date(reco.date_reactivation).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>
                  {reco.motif_cloture ? (
                    <p className="mt-1.5 text-kw-lg text-kw-body">{reco.motif_cloture}</p>
                  ) : (
                    <p className="mt-1.5 text-kw-base italic text-kw-faint">
                      Motif non renseigné — cette recommandation a été close avant que le motif ne
                      soit demandé.
                    </p>
                  )}
                </div>
              )}

              {/* Sélecteur de version */}
              {reco.versions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {reco.versions.map((v) => {
                    const affichee = versionAffichee?.id === v.id
                    const remplacee = !v.version_actuelle
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVersionAfficheeId(v.id)}
                        className="inline-flex items-center gap-[7px] rounded-kw-lg px-4 py-2 font-mono text-kw-h4 font-extrabold"
                        style={
                          affichee
                            ? {
                                background: remplacee ? '#5c5f66' : 'linear-gradient(135deg,#8a4b2a,#cf9a5e)',
                                color: '#fff',
                                boxShadow: remplacee ? 'none' : '0 4px 12px rgba(176,118,60,.32)',
                              }
                            : {
                                background: '#fff',
                                color: remplacee ? '#a3a5a0' : '#8a4b2a',
                                border: `1.5px solid ${remplacee ? '#e0dfdb' : '#dcc39c'}`,
                              }
                        }
                      >
                        {v.nom || `V${v.numero_version ?? '?'}`}
                        <span
                          className="rounded-kw-md px-[7px] py-0.5 font-sans text-kw-micro font-extrabold uppercase tracking-[0.05em]"
                          style={
                            affichee
                              ? { background: 'rgba(255,255,255,.22)', color: '#fff' }
                              : remplacee
                                ? { background: '#f0efec', color: '#a3a5a0' }
                                : { background: '#f7ece3', color: '#8a4b2a' }
                          }
                        >
                          {v.version_actuelle ? 'Active' : 'Remplacée'}
                        </span>
                      </button>
                    )
                  })}
                  <span className="flex-1" />
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setNouvelleVersionOuverte((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-kw-lg border-[1.5px] border-dashed border-[#dcc39c] bg-white px-[13px] py-[7px] text-kw-base font-bold text-[#8a4b2a] hover:bg-kw-amber-light"
                    >
                      <Plus className="h-3 w-3" /> Créer une nouvelle version
                    </button>
                  )}
                </div>
              )}

              {/* Panneau « nouvelle version » — les deux gestes du design. */}
              {nouvelleVersionOuverte && canManage && (
                <div className="flex animate-kw-fade-slide flex-wrap gap-2.5 rounded-[13px] border-[1.5px] border-[#dcc39c] bg-white px-[15px] py-[13px]">
                  <div className="min-w-[200px] flex-1 self-center text-kw-base text-kw-meta">
                    {versionActive ? (
                      <>
                        La création d'une nouvelle version passe automatiquement{' '}
                        <b className="text-kw-ink">{versionActive.nom || `V${versionActive.numero_version ?? ''}`}</b> au
                        statut <b className="text-kw-label">Remplacée</b>.
                      </>
                    ) : (
                      <>Première cotation du dossier : durées par PDL, type de prix, puis fournisseurs à consulter.</>
                    )}
                  </div>
                  {versionActive && (
                    <button
                      type="button"
                      onClick={() => {
                        setWizardCotation({
                          prefill: {
                            dureesParCompteur: versionActive.durees_par_compteur ?? {},
                            typesPrix: versionActive.types_prix ?? [],
                            // Les fournisseurs déjà consultés sur la version reprise : la
                            // duplication sert justement à relancer les mêmes.
                            fournisseurIds: versionActive.optimisations.flatMap((o) =>
                              o.fournisseurs_consultes.map((f) => f.fournisseur_compte_id),
                            ),
                            dateSouhaitee: versionActive.date_souhaitee?.slice(0, 10) ?? '',
                          },
                        })
                        setNouvelleVersionOuverte(false)
                      }}
                      className="inline-flex items-center gap-[7px] rounded-kw-lg px-[15px] py-[9px] text-kw-md font-bold text-white shadow-[0_3px_10px_rgba(176,118,60,.3)]"
                      style={{ background: 'linear-gradient(135deg,#8a4b2a,#cf9a5e)' }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Dupliquer {versionActive.nom || `V${versionActive.numero_version ?? ''}`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setWizardCotation({ prefill: null }); setNouvelleVersionOuverte(false) }}
                    className="inline-flex items-center gap-[7px] rounded-kw-lg border border-kw-border-strong bg-white px-[15px] py-[9px] text-kw-md font-bold text-kw-ink hover:bg-kw-bg"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    {versionActive ? 'Créer vierge' : 'Lancer la cotation'}
                  </button>
                </div>
              )}

              <ComparatifVersions
                reco={reco}
                versionAffichee={versionAffichee}
                onChoisirVersion={(v) => setVersionAfficheeId(v.id)}
                onMajEconomies={async (versionId, economies) => {
                  try {
                    await updateVersion.mutateAsync({ versionId, patch: { gain_estime_annuel: economies } })
                    signaler('✓ Modifié')
                  } catch (e) {
                    signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                  }
                }}
                peutModifier={canManage}
              />

              {versionAffichee && (
                <DetailVersion
                  version={versionAffichee}
                  statutsVersions={statutsVersions}
                  onEnvoyerEmail={() => setEmailDialogVersion(versionAffichee)}
                  onAjouterFournisseur={setAjouterFournisseurFor}
                  peutModifier={canManage}
                  signaler={signaler}
                  onSupprimer={() => setVersionASupprimer(versionAffichee)}
                  statutsConsultation={(statutsConsultationRef ?? []).filter((s) =>
                    (CODES_STATUT_CONSULTATION_PROPOSES as readonly string[]).includes(s.code),
                  )}
                  onChangerStatut={async (fc, statutId) => {
                    const statut = (statutsConsultationRef ?? []).find((s) => s.id === statutId)
                    if (!statut) return
                    try {
                      await changerStatutConsultation.mutateAsync({
                        optimisationFournisseurId: fc.id,
                        statutId: statut.id,
                        statutCode: statut.code,
                      })
                      // Le message dit ce que le geste a fait AUX OFFRES, pas seulement au
                      // fournisseur : c'est la partie invisible et c'est celle qui surprend.
                      const suite: Record<string, string> = {
                        ACCEPTEE: ' — ses offres en attente passent en acceptées',
                        REFUSEE: ' — ses offres en attente passent en refusées',
                        ACCEPTEE_PARTIELLEMENT: ' — à vous de marquer quelle durée est refusée',
                      }
                      signaler(`✓ ${fc.fournisseur_nom} : ${statut.libelle}${suite[statut.code] ?? ''}`)
                    } catch (e) {
                      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                    }
                  }}
                />
              )}

              {/* Description et note interne : elles restent éditables en place, et s'affichent en
                  pointillé cliquable même vides — sans quoi rien n'invite à les remplir. */}
              <div className="rounded-[13px] border border-kw-border bg-white px-[17px] py-3.5">
                <p className="mb-2 text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-faint">Notes du dossier</p>
                {canManage ? (
                  <div className="space-y-2">
                    <InlineField
                      variant="longtext"
                      label="Description"
                      emptyLabel="ajouter une description"
                      rows={4}
                      value={reco.description ?? ''}
                      onCommit={(v) => majReco({ description: v.trim() || null })}
                      {...retourInline}
                    />
                    {/* Fond ambre : la note interne ne sort pas au client. */}
                    <div className="rounded-kw-md bg-kw-amber-light p-2">
                      <InlineField
                        variant="longtext"
                        label="Note interne"
                        emptyLabel="ajouter une note interne"
                        rows={3}
                        value={reco.commentaire_interne ?? ''}
                        onCommit={(v) => majReco({ commentaire_interne: v.trim() || null })}
                        {...retourInline}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reco.description && <p className="text-kw-lg text-kw-body">{reco.description}</p>}
                    {reco.commentaire_interne && (
                      <p className="rounded-kw-md bg-kw-amber-light p-2 text-kw-base text-kw-amber-dark">
                        Note interne : {reco.commentaire_interne}
                      </p>
                    )}
                    {!reco.description && !reco.commentaire_interne && (
                      <p className="text-kw-base text-kw-faint">Aucune note.</p>
                    )}
                  </div>
                )}
                <HistoriqueDiscret tableNom="recommandations" ligneId={reco.id} />
              </div>
            </div>
          )}

          {onglet === 'cmd' && (
            <OngletCommandeClient
              reco={reco}
              peutModifier={canManage}
              onMajContexte={(texte) => majReco({ contexte_demande: texte })}
              signaler={signaler}
            />
          )}

          {onglet === 'perimetre' && <OngletPerimetre reco={reco} compteurs={compteurs ?? []} />}

          {onglet === 'docs' && (
            <OngletDocuments
              reco={reco}
              documents={documents ?? []}
              versionAfficheeId={versionAffichee?.id ?? null}
              typesDocuments={typesDocuments}
              peutModifier={canManage}
              onDeposer={async (fichiers, typeDocumentId, entite) => {
                await televerser.mutateAsync({
                  fichiers,
                  entite_type: entite.type,
                  entite_id: entite.id,
                  type_document_id: typeDocumentId,
                  type_document_libelle: typesDocuments.find((x) => x.id === typeDocumentId)?.libelle ?? '',
                })
                signaler('✓ Document ajouté')
              }}
            />
          )}

          {/* Le fil d'activité sur mobile, où la troisième colonne n'a pas la place d'exister. */}
          <div className="mt-3.5 rounded-[13px] border border-kw-border bg-white p-3 lg:hidden">
            <p className="mb-2 text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-faint">
              Activité · recommandation
            </p>
            {filActivite}
          </div>
        </div>

        {/* Fil d'activité */}
        <div className="hidden flex-col border-l border-kw-border bg-white lg:flex">
          <div className="flex flex-none items-center gap-2 px-4 pb-2 pt-3">
            <span className="text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-faint">
              Activité · recommandation
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3">{filActivite}</div>
        </div>
      </div>

      {/* ── Dialogues ── */}
      {emailDialogVersion && (
        <EnvoyerEmailDialog
          open
          onClose={() => setEmailDialogVersion(null)}
          reco={reco}
          version={emailDialogVersion}
          defaultEmail={contactPrincipal?.email ?? ''}
        />
      )}
      {/* Montés seulement à l'ouverture : le `Dialog` masque son contenu mais ne démonte pas le
          composant qui l'entoure, dont tous les hooks (calcul d'éligibilité sur l'ensemble des
          fournisseurs, effets) tourneraient en permanence sur la fiche. */}
      {wizardCotation && (
        <CotationWizard open onClose={() => setWizardCotation(null)} reco={reco} prefill={wizardCotation.prefill} />
      )}
      {showContratWizard && (
        <ContratWizard open onClose={() => setShowContratWizard(false)} reco={reco} onCreated={() => setShowContratWizard(false)} />
      )}
      <AjouterFournisseurConsulteDialog
        open={!!ajouterFournisseurFor}
        onClose={() => setAjouterFournisseurFor(null)}
        optimisation={ajouterFournisseurFor}
      />

      {/* Fixer le coût de prestation. Un dialogue et non une saisie en place : le montant facturé
          est la contrepartie de la prestation, il se pose une fois et se relit dans l'historique. */}
      <Dialog
        open={coutOuvert}
        onClose={() => setCoutOuvert(false)}
        title="Fixer le coût de prestation"
        description="Montant réellement facturé au client. L'estimation, elle, reste affichée à côté pour comparaison."
      >
        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-navy-400" htmlFor="cout-reel">
            Montant facturé (€)
          </label>
          <input
            id="cout-reel"
            type="number"
            min={0}
            step={1}
            value={coutBrouillon}
            onChange={(e) => setCoutBrouillon(e.target.value)}
            className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 font-mono text-sm text-navy-800 outline-none focus:ring-2 focus:ring-kiwi-500/20"
          />
          {coutSuggere != null && (
            <p className="text-xs text-navy-500">
              Pour repère : 12 % des économies estimées de {versionAffichee?.nom ?? 'la version affichée'} font{' '}
              <b>{coutSuggere.toLocaleString('fr-FR')} €</b>.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            {reco.cout_prestation_reel != null && (
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  try {
                    await majReco({ cout_prestation_reel: null })
                    setCoutOuvert(false)
                    signaler('↺ Montant remis à l’estimation')
                  } catch (e) {
                    signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                  }
                }}
              >
                Effacer le montant fixé
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setCoutOuvert(false)}>Annuler</Button>
            <Button
              type="button"
              disabled={coutBrouillon.trim() === '' || Number(coutBrouillon) < 0}
              onClick={async () => {
                const montant = Math.round(Number(coutBrouillon))
                if (!Number.isFinite(montant) || montant < 0) return
                try {
                  await majReco({ cout_prestation_reel: montant })
                  setCoutOuvert(false)
                  signaler(`✓ Coût de prestation fixé : ${montant.toLocaleString('fr-FR')} €`)
                } catch (e) {
                  signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                }
              }}
            >
              Fixer le montant
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Suppression d'une version. La confirmation dit ce qui part avec elle : la cascade emporte
          les fournisseurs consultés, leurs offres et le suivi, et personne ne devine ça tout seul. */}
      <Dialog
        open={!!versionASupprimer}
        onClose={() => setVersionASupprimer(null)}
        title={`Supprimer ${versionASupprimer?.nom || 'cette version'} ?`}
        description="Utile quand une version a été créée par erreur. Irréversible."
      >
        {versionASupprimer && (
          <div className="space-y-3">
            <div className="rounded-kw-md border border-kw-amber-border bg-kw-amber-light px-3 py-2 text-xs text-kw-label">
              <p className="font-semibold text-kw-ink">Seront supprimés avec elle :</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>
                  {versionASupprimer.optimisations.length} optimisation
                  {versionASupprimer.optimisations.length > 1 ? 's' : ''}
                </li>
                <li>
                  {versionASupprimer.optimisations.reduce((n, o) => n + o.fournisseurs_consultes.length, 0)} fournisseur(s)
                  consulté(s) et leur suivi
                </li>
                <li>
                  {versionASupprimer.optimisations.reduce((n, o) => n + o.offres.length, 0)} offre(s), dont{' '}
                  {versionASupprimer.optimisations.reduce(
                    (n, o) => n + o.offres.filter((x) => x.montant_annuel_ht != null || x.prix_moyen_mwh != null).length,
                    0,
                  )}{' '}
                  déjà chiffrée(s)
                </li>
              </ul>
            </div>
            {versionASupprimer.version_actuelle && reco.versions.length > 1 && (
              <p className="text-xs text-kw-meta">
                C'est la version active : la plus récente des restantes prendra sa place.
              </p>
            )}
            {reco.versions.length === 1 && (
              <p className="text-xs text-kw-meta">
                C'est la seule version du dossier : la recommandation repartira sans cotation.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setVersionASupprimer(null)}>Annuler</Button>
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
                disabled={deleteVersion.isPending}
                onClick={async () => {
                  const nom = versionASupprimer.nom || 'Version'
                  try {
                    await deleteVersion.mutateAsync({ versionId: versionASupprimer.id, recommandationId: reco.id })
                    // La version affichée vient de disparaître : on relâche la sélection pour que la
                    // fiche retombe sur la version active, sinon elle pointerait dans le vide.
                    setVersionAfficheeId(null)
                    setVersionASupprimer(null)
                    signaler(`${nom} supprimée`)
                  } catch (e) {
                    signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                  }
                }}
              >
                {deleteVersion.isPending ? 'Suppression…' : 'Supprimer définitivement'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer cette recommandation ?"
        description="Cette action est irréversible. Les versions, optimisations et offres liées à cette recommandation seront également perdues."
      >
        {suppression.erreur && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{suppression.erreur}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { suppression.reinitialiser(); setConfirmDelete(false) }}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50"
            disabled={suppression.enCours}
            onClick={handleDelete}
          >
            {suppression.enCours ? 'Suppression…' : 'Supprimer définitivement'}
          </Button>
        </div>
      </Dialog>

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 animate-kw-toast-in whitespace-nowrap rounded-kw-lg bg-ink-900 px-4 py-2.5 text-kw-lg font-semibold text-white shadow-kw-toast lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}
