import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash } from 'crypto'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA PORTE UNIQUE DE L'API PARTENAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══ POURQUOI UNE PORTE PLUTÔT QU'UNE SESSION ══
 *
 * Faire entrer un externe dans Kimatch, c'est lui donner une session valide dans une application de
 * 188 tables, 25 vues, 69 points d'entrée et 26 fonctions `security definer`. Chacun de ces objets
 * doit refuser, individuellement, et pour toujours.
 *
 * En deux jours d'audit, sept failles ont été mesurées — dont une dans une correction écrite la
 * veille par quelqu'un qui cherchait précisément ce genre de faille. Ce n'est pas un défaut
 * d'attention : la surface est trop grande pour être tenue objet par objet.
 *
 * Ici le raisonnement s'inverse. Au lieu de vérifier que 300 objets refusent, on écrit ce qu'UN
 * SEUL accepte. Ajouter demain une table, une vue ou un endpoint n'ouvre rien.
 *
 * ══ CE QUE CETTE PORTE LAISSE PASSER ══
 *
 *   · en LECTURE seule — aucune écriture, aucune suppression, jamais
 *   · borné au périmètre de la clé — son compte, et ceux dont il est l'apporteur
 *   · sur des champs choisis un par un — pas de `select *`, pas de jointure ouverte
 *
 * ══ PAS DE CLIENT SUPABASE ICI, ET C'EST DÉLIBÉRÉ ══
 *
 * `@supabase/supabase-js` v2 embarque un client temps réel qui exige Node 22 (« native WebSocket
 * not found » sous Node 20). Cette API n'a besoin que de lire : `fetch` sur PostgREST fait
 * exactement cela, sans dépendre d'une version de Node ni charger de quoi ouvrir un canal.
 *
 * ══ LA CLÉ NE SE RELIT PAS ══
 *
 * On compare l'empreinte SHA-256, jamais la clé. Une base volée n'en donne aucune d'utilisable.
 */

/** Le préfixe rend une clé reconnaissable dans un journal ou un presse-papier. */
export const PREFIXE_CLE = 'kw_'

export interface Partenaire {
  cleId: string
  compteId: string
  libelle: string
}

export function empreinteDe(cle: string): string {
  return createHash('sha256').update(cle).digest('hex')
}

function config(): { url: string; cle: string } | null {
  const url = process.env.VITE_SUPABASE_URL
  const cle = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !cle) return null
  return { url, cle }
}

/** Une lecture PostgREST avec la clé de service. Rend `null` sur toute erreur — jamais d'exception
 *  qui ferait fuir un message technique dans la réponse. */
export async function lire<T>(chemin: string): Promise<T[] | null> {
  const c = config()
  if (!c) return null
  try {
    const r = await fetch(`${c.url}/rest/v1/${chemin}`, {
      headers: { apikey: c.cle, Authorization: `Bearer ${c.cle}` },
    })
    if (!r.ok) return null
    const j = await r.json()
    return Array.isArray(j) ? (j as T[]) : null
  } catch {
    return null
  }
}

/**
 * Identifie le partenaire derrière la clé, ou répond lui-même et rend `null`.
 *
 *   const p = await exigerCle(req, res)
 *   if (!p) return
 *
 * ══ POURQUOI LA CLÉ DE SERVICE EST LÉGITIME ICI, ALORS QU'AILLEURS ELLE EST LE DÉFAUT ══
 *
 * C'est exactement le motif qui a produit trois failles côté Kimatch : clé de service + un
 * identifiant venu du client. La différence tient en une phrase : ici, l'identifiant NE VIENT PAS
 * DU CLIENT. Il est lu dans la table des clés, à partir d'une empreinte que l'appelant ne peut pas
 * forger. Le périmètre est déduit, jamais déclaré.
 *
 * C'est la règle de cette API, et la seule qui la rende tenable : aucune fonction sous `partenaire/`
 * ne doit accepter un identifiant de compte dans la requête.
 */
export async function exigerCle(req: VercelRequest, res: VercelResponse): Promise<Partenaire | null> {
  const entete = req.headers.authorization
  if (!entete?.startsWith('Bearer ')) {
    res.status(401).json({
      erreur: 'Clé manquante.',
      aide: 'Ajoutez l’en-tête « Authorization: Bearer <votre clé> ».',
    })
    return null
  }

  const porteur = entete.slice('Bearer '.length).trim()
  if (!porteur) {
    res.status(401).json({ erreur: 'Clé invalide.' })
    return null
  }

  if (!config()) {
    res.status(503).json({ erreur: 'Service indisponible.' })
    return null
  }

  /* ══ DEUX PORTEURS POSSIBLES, ET LE PRÉFIXE LES DISTINGUE ══
   *
   * `kw_…`  une CLÉ D'API, émise par un administrateur pour un programme. Elle vaut jusqu'à
   *         révocation, et se relève dans `cles_api_partenaires`.
   *
   * autre   un JETON DE SESSION, né d'un lien reçu par mail. Il expire seul au bout de trente
   *         jours, et vit dans `sessions_partenaires`.
   *
   * Naoëlle, 26/09/2026 : « je préfère qu'ils reçoivent un lien dans leur boîte mail afin qu'ils
   * soient indépendants ». Les deux coexistent : la clé sert une intégration, le lien sert une
   * personne — et les deux aboutissent au même périmètre, déduit du compte, jamais déclaré. */
  return porteur.startsWith(PREFIXE_CLE)
    ? await parLaCle(porteur, res)
    : await parLaSession(porteur, res)
}

