import { createContext, useCallback, useContext, useMemo, useState } from 'react'

/**
 * ══ LE VOLET D'ÉCRITURE DE MAIL, ET SON BROUILLON QUI SURVIT ══
 *
 * Naoëlle, 07/09/2026 : « quand on clique sur un mail dans Kimatch, ça ouvre un volet pour écrire le
 * mail dans Kimatch comme dans Cockpit, connecté au Gmail. […] Il faut que le volet soit rétractable
 * au cas où on a besoin de chercher une info, mais sans perdre le mail déjà écrit. »
 *
 * ══ POURQUOI UN CONTEXTE ET NON UN ÉTAT LOCAL ══
 *
 * Le brouillon doit survivre à la NAVIGATION : on écrit un mail depuis la fiche d'un contact, on
 * réduit le volet, on va lire un contrat sur un autre écran, on revient. Un état posé dans la fiche
 * disparaîtrait à la première route changée — c'est-à-dire exactement au moment où on en a besoin.
 *
 * Cockpit fait la même chose avec un magasin zustand. Kimatch n'a pas cette dépendance et un
 * contexte React suffit : un seul brouillon à la fois, quelques champs, aucune lecture concurrente.
 * Ajouter une bibliothèque pour ça coûterait plus que ça ne rapporte.
 *
 * ══ UN SEUL BROUILLON À LA FOIS, ET C'EST VOULU ══
 *
 * Deux mails en cours d'écriture demanderaient une gestion d'onglets, et l'expérience montre qu'on
 * n'écrit pas deux mails en parallèle — on en écrit un, on va chercher une information, on revient.
 * Ouvrir un second mail alors qu'un brouillon existe demande donc confirmation, plutôt que d'écraser
 * silencieusement ce qui était écrit.
 */

/** Ce que le volet garde quand on le réduit. */
export interface BrouillonEmail {
  a: string
  copie: string
  copieCachee: string
  afficherCopie: boolean
  afficherCopieCachee: boolean
  objet: string
  corpsHtml: string
  avecSignature: boolean
}

/**
 * Ce que l'écran appelant sait du destinataire et du dossier.
 *
 * Tout est optionnel sauf l'adresse : `EmailLink` est posé à des dizaines d'endroits qui ne
 * connaissent que le mail. Quand le contexte est connu — on écrit depuis la fiche d'un contrat — il
 * est transmis pour que l'interaction consignée se rattache au bon objet plutôt qu'au seul contact.
 */
export interface ContexteEmail {
  a: string
  /** Le nom affiché dans la pastille du brouillon réduit. */
  nom?: string | null
  objet?: string
  contactId?: string
  compteId?: string
  siteId?: string
  recommandationId?: string
  mandatId?: string
  contratId?: string
  /** Le fil Gmail, quand on répond à une conversation existante. */
  threadId?: string
}

interface EtatVolet {
  contexte: ContexteEmail
  brouillon: BrouillonEmail
  /** Réduit : la pastille flotte en bas à droite, le volet est fermé mais rien n'est perdu. */
  reduit: boolean
}

interface ApiVolet {
  etat: EtatVolet | null
  /** Ouvre le volet. Rend `false` si un brouillon différent est en cours — à l'appelant de demander. */
  ouvrir: (contexte: ContexteEmail) => boolean
  /** Ouvre en écrasant le brouillon en cours. À n'appeler qu'après confirmation. */
  ouvrirEnRemplacant: (contexte: ContexteEmail) => void
  majBrouillon: (brouillon: BrouillonEmail) => void
  reduire: () => void
  restaurer: () => void
  fermer: () => void
  /** Vrai s'il y a un brouillon avec du contenu — ce qu'on perdrait en fermant. */
  aDuContenu: boolean
}

const BROUILLON_VIDE: BrouillonEmail = {
  a: '',
  copie: '',
  copieCachee: '',
  afficherCopie: false,
  afficherCopieCachee: false,
  objet: '',
  corpsHtml: '',
  avecSignature: true,
}

const Contexte = createContext<ApiVolet | null>(null)

export function VoletEmailProvider({ children }: { children: React.ReactNode }) {
  const [etat, setEtat] = useState<EtatVolet | null>(null)

  /** Un brouillon « vide » ne mérite pas de confirmation : seul le contenu écrit compte. */
  const aDuContenu = useMemo(() => {
    if (!etat) return false
    const b = etat.brouillon
    return Boolean(b.corpsHtml.replace(/<[^>]*>/g, '').trim() || b.objet.trim())
  }, [etat])

  const ouvrirEnRemplacant = useCallback((contexte: ContexteEmail) => {
    setEtat({
      contexte,
      brouillon: { ...BROUILLON_VIDE, a: contexte.a, objet: contexte.objet ?? '' },
      reduit: false,
    })
  }, [])

  const ouvrir = useCallback((contexte: ContexteEmail): boolean => {
    let remplace = true
    setEtat((precedent) => {
      // Rien en cours, ou le même destinataire : on ouvre (ou on restaure) sans rien demander.
      const memeDestinataire = precedent?.contexte.a === contexte.a
      const contenu = precedent
        ? Boolean(precedent.brouillon.corpsHtml.replace(/<[^>]*>/g, '').trim()
          || precedent.brouillon.objet.trim())
        : false

      if (precedent && contenu && !memeDestinataire) {
        // UN BROUILLON ÉCRIT NE S'ÉCRASE PAS EN SILENCE : on le laisse en place et on rend `false`,
        // l'appelant demande. C'est la moitié de la demande « sans perdre le mail déjà écrit ».
        remplace = false
        return precedent
      }
      if (precedent && memeDestinataire) return { ...precedent, reduit: false }
      return {
        contexte,
        brouillon: { ...BROUILLON_VIDE, a: contexte.a, objet: contexte.objet ?? '' },
        reduit: false,
      }
    })
    return remplace
  }, [])

  const majBrouillon = useCallback((brouillon: BrouillonEmail) => {
    setEtat((p) => (p ? { ...p, brouillon } : p))
  }, [])

  const reduire = useCallback(() => setEtat((p) => (p ? { ...p, reduit: true } : p)), [])
  const restaurer = useCallback(() => setEtat((p) => (p ? { ...p, reduit: false } : p)), [])
  const fermer = useCallback(() => setEtat(null), [])

  const api = useMemo<ApiVolet>(
    () => ({ etat, ouvrir, ouvrirEnRemplacant, majBrouillon, reduire, restaurer, fermer, aDuContenu }),
    [etat, ouvrir, ouvrirEnRemplacant, majBrouillon, reduire, restaurer, fermer, aDuContenu],
  )

  return <Contexte.Provider value={api}>{children}</Contexte.Provider>
}

/**
 * L'accès au volet depuis n'importe quel écran.
 *
 * Rend `null` hors du fournisseur, au lieu de lever : `EmailLink` est utilisé dans des écrans rendus
 * en isolation (le document comparatif imprimé, par exemple), et une exception y casserait la page
 * pour une fonction qui n'y sert pas. Sans fournisseur, le lien retombe sur `mailto:`.
 */
export function useVoletEmail(): ApiVolet | null {
  return useContext(Contexte)
}
