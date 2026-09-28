import type { VercelRequest, VercelResponse } from '@vercel/node'
import { exigerSession, refuserLesPartenaires, type UtilisateurAuthentifie } from '../_auth.js'
import {
  appelerTradeo,
  obtenirJeton,
  tradeoConfigure,
  urlTradeo,
  ErreurTradeo,
  type CorpsTradeo,
} from './_client.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POST /api/tradeo — LE BANC D'ESSAI DE L'API ENERGIEX
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 28/09/2026 : « créer une interface juste pour qu'il puisse tester, pour qu'il puisse
 * avoir un visuel sur comment ça fonctionne ». William branchera ensuite les prix sur les versions
 * de recommandation ; cette fonction ne touche à AUCUNE table métier.
 *
 * UNE SEULE FONCTION, UNE ACTION PAR APPEL. Les huit routes Tradeo utiles partagent tout — garde,
 * jeton, journal, erreurs. Huit fichiers recopieraient huit fois cette mécanique.
 *
 * ══ CE QUI N'Y EST PAS, ET POURQUOI ══
 *
 * `creer-demande-offre-fournisseur`, `envoyer-acd-en-signature` et `creer-contrat-a-signer`
 * écrivent à des personnes réelles : le commercial d'un fournisseur, un signataire, l'ADV Tradeo.
 * Un banc d'essai ne doit pas pouvoir le faire d'un clic. Seule la LECTURE des demandes d'offre
 * est exposée, parce que c'est là que reviennent les fichiers de prix.
 *
 * ══ LES ERREURS ══
 *
 * Deux familles, qu'il ne faut pas confondre :
 *   · Tradeo A RÉPONDU, même par un refus (400, 403, 404…) : HTTP 200 ici, `ok: false`, et la
 *     réponse de Tradeo telle quelle. C'est une information sur la requête, pas une panne.
 *   · Tradeo N'A PAS PU ÊTRE INTERROGÉ : 503 (pas configuré, identifiants refusés), 502
 *     (injoignable), 504 (délai). Avec un `code` stable pour que l'écran sache quoi dire.
 */

export const config = { maxDuration: 60 }

type Fichier = { nom: string; type: string; base64: string }
type Corps = Record<string, unknown>

const TYPES_FICHIERS = ['ACD', 'Facture', 'RIB', 'Contrat'] as const

class RequeteInvalide extends Error {}

function texteJson(valeur: unknown, champ: string): string {
  if (valeur === undefined || valeur === null || valeur === '') throw new RequeteInvalide(`« ${champ} » est obligatoire.`)
  return typeof valeur === 'string' ? valeur : JSON.stringify(valeur)
}

function entier(valeur: unknown, champ: string): string {
  const n = Number(valeur)
  if (!Number.isInteger(n) || n <= 0) throw new RequeteInvalide(`« ${champ} » doit être un entier positif.`)
  return String(n)
}

function fichiers(valeur: unknown): Record<string, Fichier> {
  const sortie: Record<string, Fichier> = {}
  if (!valeur || typeof valeur !== 'object') return sortie
  for (const type of TYPES_FICHIERS) {
    const f = (valeur as Record<string, unknown>)[type] as Fichier | undefined
    if (f && typeof f.base64 === 'string' && f.base64.length > 0) {
      sortie[type] = { nom: f.nom || `${type}.pdf`, type: f.type || 'application/pdf', base64: f.base64 }
    }
  }
  return sortie
}

