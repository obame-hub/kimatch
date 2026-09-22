import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CarteAppel } from '@/components/allo/CarteAppel'
import { composerSurLePoste } from '@/lib/alloBureau'

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
    const tactile =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(hover: none) and (pointer: coarse)').matches === true

    if (tactile) {
      window.location.href = 'tel:' + e164
      return e164
    }

    /* ══ LA COMPOSITION DIRECTE : `allo://call?number=…` ══
     *
     * Naoëlle, 08/09/2026 : « il faudrait que quand je clique sur le petit logo appeler à côté d'un
     * numéro, ça appelle direct le numéro », puis « sans installer l'extension ».
     *
     * TROUVÉ DANS LEUR PROPRE CODE. Leur application web déclare une route `/call/$number` dont le
     * composant tient en trois lignes :
     *
     *     const { number } = useParams()
     *     window.location.href = `allo://call?number=${number}`
     *     setTimeout(() => navigate({ to: '/' }), 1500)
     *
     * Ce n'est donc pas un composeur web : c'est un LANCEUR vers le protocole `allo://`, que
     * l'application de BUREAU enregistre à son installation. On peut l'appeler directement, sans
     * passer par leur page intermédiaire ni par l'extension Chrome.
     *
     * ══ CE QUI SE PASSE SANS L'APPLICATION DE BUREAU ══
     *
     * Rien : un protocole non enregistré ne navigue pas. La première fois, Chrome demandera
     * l'autorisation — et c'est le même dialogue que celui qui apparaissait pour `tel:`, à une
     * différence près : cette fois il y a une application derrière. Une case « toujours autoriser »
     * et il ne repose plus la question.
     *
     * C'est pour ça qu'on continue AUSSI de déposer le numéro dans la file : sans l'application de
     * bureau, le dépôt et le volet restent le seul chemin, et ils ne coûtent rien à celui qui a
     * l'application.
     *
     * `<a>` CLIQUÉ PLUTÔT QUE `location.href`, et de façon SYNCHRONE dans le geste de l'utilisateur :
     * c'est la leçon du document de William sur Cockpit, où Safari et iOS refusent d'ouvrir une
     * application externe depuis un appel différé. Le même réflexe s'applique ici. */
    /* ══ ON TENTE `allo://` DANS TOUS LES CAS — 21/09/2026 AU SOIR ══
     *
     * Jusqu'ici ce protocole n'était lancé QUE si l'on avait choisi l'application de bureau, parce
     * qu'il ouvrait cette application par-dessus et vidait le volet de sa raison d'être.
     *
     * DEUX MESURES DU SOIR RETOURNENT LA DÉCISION :
     *
     *   · LA FILE NE COMPOSE RIEN. Le numéro de Naoëlle y était depuis le 8 septembre, position 0,
     *     `NOT_SYNCED`. Treize jours, aucun appel. Le chemin « volet seul » ne mène donc nulle
     *     part : on ne protège plus rien en s'abstenant.
     *
     *   · `allo://` RÉPOND. Éprouvé sur le poste : `Start-Process "allo://call?number=…"` est
     *     accepté par Windows et routé vers l'application. Les clés de registre paraissent vides
     *     parce qu'une application du Store passe par un mécanisme que le registre classique
     *     n'expose pas — c'est ce qui m'avait fait conclure trop vite qu'il n'y avait personne
     *     derrière le protocole.
     *
     * Le lancer coûte RIEN quand il n'aboutit pas : un protocole sans gestionnaire ne navigue pas,
     * et la fenêtre d'appel reste là avec le numéro déjà copié. Il fait gagner l'appel entier quand
     * il aboutit. On le tente donc toujours, et le volet demeure pour raccrocher. */
    /* ══ ON NE LANCE PLUS `allo://` — ET C'EST LUI QUI CASSAIT TOUT ══
     *
     * Naoëlle, 22/09/2026 : « ça n'appelle plus ? pourquoi ? » Le journal du poste le confirme :
     * aucune trace du clic, alors que le protocole `kimatch://` était intact et que les essais
     * directs marchaient tous.
     *
     * LA FAUTE EST L'ORDRE, ET ELLE EST DE MOI. `allo://` partait juste avant `kimatch://`. Or il
     * OUVRE L'APPLICATION ALLO ET LUI DONNE LE FOCUS. Quand notre script arrivait, une fraction de
     * seconde plus tard, Allo était en train de se réveiller ou affichait autre chose que son
     * clavier : l'écriture tombait à côté.
     *
     * C'est pour ça que les essais isolés réussissaient et que le clic depuis Kimatch échouait —
     * les deux protocoles ne partaient ensemble que dans le second cas.
     *
     * ET ON NE PERD RIEN. `allo://` ne compose pas : éprouvé plusieurs fois le 21 et le 22/09, il
     * ouvre l'application et s'arrête là. C'est un défaut chez eux, sur un chemin que leur propre
     * code documente pour les CRM. On le laisse donc de côté ; `lancerAlloBureau` reste exporté
     * dans `alloBureau.ts` pour le jour où ils le répareront. */

    /* ══ ET NOTRE PROPRE PROTOCOLE, CELUI QUI MARCHE — 22/09/2026 ══
     *
     * Naoëlle : « ils ne veulent pas répondre, faut qu'on le fasse nous-mêmes de n'importe quelle
     * manière. »
     *
     * `kimatch://appeler?numero=…` demande au poste de composer dans Allo : écrire le numéro dans
     * leur champ, RELIRE pour vérifier, puis actionner leur bouton « Appeler ». Voir
     * `scripts/appeler-depuis-kimatch.ps1`, et `alloBureau.ts` pour pourquoi ce n'est pas de la
     * simulation de clic à l'aveugle.
     *
     * ON LANCE LES DEUX, dans cet ordre. `allo://` est le chemin officiel — leur code le documente
     * pour les CRM sous Windows — et le jour où ils le réparent, on en profite sans rien changer
     * ici. `kimatch://` est celui qui marche aujourd'hui.
     *
     * SUR UN POSTE SANS NOTRE INSTALLATION, OU SUR MOBILE, il ne se passe rien : un protocole non
     * enregistré ne navigue pas et ne lève pas. Le comportement y reste exactement celui d'avant —
     * le numéro copié, le volet ouvert. On ne dégrade donc personne en tentant. */
    composerSurLePoste(e164)

    /* ══ ON OUVRE LA CARTE NOUS-MÊMES, SANS ATTENDRE ALLO ══
     *
     * Naoëlle, 22/09/2026 : « je vois le bloc une fois sur deux, surtout quand je lance un appel
     * direct après. Au pire créons-en un custom à nous, comme ça on est sûr qu'il apparaisse tout
     * le temps. »
     *
     * MESURÉ CE JOUR-LÀ : le webhook d'Allo n'arrive pas toujours. Plusieurs appels ont sonné —
     * constaté à l'écran, « Sonnerie en cours » chez eux — sans qu'aucune ligne n'apparaisse en
     * base. Pas de ligne, pas de carte, et aucune correction d'interface n'y pouvait rien. Quand il
     * arrive, il met de 2 à 372 secondes.
     *
     * KIMATCH SAIT QU'IL LANCE L'APPEL : il écrit donc la ligne lui-même. Le `call.triggered`
     * d'Allo la retrouvera par les neuf derniers chiffres et l'enrichira au lieu d'en créer une
     * seconde — voir `api/allo/ouvrir-appel.ts`.
     *
     * ON N'ATTEND PAS LA RÉPONSE : la carte sonde toutes les quatre secondes et verra la ligne
     * d'elle-même. Bloquer le clic sur un aller-retour réseau ferait revenir le « ça charge » que
     * Naoëlle a signalé ce matin. */
    void ouvrirLaCarteDAppel(e164)

    /* ══ LE VOLET S'OUVRE AVANT TOUTE REQUÊTE, ET SANS CONDITION ══
     *
     * Naoëlle, 15/09 : « ça me copie juste le numéro quand je clique sur le logo téléphone vert ».
     * Le message disait la cause — « Allo injoignable » — mais la faute était ailleurs : le volet
     * ne s'ouvrait QUE SI le dépôt dans la file avait réussi.
     *
     * Or le dépôt n'est qu'un confort : il pré-remplit le Power Dialer. Ce qui compte, quand l'appel
     * doit vivre dans le volet, c'est que le volet soit là. Le faire dépendre d'une requête réseau,
     * c'est promettre un téléphone qui n'apparaît pas dès qu'Allo tousse — ou, en développement
     * local, jamais : `npm run dev` ne sert que l'interface, les fonctions `api/` n'y existent pas.
     *
     * On ouvre donc d'abord, on dépose ensuite.
     *
     * ══ ET C'EST NOTRE FENÊTRE QUI S'OUVRE — 21/09/2026 ══
     *
     * Naoëlle : « leur click-to-call marche pas : quand on appelle, ça appelle pas, juste ça ouvre
     * le volet sans rien, ni le numéro dans le clavier. » Puis, après un essai raté par leur route
     * `/call/<numéro>` : « triche comme tu veux, même s'il faut créer notre propre fenêtre d'appel. »
     *
     * L'ESSAI RATÉ MÉRITE D'ÊTRE DIT, parce qu'il ferme une porte pour de bon : leur route ne fait
     * que `window.location.href = 'allo://call?…'`, et `allo://` n'est associé à aucune application
     * sur les postes de l'équipe — Windows a donné `tel:` à Chrome et n'a rien enregistré pour
     * `allo`. Le navigateur n'avait rien à lancer. Pire, recharger le cadre pour y arriver aurait
     * RACCROCHÉ l'appel en cours. Les deux fautes sont corrigées dans `VoletAllo`.
     *
     * `ouvrirFenetreAppel` ouvre donc NOTRE fenêtre, tout de suite et avant toute requête : elle dit
     * qui on appelle, montre le numéro en grand, et suit le dépôt dans la file. Voir
     * `FenetreAppel.tsx` pour les quatre portes essayées et refermées. */
    /* `qui` n'est plus transmis à personne : il servait à pré-remplir la fiche du correspondant
       dans la file du Power Dialer, qui vient d'être retirée. On garde le paramètre — des dizaines
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
      {/* LA CARTE D'APPEL VIT ICI, et non dans la mise en page.
          Ce fournisseur est deja le porteur du telephone dans l'application : y monter la carte lui
          donne exactement la meme portee que le bouton « Appeler », sans toucher a `AppLayout`.
          Elle rend `null` tant qu'aucun appel n'est en cours, donc son cout est nul. */}
      <CarteAppel />
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

/**
 * Demande au serveur d'ouvrir la carte d'appel pour ce numéro.
 *
 * NE LÈVE JAMAIS, et ne rend rien : la carte est un confort, pas une condition de l'appel. Si cette
 * requête échoue — session expirée, réseau coupé, fonction absente en `npm run dev` — le téléphone
 * sonne quand même, et la carte paraîtra quand le webhook d'Allo arrivera. On ne fait donc dépendre
 * aucun message de sa réussite : c'est la faute commise ce matin avec « préparation du numéro… »,
 * qui tournait indéfiniment quand la requête ne répondait pas.
 */
async function ouvrirLaCarteDAppel(e164: string): Promise<void> {
  try {
    const { supabase } = await import('@/lib/supabase')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    await fetch('/api/allo/ouvrir-appel', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero: e164 }),
    })
  } catch {
    /* Sans conséquence : voir le commentaire ci-dessus. */
  }
}

