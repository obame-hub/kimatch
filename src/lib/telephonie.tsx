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
 * ══ CORRECTION DU 07/09/2026 : ON PEUT FAIRE MIEUX QUE COPIER ══
 *
 * La conclusion ci-dessus tenait sur une phrase de Lovable : « son API REST ne sait qu'ajouter un
 * numéro à la file du Power Dialer, pas lancer un appel ». La première moitié est vraie — vérifié
 * dans la documentation, Allo n'expose AUCUN endpoint de composition. La seconde passait à côté de
 * l'essentiel : la file du Power Dialer est précisément l'outil avec lequel un commercial passe ses
 * appels. Y déposer le numéro depuis la fiche, c'est lui éviter de le recopier.
 *
 * Le bouton pousse donc le numéro dans la file d'appel DE LA PERSONNE CONNECTÉE — `append-numbers`
 * accepte un `email` pour viser la file d'un coéquipier — avec le nom et la société du
 * correspondant. Il ne reste plus qu'à cliquer « appeler » dans Allo, où la fiche est déjà remplie.
 *
 * IL RETOMBE SUR LA COPIE quand la file refuse : clé sans la portée `DIALING_QUEUE_READ_WRITE`,
 * réseau coupé, Allo indisponible. Un bouton qui ne fait rien serait pire que l'ancien.
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

/**
 * LE NUMÉRO TEL QU'ON LE LIT — international, groupé par deux.
 *
 * `+33 6 12 34 56 78` plutôt que `0766933888`. Recommandé par Lovable après audit de Tools, et c'est
 * la bonne recommandation, mais PAS pour la raison qu'on pourrait croire : l'extension Allo a décoré
 * `+33766933888` sans le moindre espace dans notre bandeau de confirmation, et la documentation d'Allo
 * dit elle-même reconnaître les numéros non formatés. Les espaces ne servent donc pas la détection.
 *
 * ILS SERVENT LA LECTURE, et c'est déjà une bonne raison : un commercial qui dicte un numéro au
 * téléphone, ou qui le compare à celui d'une facture, lit des paires de chiffres. `0766933888` se
 * relit trois fois.
 *
 * ET ILS SERVENT L'UNIFORMITÉ : nos numéros viennent de la reprise Salesforce tels quels — `06 12 34
 * 56 78`, `0612345678`, `+33612345678` cohabitent dans la même liste. Les afficher tous de la même
 * façon est le minimum, d'autant que le préfixe international dit quelque chose d'utile : que le
 * numéro est composable de n'importe où.
 *
 * NON NORMALISABLE, ON MONTRE LE BRUT. Un numéro incomplet reste un numéro qu'un humain reconnaîtra
 * peut-être ; le remplacer par un tiret perdrait la seule trace qu'on ait.
 */
export function numeroLisible(brut: string | null | undefined): string {
  const e164 = numeroInternational(brut)
  if (!e164) return brut ?? ''

  // La France, seul cas qui vaille un groupement dédié : indicatif, puis paires.
  if (e164.startsWith('+33') && e164.length === 12) {
    const n = e164.slice(3)
    return '+33 ' + n.slice(0, 1) + ' ' + (n.slice(1).match(/.{1,2}/g) ?? []).join(' ')
  }

  // Ailleurs, on ne connaît pas les usages de groupement : on sépare l'indicatif et on s'arrête là,
  // plutôt que d'inventer un découpage qui trahirait le pays.
  const m = e164.match(/^(\+\d{1,3})(\d+)$/)
  return m ? m[1] + ' ' + (m[2].match(/.{1,2}/g) ?? []).join(' ') : e164
}

/**
 * Qui l'on appelle, quand l'écran le sait.
 *
 * Facultatif : les boutons d'appel sont posés à des dizaines d'endroits qui ne connaissent que le
 * numéro. Transmis, il arrive dans Allo avant le décrochage — et l'IA d'Allo, qui extrait déjà la
 * fiche du correspondant depuis la conversation, part avec la bonne identité plutôt que de la
 * déduire.
 */
export interface Correspondant {
  prenom?: string | null
  nom?: string | null
  societe?: string | null
  fonction?: string | null
}

