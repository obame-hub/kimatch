/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE PONT VERS ALLO — COMPOSER ET RACCROCHER DEPUIS KIMATCH
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 15/09/2026 : « je veux que quand je clique sur le téléphone ça appelle direct », et
 * William le matin : un petit encadré avec raccrocher et transférer.
 *
 * ══ POURQUOI ÇA SEMBLAIT IMPOSSIBLE, ET POURQUOI ÇA NE L'EST PAS ══
 *
 * L'API d'Allo n'a AUCUN contrôle d'appel — vérifié sur leur référence (16 familles de ressources,
 * les appels en lecture seule), sur leur page de transfert, et sur notre propre clé (21 portées,
 * aucune ne touche un appel en cours). La conclusion paraissait acquise : Kimatch ne peut ni
 * composer ni raccrocher.
 *
 * ELLE ÉTAIT FAUSSE, et la preuve est dans leur propre code. Leur application web embarque le
 * `calling-extensions-sdk` de HubSpot — le protocole par lequel un CRM pilote un téléphone affiché
 * dans une iframe. Trois faits, lus dans `index-DzKTdSAs.js` le 15/09/2026 :
 *
 *   1. `tle.initialize()` est appelé AU CHARGEMENT DE LA PAGE, sans condition. Le pont est donc
 *      ouvert dès qu'Allo s'affiche, y compris dans notre volet.
 *   2. Le SDK, en mode widget, pose `destinationWindow = window.parent` — c'est-à-dire Kimatch —
 *      et `destinationHost = extractHostFromUrl(document.referrer)`, c'est-à-dire notre domaine.
 *   3. Sur réception d'un message `SYNC`, il se déclare prêt, répond `SYNC_ACK`, puis accepte
 *      `DIAL_NUMBER` et `END_CALL`.
 *
 * `postMessage` EST FAIT POUR ÇA. C'est le seul canal que la politique de même origine autorise
 * entre deux domaines, et il demande le consentement des deux côtés : on ne force rien, on parle un
 * protocole qu'Allo écoute déjà.
 *
 * ══ CE QUE LE PONT FAIT, ET CE QU'IL NE FAIT PAS ══
 *
 * IL FAIT BASCULER ALLO EN COMPOSEUR EMBARQUÉ, et c'est déjà beaucoup : dès que la poignée de main
 * aboutit, leur page n'affiche plus l'application complète — quatre colonnes, discussions, réglages
 * — mais l'interface compacte réservée à un CRM qui l'héberge. C'est exactement le petit bloc
 * demandé, et il vient d'eux : rien n'est découpé, rien ne cassera quand ils déplaceront un bouton.
 *
 * IL NE COMPOSE PAS, ET NE RACCROCHE PAS. Première version : on envoyait `DIAL_NUMBER`, l'écran
 * disait « Appel en cours », et il ne se passait rien. Vérifié dans leur code le 15/09/2026 :
 *
 *   `onDialNumber` fait `this.emit("dialNumber", n)` — et « dialNumber » n'apparaît que DEUX fois
 *   dans tout leur paquet, les deux comme émetteur, jamais comme abonné.
 *   `onEndCall` fait `this.emit("endCall", n)` — même chose : les six autres occurrences de
 *   « endCall » sont des traductions (« Raccrocher », « Fin d'appel »).
 *
 * Autrement dit, leur intégration HubSpot est CÂBLÉE CÔTÉ RÉCEPTION ET BRANCHÉE SUR RIEN. Les
 * messages arrivent, un événement part, personne ne l'écoute. Ce n'est pas une erreur de notre
 * format : c'est un chantier inachevé chez eux.
 *
 * On ne garde donc que la poignée de main. Envoyer des ordres qu'on sait ignorés produirait un
 * bouton qui ment — et un bouton qui ment est pire que pas de bouton.
 *
 * C'EST LA DEMANDE PRÉCISE À LEUR FAIRE : « votre application web embarque le calling-extensions-sdk
 * et accepte le SYNC, mais rien n'écoute onDialNumber ni onEndCall. Pouvez-vous le finir ? » Le jour
 * où ils branchent ces deux événements, `composer` et `raccrocher` reviennent en dix lignes.
 *
 * ══ REVÉRIFIÉ LE 20/09/2026, APRÈS LEUR RÉPONSE ══
 *
 * Allo répond : « nous utilisons que les évènements nécessaires pour lancer l'appel dans Allo, le
 * raccrochage se fait depuis Allo. Nous n'avons pas besoin d'intégrer d'autres évènements, ça
 * marche parfaitement comme ça. »
 *
 * Leur paquet a changé depuis — `index-MhbreOCW.js` remplace `index-DzKTdSAs.js` — donc le constat
 * a été refait sur le code en ligne ce jour-là, et il est inchangé. Compté dans le nouveau paquet :
 *
 *   `on("ready"`      → 1 abonné
 *   `on("dialNumber"` → 0
 *   `on("endCall"`    → 0
 *
 * C'est la mesure qui tranche, et elle ne dépend d'aucune interprétation : leur mécanisme
 * d'abonnement existe et sert pour `ready`. Ces deux événements-là partent donc bien dans le vide.
 * `dialNumber` n'apparaît toujours que deux fois dans tout le paquet, les deux comme ÉMETTEUR — le
 * handler HubSpot, et un second dans leur connecteur Salesforce.
 *
 * Leur réponse décrit sans doute l'usage inverse, où l'appel part d'Allo et l'information descend
 * vers le CRM : celui-là marche, et c'est ce qu'on reçoit déjà. Ce qui manque est le sens CRM →
 * téléphone, qui est précisément ce que `DIAL_NUMBER` sert à faire.
 *
 * ══ LA CAPACITÉ EXISTE CHEZ EUX, SUR UN AUTRE CHEMIN ══
 *
 * Le même paquet contient un connecteur FRESHSALES complet, avec `startOutboundCall(numéro)`,
 * `endCall()`, `currentCall` et ses journaux (« [Freshsales Provider] Starting outbound call
 * for: »). Composer depuis un CRM n'est donc pas un manque de leur produit : c'est le chemin
 * HubSpot, celui que nous empruntons, qui n'a pas été terminé. C'est l'argument à leur opposer,
 * plutôt que de répéter le constat qu'ils ont déjà écarté.
 *
 * ══ ET IL N'Y A PAS DE CONTOURNEMENT — CHERCHÉ LE 20/09/2026 ══
 *
 * Avant de leur réécrire, on a cherché une autre porte d'entrée dans le paquet du jour. Il n'y en
 * a pas :
 *
 *   · les cinq `addEventListener("message")` sont Sentry, New Relic, le canal multi-onglets de
 *     Supabase, et le SDK HubSpot. Aucun protocole propriétaire à emprunter ;
 *   · aucun paramètre d'URL du genre `?number=`, et la route `/call/$number` charge le chunk
 *     `call-flow._number` — c'est la configuration d'un numéro, pas un composeur ;
 *   · aucun lien profond : `registerProtocolHandler` et `allo://` sont absents, et les quatre
 *     `tel:` viennent de libphonenumber ;
 *   · `https://api.withallo.com/v1/call` n'est lu qu'en GET (liste des appels).
 *
 * Donc pas de solution de notre côté — dans LEUR APPLICATION WEB. La suite corrige cette phrase.
 *
 * ══ IL Y AVAIT UNE AUTRE PORTE, ET ELLE N'EST PAS DANS L'IFRAME — 20/09/2026 ══
 *
 * Cherché dans leur documentation publique plutôt que dans leur paquet, et c'est là que ça se
 * jouait. Deux trouvailles, l'une utile, l'autre décisive.
 *
 *   1. LEUR API NE COMPOSE PAS, C'EST CONFIRMÉ À LA SOURCE. L'OpenAPI de `api.withallo.com`
 *      (`help.withallo.com/openapi.json`, 64 chemins) n'a aucun point d'entrée pour lancer un
 *      appel : `/v1/api/calls` est en GET, et `/v2/api/conversations/{n}/action` ne connaît que
 *      READ, UNREAD, ARCHIVE, UNARCHIVE. William avait raison.
 *
 *      En revanche `POST /v2/api/dialing-queues/current/numbers` remplit la file du Power Dialer,
 *      et son corps accepte `email` — celui d'un coéquipier. Depuis Kimatch on peut donc pousser
 *      une liste de numéros dans la file d'un conseiller nommé. Ce n'est pas l'appel d'un clic,
 *      c'est mieux pour la prospection en série : quarante pistes poussées d'un coup, le conseiller
 *      lance son composeur et enchaîne.
 *
 *   2. L'EXTENSION CHROME REND LE PONT INUTILE POUR COMPOSER. Allo publie « Allo - Click to Call »
 *      (`bjjbpnjndjmamflhendfjfefdbpleclk`). Son manifeste, lu en v1.2.7, dit tout :
 *
 *        content_scripts.matches = ["<all_urls>"]      ← toutes les pages, pas une liste de CRM
 *        host_permissions        = ["https://*.withallo.com/*"]
 *
 *      et elle embarque `findPhoneNumbersInText` bâti sur libphonenumber : la détection se fait sur
 *      le TEXTE de la page, sans rien savoir du site. Kimatch est donc couvert comme n'importe
 *      quelle page, sans une ligne de code chez nous. Leur propre page produit le dit :
 *      « The Allo browser extension turns any phone number on a web page into a click-to-call
 *      link ».
 *
 * C'EST SANS DOUTE CE QU'ILS VOULAIENT DIRE par « ça marche parfaitement comme ça » : ils pensaient
 * extension, nous pensions SDK. Reste à vérifier sur un poste que nos numéros affichés — souvent au
 * format français sans indicatif — sont bien reconnus ; libphonenumber dépend alors du pays par
 * défaut, et ça, aucune lecture de code ne le dira à notre place.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** L'origine de leur application web. Un `postMessage` ciblé, jamais `'*'` : sinon n'importe quel
    document chargé dans le cadre recevrait nos numéros de téléphone. */
export const ORIGINE_ALLO = 'https://web.withallo.com'

/** Les seuls types qu'on émet, repris de leur `Ia`. */
const SYNC = 'SYNC'
const SYNC_ACK = 'SYNC_ACK'
const READY = 'READY'

interface MessageAllo {
  type?: string
  data?: unknown
}

type Etat = 'absent' | 'attente' | 'pret'

let cadre: HTMLIFrameElement | null = null
let etat: Etat = 'absent'
let relances: ReturnType<typeof setInterval> | null = null
let ecoute = false
const observateurs = new Set<(e: Etat) => void>()

function changer(e: Etat): void {
  if (etat === e) return
  etat = e
  observateurs.forEach((f) => f(e))
}

export function etatDuPont(): Etat {
  return etat
}

export function observerLePont(f: (e: Etat) => void): () => void {
  observateurs.add(f)
  return () => observateurs.delete(f)
}

function envoyer(message: Record<string, unknown>): boolean {
  const fenetre = cadre?.contentWindow
  if (!fenetre) return false
  try {
    fenetre.postMessage(message, ORIGINE_ALLO)
    return true
  } catch {
    return false
  }
}

/**
 * La poignée de main.
 *
 * ON LA RÉPÈTE, parce qu'on ne sait pas quand leur application a fini de démarrer : un `SYNC` envoyé
 * trop tôt tombe dans le vide, et rien ne nous préviendrait. Elle s'arrête au premier `SYNC_ACK`.
 *
 * Les champs sont ceux que leur code lit dans le message : `portalId`, `userId`, `ownerId`,
 * `iframeLocation`, `usesCallingWindow`, `hostUrl`. Les identifiants sont ceux de HubSpot — on n'en
 * a pas, et leur code ne s'en sert que pour les renvoyer tels quels.
 */
function saluer(): void {
  envoyer({
    type: SYNC,
    portalId: 0,
    userId: 0,
    ownerId: 0,
    iframeLocation: 'widget',
    usesCallingWindow: false,
    hostUrl: window.location.origin,
  })
}

function surMessage(e: MessageEvent): void {
  if (e.origin !== ORIGINE_ALLO) return
  const m = e.data as MessageAllo | null
  if (!m || typeof m !== 'object') return
  if (m.type === SYNC_ACK || m.type === READY) {
    if (relances) { clearInterval(relances); relances = null }
    changer('pret')
  }
}

/**
 * Déclare le cadre qui porte Allo, et ouvre le pont.
 *
 * Appelé à chaque chargement du cadre : leur application redémarre, donc la poignée de main aussi.
 */
export function brancherLePont(element: HTMLIFrameElement | null): void {
  cadre = element
  if (!element) {
    changer('absent')
    if (relances) { clearInterval(relances); relances = null }
    return
  }
  if (!ecoute) {
    window.addEventListener('message', surMessage)
    ecoute = true
  }
  relancerLaPoignee()
}

/**
 * Relance la poignée de main.
 *
 * APPELÉE AUSSI AU CHARGEMENT DU CADRE, et c'est ce qui manquait : `ref` se déclenche quand
 * l'élément est posé dans la page, bien avant que leur application ait démarré. Les premières
 * salutations tombaient donc dans le vide, et la fenêtre de rattrapage se fermait au bout de vingt
 * secondes — un clic plus tard, le pont n'était jamais établi et on retombait sur la file.
 */
export function relancerLaPoignee(): void {
  if (!cadre) return
  if (etat !== 'pret') changer('attente')
  saluer()
  if (relances) clearInterval(relances)
  /* Soixante tentatives à une seconde. Un message par seconde pendant une minute ne coûte rien, et
     couvre un démarrage lent, une session à reconnecter, ou un réseau qui traîne. */
  let reste = 60
  relances = setInterval(() => {
    if (etat === 'pret' || reste-- <= 0) {
      if (relances) { clearInterval(relances); relances = null }
      return
    }
    saluer()
  }, 1000)
}

/* `composer` et `raccrocher` ont été retirés le 15/09/2026, le jour de leur écriture : Allo reçoit
   `DIAL_NUMBER` et `END_CALL` mais n'y a branché aucun traitement (voir l'en-tête). Ils revenaient à
   afficher « Appel en cours » sur un appel qui n'existait pas. Le protocole est écrit là-haut pour
   le jour où Allo finira son intégration. */