/** Une clé d'API : `cles_api_partenaires`, valable jusqu'à révocation. */
async function parLaCle(cle: string, res: VercelResponse): Promise<Partenaire | null> {
  const lignes = await lire<{
    id: string; compte_id: string; libelle: string; actif: boolean; revoquee_le: string | null
  }>(
    `cles_api_partenaires?empreinte=eq.${encodeURIComponent(empreinteDe(cle))}` +
    '&select=id,compte_id,libelle,actif,revoquee_le&limit=1',
  )

  const trouvee = lignes && lignes.length > 0 ? lignes[0] : null

  /* UNE SEULE RÉPONSE POUR TOUS LES REFUS. Distinguer « clé inconnue » de « clé révoquée »
     renseignerait sur ce qui existe ; et un message unique évite qu'on lise, dans la différence,
     autre chose que ce qu'on voulait dire. */
  if (!trouvee || !trouvee.actif || trouvee.revoquee_le) {
    res.status(401).json({ erreur: 'Clé invalide ou révoquée.' })
    return null
  }

  /* ON COMPTE, SANS BLOQUER. Le relevé d'usage sert à repérer une clé oubliée ou un usage anormal ;
     il ne doit jamais faire échouer une réponse due au partenaire. */
  void marquerUsage(trouvee.id)

  return { cleId: trouvee.id, compteId: trouvee.compte_id, libelle: trouvee.libelle }
}

/** Un jeton de session, né d'un lien reçu par mail : `sessions_partenaires`, trente jours. */
async function parLaSession(jeton: string, res: VercelResponse): Promise<Partenaire | null> {
  const lignes = await lire<{
    id: string
    compte_id: string
    sess_expire_le: string | null
    revoquee_le: string | null
    compte: { nom: string } | null
  }>(
    `sessions_partenaires?empreinte_sess=eq.${encodeURIComponent(empreinteDe(jeton))}` +
    '&select=id,compte_id,sess_expire_le,revoquee_le,compte:comptes(nom)&limit=1',
  )

  const s = lignes && lignes.length > 0 ? lignes[0] : null
  const expiree = s?.sess_expire_le ? new Date(s.sess_expire_le).getTime() < Date.now() : true

  if (!s || s.revoquee_le || expiree) {
    res.status(401).json({
      erreur: 'Votre accès a expiré. Saisissez votre adresse e-mail pour recevoir un nouveau lien.',
    })
    return null
  }

  void marquerVueSession(s.id)

  return { cleId: s.id, compteId: s.compte_id, libelle: s.compte?.nom ?? 'Espace partenaire' }
}

async function marquerVueSession(id: string): Promise<void> {
  const c = config()
  if (!c) return
  try {
    await fetch(`${c.url}/rest/v1/rpc/marquer_vue_session_partenaire`, {
      method: 'POST',
      headers: { apikey: c.cle, Authorization: `Bearer ${c.cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_session_id: id }),
    })
  } catch {
    /* Le relevé est une commodité, jamais une condition de la réponse. */
  }
}

async function marquerUsage(cleId: string): Promise<void> {
  const c = config()
  if (!c) return
  try {
    await fetch(`${c.url}/rest/v1/rpc/marquer_usage_cle_api`, {
      method: 'POST',
      headers: { apikey: c.cle, Authorization: `Bearer ${c.cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_cle_id: cleId }),
    })
  } catch {
    /* Le relevé est une commodité, jamais une condition de la réponse. */
  }
}

/**
 * Le périmètre de ce partenaire : son compte, et ceux dont il est l'apporteur.
 *
 * ON NE RECOPIE PAS LA RÈGLE : c'est celle de `comptes_du_partenaire()`, qui gouverne déjà ce que
 * l'espace partenaire montrait. Deux définitions de « ce qu'un partenaire voit » finiraient par
 * diverger, et c'est la divergence qui fait les failles.
 */
export async function comptesDuPartenaire(compteId: string): Promise<string[]> {
  const lignes = await lire<{ id: string }>(
    `comptes?or=(id.eq.${compteId},apporteur_partenaire_id.eq.${compteId})&select=id`,
  )
  return lignes ? lignes.map((c) => c.id) : []
}

/** La liste `in.(…)` de PostgREST, correctement échappée. */
export function enListe(ids: string[]): string {
  return `in.(${ids.map((i) => `"${i}"`).join(',')})`
}
