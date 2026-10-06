/**
 * Création d'une recommandation.
 *
 * Depuis le 06/10/2026, un parcours en deux étapes dans la coquille commune des parcours — voir
 * « LE PARCOURS EN DEUX ÉTAPES » plus bas. Ce fichier garde aussi les règles partagées avec la
 * conversion d'une opportunité (`DialogConversionOpportunite`) : ce qu'est un compteur sous contrat,
 * le titre généré, la date de clôture conseillée.
 *
 * Historique : transposition de l'`OpportuniteWizard` de Tools le 15/08/2026 (quatre étapes :
 * énergie, points de livraison, contact, date), à la demande de Naoëlle. Ce qui en reste : le
 * mandat n'est jamais choisi à la main (il se déduit du premier compteur), le préavis réel du
 * contrat en cours sert au calcul de la date, et les compteurs déjà engagés sont écartés.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Briefcase, Check, Flame, Loader2, Lock, Search, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  EnTeteEtape, FenetreParcours, PanneauParcours, RailParcours, useSortieParcours,
  type ElementRail, type EtapeParcours, type ResumeEtape,
} from '@/components/parcours/Parcours'
import { ContactPicker } from '@/components/contact/ContactPicker'
import { NoteElliproLigne } from '@/components/opportunite/EllisphereScoreCard'
import { dateFr, dateValide, ecrireMontant, lireMontant } from '@/components/recommandation/cloture/commun'
import { useSynchroCompteur } from '@/lib/data/synchroCompteur'
import { mandatKiweeCouvre } from '@/lib/couvertureMandat'
import { useSitesParCompte } from '@/lib/data/sites'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateRecommandation, useRecommandationsRetenant } from '@/lib/data/recommandations'
import { useMandatsListe, useMandatsParCompte } from '@/lib/data/mandats'
import { useCompteursParCompte, useCompteursParIds } from '@/lib/data/compteurs'
import { echeanceLisible, useEcheancesRetenues } from '@/lib/data/echeancesRetenues'
import { useContacts, useContactsParCompte } from '@/lib/data/contacts'
import { useContratsParCompte } from '@/lib/data/contrats'
import { useCompte, useComptesLegers } from '@/lib/data/comptes'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_ETAPES_RECOMMANDATION, FALLBACK_TYPES_ENERGIES } from '@/lib/referenceFallbacks'
import { trouverParCode } from '@/lib/codeReferentiel'
import { cn } from '@/lib/utils'
import type { Compteur } from '@/types/domain'
import { contactsDuCompte as contactsRattaches } from '@/lib/contactsDuCompte'
import { estJourOuvreFR } from '@/lib/joursFeries'

/**
 * UN PDL COMPTE POUR « CLIENT » DÈS QU'UN CONTRAT EN COURS LE COUVRE.
 *
 * ══ CE QUE CE TEST DISAIT AVANT, ET POURQUOI IL ÉTAIT FAUX ══
 *
 * `new Set(['ACTIF', 'A_RENOUVELER'])`, comparé au statut du contrat. Deux défauts :
 *
 * · `A_RENOUVELER` N'EXISTE PAS dans `statuts_contrats` — la table connaît À signer, À venir,
 *   Actif, Annulé, En préparation, Nouveau, Résilié, Signé, Terminé. Le code venait de Tools et
 *   n'a jamais eu d'équivalent ici : il ne reconnaissait donc que « Actif ».
 * · LE STATUT ADMINISTRATIF N'EST PAS LA COUVERTURE. Un contrat signé qui démarre le mois
 *   prochain couvre bel et bien son compteur ; un contrat « Actif » dont la date de fin est
 *   passée ne le couvre plus (8 contrats sont dans ce cas).
 *
 * Mesuré le 02/09/2026 : 184 compteurs étaient étiquetés « Prospect » ici alors que le score de
 * qualité les comptait sous contrat. L'assistant les refusait donc au titre du mélange
 * client/prospect, et les classait en « Captation » là où c'est un renouvellement.
 *
 * ══ LA DÉFINITION RETENUE ══
 *
 * Celle de Michel, 02/09/2026 : « rattaché à un contrat », lue comme partout ailleurs dans
 * l'application — un contrat en cours, c'est-à-dire sans date de fin ou dont la fin n'est pas
 * passée. C'est mot pour mot `v_qualite_compteur.a_contrat`, et c'est ce qui garantit qu'un
 * compteur ne peut plus être « sous contrat » sur la fiche et « prospect » dans l'assistant.
 */
function contratEnCours(ct: { date_fin: string | null }): boolean {
  if (!ct.date_fin) return true
  return new Date(ct.date_fin) >= new Date(new Date().toDateString())
}

/** La date de clôture conseillée ne va jamais au-delà d'aujourd'hui + 60 jours (William, 06/10/2026). */
const PLAFOND_CLOTURE_JOURS = 60

/** Préavis retenu quand le contrat en cours ne le précise pas. */
const PREAVIS_DEFAUT_JOURS = 60

function normalizeAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/**
 * Titre auto-généré, jamais saisi à la main — reprend buildOpportunityName() de Tools
 * (`src/lib/opportunity-actions.ts`) : « {COMPTE}[ - SITE] » pour un seul PDL,
 * « MULTISITE - {date} - {COMPTE} » au-delà.
 *
 * ══ L'EMOJI D'ÉNERGIE A ÉTÉ RETIRÉ DU NOM (31/08/2026) ══
 *
 * Cette fonction préfixait le titre d'un 🔥 ou d'un ⚡ selon l'énergie. C'était la SOURCE des 204
 * noms émaillés qu'on a trouvés en base — un caractère décoratif rangé dans une donnée métier.
 *
 * Trois conséquences qu'on ne voit pas en le tapant : le nom réel remonte tel quel dans les exports,
 * les PDF de mandat et les messages Slack ; une recherche sur « CABINET » ne trouve pas
 * « 🔥 CABINET » quand elle compare le début de la chaîne ; et un tri alphabétique range ces
 * dossiers hors de l'alphabet.
 *
 * L'ÉNERGIE EST DÉJÀ UNE COLONNE — `recommandations.type_energie_id`. L'écran la dessine avec
 * `IconeEnergie`, en trait fin et à la couleur de l'application. C'est sa place : une information
 * dans une colonne, une icône dans une vue.
 */
/**
 * Le titre d'une recommandation, à l'identique partout.
 *
 * Exporté le 11/09/2026 pour le dialogue de conversion : deux recommandations nées du même
 * périmètre, l'une par l'assistant et l'autre par la conversion, doivent porter le même genre de
 * nom. Recopier la règle aurait suffi aujourd'hui et divergé au premier changement.
 */
