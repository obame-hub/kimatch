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
 * ══ CE QUE LE PONT NE FERA PAS ══
 *
 * LE TRANSFERT N'EXISTE PAS dans ce protocole : la liste des messages tient en dix-huit types, et
 * aucun ne transfère. Le bouton de transfert reste celui d'Allo, dans le hublot.
 *
 * ET RIEN DE TOUT CECI N'EST DOCUMENTÉ PAR ALLO. C'est leur implémentation d'aujourd'hui, lue dans
 * un fichier qu'ils peuvent changer demain. Le pont dit donc toujours s'il est établi, et tout
 * appelant doit savoir se replier — voir `composer`, qui rend `false` plutôt que de laisser croire.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** L'origine de leur application web. Un `postMessage` ciblé, jamais `'*'` : sinon n'importe quel
    document chargé dans le cadre recevrait nos numéros de téléphone. */
export const ORIGINE_ALLO = 'https://web.withallo.com'

/** Les seuls types qu'on émet, repris de leur `Ia`. */
const SYNC = 'SYNC'
const SYNC_ACK = 'SYNC_ACK'
const READY = 'READY'
const DIAL_NUMBER = 'DIAL_NUMBER'
const END_CALL = 'END_CALL'

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

/**
 * Compose un numéro dans Allo. Rend `false` si le pont n'est pas établi — l'appelant doit alors se
 * replier sur la file d'appel, et surtout ne pas laisser croire que ça sonne.
 */
export function composer(e164: string): boolean {
  if (etat !== 'pret') {
    /* ON EN PROFITE POUR RESALUER : si le pont dormait, le prochain clic marchera. Mieux vaut ça
       qu'un utilisateur qui reclique dix fois sans que rien ne change jamais. */
    relancerLaPoignee()
    return false
  }
  return envoyer({ type: DIAL_NUMBER, data: { phoneNumber: e164 } })
}

/** Raccroche l'appel en cours dans Allo. Même règle : `false` quand on ne peut pas. */
export function raccrocher(): boolean {
  if (etat !== 'pret') return false
  return envoyer({ type: END_CALL, data: {} })
}
