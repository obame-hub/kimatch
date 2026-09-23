import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { lancerAppelBureau } from '@/lib/alloBureau'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * APPELER DEPUIS KIMATCH — UN CLIC, ÇA SONNE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Michel, 26/08/2026, puis Naoëlle pendant tout le mois : « je veux que quand je clique sur le
 * téléphone, ça appelle direct ». Depuis le 22/09/2026, c'est le cas.
 *
 * ══ CE QUE FAIT UN CLIC, DANS L'ORDRE ══
 *
 *   · sur un appareil TACTILE : `tel:`, et le téléphone compose. C'est le bon geste là-bas.
 *   · sur ORDINATEUR : `kimatch://appeler?numero=…`, notre protocole.
 *
 * Voir `lib/alloBureau.ts` pour le détail, et `scripts/appeler-depuis-kimatch.ps1` pour ce qu'il
 * déclenche : Kimatch demande au poste d'écrire le numéro dans le champ d'Allo, de RELIRE pour
 * vérifier, puis d'actionner leur bouton « Appeler ».
 *
 * ══ UN SEUL PROTOCOLE, ET C'EST UNE CORRECTION DU 22/09/2026 ══
 *
 * On lançait AUSSI `allo://call?number=…`, leur chemin officiel, « au cas où ils le réparent ».
 * C'était une erreur, et elle a cassé les appels pendant une heure : `allo://` OUVRE
 * L'APPLICATION ET LUI DONNE LE FOCUS. Notre script arrivait une fraction de seconde plus tard,
 * pendant qu'Allo se réveillait, et son écriture tombait à côté du champ.
 *
 * Les essais isolés réussissaient donc tous, et seul le clic depuis Kimatch échouait — c'était le
 * seul cas où les deux partaient ensemble. `lancerAlloBureau` reste exporté pour le jour où Allo
 * corrigera, mais plus personne ne l'appelle.
 *
 * ══ CE QUI A ÉTÉ RETIRÉ LE 22/09/2026, ET POURQUOI ══
 *
 * Naoëlle : « est-ce que tu peux enlever le Power Dialer et le petit bloc qui ne servent plus à
 * rien ». Deux choses sont parties avec cette phrase :
 *
 *   ① LA FILE DU POWER DIALER. On y déposait le numéro faute de mieux, en disant « il n'y a plus
 *      qu'à cliquer Appeler dans Allo ». C'était faux : mesuré contre leur API, un numéro y est
 *      resté TREIZE JOURS, position 0, `NOT_SYNCED`, sans qu'un seul appel parte. La file alimente
 *      un composeur qui ne démarre que depuis leur interface — un cul-de-sac, pas un raccourci.
 *
 *   ② LA FENÊTRE « APPELER CE NUMÉRO ». Elle expliquait quoi faire à la main — coller le numéro,
 *      appuyer sur le bouton vert — parce que rien ne composait. Depuis que le clic compose, elle
 *      n'ajoute qu'un écran entre le geste et l'appel. `CarteAppel` suffit : elle s'ouvre quand ça
 *      sonne, et demande qui on a eu dès le décroché.
 *
 * ══ CE QUI RESTE VRAI, ET QU'IL NE FAUT PAS DÉFAIRE ══
 *
 * LE NUMÉRO S'AFFICHE EN TEXTE à côté de chaque bouton d'appel. Ça a d'abord servi l'extension
 * Chrome d'Allo, qui ne décorait que ce qu'elle voyait ; l'extension n'est plus notre chemin, mais
 * la règle tient pour une autre raison — c'est le numéro qu'on dicte à un collègue, qu'on compare à
 * une facture, et qu'on copie quand on appelle depuis son mobile.
 *
 * LE NUMÉRO PART EN E.164. `+33612345678` est composable partout, `06 12 34 56 78` ne l'est pas hors
 * de France, et notre reprise Salesforce contient les deux écritures mélangées.
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
  /* AUCUN INDICATIF PAYS NE COMMENCE PAR ZÉRO — c'est la règle E.164 elle-même, et elle rattrape
     une famille entière de fausses saisies. « 0000000000 » passait par la branche « 00 → + » et
     ressortait en « +00000000 », qui a la bonne LONGUEUR et aucune existence : Kimatch demandait
     alors à Allô de composer un numéro impossible, et l'appel ne partait pas sans qu'on sache
     pourquoi. Constaté le 22/09/2026 sur la fiche d'essai de William. */
  if (/^\+0/.test(n)) return null
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
    /* ══ ON REPREND EXACTEMENT LA MÉTHODE DE WILLIAM — 23/09/2026 ══
     *
     * Naoëlle : « mets en place ce qu'il a fait lui, sur toute notre application. C'est exactement
     * ce que William a fait. Reprends sa fonctionnalité à lui. »
     *
     * Son sprint Cockpit appelle par `tel:`, et ça marche. Trois choses que son analyse corrige
     * dans la mienne, et qu'il faut garder en tête avant de revenir en arrière un jour :
     *
     *   ① `tel:` N'EST PAS RÉSERVÉ AU MOBILE. Kimatch le croyait depuis le 26/08, après que Chrome
     *     eut affiché « Sélectionner une application » sur le poste de Naoëlle. L'observation était
     *     juste, la conclusion non : SON poste n'avait pas Allô associé à `tel:`. C'est un réglage
     *     de système, pas une propriété du code.
     *
     *   ② `tel:` EST LE MEILLEUR CHEMIN CHEZ EUX. Lu par William dans l'application installée
     *     (v3.47) : `allo://call` émet `open-url/alloCall`, consommé par UN SEUL composant ; `tel:`
     *     émet `open-url/tel`, lu à DEUX endroits, et qui ramène en plus la fenêtre au premier plan.
     *
     *   ③ ON N'EN LANCE QU'UN. J'enchaînais `allo://` puis le nôtre : trois navigations de
     *     protocole dans le même geste ne sont pas gratuites, le navigateur peut n'en honorer
     *     qu'une — et rien ne dit laquelle. C'est ce qui a cassé les appels pendant une heure le
     *     22/09.
     *
     * TOUT EST SYNCHRONE, et c'est le piège numéro un de sa spécification : « `tel:` après un
     * `await` → Allô ne s'ouvre pas sur Safari/macOS/iOS. Le déclenchement doit être la première
     * instruction du gestionnaire de clic. » Rien ne s'intercale donc ici — ni requête, ni état.
     */
    lancerAppelBureau(e164)

    /* `qui` n'est plus transmis à personne : il servait à pré-remplir la fiche du correspondant
       dans la file du Power Dialer, retirée le 22/09. On garde le paramètre — des dizaines
       d'appelants le passent, et il redeviendra utile le jour où l'on écrira nous-mêmes l'appel. */
    void qui
    return `Appel de ${numeroLisible(e164)}…`
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
      {/* ══ LE VOLET ALLO EST RETIRÉ — 22/09/2026 ══
       *
       * Naoëlle, capture à l'appui : « pourquoi je vois encore ce clavier ? »
       *
       * IL AVAIT UNE RAISON D'ÊTRE, et elle a disparu ce matin. Il embarquait le softphone d'Allo
       * dans Kimatch parce que c'était le SEUL endroit d'où l'on pouvait raccrocher sans quitter
       * l'application — demande de William du 08/09. Depuis que le clic compose dans l'application
       * de bureau, c'est là qu'on parle et c'est là qu'on raccroche.
       *
       * ET PERSONNE NE S'EN SERVAIT POUR ÇA. Mesuré sur 610 appels terminés en quatorze jours :
       * 495 raccrochés par Allo, 115 marqués « COMMERCIAL » — et ces 115 sont TOUS en
       * `PAS_DE_REPONSE`, c'est-à-dire la signature du bouton « fermer la carte », pas d'un
       * raccrochage depuis le volet. Aucun raccrochage depuis Kimatch en deux semaines.
       *
       * IL COÛTAIT, LUI. Un cadre `web.withallo.com` monté en permanence, une session à ouvrir à
       * part, un clavier qui occupait un tiers de l'écran — et qui restait affiché après coup,
       * puisqu'il se souvenait d'avoir été ouvert.
       *
       * LE FICHIER RESTE DANS LE DÉPÔT : le jour où Allo branche `END_CALL`, le remettre est une
       * ligne. Voir `components/allo/VoletAllo.tsx` et `lib/pontAllo.ts`. */}
      {/* ══ LA CARTE « QUI AS-TU EU ? » EST RETIRÉE — 23/09/2026 ══
          Naoëlle, sur consigne de William : « supprime le bloc qui dit si j'ai eu quelqu'un ou
          service client, William m'a dit de le supprimer ».

          ELLE POSAIT SA QUESTION AU MAUVAIS ENDROIT. Le Cockpit la pose déjà, au bon moment et
          avec la suite à donner : `PanneauApresAppel` et `QualifierAppel` demandent qui on a eu,
          puis quelle tâche poser — sans quoi la fiche sort du plan et n'y revient jamais.
          Superposer une seconde question, flottante et sans suite, faisait répondre deux fois pour
          un seul appel.

          `components/allo/CarteAppel.tsx` reste dans le dépôt : il porte le raisonnement sur les
          262 appels non qualifiés et sur la croix qui écrivait « pas de réponse » à tort. */}
      {/* ══ LA FENÊTRE « APPELER CE NUMÉRO » EST RETIRÉE — 22/09/2026 ══
          Naoëlle : « est-ce que tu peux enlever le Power Dialer et le petit bloc qui ne servent
          plus à rien ». Elle a raison : cette fenêtre disait quoi faire à la main — coller le
          numéro, appuyer sur le vert — parce que rien ne composait. Depuis que le clic compose
          pour de bon, elle ne fait qu'ajouter un écran entre le geste et l'appel. `CarteAppel`
          suffit : elle s'ouvre quand ça sonne. */}
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

