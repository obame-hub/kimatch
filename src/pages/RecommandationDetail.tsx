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
import { RailCycleVie } from '@/components/recommandation/RailCycleVie'
import { suggestionRelance } from '@/lib/relance'
import { ComparatifVersions, coutPrestationEstime } from '@/components/recommandation/ComparatifVersions'
import { DocumentComparatif } from '@/components/recommandation/DocumentComparatif'
import { RattachementsReco } from '@/components/recommandation/VoletGaucheReco'
import { OngletCommandeClient } from '@/components/recommandation/OngletCommandeClient'
import { OngletPerimetre } from '@/components/recommandation/OngletPerimetre'
import { OngletDocuments } from '@/components/recommandation/OngletDocuments'
import { DetailVersion } from '@/components/recommandation/DetailVersion'
import { BlocAffaire } from '@/components/recommandation/BlocAffaire'
import {
  CotationWizard,
  EnvoyerEmailDialog,
  AjouterFournisseurConsulteDialog,
  type PrefillCotation,
} from '@/components/recommandation/DialoguesReco'
import { ContratWizard } from '@/components/contrat/ContratWizard'
import { useContratsDeRecommandation } from '@/lib/data/contrats'
import { FINALITES_RECOMMANDATION, CLES_FINALITES, exigeDateReactivation, type CleFinalite } from '@/lib/finalitesRecommandation'
import { cn } from '@/lib/utils'
import {
  useRecommandation,
  useUpdateRecommandationPartiel,
  useUpdateVersionPartiel,
  useCloturerRecommandation,
  useRouvrirRecommandation,
  useMajStatutVersion,
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
import { DialogNouvelleTache } from '@/components/tache/DialogNouvelleTache'
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

type CleOnglet = 'reco' | 'rattachements' | 'cmd' | 'comparatif' | 'perimetre' | 'docs'

/**
 * COMMANDE DU CLIENT EST MASQUÉE. Michel, 25/08/2026 : « pour le moment, commande client, je le
 * mettrais pas parce que pour l'instant on ne l'utilise pas en réalité » — et Naoëlle a précisé :
 * effacer de l'AFFICHAGE, pas de la base. L'onglet, son contenu et ses objectifs restent entiers
 * derrière cet interrupteur ; un mot à changer pour les faire revenir.
 */
const AFFICHER_COMMANDE_CLIENT = false

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
  const majStatutVersion = useMajStatutVersion()
  const deleteRecommandation = useDeleteRecommandation()
  const deleteVersion = useDeleteVersion()
  const changerStatutConsultation = useChangerStatutConsultation()
  const televerser = useTeleverserDocuments()
  const createAction = useCreateAction()
  const createInteraction = useCreateInteraction()
  const suppression = useSuppression()
  const goBack = useGoBack('/recommandations')

  // Les contrats nés de cette recommandation — voir le bloc « Ce que cette recommandation a produit ».

  const { data: contratsIssus } = useContratsDeRecommandation(reco?.id)

  const [onglet, setOnglet] = useState<CleOnglet>('reco')
  const [versionAfficheeId, setVersionAfficheeId] = useState<string | null>(null)
  const [clotureOuverte, setClotureOuverte] = useState(false)
  const [finaliteChoisie, setFinaliteChoisie] = useState<CleFinalite | null>(null)
  const [motifBrouillon, setMotifBrouillon] = useState('')
  const [reactivationBrouillon, setReactivationBrouillon] = useState('')
  const [nouvelleVersionOuverte, setNouvelleVersionOuverte] = useState(false)
  const [documentOuvert, setDocumentOuvert] = useState(false)
  const [wizardCotation, setWizardCotation] = useState<{ prefill: PrefillCotation | null } | null>(null)
  const [showContratWizard, setShowContratWizard] = useState(false)
  const [emailDialogVersion, setEmailDialogVersion] = useState<VersionRecommandation | null>(null)
  const [ajouterFournisseurFor, setAjouterFournisseurFor] = useState<Optimisation | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [versionASupprimer, setVersionASupprimer] = useState<VersionRecommandation | null>(null)
  /* Le formulaire de tâche, partagé avec l'opportunité et la piste (Michel, 31/08/2026). */
  const [tacheOuverte, setTacheOuverte] = useState(false)
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

  /**
   * LE PÉRIMÈTRE DE CETTE RECOMMANDATION, et non tous les compteurs de Kimatch.
   *
   * `useCompteurs()` rend les 7 899 compteurs de la base : c'est ce que reçoit l'onglet Périmètre,
   * qui filtre lui-même sur `reco.compteur_ids`. En descendant le périmètre dans le volet gauche le
   * 25/08/2026, je lui ai passé la liste ENTIÈRE — la carte annonçait donc « Périmètre 7899 » sur
   * chaque recommandation, et listait des points de livraison étrangers au dossier. Signalé par
   * Naoëlle dans l'heure.
   */
  const compteursDuPerimetre = useMemo(() => {
    const ids = new Set(reco?.compteur_ids ?? [])
    return (compteurs ?? []).filter((c) => ids.has(c.id))
  }, [compteurs, reco?.compteur_ids])

  /* ══ « CLOS » SE LIT SUR L'ÉTAPE, PLUS SUR LA FINALITÉ ══
     C'était l'inverse jusqu'au 28/08/2026, et ça produisait un mensonge à l'écran : le dossier
     ARPAJE - SIEGE affichait « ACCEPTÉE » alors que sa version 2 était en construction. Sa finalité
     valait bien ACCEPTEE, mais c'était l'historique de la clôture PRÉCÉDENTE — une nouvelle version
     avait été créée depuis, et le dossier était donc redevenu vivant.

     26 dossiers sont dans ce cas : etape = ACTIVE avec une finalité renseignée. Les afficher comme
     clos cachait 26 dossiers sur lesquels il y a du travail.

     LA FINALITÉ RESTE, ET ELLE SERT : c'est le résultat de la dernière clôture, une information
     utile qu'on n'efface pas. Mais elle ne dit plus « ce dossier est fini » — seule l'étape le dit,
     et elle est calculée par déclencheur depuis la dernière version. */
  const finalite = (reco?.finalite_cloture ?? null) as CleFinalite | null
  const estClose = reco?.etape === 'CLOTUREE'

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
  const commandeDabord = reco?.etape === 'BROUILLON' && !estClose

  /**
   * « Cette offre a été envoyée il y a deux jours, vous n'avez toujours pas de retour, souhaitez-vous
   * relancer — fin du game » (Michel, 24/08/2026). La règle et ses garde-fous sont dans
   * src/lib/relance.ts ; ici on ne fait que l'afficher.
   */
  // La dernière relance consignée se reconnaît à l'objet de l'interaction, écrit par
  // `consignerRelance` ci-dessous. Reconnaître par le libellé n'est pas élégant, mais la table des
  // interactions n'a pas de type « relance » et en ajouter un est une migration : c'est le prix de
  // ne rien faire appliquer pour cette fonctionnalité.
  const derniereRelance = useMemo(() => {
    const dates = (interactions ?? [])
      .filter((i) => (i.objet ?? '').startsWith('Relance —'))
      .map((i) => i.date_interaction)
      .filter(Boolean)
      .sort()
    return dates.length ? dates[dates.length - 1] : null
  }, [interactions])

  const relance = useMemo(
    () => (reco ? suggestionRelance(reco.etape, versionActive, derniereRelance) : null),
    [reco, versionActive, derniereRelance],
  )
  const onglets: { cle: CleOnglet; libelle: string; badge?: string }[] = useMemo(() => {
    // Recommandation et Comparatif restent les deux espaces de travail. Rattachements accueille
    // désormais tout le contexte auparavant affiché en permanence à gauche. Commande du client
    // reste masquée provisoirement sans suppression de ses données.
    return [
      { cle: 'reco' as CleOnglet, libelle: 'Recommandation', badge: reco && reco.versions.length > 0 ? `${reco.versions.length} vers.` : undefined },
      { cle: 'rattachements' as CleOnglet, libelle: 'Rattachements' },
      { cle: 'comparatif' as CleOnglet, libelle: 'Comparatif', badge: reco && reco.versions.length > 1 ? `${reco.versions.length} vers.` : undefined },
      ...(AFFICHER_COMMANDE_CLIENT
        ? [{ cle: 'cmd' as CleOnglet, libelle: 'Commande du client', badge: (objectifs ?? []).length > 0 ? `${(objectifs ?? []).length} obj.` : undefined }]
        : []),
    ]
  }, [objectifs, reco])

  useRaccourcisOnglets(
    useMemo(() => onglets.map((o) => o.cle), [onglets]),
    setOnglet,
  )

  // L'onglet par défaut suit la même règle que l'ordre : au Diagnostic, on ouvre sur la commande.
  useEffect(() => {
    if (commandeDabord && AFFICHER_COMMANDE_CLIENT) setOnglet('cmd')
  }, [commandeDabord])

  /* ══ LE RAIL SUIT LA VERSION, PLUS LE DOSSIER ══
     Michel, 28/08/2026 : « sur quoi on travaille, c'est les versions ». Les cinq paliers de dossier
     ont disparu — il n'en reste que quatre statuts, dont trois sont déduits et non franchis. Le rail
     avance donc la VERSION : en construction → disponible → en décision.

     Sans ce changement le rail affichait « Étape "Active" : ancien cycle de vie, hors rail », parce
     qu'on lui donnait les statuts de version et le statut du dossier. */
  /* ══ ON NE CLÔTURE PAS « GAGNÉ » SANS CONTRAT ═══════════════════════════════════════════════

     Michel, appel du 31/08/2026 : « même si l'opportunité je l'indique gagner, tant que je n'ai
     pas le contrat valide, je ne peux pas la clôturer en gagné. »

     CE QUE « VALIDE » VEUT DIRE ICI : la signature est obtenue. Les trois statuts d'avant
     signature — Nouveau, En préparation, À signer — sont des intentions, et « Annulé » est une
     intention abandonnée : aucun des quatre ne prouve un gain. Les autres impliquent tous qu'une
     signature a eu lieu, y compris « Résilié » : un contrat rompu plus tard a bien été gagné.

     Cette règle ne touche QUE la finalité « Acceptée ». Un dossier refusé ou expiré se ferme sans
     contrat, c'est même le cas normal — le lui interdire enfermerait les dossiers perdus. */
  const STATUTS_CONTRAT_SIGNE = ['SIGNE', 'A_VENIR', 'ACTIF', 'TERMINE', 'RESILIE']
  const contratValide = (contratsIssus ?? []).some((ct) =>
    /* Le statut du contrat et celui de sa signature sont deux cycles différents. Un contrat peut
       encore être « Nouveau » côté métier alors que DocuSign l'a déjà marqué SIGNE et daté — c'est
       précisément le cas de GAZ EUROPEEN sur cette recommandation. La preuve de signature doit
       donc primer sur l'avancement administratif du contrat. */
    ct.statut_signature === 'SIGNE'
    || Boolean(ct.date_signature)
    || STATUTS_CONTRAT_SIGNE.includes(ct.statut),
  )

  const clotureValide = Boolean(
    finaliteChoisie
    && motifBrouillon.trim()
    && (finaliteChoisie !== 'ACCEPTEE' || contratValide)
    && (!exigeDateReactivation(finaliteChoisie) || reactivationBrouillon.trim()),
  )

  async function confirmerCloture() {
    if (!reco || !finaliteChoisie) return signaler('Choisissez une qualification finale')
    if (!motifBrouillon.trim()) return signaler('Le motif est obligatoire')
    /* Le même contrôle qu'à l'écran, refait ici : un bouton désactivé empêche le clic, il
       n'empêche pas l'appel. */
    if (finaliteChoisie === 'ACCEPTEE' && !contratValide) {
      return signaler('Il faut un contrat signé pour clôturer en « Acceptée »')
    }
    if (exigeDateReactivation(finaliteChoisie) && !reactivationBrouillon.trim()) {
      return signaler('La date de réactivation est obligatoire')
    }
    try {
      await cloturerReco.mutateAsync({
        id: reco.id,
        finalite: finaliteChoisie,
        motif: motifBrouillon,
        dateReactivation: reactivationBrouillon || null,
        /* ══ L'ÉCRAN N'INSCRIT PLUS L'ÉTAPE ══════════════════════════════════════════════════

           Il visait ACCEPTEE, REFUSEE ou ABANDONNEE — trois étapes qui portaient ZÉRO dossier au
           31/08/2026, parce que la base n'écrit que les quatre statuts de Michel : Brouillon,
           Active, À réactiver, Clôturée. Un dossier fermé depuis la fiche tombait donc dans une
           étape qu'aucune liste ni aucun filtre ne connaît, et le premier recalcul — une version
           qui bouge, un contrat qui arrive — l'en ressortait.

           LES TROIS ISSUES SONT LA FINALITÉ, PAS LE STATUT. « Clôturée · Acceptée » dit les deux
           choses séparément, et c'est déjà ce qu'affiche l'en-tête.

           Désormais l'écran écrit des faits — finalité, motif, date de clôture manuelle — et un
           déclencheur en base en déduit le statut (migration 20260831160000), comme il le fait
           déjà quand une version ou un contrat bouge. Un seul auteur, donc plus de contradiction
           possible entre la fiche et la liste. */
        etapeClotureId: null,
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
        /* Rouvrir n'a pas d'étape d'arrivée à choisir : effacer la clôture manuelle suffit, et la
           base recalcule où le dossier retombe vraiment — Brouillon s'il n'a ni version ni
           contrat, Active si une version vit, À réactiver si tout est clos sans conclusion.
           Choisir ici « le premier palier vivant » revenait à deviner, et à parfois renvoyer un
           dossier avec contrat vers « Brouillon ». */
        etapeReouvertureId: null,
      })
      signaler('↻ Recommandation rouverte')
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /**
   * ON CLIQUE LE STATUT VOULU SUR LA FRISE, PLUS « ÉTAPE SUIVANTE ».
   *
   * Naoëlle, 31/08/2026 : « on pourra modifier les statuts en cliquant sur les statuts direct de la
   * frise ».
   *
   * Ce que ça remplace, et pourquoi c'est mieux : « Étape suivante » n'avançait que d'un cran et
   * jamais en arrière, ce qui obligeait à un second chemin — le menu « Corriger le statut » de la
   * carte de version — pour revenir. Deux commandes pour un même changement, et il fallait savoir
   * laquelle choisir selon le sens. Un clic sur le cran visé fait les deux, et se lit sans mode
   * d'emploi : on montre où on veut aller.
   *
   * Le statut du DOSSIER n'est pas touché ici : un déclencheur en base le recalcule dès que la
   * version change (migration 20260828120000). L'écrire aussi depuis l'écran serait dire deux fois
   * la même chose — et c'est exactement le désordre que Michel a demandé de supprimer.
   */
  async function choisirStatutVersion(statutVersionId: string) {
    if (!versionAffichee) return
    const cible = statutsVersions.find((s) => s.id === statutVersionId)
    try {
      await majStatutVersion.mutateAsync({ versionId: versionAffichee.id, statutVersionId })
      signaler(`→ Version ${versionAffichee.numero_version ?? ''} : ${cible?.libelle ?? 'statut mis à jour'}`)
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

  /**
   * CONSIGNER LA RELANCE. « Fin du game » (Michel) : Kimatch ne relance pas, il enregistre que le
   * commercial l'a fait. L'échange rejoint le fil de la recommandation, et la date de la relance sert
   * de nouveau point de départ au décompte des deux jours ouvrés — sans quoi la suggestion se
   * réafficherait indéfiniment sur un dossier qu'on vient justement de relancer.
   */
  async function consignerRelance() {
    if (!reco || !relance) return
    const types = typesInteractionsRef && typesInteractionsRef.length > 0 ? typesInteractionsRef : FALLBACK_TYPES_INTERACTIONS
    const type = types.find((t) => t.code === 'APPEL') ?? types[0]
    try {
      await createInteraction.mutateAsync({
        type_interaction_id: type?.id ?? null,
        type_interaction_libelle: type?.libelle ?? 'Appel',
        date_interaction: new Date().toISOString(),
        sens: 'sortant',
        objet: `Relance — sans retour depuis ${relance.joursOuvres} jours ouvrés`,
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
      signaler('✓ relance consignée — complétez le compte rendu depuis le fil')
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
          <p className="text-sm text-km-muted">{id ? 'Recommandation introuvable.' : 'Chargement…'}</p>
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
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-km border border-km-line bg-white px-1 py-[7px] text-km-body font-bold text-km-amber hover:border-[#e0c48a] hover:bg-km-amber-soft disabled:opacity-60"
            >
              <Clock className="h-[11px] w-[11px]" /> Rappel
            </button>
            {/* LE RAPPEL RESTE UN RACCOURCI, LA TÂCHE EST LE CAS GÉNÉRAL. Le bouton « Rappel » écrit
                une tâche figée — demain 9 h, titre imposé ; celui-ci ouvre le formulaire, avec son
                titre, son type et son échéance. Michel, 31/08/2026 : « créer et suivre des actions
                dans les recommandations ». Un raccourci ne remplace pas la création. */}
            <button
              type="button"
              onClick={() => setTacheOuverte(true)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-km border border-km-line bg-white px-1 py-[7px] text-km-body font-bold text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50"
            >
              <Clock className="h-[11px] w-[11px]" /> Tâche
            </button>
            <button
              type="button"
              onClick={loguerAppel}
              disabled={createInteraction.isPending}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-km border border-km-line bg-white px-1 py-[7px] text-km-body font-bold text-km-green hover:border-[#c4ddd3] hover:bg-km-green-tint disabled:opacity-60"
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
      <div className="flex flex-none flex-wrap items-center gap-3.5 border-b border-km-line bg-white px-4 py-3 sm:px-6">
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
              <span className="font-mono text-km-name font-bold tracking-[-0.01em] text-km-text">{reco.reference}</span>
            )}
            {canManage ? (
              <InlineField
                variant="text"
                value={reco.titre}
                className="text-km-title font-bold tracking-tight text-km-text"
                onCommit={async (titre) => {
                  // `nom` est NOT NULL en base -- et c'est la seule colonne affichée dans la liste
                  // des recommandations : vide, la ligne devient introuvable.
                  if (titre.trim() === '') throw new Error('Le titre de la recommandation est obligatoire.')
                  await majReco({ nom: titre.trim() })
                }}
                {...retourInline}
              />
            ) : (
              <span className="text-km-title font-bold tracking-tight text-km-text">{reco.titre}</span>
            )}
            {/* ══ LE BADGE PORTE LE STATUT DU DOSSIER — l'un des quatre de Michel ══
                   Brouillon · Active · À réactiver · Clôturée. Il affichait auparavant la FINALITÉ,
                   donc « ACCEPTÉE » — un mot qui n'est plus un statut de dossier depuis le 28/08, et
                   qui pouvait être faux : la finalité d'une clôture passée survit à la création d'une
                   nouvelle version.

                   La finalité reste écrite À CÔTÉ quand le dossier est réellement clos : « CLÔTURÉE ·
                   ACCEPTÉE » dit deux choses vraies, là où « ACCEPTÉE » seule en cachait une. */}
            {/* ══ LES PASTILLES DE STATUT SONT PARTIES ══════════════════════════════════════════

                Naoëlle, 31/08/2026 : « enlève les pastilles à côté du nom, ça sert à rien, c'est
                laid ». Elle a raison sur les deux points.

                ÇA NE SERVAIT À RIEN : depuis que la carte « Cycle de vie » porte les deux frises,
                ces pastilles répétaient ce qui est écrit quelques pixels plus bas, en plus pauvre —
                un mot au lieu du chemin. Elles étaient ma première tentative de réponse à la
                demande de Michel du même jour, et c'est la frise qui y répond.

                ET C'ÉTAIT LAID : trois pastilles empilées à droite du titre poussaient la ligne du
                nom sur trois hauteurs et déséquilibraient l'en-tête. Ce genre d'empilement est
                précisément ce que la maquette de Michel évite.

                Le résultat de la clôture n'est pas perdu : il reste dans l'en-tête de la carte
                « Cycle de vie », où il est écrit « RÉSULTAT : ACCEPTÉE ». Le type d'énergie, lui,
                reste ici — il n'est écrit nulle part ailleurs. */}
            {reco.type_energie && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-km-pill border px-2.5 py-[3px] text-km-label font-bold tracking-[0.04em]',
                  reco.type_energie === 'gaz'
                    ? 'border-[#c9dcea] bg-km-gaz-soft text-km-gaz'
                    : 'border-[#f2dd96] bg-km-elec-soft text-km-elec',
                )}
              >
                {reco.type_energie === 'gaz' ? <Flame className="h-[11px] w-[11px]" /> : <Zap className="h-[11px] w-[11px]" />}
                {reco.type_energie === 'gaz' ? 'GAZ' : 'ÉLECTRICITÉ'}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-km-label text-km-faint">
            {reco.compte_nom} · créée le {new Date(reco.date_creation).toLocaleDateString('fr-FR')}
            {reco.conseiller ? ` · ${reco.conseiller}` : ''}
            {/* ══ LA DATE DE CLÔTURE, VISIBLE MÊME QUAND LE DOSSIER N'EST PAS CLOS ══
                Michel, 31/08/2026, sur un dossier « À réactiver » : « il serait bien d'avoir la
                possibilité de voir la date de clôture, comme sur Salesforce ».

                ELLE ÉTAIT DÉJÀ EN BASE — vérifié sur les 1 595 dossiers repris : 1 585 dates
                identiques au champ `CloseDate` de Salesforce, zéro absente, et les 10 écarts sont
                des clôtures faites DANS Kimatch le 12/08/2026 que Salesforce, gelé en lecture
                seule, n'a jamais reçues. Rien ne manquait à l'import.

                CE QUI MANQUAIT, C'EST L'AFFICHAGE : le bloc qui la montre est conditionné à
                `estClose && finalite`. Or les 84 dossiers « À réactiver » ont une date et AUCUNE
                finalité — le bloc ne s'affichait donc jamais pour eux, et c'est exactement ceux que
                Michel regardait.

                DEUX LIBELLÉS, PARCE QUE LE CHAMP DIT DEUX CHOSES. `CloseDate` est obligatoire sur
                toute opportunité Salesforce : sur un dossier clos c'est la date de clôture réelle,
                sur un dossier ouvert c'est la date PRÉVUE. Mesuré : 126 de nos dossiers sont encore
                ouverts dans l'org. Écrire « clôturée le » sur ceux-là annoncerait une fin qui n'a
                pas eu lieu. */}
            {reco.date_cloture && (
              <>
                {' · '}
                {/* LE LIBELLÉ SUIT LA FINALITÉ, PAS L'ÉTAPE — corrigé le 31/08/2026 après que
                    Naoëlle a vu « clôture prévue le 21/04/2026 » sur un dossier gagné et signé.
                    L'étape d'un dossier redevient « Active » dès qu'une version est vivante, même
                    s'il a été clôturé avant : 24 dossiers sont dans ce cas. La FINALITÉ, elle, ne
                    s'écrit qu'au moment d'une clôture réelle — c'est donc elle qui dit si la date
                    est une fin ou une prévision. */}
                {reco.finalite_cloture ? 'clôturée' : 'clôture prévue'} le{' '}
                <span className="font-semibold text-km-muted">
                  {new Date(reco.date_cloture).toLocaleDateString('fr-FR')}
                </span>
              </>
            )}
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
        <div className="hidden flex-none flex-col items-start gap-0.5 rounded-km-lg border border-km-line-soft bg-km-soft px-2.5 py-1.5 lg:flex">
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
            <span className="text-km-label font-bold text-km-muted">
              <ArrowLeftRight className="mr-1 inline h-2.5 w-2.5 text-km-faint" />
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
            <span className="whitespace-nowrap text-km-label text-km-faint">
              Priorité {PRIORITE_LABEL[reco.priorite] ?? reco.priorite}
            </span>
          )}
        </div>
      </div>

      {/* ── Onglets ── */}
      <div className="flex flex-none gap-0.5 overflow-x-auto border-b border-km-line bg-white px-4 pt-2.5 sm:px-6">
        {onglets.map((o) => {
          const actif = onglet === o.cle
          return (
            <button
              key={o.cle}
              type="button"
              onClick={() => setOnglet(o.cle)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[2.5px] px-3.5 py-2.5 text-km-name font-semibold transition-colors',
                actif ? 'border-[#8a4b2a] text-km-text' : 'border-transparent text-km-muted hover:text-km-text',
              )}
            >
              {o.libelle}
              {o.badge && (
                <span
                  className={cn(
                    'rounded-[9px] px-[7px] py-px text-km-tiny font-extrabold',
                    actif ? 'bg-km-amber-soft text-[#8a4b2a]' : 'bg-km-soft text-km-muted',
                  )}
                >
                  {o.badge}
                </span>
              )}
            </button>
          )
        })}
        <div className="flex-1" />
        <span className="hidden self-center font-mono text-km-label text-km-faint lg:inline">
          1–{onglets.length} pour naviguer
        </span>
      </div>

      {/* Deux colonnes : contenu de l'onglet courant et activité. L'ancien volet gauche devient
          le contenu de l'onglet Rattachements sans perdre ses actions ni ses informations. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_292px]">
        <div className={cn('col-start-1 row-start-1 min-h-0 overflow-y-auto', onglet !== 'rattachements' && 'hidden')}>
          <RattachementsReco
            reco={reco}
            compte={compte}
            contacts={contacts ?? []}
            compteurs={compteursDuPerimetre}
            documents={(documents ?? []).map((d) => ({ id: d.id, nom: d.nom, type_document: d.type_document ?? null }))}
            contactPrincipal={contactPrincipal}
            versionAffichee={versionAffichee}
            statutsVersions={statutsVersions}
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
        <div className={cn('col-start-1 row-start-1 min-h-0 overflow-y-auto bg-km-bg px-4 py-4 sm:px-5', onglet === 'rattachements' && 'hidden')}>
          {onglet === 'reco' && (
            <div className="flex animate-km-fade-slide flex-col gap-3.5">
              <RailCycleVie
                etapes={statutsVersions}
                /* LA FRISE DU HAUT : les quatre statuts du dossier, tels que la base les calcule.
                   Ce sont deux tables différentes — `etapes_recommandation` pour le dossier,
                   `statuts_versions_recommandation` pour la version — et c'est précisément ce que
                   les deux frises rendent visible. */
                etapesDossier={etapes}
                codeDossier={reco.etape ?? ''}
                codeCourant={versionAffichee?.statut ?? ''}
                numeroVersion={versionAffichee?.numero_version ?? null}
                finalite={estClose ? finalite : null}
                peutModifier={canManage}
                onOuvrirCloture={() => {
                  setClotureOuverte((v) => !v)
                  setFinaliteChoisie(null)
                  setMotifBrouillon('')
                }}
                onChoisirStatutVersion={choisirStatutVersion}
                onRouvrir={rouvrir}
                avanceEnCours={majStatutVersion.isPending}
              >
                {clotureOuverte && !estClose && (
                  <div className="mt-2.5 animate-km-fade-slide rounded-km-lg border-[1.5px] border-[#dcc39c] bg-km-amber-soft px-[13px] py-[11px]">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {/* « Quelle clôture a eu lieu ? » suivi de trois boutons donnait à croire
                          qu'on choisissait un statut de clôture. On choisit un RÉSULTAT : le statut,
                          lui, sera Clôturée quel que soit le bouton. */}
                      <span className="min-w-[160px] flex-1 self-center text-km-body text-km-muted">
                        Résultat de ce dossier ?
                      </span>
                      {/* Les trois finalités de la base, pas les cinq du dessin : remapper aurait
                          réinterprété 1573 recommandations closes (décision du 16/08/2026). */}
                      {CLES_FINALITES.map((cle) => {
                        const f = FINALITES_RECOMMANDATION[cle]
                        const actif = finaliteChoisie === cle
                        /* « Acceptée » reste visible mais inerte sans contrat signé : la masquer
                           laisserait croire que la finalité n'existe pas, alors que le problème est
                           qu'il manque une pièce — et l'infobulle dit laquelle. */
                        const interdit = cle === 'ACCEPTEE' && !contratValide
                        return (
                          <button
                            key={cle}
                            type="button"
                            disabled={interdit}
                            title={interdit ? 'Il faut un contrat signé pour clôturer en « Acceptée ».' : undefined}
                            onClick={() => setFinaliteChoisie(cle)}
                            className={cn(
                              'rounded-km px-3.5 py-2 text-km-body font-bold transition-colors',
                              interdit && 'cursor-not-allowed opacity-45',
                            )}
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
                    {!contratValide && (
                      <p className="mb-2 text-km-label text-km-muted">
                        « Acceptée » demande un contrat signé sur ce dossier — il n'y en a pas encore.
                      </p>
                    )}
                    <label className="mb-1 block text-km-label font-bold uppercase tracking-wide text-km-faint" htmlFor="motif-cloture">
                      Motif <span className="text-km-red">*</span>
                    </label>
                    <textarea
                      id="motif-cloture"
                      rows={2}
                      value={motifBrouillon}
                      onChange={(e) => setMotifBrouillon(e.target.value)}
                      placeholder="Pourquoi cette recommandation est-elle close ?"
                      className="w-full rounded-km border border-km-line bg-white px-2.5 py-1.5 text-km-name text-km-text outline-none focus:ring-1 focus:ring-km-green"
                    />
                    {/* La date de réactivation n'apparaît que si la finalité l'exige. Aucune des
                        trois valeurs actuelles ne le fait ; le champ est prêt pour le jour où une
                        finalité de report sera ajoutée. */}
                    {finaliteChoisie && exigeDateReactivation(finaliteChoisie) && (
                      <div className="mt-2">
                        <label className="mb-1 block text-km-label font-bold uppercase tracking-wide text-km-faint" htmlFor="date-reactivation">
                          Date de réactivation <span className="text-km-red">*</span>
                        </label>
                        <input
                          id="date-reactivation"
                          type="date"
                          value={reactivationBrouillon}
                          onChange={(e) => setReactivationBrouillon(e.target.value)}
                          className="rounded-km border border-km-line bg-white px-2.5 py-1.5 font-mono text-km-name text-km-text outline-none focus:ring-1 focus:ring-km-green"
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

              {/* ══════════ CE QUE CETTE RECOMMANDATION A PRODUIT ══════════

                  Le lien contrat → recommandation dormait : la colonne existait, mais la reprise
                  Salesforce ne l'avait pas importée (3 contrats renseignés sur 1 598). Rétabli le
                  27/08/2026 sur 697 contrats depuis `Contract.Opportunit__c`, avec le compte des deux
                  côtés comme garde-fou — zéro discordance sur 694 rapprochements.

                  Ce bloc est la moitié utile du lien. Sans lui, un commercial qui ouvre une
                  recommandation acceptée ne voit pas le contrat qu'elle a donné, et ne peut donc pas
                  vérifier que les conditions signées sont bien celles qu'il avait proposées.

                  Il se tait quand il n'y a rien : sur une recommandation encore en cours, une carte
                  « aucun contrat » n'apprendrait rien qu'on ne sache déjà en lisant l'étape. */}
              {contratsIssus && contratsIssus.length > 0 && (
                <div className="rounded-km-lg border border-km-line bg-white p-3.5">
                  <p className="mb-2.5 text-km-label font-bold uppercase tracking-[0.06em] text-km-faint">
                    {contratsIssus.length > 1
                      ? `Les ${contratsIssus.length} contrats issus de cette recommandation`
                      : 'Le contrat issu de cette recommandation'}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {contratsIssus.map((ct) => (
                      <button
                        key={ct.id}
                        type="button"
                        onClick={() => navigate(`/contrats/${ct.id}`)}
                        className="flex w-full items-center gap-2.5 rounded-km-md border border-km-line bg-km-soft px-3 py-2 text-left transition hover:border-km-green-line hover:bg-km-green-tint"
                      >
                        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-km-green-soft text-km-green">
                          <FileText className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-km-body font-bold text-km-text">
                            {ct.fournisseur_nom || 'Fournisseur non renseigné'}
                          </span>
                          <span className="block truncate text-km-label text-km-faint">
                            {[
                              ct.reference_fournisseur,
                              ct.date_debut
                                ? `du ${new Date(ct.date_debut).toLocaleDateString('fr-FR')}`
                                : null,
                              ct.date_fin
                                ? `au ${new Date(ct.date_fin).toLocaleDateString('fr-FR')}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Aucune date renseignée'}
                          </span>
                        </span>
                        <span className="shrink-0 text-km-label font-bold text-km-green">ouvrir →</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ══════════ LA RELANCE APRÈS DEUX JOURS OUVRÉS ══════════
                  « Kimatch va juste lui dire : voilà ce que tu devrais faire. À lui de décider de le
                  faire ou pas » (Michel, 24/08/2026). D'où une SUGGESTION et non une alerte : pas de
                  rouge, pas de compte à rebours, et le bouton ne fait que consigner l'échange que le
                  commercial a réellement eu — aucune relance ne part toute seule. */}
              {relance && (
                <div className="flex flex-wrap items-center gap-3 rounded-km-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-white px-3.5 py-3">
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-km-amber-soft text-amber-700">
                    <Clock className="h-3.5 w-3.5" />
                  </span>
                  <p className="min-w-0 flex-1 text-km-body text-km-muted">{relance.texte}</p>
                  <button
                    type="button"
                    onClick={consignerRelance}
                    className="shrink-0 rounded-km bg-amber-600 px-3 py-1.5 text-km-body font-bold text-white hover:brightness-105"
                  >
                    Consigner une relance
                  </button>
                </div>
              )}

              {/* Une fois close, la fiche dit laquelle et pourquoi — c'est tout l'objet du motif
                  obligatoire : le dossier se relit sans avoir à demander à son auteur. */}
              {estClose && finalite && (
                <div
                  className="rounded-km-lg border px-3.5 py-3"
                  style={{
                    /* `?.` par précaution : les trois finalités connues couvrent 100 % de la
                       base aujourd'hui, mais une quatrième valeur ajoutée en référence ferait
                       planter la fiche au rendu — le même défaut que sur la fiche compte. */
                    background: FINALITES_RECOMMANDATION[finalite]?.fond,
                    borderColor: FINALITES_RECOMMANDATION[finalite]?.bordure,
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {reco.date_cloture && (
                      <span className="font-mono text-km-body text-km-muted">
                        close le {new Date(reco.date_cloture).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                    {reco.date_reactivation && (
                      <span className="font-mono text-km-body text-km-muted">
                        · à reprendre le {new Date(reco.date_reactivation).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>
                  {reco.motif_cloture ? (
                    <p className="mt-1.5 text-km-name text-km-muted">{reco.motif_cloture}</p>
                  ) : (
                    <p className="mt-1.5 text-km-body italic text-km-faint">
                      Motif non renseigné — cette recommandation a été close avant que le motif ne
                      soit demandé.
                    </p>
                  )}
                </div>
              )}

              {/* LES TUILES DE VERSION SONT PARTIES. Michel, 25/08/2026 : « il veut enlever ce bloc
                  avec les tuiles de versions ». Elles doublaient la liste du volet de gauche, qui
                  reste le sélecteur de version — et le comparatif, où l'on passe d'une version à
                  l'autre, a désormais son propre onglet. Les deux boutons de cette barre restent :
                  ils ne concernent pas les versions mais le document et la création.

                  Le commentaire est ICI et non à l'intérieur du `&&` : entre la parenthèse
                  ouvrante et le premier élément, on est dans une expression JavaScript, où un
                  commentaire de style JSX est une erreur de syntaxe. C'est la deuxième fois que je
                  m'y reprends — et écrire la séquence fermante dans le texte referme le commentaire
                  par surprise, ce qui fut ma faute suivante. */}
              {reco.versions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1" />
                  {/* LE LIBELLÉ DIT CE QU'ON VOIT, PAS CE QU'ON FABRIQUE. Michel, 20/08/2026 : « si
                      je mets document comparatif, j'ai l'impression que je vais générer un document
                      que je ne génère pas tout de suite — je peux juste voir. […] Il faut que le
                      verbatim du bouton t'indique ce que tu vas avoir. » D'où « Voir le résumé de la
                      version » : l'écran s'ouvre, et c'est de là qu'on imprime si on le décide. */}
                  <button
                    type="button"
                    onClick={() => setDocumentOuvert(true)}
                    className="inline-flex items-center gap-1.5 rounded-km-md border-[1.5px] border-km-line bg-white px-[13px] py-[7px] text-km-body font-bold text-km-muted hover:bg-km-soft"
                  >
                    <FileText className="h-3 w-3" /> Voir le résumé de la version
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setNouvelleVersionOuverte((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-km-md border-[1.5px] border-dashed border-[#dcc39c] bg-white px-[13px] py-[7px] text-km-body font-bold text-[#8a4b2a] hover:bg-km-amber-soft"
                    >
                      <Plus className="h-3 w-3" /> Créer une nouvelle version
                    </button>
                  )}
                </div>
              )}

              {/* Panneau « nouvelle version » — les deux gestes du design. */}
              {nouvelleVersionOuverte && canManage && (
                <div className="flex animate-km-fade-slide flex-wrap gap-2.5 rounded-[13px] border-[1.5px] border-[#dcc39c] bg-white px-[15px] py-[13px]">
                  <div className="min-w-[200px] flex-1 self-center text-km-body text-km-muted">
                    {versionActive ? (
                      <>
                        La création d'une nouvelle version passe automatiquement{' '}
                        <b className="text-km-text">{versionActive.nom || `V${versionActive.numero_version ?? ''}`}</b> au
                        statut <b className="text-km-muted">Clôturée</b>, avec le résultat
                        <b className="text-km-muted"> Expirée</b>.
                      </>
                    ) : (
                      <>Première version de la recommandation : durées par PDL, type de prix, puis fournisseurs à consulter.</>
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
                      className="inline-flex items-center gap-[7px] rounded-km-md px-[15px] py-[9px] text-km-body font-bold text-white shadow-[0_3px_10px_rgba(176,118,60,.3)]"
                      style={{ background: 'linear-gradient(135deg,#8a4b2a,#cf9a5e)' }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Dupliquer {versionActive.nom || `V${versionActive.numero_version ?? ''}`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setWizardCotation({ prefill: null }); setNouvelleVersionOuverte(false) }}
                    className="inline-flex items-center gap-[7px] rounded-km-md border border-km-line bg-white px-[15px] py-[9px] text-km-body font-bold text-km-text hover:bg-km-bg"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    {versionActive ? 'Créer vierge' : 'Créer la version'}
                  </button>
                </div>
              )}

              {versionAffichee && (
                <DetailVersion
                  version={versionAffichee}
                  statutsVersions={statutsVersions}
                  onEnvoyerEmail={() => setEmailDialogVersion(versionAffichee)}
                  onAjouterFournisseur={setAjouterFournisseurFor}
                  peutModifier={canManage}
                  signaler={signaler}
                  onSupprimer={() => setVersionASupprimer(versionAffichee)}
                  compteurs={compteurs ?? []}
                  typeDocumentOffreId={
                    // « Offre » si la table de référence le propose, sinon rien : le dépôt
                    // fonctionne sans type, et inventer un code de type serait pire.
                    typesDocuments.find((t) => /offre/i.test(t.libelle))?.id ?? null
                  }
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
                      /* ══ CE MESSAGE PROMETTAIT UN EFFET QUI N'EXISTE PLUS ══
                         Il annonçait « ses offres en attente passent en acceptées » : c'était vrai
                         tant que le déclencheur `propager_consultation_vers_offre` écrasait les
                         offres depuis la consultation. Ce déclencheur a été retiré le 01/09/2026 —
                         il détruisait la nuance entre offres disponibles et indisponibles, et il
                         bouclait avec le nouveau calcul.

                         Le sens a changé de direction : ce sont les OFFRES qui décident du statut,
                         plus l'inverse. Le message dit donc maintenant ce qui va vraiment se
                         passer — le statut choisi tient jusqu'au prochain changement d'offre. */
                      const suite: Record<string, string> = {
                        ACCEPTEE: ' — recalculé dès qu’une offre change',
                        DISPONIBLE: ' — recalculé dès qu’une offre change',
                        REFUSEE: ' — recalculé dès qu’une offre change',
                      }
                      signaler(`✓ ${fc.fournisseur_nom} : ${statut.libelle}${suite[statut.code] ?? ''}`)
                    } catch (e) {
                      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                    }
                  }}
                />
              )}

              <BlocAffaire reco={reco} />

{/* LES NOTES DU DOSSIER SONT RETIREES « pour le moment » (Michel, 25/08/2026). L'historique,
                  lui, reste : il trace les modifications du dossier et ne fait pas partie des notes. */}
              <div className="rounded-[13px] border border-km-line bg-white px-[17px] py-3.5">
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

          {/* L'ONGLET COMPARATIF. Michel, 25/08/2026 : « le bloc de comparatif de version on le
              transforme en onglet ». L'onglet Recommandation ne garde donc que les détails de la
              version active — sa deuxième demande du même moment. On passe d'une version à l'autre
              en cliquant une colonne du comparatif, ou depuis le volet de gauche. */}
          {onglet === 'comparatif' && (
            <div className="animate-km-fade-slide">
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
            </div>
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
          <div className="mt-3.5 rounded-[13px] border border-km-line bg-white p-3 lg:hidden">
            <p className="mb-2 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
              Activité · recommandation
            </p>
            {filActivite}
          </div>
        </div>

        {/* Fil d'activité */}
        <div className="hidden min-h-0 flex-col border-l border-km-line bg-white lg:flex">
          <div className="flex flex-none items-center gap-2 px-4 pb-2 pt-3">
            <span className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
              Activité · recommandation
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3">{filActivite}</div>
        </div>
      </div>

      {/* ── Dialogues ── */}
      {versionAffichee && (
        <DocumentComparatif
          ouvert={documentOuvert}
          onFermer={() => setDocumentOuvert(false)}
          reco={reco}
          version={versionAffichee}
          compte={compte}
          compteurs={compteurs ?? []}
          contactClient={contactPrincipal ?? null}
          conseiller={(() => {
            const p = (profilsAdmin ?? []).find((x) => x.id === reco.proprietaire_id)
            return p ? { nom: `${p.prenom} ${p.nom}`, email: p.email } : null
          })()}
        />
      )}

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
        <CotationWizard
          open
          onClose={() => setWizardCotation(null)}
          reco={reco}
          prefill={wizardCotation.prefill}
          onCree={(versionId) => {
            // On la designe explicitement plutot que de compter sur le repli « version active » :
            // c'est celle qu'on vient de creer qu'on veut voir, et sur l'onglet qui la montre.
            setVersionAfficheeId(versionId)
            setOnglet('reco')
          }}
        />
      )}
      {showContratWizard && (
        <ContratWizard open onClose={() => setShowContratWizard(false)} reco={reco} onCreated={() => setShowContratWizard(false)} />
      )}
      <AjouterFournisseurConsulteDialog
        open={!!ajouterFournisseurFor}
        onClose={() => setAjouterFournisseurFor(null)}
        optimisation={ajouterFournisseurFor}
      />

      {tacheOuverte && (
        <DialogNouvelleTache
          open
          onClose={() => setTacheOuverte(false)}
          signaler={signaler}
          rattachement={{
            recommandation_id: reco.id,
            recommandation_titre: reco.titre,
            site_id: reco.sites[0]?.id ?? null,
            site_nom: reco.sites[0]?.nom ?? '',
            contact_id: contactPrincipal?.id ?? null,
            contact_nom: contactPrincipal ? `${contactPrincipal.prenom} ${contactPrincipal.nom}` : '',
            libelle_cible: `la recommandation ${reco.titre}`,
          }}
        />
      )}

      {/* Fixer le coût de prestation. Un dialogue et non une saisie en place : le montant facturé
          est la contrepartie de la prestation, il se pose une fois et se relit dans l'historique. */}
      <Dialog
        open={coutOuvert}
        onClose={() => setCoutOuvert(false)}
        title="Fixer le coût de prestation"
        description="Montant réellement facturé au client. L'estimation, elle, reste affichée à côté pour comparaison."
      >
        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-km-faint" htmlFor="cout-reel">
            Montant facturé (€)
          </label>
          <input
            id="cout-reel"
            type="number"
            min={0}
            step={1}
            value={coutBrouillon}
            onChange={(e) => setCoutBrouillon(e.target.value)}
            className="w-full rounded-lg border border-km-line bg-white px-3 py-2 font-mono text-sm text-km-text outline-none focus:ring-2 focus:ring-kiwi-500/20"
          />
          {coutSuggere != null && (
            <p className="text-xs text-km-muted">
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
            <div className="rounded-km border border-km-amber-line bg-km-amber-soft px-3 py-2 text-xs text-km-muted">
              <p className="font-semibold text-km-text">Seront supprimés avec elle :</p>
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
              <p className="text-xs text-km-muted">
                C'est la version active : la plus récente des restantes prendra sa place.
              </p>
            )}
            {reco.versions.length === 1 && (
              <p className="text-xs text-km-muted">
                C'est la seule version du dossier : la recommandation repartira sans cotation.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setVersionASupprimer(null)}>Annuler</Button>
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-km-red hover:bg-km-red-soft"
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
          <p className="rounded-lg border border-red-200 bg-km-red-soft px-3 py-2 text-xs text-red-700">{suppression.erreur}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { suppression.reinitialiser(); setConfirmDelete(false) }}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-red-200 text-km-red hover:bg-km-red-soft"
            disabled={suppression.enCours}
            onClick={handleDelete}
          >
            {suppression.enCours ? 'Suppression…' : 'Supprimer définitivement'}
          </Button>
        </div>
      </Dialog>

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 animate-km-toast-in whitespace-nowrap rounded-km-md bg-ink-900 px-4 py-2.5 text-km-name font-semibold text-white shadow-km-pop lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}