interface Telephonie {
  /** Prépare l'appel. Rend le message affiché — il y a toujours quelque chose à dire. */
  appeler: (numero: string | null | undefined, qui?: Correspondant) => Promise<string>
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
let appelerCourant:
  | ((numero: string | null | undefined, qui?: Correspondant) => Promise<string>)
  | null = null

export function appelerNumero(
  numero: string | null | undefined,
  qui?: Correspondant,
): Promise<string> {
  if (!appelerCourant) return Promise.resolve('Le téléphone n’est pas prêt : rechargez la page.')
  return appelerCourant(numero, qui)
}

export function TelephonieProvider({ children }: { children: ReactNode }) {
  // Le seul message possible : un numéro inexploitable. Le reste est un geste immédiat, il n'a rien
  // à annoncer — un bandeau « appel lancé » serait du bruit.
  const [message, setMessage] = useState<string | null>(null)

  const appeler = useCallback(async (
    numero: string | null | undefined,
    qui?: Correspondant,
  ): Promise<string> => {
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

    /* ── LA FILE D'APPEL ALLO, D'ABORD ──
       Le numéro part dans la file du Power Dialer de la personne connectée, avec le nom et la
       société. Il n'y a plus qu'à cliquer « appeler » dans Allo. */
    const file = await poserDansLaFileAllo(e164, qui)
    if (file.ok) {
      const m = file.position != null
        ? `${numeroLisible(e164)} ajouté à ta file d’appel Allo, en position ${file.position}.`
        : `${numeroLisible(e164)} ajouté à ta file d’appel Allo.`
      setMessage(m)
      return m
    }
    if (file.dejaDansLaFile) {
      const m = `${numeroLisible(e164)} est déjà dans ta file d’appel Allo.`
      setMessage(m)
      return m
    }

    /* ── LE REPLI : la copie, comme avant ──
       Clé sans la portée `DIALING_QUEUE_READ_WRITE`, réseau coupé, Allo indisponible : on ne laisse
       pas le commercial devant un bouton muet. Le message dit ce qui bloque, une fois. */
    let copie = false
    try {
      await navigator.clipboard?.writeText(e164)
      copie = true
    } catch {
      copie = false
    }

    const raison = file.erreur ? ` (${file.erreur})` : ''
    const m = copie
      ? `${e164} copié — pour appeler, cliquez l’icône Allo à côté du numéro.${raison}`
      : `Pour appeler ${e164}, cliquez l’icône Allo à côté du numéro.${raison}`
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
        <div className="fixed bottom-[70px] left-1/2 z-[60] -translate-x-1/2 rounded-km border border-km-line bg-white px-4 py-2.5 text-km-xs font-semibold text-km-text shadow-km-pop md:bottom-6">
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


/**
 * ══ POSER LE NUMÉRO DANS LA FILE D'APPEL ALLO ══
 *
 * Passe par `/api/allo/appeler` et jamais directement par Allo : la clé API donne accès à tout le
 * compte — lecture des appels, des enregistrements, des transcriptions — elle n'a rien à faire dans
 * un navigateur, et le dépôt de Kimatch est public.
 *
 * NE LÈVE JAMAIS. L'appelant décide quoi afficher, et il a un repli. Une exception ici ferait perdre
 * la copie du numéro, c'est-à-dire le seul comportement dont on est sûr.
 */
async function poserDansLaFileAllo(
  e164: string,
  qui?: Correspondant,
): Promise<{ ok: boolean; position?: number | null; dejaDansLaFile?: boolean; erreur?: string }> {
  try {
    const { supabase } = await import('@/lib/supabase')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return { ok: false, erreur: 'session expirée' }

    const res = await fetch('/api/allo/appeler', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero: e164, ...qui }),
    })
    const corps = (await res.json()) as {
      ok?: boolean
      position?: number | null
      ignore?: string | null
      error?: string
      code?: string
    }

    if (!res.ok) {
      // La portée manquante se dit en clair : sinon on cherche un bug alors qu'il suffit de cocher
      // une case dans les réglages d'Allo.
      return {
        ok: false,
        erreur: corps.code === 'portee_manquante'
          ? 'Allo : droit d’écriture manquant sur la file d’appel'
          : corps.error,
      }
    }
    if (corps.ok) return { ok: true, position: corps.position ?? null }
    // Allo écarte un numéro déjà en attente : ce n'est pas un échec, c'est une information.
    if (corps.ignore && /duplicate|already|exist/i.test(corps.ignore)) {
      return { ok: false, dejaDansLaFile: true }
    }
    return { ok: false, erreur: corps.ignore ?? undefined }
  } catch {
    return { ok: false, erreur: 'Allo injoignable' }
  }
}