export function buildTitre(
  compteNom: string,
  siteNom: string | null | undefined,
  pdlCount: number,
  dateCloture: string,
): string {
  const acc = normalizeAccents(compteNom).toUpperCase()
  if (pdlCount === 1) {
    const site = siteNom ? ` - ${normalizeAccents(siteNom)}` : ''
    return acc
      ? `${acc}${site}`
      : `SANS COMPTE${site}`
  }
  return `MULTISITE - ${dateCloture} - ${acc}`
}

/**
 * LA DATE DE CLÔTURE SUGGÉRÉE : la plus proche des échéances du lot, diminuée du préavis réel du
 * contrat en cours — et non d'un préavis forfaitaire, qui ferait rater la fenêtre de résiliation
 * sur les fournisseurs qui exigent plus que les 30 jours habituels.
 *
 * ══ JAMAIS UN WEEK-END NI UN JOUR FÉRIÉ — William, 06/10/2026 ══
 * « Fais en sorte que ça ne tombe pas sur un weekend notamment. » La date recule au jour ouvré
 * précédent (`estJourOuvreFR`, fériés compris) : plus tôt, le préavis reste tenu ; plus tard, il
 * serait dépassé.
 *
 * ══ AU PLUS TARD À J+60 — William, 06/10/2026 ══
 * « OK pour la règle en fonction du préavis, mais avec une limite à J+60 par rapport à aujourd'hui.
 * Si c'était censé être au 31/08/2028, tu corriges pour mettre au 06/12/2026. » La date retenue est
 * la plus proche des deux — échéance − préavis, ou aujourd'hui + 60 jours —, puis le jour ouvré.
 * `plafondJours: null` rend la date du seul préavis (l'alerte « préavis dépassé » s'y compare).
 *
 * Sortie de son composant le 11/09/2026 : la conversion d'une opportunité crée plusieurs
 * recommandations d'un coup, chacune sur son propre lot de compteurs, donc chacune avec sa propre
 * date. La règle ne pouvait plus vivre dans l'état d'un seul formulaire.
 *
 * Chaîne vide si aucun compteur du lot ne porte d'échéance : mieux vaut un champ à remplir qu'une
 * date inventée — voir la règle des dates bouche-trou.
 */
export function dateClotureSuggereePour(
  compteurs: { id: string; date_echeance?: string | null }[],
  /* Décrit par sa forme et non par le type `Contrat` complet : cette fonction n'a besoin que de
     trois champs, et s'attacher au type entier la rendrait solidaire de ses cinquante autres. */
  contrats: { date_fin: string | null; preavis_resiliation_jours?: number | null; compteurs: { id: string }[] }[],
  options: { plafondJours?: number | null; aujourdhui?: Date } = {},
): string {
  if (compteurs.length === 0) return ''
  const plafondJours = options.plafondJours === undefined ? PLAFOND_CLOTURE_JOURS : options.plafondJours
  const dates = compteurs
    .map((c) => {
      if (!c.date_echeance) return null
      const contratActuel = contrats.find(
        (ct) => contratEnCours(ct) && ct.compteurs.some((cpt) => cpt.id === c.id),
      )
      const preavis = contratActuel?.preavis_resiliation_jours ?? PREAVIS_DEFAUT_JOURS
      /* À midi, à l'heure locale : ni le fuseau ni le passage à l'heure d'été ne décalent le jour. */
      const [a, m, j] = c.date_echeance.slice(0, 10).split('-').map(Number)
      const d = new Date(a, m - 1, j, 12)
      d.setDate(d.getDate() - preavis)
      return d
    })
    .filter((d): d is Date => d != null)
  if (dates.length === 0) return ''
  const d = dates.reduce((x, y) => (x < y ? x : y))
  if (plafondJours != null) {
    const auj = options.aujourdhui ?? new Date()
    const plafond = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() + plafondJours, 12)
    if (plafond < d) d.setTime(plafond.getTime())
  }
  while (!estJourOuvreFR(d)) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}


/* ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE PARCOURS EN DEUX ÉTAPES — William, 06/10/2026
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * « Retravaille le process de création de la recommandation sur les nouveaux modèles : étape 1, la
 * note Ellipro actualisée + choix de l'énergie + choix du ou des compteurs ; étape 2, choix du
 * contact décisionnaire (par défaut le responsable des compteurs choisis) + date de clôture +
 * montant. Très rapide, sans fioriture. » Directions retenues sur les maquettes
 * (https://claude.ai/artifact/9zaDWkHCNoaUyC8SuAz6Vb) : A pour l'étape 1, A pour le contact et B
 * pour la date et le montant.
 *
 *   · LA COQUILLE DES PARCOURS (`Parcours.tsx`) : fenêtre, rail anthracite, sortie confirmée.
 *   · UNE SEULE ÉNERGIE : « impossible de créer une recommandation avec à la fois des compteurs gaz
 *     et électricité ». Le sélecteur filtre la liste ; changer d'énergie vide la sélection.
 *   · LE COMPTE, quand on ne vient pas d'une fiche, se choisit en tête de l'étape 1.
 *   · LE CONTACT PAR DÉFAUT est le responsable qui couvre le plus de compteurs choisis.
 *   · ORIGINE, PRIORITÉ, DESCRIPTION, COMMENTAIRE quittent le parcours : 1 recommandation sur 1 855
 *     avait une origine, aucune des 153 du dernier mois une description. La priorité reste
 *     « Normale » et se change sur la fiche.
 * Les règles d'avant restent : compteurs sous mandat KiWee actif, écartés montrés avec leur raison,
 * mélange client / prospect bloquant, titre généré, montant obligatoire, mandat déduit.
 */

type EnergieReco = 'electricite' | 'gaz'

const initialesDe = (prenom?: string | null, nom?: string | null) => `${(prenom || '?')[0]}${(nom || '?')[0]}`.toUpperCase()
const TEINTES_AVATAR = ['bg-km-green-soft text-km-green', 'bg-km-blue-soft text-km-blue', 'bg-[#F1ECF8] text-km-violet', 'bg-km-amber-soft text-km-amber']

export function CreateRecommandationDialog(props: {
  open: boolean
  onClose: () => void
  onCreated: (recoId: string) => void
  initialCompteId?: string
  /**
   * L'opportunité qu'on convertit, quand on arrive de sa fiche. Diapositive 10 : « une opportunité
   * convertie peut créer plusieurs recommandations selon les périmètres à traiter » — donc ce
   * parcours s'ouvre autant de fois qu'il y a de périmètres, et chaque recommandation garde le lien.
   */
  opportuniteId?: string
  /** Périmètre proposé au départ — celui de l'opportunité. Reste modifiable : c'est justement le
   *  geste de découper en plusieurs recommandations. */
  initialCompteurIds?: string[]
}) {
  /* Monté à l'ouverture, démonté à la fermeture : chaque parcours repart d'une page blanche. */
  if (!props.open) return null
  return <ParcoursCreationRecommandation {...props} />
}

