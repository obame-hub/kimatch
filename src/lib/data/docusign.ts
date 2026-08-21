import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Configuration de l'APPLICATION DocuSign côté serveur (Integration Key + clé secrète). Distincte
 *  de la connexion personnelle : sans l'application, personne ne peut se connecter ; avec elle,
 *  chacun doit encore autoriser son propre compte. */
export function useDocusignStatus() {
  return useQuery({
    queryKey: ['docusign-status'],
    queryFn: async (): Promise<{
      configured: boolean
      manquants: string[]
      /** Variables présentes mais inexploitables — un identifiant tronqué, par exemple. */
      invalides?: { variable: string; raison: string }[]
      /** « demonstration » ou « production » : une signature partie de la démonstration n'a aucune
       *  valeur juridique et le client reçoit un e-mail marqué DEMO. */
      environnement?: 'demonstration' | 'production'
    }> => {
      const res = await fetch('/api/docusign/status')
      if (!res.ok) return { configured: false, manquants: [] }
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}

export interface DocusignConnexion {
  docusign_email: string | null
  docusign_nom: string | null
  account_nom: string | null
  expire_le: string
  date_creation: string
  date_modification: string
  /** Fin de validité du refresh token : c'est LUI qui détermine la survie de la session. */
  refresh_expire_le: string
  /** La session est morte : il faut réautoriser DocuSign. */
  expiree: boolean
  /** Moins de sept jours avant la coupure — on prévient sans attendre la panne. */
  bientot_expiree: boolean
}

/** Connexion DocuSign de l'utilisateur courant. Lue dans la vue docusign_connexions, qui n'expose
 *  pas les jetons : la table docusign_sessions n'a aucune politique de lecture, même pour son
 *  propriétaire. */
async function fetchDocusignConnexion(): Promise<DocusignConnexion | null> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null
  const { data, error } = await supabase
    .from('docusign_connexions')
    .select(
      'docusign_email, docusign_nom, account_nom, expire_le, date_creation, date_modification, refresh_expire_le, expiree, bientot_expiree',
    )
    .maybeSingle()
  if (error) return null
  return data as DocusignConnexion | null
}

export function useDocusignConnexion() {
  return useQuery({ queryKey: ['docusign-connexion'], queryFn: fetchDocusignConnexion })
}

export type SanteDocusign = 'chargement' | 'inutile' | 'ok' | 'bientot' | 'absente' | 'expiree'

/**
 * La personne connectée a-t-elle déjà créé un mandat DANS Kimatch ?
 *
 * Sert à ne pas réclamer une connexion DocuSign à qui n'en a pas l'usage. Une seule ligne suffit :
 * `head` + `count` ne rapatrie aucune donnée, juste le total dans l'en-tête.
 *
 * Portée réelle, à ne pas surestimer : la migration Salesforce n'a rempli `proprietaire_id` sur
 * aucun mandat (1429 sur 1429, voir `useCanManageEnregistrement`), et les mandats importés n'ont pas
 * davantage de créateur. Ce test ne lit donc PAS l'historique Salesforce — il répond « cette
 * personne a-t-elle déjà lancé un mandat depuis Kimatch ». C'est volontaire : c'est le moment où
 * quelqu'un devient concerné par la signature électronique, et à partir de là le bandeau s'applique
 * à lui. Avant, c'est l'écran « Connexion requise » du wizard qui l'arrête, au moment utile.
 */
export function useEnvoyeurDeMandats() {
  return useQuery({
    queryKey: ['docusign-envoyeur-de-mandats'],
    queryFn: async (): Promise<boolean> => {
      const { data: auth } = await supabase.auth.getUser()
      const profilId = auth.user?.id
      if (!profilId) return false
      const { count } = await supabase
        .from('mandats')
        .select('id', { count: 'exact', head: true })
        .or(`cree_par_id.eq.${profilId},proprietaire_id.eq.${profilId}`)
      return (count ?? 0) > 0
    },
    staleTime: 30 * 60 * 1000,
  })
}

/**
 * État de la signature électronique pour la personne connectée, en une seule valeur.
 *
 * Sépare volontairement « absente » (jamais autorisée) de « expiree » (autorisation tombée) : le
 * second cas est celui que William décrit sur Tools, où les commerciaux concluaient que « le process
 * ne marche pas » alors que l'intégration avait simplement sauté. Les deux méritent un message
 * différent.
 *
 * « inutile » couvre le cas où l'application DocuSign n'est pas configurée côté serveur : rien à
 * connecter, donc rien à signaler à l'utilisateur.
 */
export function useSanteDocusign(): { etat: SanteDocusign; connexion: DocusignConnexion | null } {
  const statut = useDocusignStatus()
  const connexion = useDocusignConnexion()
  const envoyeur = useEnvoyeurDeMandats()

  if (statut.isLoading || connexion.isLoading || envoyeur.isLoading) return { etat: 'chargement', connexion: null }
  if (!statut.data?.configured) return { etat: 'inutile', connexion: null }
  // Jamais connecté ET n'a jamais envoyé de mandat : cette personne n'a rien à réparer. Le 15/08/2026
  // Naoëlle a rappelé qu'Agathe et Erwan restent dans l'équipe mais n'envoient pas de mandats ; sans
  // ce filtre, ils recevaient un bandeau rouge permanent, sans bouton de fermeture, sur une
  // intégration qui ne les concerne pas. Un bandeau que la moitié des gens apprend à ignorer ne
  // remplit plus le rôle que William lui demande.
  //
  // Une autorisation TOMBÉE reste signalée à tout le monde : elle prouve un usage passé, et c'est
  // exactement le cas que William décrit. Et le premier envoi d'une nouvelle recrue reste couvert
  // par l'écran « Connexion requise » du wizard, au moment où il sert.
  if (!connexion.data && !envoyeur.data) return { etat: 'inutile', connexion: null }
  if (!connexion.data) return { etat: 'absente', connexion: null }
  if (connexion.data.expiree) return { etat: 'expiree', connexion: connexion.data }
  if (connexion.data.bientot_expiree) return { etat: 'bientot', connexion: connexion.data }
  return { etat: 'ok', connexion: connexion.data }
}

/** Envoie le navigateur sur l'écran d'autorisation DocuSign. Le jeton Supabase part dans l'en-tête
 *  et non dans l'URL : c'est l'endpoint qui scelle l'identifiant du profil dans le `state`.
 *
 *  La page courante voyage aussi dans le `state` : après l'autorisation, DocuSign renvoie la
 *  personne exactement là où elle était — sur la fiche du mandat qu'elle voulait envoyer, pas sur
 *  « Mon profil » avec tout à refaire. */
export async function connectDocusign(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Non authentifié — connecte-toi pour lier DocuSign.')

  const retour = encodeURIComponent(window.location.pathname)
  const res = await fetch(`/api/docusign/connect?retour=${retour}`, { headers: { Authorization: `Bearer ${token}` } })
  const result = (await res.json()) as { url?: string; error?: string }
  if (!res.ok || !result.url) throw new Error(result.error ?? 'Impossible de démarrer la connexion DocuSign')
  window.location.href = result.url
}

/**
 * Supprime la session locale, via une fonction SECURITY DEFINER.
 *
 * Un `delete` direct depuis le client ne fonctionnait pas : PostgreSQL exige une politique SELECT
 * pour évaluer le WHERE d'un DELETE, et docusign_sessions n'en accorde aucune — la table ne doit
 * jamais laisser lire un refresh token. Le delete renvoyait donc « succès » sans rien supprimer
 * (voir la migration 20260814110000).
 *
 * L'autorisation reste accordée côté DocuSign : se reconnecter ne redemandera pas l'écran de
 * consentement.
 */
export function useDisconnectDocusign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('docusign_deconnecter')
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['docusign-connexion'] }) },
  })
}

