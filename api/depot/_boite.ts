import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cleService, urlSupabase } from '../_cleService.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE PARTAGENT LES TROIS POINTS D'ENTRÉE DE LA BOÎTE DE DÉPÔT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 23/09/2026 : un lien unique dans le mail de demande de facture, qui ouvre une boîte où
 * le client dépose ses PDF.
 *
 * ══ LE CLIENT N'EST PAS AUTHENTIFIÉ, ET CE N'EST PAS UN OUBLI ══
 *
 * Lui demander un compte pour envoyer un PDF ferait perdre la facture, pas gagner une identité. Le
 * JETON est donc l'autorisation — et tout ce fichier existe pour que ce jeton soit la SEULE chose
 * qu'on accepte de lui.
 *
 * Aucune politique RLS n'ouvre ces tables au public : la clé de service vit ici, côté serveur, et
 * chaque requête part avec le jeton déjà vérifié. Exposer la table en lecture anonyme aurait rendu
 * le jeton devinable ligne par ligne.
 *
 * ══ LES TROIS LIMITES SONT DES DÉCISIONS, PAS DES CHIFFRES RONDS ══
 *
 * DIX FICHIERS : une copropriété a rarement plus de deux ou trois contrats d'énergie, et chacun
 * tient en une facture. Dix laisse de la marge à un syndic qui envoie tout son parc d'un coup, et
 * arrête net une boucle de téléversement.
 *
 * QUINZE MÉGAOCTETS PAR FICHIER : une facture scannée en PDF pèse entre 100 Ko et 3 Mo ; une photo
 * de téléphone, 2 à 8 Mo. Quinze couvre le cas du scan A4 en couleur sans permettre d'y déposer une
 * vidéo.
 *
 * QUATRE TYPES : PDF, JPEG, PNG, HEIC. Les trois premiers sont ce que produisent les scanners et
 * les téléphones ; HEIC parce qu'un iPhone le produit par défaut et que le refuser ferait échouer
 * un dépôt sur deux sans que le client comprenne pourquoi.
 */

export const MAX_FICHIERS = 10
export const MAX_OCTETS = 15 * 1024 * 1024
export const TYPES_ACCEPTES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
] as const

export const SEAU = 'depots'

export interface Boite {
  id: string
  jeton: string
  piste_id: string | null
  opportunite_id: string | null
  contact_id: string | null
  compte_id: string | null
  destinataire_profil_id: string | null
  expire_le: string
  ouvert_le: string | null
  depose_le: string | null
  actif: boolean
}

/** Le client serveur, avec la clé qui voit tout. Jamais exporté vers le navigateur. */
export function admin(): SupabaseClient | null {
  const url = urlSupabase()
  const cle = cleService()
  if (!url || !cle) return null
  return createClient(url, cle, { auth: { persistSession: false } })
}

/**
 * Retrouve une boîte à partir de son jeton, et dit POURQUOI elle est refusée.
 *
 * LES TROIS REFUS SE DISTINGUENT à l'écran : un lien inconnu, un lien périmé et un dépôt déjà fait
 * n'appellent pas la même réaction du client. Le confondre en « lien invalide » le ferait renoncer
 * là où il aurait suffi de lui dire « vous avez déjà envoyé vos factures le 12 ».
 */
export type RefusBoite = 'INCONNU' | 'EXPIRE' | 'DEJA_DEPOSE'

export async function lireBoite(
  db: SupabaseClient,
  jeton: unknown,
): Promise<{ boite: Boite } | { refus: RefusBoite }> {
  /* LE JETON EST VÉRIFIÉ AVANT D'ÊTRE ENVOYÉ À LA BASE : 43 caractères de base64url et rien
     d'autre. C'est ce qui évite qu'une chaîne fantaisiste parte en requête, et ça coûte une ligne. */
  if (typeof jeton !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(jeton)) return { refus: 'INCONNU' }

  const { data } = await db
    .from('depots_factures')
    .select('id, jeton, piste_id, opportunite_id, contact_id, compte_id, destinataire_profil_id, expire_le, ouvert_le, depose_le, actif')
    .eq('jeton', jeton)
    .maybeSingle()

  const boite = data as Boite | null
  if (!boite || !boite.actif) return { refus: 'INCONNU' }
  if (boite.depose_le) return { refus: 'DEJA_DEPOSE' }
  if (new Date(boite.expire_le).getTime() < Date.now()) return { refus: 'EXPIRE' }
  return { boite }
}

/** Le nom de la société, pour que le client reconnaisse sa propre boîte. Rien de plus. */
export async function societeDeLaBoite(db: SupabaseClient, boite: Boite): Promise<string | null> {
  if (boite.compte_id) {
    const { data } = await db.from('comptes').select('nom').eq('id', boite.compte_id).maybeSingle()
    const nom = (data as { nom: string } | null)?.nom
    if (nom) return nom
  }
  if (boite.piste_id) {
    const { data } = await db.from('pistes').select('societe').eq('id', boite.piste_id).maybeSingle()
    return (data as { societe: string | null } | null)?.societe ?? null
  }
  return null
}
