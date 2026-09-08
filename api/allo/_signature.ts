import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * ══ LA SIGNATURE DES WEBHOOKS D'ALLO ══
 *
 * Extraite du gestionnaire pour être testable, comme `_decision.ts` l'est pour DocuSign. C'est le
 * morceau qui, mal écrit, rejette TOUT en silence : Allo verrait des 401, son taux d'erreur
 * monterait, et personne ne saurait qu'aucun appel n'arrive. Impossible à vérifier contre du vrai
 * trafic avant la mise en service — donc vérifié par des tests.
 *
 * Le schéma est celui de Standard Webhooks, relevé le 08/09/2026 dans la documentation d'Allo :
 *
 *   webhook-id          identifiant du message
 *   webhook-timestamp   secondes Unix
 *   webhook-signature   « v1,<base64> », plusieurs séparées par des espaces
 *
 * Contenu signé : `{id}.{timestamp}.{corps brut}`, en HMAC-SHA256, rendu en base64.
 */

/** Cinq minutes, la tolérance qu'Allo prescrit contre le rejeu. */
export const TOLERANCE_SECONDES = 300

/**
 * UN INDEX, ET NON UNE INTERFACE AUX TROIS CHAMPS OPTIONNELS.
 *
 * Écrite comme `{ 'webhook-id'?: … }`, l'interface devient un « type faible » aux yeux de
 * TypeScript, qui refuse alors de lui passer `req.headers` : « Type 'IncomingHttpHeaders' has no
 * properties in common ». Un index accepte les en-têtes tels que Node les donne, et garde le même
 * typage de valeur — une chaîne, ou un tableau quand l'en-tête est répété.
 */
export type EntetesSignature = Record<string, string | string[] | undefined>

/** Un en-tête HTTP peut arriver en tableau quand il est répété ; on ne retient que le premier. */
function texte(valeur: string | string[] | undefined): string | null {
  if (typeof valeur === 'string') return valeur
  if (Array.isArray(valeur) && typeof valeur[0] === 'string') return valeur[0]
  return null
}

/**
 * Les octets de la clé, depuis un secret `whsec_<base64>`.
 *
 * LE PRÉFIXE SE RETIRE ET LE RESTE SE DÉCODE. Utiliser la chaîne telle quelle produirait une
 * signature systématiquement fausse, et un 401 identique à celui d'une vraie tentative d'intrusion —
 * la panne la plus difficile à diagnostiquer qui soit.
 */
export function clefDepuisSecret(secret: string): Buffer {
  const separateur = secret.indexOf('_')
  return Buffer.from(separateur >= 0 ? secret.slice(separateur + 1) : secret, 'base64')
}

/**
 * La requête vient-elle bien d'Allo ?
 *
 * `maintenantSecondes` est injectable pour que les tests puissent vieillir un horodatage sans
 * attendre cinq minutes.
 */
export function signatureValide(
  corpsBrut: string,
  entetes: EntetesSignature,
  secret: string,
  maintenantSecondes: number = Math.floor(Date.now() / 1000),
): boolean {
  const id = texte(entetes['webhook-id'])
  const horodatage = texte(entetes['webhook-timestamp'])
  const signatures = texte(entetes['webhook-signature'])
  if (id === null || horodatage === null || signatures === null) return false

  const t = Number.parseInt(horodatage, 10)
  if (!Number.isFinite(t)) return false
  if (Math.abs(maintenantSecondes - t) > TOLERANCE_SECONDES) return false

  const attendue = createHmac('sha256', clefDepuisSecret(secret))
    .update(`${id}.${horodatage}.${corpsBrut}`)
    .digest()

  // PLUSIEURS SIGNATURES SONT POSSIBLES, séparées par des espaces : c'est ainsi qu'Allo fait tourner
  // un secret sans coupure de service. Une seule qui correspond suffit.
  return signatures.split(' ').some((brute) => {
    const morceau = brute.trim()
    if (!morceau) return false
    const valeur = morceau.includes(',') ? morceau.slice(morceau.indexOf(',') + 1) : morceau
    const recue = Buffer.from(valeur, 'base64')
    // `timingSafeEqual` LÈVE si les longueurs diffèrent : on écarte le cas avant de l'appeler,
    // sinon une signature tronquée ferait une erreur 500 au lieu d'un refus propre.
    return recue.length === attendue.length && timingSafeEqual(recue, attendue)
  })
}

/** Ce qu'Allo enverrait pour ce corps — sert aux tests, et à diagnostiquer un refus à la main. */
export function signerPourTest(corpsBrut: string, id: string, horodatage: number, secret: string): string {
  const sig = createHmac('sha256', clefDepuisSecret(secret))
    .update(`${id}.${horodatage}.${corpsBrut}`)
    .digest('base64')
  return `v1,${sig}`
}