function ParcoursCreationRecommandation({ onClose, onCreated, initialCompteId, opportuniteId, initialCompteurIds }: {
  onClose: () => void
  onCreated: (recoId: string) => void
  initialCompteId?: string
  opportuniteId?: string
  initialCompteurIds?: string[]
}) {
  /* ══ RIEN QUE LE COMPTE OUVERT — 06/10/2026 ══ « Optimise à fond les temps de chargement. » Le
     parcours lisait toute la base à l'ouverture (7 956 compteurs, 3 455 contacts, 2 799 comptes,
     1 855 recommandations, 1 612 contrats). Il ne lit plus que le compte choisi : ses mandats, les
     compteurs qu'ils couvrent, ses contacts et ses contrats, et pour ces seuls compteurs, la
     recommandation qui les retient. Les contacts de toute la base ne se lisent qu'à la demande
     (« Un autre contact »). */
  const [compteId, setCompteId] = useState(initialCompteId ?? '')
  const [autreContact, setAutreContact] = useState(false)
  const { data: mandats, isLoading: mandatsEnCours } = useMandatsParCompte(compteId || undefined)
  const idsSousMandat = useMemo(
    () => (mandats ? [...new Set(mandats.filter((m) => m.statut === 'ACTIF').flatMap((m) => m.compteur_ids))] : undefined),
    [mandats],
  )
  /* EN MÊME TEMPS QUE LES MANDATS : les compteurs du compte. Après eux, seulement ceux qu'un mandat
     du compte couvre sur un autre compte (39 liens en base au 06/10/2026) — le plus souvent aucun. */
  const { data: compteursCompte, isLoading: compteursEnCours } = useCompteursParCompte(compteId || undefined)
  const idsAilleurs = useMemo(() => {
    if (!idsSousMandat || !compteursCompte) return undefined
    const ici = new Set(compteursCompte.map((c) => c.id))
    return idsSousMandat.filter((id) => !ici.has(id))
  }, [idsSousMandat, compteursCompte])
  const { data: compteursAilleurs } = useCompteursParIds(idsAilleurs)
  const compteurs = useMemo(() => {
    if (!idsSousMandat || !compteursCompte) return undefined
    const couverts = new Set(idsSousMandat)
    return [...compteursCompte, ...(compteursAilleurs ?? [])].filter((c) => couverts.has(c.id))
  }, [idsSousMandat, compteursCompte, compteursAilleurs])
  const { data: retenusParCompteur } = useRecommandationsRetenant(idsSousMandat)
  const { data: contactsCompte } = useContactsParCompte(compteId || undefined)
  const { data: tousContacts } = useContacts(autreContact)
  const contacts = useMemo(() => {
    const m = new Map((tousContacts ?? []).map((c) => [c.id, c]))
    for (const c of contactsCompte ?? []) m.set(c.id, c)
    return [...m.values()]
  }, [contactsCompte, tousContacts])
  const { data: contrats } = useContratsParCompte(compteId || undefined)
  const { data: compteCible } = useCompte(compteId || undefined)
  const chargementCompteurs = !!compteId && (mandatsEnCours || compteursEnCours)
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const { data: energiesRef } = useReferenceTable('types_energies')
  const energies = energiesRef && energiesRef.length > 0 ? energiesRef : FALLBACK_TYPES_ENERGIES
  const createRecommandation = useCreateRecommandation()

  const [etape, setEtape] = useState<'perimetre' | 'decision'>('perimetre')
  const [energieChoisie, setEnergieChoisie] = useState<EnergieReco | null>(null)
  const [compteurIds, setCompteurIds] = useState<string[]>(initialCompteurIds ?? [])
  const [recherche, setRecherche] = useState('')
  const [rechercheCompte, setRechercheCompte] = useState('')
  const [contactChoisi, setContactChoisi] = useState('')
  const [dateAutre, setDateAutre] = useState<string | null>(null)
  const [montantTxt, setMontantTxt] = useState('')
  const [montantTouche, setMontantTouche] = useState(false)
  /* Faire du contact choisi le responsable des compteurs qui en ont un autre (06/10/2026). */
  const [majResponsables, setMajResponsables] = useState(true)
  const [actualisation, setActualisation] = useState<Record<string, { etat: 'lecture' | 'complet' | 'erreur' | 'hors'; detail: string }>>({})
  const qc = useQueryClient()
  const synchro = useSynchroCompteur(() => {})
  const { data: sitesDuCompte } = useSitesParCompte(compteId || undefined)
  const [entame, setEntame] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const retenus = useMemo(() => retenusParCompteur ?? new Map<string, { id: string; nom: string }>(), [retenusParCompteur])

  /* ══ LES COMPTEURS ÉLIGIBLES ══ Ceux du compte couverts par un mandat ACTIF ; on n'écarte que
     ceux déjà engagés sur une recommandation en cours — et on dit lesquels, avec le lien. */
  const mandatsActifsDuCompte = useMemo(
    () => (mandats ?? []).filter((m) => m.compte_id === compteId && m.statut === 'ACTIF'),
    [mandats, compteId],
  )
  const sousMandat = useMemo(() => {
    const ids = new Set<string>()
    for (const m of mandatsActifsDuCompte) for (const c of m.compteur_ids) ids.add(c)
    return (compteurs ?? []).filter((c) => ids.has(c.id))
  }, [mandatsActifsDuCompte, compteurs])
  const eligiblesPar = (e: EnergieReco) => sousMandat.filter((c) => c.type_energie === e && !retenus.has(c.id))
  const nbElec = eligiblesPar('electricite').length
  const nbGaz = eligiblesPar('gaz').length

  /* L'ÉNERGIE PAR DÉFAUT : celle du périmètre proposé, sinon celle qui a des compteurs (l'électricité
     d'abord). Un clic de moins dans le cas le plus courant. */
  const energieDuPerimetre = (compteurs ?? []).find((c) => initialCompteurIds?.includes(c.id))?.type_energie ?? null
  const energie: EnergieReco = energieChoisie ?? energieDuPerimetre ?? (nbElec === 0 && nbGaz > 0 ? 'gaz' : 'electricite')
  const typeEnergieId = trouverParCode(energies, energie === 'gaz' ? 'GAZ' : 'ELECTRICITE')?.id ?? ''

  const eligibles = useMemo(() => eligiblesPar(energie), [sousMandat, retenus, energie]) // eslint-disable-line react-hooks/exhaustive-deps
  const ecartes = useMemo(
    () => sousMandat.filter((c) => c.type_energie === energie && retenus.has(c.id)).map((c) => ({ compteur: c, reco: retenus.get(c.id)! })),
    [sousMandat, retenus, energie],
  )
  const affiches = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return eligibles
    return eligibles.filter((c) => [c.numero_pdl, c.utilisation, c.site_nom].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
  }, [eligibles, recherche])
  /* Les échéances de tous les compteurs sous mandat, dès que les mandats sont lus : la liste ne les
     attend pas. */
  const { data: echeancesRetenues } = useEcheancesRetenues(idsSousMandat ?? [])
  /* Une sélection ne garde que des compteurs de l'énergie affichée : la règle d'une seule énergie. */
  const choisis = useMemo(() => eligibles.filter((c) => compteurIds.includes(c.id)), [eligibles, compteurIds])

  const enCours = useMemo(() => {
    const ids = new Set<string>()
    for (const c of contrats ?? []) if (contratEnCours(c)) for (const cpt of c.compteurs) ids.add(cpt.id)
    return ids
  }, [contrats])
  const estClient = (c: Compteur) => enCours.has(c.id)
  const mixInvalide = new Set(choisis.map((c) => (estClient(c) ? 'client' : 'prospect'))).size > 1
  const typeOpportunite = choisis.length > 0 && choisis.every(estClient) ? 'Renouvellement' : 'Captation'
  const consoTotale = choisis.reduce((t, c) => t + (c.consommation_annuelle_mwh ?? 0), 0)
  const mandatRetenu = choisis.length ? mandatsActifsDuCompte.find((m) => m.compteur_ids.includes(choisis[0].id)) ?? null : null

  /* ══ LES CONTACTS ══ Ceux du compte, les responsables des compteurs choisis en tête (le plus de
     compteurs d'abord) ; le premier d'entre eux est proposé. */
  const contactsDuCompte = contactsRattaches(contacts, compteId)
  const responsabilites = useMemo(() => {
    const m = new Map<string, Compteur[]>()
    for (const c of choisis) if (c.responsable_contact_id) m.set(c.responsable_contact_id, [...(m.get(c.responsable_contact_id) ?? []), c])
    return m
  }, [choisis])
  const contactsTries = useMemo(
    () => [...contactsDuCompte].sort((x, y) => (responsabilites.get(y.id)?.length ?? 0) - (responsabilites.get(x.id)?.length ?? 0)
      || `${x.nom} ${x.prenom}`.localeCompare(`${y.nom} ${y.prenom}`)),
    [contactsDuCompte, responsabilites],
  )
  /* Le premier de la liste qui est responsable : celui qui couvre le plus de compteurs, puis l'ordre alphabétique. */
  const responsableParDefaut = contactsTries.find((c) => responsabilites.has(c.id))?.id
    ?? [...responsabilites.keys()][0] ?? ''
  const contactId = contactChoisi || responsableParDefaut
  const contactRetenu = (contacts ?? []).find((c) => c.id === contactId)
  /* ══ UN SEUL INTERLOCUTEUR — William, 06/10/2026 ══ « Si le contact décisionnaire est différent du
     ou des responsables des compteurs, proposer de changer les responsables par le choix du
     commercial : ça évite les incohérences entre le contact de la recommandation et celui du
     compteur. » Proposé coché ; décoché, les compteurs gardent leur responsable. */
  const aReattribuer = contactId ? choisis.filter((c) => c.responsable_contact_id !== contactId) : []
  const nomContact = (id: string | null | undefined) => {
    const ct = (contacts ?? []).find((x) => x.id === id)
    return ct ? `${ct.prenom} ${ct.nom}`.trim() : null
  }
  const responsablesActuels = (() => {
    const n = new Map<string, number>()
    /* Le nom porté par le compteur sert de repli : son responsable peut venir d'un autre compte. */
    for (const c of aReattribuer) { const k = nomContact(c.responsable_contact_id) ?? c.responsable_contact_nom ?? 'aucun responsable'; n.set(k, (n.get(k) ?? 0) + 1) }
    return [...n.entries()].map(([k, v]) => (aReattribuer.length > 1 ? `${k} (${v})` : k)).join(', ')
  })()

  /* ══ LA DATE ET LE MONTANT ══ */
  const dateConseillee = useMemo(() => dateClotureSuggereePour(choisis, contrats ?? []), [choisis, contrats])
  /* La date du seul préavis : au-delà, il risque d'être dépassé. */
  const datePreavis = useMemo(() => dateClotureSuggereePour(choisis, contrats ?? [], { plafondJours: null }), [choisis, contrats])
  const dateCloture = dateAutre ?? dateConseillee
  /* ══ LE MONTANT PROPOSÉ — William, 06/10/2026 ══ « Gaz : consommation × 3 × 3 ; électricité :
     consommation × 3 × 5. Évidemment ce montant doit être éditable. » Il suit le périmètre (et les
     consommations actualisées) tant qu'on ne l'a pas retouché ; au centime. */
  const facteur = energie === 'gaz' ? 3 : 5
  const montantPropose = consoTotale > 0 ? Math.round(consoTotale * 3 * facteur * 100) / 100 : null
  const montantAffiche = montantTouche ? montantTxt : ecrireMontant(montantPropose)
  const montant = lireMontant(montantAffiche)
  const titre = compteCible && choisis.length > 0 ? buildTitre(compteCible.nom, choisis[0].site_nom, choisis.length, dateCloture) : ''

  const perimetrePret = !!compteCible && choisis.length > 0 && !mixInvalide
  const decisionPrete = perimetrePret && !!contactId && dateValide(dateCloture) && montant != null && montant !== 'invalide' && !!mandatRetenu

  const sortie = useSortieParcours({
    entame: entame && !createRecommandation.isPending,
    bloque: createRecommandation.isPending,
    onFermer: onClose,
    titre: 'Fermer sans créer la recommandation ?',
    lignes: [{ perdu: true, texte: 'Le périmètre et les informations saisies seront perdus.' }],
    libelleFermer: 'Fermer sans créer',
  })

  function choisirEnergie(e: EnergieReco) {
    if (e === energie) return
    setEnergieChoisie(e)
    setCompteurIds([])
    setContactChoisi('')
    setDateAutre(null)
  }
  function basculer(id: string) {
    setEntame(true)
    setCompteurIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
  }
  const toutChoisi = affiches.length > 0 && affiches.every((c) => compteurIds.includes(c.id))
  function basculerTout() {
    setEntame(true)
    const ids = affiches.map((c) => c.id)
    setCompteurIds((l) => (toutChoisi ? l.filter((x) => !ids.includes(x)) : [...new Set([...l, ...ids])]))
  }

  /* ══ LES CONSOMMATIONS, ACTUALISÉES — William, 06/10/2026 ══ « Tu fais une actu Ellipro mais ce
     serait bien également de faire une actu des données de consommation des compteurs choisis,
     après s'être assuré que ces compteurs soient bien couverts par un mandat KiWee. » Au passage à
     l'étape 2, chaque compteur choisi couvert par un mandat KiWee actif (`mandatKiweeCouvre`, la
     règle du serveur) est relu chez Enedis ou GRDF, trois à la fois ; le rail suit l'avancement.
     Les autres sont signalés, pas appelés. On n'attend pas : l'étape 2 se remplit pendant ce temps,
     et le montant proposé suit les consommations relues. */
  async function actualiser(lot: Compteur[]) {
    const aFaire = lot.filter((c) => !actualisation[c.id])
    if (!aFaire.length) return
    const cpSite = new Map((sitesDuCompte ?? []).map((s) => [s.id, s.code_postal]))
    setActualisation((a) => ({
      ...a,
      ...Object.fromEntries(aFaire.map((c) => [c.id, mandatKiweeCouvre(mandats, c.id)
        ? { etat: 'lecture' as const, detail: `Lecture ${c.type_energie === 'gaz' ? 'GRDF' : 'Enedis'}…` }
        : { etat: 'hors' as const, detail: 'Sans mandat KiWee : non actualisé' }])),
    }))
    /* TROIS À LA FOIS : chaque lecture prend quelques secondes chez le gestionnaire de réseau ; à la
       file, dix compteurs faisaient attendre une demi-minute. Le message de chacun est gardé à part. */
    const file = aFaire.filter((c) => mandatKiweeCouvre(mandats, c.id))
    const une = async (c: Compteur) => {
      let message = ''
      const ok = await synchro.synchroniser({ id: c.id, numero: c.numero_pdl, energie: c.type_energie, codePostal: c.code_postal ?? cpSite.get(c.site_id) }, true, (m) => { message = m })
      setActualisation((a) => ({ ...a, [c.id]: ok
        ? { etat: 'complet', detail: `${c.type_energie === 'gaz' ? 'GRDF' : 'Enedis'} : actualisé` }
        : { etat: 'erreur', detail: message || 'Actualisation impossible' } }))
    }
    await Promise.all(Array.from({ length: Math.min(3, file.length) }, async () => {
      for (let c = file.shift(); c; c = file.shift()) await une(c)
    }))
    void qc.invalidateQueries({ queryKey: ['echeances-retenues'] })
  }

  async function creer() {
    setErreur(null)
    if (!decisionPrete || !compteCible || !mandatRetenu || typeof montant !== 'number' || createRecommandation.isPending) return
    try {
      /* Le responsable des compteurs et la recommandation s'écrivent EN MÊME TEMPS : deux écritures
         indépendantes, un seul temps d'attente. */
      const responsables = majResponsables && aReattribuer.length > 0
        ? supabase.from('compteurs').update({ responsable_contact_id: contactId }).in('id', aReattribuer.map((c) => c.id))
          .then(({ error }) => { if (error) throw new Error(`responsable des compteurs non mis à jour : ${error.message}`); void qc.invalidateQueries({ queryKey: ['compteurs'] }) })
        : Promise.resolve()
      const creation = createRecommandation.mutateAsync({
        titre,
        mandat_ids: [mandatRetenu.id],
        compte_id: compteCible.id,
        compte_nom: compteCible.nom,
        type_energie_id: typeEnergieId || null,
        type_energie: energie,
        compteurs: choisis.map((c) => ({ id: c.id, site_id: c.site_id, site_nom: c.site_nom })),
        contact_signataire_id: contactId || null,
        date_cloture: dateCloture || null,
        type_opportunite: typeOpportunite,
        opportunite_id: opportuniteId ?? null,
        etape_id: trouverParCode(etapes, 'BROUILLON', 'CONSULTATION')?.id ?? null,
        origine_id: null,
        priorite: 2,
        description: '',
        commentaire_interne: '',
        /* LE MONTANT NE S'ARRONDIT PAS : au centime, virgule comprise (`lireMontant`). */
        montant,
      })
      const [, result] = await Promise.all([responsables, creation])
      if (!result.persisted) throw new Error('la recommandation n’a pas pu être enregistrée')
      onCreated(result.recommandation.id)
    } catch (e) {
      /* L'erreur reste dans la fenêtre : rien de saisi n'est perdu, on peut réessayer. */
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }
  const ETAPES: EtapeParcours[] = [
    { cle: 'perimetre', libelle: 'Périmètre' },
    { cle: 'decision', libelle: 'Décision' },
  ]
  const resumes: Record<string, ResumeEtape | undefined> = {
    perimetre: etape === 'decision' ? {
      elements: choisis.map((c): ElementRail => {
        const a = actualisation[c.id]
        return {
          cle: c.id,
          libelle: c.utilisation || c.site_nom || c.numero_pdl,
          detail: a?.detail ?? null,
          etat: !a ? 'complet' : a.etat === 'hors' ? 'incomplet' : a.etat,
          onChoisir: () => setEtape('perimetre'),
        }
      }),
      lignes: [
        `${energie === 'gaz' ? 'Gaz' : 'Électricité'} · ${choisis.length} compteur${choisis.length > 1 ? 's' : ''}`,
        `${consoTotale ? `${consoTotale.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh · ` : ''}${typeOpportunite}`,
      ],
    } : undefined,
  }

  return (
    <FenetreParcours sortie={sortie}>
      <RailParcours
        titre="Nouvelle recommandation"
        reference={compteCible?.nom ?? null}
        etapes={ETAPES}
        courante={etape}
        sousTitre={etape === 'perimetre' ? 'Énergie et compteurs' : 'Contact, date, montant'}
        resumes={resumes}
        note={titre
          ? { titre: 'Nom de la recommandation', texte: titre }
          : { titre: 'Deux étapes, rien d’enregistré avant la fin', texte: 'Seuls les compteurs sous mandat KiWee actif, et pas déjà engagés ailleurs, sont proposés.' }}
        onFermer={sortie.demander}
      />
      <PanneauParcours>
        {etape === 'perimetre' ? (
          <>
            <EnTeteEtape numero={1} total={2} titre={compteCible ? 'Quels compteurs étudier ?' : 'Pour quel compte ?'} />
            {!compteCible ? (
              <ChoixCompte
                recherche={rechercheCompte}
                onRecherche={setRechercheCompte}
                onChoisir={(id) => { setCompteId(id); setCompteurIds([]); setContactChoisi(''); setEntame(true) }}
              />
            ) : (
              <>
                <div className="mb-4 flex flex-col gap-2">
                  {!initialCompteId && (
                    <div className="flex items-center gap-2 text-[12px] text-km-muted">
                      <Briefcase className="h-3.5 w-3.5" />
                      <span className="font-semibold text-km-text">{compteCible.nom}</span>
                      <button type="button" onClick={() => { setCompteId(''); setCompteurIds([]); setContactChoisi('') }} className="font-semibold text-km-green hover:underline">Changer</button>
                    </div>
                  )}
                  <NoteElliproLigne key={compteCible.id} compteId={compteCible.id} siren={compteCible.siren} />
                </div>

                <div className="mb-3 flex items-center gap-3">
                  <div role="group" aria-label="Énergie" className="flex gap-0.5 rounded-[11px] bg-km-soft p-[3px]">
                    {([['electricite', 'Électricité', nbElec, Zap, 'text-km-elec'], ['gaz', 'Gaz', nbGaz, Flame, 'text-km-gaz']] as const).map(([cle, nom, n, Icone, teinte]) => (
                      <button
                        key={cle}
                        type="button"
                        aria-pressed={energie === cle}
                        onClick={() => choisirEnergie(cle)}
                        className={cn('flex h-8 items-center gap-[7px] rounded-[9px] px-[14px] text-[12.5px] transition-colors',
                          energie === cle ? 'bg-white font-semibold text-km-text shadow-[0_1px_3px_rgba(25,40,33,.12)]' : 'font-medium text-km-muted hover:text-km-text')}
                      >
                        <Icone className={cn('h-3.5 w-3.5', teinte)} strokeWidth={2.2} />
                        {nom} <span className="font-mono text-[11px] text-km-muted">{n}</span>
                      </button>
                    ))}
                  </div>
                  <span className="flex-1" />
                  <label className="flex h-8 w-[220px] items-center gap-[7px] rounded-[9px] border border-km-line px-[11px] text-km-faint focus-within:border-km-green">
                    <Search className="h-3.5 w-3.5 shrink-0" />
                    <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="PDL, site…" aria-label="Rechercher un compteur" className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-km-text outline-none" />
                  </label>
                </div>

                <TableCompteurs
                  affiches={affiches}
                  ecartes={ecartes}
                  choisis={compteurIds}
                  toutChoisi={toutChoisi}
                  onBasculer={basculer}
                  onBasculerTout={basculerTout}
                  estClient={estClient}
                  echeance={(c) => echeanceLisible(echeancesRetenues?.get(c.id), c.date_echeance)}
                  chargement={chargementCompteurs}
                  vide={eligibles.length === 0 ? `Aucun compteur ${energie === 'gaz' ? 'de gaz' : 'd’électricité'} sous mandat KiWee actif sur ce compte.` : 'Aucun compteur ne correspond à la recherche.'}
                />

                <div className="mt-4 flex items-center gap-3 border-t border-km-line-soft pt-4">
                  {mixInvalide ? (
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-km-red"><AlertTriangle className="h-3.5 w-3.5" /> Impossible de mélanger clients et prospects</span>
                  ) : choisis.length > 0 ? (
                    <span className="text-[12.5px]">
                      <b>{choisis.length} compteur{choisis.length > 1 ? 's' : ''}</b>
                      <span className="text-km-muted">{consoTotale ? ` · ${consoTotale.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh` : ''} · {typeOpportunite}</span>
                    </span>
                  ) : (
                    <span className="text-[11.5px] text-km-faint">Choisissez au moins un compteur.</span>
                  )}
                  <span className="flex-1" />
                  <Button variant="ghost" onClick={sortie.demander}>Annuler</Button>
                  <Button variant="primary" disabled={!perimetrePret} onClick={() => { setEtape('decision'); void actualiser(choisis) }}>
                    Continuer <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <EnTeteEtape numero={2} total={2} titre="Qui décide, et pour quand ?" />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">Contact décisionnaire <span className="text-km-muted">*</span></span>
                <span className="text-[11px] text-km-faint">{contactsDuCompte.length} contact{contactsDuCompte.length > 1 ? 's' : ''} sur le compte</span>
              </div>
              {contactsTries.length > 0 && (
                <div role="radiogroup" aria-label="Contact décisionnaire" className="mb-2 max-h-[236px] overflow-y-auto rounded-[12px] border border-km-line">
                  {contactsTries.map((ct, i) => {
                    const actif = ct.id === contactId
                    const resp = responsabilites.get(ct.id)
                    return (
                      <button
                        key={ct.id}
                        type="button"
                        role="radio"
                        aria-checked={actif}
                        onClick={() => { setContactChoisi(ct.id); setEntame(true) }}
                        className={cn('flex h-[52px] w-full items-center gap-3 px-[14px] text-left text-[12.5px] transition-colors', i > 0 && 'border-t border-km-line-soft', actif ? 'bg-km-green-tint' : 'hover:bg-km-bg')}
                      >
                        <span className={cn('h-4 w-4 shrink-0 rounded-full', actif ? 'border-[5px] border-km-green' : 'border-[1.5px] border-[#C3CBC5]')} />
                        <span className={cn('flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold', TEINTES_AVATAR[i % TEINTES_AVATAR.length])}>{initialesDe(ct.prenom, ct.nom)}</span>
                        <span className="flex min-w-0 flex-1 flex-col gap-px">
                          <span className="truncate font-semibold text-km-text">{ct.prenom} {ct.nom}</span>
                          {ct.fonction && <span className="truncate text-[11px] text-km-muted">{ct.fonction}</span>}
                        </span>
                        {resp && (
                          <span className={cn('shrink-0 rounded-full px-[9px] text-[10.5px] font-bold leading-[22px]', actif ? 'bg-km-green text-white' : 'bg-km-green-soft text-km-green')}>
                            {resp.length === choisis.length && choisis.length > 1
                              ? `Responsable des ${resp.length} compteurs`
                              : resp.length > 1 ? `Responsable de ${resp.length} compteurs` : `Responsable de ${resp[0].utilisation || resp[0].site_nom || resp[0].numero_pdl}`}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
              {/* UN CONTACT HORS DU COMPTE, OU À CRÉER : le sélecteur complet, à la demande. */}
              {autreContact || contactsTries.length === 0 ? (
                <div className="mb-2">
                  <ContactPicker
                    value={contactRetenu && !contactsDuCompte.some((c) => c.id === contactRetenu.id) ? contactRetenu.id : ''}
                    onChange={(id) => { setContactChoisi(id); setEntame(true) }}
                    accountContacts={contactsDuCompte}
                    allContacts={contacts ?? []}
                    accountId={compteId}
                    accountNom={compteCible?.nom}
                  />
                </div>
              ) : (
                <button type="button" onClick={() => setAutreContact(true)} className="mb-2 text-[12px] font-semibold text-km-green hover:underline">Un autre contact, ou un nouveau…</button>
              )}
              {aReattribuer.length > 0 && (
                <label className={cn('mb-2 flex cursor-pointer items-start gap-2.5 rounded-[11px] border px-3 py-2.5', majResponsables ? 'border-km-green-line bg-km-green-tint' : 'border-km-line bg-white')}>
                  <input type="checkbox" checked={majResponsables} onChange={(e) => setMajResponsables(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-km-green" />
                  <span className="flex flex-col gap-px">
                    <span className="text-[12.5px] font-semibold text-km-text">
                      Faire de {nomContact(contactId) ?? 'ce contact'} le responsable {aReattribuer.length === choisis.length && choisis.length > 1 ? `des ${choisis.length} compteurs` : aReattribuer.length > 1 ? `de ${aReattribuer.length} compteurs` : `de ${aReattribuer[0].utilisation || aReattribuer[0].site_nom || aReattribuer[0].numero_pdl}`}
                    </span>
                    <span className="text-[11px] text-km-muted">Aujourd’hui : {responsablesActuels}. Le contact de la recommandation et celui du compteur restent les mêmes.</span>
                  </span>
                </label>
              )}

              <div className="mt-4 grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-[18px]">
                <div className="flex flex-col gap-[9px]">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">Date de clôture <span className="text-km-muted">*</span></span>
                  <div className="grid grid-cols-2 gap-2">
                    {dateConseillee && (
                      <button
                        type="button"
                        aria-pressed={dateAutre == null}
                        onClick={() => setDateAutre(null)}
                        className={cn('flex flex-col gap-[3px] rounded-[12px] border px-[13px] py-[11px] text-left', dateAutre == null ? 'border-[1.5px] border-km-green bg-km-green-tint' : 'border-km-line bg-white hover:border-km-green')}
                      >
                        <span className="font-mono text-[15px] font-semibold text-km-text">{dateFr(dateConseillee)}</span>
                        <span className="text-[10.5px] font-semibold text-km-green">Conseillée</span>
                        <span className="text-[10.5px] leading-[1.35] text-km-muted">Échéance − préavis, au plus J+60, un jour ouvré</span>
                      </button>
                    )}
                    <label className={cn('flex flex-col gap-[5px] rounded-[12px] border px-[13px] py-[11px]', dateAutre != null || !dateConseillee ? 'border-[1.5px] border-km-green bg-km-green-tint' : 'border-km-line bg-white', !dateConseillee && 'col-span-2')}>
                      <span className="text-[13px] font-semibold text-km-text">{dateConseillee ? 'Autre date' : 'Date'}</span>
                      <input
                        type="date"
                        value={dateAutre ?? ''}
                        onChange={(e) => { setDateAutre(e.target.value || null); setEntame(true) }}
                        aria-label="Autre date de clôture"
                        className="w-full border-0 bg-transparent p-0 font-mono text-[12px] text-km-text outline-none"
                      />
                    </label>
                  </div>
                  {dateAutre && datePreavis && dateAutre > datePreavis && (
                    <span className="flex items-start gap-1.5 text-[11px] text-km-amber"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> Après le {dateFr(datePreavis)} : le préavis risque d’être dépassé.</span>
                  )}
                  {!dateConseillee && <span className="text-[10.5px] text-km-muted">Aucune échéance connue sur ces compteurs : la date se saisit.</span>}
                </div>
                <label className="flex flex-col gap-[9px]">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">Montant estimé de l’affaire <span className="text-km-muted">*</span></span>
                  <span className={cn('flex items-baseline gap-1.5 rounded-[12px] border-[1.5px] px-[14px] py-[10px] focus-within:shadow-[0_0_0_3px_rgba(13,122,95,.1)]', montant === 'invalide' ? 'border-km-red' : 'border-km-line focus-within:border-km-green')}>
                    <input
                      inputMode="decimal"
                      value={montantAffiche}
                      onChange={(e) => { setMontantTxt(e.target.value); setMontantTouche(true); setEntame(true) }}
                      placeholder="0"
                      className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[26px] font-semibold text-km-text outline-none"
                    />
                    <span className="text-[15px] font-semibold text-km-faint">€</span>
                  </span>
                  <span className={cn('text-[10.5px]', montant === 'invalide' ? 'font-semibold text-km-red' : 'text-km-muted')}>
                    {montant === 'invalide'
                      ? 'Un montant en euros, au centime près : 1234,56.'
                      : montantPropose != null
                        ? `Proposé : ${consoTotale.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh × 3 × ${facteur}${Object.values(actualisation).some((a) => a.etat === 'lecture') ? ', consommations en cours d’actualisation' : ''}. Modifiable.`
                        : 'Ce que l’affaire rapporte à KiWee. Il se corrige ensuite sur la fiche.'}
                  </span>
                  {montantTouche && montantPropose != null && montant !== montantPropose && (
                    <button type="button" onClick={() => setMontantTouche(false)} className="self-start text-[11px] font-semibold text-km-green hover:underline">
                      Reprendre le montant proposé : {montantPropose.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </button>
                  )}
                </label>
              </div>
              {choisis.length > 0 && !mandatRetenu && (
                <p className="mt-3 flex items-start gap-1.5 text-[11.5px] font-semibold text-km-red">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Aucun mandat actif ne couvre le premier compteur : la recommandation ne peut pas être rattachée.
                </p>
              )}
            </div>
            <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
              <Button variant="ghost" onClick={() => setEtape('perimetre')} disabled={createRecommandation.isPending}>Précédent</Button>
              {erreur && <span className="min-w-0 truncate text-[11.5px] font-semibold text-km-red" title={erreur}>Erreur : {erreur}</span>}
              <span className="flex-1" />
              <Button variant="ghost" onClick={sortie.demander}>Annuler</Button>
              <Button variant="primary" disabled={!decisionPrete || createRecommandation.isPending} onClick={() => void creer()}>
                {createRecommandation.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Création…</> : <>Créer la recommandation <Check className="h-3.5 w-3.5" /></>}
              </Button>
            </div>
          </>
        )}
      </PanneauParcours>
    </FenetreParcours>
  )
}

/** Le compte, quand on ne part pas d'une fiche : ceux qui portent au moins un mandat actif. */
function ChoixCompte({ recherche, onRecherche, onChoisir }: {
  recherche: string
  onRecherche: (v: string) => void
  onChoisir: (id: string) => void
}) {
  /* La liste légère des mandats (sans leurs compteurs), puis le nom, le SIREN et la ville des seuls
     comptes qui en portent un actif — on cherche sur les trois : deux syndics homonymes ne se
     distinguent que par là. */
  const { data: mandats, isLoading } = useMandatsListe()
  const idsComptes = useMemo(() => (mandats ? [...new Set(mandats.filter((m) => m.statut === 'ACTIF').map((m) => m.compte_id))] : undefined), [mandats])
  const { data: comptes } = useComptesLegers(idsComptes)
  const eligibles = useMemo(() => {
    const parId = new Map((comptes ?? []).map((c) => [c.id, c]))
    const parCompte = new Map<string, { id: string; nom: string; siren: string | null; ville: string; mandats: number }>()
    for (const m of mandats ?? []) {
      if (m.statut !== 'ACTIF') continue
      const deja = parCompte.get(m.compte_id)
      if (deja) { deja.mandats += 1; continue }
      const c = parId.get(m.compte_id)
      parCompte.set(m.compte_id, { id: m.compte_id, nom: c?.nom || m.compte_nom || 'Compte', siren: c?.siren ?? null, ville: c?.ville || '', mandats: 1 })
    }
    return [...parCompte.values()].sort((a, b) => a.nom.localeCompare(b.nom))
  }, [mandats, comptes])
  const q = recherche.trim().toLowerCase()
  const affiches = q ? eligibles.filter((c) => [c.nom, c.siren, c.ville].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))) : eligibles
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <label className="flex h-10 items-center gap-2 rounded-[10px] border border-km-line px-3 text-km-faint focus-within:border-km-green">
        <Search className="h-4 w-4 shrink-0" />
        <input autoFocus value={recherche} onChange={(e) => onRecherche(e.target.value)} placeholder="Nom, SIREN, ville…" aria-label="Rechercher un compte" className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-km-text outline-none" />
        <span className="shrink-0 text-[11px]">{affiches.length} compte{affiches.length > 1 ? 's' : ''} sous mandat actif</span>
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[12px] border border-km-line">
        {isLoading ? (
          <p className="flex items-center justify-center gap-2 px-4 py-10 text-[12.5px] text-km-faint"><Loader2 className="h-4 w-4 animate-spin text-km-green" /> Chargement des comptes…</p>
        ) : affiches.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-km-faint">Aucun compte ne correspond. Un compte sans mandat actif n’apparaît pas ici.</p>
        ) : affiches.slice(0, 200).map((c, i) => (
          <button key={c.id} type="button" onClick={() => onChoisir(c.id)} className={cn('flex h-[46px] w-full items-center gap-3 px-[14px] text-left hover:bg-km-bg', i > 0 && 'border-t border-km-line-soft')}>
            <Briefcase className="h-4 w-4 shrink-0 text-km-faint" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-km-text">{c.nom}</span>
            <span className="shrink-0 truncate text-[11px] text-km-faint">{[c.ville, c.siren ? `SIREN ${c.siren}` : null].filter(Boolean).join(' · ')}</span>
            <span className="shrink-0 rounded-full bg-km-soft px-2 text-[10.5px] font-semibold leading-[18px] text-km-muted">{c.mandats} mandat{c.mandats > 1 ? 's' : ''}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Le tableau des compteurs de l'étape 1 — direction A : une ligne par compteur, à cocher. */
function TableCompteurs({ affiches, ecartes, choisis, toutChoisi, onBasculer, onBasculerTout, estClient, echeance, vide, chargement }: {
  chargement?: boolean
  affiches: Compteur[]
  ecartes: { compteur: Compteur; reco: { id: string; nom: string } }[]
  choisis: string[]
  toutChoisi: boolean
  onBasculer: (id: string) => void
  onBasculerTout: () => void
  estClient: (c: Compteur) => boolean
  echeance: (c: Compteur) => string
  vide: string
}) {
  const grille = 'grid grid-cols-[22px_minmax(0,1fr)_34px_92px_80px_62px] items-center gap-[10px] px-[14px] whitespace-nowrap'
  const coche = (on: boolean) => (
    <span className={cn('flex h-4 w-4 items-center justify-center rounded-[5px] border-[1.5px]', on ? 'border-km-green bg-km-green' : 'border-[#C3CBC5] bg-white')}>
      {on && <Check className="h-2.5 w-2.5 stroke-[3.6] text-white" />}
    </span>
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-km-line">
      <div className={cn(grille, 'h-[34px] shrink-0 bg-km-soft text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint')}>
        <button type="button" onClick={onBasculerTout} aria-label={toutChoisi ? 'Tout décocher' : 'Tout cocher'} disabled={affiches.length === 0}>{coche(toutChoisi)}</button>
        <span>Site · {affiches[0]?.type_energie === 'gaz' ? 'PCE' : 'PDL'}</span><span>Seg.</span><span className="text-right">Conso</span><span>Échéance</span><span>Statut</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {chargement
          ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-[12.5px] text-km-faint"><Loader2 className="h-4 w-4 animate-spin text-km-green" /> Chargement des compteurs…</p>
          : affiches.length === 0 && <p className="px-4 py-10 text-center text-[12.5px] text-km-faint">{vide}</p>}
        {affiches.map((c) => {
          const on = choisis.includes(c.id)
          const client = estClient(c)
          return (
            <button key={c.id} type="button" onClick={() => onBasculer(c.id)} aria-pressed={on} className={cn(grille, 'h-[50px] w-full border-t border-km-line-soft text-left text-[12.5px] first:border-t-0', on ? 'bg-km-green-tint' : 'hover:bg-km-bg')}>
              {coche(on)}
              {/* LE SITE ET SON NUMÉRO SUR DEUX LIGNES : les noms de syndic sont longs (06/10/2026). */}
              <span className="flex min-w-0 flex-col gap-px">
                <span className="truncate font-semibold text-km-text" title={c.utilisation || c.site_nom || undefined}>{c.utilisation || c.site_nom || '—'}</span>
                <span className="truncate font-mono text-[11px] text-km-muted">{c.numero_pdl}</span>
              </span>
              <span className="text-km-text">{c.segment ?? c.tarif_distribution ?? '—'}</span>
              <span className="text-right font-mono text-km-text">{c.consommation_annuelle_mwh != null ? `${c.consommation_annuelle_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh` : '—'}</span>
              <span className="font-mono text-km-text">{echeance(c) || '—'}</span>
              <span><span className={cn('inline-flex h-5 items-center rounded-full px-2 text-[10.5px] font-bold', client ? 'bg-km-green-soft text-km-green' : 'bg-km-soft text-km-muted')}>{client ? 'Client' : 'Prospect'}</span></span>
            </button>
          )
        })}
        {/* LES ÉCARTÉS SE MONTRENT, AVEC LA RECOMMANDATION QUI LES RETIENT (09/09/2026) — ouverte
            dans un onglet, pour ne pas perdre la saisie. */}
        {ecartes.map(({ compteur: c, reco }) => (
          <div key={c.id} className={cn(grille, 'h-[50px] border-t border-km-line-soft bg-km-bg text-[12.5px] text-km-faint')}>
            <Lock className="h-3.5 w-3.5" />
            <span className="flex min-w-0 flex-col gap-px">
              <span className="truncate">{c.utilisation || c.site_nom || '—'}</span>
              <span className="truncate font-mono text-[11px]">{c.numero_pdl}</span>
            </span>
            <span>{c.segment ?? c.tarif_distribution ?? '—'}</span>
            <span className="text-right font-mono">{c.consommation_annuelle_mwh != null ? `${c.consommation_annuelle_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh` : '—'}</span>
            <span className="col-span-2 truncate text-[11px]">Déjà dans <Link to={`/recommandations/${reco.id}`} target="_blank" rel="noreferrer" className="text-km-green hover:underline" title={`Ouvrir « ${reco.nom} » dans un nouvel onglet`}>{reco.nom}</Link></span>
          </div>
        ))}
      </div>
    </div>
  )
}