/** Ce que chaque action envoie à Tradeo. Rien d'autre ne peut partir. */
const ACTIONS: Record<string, (c: Corps) => { chemin: string; corps: CorpsTradeo }> = {
  creer_demande: (c) => ({
    chemin: 'creerDemandeDeCotationParApi/',
    corps: {
      format: 'multipart',
      champs: {
        compteurs: texteJson(c.compteurs, 'compteurs'),
        dataSociete: texteJson(c.dataSociete, 'dataSociete'),
        dataResponsable: texteJson(c.dataResponsable, 'dataResponsable'),
        ...fichiers(c.fichiers),
      },
    },
  }),
  ajouter_fichier: (c) => {
    const f = fichiers(c.fichiers)
    if (Object.keys(f).length === 0) throw new RequeteInvalide('Au moins un fichier est obligatoire.')
    return {
      chemin: 'ajouter-fichier-demande/',
      corps: { format: 'multipart', champs: { demande_id: entier(c.demande_id, 'demande_id'), ...f } },
    }
  },
  mes_demandes: (c) => ({
    chemin: 'mes-demandes-cotation/',
    corps: {
      format: 'multipart',
      champs: { dataTable: texteJson(c.dataTable, 'dataTable'), pageNumber: entier(c.pageNumber ?? 1, 'pageNumber') },
    },
  }),
  demander_validation: (c) => ({
    chemin: 'demander-pour-valider-demande-cotation/',
    corps: { format: 'multipart', champs: { id_demande: entier(c.id_demande, 'id_demande') } },
  }),
  compteurs_par_siret: (c) => {
    const siret = String(c.siret ?? '').replace(/\s/g, '')
    if (!/^\d{14}$/.test(siret)) throw new RequeteInvalide('Le SIRET doit contenir 14 chiffres.')
    const energie = c.energie === 'GAZ' ? 'gaz' : c.energie === 'ELEC' ? 'elec' : null
    if (!energie) throw new RequeteInvalide('« energie » vaut ELEC ou GAZ.')
    return { chemin: `compteurs-${energie}-by-siret/`, corps: { format: 'multipart', champs: { siret } } }
  },
  consommation: (c) => ({
    chemin: 'consommation-multiple/',
    corps: { format: 'multipart', champs: { compteurData: texteJson(c.compteurData, 'compteurData') } },
  }),
  calculer: (c) => ({
    chemin: 'calculer-budget-energie/',
    corps: { format: 'multipart', champs: { compteur: texteJson(c.compteur, 'compteur') } },
  }),
  mes_demandes_offre: (c) => ({
    chemin: 'mes-demandes-offre-fournisseur/',
    corps: {
      format: 'json',
      donnees: { dataTable: c.dataTable ?? {}, pageNumber: Number(c.pageNumber ?? 1) },
    },
  }),
}

/** Le corps tel qu'il sera journalisé : les fichiers réduits à leur nom et leur taille. */
function pourJournal(corps: CorpsTradeo): unknown {
  if (corps.format === 'json') return corps.donnees
  if (corps.format === 'vide') return null
  const sortie: Record<string, unknown> = {}
  for (const [cle, valeur] of Object.entries(corps.champs)) {
    if (typeof valeur !== 'string') {
      sortie[cle] = { fichier: valeur.nom, octets: Math.round((valeur.base64.length * 3) / 4) }
      continue
    }
    try {
      sortie[cle] = JSON.parse(valeur)
    } catch {
      sortie[cle] = valeur
    }
  }
  return sortie
}

async function ouvreLeBanc(utilisateur: UtilisateurAuthentifie, res: VercelResponse): Promise<boolean> {
  const reponse = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/ouvre_banc_tradeo`, {
    method: 'POST',
    headers: {
      apikey: process.env.VITE_SUPABASE_ANON_KEY ?? '',
      Authorization: utilisateur.authHeader,
      'Content-Type': 'application/json',
    },
    body: '{}',
  }).catch(() => null)
  if (!reponse?.ok) {
    res.status(503).json({ ok: false, code: 'DROITS_INDISPONIBLES', message: 'Vérification des droits indisponible.' })
    return false
  }
  if ((await reponse.text()).trim() !== 'true') {
    /* 404 comme `exigerAcces` : dire « interdit » confirmerait que le banc existe. */
    res.status(404).json({ ok: false, code: 'INTROUVABLE', message: 'Introuvable.' })
    return false
  }
  return true
}

/**
 * Écrit l'appel au journal, AVEC LE JETON DE L'APPELANT : la policy vérifie qu'il ouvre le banc et
 * qu'il signe sa propre ligne. Un journal qui ne s'écrit pas ne doit pas faire échouer l'appel —
 * la réponse de Tradeo est déjà là, la perdre serait pire.
 */
async function journaliser(utilisateur: UtilisateurAuthentifie, ligne: Record<string, unknown>) {
  try {
    await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/appels_tradeo`, {
      method: 'POST',
      headers: {
        apikey: process.env.VITE_SUPABASE_ANON_KEY ?? '',
        Authorization: utilisateur.authHeader,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ profil_id: utilisateur.id, ...ligne }),
    })
  } catch {
    /* voir plus haut */
  }
}

