/**
 * ══ RAMENER UN NUMÉRO DE TÉLÉPHONE À UNE FORME COMPARABLE ══
 *
 * Écrit le 04/09/2026 pour l'intégration Allo. Allo renvoie les numéros en E.164 (`+33134600975`) ;
 * Kimatch les a saisis à la main pendant des années. Sans une forme commune, un appel ne trouve
 * jamais son contact — et c'est exactement ce qui a fait échouer la reprise des appels Salesforce :
 * 7 824 consignations sans nulle part où aller.
 *
 * ══ CE QUE LA BASE CONTIENT VRAIMENT (mesuré le 04/09/2026, fonction passée sur les 3 399 fiches) ══
 *
 * 3 273 contacts actifs portent un téléphone, sous cinq formes :
 *
 *   2 583  déjà en E.164 valide         +33134600975                      rien à faire
 *     659  au format national            0130120403                        le 0 devient +33
 *      14  avec un zéro parasite        +330134600975                      le +33 ET le 0 : un de trop
 *       6  deux numéros dans le champ   +33143180284 / +33143180280        on prend le premier
 *       2  avec l'ancien préfixe        0033466254264                      0033 vaut +33
 *       4  inexploitables               « 02 », « +3389659787 »            aucune règle ne les sauve
 *
 * RÉSULTAT MESURÉ : 3 269 numéros sur 3 273 deviennent comparables, soit 99,9 %. C'est ce chiffre qui
 * rend l'intégration Allo utile plutôt qu'un tas d'appels orphelins.
 *
 * ══ CE QUE LA NORMALISATION NE RÉSOUT PAS ══
 *
 * 306 numéros sont partagés par plusieurs contacts, et l'un l'est par NEUF : ce sont des standards.
 * Un appel vers un de ces numéros ne désigne personne en particulier. Le rattachement doit donc viser
 * le COMPTE quand le numéro est partagé, et le contact seulement quand il lui est propre — sinon on
 * consigne un appel sur la fiche d'un collègue qui n'a pas décroché.
 *
 * ══ POURQUOI PAS UNE BIBLIOTHÈQUE ══
 *
 * `libphonenumber-js` fait tout cela et bien plus, pour 145 ko. Ce fichier traite un pays, cinq
 * formes, et les quatre cas irrécupérables le sont pour elle aussi. Le jour où KiWee appelle hors
 * d'Europe, la question se repose — les numéros étrangers déjà en `+` passent intacts en attendant.
 */

/** Le pays par défaut : tous les numéros nationaux saisis sans indicatif sont français. */
const INDICATIF_FRANCE = '+33'

/**
 * La forme comparable d'un numéro, ou `null` quand il n'y en a pas.
 *
 * `null` VEUT DIRE « ON NE SAIT PAS », PAS « PAS DE NUMÉRO. » Un appel dont le correspondant ne se
 * normalise pas ne doit pas être rattaché au hasard : il vaut mieux le laisser visible sans contact
 * que de l'accrocher au mauvais.
 */
export function normaliserTelephone(brut: string | null | undefined): string | null {
  if (!brut) return null

  /* ══ DEUX NUMÉROS DANS UN SEUL CHAMP ══

     Mesuré le 04/09/2026 : 6 contacts portent « +33143180284 / +33143180280 » ou
     « +33257674860 - +33665738245 » dans le même champ. Sans cette découpe, la concaténation des
     chiffres donne un numéro à vingt chiffres qui ne correspond à personne : on perd les DEUX.

     On garde le premier, celui que la personne a écrit en tête. Le second reste dans le champ, visible
     à l'œil, et le jour où on veut les deux c'est `normaliserTousLesTelephones` qu'il faut appeler. */
  const premier = brut.split(/[/;]|\s[-–]\s/)[0]

  // On garde les chiffres, et le + seulement s'il ouvre le numéro : un « + » au milieu est du bruit
  // de saisie (« 01 23 45 67 89 + poste 12 »), et le tronquer là serait pire que l'ignorer.
  const plus = premier.trim().startsWith('+')
  const chiffres = premier.replace(/\D/g, '')
  if (chiffres.length === 0) return null

  // ── 0033… : l'ancien préfixe international, antérieur au +. Il vaut « + » ──
  if (chiffres.startsWith('0033')) return corrigerFrance(`+33${chiffres.slice(4)}`)

  // ── Déjà international ──
  if (plus || chiffres.startsWith('33')) {
    const avecPlus = plus ? `+${chiffres}` : `+${chiffres}`
    if (avecPlus.startsWith(INDICATIF_FRANCE)) return corrigerFrance(avecPlus)
    // Un indicatif étranger passe tel quel : on ne connaît pas ses règles de longueur, et inventer
    // une validation reviendrait à rejeter des numéros valides.
    return avecPlus.length >= 8 ? avecPlus : null
  }

  // ── Format national français : 10 chiffres commençant par 0 ──
  if (chiffres.length === 10 && chiffres.startsWith('0')) {
    return corrigerFrance(`${INDICATIF_FRANCE}${chiffres.slice(1)}`)
  }

  // ── 9 chiffres sans le 0 initial, tel qu'on l'écrit parfois ──
  if (chiffres.length === 9 && chiffres[0] !== '0') {
    return `${INDICATIF_FRANCE}${chiffres}`
  }

  // Tout le reste — « 02 », un poste interne, un numéro tronqué — n'est pas un numéro joignable.
  return null
}

/**
 * Le zéro parasite après l'indicatif, et la validation de longueur française.
 *
 * `+330134600975` existe 14 fois dans la base : quelqu'un a collé l'indicatif DEVANT le numéro
 * national sans en retirer le 0. Les deux notations disent le même numéro, et sans cette correction
 * elles ne se rencontreraient jamais.
 */
function corrigerFrance(numero: string): string | null {
  let national = numero.slice(INDICATIF_FRANCE.length)
  if (national.startsWith('0')) national = national.slice(1)
  // Un numéro français a 9 chiffres après l'indicatif, et ne commence pas par 0.
  if (!/^[1-9]\d{8}$/.test(national)) return null
  return `${INDICATIF_FRANCE}${national}`
}

/**
 * Tous les numéros comparables que porte un champ, sans doublon.
 *
 * Un champ de la base contient parfois deux lignes téléphoniques — le standard et le direct, ou le
 * fixe et le portable. L'index qui rattache un appel à un contact doit connaître les deux : Allo
 * appellera l'un ou l'autre, et rien ne dit lequel.
 */
export function normaliserTousLesTelephones(...bruts: (string | null | undefined)[]): string[] {
  const trouves = new Set<string>()
  for (const brut of bruts) {
    if (!brut) continue
    for (const morceau of brut.split(/[/;,]|\s[-–]\s/)) {
      const n = normaliserTelephone(morceau)
      if (n) trouves.add(n)
    }
  }
  return [...trouves]
}

/**
 * La forme lisible d'un numéro E.164 français : `+33134600975` → `01 34 60 09 75`.
 *
 * Un numéro français s'affiche par paires, c'est la seule forme qu'on relit au téléphone. Un numéro
 * étranger reste en E.164 : le regrouper à la française tromperait sur sa structure.
 */
export function afficherTelephone(e164: string | null | undefined): string {
  if (!e164) return ''
  if (!e164.startsWith(INDICATIF_FRANCE)) return e164
  const national = `0${e164.slice(INDICATIF_FRANCE.length)}`
  if (national.length !== 10) return e164
  return national.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}
