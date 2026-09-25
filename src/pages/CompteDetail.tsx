import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Building2, FileCheck2, MapPin, Pencil, Plus, Search, Target } from 'lucide-react'
import { TitreOnglet } from '@/components/layout/TitreOnglet'
import { HubCreation } from '@/components/compte/HubCreation'
import { useCreerUnCompte } from '@/lib/creationCompte'
import { useCreerUnContact, useDeclarerCompteCourant } from '@/lib/creationContact'
import { ZoneATraiter } from '@/components/compte/ZoneATraiter'
import { ZoneEnCours } from '@/components/compte/ZoneEnCours'
import { ZonePortefeuille } from '@/components/compte/ZonePortefeuille'
import { MandatWizard } from '@/components/mandat/MandatWizard'
import { WizardConnectionGate } from '@/components/ui/connection-gate'
import { HeroQualiteCompte, HeroScoreEllipro, type FaitEllipro } from '@/components/compte/HerosCompte'
import { useQualiteCompte, useEvolutionQualite, useQualiteCompteurs, useStatutCommercialSites, manquesCompteur } from '@/lib/data/qualiteCompte'
import { useOpportunites } from '@/lib/data/opportunites'
import { pastilleScore } from '@/lib/niveauScore'
import { OngletRecommandations } from '@/components/compte/OngletsCompte'
import { OngletHistorique } from '@/components/compte/OngletHistorique'
import { OngletFichiers } from '@/components/compte/OngletFichiers'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { DialogSuppression } from '@/components/ui/dialog-suppression'
import { PdlMethodSheet, type PdlMethode } from '@/components/compteur/PdlMethodSheet'
import { CreateRecommandationDialog } from '@/pages/Recommandations'
import { DialogCreationOpportunite } from '@/pages/Opportunites'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { InlineField } from '@/components/ui/inline-field'
import { ExplicationCalcul } from '@/components/ui/explication-calcul'
import { CreationCompteurDialog } from '@/components/compteur/CreationCompteurDialog'
import {
  useCompte,
  useComptesRattachables,
  useUpdateCompteScore,
  useUpdateCompteClient,
  useUpdateCompteFournisseur,
  useUpdateComptePartenaire,
  useUpdateCompte,
  useUpdateCompteField,
  useDeleteCompte,
  findCompteBySiret,
  majConditionsFournisseur,
  decouperCodes,
} from '@/lib/data/comptes'
import { useContactsParCompte } from '@/lib/data/contacts'
import { useCompteursParCompte } from '@/lib/data/compteurs'
import { useRecommandationsParCompte } from '@/lib/data/recommandations'
import { useContratsParCompte } from '@/lib/data/contrats'
import { useInteractionsForCompte } from '@/lib/data/interactions'
import { useMandatsParCompte } from '@/lib/data/mandats'
import { useActionsParSites, useActionsParCompte } from '@/lib/data/actions'
import type { ActionItem } from '@/types/domain'
import { useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { useHistorique } from '@/lib/data/historique'
import { useEllisphereScore } from '@/lib/data/ellisphere'
import { useReferenceTable } from '@/lib/data/referenceTables'
import {
  FALLBACK_STATUTS_MANDATS,
  STATUT_MANDAT_TONE,
  FALLBACK_TYPES_DOCUMENTS,
} from '@/lib/referenceFallbacks'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { ActivityFeed } from '@/components/site/ActivityFeed'
import { cn } from '@/lib/utils'
import { useGoBack } from '@/lib/useGoBack'
import type { Compte, Site, TypeCompte, Contrat, Compteur, Recommandation } from '@/types/domain'
import { OngletContacts } from '@/components/compte/OngletContacts'
import { OngletCompteurs } from '@/components/compte/OngletCompteurs'
import { BandeauCompte } from '@/components/compte/BandeauCompte'
import { MentionProprietaire } from '@/components/ui/mention-proprietaire'
import { useMesuresDuParc } from '@/lib/data/parcDuCompte'
import { useOptionsTypologie } from '@/lib/data/segmentsComptes'
import { useNoterConsultation } from '@/lib/data/consultationsRecentes'

const typeMeta: Record<TypeCompte, { label: string; tone: 'kiwi' | 'blue' | 'amber' | 'neutral' }> = {
  client: { label: 'Consommateur', tone: 'kiwi' },
  fournisseur: { label: 'Fournisseur', tone: 'blue' },
  partenaire: { label: 'Partenaire', tone: 'amber' },
  kiwee: { label: 'KiWee', tone: 'neutral' },
}

// Distinction graphique franche entre Client / Fournisseur / Partenaire / KiWee (demande design
// William) : un badge à pastille dédié par type, au lieu d'un badge bleu unique pour tous les
// types. Valeurs "client" mesurées pixel pour pixel dans la référence ; fournisseur/partenaire/
// kiwee dérivées du même jeu de tokens faute d'exemple de référence pour ces types (à valider
// visuellement). L'icône "compte" (dalle bleue Building2) ne varie pas : c'est la couleur de
// l'objet, pas du sous-type, cf. charte iconographique du handoff.
/**
 * Le bloc « Commentaire » de l'onglet Compte, masqué le 13/09/2026 à la demande de William.
 *
 * ANNOTÉ `boolean` ET NON LAISSÉ À `false` : au type littéral, TypeScript considère la branche comme
 * morte et cesse d'y appliquer le rétrécissement de types — `compte` y redevient `Compte | undefined`
 * et la compilation échoue. Au type `boolean`, la branche reste vivante pour le vérificateur, ce qui
 * est exactement ce qu'on veut d'un interrupteur qu'on rallumera peut-être.
 */
const AFFICHER_COMMENTAIRE: boolean = false

/**
 * Les onglets « Contrats » et « Mandats », masqués le 14/09/2026 à la demande de William.
 *
 * MASQUÉS, PAS SUPPRIMÉS : leur contenu, leurs requêtes et leurs badges restent en place, et une
 * seule valeur les fait revenir. Retirer le code aurait coûté une reconstruction le jour où la
 * question se repose — et elle se reposera, ces deux objets étant au cœur du métier.
 *
 * ANNOTÉ `boolean` ET NON LAISSÉ AU LITTÉRAL `false` : au type littéral, TypeScript considère les
 * branches comme mortes et cesse d'y appliquer le rétrécissement de types — `compte` y redevient
 * `Compte | undefined` et la compilation échoue. Même raison qu'au-dessus.
 */
const AFFICHER_CONTRATS_ET_MANDATS: boolean = false

type TabKey = 'synthese' | 'detail' | 'contacts' | 'contrats' | 'compteurs' | 'opportunites' | 'recommandations' | 'mandats' | 'fichiers' | 'historique' | 'activite'

/* `copyToClipboard` est parti avec `InfoFieldKw`, son dernier appelant (22/09/2026). La copie
   n'est pas perdue pour autant : `InlineField`, qui prend la relève sur le SIRET et le SIREN,
   la porte déjà. */

export default function CompteDetail() {
  const creerUnCompte = useCreerUnCompte()
  const creerUnContact = useCreerUnContact()
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: compte, isLoading: compteEnCours } = useCompte(id)
  /* Le menu « Créer » de la barre du haut ne sait pas sur quelle fiche il est posé. Cette ligne
     le lui dit, pour qu'un contact créé d'ici parte avec le bon client. */
  useDeclarerCompteCourant(compte?.id, compte?.nom)

  /* La fiche signale son ouverture : c'est ce qui alimente les « Récents » de la palette.
     L'écriture part en arrière-plan et attend que le nom soit chargé — voir consultationsRecentes.ts. */
  useNoterConsultation({
    type: 'compte',
    id: compte?.id,
    libelle: compte ? compte.nom : null,
    sousLibelle: compte ? compte.ville ?? compte.segment : null,
    chemin: `/comptes/${id}`,
  })
  /* L'APPORTEUR N'EST PLUS LU ICI. Il n'était affiché que dans « Détails consommateur », retiré le
     11/09/2026 : garder la requête reviendrait à charger un second compte entier à chaque ouverture
     de fiche pour un nom que plus rien n'affiche. Le champ reste en base, et le formulaire de
     modification du sous-type le lit pour son propre compte. */
  /* ══ LA FICHE COMPTE NE LIT PLUS LA TABLE `sites` ═══════════════════════════════════════

     Elle chargeait les sites du compte, puis les compteurs DE CES SITES — deux lectures en
     chaîne, la seconde attendant la première. Le commentaire d'alors disait pourquoi : « les
     compteurs n'ayant pas de compte_id, ils passent par les sites du compte ». La migration
     20260909160000 a posé ce `compte_id`, `not null` sur les 7 923 compteurs : le détour n'a
     plus de raison d'être, et il faisait dépendre la fiche d'une table qu'on supprime.

     LES GROUPES D'ADRESSE SE DÉDUISENT DES COMPTEURS (voir `groupesDAdresse` plus bas), ce qui
     conserve à l'identique les regroupements de l'onglet Compteurs, ceux de l'onglet Contrats
     et la carte — `groupe_site_id` reprend l'ancien `sites.id`, donc tous les `site_id`
     stockés ailleurs continuent de correspondre. */
  const { data: contacts } = useContactsParCompte(id)
  const { data: compteurs } = useCompteursParCompte(id)
  // Toutes ces lectures sont restreintes au perimetre du compte, cote serveur.
  //
  // Elles appelaient les hooks globaux (useSignaux, useRecommandations, useContrats, useMandats,
  // useActions, useDocuments) et filtraient le resultat en memoire, ce qui revenait a telecharger
  // le CRM entier pour afficher une fiche : 56 requetes mesurees le 14/08/2026 sur CABINET
  // MOLINIER, dont neuf rien que pour les documents et douze tables pour les recommandations. Les
  // postes les plus lents n'y arrivaient pas du tout -- fetchAllRows reessaie deux fois puis
  // abandonne, d'ou une fiche qui restait vide et trois 500 dans la console.
  const { data: recommandations } = useRecommandationsParCompte(id)
  const { data: contrats } = useContratsParCompte(id)
  const { data: mandats } = useMandatsParCompte(id)
  /* Les actions portent un `site_id` : on lui donne les groupes d'adresse déduits des
     compteurs, qui sont les mêmes identifiants. */
  const idsGroupesAdresse = useMemo(
    () => (compteurs ? [...new Set(compteurs.map((c) => c.site_id).filter(Boolean))] : undefined),
    [compteurs],
  )
  /* ══ DEUX SOURCES, UNE SEULE LISTE ══
     Une tâche peut viser une adresse du client (`site_id`) ou le client lui-même (`compte_id`).
     La fiche ne lisait que la première : les 258 tâches reprises de Salesforce le 14/09/2026, qui
     ne portent qu'un compte, n'apparaissaient nulle part.

     On déduplique par identifiant : une tâche qui porte les deux liens — c'est le cas de celles
     qu'on crée depuis la fiche — remonterait sinon deux fois. */
  const { data: actionsDesAdresses } = useActionsParSites(idsGroupesAdresse)
  const { data: actionsPortantLeCompte } = useActionsParCompte(id)
  const actions = useMemo(() => {
    const parId = new Map<string, ActionItem>()
    for (const a of [...(actionsDesAdresses ?? []), ...(actionsPortantLeCompte ?? [])]) parId.set(a.id, a)
    return [...parId.values()]
  }, [actionsDesAdresses, actionsPortantLeCompte])
  // Les documents sont polymorphes : ceux du compte, mais aussi ceux de ses sites, compteurs et
  // mandats, que l'onglet Fichiers et le fil d'activite affichent.
  const entitesPourDocuments = useMemo(() => {
    if (!id || !compteurs) return undefined
    return [id, ...(idsGroupesAdresse ?? []), ...compteurs.map((c) => c.id), ...(mandats ?? []).map((m) => m.id)]
  }, [id, idsGroupesAdresse, compteurs, mandats])
  const { data: documents } = useDocumentsParEntites(entitesPourDocuments)
  const ellisphereScore = useEllisphereScore()
  const updateScore = useUpdateCompteScore()
  const deleteCompte = useDeleteCompte()
  const updateCompte = useUpdateCompte()
  const goBack = useGoBack('/comptes')

  const { data: statutsMandatsRef } = useReferenceTable('statuts_mandats')
  const statutsMandats = statutsMandatsRef && statutsMandatsRef.length > 0 ? statutsMandatsRef : FALLBACK_STATUTS_MANDATS

  /**
   * ══ L'ONGLET PEUT VENIR DE L'ADRESSE ══
   *
   * `?tab=compteurs` était déjà écrit dans le lien « Tout voir dans Compteurs » de la zone
   * « À traiter » — sans que personne ne le lise. Le lien ramenait donc sur l'onglet Compte, ce qui
   * ressemble à un bouton cassé. C'est ma faute, du 13/09 ; elle se voit aujourd'hui parce qu'on
   * masque des onglets et que j'ai regardé qui pointait vers eux.
   *
   * LA VALEUR EST VÉRIFIÉE CONTRE LES ONGLETS RÉELLEMENT VISIBLES : un lien vers un onglet masqué —
   * ou une adresse inventée — ouvrirait sinon une page vide, sans barre active et sans rien dedans.
   * On reste alors sur « Compte », qui existe toujours.
   */
  const [parametres] = useSearchParams()
  const [tab, setTab] = useState<TabKey>('synthese')
  const [toast, setToast] = useState<string | null>(null)
  const [showEditSubtype, setShowEditSubtype] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Voir HubCreation : le hub s'approprie le clavier quand il est ouvert, « R » notamment.
  const televerser = useTeleverserDocuments()
  const { data: typesDocumentsRef } = useReferenceTable('types_documents')
  const typesDocuments = typesDocumentsRef && typesDocumentsRef.length > 0 ? typesDocumentsRef : FALLBACK_TYPES_DOCUMENTS
  const [addCompteurOpen, setAddCompteurOpen] = useState(false)
  const [pdlMethodOpen, setPdlMethodOpen] = useState(false)
  const [pdlMethode, setPdlMethode] = useState<PdlMethode>('manuel')
  const [addMandatOpen, setAddMandatOpen] = useState(false)
  const [addRecoOpen, setAddRecoOpen] = useState(false)
  const [addOppOpen, setAddOppOpen] = useState(false)

  // Ouvre automatiquement « Nouveau compteur » pour qui arrive avec `?action=ajouter-compteur`.
  // C'était le relais de l'assistant pleine page `CompteCreate`, supprimé le 24/09/2026 : son
  // étape « que faire maintenant ? » déposait ici. Le parcours en fenêtre, lui, pose contacts et
  // compteurs sans quitter la modale. Le paramètre reste : c'est un lien valable, et il ne coûte
  // rien à qui ne l'emploie pas.
  useEffect(() => {
    if (searchParams.get('action') === 'ajouter-compteur') {
      setAddCompteurOpen(true)
      setSearchParams((prev) => { prev.delete('action'); return prev }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* La mutation d'un champ de compte, déjà utilisée par les cartes filles. Elle sert ici au taux
     de partage de la marge, saisi directement dans le bloc « Fournisseur ». */
  const updateField = useUpdateCompteField()
  /* Les comptes du CRM, pour le rattachement fournisseur ↔ intermédiaire. Huit partenaires et
     cinquante-deux fournisseurs — lus par `useComptesRattachables`, qui ne rapporte que ces
     soixante lignes et quatre colonnes. `useComptes()` rapportait les 2 782 comptes avec leurs
     quatre jointures, en trois allers-retours. */
  const { data: comptesTous } = useComptesRattachables()

  /* ══ LES DEUX LISTES QUE LE RATTACHEMENT DEMANDE ══
     Sur une fiche FOURNISSEUR, le sélecteur propose les comptes partenaires. Sur une fiche
     PARTENAIRE, on montre en retour les fournisseurs qui pointent vers lui : c'est la seule façon
     de voir d'un coup d'œil si le rattachement des 52 fournisseurs est complet. */
  const partenaires = useMemo(
    () => (comptesTous ?? []).filter((c) => c.type_compte === 'partenaire' && c.id !== id),
    [comptesTous, id],
  )
  const fournisseursDeLIntermediaire = useMemo(
    () => (comptesTous ?? []).filter((c) => c.intermediaire_partenaire_id === id),
    [comptesTous, id],
  )

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }


  // ── Héro Ellipro ────────────────────────────────────────────────────────────────────────────
  // Le score Ellisphere est stocké en texte mais vaut bien 0 à 10 en base (vérifié sur les 2008
  // comptes notés), donc directement exploitable comme note sur 10 par la maquette.
  const noteEllipro = compte?.score_ellipro != null && compte.score_ellipro !== '' ? Number(compte.score_ellipro) : null
  const libelleEllipro =
    noteEllipro === null
      ? 'Jamais interrogé'
      : noteEllipro >= 8
        ? 'Solidité confirmée'
        : noteEllipro >= 6
          ? 'Situation saine'
          : noteEllipro >= 4
            ? 'À surveiller'
            : 'Risque élevé'

  // La maquette montre trois faits : encours conseillé, incidents sur 24 mois, risque de
  // défaillance. Seul le dernier est dérivable de ce que Kimatch possède. `limite_ellipro` porte
  // un nom d'encours mais ne va que de 0 à 7 sur 26 comptes : ce n'est pas un montant, l'afficher
  // en euros serait faux. Les incidents de paiement ne sont pas repris du tout.
  /* LA DÉPENDANCE EST LA CHAÎNE, PAS L'OBJET `Date`. Un `new Date(...)` construit un nouvel objet à
     chaque rendu : passé en dépendance d'un `useMemo`, il le ferait recalculer à chaque fois — ce
     que l'outil de vérification des crochets signale à juste titre. La chaîne, elle, est stable. */
  const majEllipro = compte?.score_ellipro_maj ?? null

  const faitsEllipro: FaitEllipro[] = useMemo(() => {
    if (noteEllipro === null) return []
    const maj = majEllipro ? new Date(majEllipro) : null
    return [
      {
        libelle: 'Risque de défaillance',
        aide: 'Déduit de la note Ellisphere à 12 mois',
        valeur: noteEllipro >= 7 ? 'Faible' : noteEllipro >= 4 ? 'Modéré' : 'Élevé',
      },
      { libelle: 'Note', aide: 'Note Ellisphere sur 10', valeur: `${noteEllipro} / 10` },
      /* ══ LA DATE DE LA NOTE EST DANS LA CARTE, PAS SOUS ELLE ══
         William, 11/09/2026 : « ajouter la date de la dernière MAJ de la note ». Elle existait —
         sous l'intitulé « Dernière interrogation », dans un bloc gris deux cartes plus bas. Une
         note de solvabilité sans sa date ne veut rien dire : un 5/10 relevé ce matin et un 5/10
         relevé il y a huit mois n'engagent pas du tout au même niveau de confiance. Elle appartient
         donc à la carte qui porte la note.

         LA DATE SEULE, SANS L'HEURE. Le bloc supprimé écrivait « 11/09/2026 10:28:15 » : la seconde
         d'une interrogation Ellisphere n'a jamais servi à personne, et elle coûtait la moitié de la
         largeur du pied de carte. */
      ...(maj
        ? [{
            libelle: 'Mise à jour',
            aide: `Dernière interrogation d'Ellisphere le ${maj.toLocaleString('fr-FR')}`,
            valeur: maj.toLocaleDateString('fr-FR'),
          }]
        : []),
    ]
  }, [noteEllipro, majEllipro])
  const canManage = useCanManage(compte?.proprietaire_id)
  /* L'HISTORIQUE N'EST PLUS UN ONGLET. William, 14/09/2026 : « je préfère en faire un bouton
     permettant d'afficher une popup avec tout l'historique de modification de champs ». Il occupait
     une place permanente dans la barre pour une consultation rare — et surtout, on n'y va jamais
     « pour voir l'historique », on y va quand on se demande qui a changé une valeur. La question
     naît ailleurs ; la réponse doit venir par-dessus, pas en quittant l'onglet où on travaille.
     La lecture ne part qu'à l'ouverture de la fenêtre. */
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false)
  const { data: historique } = useHistorique('comptes', compte?.id, historiqueOuvert)

  /* LES ADRESSES DU COMPTE, DÉDUITES DE SES COMPTEURS. Même forme qu'avant — un objet par
     lieu, avec son identifiant, son nom et sa géolocalisation — pour que la carte et les
     regroupements ci-dessous n'aient pas à changer. Ce qui change, c'est la source. */
  const sitesDuCompte = useMemo(() => groupesDAdresse(compteurs ?? [], id), [compteurs, id])
  const siteIdsDuCompte = useMemo(() => new Set(sitesDuCompte.map((s) => s.id)), [sitesDuCompte])
  const siteIdsArray = useMemo(() => [...siteIdsDuCompte], [siteIdsDuCompte])
  // Fiche compte : on ne charge que les interactions de ce perimetre (pas la table entiere,
  // qui met plusieurs minutes a charger une fois tous les comptes Salesforce importes).
  const { data: interactionsDuCompte = [] } = useInteractionsForCompte(id, siteIdsArray)
  // Le rattachement se lit sur l'ensemble des comptes du contact, pas sur son seul compte
  // principal : c'est ce qui fait apparaître Romain HEBRARD sur DUHAMEL LOGISTIQUE, où il est
  // signataire sans y être rattaché à titre principal (demande de William du 13/08/2026).
  const contactsDuCompte = useMemo(
    () => contacts?.filter((c) => c.comptes.some((l) => l.id === id)) ?? [],
    [contacts, id],
  )
  const compteursDuCompte = useMemo(() => compteurs?.filter((c) => siteIdsDuCompte.has(c.site_id)) ?? [], [compteurs, siteIdsDuCompte])
  // Le contrat est lie directement au compte (decision Michel/William 31/07/2026), plus via site_id --
  // reste visible meme si ses compteurs ont change de cabinet entre-temps.
  const contratsDuCompte = useMemo(() => contrats?.filter((c) => c.compte_id === id) ?? [], [contrats, id])
  const recommandationsDuCompte = useMemo(() => recommandations?.filter((r) => r.compte_id === id) ?? [], [recommandations, id])
  /* ══ LES OPPORTUNITÉS DU COMPTE ══
     Naoëlle, 12/09/2026 : « quand je suis sur un compte je ne vois pas son onglet opportunité ».
     Il n'existait pas — huit onglets couvraient le contrat, le compteur, la recommandation et le
     mandat, mais pas l'objet qui les précède tous. On voyait donc le résultat d'une affaire sans
     jamais voir l'affaire elle-même. */
  const { data: toutesOpportunites } = useOpportunites()
  const opportunitesDuCompte = useMemo(
    () => (toutesOpportunites ?? []).filter((o) => o.compte_id === id),
    [toutesOpportunites, id],
  )
  const mandatsDuCompte = useMemo(() => mandats?.filter((m) => m.compte_id === id) ?? [], [mandats, id])
  /* UNE TÂCHE DU CLIENT PASSE PAR L'UNE OU L'AUTRE PORTE. Ce filtre ne gardait que celles dont le
     SITE appartient au compte — les 258 tâches reprises de Salesforce le 14/09/2026 n'ont pas de
     site, elles étaient lues puis rejetées ici. Le rattachement direct au compte compte autant. */
  const actionsDuCompte = useMemo(
    () => actions.filter((a) => siteIdsDuCompte.has(a.site_id ?? '') || a.compte_id === id),
    [actions, siteIdsDuCompte, id],
  )
  const documentsDuCompte = useMemo(() => documents?.filter((d) => d.entite_type === 'compte' && d.entite_id === id) ?? [], [documents, id])


  async function handleScoreClick() {
    if (!compte?.siren) return
    const score = await ellisphereScore.mutateAsync(compte.siren)
    updateScore.mutate({ compteId: compte.id, score })
  }

  const suppression = useSuppression()

  function handleDelete() {
    if (!compte) return
    suppression.supprimer(
      () => deleteCompte.mutateAsync(compte.id),
      () => navigate('/comptes'),
    )
  }

  const TABS: { key: TabKey; label: string; labelMobile?: string; badge?: string; mobileOnly?: boolean }[] = [
    { key: 'synthese', label: 'Compte' },
    /* ══ « DÉTAIL » PREND LA FICHE SIGNALÉTIQUE ══
       William, 11/09/2026 : « créer un nouvel onglet nommé Détail et mets-y pour le moment le bloc
       Identité ».

       Le premier onglet répondait à deux questions à la fois — « qui est ce compte ? » et « qu'y
       a-t-il à y faire ? » — et la première prenait la place de la seconde. SIREN, code NAF et
       typologie se consultent une fois, à la prise en main du dossier ; ce qu'il y a à traiter se
       regarde chaque semaine. Les séparer met le travail devant. */
    { key: 'detail', label: 'Détail' },
    /* Les contacts sortent du volet gauche pour rejoindre les autres objets liés (Michel et
       Naoëlle, 31/08/2026). Ils occupaient 300 px en permanence sur les huit onglets, y compris
       ceux où l'on ne travaille pas sur les personnes. */
    { key: 'contacts', label: 'Contacts', badge: contactsDuCompte.length ? String(contactsDuCompte.length) : undefined },
    ...(AFFICHER_CONTRATS_ET_MANDATS
      ? [{ key: 'contrats' as const, label: 'Contrats', badge: contratsDuCompte.length ? String(contratsDuCompte.length) : undefined }]
      : []),
    { key: 'compteurs', label: 'Compteurs', badge: compteursDuCompte.length ? String(compteursDuCompte.length) : undefined },
    /* AVANT les recommandations, parce que c'est l'ordre du parcours : l'opportunité se convertit
       EN recommandations. Les lire dans l'autre sens ferait chercher la cause après l'effet. */
    { key: 'opportunites', label: 'Opportunités', labelMobile: 'Oppos', badge: opportunitesDuCompte.length ? String(opportunitesDuCompte.length) : undefined },
    { key: 'recommandations', label: 'Recommandations', labelMobile: 'Recos', badge: recommandationsDuCompte.length ? String(recommandationsDuCompte.length) : undefined },
    ...(AFFICHER_CONTRATS_ET_MANDATS
      ? [{ key: 'mandats' as const, label: 'Mandats', badge: mandatsDuCompte.length ? String(mandatsDuCompte.length) : undefined }]
      : []),
    { key: 'fichiers', label: 'Fichiers', badge: documentsDuCompte.length ? String(documentsDuCompte.length) : undefined },
    { key: 'activite', label: 'Activité', mobileOnly: true },
  ]

  /* Les quatre mesures du bandeau. Elles étaient en héros de l'onglet Compteurs ; les remonter les
     rend visibles depuis tous les onglets, et les afficher aux deux endroits aurait fait lire deux
     fois le même chiffre. */
  const mesuresDuParc = useMesuresDuParc(compte?.id, compteursDuCompte)


  // Une seule fois, à l'ouverture : revenir sur la page ne doit pas ramener l'onglet de l'adresse
  // par-dessus celui qu'on vient de choisir à la main.
  const ongletDeLAdresse = parametres.get('tab')
  const ongletsVisibles = useRef<TabKey[]>([])
  ongletsVisibles.current = TABS.map((o) => o.key)
  const adresseAppliquee = useRef(false)
  useEffect(() => {
    if (adresseAppliquee.current || !ongletDeLAdresse) return
    adresseAppliquee.current = true
    if (ongletsVisibles.current.includes(ongletDeLAdresse as TabKey)) setTab(ongletDeLAdresse as TabKey)
  }, [ongletDeLAdresse])

  /* ══ LES RACCOURCIS À UNE TOUCHE SONT PARTIS (16/09/2026) ══
     William : « oublie les raccourcis clavier, même pour le Cockpit et pour tout le reste de l'app
     qui reste à coder. La navigation se fera au clic uniquement. » Ils n'ont jamais servi en
     production.

     CETTE FICHE EN AVAIT DEUX, et personne ne l'avait vu — précisément parce que personne ne s'en
     servait : `useRaccourcisOnglets` lisait 1 à 9, et cet écouteur-ci relisait 1 à 7 pour son propre
     compte, avec sa propre table d'onglets à tenir d'accord avec la première.

     Seule l'ouverture de la RECHERCHE garde une entrée au clavier — c'est la seule exception que
     William a retenue, et elle n'agit sur rien : elle ouvre un panneau qui n'exécute qu'à Entrée. */


  if (compteEnCours) {
    return (
      <div>
        <TitreOnglet crumb="Comptes" title="Compte" />
        <div className="p-4 sm:p-6"><p className="text-sm text-km-faint">Chargement…</p></div>
      </div>
    )
  }

  if (!compte) {
    return (
      <div>
        <TitreOnglet crumb="Comptes" title="Compte" />
        <div className="p-4 sm:p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Retour aux comptes
          </Button>
          {/* « Introuvable » a envoye tout le monde sur une fausse piste pendant deux jours : le
              compte existait, il etait hors du perimetre de visibilite de Marie, et la fiche
              restait muette. La restriction est levee depuis, mais le message doit rester explicite
              sur les deux causes possibles. */}
          <p className="text-sm text-km-muted">
            Ce compte n'existe pas, ou vous n'y avez pas accès. Si un collègue vous l'a partagé,
            demandez à un administrateur de vérifier vos droits.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TitreOnglet crumb="Comptes" title={compte.nom} />

      {/* ══ LE BANDEAU ══ voir BandeauCompte.tsx pour le raisonnement de la refonte. */}
      <BandeauCompte
        mesures={mesuresDuParc}
        canManage={canManage}
        onRetour={goBack}
        onModifier={() => setEditOpen(true)}
        onSupprimer={() => setConfirmDelete(true)}
        onHistorique={() => setHistoriqueOuvert(true)}
        titre={
          canManage ? (
            <InlineField
              variant="text"
              value={compte.nom}
              onCommit={(nom) => updateCompte.mutateAsync({ id: compte.id, nom, ville: compte.ville, segment: compte.segment, proprietaire_id: compte.proprietaire_id ?? null })}
              onSaved={() => showToast('✓ enregistré')}
              onError={(err) => showToast(`Erreur : ${err.message}`)}
              className="text-[19px] font-bold leading-tight tracking-[-.02em] text-km-text"
            />
          ) : (
            compte.nom
          )
        }
        pastilles={
          <>
            {/* LES DEUX CARTOUCHES REMONTENT EN TAILLE. William, 14/09/2026 : ils étaient en
                `text-km-tiny`, ce qui les faisait lire comme des annotations alors qu'ils portent
                ce que le compte EST — sa typologie et sa nature. Un cran de police, un peu d'air
                autour, et ils se lisent à hauteur du nom sans le concurrencer. */}
            {compte.segment && (
              <span className="rounded-km bg-km-blue-soft px-2 py-0.5 text-km-label font-semibold text-km-blue">{compte.segment}</span>
            )}
            {/* ══ CLIENT OU PROSPECT, PAS « CONSOMMATEUR » ══
                William, 14/09/2026 : « remplace la cartouche Consommateur par la cartouche statut
                (client/prospect) ». « Consommateur » redisait le type de compte, que la fiche porte
                déjà partout ailleurs ; le statut, lui, dit s'il y a du chiffre d'affaires en cours.

                IL SE DÉDUIT DU PARC, comme au niveau du compteur : est client un compte dont au
                moins un compteur est couvert par un contrat actif et non échu. Aucune saisie, donc
                aucune dérive possible entre l'étiquette et la réalité. */}
            {mesuresDuParc.total > 0 && (
              mesuresDuParc.clients > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-km border border-km-green-line bg-km-green-soft px-2 py-0.5 text-km-label font-semibold text-km-green">
                  <BadgeCheck className="h-3 w-3" strokeWidth={2.2} /> Client
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-km border border-km-line bg-km-soft px-2 py-0.5 text-km-label font-semibold text-km-muted">
                  <Target className="h-3 w-3" strokeWidth={2.2} /> Prospect
                </span>
              )
            )}
          </>
        }
        proprietaire={<RecordMetaCard compte={compte} canManage={canManage} onToast={showToast} />}
        actionCreer={
          /* Les six créations passent par le hub. Les conditions d'accès deviennent des infobulles
             sur la ligne concernée, plutôt que des boutons grisés dont on ne devinait pas la raison. */
          <HubCreation
            indisponibles={{
              mandat: compteursDuCompte.length === 0 ? 'Aucun compteur sur ce compte — un mandat couvre des PDL' : undefined,
              recommandation: !mandatsDuCompte.some((m) => m.statut === 'ACTIF')
                ? 'Aucun mandat actif — requis pour lancer une recommandation'
                : undefined,
            }}
            onAction={(cle) => {
              if (cle === 'compte') creerUnCompte()
              if (cle === 'contact') creerUnContact({ compte: { id: compte.id, nom: compte.nom } })
              if (cle === 'compteur') setPdlMethodOpen(true)
              if (cle === 'mandat') setAddMandatOpen(true)
              if (cle === 'opportunite') setAddOppOpen(true)
              if (cle === 'recommandation') setAddRecoOpen(true)
            }}
          />
        }
        onglets={
          <div className="grid grid-cols-1 border-b border-km-line lg:grid-cols-fiche-activite">
            <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto px-4 pt-1.5 sm:px-[22px]">
              {TABS.map((o) => {
                const isActive = tab === o.key
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setTab(o.key)}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-[13px] py-[9px] text-km-name transition-colors',
                      o.mobileOnly && 'lg:hidden',
                      isActive ? 'border-km-text font-semibold text-km-text' : 'border-transparent font-normal text-km-muted hover:text-km-text',
                    )}
                  >
                    <span className="lg:hidden">{o.labelMobile ?? o.label}</span>
                    <span className="hidden lg:inline">{o.label}</span>
                    {o.badge && (
                      <span className="rounded-km-sm bg-km-soft px-[5px] py-px text-km-tiny font-bold text-km-muted">{o.badge}</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="hidden items-center border-b-2 border-km-text px-3 lg:flex">
              <span className="truncate text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
                Activité · portefeuille
              </span>
            </div>
          </div>
        }
      />

      {/* ══ LES ZONES — ET LA RANGÉE QUI LES CONTIENT ══
          William, 15/09/2026 : « le contenu est coupé net en bas, il continue mais tu ne peux pas
          l'atteindre » — dans le volet d'activité de droite.

          LA CAUSE N'ÉTAIT PAS DANS LES COLONNES, ELLE ÉTAIT DANS LA RANGÉE. Les deux colonnes
          avaient bien leur chaîne de `min-h-0` et leur `overflow-y-auto` au bon endroit. Mais cette
          grille n'a qu'une rangée IMPLICITE, donc dimensionnée en `auto` — c'est-à-dire à la
          hauteur de son contenu le plus haut. Quand le fil d'activité dépasse la fenêtre, la rangée
          grandit avec lui, les colonnes s'étirent à cette hauteur-là, et plus personne n'a besoin
          de défiler : chaque boîte contient exactement son contenu. C'est l'`overflow-hidden` de la
          grille qui coupe, tout en bas, sans barre de défilement.

          `minmax(0, 1fr)` FORCE LA RANGÉE À LA HAUTEUR DISPONIBLE et l'autorise à descendre sous la
          taille de son contenu — les deux moitiés comptent. Sans le `minmax(0, …)`, un `1fr` garde
          un minimum automatique égal au contenu, et le défaut reste entier.

          Le défaut était latent : il ne se voyait que lorsque le fil dépassait la hauteur de
          l'écran, ce qui dépend du compte ouvert et de la taille de la fenêtre. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden lg:grid-cols-fiche-activite">
        {/* Centre — contenu de l'onglet */}
        <div className="min-h-0 overflow-y-auto bg-km-bg p-4 sm:p-5">
          {tab === 'contacts' && (
            <OngletContacts
              contacts={contactsDuCompte}
              compteId={compte.id}
              compteNom={compte.nom}
              segment={compte.segment ?? null}
              /* AVANT, CE BOUTON QUITTAIT LA FICHE pour la liste des contacts, en lui passant
                 le compte dans un état de navigation. Le parcours s'ouvre par-dessus l'onglet, et
                 le compte de la fiche y est déjà renseigné. */
              onNouveauContact={() => creerUnContact({ compte: { id: compte.id, nom: compte.nom } })}
            />
          )}

          {tab === 'synthese' && (
            <div className="flex flex-col gap-3.5">
              {/* Les deux héros, dans la grille de la maquette : ils se répartissent la largeur et
                  passent l'un sous l'autre en dessous de 240px chacun. */}
              {/* ══ LE COMMENTAIRE EST MASQUÉ, PAS SUPPRIMÉ ══
                  William, 13/09/2026 : « masque le champ commentaire (ne le supprime pas) ».

                  Il occupait la première ligne de l'onglet — la place qui revient maintenant à ce
                  qu'il y a à faire sur le compte. Le champ existe toujours en base, `CommentaireCard`
                  aussi, et les commentaires déjà saisis sont intacts : il suffit de retirer le
                  `false &&` pour que le bloc revienne.

                  UN INTERRUPTEUR PLUTÔT QU'UNE LIGNE COMMENTÉE : TypeScript continue de vérifier
                  le composant et ses props. Une ligne mise en commentaire se périme en silence, et
                  l'on s'en aperçoit le jour où on la réactive. */}
              {AFFICHER_COMMENTAIRE && <CommentaireCard compte={compte} />}
              {/* ══ CE QU'IL Y A À FAIRE PASSE AVANT CE QU'ON EST ══
                  La zone ne s'affiche que si elle a quelque chose à dire : 4 comptes sur 5 n'ont
                  aucune échéance en souffrance, et un cadre vide use le signal — on finit par ne
                  plus regarder une zone qu'on a vue vide vingt fois. Voir `ZoneATraiter`. */}
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(240px,100%),1fr))' }}>
                {/* LA QUALITÉ NE CONCERNE QUE LES CONSOMMATEURS. Trouvé le 02/09/2026 en listant
                    les comptes sans propriétaire : les vingt étaient des fournisseurs d'énergie.
                    Un fournisseur n'a ni compteur ni échéance à tenir — la carte y afficherait un 0
                    rouge sur Vattenfall, ce qui se lirait comme un reproche au lieu d'un
                    « sans objet ». Les vues de qualité sont désormais restreintes au type
                    consommateur (migration 20260902150000), et la carte suit la même règle : mieux
                    vaut ne rien montrer qu'un chiffre qui n'a pas de sens ici. */}
                {compte.type_compte === 'client' && <QualiteCompteCard compte={compte} />}
                <HeroScoreEllipro
                  note={noteEllipro}
                  libelle={libelleEllipro}
                  faits={faitsEllipro}
                  onActualiser={compte.siren && !ellisphereScore.isPending ? handleScoreClick : undefined}
                />
              </div>

              {/* ══ L'ORDRE DES TROIS ZONES EST CELUI DE L'URGENCE ══
                  À TRAITER    ce qu'on est en train de perdre — rien n'est lancé
                  EN COURS     ce qui avance, et ce qui n'avance plus
                  PORTEFEUILLE ce qui arrive, sur deux ans

                  Chacune ne s'affiche que si elle a quelque chose à dire. Un compte tranquille
                  montre sa frise et rien d'autre ; un compte chargé déroule les trois. */}
              <ZoneATraiter compteId={compte.id} onCreerOpportunite={() => setAddOppOpen(true)} />
              <ZoneEnCours compteId={compte.id} />
              <ZonePortefeuille
                compteId={compte.id}
                nbCompteurs={compteursDuCompte.length}
                nbContrats={contratsDuCompte.length}
              />



              {/* ══ CE QUI RESTE DE L'ANCIEN BLOC « DERNIÈRE INTERROGATION » ══
                  William, 11/09/2026 : « supprimer les blocs Dernière interrogation, Détails
                  consommateur et Historique de la relation ».

                  Le bloc portait quatre choses, et trois avaient une meilleure place :
                    · la DATE de la note est montée dans la carte Ellipro, à côté de la note ;
                    · l'ABSENCE DE SIREN et les ERREURS D'INTERROGATION répondent au bouton
                      d'actualisation, qui est sur cette carte : elles restent, juste en dessous,
                      et elles ne s'affichent QUE s'il y a quelque chose à dire ;
                    · l'HISTORIQUE DES MODIFICATIONS a déjà son onglet, tout en haut de la fiche.

                  Ce qui reste ici n'occupe donc plus rien tant que tout va bien — et c'était le
                  reproche : un cadre permanent pour une ligne grise qu'on ne lisait jamais. */}
              {(!compte.siren || ellisphereScore.isPending || ellisphereScore.isError || updateScore.isSuccess) && (
                <div className="rounded-xl border border-km-line bg-km-surface px-4 py-2.5">
                  {!compte.siren && (
                    <p className="text-xs text-km-faint">Aucun SIREN renseigné — impossible d'interroger Ellisphere.</p>
                  )}
                  {ellisphereScore.isPending && <p className="text-xs text-km-faint">Interrogation d'Ellisphere…</p>}
                  {ellisphereScore.isError && <p className="text-xs text-km-red">{(ellisphereScore.error as Error).message}</p>}
                  {updateScore.isSuccess && (
                    <p className="text-km-xs text-km-faint">
                      {updateScore.data.changed ? 'Score mis à jour.' : 'Score inchangé depuis la dernière interrogation.'}
                    </p>
                  )}
                </div>
              )}

              {/* ══ « DÉTAILS CONSOMMATEUR » A ÉTÉ RETIRÉ, PAS LE BLOC ══
                  William, 11/09/2026 : « supprimer les blocs Dernière interrogation, Détails
                  consommateurs et Historique de la relation ».

                  LE BLOC SERVAIT TROIS TYPES DE COMPTE. Le supprimer entièrement aurait emporté les
                  détails FOURNISSEUR — dont le taux de répartition de la marge, qui ne se saisit
                  nulle part ailleurs — et les détails PARTENAIRE. Seule la variante consommateur
                  part ; les deux autres restent intactes.

                  CE QUI DISPARAÎT DE LA FICHE D'UN CONSOMMATEUR : segment, conseiller référent,
                  origine d'acquisition, mandat-cadre actif, apporteur d'affaires et note interne.
                  Les données restent en base et le formulaire de modification les édite toujours —
                  c'est l'affichage permanent qui s'arrête. */}
              {compte.type_compte !== 'kiwee' && compte.type_compte !== 'client' && (
                <div className="rounded-xl border border-km-line bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    {/* Même garde : sans type, l'intitulé dit « Détails » tout court plutôt que de planter. */}
                    <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Détails {(typeMeta[compte.type_compte]?.label ?? '').toLowerCase()}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowEditSubtype(true)}>
                      <Pencil className="h-3.5 w-3.5" /> Modifier
                    </Button>
                  </div>
                  <div className="space-y-1.5 text-xs text-km-text">
                    {compte.type_compte === 'fournisseur' && (
                      <>
                        <p><span className="text-km-faint">Fournit :</span> {[compte.fournit_electricite && 'Électricité', compte.fournit_gaz && 'Gaz'].filter(Boolean).join(', ') || '—'}</p>
                        <p><span className="text-km-faint">Contact commercial :</span> {compte.contact_commercial_nom || '—'}</p>
                        <p><span className="text-km-faint">Statut partenariat :</span> <Badge tone="neutral">{compte.statut_partenariat || 'À qualifier'}</Badge></p>
                        {/* LA NOTE ELLISPHERE MINIMALE : le critère qui écarte le plus souvent, et
                            celui qui bouge le plus d'un document à l'autre. */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-km-faint">Limite Ellipro :</span>
                          <InlineField
                            variant="number"
                            label=""
                            emptyLabel="non renseignée"
                            unit=""
                            value={compte.limite_ellipro ?? null}
                            disabled={!canManage}
                            onCommit={(v) =>
                              majConditionsFournisseur(compte.id, { min_ellipro_score: v })
                                .then(() => showToast(v == null ? '✓ Limite Ellipro retirée' : `✓ Limite Ellipro : ${v}`))
                            }
                            onSaved={() => undefined}
                            onError={(err) => showToast(`Erreur : ${err.message}`)}
                          />
                        </div>
                        {/* ══ LES CONDITIONS QUI DÉCIDENT SI ON PEUT LE CONSULTER — 24/09/2026 ══
                         *
                         * Naoëlle : « il faut pouvoir modifier directement sur les fiches et pas
                         * juste en base, des modifications de champs inline ».
                         *
                         * CE SONT LES SIX CRITÈRES DU MOTEUR D'ÉLIGIBILITÉ (`lib/eligibility.ts`) :
                         * ils décident si le fournisseur est proposé au commercial pendant la
                         * cotation. Ils vivaient en base sans être ni affichés ni modifiables — on
                         * pouvait donc écarter un fournisseur pendant des semaines sans jamais voir
                         * pourquoi, ni pouvoir le corriger.
                         *
                         * TOUS AFFICHÉS, MÊME VIDES, contrairement à la première version : un
                         * critère absent n'est pas neutre, il ÉCARTE le fournisseur — le moteur dit
                         * « ne gère pas les segments » quand la liste est vide. Le cacher reviendrait
                         * à masquer la cause du refus. */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-km-faint">Profils électricité :</span>
                          <InlineField
                            variant="text"
                            label=""
                            emptyLabel="aucun"
                            value={(compte.segments ?? []).join(', ')}
                            disabled={!canManage}
                            onCommit={(v) =>
                              majConditionsFournisseur(compte.id, {
                                segments: decouperCodes(v),
                              }).then(() => showToast('✓ Profils électricité enregistrés'))
                            }
                            onSaved={() => undefined}
                            onError={(err) => showToast(`Erreur : ${err.message}`)}
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-km-faint">Profils gaz :</span>
                          <InlineField
                            variant="text"
                            label=""
                            emptyLabel="aucun"
                            value={(compte.tariffs ?? []).join(', ')}
                            disabled={!canManage}
                            onCommit={(v) =>
                              majConditionsFournisseur(compte.id, {
                                tariffs: decouperCodes(v),
                              }).then(() => showToast('✓ Profils gaz enregistrés'))
                            }
                            onSaved={() => undefined}
                            onError={(err) => showToast(`Erreur : ${err.message}`)}
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-km-faint">Type de client :</span>
                          <InlineField
                            variant="text"
                            label=""
                            emptyLabel="aucun"
                            value={(compte.targets ?? []).join(', ')}
                            disabled={!canManage}
                            onCommit={(v) =>
                              majConditionsFournisseur(compte.id, {
                                /* LES CIBLES NE SONT PAS DES CODES : « Syndic professionnel » porte
                                   une espace. On découpe donc sur la virgule seule. */
                                targets: v.split(',').map((x) => x.trim()).filter(Boolean),
                              }).then(() => showToast('✓ Types de client enregistrés'))
                            }
                            onSaved={() => undefined}
                            onError={(err) => showToast(`Erreur : ${err.message}`)}
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-km-faint">Délai de réponse :</span>
                          <InlineField
                            variant="number"
                            label=""
                            emptyLabel="non renseigné"
                            unit="j"
                            value={compte.response_delay_days ?? null}
                            disabled={!canManage}
                            onCommit={(v) =>
                              majConditionsFournisseur(compte.id, {
                                response_delay_days: v,
                              }).then(() =>
                                showToast(v === 0 ? '✓ Délai : instantané' : `✓ Délai : ${v ?? '—'} jour(s)`),
                              )
                            }
                            onSaved={() => undefined}
                            onError={(err) => showToast(`Erreur : ${err.message}`)}
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-km-faint">Minimum annuel :</span>
                          <InlineField
                            variant="number"
                            label=""
                            emptyLabel="aucun"
                            unit="MWh"
                            value={compte.min_consumption ?? null}
                            disabled={!canManage}
                            onCommit={(v) =>
                              majConditionsFournisseur(compte.id, {
                                min_consumption: v,
                              }).then(() => showToast(v == null ? '✓ Aucun minimum' : `✓ Minimum : ${v} MWh`))
                            }
                            onSaved={() => undefined}
                            onError={(err) => showToast(`Erreur : ${err.message}`)}
                          />
                        </div>

                        {/* ══ LA PART DE LA MARGE QUI REVIENT À KIWEE ══
                            William, 03/09/2026 : « non pas toujours par 2, et certains fournisseurs
                            on prend moins que ça ». Le taux était une constante dans le code depuis
                            la règle de Michel du 21/08 ; il devient un champ, fournisseur par
                            fournisseur, à 50 % par défaut.

                            IL EST SUR LA FICHE DU FOURNISSEUR ET NULLE PART AILLEURS. Le mettre sur
                            l'offre obligerait à le ressaisir à chaque cotation, et deux offres du
                            même fournisseur finiraient par porter deux taux différents. */}
                        <p className="flex items-center gap-1.5">
                          <span className="text-km-faint">Taux répartition :</span>
                          <InlineField
                            variant="number"
                            label=""
                            emptyLabel="50"
                            unit="%"
                            value={compte.taux_repartition != null ? Math.round(compte.taux_repartition * 1000) / 10 : 50}
                            disabled={!canManage}
                            onCommit={(v) => {
                              /* SAISI EN POURCENTAGE, STOCKÉ EN FRACTION. Personne n'écrit « 0,45 »
                                 pour dire quarante-cinq pour cent, et la contrainte en base tient la
                                 valeur entre 0 et 1. */
                              const pourcent = v == null ? 50 : Math.min(100, Math.max(0, v))
                              return updateField
                                .mutateAsync({ id: compte.id, patch: { taux_repartition: pourcent / 100 } })
                                .then(() => showToast(`✓ Taux répartition : ${pourcent} %`))
                            }}
                            onSaved={() => undefined}
                            onError={(err) => showToast(`Erreur : ${err.message}`)}
                          />
                          <ExplicationCalcul
                            titre="Taux répartition"
                            champ="comptes.taux_repartition"
                            resume={'La marge annoncée au fournisseur est la marge BRUTE : elle est partagée avec lui. '
                              + 'Ce taux dit quelle part nous revient, et c’est elle qui sert à calculer le montant des '
                              + 'affaires gagnées chez ce fournisseur.'}
                            etapes={[
                              { libelle: 'Marge annoncée dans la cotation', valeur: 'ex. 4 €/MWh', origine: 'saisie dans « Modifier les prix »' },
                              { libelle: 'Taux répartition', valeur: `${compte.taux_repartition != null ? Math.round(compte.taux_repartition * 1000) / 10 : 50} %`, origine: 'ce champ' },
                              { libelle: 'Marge nette KiWee', valeur: 'ex. 2 €/MWh', origine: 'le produit des deux' },
                            ]}
                            manques={undefined}
                          />
                        </p>
                        {/* ══ PAR QUEL INTERMÉDIAIRE PASSE-T-ON CHEZ CE FOURNISSEUR ══
                            William, 09/09/2026 : « il existe des fournisseurs propres à
                            l'intermédiaire OBD et à l'intermédiaire Energix ».

                            LE RATTACHEMENT VIT SUR LE FOURNISSEUR, pas sur l'affaire : sinon il
                            faudrait le ressaisir à chaque cotation, et le corriger sur trois cents
                            recommandations le jour où un fournisseur change de camp.

                            VIDE VEUT DIRE « KIWEE FACTURE EN DIRECT » — pas « on ne sait pas ». La
                            commission d'intermédiaire vaut alors zéro, et le chiffre d'affaires
                            égale le montant brut. */}
                        <p className="flex items-center gap-1.5">
                          <span className="text-km-faint">Intermédiaire pricing :</span>
                          <InlineField
                            variant="select"
                            label=""
                            emptyLabel="Kiwee en direct"
                            value={compte.intermediaire_partenaire_id ?? ''}
                            options={partenaires.map((p) => ({ value: p.id, label: p.nom }))}
                            disabled={!canManage}
                            onCommit={(v) =>
                              updateField
                                .mutateAsync({ id: compte.id, patch: { intermediaire_partenaire_id: v || null } })
                                .then(() => showToast(v ? '✓ intermédiaire enregistré' : '✓ facturation directe'))
                            }
                            onSaved={() => undefined}
                            onError={(err) => showToast(`Erreur : ${err.message}`)}
                          />
                        </p>
                        {compte.conditions_commerciales && <p><span className="text-km-faint">Conditions :</span> {compte.conditions_commerciales}</p>}
                        {compte.commentaire_partenariat && <p><span className="text-km-faint">Commentaire :</span> {compte.commentaire_partenariat}</p>}
                      </>
                    )}
                    {compte.type_compte === 'partenaire' && (
                      <>
                        <p><span className="text-km-faint">Type de partenariat :</span> {compte.type_partenariat || '—'}</p>
                        <p><span className="text-km-faint">Modèle de rémunération :</span> {compte.modele_remuneration || '—'}</p>
                        <p><span className="text-km-faint">Contact référent :</span> {compte.contact_referent_nom || '—'}</p>
                        <p><span className="text-km-faint">Statut partenariat :</span> <Badge tone="neutral">{compte.statut_partenariat || 'À qualifier'}</Badge></p>
                        <p><span className="text-km-faint">Début du partenariat :</span> {compte.date_debut_partenariat ? new Date(compte.date_debut_partenariat).toLocaleDateString('fr-FR') : '—'}</p>

                        {/* ══ LES DEUX TAUX DE L'INTERMÉDIAIRE PRICING ══
                            William, 09/09/2026. Ils ne sont pas interchangeables, et c'est tout
                            l'intérêt de les afficher côte à côte :

                            · le TAUX COMMISSIONNEMENT est ce que ce partenaire prélève réellement
                              sur ce qu'il facture au fournisseur. Il détermine le chiffre d'affaires
                              qui entre dans les caisses de Kiwee ;
                            · le TAUX COMMERCIAUX sert au « Montant », la référence sur laquelle se
                              calculent les commissions et se remplissent les objectifs. Il est
                              volontairement plus bas — 15 % contre 25 %.

                            Deux chiffres pour la même affaire, qui ne doivent jamais être confondus :
                            c'est exactement le genre d'écart qui produit un rapport faux dont
                            personne ne trouve la cause. */}
                        <p className="flex items-center gap-1.5">
                          <span className="text-km-faint">Taux commissionnement :</span>
                          <InlineField
                            variant="number"
                            label=""
                            emptyLabel="—"
                            unit="%"
                            value={compte.taux_commissionnement != null ? Math.round(compte.taux_commissionnement * 1000) / 10 : null}
                            disabled={!canManage}
                            onCommit={(v) => {
                              // Saisi en pourcentage, stocké en fraction — la contrainte en base le borne entre 0 et 1.
                              const pourcent = v == null ? null : Math.min(100, Math.max(0, v))
                              return updateField
                                .mutateAsync({ id: compte.id, patch: { taux_commissionnement: pourcent == null ? null : pourcent / 100 } })
                                .then(() => showToast(pourcent == null ? '✓ taux retiré' : `✓ Taux commissionnement : ${pourcent} %`))
                            }}
                            onSaved={() => undefined}
                            onError={(err) => showToast(`Erreur : ${err.message}`)}
                          />
                          <ExplicationCalcul
                            titre="Taux commissionnement"
                            champ="comptes.taux_commissionnement"
                            resume={'Ce que cet intermédiaire prélève sur le montant qu’il facture à son fournisseur '
                              + 'partenaire. C’est lui qui détermine le chiffre d’affaires réellement encaissé par Kiwee.'}
                            etapes={[
                              { libelle: 'Montant brut de l’affaire', valeur: 'ex. 7 500 €', origine: 'calculé depuis l’offre retenue' },
                              { libelle: 'Taux commissionnement', valeur: `${compte.taux_commissionnement != null ? Math.round(compte.taux_commissionnement * 1000) / 10 : 25} %`, origine: 'ce champ' },
                              { libelle: 'Commission intermédiaire', valeur: 'ex. 1 875 €', origine: 'le produit des deux' },
                            ]}
                            manques={undefined}
                          />
                        </p>

                        <p className="flex items-center gap-1.5">
                          <span className="text-km-faint">Taux commerciaux :</span>
                          <InlineField
                            variant="number"
                            label=""
                            emptyLabel="—"
                            unit="%"
                            value={compte.taux_commerciaux != null ? Math.round(compte.taux_commerciaux * 1000) / 10 : null}
                            disabled={!canManage}
                            onCommit={(v) => {
                              const pourcent = v == null ? null : Math.min(100, Math.max(0, v))
                              return updateField
                                .mutateAsync({ id: compte.id, patch: { taux_commerciaux: pourcent == null ? null : pourcent / 100 } })
                                .then(() => showToast(pourcent == null ? '✓ taux retiré' : `✓ Taux commerciaux : ${pourcent} %`))
                            }}
                            onSaved={() => undefined}
                            onError={(err) => showToast(`Erreur : ${err.message}`)}
                          />
                          <ExplicationCalcul
                            titre="Taux commerciaux"
                            champ="comptes.taux_commerciaux"
                            resume={'Le taux qui sert au « Montant », la référence des commissions commerciales et des '
                              + 'objectifs. Volontairement différent du taux de commissionnement réel.'}
                            etapes={[
                              { libelle: 'Montant brut de l’affaire', valeur: 'ex. 7 500 €', origine: 'calculé depuis l’offre retenue' },
                              { libelle: 'Taux commerciaux', valeur: `${compte.taux_commerciaux != null ? Math.round(compte.taux_commerciaux * 1000) / 10 : 15} %`, origine: 'ce champ' },
                              { libelle: 'Montant', valeur: 'ex. 6 375 € avant commission apporteur', origine: 'le brut moins ce taux' },
                            ]}
                            manques={undefined}
                          />
                        </p>

                        {/* Les fournisseurs qui passent par cet intermédiaire — la contrepartie du
                            champ posé sur leur fiche, pour vérifier d'un coup d'œil que le
                            rattachement est complet. */}
                        <p>
                          <span className="text-km-faint">Fournisseurs rattachés :</span>{' '}
                          {fournisseursDeLIntermediaire.length === 0
                            ? 'aucun pour l’instant'
                            : fournisseursDeLIntermediaire.map((f) => f.nom).join(', ')}
                        </p>
                        {compte.commentaire_partenariat && <p><span className="text-km-faint">Commentaire :</span> {compte.commentaire_partenariat}</p>}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ══ LA CARTE EST RETIRÉE DE CET ONGLET ══
                  William, 11/09/2026 : « tu peux également masquer la map pour le moment, elle
                  n'apporte rien de très important ».

                  Elle montrait OÙ sont les immeubles — une information que l'adresse donne déjà, et
                  qui ne dit rien de ce qu'il faut faire. Sur un compte sans coordonnées, elle
                  affichait même « aucun site n'a de coordonnées enregistrées » sur 300 px de haut.

                  LE COMPOSANT EST SUPPRIMÉ, PAS MIS DE CÔTÉ. Le garder sans appelant ferait
                  échouer la compilation à chaque passage (TS6133) ; il se retrouve dans
                  l'historique du dépôt si la carte doit revenir. `SitesMap`, lui, reste employé par
                  la page Patrimoine. */}

            </div>
          )}

          {tab === 'detail' && (
            <div className="animate-km-fade-slide space-y-3 p-4 sm:p-[22px]">
              <IdentiteCard compte={compte} onToast={showToast} />
            </div>
          )}

          {AFFICHER_CONTRATS_ET_MANDATS && tab === 'contrats' && (
            <ContratsTabContent
              sites={sitesDuCompte}
              compteId={compte.id}
              contrats={contratsDuCompte}
              recommandations={recommandationsDuCompte}
            />
          )}

          {tab === 'compteurs' && <OngletCompteurs compteId={compte.id} compteurs={compteursDuCompte} />}

          {tab === 'opportunites' && (
            <div className="flex flex-col gap-2.5">
              {opportunitesDuCompte.length === 0 ? (
                <div className="rounded-xl border border-dashed border-km-line p-4">
                  <p className="text-km-name font-bold text-km-text">Aucune opportunité sur ce compte</p>
                  <p className="mt-1 text-km-label text-km-muted">
                    Une opportunité réunit un contact, un périmètre de compteurs et un mandat, puis se
                    convertit en recommandations.
                  </p>
                  <Button size="sm" className="mt-2.5" onClick={() => navigate('/opportunites')}>
                    <Plus className="h-3.5 w-3.5" />
                    Voir les opportunités
                  </Button>
                </div>
              ) : (
                opportunitesDuCompte.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => navigate(`/opportunites/${o.id}`)}
                    className="flex items-center gap-3 rounded-xl border border-km-line bg-km-surface px-3.5 py-3 text-left transition-colors hover:border-opp-200 hover:bg-opp-100/30"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-opp-600 to-opp-400 text-white">
                      <Target className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-km-body font-bold text-km-text">
                        {o.reference || 'Sans référence'}
                      </p>
                      <p className="truncate text-km-label text-km-muted">
                        {o.compteur_ids.length} compteur{o.compteur_ids.length > 1 ? 's' : ''}
                        {o.type_opportunite ? ` · ${o.type_opportunite}` : ''}
                        {o.recommandation_ids.length > 0
                          ? ` · ${o.recommandation_ids.length} recommandation${o.recommandation_ids.length > 1 ? 's' : ''}`
                          : ''}
                      </p>
                    </div>
                    <Badge tone={o.qualification_fin === 'CONVERTIE' ? 'kiwi' : 'neutral'}>
                      {o.statut_libelle}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          )}

          {tab === 'recommandations' && <OngletRecommandations recommandations={recommandationsDuCompte} />}


          {AFFICHER_CONTRATS_ET_MANDATS && tab === 'mandats' && (
            <div className="flex flex-col gap-2.5">
              {mandatsDuCompte.length === 0 ? (
                <div className="rounded-xl border border-dashed border-km-amber-line bg-km-amber-soft p-4">
                  <p className="text-km-name font-bold text-km-amber">Aucun mandat pour ce compte</p>
                  <Button size="sm" className="mt-2.5" onClick={() => navigate('/mandats')}>
                    <Plus className="h-3.5 w-3.5" />
                    Préparer un mandat
                  </Button>
                </div>
              ) : (
                mandatsDuCompte.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => navigate(`/mandats/${m.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-km-line bg-km-surface p-3.5 hover:bg-km-soft"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-km-md bg-km-amber-soft text-km-amber">
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-km-body font-bold text-km-text">
                        <Link to={`/mandats/${m.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                          {m.nb_sites_couverts} site{m.nb_sites_couverts > 1 ? 's' : ''} couvert{m.nb_sites_couverts > 1 ? 's' : ''}
                        </Link>
                      </p>
                      <p className="truncate text-km-body text-km-muted">{m.contact_signataire_nom ?? 'Signataire non renseigné'}</p>
                    </div>
                    <Badge tone={STATUT_MANDAT_TONE[m.statut] ?? 'neutral'}>{statutsMandats.find((s) => s.code === m.statut)?.libelle ?? m.statut}</Badge>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'fichiers' && (
            <OngletFichiers
              documents={documentsDuCompte}
              onOuvrir={(d) => navigate(`/documents/${d.id}`)}
              typesDocuments={typesDocuments}
              onDeposer={async (fichiers, typeDocumentId) => {
                await televerser.mutateAsync({
                  fichiers,
                  entite_type: 'compte',
                  entite_id: compte.id,
                  type_document_id: typeDocumentId,
                  type_document_libelle: typesDocuments.find((t) => t.id === typeDocumentId)?.libelle ?? '',
                })
                showToast(`✓ ${fichiers.length} fichier${fichiers.length > 1 ? 's' : ''} déposé${fichiers.length > 1 ? 's' : ''}`)
              }}
            />
          )}

          {tab === 'activite' && (
            <ActivityFeed
              compteId={compte.id}
              compteNom={compte.nom}
              interactions={interactionsDuCompte}
              actions={actionsDuCompte}
              documents={documentsDuCompte}
            />
          )}
        </div>

        {/* Colonne droite — Activité persistante (desktop uniquement) */}
        <div className="hidden min-h-0 flex-col border-l border-km-line bg-km-bg lg:flex">
          <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-4 sm:pt-5">
            <ActivityFeed
              compteId={compte.id}
              compteNom={compte.nom}
              interactions={interactionsDuCompte}
              actions={actionsDuCompte}
              documents={documentsDuCompte}
            />
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* `showEditSubtype &&` en plus du type : ces dialogues restaient montes en permanence, et
          celui des comptes clients faisait lire la liste complete des comptes pour peupler son
          selecteur d'apporteur. */}
      {showEditSubtype && compte.type_compte === 'client' && (
        <EditCompteClientDialog compte={compte} open onClose={() => setShowEditSubtype(false)} />
      )}
      {showEditSubtype && compte.type_compte === 'fournisseur' && (
        <EditCompteFournisseurDialog compte={compte} contacts={contactsDuCompte} open onClose={() => setShowEditSubtype(false)} />
      )}
      {showEditSubtype && compte.type_compte === 'partenaire' && (
        <EditComptePartenaireDialog compte={compte} contacts={contactsDuCompte} open onClose={() => setShowEditSubtype(false)} />
      )}

      <EditCompteDialog compte={compte} open={editOpen} onClose={() => setEditOpen(false)} />

      <Dialog
        open={historiqueOuvert}
        onClose={() => setHistoriqueOuvert(false)}
        title="Historique des modifications"
        description={compte.nom}
        className="max-w-4xl"
      >
        {/* La hauteur est bornée et le contenu défile : un compte suivi depuis deux ans a des
            centaines de lignes, et une fenêtre qui grandit sans fin sort de l'écran. */}
        <div className="max-h-[70vh] overflow-y-auto">
          <OngletHistorique entrees={historique} />
        </div>
      </Dialog>

      {/* Monté seulement à l'ouverture : ce dialogue charge TOUS les contacts et TOUS les
          compteurs (il doit détecter un PDL déjà existant ailleurs dans le CRM). Monté en
          permanence, il faisait payer ces deux tables à chaque affichage d'une fiche compte —
          même piège que le wizard de cotation. */}
      {addCompteurOpen && (
      <CreationCompteurDialog
        open
        onClose={() => setAddCompteurOpen(false)}
        compte={compte}
        /* LES GROUPES D'ADRESSE DU COMPTE, et non plus la table `sites` : c'est ce qui permet au
           dialogue de retrouver une adresse déjà connue de ce client au lieu d'en créer une
           seconde. Il ne cherchait de toute façon que parmi les siens. */
        sites={sitesDuCompte}
        methode={pdlMethode}
        onSaved={(message) => showToast(message)}
      />
      )}

      {/* Choix de la méthode avant le formulaire PDL, comme Tools. La méthode choisie est
          transmise au dialogue : en « extraction », le dépôt de facture s'ouvre d'emblée. */}
      <PdlMethodSheet
        open={pdlMethodOpen}
        onClose={() => setPdlMethodOpen(false)}
        compteNom={compte.nom}
        onChoose={(methode) => { setPdlMethode(methode); setPdlMethodOpen(false); setAddCompteurOpen(true) }}
      />

      {/* Contact : panneau latéral (reste sur la fiche compte, comme l'écran de session
          post-création dans Tools) -- on ne quitte jamais la page. */}

      {/* Wizard en quatre étapes, comme Tools. Monté conditionnellement et non caché par le
          Dialog : un Sheet/Dialog masque son contenu sans démonter le composant, dont les hooks
          continueraient de tourner — le piège qui a gelé la navigation le 05/08/2026. */}
      <Dialog
        open={addMandatOpen}
        onClose={() => setAddMandatOpen(false)}
        title="Nouveau mandat"
        description="Le mandat autorise KiWee à intervenir sur un périmètre de points de livraison de ce compte."
        className="max-w-2xl"
      >
        {addMandatOpen && (
          <WizardConnectionGate required={['crm', 'docusign']} feature="création de mandat">
            <MandatWizard compteId={compte.id} />
          </WizardConnectionGate>
        )}
      </Dialog>

      {/* Monte seulement a l'ouverture : ce dialogue appelle useMandats, useCompteurs, useContacts,
          useContrats, useRecommandations et useComptes, soit six tables entieres. Monte en
          permanence, chaque affichage d'une fiche compte les payait -- c'est ce qui restait le plus
          gros poste apres le passage des lectures de la fiche en filtrage serveur (mesure du
          14/08/2026 : 153 requetes, dont une centaine imputables a ce seul dialogue). Meme piege
          que le wizard de mandat et le dialogue de creation de PDL juste au-dessus. */}
      {addRecoOpen && (
        <CreateRecommandationDialog
          open
          onClose={() => setAddRecoOpen(false)}
          initialCompteId={compte.id}
          onCreated={(recoId) => navigate(`/recommandations/${recoId}`)}
        />
      )}

      {/* Monté seulement à l'ouverture, comme les trois dialogues ci-dessus : il charge les contacts
          et les statuts, et rien de tout cela n'a à partir au chargement de la fiche. */}
      {addOppOpen && (
        <DialogCreationOpportunite onFermer={() => setAddOppOpen(false)} compteId={compte.id} />
      )}

      <DialogSuppression
        ouvert={confirmDelete}
        onFermer={() => { suppression.reinitialiser(); setConfirmDelete(false) }}
        type="compte"
        id={compte.id}
        nom={compte.nom}
        onConfirmer={handleDelete}
        enCours={suppression.enCours}
        erreur={suppression.erreur}
      />
    </div>
  )
}

/**
 * ══ LES ADRESSES D'UN COMPTE, DÉDUITES DE SES COMPTEURS ══
 *
 * Le retrait de l'objet site (réunion du 09/09/2026) laisse une question pratique : la fiche compte
 * groupait ses compteurs et ses contrats PAR SITE, et dessinait une carte de ces sites. Ce
 * regroupement reste juste — deux compteurs à la même adresse se lisent ensemble — mais il ne peut
 * plus venir d'une table qu'on supprime.
 *
 * Il vient donc des compteurs eux-mêmes. `compteurs.groupe_site_id` reprend la valeur de l'ancien
 * `sites.id` (migration 20260909100000), ce qui a une conséquence précieuse : TOUS LES `site_id`
 * STOCKÉS AILLEURS — sur un contrat, une action, une requête — continuent de correspondre. Les
 * regroupements existants n'ont donc pas une ligne à changer.
 *
 * La forme rendue est celle de `Site` pour la même raison : `CompteSitesMap`, `ContratsTabContent`
 * et `CompteursTabContent` la consomment déjà, et les réécrire aurait été un troisième chantier
 * sans bénéfice. Les champs qu'aucun compteur ne porte — surface, année de construction, date
 * d'AG — valent `null` : ils étaient vides sur les 6 378 sites de toute façon.
 */
function groupesDAdresse(compteurs: Compteur[], compteId: string | undefined): Site[] {
  const parGroupe = new Map<string, Site>()
  for (const c of compteurs) {
    const cle = c.site_id
    if (!cle) continue
    const existant = parGroupe.get(cle)
    if (existant) {
      existant.nb_compteurs += 1
      /* LA GÉOLOCALISATION DU PREMIER COMPTEUR QUI EN A UNE. Elle est identique pour tous ceux
         d'un même groupe — la recopie du 09/09 l'a posée depuis le site — mais un compteur créé
         depuis peut ne pas l'avoir encore. */
      if (existant.latitude == null && c.latitude != null) {
        existant.latitude = c.latitude
        existant.longitude = c.longitude ?? null
      }
      continue
    }
    parGroupe.set(cle, {
      id: cle,
      nom: c.libelle_site || c.site_nom || 'Lieu non renseigné',
      compte_id: compteId ?? c.compte_id ?? '',
      compte_nom: '',
      type_site: '',
      type_site_id: null,
      adresse: c.adresse ?? '',
      ville: c.ville ?? '',
      code_postal: c.code_postal ?? '',
      latitude: c.latitude ?? null,
      longitude: c.longitude ?? null,
      annee_construction: null,
      surface_m2: null,
      date_derniere_ag: null,
      proprietaire_id: c.proprietaire_id ?? null,
      proprietaire_nom: null,
      rue: c.adresse ?? null,
      departement_code: c.departement_code ?? null,
      departement_nom: c.departement_nom ?? null,
      nb_compteurs: 1,
      nb_signaux_ouverts: 0,
      statut: 'actif',
    })
  }
  return [...parGroupe.values()].sort((a, b) => a.nom.localeCompare(b.nom))
}

/**
 * ══ LE PIED DE LA CARTE DE QUALITÉ ══
 *
 * William, 11/09/2026 : « reprendre le même design de bas de card que celle Ellipro — ligne de
 * démarcation et infos en dessous » avec « l'évolution du score par rapport au dernier score
 * enregistré » et « la tendance d'évolution ».
 *
 * ── UN SCORE SANS SON MOUVEMENT NE DIT QUE LA MOITIÉ ──
 *
 * 60/100 ne se lit pas pareil selon qu'on vient de 40 ou de 85. Le premier cas est un compte qu'on
 * est en train de reprendre en main, le second un compte qui se dégrade — même chiffre, deux
 * conduites opposées.
 *
 * ── DEUX LIGNES, PARCE QUE CE SONT DEUX QUESTIONS ──
 *
 *   ÉVOLUTION  l'écart avec le dernier score DIFFÉRENT — « qu'est-ce qui vient de se passer ? »
 *   TENDANCE   le sens sur les trois derniers relevés — « dans quel sens ça va ? »
 *
 * Voir `useEvolutionQualite` : sur deux points seulement, les deux diraient la même chose.
 *
 * ── LA COULEUR N'EST PAS LE SEUL SIGNAL ──
 *
 * Un écart porte son signe (`+6`, `−4`) et une tendance sa flèche (`↗`, `↘`). La teinte ne fait que
 * confirmer : elle est illisible pour une partie des utilisateurs, et invisible à l'impression.
 */
function piedQualite(evolution: ReturnType<typeof useEvolutionQualite>['data']): FaitEllipro[] {
  if (!evolution || evolution.scorePrecedent === null || evolution.evolution === null) {
    /* PAS D'HISTORIQUE, PAS DE CHIFFRE INVENTÉ. La mémoire des scores commence le 11/09/2026 ;
       avant le premier relevé d'un compte, on le dit plutôt que d'afficher un « 0 » qui se lirait
       comme « rien n'a bougé ». */
    return [{ libelle: 'Évolution', aide: 'Aucun relevé antérieur : la mémoire des scores démarre au premier passage de la tâche de nuit', valeur: '—' }]
  }

  const e = evolution.evolution
  const depuis = evolution.releveLe
    ? new Date(evolution.releveLe).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
    : null

  const TENDANCES: Record<string, { texte: string; couleur?: string }> = {
    HAUSSE:   { texte: '↗ en hausse', couleur: '#BDF3DE' },
    BAISSE:   { texte: '↘ en baisse', couleur: '#FFD4CC' },
    STABLE:   { texte: '→ stable' },
    INCONNUE: { texte: '—' },
  }
  const t = TENDANCES[evolution.tendance] ?? TENDANCES.INCONNUE

  return [
    {
      libelle: 'Évolution',
      aide: depuis
        ? `Écart avec le dernier score enregistré, le ${depuis}`
        : 'Écart avec le dernier score enregistré',
      // Le signe est explicite, y compris pour zéro : « = » dit « mesuré et inchangé », là où un
      // « 0 » se confond avec une absence de mesure.
      valeur: e === 0
        ? `=${depuis ? ` dep. ${depuis}` : ''}`
        : `${e > 0 ? '+' : '−'}${Math.abs(e)}${depuis ? ` dep. ${depuis}` : ''}`,
      couleur: e > 0 ? '#BDF3DE' : e < 0 ? '#FFD4CC' : undefined,
    },
    { libelle: 'Tendance', aide: 'Sens du score sur les trois derniers relevés', valeur: t.texte, couleur: t.couleur },
  ]
}

function QualiteCompteCard({ compte }: { compte: Compte }) {
  const [detailOuvert, setDetailOuvert] = useState(false)
  const { data: qualite } = useQualiteCompte(compte.id)
  const { data: evolution } = useEvolutionQualite(compte.id)
  const { data: compteurs, isLoading: chargeCompteurs } = useQualiteCompteurs(compte.id, detailOuvert)

  /* TANT QUE LA VUE N'A RIEN RENDU, ON AFFICHE ZÉRO ET « aucun compteur ». C'est la réponse voulue
     pour un compte neuf — « quand on créera un compte, ce score sera à zéro car il n'aura rien » — et
     elle est vraie aussi pendant la seconde de chargement : afficher un score au hasard le temps que
     la requête revienne serait pire. */
  const score = qualite?.score ?? 0
  const nbCompteurs = qualite?.nb_compteurs ?? 0

  return (
    <>
      <HeroQualiteCompte
        score={score}
        nbCompteurs={nbCompteurs}
        sansContrat={qualite?.sans_contrat ?? 0}
        echeanceARevoir={qualite?.echeance_a_revoir ?? 0}
        sansResponsable={qualite?.sans_responsable ?? 0}
        parfaits={qualite?.parfaits ?? 0}
        faits={piedQualite(evolution)}
        /* Sans compteur, il n'y a rien à ouvrir : la carte ne fait pas semblant d'être cliquable. */
        onVoirCompteurs={nbCompteurs > 0 ? () => setDetailOuvert(true) : undefined}
      />

      {detailOuvert && (
        <Dialog
          open
          onClose={() => setDetailOuvert(false)}
          title={`Qualité des ${nbCompteurs} compteur${nbCompteurs > 1 ? 's' : ''} — ${score}/100`}
          /* `Dialog` n'a pas de prop de taille : sa largeur se règle par la classe. Trois cents
             compteurs se lisent mal dans une colonne étroite. */
          className="max-w-[760px]"
        >
          <p className="mb-3 text-km-body leading-relaxed text-km-muted">
            Du moins bon au meilleur, et à volume égal le plus gros d’abord : c’est l’ordre dans
            lequel les reprendre. Le score du compte est la moyenne de ces {nbCompteurs} notes.
          </p>

          {chargeCompteurs && <p className="text-km-body text-km-faint">Chargement…</p>}

          <div className="flex flex-col gap-1.5">
            {(compteurs ?? []).map((q) => {
              const manques = manquesCompteur(q)
              return (
                <Link
                  key={q.compteur_id}
                  to={`/compteurs/${q.compteur_id}`}
                  className="flex items-center gap-3 rounded-km border border-km-line bg-km-surface px-3 py-2 text-left transition-colors hover:bg-km-soft"
                >
                  {/* LE SCORE EN PASTILLE COLORÉE, la même échelle que le héro : on doit pouvoir
                      balayer la liste et voir où sont les rouges sans lire les chiffres. */}
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-km-label font-extrabold tabular-nums',
                      pastilleScore(q.score),
                    )}
                  >
                    {q.score}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-km-body font-semibold text-km-text">
                      {q.numero_point}
                    </span>
                    <span className="block truncate text-km-label text-km-muted">
                      {q.site_nom ?? 'site inconnu'}
                      {q.consommation_annuelle_mwh
                        ? ` · ${Math.round(q.consommation_annuelle_mwh).toLocaleString('fr-FR')} MWh`
                        : ''}
                    </span>
                  </span>
                  {/* CE QUI MANQUE, EN MOTS. Un score seul dit qu'il y a un problème ; la liste des
                      manques dit lequel, donc quoi faire. Rien à afficher sur un compteur à 100 :
                      l'absence de mention EST l'information. */}
                  <span className="hidden max-w-[46%] shrink-0 text-right text-km-label leading-snug text-km-muted sm:block">
                    {manques.length > 0 ? manques.join(' · ') : (
                      <span className="text-km-green">contrat et responsable en place</span>
                    )}
                  </span>
                </Link>
              )
            })}
          </div>
        </Dialog>
      )}
    </>
  )
}

function IdentiteCard({ compte, onToast }: { compte: Compte; onToast: (msg: string) => void }) {
  const optionsTypologie = useOptionsTypologie(compte.type_compte, compte.segment)
  const updateField = useUpdateCompteField()
  /* ══ LE PARTENAIRE D'ORIGINE REMONTE DANS L'IDENTITÉ ══

     Michel, relayé le 10/09/2026 : « ajouter dans l'objet compte le champ partenaire origine, si
     c'est un compte partenaire, et l'ajouter au formulaire de création des comptes partenaire ».

     La COLONNE existait déjà — `apporteur_partenaire_id` — et se modifiait dans le dialogue
     « Détails client », derrière un bouton. Résultat mesuré le 10/09 : 0 compte sur 2 779 rempli,
     pour 8 comptes partenaires en base. Un champ qu'il faut aller chercher dans un dialogue ne se
     remplit pas ; celui-ci n'a jamais servi une seule fois.

     Il rejoint donc l'identité, à côté du type de compte, éditable d'un clic comme ses voisins. Et
     le libellé mène à la fiche du partenaire : savoir QUI a apporté un client sans pouvoir aller
     voir ce qu'il a apporté d'autre ne sert qu'à moitié. */
  const { data: tousLesComptes } = useComptesRattachables()
  const partenaires = useMemo(
    () => (tousLesComptes ?? []).filter((c) => c.type_compte === 'partenaire'),
    [tousLesComptes],
  )
  /* Les contacts DU PARTENAIRE, pas ceux de ce compte-ci : le référent est quelqu'un de chez eux. */
  const { data: contactsDuPartenaire = [] } = useContactsParCompte(
    compte.apporteur_partenaire_id ?? undefined,
  )
  const [editingAddress, setEditingAddress] = useState(false)
  const [addrDraft, setAddrDraft] = useState({ rue: compte.rue ?? '', code_postal: compte.code_postal ?? '', ville: compte.ville ?? '' })

  /** Ne garde que les chiffres — « 123 456 789 00012 » devient « 12345678900012 ». Vide → `null`. */
  function chiffresSeuls(v: string): string | null {
    const n = v.replace(/\D/g, '')
    return n || null
  }

  /**
   * ══ LE SIRET SE VÉRIFIE AVANT D'ÊTRE ÉCRIT ══
   *
   * La création bloque déjà les doublons de SIRET (`creerCompte`, 26/08/2026) : « un compte avec
   * ce SIRET existe déjà, création bloquée ». Laisser la MODIFICATION y échapper aurait ouvert par
   * la fenêtre ce que la porte refuse — il aurait suffi de créer un compte sans SIRET puis de
   * l'ajouter ensuite.
   *
   * ET LE SIREN SUIT LE SIRET QUAND IL MANQUE. Les neuf premiers chiffres d'un SIRET SONT le
   * SIREN : ce n'est pas une déduction, c'est la définition. Le déduire évite qu'un compte
   * renseigné au SIRET reste sans note Ellipro faute des neuf chiffres qu'il porte déjà.
   */
  async function commitSiret(brut: string) {
    const siret = chiffresSeuls(brut)
    if (siret) {
      const existant = await findCompteBySiret(siret)
      if (existant && existant.id !== compte.id) {
        onToast(`Ce SIRET est déjà celui de « ${existant.nom} » — deux comptes ne peuvent pas le partager.`)
        return
      }
    }
    const patch: Partial<Compte> = { siret }
    if (siret && siret.length >= 9 && !compte.siren) patch.siren = siret.slice(0, 9)
    await commit(patch)
  }

  function commit(patch: Partial<Compte>) {
    return updateField.mutateAsync({ id: compte.id, patch }).then(() => onToast('✓ enregistré')).catch((err) => onToast(`Erreur : ${err.message}`))
  }

  /* ══ CLIENT OU PROSPECT — PLUS UNE CONSTANTE ══════════════════════════════════════════════════

     Cette ligne valait `useMemo(() => true, [])`, avec pour commentaire « câblé une fois l'onglet
     Sites/Compteurs aligné ». Elle n'a jamais été recâblée : les 2 706 comptes consommateurs
     s'affichaient « Client ». Naoëlle, 02/09/2026 : « on a beaucoup d'objets client qui ne le sont
     pas. » 392 le sont.

     La règle vient de Michel le même jour : « un compte est considéré comme Client dès lors qu'au
     moins un de ses compteurs est rattaché à un contrat ». Elle est calculée en base, avec la même
     notion de contrat que le barème du score — voir `v_qualite_compte.est_client`.

     `null` tant que la vue n'a pas répondu, et pour les comptes qui ne sont pas des consommateurs :
     un fournisseur n'est ni client ni prospect, la question ne se pose pas pour lui. Le badge ne
     s'affiche alors pas du tout, plutôt que d'affirmer l'un ou l'autre. */
  const { data: qualiteIdentite } = useQualiteCompte(compte.id)
  const statutClient = qualiteIdentite ? qualiteIdentite.est_client : null

  async function saveAddress() {
    await commit({ rue: addrDraft.rue || null, code_postal: addrDraft.code_postal || null, ville: addrDraft.ville })
    setEditingAddress(false)
  }

  return (
    <div className="rounded-xl border border-km-line bg-km-surface p-4">
      <div className="mb-3.5 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-km-blue-soft text-km-blue"><Building2 className="h-2.5 w-2.5" /></span>
        <span className="text-km-label font-bold uppercase tracking-wide text-km-faint">Identité</span>
        <div className="flex-1" />
        <span className="text-km-label text-km-faint">cliquer une valeur pour modifier · ⧉ pour copier</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <InlineField variant="select" label="Type de compte" value={compte.type_compte} options={[{ value: 'client', label: 'Consommateur' }, { value: 'fournisseur', label: 'Fournisseur' }, { value: 'partenaire', label: 'Partenaire' }, { value: 'kiwee', label: 'KiWee' }]} onCommit={(v) => commit({ type_compte: v as TypeCompte })} onSaved={() => onToast('✓ enregistré')} />
        {/* ══ LA TYPOLOGIE SE CHOISIT, ELLE NE SE TAPE PLUS ══
            William, 14/09/2026. C'était un champ libre alors que la table `segments_comptes`
            existait — mais elle avait divergé : une seule de ses six valeurs correspondait au réel,
            et brancher le menu tel quel aurait rendu 533 syndics professionnels inqualifiables.
            La liste a été réalignée le jour même ; les options suivent le TYPE DE COMPTE, parce que
            « Fournisseur » et « Partenaire » sont des redites du type et n'ont rien à faire dans le
            menu d'un client. Une valeur hors liste reste proposée : voir useOptionsTypologie. */}
        <InlineField
          variant="select"
          label="Typologie"
          value={compte.segment || ''}
          options={optionsTypologie}
          emptyLabel="choisir"
          onCommit={(v) => commit({ segment: v })}
          onSaved={() => onToast('✓ enregistré')}
        />
        {/* PAS DE PARTENAIRE EN BASE, PAS DE CHAMP. Une liste déroulante vide invite à un clic qui
            ne mène nulle part ; mieux vaut que le champ n'existe pas tant qu'il n'y a personne à
            désigner. Il apparaît dès la création du premier compte partenaire. */}
        {partenaires.length > 0 && (
          <InlineField
            variant="select"
            label="Partenaire d'origine"
            value={compte.apporteur_partenaire_id ?? ''}
            options={[{ value: '', label: 'aucun' },
              ...partenaires.map((p) => ({ value: p.id, label: p.nom }))]}
            lien={compte.apporteur_partenaire_id ? `/comptes/${compte.apporteur_partenaire_id}` : undefined}
            emptyLabel="désigner"
            onCommit={(v) => commit({ apporteur_partenaire_id: v || null })}
            onSaved={() => onToast('✓ enregistré')}
          />
        )}
        {/* QUI SUIT LE DOSSIER CHEZ EUX — on rappelle une personne, pas une société.
            Le champ n'apparaît qu'une fois le partenaire désigné : demander le référent avant de
            savoir de quelle maison il est n'a pas de sens, et la base le refuse d'ailleurs. */}
        {compte.apporteur_partenaire_id && (
          <InlineField
            variant="select"
            label="Qui le suit, chez eux"
            value={compte.contact_partenaire_id ?? ''}
            options={[{ value: '', label: 'aucun' },
              ...contactsDuPartenaire.map((ct) => ({
                value: ct.id,
                label: `${ct.prenom ?? ''} ${ct.nom}`.trim() + (ct.fonction ? ` — ${ct.fonction}` : ''),
              }))]}
            lien={compte.contact_partenaire_id ? `/contacts/${compte.contact_partenaire_id}` : undefined}
            emptyLabel="désigner"
            onCommit={(v) => commit({ contact_partenaire_id: v || null })}
            onSaved={() => onToast('✓ enregistré')}
          />
        )}
        {statutClient !== null && (
          <div>
            <div className="mb-0.5 text-km-label font-semibold uppercase tracking-wide text-km-faint">Statut</div>
            <span
              title={
                statutClient
                  ? `Client : ${qualiteIdentite?.compteurs_sous_contrat} compteur${(qualiteIdentite?.compteurs_sous_contrat ?? 0) > 1 ? 's' : ''} sous contrat en cours`
                  : 'Prospect : aucun compteur du compte n’est sous contrat en cours'
              }
              className={cn('rounded px-2 py-0.5 text-km-label font-semibold', statutClient ? 'bg-km-green-soft text-km-green' : 'bg-km-soft text-km-muted')}
            >
              {statutClient ? 'Client' : 'Prospect'}
            </span>
          </div>
        )}
        {/* ══════════ SIRET ET SIREN SE MODIFIENT — ET SE CRÉENT ══════════

            William, 22/09/2026 : « sur une fiche compte, je n'ai pas la possibilité de modifier
            certains champs comme SIRET et SIREN ».

            DEUX DÉFAUTS EN UN, et le second était le plus gênant : ils étaient en lecture seule
            (`InfoFieldKw` ne fait que copier), ET ils n'apparaissaient QUE s'ils étaient déjà
            remplis. Un compte sans SIREN n'affichait donc aucune ligne SIREN — il n'y avait même
            pas où cliquer pour en ajouter un. Les deux lignes existent maintenant toujours, comme
            le code NAF juste en dessous.

            LE SIREN N'EST PAS UN DÉTAIL D'ÉTAT CIVIL : c'est lui qui interroge Ellipro, et le
            bandeau de notation reste muet sans lui. Ne pas pouvoir le saisir, c'était condamner la
            note du compte.

            ON NE GARDE QUE LES CHIFFRES, à la saisie comme à la recherche de doublon : les gens
            collent « 123 456 789 00012 » depuis l'annuaire, et `findCompteBySiret` compare des
            chaînes nettoyées. Sans ce nettoyage, le doublon passerait au travers. */}
        <InlineField
          variant="text"
          label="SIRET"
          mono
          value={compte.siret || ''}
          emptyLabel="ajouter"
          onCommit={(v) => commitSiret(v)}
          onSaved={() => onToast('✓ enregistré')}
        />
        <InlineField
          variant="text"
          label="SIREN"
          mono
          value={compte.siren || ''}
          emptyLabel="ajouter"
          onCommit={(v) => commit({ siren: chiffresSeuls(v) })}
          onSaved={() => onToast('✓ enregistré')}
        />
        <InlineField variant="text" label="Code NAF" mono value={compte.code_naf || ''} emptyLabel="ajouter" onCommit={(v) => commit({ code_naf: v || null })} onSaved={() => onToast('✓ enregistré')} />
        <InlineField variant="text" label="Libellé APE" value={compte.libelle_ape || ''} emptyLabel="ajouter" onCommit={(v) => commit({ libelle_ape: v || null })} onSaved={() => onToast('✓ enregistré')} />
        {compte.score_ellipro && (
          <div>
            <div className="mb-0.5 text-km-label font-semibold uppercase tracking-wide text-km-faint">Note Ellipro</div>
            <span className="rounded bg-km-green-soft px-1.5 py-0.5 text-km-name font-extrabold text-km-green">
              {compte.score_ellipro}{compte.score_ellipro_scale ? ` / ${compte.score_ellipro_scale}` : ''}
            </span>
          </div>
        )}
        <div className="col-span-2">
          <div className="mb-0.5 text-km-label font-semibold uppercase tracking-wide text-km-faint">Siège social</div>
          {editingAddress ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <input value={addrDraft.rue} onChange={(e) => setAddrDraft((d) => ({ ...d, rue: e.target.value }))} placeholder="Rue" className="min-w-[150px] flex-[2] rounded-km-sm border border-km-green px-1.5 py-1 text-km-name outline-none" />
              <input value={addrDraft.code_postal} onChange={(e) => setAddrDraft((d) => ({ ...d, code_postal: e.target.value }))} placeholder="Code postal" className="w-20 rounded-km-sm border border-km-green px-1.5 py-1 font-mono text-km-name outline-none" />
              <input value={addrDraft.ville} onChange={(e) => setAddrDraft((d) => ({ ...d, ville: e.target.value }))} placeholder="Ville" className="min-w-[90px] flex-1 rounded-km-sm border border-km-green px-1.5 py-1 text-km-name outline-none" />
              <button type="button" onClick={saveAddress} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-km-sm bg-km-green text-white">✓</button>
            </div>
          ) : (
            <div className="flex items-start gap-1.5">
              <button type="button" onClick={() => { setAddrDraft({ rue: compte.rue ?? '', code_postal: compte.code_postal ?? '', ville: compte.ville ?? '' }); setEditingAddress(true) }} className="rounded-km-sm px-1.5 py-0.5 text-left text-km-name text-km-text hover:bg-km-soft">
                {compte.rue || compte.code_postal || compte.ville ? (
                  <>
                    {compte.rue && <span className="block truncate">{compte.rue}</span>}
                    <span className="block truncate">{`${compte.code_postal ?? ''} ${compte.ville ?? ''}`.trim()}</span>
                  </>
                ) : (
                  <span className="text-km-faint">＋ ajouter</span>
                )}
              </button>
            </div>
          )}
        </div>
        <div>
          <div className="mb-0.5 text-km-label font-semibold uppercase tracking-wide text-km-faint">Département</div>
          <div className="flex items-center gap-2">
            <InlineField variant="text" mono value={compte.departement_code || ''} emptyLabel="—" onCommit={(v) => commit({ departement_code: v || null })} onSaved={() => onToast('✓ enregistré')} className="w-12" />
            <InlineField variant="text" value={compte.departement_nom || ''} emptyLabel="nom" onCommit={(v) => commit({ departement_nom: v || null })} onSaved={() => onToast('✓ enregistré')} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* `InfoFieldKw` est parti avec ses deux derniers usages (22/09/2026). Il ne servait plus qu'au
   SIRET et au SIREN, en lecture seule ; ils sont désormais modifiables comme le reste de la carte
   d'identité. Le reste de la fiche passe par `InlineField`, qui copie aussi. */

function RecordMetaCard({ compte, canManage, onToast }: { compte: Compte; canManage: boolean; onToast: (msg: string) => void }) {
  const updateCompte = useUpdateCompte()
  const { data: profilsAdmin } = useProfilsAdmin()

  /* ══ LE DESSIN A ÉTÉ EXTRAIT, LE 16/09/2026 ══
   *
   * William demandait le même propriétaire modifiable sur la fiche piste. La pastille, sa liste et
   * son infobulle vivent désormais dans `MentionProprietaire` ; ce qui reste ici est ce qui ne se
   * partage pas — quoi écrire en base, et quelles dates un compte a à montrer.
   *
   * LES DEUX DATES SONT EN INFOBULLE. « Créé le… · Modifié le… » sur deux lignes, en permanence,
   * pour une information qu'on consulte une fois par dossier : elles restent lisibles dans l'onglet
   * Historique, qui existe pour ça. */
  const dates = [
    compte.date_creation ? `Créé le ${new Date(compte.date_creation).toLocaleDateString('fr-FR')}` : null,
    compte.date_modification ? `modifié le ${new Date(compte.date_modification).toLocaleDateString('fr-FR')}` : null,
  ].filter(Boolean).join(' · ')

  async function reassigner(profilId: string | null) {
    const profil = profilsAdmin?.find((p) => p.id === profilId)
    try {
      await updateCompte.mutateAsync({ id: compte.id, nom: compte.nom, ville: compte.ville, segment: compte.segment, proprietaire_id: profilId })
      onToast(`✓ Propriétaire : ${profil ? `${profil.prenom} ${profil.nom}` : 'Aucun'}`)
    } catch (err) {
      onToast(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`)
    }
  }

  return (
    <MentionProprietaire
      nom={compte.proprietaire_nom ?? null}
      dates={dates}
      canManage={canManage}
      onChoisir={reassigner}
    />
  )
}

const LIFECYCLE_ACTIF = new Set(['ACTIF'])
const LIFECYCLE_A_VENIR = new Set(['A_VENIR', 'EN_PREPARATION', 'A_SIGNER'])
const LIFECYCLE_EXPIRE = new Set(['TERMINE', 'RESILIE', 'ANNULE'])

function contratLifecycle(statut: string): 'actif' | 'a_venir' | 'expire' | 'autre' {
  if (LIFECYCLE_ACTIF.has(statut)) return 'actif'
  if (LIFECYCLE_A_VENIR.has(statut)) return 'a_venir'
  if (LIFECYCLE_EXPIRE.has(statut)) return 'expire'
  return 'autre'
}

function ContratsTabContent({
  sites, compteId, contrats, recommandations,
}: {
  sites: Site[]
  compteId: string
  contrats: Contrat[]
  recommandations: Recommandation[]
}) {
  const [recherche, setRecherche] = useState('')
  const total = contrats.length
  const nbCompteurs = new Set(contrats.flatMap((c) => c.compteurs.map((cp) => cp.id))).size
  const nbSites = new Set(contrats.map((c) => c.site_id)).size
  const actifs = contrats.filter((c) => contratLifecycle(c.statut) === 'actif')
  const aVenir = contrats.filter((c) => contratLifecycle(c.statut) === 'a_venir')
  const expires = contrats.filter((c) => contratLifecycle(c.statut) === 'expire')

  const dans12mois = new Date()
  dans12mois.setMonth(dans12mois.getMonth() + 12)
  const echeances = actifs.filter((c) => c.date_fin && new Date(c.date_fin) <= dans12mois)
  const prochaine = echeances.slice().sort((a, b) => new Date(a.date_fin!).getTime() - new Date(b.date_fin!).getTime())[0]

  const sitesAvecReco = new Set(recommandations.flatMap((r) => r.sites?.map((s) => s.id) ?? []))
  const sansReco = actifs.filter((c) => !sitesAvecReco.has(c.site_id ?? ''))

  const [filtre, setFiltre] = useState<'all' | 'actifs' | 'echeances' | 'sans_reco'>('all')
  const filtres: Record<typeof filtre, Contrat[]> = { all: contrats, actifs, echeances, sans_reco: sansReco }
  const contratsFiltres = filtres[filtre]
  const q = recherche.trim().toLowerCase()
  const contratsAffiches = q
    ? contratsFiltres.filter((ct) => {
        const site = sites.find((s) => s.id === ct.site_id)
        return (ct.fournisseur_nom ?? '').toLowerCase().includes(q) || (site?.nom ?? '').toLowerCase().includes(q)
      })
    : contratsFiltres

  if (total === 0) return <p className="text-km-name text-km-faint">Aucun contrat pour ce compte.</p>

  return (
    <div className="flex flex-col gap-3">
      {/* Bandeau de la maquette : première colonne large à 230px, les trois autres à parts égales.
          Le total est en chiffres proportionnels et plus gros (30px) ; les trois compteurs filtrants
          sont en chasse fixe à 22px, pour qu'on les compare d'un coup d'œil. */}
      <div
        className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-[#e7e6e2] bg-[#e7e6e2] md:grid-cols-[230px_1fr_1fr_1fr]"
      >
        {[
          { key: 'all' as const, label: 'Contrats', value: total, sub: `${nbCompteurs} compteurs · ${nbSites} adresse${nbSites > 1 ? 's' : ''}`, color: '#16181d', principal: true },
          { key: 'actifs' as const, label: 'Actifs', value: actifs.length, sub: `+ ${aVenir.length} à venir · ${expires.length} expiré${expires.length > 1 ? 's' : ''}`, color: '#0d7a5f', principal: false },
          { key: 'echeances' as const, label: 'Échéances < 12 mois', value: echeances.length, sub: prochaine?.date_fin ? `prochaine : ${new Date(prochaine.date_fin).toLocaleDateString('fr-FR')}` : 'aucune dans l’année', color: '#c2452d', principal: false },
          { key: 'sans_reco' as const, label: 'Sans reco lancée', value: sansReco.length, sub: sansReco.length ? 'à couvrir' : 'tout est couvert', color: '#b57a24', principal: false },
        ].map((hub) => (
          <button
            key={hub.key}
            type="button"
            title={hub.key === 'all' ? 'Afficher tous les contrats' : `Filtrer : ${hub.label.toLowerCase()}`}
            onClick={() => setFiltre(hub.key)}
            className={cn(
              'flex flex-col gap-1 px-[15px] py-[13px] text-left transition-colors',
              filtre === hub.key ? 'bg-[#f6f6f4]' : 'bg-white hover:bg-[#fbfbfa]',
            )}
          >
            {hub.principal ? (
              <span className="flex items-center gap-[7px]">
                <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[#eaf4f0] text-[#0d7a5f]">
                  <FileCheck2 className="h-3 w-3" />
                </span>
                <span className="text-km-xs font-bold uppercase tracking-[.08em] text-[#a3a5a0]">{hub.label}</span>
              </span>
            ) : (
              <span className="text-km-xs font-bold uppercase tracking-[.08em] text-[#a3a5a0]">{hub.label}</span>
            )}
            <span
              className={cn('font-bold leading-[1.15]', hub.principal ? 'text-km-h1 tabular-nums' : 'text-km-metric tabular-nums')}
              style={{ color: hub.color }}
            >
              {hub.value}
            </span>
            <span className="text-km-xs text-[#83868f]">{hub.sub}</span>
          </button>
        ))}
      </div>

      {filtre !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-km-pill bg-km-text px-3 py-1 text-km-body font-bold text-white">
            Filtre : {filtre === 'actifs' ? 'Actifs' : filtre === 'echeances' ? 'Échéances < 12 mois' : 'Sans reco lancée'}
            <button type="button" onClick={() => setFiltre('all')} className="opacity-70 hover:opacity-100">✕</button>
          </span>
          <span className="text-km-body text-km-muted">{contratsAffiches.length} contrat{contratsAffiches.length > 1 ? 's' : ''} correspondant{contratsAffiches.length > 1 ? 's' : ''}</span>
        </div>
      )}

      <SiteSearchBox
        value={recherche}
        onChange={setRecherche}
        placeholder="Rechercher un site, un fournisseur…"
        total={contratsAffiches.length}
        unit="contrat"
      />

      <GroupedBySite
        sites={sites}
        compteId={compteId}
        itemsBySiteId={(siteId) => contratsAffiches.filter((ct) => ct.site_id === siteId)}
        orphanItems={contratsAffiches.filter((ct) => !ct.site_id || !sites.some((s) => s.id === ct.site_id))}
        renderSummary={(items) => {
          const nbCompteursSite = new Set(items.flatMap((ct) => ct.compteurs.map((cp) => cp.id))).size
          return `${nbCompteursSite} compteur${nbCompteursSite > 1 ? 's' : ''} · ${items.length} contrat${items.length > 1 ? 's' : ''}`
        }}
        emptyLabel="Aucun contrat pour ce filtre."
      />
    </div>
  )
}

function SiteSearchBox({ value, onChange, placeholder, total, unit }: { value: string; onChange: (v: string) => void; placeholder: string; total: number; unit: string }) {
  return (
    <div className="flex items-center gap-2 rounded-km border border-km-line bg-km-surface px-3 py-2">
      <Search className="h-3.5 w-3.5 shrink-0 text-km-faint" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-km-body text-km-text outline-none placeholder:text-km-faint"
      />
      <span className="shrink-0 text-km-body text-km-muted">{total} {unit}{total > 1 ? 's' : ''}</span>
    </div>
  )
}

// Un site = une ligne résumé (nom, statut, compte en gris), jamais les compteurs/contrats
// listés en dessous -- retour William du 02/08 : « affiche la liste des sites, pas les
// compteurs en dessous ». Le détail se consulte en cliquant, sur la fiche Site elle-même.
function GroupedBySite<T>({
  sites,
  compteId,
  itemsBySiteId,
  renderSummary,
  emptyLabel,
  orphanItems,
}: {
  sites: Site[]
  /** Sert au badge Client/Prospect de chaque ligne — voir `useStatutCommercialSites`. */
  compteId: string
  itemsBySiteId: (siteId: string) => T[]
  renderSummary: (items: T[]) => React.ReactNode
  emptyLabel: string
  /** Elements sans site rattachable (ex. contrat dont les compteurs ont change de cabinet) --
   * doivent quand meme s'afficher, pas disparaitre silencieusement (voir bug Rivet-Lenoble). */
  orphanItems?: T[]
}) {
  const navigate = useNavigate()
  /* Le badge de chaque site disait `site.statut === 'actif' ? 'Client' : 'Prospect'` — le statut
     actif/inactif d'un site, sans rapport avec le fait d'être fourni, et qu'aucun site portant un
     compteur actif n'a jamais à faux : tout s'affichait « Client ». On lit maintenant la même règle
     que le compte, un cran plus bas. Un site absent de la vue n'a aucun compteur : Prospect. */
  const { data: sitesClients } = useStatutCommercialSites(compteId)
  const groups = sites.map((s) => ({ site: s, items: itemsBySiteId(s.id) })).filter((g) => g.items.length > 0)
  const orphans = orphanItems ?? []

  if (groups.length === 0 && orphans.length === 0) return <p className="text-km-name text-km-faint">{emptyLabel}</p>

  return (
    <div className="overflow-hidden rounded-xl border border-km-line bg-white">
      {groups.map(({ site, items }) => (
        <div
          key={site.id}
          onClick={() => navigate(`/sites/${site.id}`)}
          className="flex cursor-pointer items-center gap-2.5 border-b border-navy-50 px-4 py-3 last:border-b-0 hover:bg-km-bg/60"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-km-green-soft text-km-green">
            <MapPin className="h-3.5 w-3.5" />
          </span>
          <p className="min-w-0 flex-1 truncate text-km-body font-bold text-km-text">
            <Link to={`/sites/${site.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
              {site.nom}
            </Link>
          </p>
          <span className={cn('rounded-km-sm px-1.5 py-0.5 text-km-label font-bold uppercase', sitesClients?.get(site.id) ? 'bg-km-green-soft text-km-green' : 'bg-km-soft text-km-muted')}>
            {sitesClients?.get(site.id) ? 'Client' : 'Prospect'}
          </span>
          <span className="shrink-0 text-km-body text-km-muted">{renderSummary(items)}</span>
          <span className="text-km-faint">›</span>
        </div>
      ))}
      {orphans.length > 0 && (
        <div className="flex items-center gap-2.5 border-t border-dashed border-km-line bg-km-bg/60 px-4 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-km-soft text-km-muted">
            <MapPin className="h-3.5 w-3.5" />
          </span>
          <p className="min-w-0 flex-1 truncate text-km-body font-bold text-km-text">Sans site rattaché (historique)</p>
          <span className="shrink-0 text-km-body text-km-muted">{renderSummary(orphans)}</span>
        </div>
      )}
    </div>
  )
}

function CommentaireCard({ compte }: { compte: Compte }) {
  const updateClient = useUpdateCompteClient()
  const updateFournisseur = useUpdateCompteFournisseur()
  const updatePartenaire = useUpdateComptePartenaire()
  const isKiwee = compte.type_compte === 'kiwee'
  const initialValue = isKiwee ? '' : compte.type_compte === 'client' ? (compte.note_interne ?? '') : (compte.commentaire_partenariat ?? '')

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialValue)
  const pending = updateClient.isPending || updateFournisseur.isPending || updatePartenaire.isPending

  async function save() {
    if (compte.type_compte === 'client') {
      await updateClient.mutateAsync({
        compteId: compte.id,
        segment_compte_id: compte.segment_compte_id ?? null,
        segment_compte_libelle: compte.segment_compte_libelle ?? null,
        conseiller_referent_id: compte.conseiller_referent_id ?? null,
        conseiller_referent_nom: compte.conseiller_referent_nom ?? null,
        origine_acquisition: compte.origine_acquisition ?? null,
        mandat_cadre_actif: compte.mandat_cadre_actif ?? false,
        note_interne: draft || null,
        apporteur_partenaire_id: compte.apporteur_partenaire_id ?? null,
      })
    } else if (compte.type_compte === 'fournisseur') {
      await updateFournisseur.mutateAsync({
        compteId: compte.id,
        fournit_electricite: compte.fournit_electricite ?? false,
        fournit_gaz: compte.fournit_gaz ?? false,
        contact_commercial_id: compte.contact_commercial_id ?? null,
        contact_commercial_nom: compte.contact_commercial_nom ?? null,
        statut_partenariat: compte.statut_partenariat ?? 'À qualifier',
        conditions_commerciales: compte.conditions_commerciales ?? null,
        commentaire_partenariat: draft || null,
        limite_ellipro: compte.limite_ellipro ?? null,
      })
    } else if (compte.type_compte === 'partenaire') {
      await updatePartenaire.mutateAsync({
        compteId: compte.id,
        type_partenariat: compte.type_partenariat ?? null,
        modele_remuneration: compte.modele_remuneration ?? null,
        contact_referent_id: compte.contact_referent_id ?? null,
        contact_referent_nom: compte.contact_referent_nom ?? null,
        statut_partenariat: compte.statut_partenariat ?? 'À qualifier',
        date_debut_partenariat: compte.date_debut_partenariat ?? null,
        commentaire_partenariat: draft || null,
      })
    }
    setEditing(false)
  }

  if (isKiwee) return null

  return (
    <div className="rounded-km-md border border-km-line bg-km-surface p-3.5">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-km-label font-bold uppercase tracking-wide text-km-faint">Commentaire</span>
        <div className="flex-1" />
        {!editing && (
          <button type="button" onClick={() => { setDraft(initialValue); setEditing(true) }} title="Modifier" className="rounded p-0.5 text-km-faint hover:bg-km-soft hover:text-km-text">
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
      {editing ? (
        <Textarea
          rows={6}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          disabled={pending}
          className="text-km-body"
        />
      ) : (
        <p
          onClick={() => { setDraft(initialValue); setEditing(true) }}
          className="cursor-pointer whitespace-pre-wrap rounded-km-md p-1 text-km-body leading-relaxed text-km-muted hover:bg-km-soft"
        >
          {initialValue || <span className="text-km-faint">Cliquer pour ajouter un commentaire…</span>}
        </p>
      )}
    </div>
  )
}


function EditCompteClientDialog({ compte, open, onClose }: { compte: Compte; open: boolean; onClose: () => void }) {
  // Charge ici, et non par la fiche : le selecteur d'apporteur a besoin des partenaires, mais
  // seulement quand quelqu'un ouvre ce dialogue.
  const { data: comptes } = useComptesRattachables()
  const { data: segmentsRef } = useReferenceTable('segments_comptes')
  const update = useUpdateCompteClient()
  const [segmentId, setSegmentId] = useState(compte.segment_compte_id ?? '')
  const [origine, setOrigine] = useState(compte.origine_acquisition ?? '')
  const [mandatCadre, setMandatCadre] = useState(compte.mandat_cadre_actif ?? false)
  const [note, setNote] = useState(compte.note_interne ?? '')
  const [apporteurId, setApporteurId] = useState(compte.apporteur_partenaire_id ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  const partenaires = (comptes ?? []).filter((c) => c.type_compte === 'partenaire')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const segment = segmentsRef?.find((s) => s.id === segmentId)
    const result = await update.mutateAsync({
      compteId: compte.id,
      segment_compte_id: segmentId || null,
      segment_compte_libelle: segment?.libelle ?? null,
      conseiller_referent_id: compte.conseiller_referent_id ?? null,
      conseiller_referent_nom: compte.conseiller_referent_nom ?? null,
      origine_acquisition: origine || null,
      mandat_cadre_actif: mandatCadre,
      note_interne: note || null,
      apporteur_partenaire_id: apporteurId || null,
    })
    setFeedback(result.persisted ? 'Enregistré.' : 'Enregistré localement (non synchronisé avec Supabase).')
    setTimeout(onClose, 700)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Détails client">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Segment">
          <Select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            <option value="">—</option>
            {segmentsRef?.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
          </Select>
        </FormField>
        <FormField label="Origine d'acquisition">
          <Input value={origine} onChange={(e) => setOrigine(e.target.value)} placeholder="Ex. Recommandation, salon, prospection…" />
        </FormField>
        {partenaires.length > 0 && (
          <FormField label="Apporteur d'affaires (optionnel)">
            <Select value={apporteurId} onChange={(e) => setApporteurId(e.target.value)}>
              <option value="">—</option>
              {partenaires.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </Select>
          </FormField>
        )}
        <label className="flex items-center gap-2 text-sm text-km-text">
          <input type="checkbox" checked={mandatCadre} onChange={(e) => setMandatCadre(e.target.checked)} />
          Mandat-cadre actif
        </label>
        <FormField label="Note interne">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={update.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}

function EditCompteFournisseurDialog({ compte, contacts, open, onClose }: { compte: Compte; contacts: { id: string; prenom: string; nom: string }[]; open: boolean; onClose: () => void }) {
  const update = useUpdateCompteFournisseur()
  const [electricite, setElectricite] = useState(compte.fournit_electricite ?? false)
  const [gaz, setGaz] = useState(compte.fournit_gaz ?? false)
  const [contactId, setContactId] = useState(compte.contact_commercial_id ?? '')
  const [statut, setStatut] = useState(compte.statut_partenariat ?? 'À qualifier')
  const [conditions, setConditions] = useState(compte.conditions_commerciales ?? '')
  const [commentaire, setCommentaire] = useState(compte.commentaire_partenariat ?? '')
  const [limiteEllipro, setLimiteEllipro] = useState(compte.limite_ellipro != null ? String(compte.limite_ellipro) : '')
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const contact = contacts.find((c) => c.id === contactId)
    const result = await update.mutateAsync({
      compteId: compte.id,
      fournit_electricite: electricite,
      fournit_gaz: gaz,
      contact_commercial_id: contactId || null,
      contact_commercial_nom: contact ? `${contact.prenom} ${contact.nom}` : null,
      statut_partenariat: statut,
      conditions_commerciales: conditions || null,
      commentaire_partenariat: commentaire || null,
      limite_ellipro: limiteEllipro ? Number(limiteEllipro) : null,
    })
    setFeedback(result.persisted ? 'Enregistré.' : 'Enregistré localement (non synchronisé avec Supabase).')
    setTimeout(onClose, 700)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Détails fournisseur">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-km-text">
            <input type="checkbox" checked={electricite} onChange={(e) => setElectricite(e.target.checked)} />
            Fournit l'électricité
          </label>
          <label className="flex items-center gap-2 text-sm text-km-text">
            <input type="checkbox" checked={gaz} onChange={(e) => setGaz(e.target.checked)} />
            Fournit le gaz
          </label>
        </div>
        {contacts.length > 0 && (
          <FormField label="Contact commercial">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Statut du partenariat">
          <Input value={statut} onChange={(e) => setStatut(e.target.value)} />
        </FormField>
        <FormField label="Limite Ellipro">
          <Input type="number" value={limiteEllipro} onChange={(e) => setLimiteEllipro(e.target.value)} placeholder="Ex. 5" />
        </FormField>
        <FormField label="Conditions commerciales">
          <Textarea rows={2} value={conditions} onChange={(e) => setConditions(e.target.value)} />
        </FormField>
        <FormField label="Commentaire">
          <Textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
        </FormField>
        {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={update.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}

function EditComptePartenaireDialog({ compte, contacts, open, onClose }: { compte: Compte; contacts: { id: string; prenom: string; nom: string }[]; open: boolean; onClose: () => void }) {
  const update = useUpdateComptePartenaire()
  const [typePartenariat, setTypePartenariat] = useState(compte.type_partenariat ?? '')
  const [modeleRemuneration, setModeleRemuneration] = useState(compte.modele_remuneration ?? '')
  const [contactId, setContactId] = useState(compte.contact_referent_id ?? '')
  const [statut, setStatut] = useState(compte.statut_partenariat ?? 'À qualifier')
  const [dateDebut, setDateDebut] = useState(compte.date_debut_partenariat ?? '')
  const [commentaire, setCommentaire] = useState(compte.commentaire_partenariat ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const contact = contacts.find((c) => c.id === contactId)
    const result = await update.mutateAsync({
      compteId: compte.id,
      type_partenariat: typePartenariat || null,
      modele_remuneration: modeleRemuneration || null,
      contact_referent_id: contactId || null,
      contact_referent_nom: contact ? `${contact.prenom} ${contact.nom}` : null,
      statut_partenariat: statut,
      date_debut_partenariat: dateDebut || null,
      commentaire_partenariat: commentaire || null,
    })
    setFeedback(result.persisted ? 'Enregistré.' : 'Enregistré localement (non synchronisé avec Supabase).')
    setTimeout(onClose, 700)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Détails partenaire">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Type de partenariat">
          <Input value={typePartenariat} onChange={(e) => setTypePartenariat(e.target.value)} placeholder="Ex. Apporteur d'affaires" />
        </FormField>
        <FormField label="Modèle de rémunération">
          <Input value={modeleRemuneration} onChange={(e) => setModeleRemuneration(e.target.value)} placeholder="Ex. Commission 5%" />
        </FormField>
        {contacts.length > 0 && (
          <FormField label="Contact référent">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Statut du partenariat">
          <Input value={statut} onChange={(e) => setStatut(e.target.value)} />
        </FormField>
        <FormField label="Date de début">
          <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
        </FormField>
        <FormField label="Commentaire">
          <Textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
        </FormField>
        {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={update.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}

function EditCompteDialog({ compte, open, onClose }: { compte: Compte; open: boolean; onClose: () => void }) {
  const updateCompte = useUpdateCompte()
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()
  const [nom, setNom] = useState(compte.nom)
  const [ville, setVille] = useState(compte.ville)
  const [segment, setSegment] = useState(compte.segment)
  const [proprietaireId, setProprietaireId] = useState(compte.proprietaire_id ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNom(compte.nom)
    setVille(compte.ville)
    setSegment(compte.segment)
    setProprietaireId(compte.proprietaire_id ?? '')
    setFeedback(null)
  }, [open, compte])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateCompte.mutateAsync({ id: compte.id, nom, ville, segment, proprietaire_id: proprietaireId || null })
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modifier le compte" description="Mettre à jour les informations de base du compte.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Nom">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} required />
        </FormField>
        <FormField label="Ville">
          <Input value={ville} onChange={(e) => setVille(e.target.value)} />
        </FormField>
        <FormField label="Segment">
          <Input value={segment} onChange={(e) => setSegment(e.target.value)} />
        </FormField>
        {isAdmin && (
          <FormField label="Propriétaire">
            <Select value={proprietaireId} onChange={(e) => setProprietaireId(e.target.value)}>
              <option value="">Aucun</option>
              {profilsAdmin?.map((p) => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
            </Select>
          </FormField>
        )}
        {feedback && <p className="text-xs text-km-red">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={updateCompte.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}
