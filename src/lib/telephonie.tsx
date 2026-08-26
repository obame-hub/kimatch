import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * APPELER DEPUIS KIMATCH — un seul entonnoir, un numéro normalisé, et un numéro TOUJOURS VISIBLE.
 *
 * Michel, 26/08/2026 : « quand les commerciaux cliquent sur appeler ça leur ouvre l'app de leur ordi,
 * alors qu'il veut que ça ouvre l'application Allo directement sur Kimatch, comme dans Tools ».
 *
 * ══ COMMENT ALLO MARCHE VRAIMENT — réponse de Lovable, qui a construit Tools ══
 *
 * « Ce n'est ni un SDK ni une API appelée par Tools. C'est L'EXTENSION CHROME ALLO qui détecte les
 * numéros affichés sur la page, ajoute une icône Allo à côté et ouvre un popup. Cliquer sur Call lance
 * l'appel dans l'application Allo. » Allo n'expose aucune URL de composition ; son API REST ne sait
 * qu'ajouter un numéro à la file du Power Dialer, pas lancer un appel.
 *
 * DONC AUCUN CODE NE PEUT OUVRIR ALLO. Ce qui répond à la demande de Michel, c'est l'installation de
 * l'extension sur le Chrome de chaque commercial — une tâche de poste de travail, pas de dépôt. Le
 * dire est plus utile que de livrer un bouton qui ferait semblant.
 *
 * ══ CE QUE LE CODE PEUT FAIRE, ET QUI COMPTE VRAIMENT ══
 *
 * L'extension ne décore que ce qu'elle VOIT. Un bouton « Appeler » avec une icône de téléphone et le
 * numéro caché dans une infobulle ne lui donne rien à détecter — l'icône Allo n'apparaît jamais, et le
 * commercial conclut que ça ne marche pas. LA VRAIE CONDITION EST DONC D'AFFICHER LE NUMÉRO EN TEXTE,
 * à côté de chaque bouton d'appel. C'est le seul point que Lovable n'a pas mentionné, et c'est celui
 * qui décide si l'extension sert à quelque chose.
 *
 * `tel:` NE RESTE QUE SUR MOBILE, et c'est une correction constatée à l'écran. Lovable indiquait que
 * l'extension intercepte aussi les liens `tel:` ; sur le poste de Naoëlle, extension installée, elle ne
 * le fait pas — Chrome affiche « Ouvrir Sélectionner une application ? », exactement le symptôme que
 * Michel a signalé. Le lien `tel:` est donc réservé aux appareils tactiles, où il est le bon
 * comportement : le téléphone compose.
 *
 * SUR ORDINATEUR, LE BOUTON NE NAVIGUE PLUS. Il copie le numéro et dit quoi faire. L'appel se lance en
 * cliquant l'icône que l'extension Allo pose à côté du NUMÉRO AFFICHÉ — pas depuis un bouton de
 * Kimatch, puisque aucun code ne peut ouvrir Allo. Un bouton qui rouvrirait la boîte de dialogue du
 * système serait un bouton qui ment.
 *
 * CE QUE CET ENTONNOIR APPORTE MALGRÉ TOUT : le numéro part au format international. `tel:+33612345678`
 * est composable partout, `tel:06 12 34 56 78` ne l'est pas hors de France — et c'est une seule
 * fonction à changer si Allo publie un jour de quoi déclencher un appel.
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
  // Le seul message possible : un numéro inexploitable. Le reste est un geste immédiat, il n'a rien
  // à annoncer — un bandeau « appel lancé » serait du bruit.
  const [message, setMessage] = useState<string | null>(null)

  const appeler = useCallback(async (numero: string | null | undefined): Promise<string> => {
    const e164 = numeroInternational(numero)
    if (!e164) {
      const m = 'Ce numéro n’est pas exploitable : il manque l’indicatif ou des chiffres.'
      setMessage(m)
      return m
    }

    /**
     * SUR UN APPAREIL TACTILE, `tel:` est le bon geste : le téléphone compose, sans intermédiaire.
     *
     * Sur ordinateur, non — et c'est constaté, pas supposé : Chrome ouvre « Sélectionner une
     * application » et n'a jamais entendu parler d'Allo. On copie donc le numéro et on dit où
     * cliquer. Le test porte sur le POINTEUR et non sur la largeur de l'écran : un portable à écran
     * tactile de 15 pouces compose très bien, une fenêtre étroite sur un poste fixe non.
     */
    const tactile =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(hover: none) and (pointer: coarse)').matches === true

    if (tactile) {
      window.location.href = 'tel:' + e164
      return e164
    }

    let copie = false
    try {
      await navigator.clipboard?.writeText(e164)
      copie = true
    } catch {
      copie = false
    }

    const m = copie
      ? `${e164} copié — pour appeler, cliquez l’icône Allo à côté du numéro.`
      : `Pour appeler ${e164}, cliquez l’icône Allo à côté du numéro.`
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
