import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes } from 'node:crypto'
import { exigerSession } from '../_auth.js'
import { admin } from './_boite.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * OUVRIR UNE BOÎTE, ET RENDRE SON LIEN
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Appelé par le Cockpit au moment où le commercial ouvre « Demander les factures » : le lien est
 * glissé dans le corps du mail avant qu'il ne l'écrive.
 *
 * ══ POURQUOI UN POINT D'ENTRÉE SERVEUR POUR CRÉER UNE LIGNE ══
 *
 * Le jeton ne doit pas venir du navigateur. `crypto.getRandomValues` y est solide, mais le jeton
 * est la SEULE clé d'accès à une boîte où atterriront des factures : le fabriquer côté serveur est
 * ce qui garantit qu'aucun écran, aucune extension et aucun journal de console ne l'a vu naître.
 *
 * 32 OCTETS EN BASE64URL, soit 43 caractères : de quoi rendre l'énumération sans objet, et assez
 * court pour survivre à un copier-coller dans un client mail qui coupe les lignes longues.
 *
 * ══ UNE BOÎTE VIVANTE EST RÉUTILISÉE ══
 *
 * Deux demandes de factures à trois jours d'écart ne doivent pas ouvrir deux boîtes : le client a
 * peut-être encore le premier mail sous les yeux, et les deux liens marcheraient en parallèle vers
 * deux dépôts distincts — dont un seul serait notifié. On rend donc la boîte existante tant qu'elle
 * n'a pas servi et qu'elle n'est pas périmée.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const utilisateur = await exigerSession(req, res)
  if (!utilisateur) return

  const db = admin()
  if (!db) {
    res.status(200).json({ ok: false, erreur: 'Service indisponible : clé serveur manquante.' })
    return
  }

  const { pisteId, opportuniteId, contactId, compteId, interactionId } = (req.body ?? {}) as {
    pisteId?: string | null; opportuniteId?: string | null
    contactId?: string | null; compteId?: string | null; interactionId?: string | null
  }
  if (!pisteId && !opportuniteId) {
    res.status(400).json({ error: 'Une piste ou une opportunité est requise.' })
    return
  }

  /* LE DESTINATAIRE EST LE PROPRIÉTAIRE DE L'ENREGISTREMENT, pas celui qui clique. Même règle que
     les tâches depuis le 22/09 : une facture arrive dans le portefeuille de quelqu'un, et ce
     quelqu'un n'est pas forcément celui qui passe l'appel ce jour-là. */
  const { data: cible } = opportuniteId
    ? await db.from('opportunites').select('proprietaire_id, compte_id, contact_id').eq('id', opportuniteId).maybeSingle()
    : await db.from('pistes').select('proprietaire_id, compte_id, contact_id').eq('id', pisteId as string).maybeSingle()
  const porteur = cible as { proprietaire_id: string | null; compte_id: string | null; contact_id: string | null } | null

  const existante = await db
    .from('depots_factures')
    .select('jeton')
    .eq(opportuniteId ? 'opportunite_id' : 'piste_id', (opportuniteId ?? pisteId) as string)
    .is('depose_le', null)
    .eq('actif', true)
    .gt('expire_le', new Date().toISOString())
    .order('date_creation', { ascending: false })
    .limit(1)
    .maybeSingle()

  const dejaLa = (existante.data as { jeton: string } | null)?.jeton
  if (dejaLa) {
    res.status(200).json({ ok: true, jeton: dejaLa, lien: lienDepuis(req, dejaLa), reutilise: true })
    return
  }

  const jeton = randomBytes(32).toString('base64url')
  const { error } = await db.from('depots_factures').insert({
    jeton,
    piste_id: pisteId ?? null,
    opportunite_id: opportuniteId ?? null,
    contact_id: contactId ?? porteur?.contact_id ?? null,
    compte_id: compteId ?? porteur?.compte_id ?? null,
    destinataire_profil_id: porteur?.proprietaire_id ?? null,
    cree_par_id: utilisateur.id,
    interaction_id: interactionId ?? null,
  })
  if (error) {
    res.status(200).json({ ok: false, erreur: error.message })
    return
  }

  res.status(200).json({ ok: true, jeton, lien: lienDepuis(req, jeton), reutilise: false })
}

/**
 * L'adresse publique du lien.
 *
 * ON LA DÉDUIT DE LA REQUÊTE plutôt que de la coder en dur : le même code sert en local, en
 * préproduction et en production, et un lien qui pointe vers le mauvais domaine dans un mail parti
 * chez un client ne se rattrape pas.
 */
function lienDepuis(req: VercelRequest, jeton: string): string {
  const hote = (req.headers['x-forwarded-host'] ?? req.headers.host) as string | undefined
  const protocole = (req.headers['x-forwarded-proto'] as string | undefined)
    ?? (hote?.startsWith('localhost') ? 'http' : 'https')
  return `${protocole}://${hote ?? 'kimatch.fr'}/depot/${jeton}`
}
