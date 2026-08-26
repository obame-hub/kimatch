import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * APPELER DEPUIS KIMATCH — et surtout, ne plus ouvrir l'application du poste.
 *
 * Michel, 26/08/2026, rapporté par Naoëlle : « quand les commerciaux cliquent sur appeler ça leur
 * ouvre l'app de leur ordi, alors qu'il veut que ça ouvre l'application Allo directement sur
 * Kimatch, comme dans Tools ».
 *
 * CE QUE FAISAIT KIMATCH : un lien `tel:`. Le système d'exploitation l'attrape et ouvre ce qu'il
 * veut — Skype, FaceTime, rien du tout. Le commercial recopie le numéro à la main, et l'appel n'est
 * journalisé nulle part. C'est le défaut à corriger, et il l'est : plus un seul `tel:` dans
 * l'application.
 *
 * ══ CE QUE J'AI CHERCHÉ, ET CE QUE J'AI TROUVÉ ══
 *
 * J'ai d'abord cru qu'il s'agissait d'Aircall : leur org Salesforce porte le paquet « Aircall CTI »
 * avec des utilisateurs assignés. Naoëlle a corrigé — ils ont MIGRÉ SUR ALLO en passant à Tools, et
 * le paquet Aircall est un reste.
 *
 * OR ALLO NE PUBLIE NI SDK NAVIGATEUR NI COMPOSANT À INTÉGRER. Son API REST documentée couvre les
 * appels (en lecture), les contacts, les SMS et les webhooks — AUCUN point d'entrée pour DÉCLENCHER un
 * appel, aucun schéma d'URL du type `allo://`. Ce qu'Allo fournit pour cliquer sur un numéro, c'est
 * une EXTENSION DE NAVIGATEUR qui détecte les numéros sur n'importe quelle page et les rend
 * appelables, plus un raccourci clavier pour ouvrir le composeur.
 *
 * ET LE CODE DE TOOLS QUE J'AI SOUS LA MAIN NE CONTIENT AUCUNE TRACE D'ALLO — ni dépendance, ni
 * fonction, ni lien : ses trente fonctions couvrent DocuSign, Ellisphere, Enedis, Gmail, Salesforce,
 * SEFE, et rien de téléphonique. Soit ma copie précède la migration, soit Tools n'a effectivement
 * aucun code pour ça et tout passe par l'extension.
 *
 * ══ D'OÙ CE COMPORTEMENT INTERMÉDIAIRE, ASSUMÉ ══
 *
 * Le bouton ne peut pas déclencher l'appel tant qu'on ne sait pas COMMENT Tools le fait. Il fait donc
 * la seule chose utile et honnête : il met le numéro au format international dans le presse-papiers et
 * le dit. Le commercial ouvre Allo — ou clique le numéro que l'extension a rendu appelable — et colle.
 * C'est un geste de plus qu'il n'en faudrait, mais c'est déjà mieux que Skype qui s'ouvre.
 *
 * DEUX CHOSES NE CHANGERONT PAS quand la réponse arrivera : les huit boutons de l'application passent
 * tous par `appelerNumero`, et la conversion au format international est faite ici. Brancher Allo pour
 * de bon se limitera à remplacer le corps d'UNE fonction.
 */

/**
 * Un numéro français au format international, le seul qu'un composeur accepte sans ambiguïté.
 *
 * Rend `null` quand la conversion n'est pas sûre : mieux vaut dire « ce numéro n'est pas exploitable »
 * que proposer un numéro inventé. Les cas traités sont ceux qu'on trouve réellement en base — espaces,
 * points, tirets, préfixe 0, 0033, +33.
 */
export function numeroInternational(brut: string | null | undefined): string | null {
  if (!brut) return null
  let n = brut.replace(/[\s.\-()/]/g, '')
  if (!n) return null

  if (n.startsWith('00')) n = '+' + n.slice(2)
  // Un numéro français à dix chiffres commençant par 0 : le 0 cède la place à l'indicatif.
  if (/^0[1-9]\d{8}$/.test(n)) n = '+33' + n.slice(1)
  // Neuf chiffres sans le 0 initial — saisie tronquée fréquente sur les mobiles.
  else if (/^[1-9]\d{8}$/.test(n)) n = '+33' + n

  if (!n.startsWith('+')) return null
  // Entre 8 et 15 chiffres après l'indicatif : la plage de la recommandation E.164.
  return /^\+\d{8,15}$/.test(n) ? n : null
}

interface Telephonie {
  /** Prépare l'appel. Rend le message affiché — il y a toujours quelque chose à dire. */
  appeler: (numero: string | null | undefined) => Promise<string>
}

const Contexte = createContext<Telephonie | null>(null)

/**
 * LA PORTE D'ENTRÉE GLOBALE, utilisable sans passer par le contexte.
 *
 * Les boutons « Appeler » vivent au fond de fonctions de rendu imbriquées — une ligne de contact dans
 * une liste, dans un panneau, dans une fiche — où un hook obligerait à remonter jusqu'au composant
 * porteur et à y ajouter un appel qui n'a rien à y faire. Le téléphone, lui, est unique dans
 * l'application : ce n'est pas un état qui varie d'un endroit à l'autre, c'est un périphérique.
 */
let appelerCourant: ((numero: string | null | undefined) => Promise<string>) | null = null

export function appelerNumero(numero: string | null | undefined): Promise<string> {
  if (!appelerCourant) return Promise.resolve('Le téléphone n’est pas prêt : rechargez la page.')
  return appelerCourant(numero)
}

export function TelephonieProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)

  const appeler = useCallback(async (numero: string | null | undefined): Promise<string> => {
    const e164 = numeroInternational(numero)
    if (!e164) {
      const m = 'Ce numéro n’est pas exploitable : il manque l’indicatif ou des chiffres.'
      setMessage(m)
      return m
    }

    // Le presse-papiers peut être refusé — permission bloquée, navigateur ancien. On le dit plutôt
    // que d'annoncer une copie qui n'a pas eu lieu : le commercial resterait à attendre.
    let copie = false
    try {
      await navigator.clipboard?.writeText(e164)
      copie = true
    } catch {
      copie = false
    }

    const m = copie ? `${e164} copié — ouvrez Allo pour appeler.` : `Numéro à appeler dans Allo : ${e164}`
    setMessage(m)
    return m
  }, [])

  useEffect(() => {
    appelerCourant = appeler
    return () => {
      appelerCourant = null
    }
  }, [appeler])

  // Le message s'effface seul : c'est une confirmation, pas une alerte à acquitter.
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 6000)
    return () => clearTimeout(t)
  }, [message])

  return (
    <Contexte.Provider value={{ appeler }}>
      {children}
      {message && (
        <div className="fixed bottom-[70px] left-1/2 z-[60] -translate-x-1/2 rounded-kw-lg border border-kw-border bg-white px-4 py-2.5 text-kw-sm font-semibold text-kw-ink shadow-kw-panel md:bottom-6">
          {message}
        </div>
      )}
    </Contexte.Provider>
  )
}

export function useTelephonie(): Telephonie {
  const c = useContext(Contexte)
  if (!c) throw new Error('useTelephonie hors de TelephonieProvider')
  return c
}