const STATUT_PAR_CODE: Record<string, number> = {
  TRADEO_NON_CONFIGURE: 503,
  TRADEO_IDENTIFIANTS_REFUSES: 503,
  TRADEO_INJOIGNABLE: 502,
  TRADEO_DELAI_DEPASSE: 504,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, code: 'METHODE', message: 'POST uniquement.' })
    return
  }
  const utilisateur = await exigerSession(req, res)
  if (!utilisateur) return
  if (await refuserLesPartenaires(utilisateur, res)) return
  if (!(await ouvreLeBanc(utilisateur, res))) return

  const corps = (req.body ?? {}) as Corps
  const action = String(corps.action ?? '')

  if (action === 'etat') {
    const base = { url: urlTradeo(), configure: tradeoConfigure() }
    if (!base.configure) {
      res.status(200).json({ ok: false, ...base, code: 'TRADEO_NON_CONFIGURE', message: 'Identifiants Tradeo absents du serveur.' })
      return
    }
    try {
      const jeton = await obtenirJeton()
      // Le préfixe et l'expiration suffisent à reconnaître le jeton ; le jeton lui-même ne sort pas.
      res.status(200).json({ ok: true, ...base, prefixe: jeton.prefixe, expiration: jeton.expiration })
    } catch (err) {
      const code = err instanceof ErreurTradeo ? err.code : 'TRADEO_INJOIGNABLE'
      res.status(200).json({ ok: false, ...base, code, message: err instanceof Error ? err.message : String(err) })
    }
    return
  }

  const construire = ACTIONS[action]
  if (!construire) {
    res.status(400).json({ ok: false, code: 'ACTION_INCONNUE', message: `Action inconnue : « ${action} ».`, actions: ['etat', ...Object.keys(ACTIONS)] })
    return
  }

  let appel: { chemin: string; corps: CorpsTradeo }
  try {
    appel = construire(corps)
  } catch (err) {
    if (err instanceof RequeteInvalide) {
      res.status(400).json({ ok: false, code: 'REQUETE_INVALIDE', message: err.message })
      return
    }
    throw err
  }

  try {
    const reponse = await appelerTradeo(appel.chemin, appel.corps)
    const resultat = (reponse.corps as { result?: unknown } | null)?.result
    const ok = reponse.statut >= 200 && reponse.statut < 300 && resultat !== false
    await journaliser(utilisateur, {
      action,
      chemin: appel.chemin,
      statut_http: reponse.statut,
      succes: ok,
      duree_ms: reponse.dureeMs,
      requete: pourJournal(appel.corps),
      reponse: reponse.corps,
    })
    res.status(200).json({ ok, statut_http: reponse.statut, duree_ms: reponse.dureeMs, reponse: reponse.corps })
  } catch (err) {
    const code = err instanceof ErreurTradeo ? err.code : 'ERREUR_INTERNE'
    const message = err instanceof Error ? err.message : String(err)
    await journaliser(utilisateur, { action, chemin: appel.chemin, succes: false, requete: pourJournal(appel.corps), erreur: `${code} : ${message}` })
    res.status(STATUT_PAR_CODE[code] ?? 500).json({ ok: false, code, message })
  }
}