interface SendMandatInput {
  mandatId: string
  documents: { pdfBase64: string; fileName: string }[]
  signerEmail: string
  signerName: string
  emailSubject?: string
  emailMessage?: string
  draft?: boolean
  returnUrl?: string
}

interface SendMandatResult {
  envelopeId: string
  status: string
  senderViewUrl?: string
  /** Compte DocuSign d'où l'enveloppe est partie. */
  emetteur?: string | null
}

/** Marqueur renvoyé par l'API quand l'utilisateur n'a pas encore autorisé DocuSign. */
export const DOCUSIGN_NON_CONNECTE = 'DOCUSIGN_NON_CONNECTE'

export class DocusignNonConnecte extends Error {}

/**
 * L'adresse d'une enveloppe sur le site DocuSign.
 *
 * Naoëlle, 21/08/2026 : « ajouter un lien DocuSign vers l'enveloppe, comme ça si on a un doute on
 * clique dessus pour voir sur DocuSign si ça a été envoyé. » Le lien doit donc être là AVANT toute
 * vérification — c'est justement quand on doute qu'on le cherche.
 *
 * Il ne dépend que de la région du compte, pas de l'enveloppe : le compte Kiwee est en Europe
 * (`eu.docusign.net` côté API), ce qui correspond à `apps-eu.docusign.com` côté site. La correspondance
 * est ici plutôt qu'en dur dans un écran, pour qu'un déménagement de région se corrige à un endroit.
 */
