import type { UtilisateurAuthentifie } from '../_auth.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE DROIT DE DEMANDER DES PRIX : UN MANDAT ACTIF
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 29/09/2026 : « on ne peut pas demander des prix si on n'a pas le droit ». Le mandat est
 * cette autorisation — c'est lui que Tradeo appelle ACD.
 *
 * LE CONTRÔLE EST ICI, ET PAS SEULEMENT À L'ÉCRAN. L'écran du banc grise les compteurs sans mandat,
 * mais une route qui ferait confiance à l'écran se contournerait d'un `curl`. On relit donc la vue
 * `v_compteurs_mandat_actif` — la seule définition de la règle — AVEC LE JETON DE L'APPELANT : les
 * policies répondent comme dans l'application.
 */

function entetes(utilisateur: UtilisateurAuthentifie) {
  return { apikey: process.env.VITE_SUPABASE_ANON_KEY ?? '', Authorization: utilisateur.authHeader }
}

export interface CouvertureMandat {
  numero_point: string
  mandat_reference: string | null
  document_id: string | null
}

/**
 * Les compteurs de la liste qu'un mandat actif couvre, par numéro de point. Un numéro absent de la
 * réponse n'est pas couvert. `null` si la base n'a pas répondu : dans le doute, on refuse.
 */
export async function couvertureMandats(utilisateur: UtilisateurAuthentifie, numeros: string[]): Promise<Map<string, CouvertureMandat> | null> {
  const propres = [...new Set(numeros.map((n) => n.replace(/\s/g, '')).filter(Boolean))]
  if (propres.length === 0) return new Map()
  const liste = propres.map((n) => `"${n.replace(/"/g, '')}"`).join(',')
  const r = await fetch(
    `${process.env.VITE_SUPABASE_URL}/rest/v1/v_compteurs_mandat_actif?select=numero_point,mandat_reference,document_id&numero_point=in.(${encodeURIComponent(liste)})`,
    { headers: entetes(utilisateur) },
  ).catch(() => null)
  if (!r?.ok) return null
  const lignes = (await r.json()) as CouvertureMandat[]
  return new Map(lignes.map((l) => [l.numero_point, l]))
}

/**
 * Le PDF d'un document Kimatch, lu pour être envoyé à Tradeo. La ligne se relit avec le jeton de
 * l'appelant : un document qu'il ne peut pas voir ne part pas.
 */
export async function chargerDocument(utilisateur: UtilisateurAuthentifie, documentId: string): Promise<{ nom: string; type: string; base64: string } | null> {
  const r = await fetch(
    `${process.env.VITE_SUPABASE_URL}/rest/v1/documents?select=url,nom_fichier,mime_type&id=eq.${encodeURIComponent(documentId)}&limit=1`,
    { headers: entetes(utilisateur) },
  ).catch(() => null)
  if (!r?.ok) return null
  const [doc] = (await r.json()) as { url: string | null; nom_fichier: string | null; mime_type: string | null }[]
  if (!doc?.url) return null
  /* LE BUCKET EST PRIVÉ (depuis le 25/09/2026, voir `urlOuvrableDocument`) : l'adresse enregistrée
     porte `/object/public/`, que Supabase refuse. On lit le même chemin par l'accès AUTHENTIFIÉ,
     avec le jeton de l'appelant — les policies du stockage décident, comme à l'écran. */
  const marqueur = '/storage/v1/object/public/documents/'
  const i = doc.url.indexOf(marqueur)
  const adresse = i < 0
    ? doc.url
    : `${process.env.VITE_SUPABASE_URL}/storage/v1/object/authenticated/documents/${doc.url.slice(i + marqueur.length)}`
  const fichier = await fetch(adresse, i < 0 ? undefined : { headers: entetes(utilisateur) }).catch(() => null)
  if (!fichier?.ok) return null
  const octets = Buffer.from(await fichier.arrayBuffer())
  return {
    nom: (doc.nom_fichier ?? 'ACD.pdf').replace(/\.pdf\.pdf$/i, '.pdf'),
    type: doc.mime_type || 'application/pdf',
    base64: octets.toString('base64'),
  }
}