export function lienEnveloppeDocusign(envelopeId: string): string {
  return `https://apps-eu.docusign.com/documents/details/${envelopeId}`
}

/** Ce que DocuSign répond sur l'état d'une enveloppe. */
export interface EtatEnveloppe {
  envoye: boolean
  statut: string | null
  statutDocusign: string | null
  envoyeLe: string | null
  signeLe: string | null
  signataire: { nom?: string; email?: string; statut?: string; recuLe?: string | null } | null
  lien: string
  /** Vrai quand DocuSign etait en avance sur nous et qu'on vient de rattraper le retard. */
  corrige: boolean
}

/**
 * Demande à DocuSign où en est vraiment l'enveloppe d'un contrat.
 *
 * Naoëlle, 21/08/2026 : « comment je suis sûre que ça a envoyé ? » Le statut affiché vient du
 * webhook, et un webhook peut ne pas arriver. Cet appel interroge DocuSign directement et remet la
 * base d'accord avec lui — c'est la seule réponse qui ne demande pas de faire confiance.
 */
export async function etatEnveloppeContrat(contratId: string): Promise<EtatEnveloppe> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Non authentifié.')
  const res = await fetch(`/api/docusign/etat-enveloppe?contratId=${encodeURIComponent(contratId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const resultat = (await res.json()) as EtatEnveloppe & { error?: string; code?: string }
  if (resultat.code === DOCUSIGN_NON_CONNECTE) throw new DocusignNonConnecte(resultat.error ?? 'Compte DocuSign non connecté')
  if (!res.ok || resultat.error) throw new Error(resultat.error ?? 'Erreur DocuSign inconnue')
  return resultat
}

/**
 * Envoyer un CONTRAT à la signature.
 *
 * URGENCE DU 21/08/2026 : Michel ne pouvait pas envoyer le contrat de SDC AMPLITUDE 2, faute de tout
 * chemin pour le faire — DocuSign n'était branché que sur les mandats.
 *
 * DEUX DIFFÉRENCES AVEC LE MANDAT, et elles comptent.
 *
 * Le document n'est pas fabriqué par nous : c'est le PDF du fournisseur, déjà déposé sur la fiche.
 * On l'envoie donc par son URL plutôt qu'en le générant.
 *
 * Et aucune ancre n'y est imprimée. Le mandat porte `\s1\`, `\d1\`, `\l1\` là où les champs doivent
 * tomber ; un contrat de fournisseur n'a rien de tel. C'est l'expéditeur qui place les champs, dans
 * DocuSign, avant d'envoyer — d'où le brouillon obligatoire ici, et non un choix.
 */
export async function sendContratForSignature(input: {
  contratId: string
  documentUrl: string
  documentName?: string
  signerEmail: string
  signerName: string
  emailSubject?: string
  returnUrl?: string
}): Promise<SendMandatResult> {
  return appelerEnvoi({ ...input, draft: true })
}

export async function sendMandatForSignature(input: SendMandatInput): Promise<SendMandatResult> {
  return appelerEnvoi(input)
}

/** Le corps commun des deux envois : même endpoint, même traitement des erreurs. */
async function appelerEnvoi(input: object): Promise<SendMandatResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Non authentifié — connecte-toi pour envoyer un document à la signature.')

  const res = await fetch('/api/docusign/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const result = (await res.json()) as SendMandatResult & { error?: string; code?: string }
  if (result.code === DOCUSIGN_NON_CONNECTE) {
    // Erreur distincte : l'appelant peut proposer le bouton de connexion au lieu d'afficher un
    // message d'échec, le mandat étant déjà enregistré.
    throw new DocusignNonConnecte(result.error ?? 'Compte DocuSign non connecté')
  }
  if (!res.ok || result.error) throw new Error(result.error ?? 'Erreur DocuSign inconnue')
  return result
}
