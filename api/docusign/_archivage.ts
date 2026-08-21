import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>

/** Nom de la ligne `documents` portant le mandat tel qu'il a ete ENVOYE a la signature. */
/**
 * L'OBJET QU'ON FAIT SIGNER. Le mandat, ou le contrat.
 *
 * Naoelle, 21/08/2026, en urgence : Michel ne pouvait pas envoyer un contrat a la signature, et pour
 * une raison simple -- rien ne le permettait. DocuSign n'etait branche que sur les mandats, sur toute
 * la chaine : l'envoi, l'archivage, le retour du webhook.
 */
export interface ObjetSigne {
  type: 'mandat' | 'contrat'
  id: string
}

export const NOM_ENVOYE = 'Mandat envoyé'
/** Nom de la ligne `documents` portant le mandat SIGNE. */
export const NOM_SIGNE = 'Mandat signé'

/**
 * Archivage des mandats DocuSign : la version envoyee d'abord, la version signee ensuite.
 *
 * Regle demandee par William : « a l'envoi on stocke la version envoyee ; a la signature, la
 * version signee ecrase la version envoyee ». Jusqu'au 16/08/2026 seule la seconde moitie
 * existait — le PDF signe etait bien archive, mais rien ne l'etait au moment de l'envoi. Si le
 * client ne signait jamais, il ne restait aucune trace de ce qu'on lui avait soumis.
 *
 * Le depot passe par la cle de service : le bucket « documents » n'accorde aucune ecriture aux
 * utilisateurs, et n'a pas a en accorder puisque c'est le serveur qui archive.
 */
export function clientAdmin(): Admin | null {
  const url = process.env.VITE_SUPABASE_URL
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !cle) return null
  return createClient(url, cle)
}

/** Rend un nom de fichier sur lequel on peut compter : pas d'accent, pas d'espace, pas de slash. */
function nomSur(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'document.pdf'
}

async function deposer(chemin: string, pdf: Uint8Array): Promise<string> {
  const url = process.env.VITE_SUPABASE_URL as string
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  // `x-upsert` : c'est lui qui permet a la version signee d'ecraser la version envoyee deposee
  // au meme chemin, plutot que d'empiler deux fichiers.
  const depot = await fetch(`${url}/storage/v1/object/documents/${chemin}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: pdf,
  })
  if (!depot.ok) throw new Error(`dépôt dans le stockage refusé (${depot.status})`)
  return `${url}/storage/v1/object/public/documents/${chemin}`
}

/**
 * Archive les documents tels qu'ils partent a la signature.
 *
 * Best-effort assume : si l'archivage echoue, l'enveloppe est deja partie et le mandat suit son
 * cours. On journalise, on ne fait pas echouer l'envoi pour autant.
 */
export async function archiverDocumentsEnvoyes(
  objet: ObjetSigne,
  compteNom: string,
  documents: { pdfBase64: string; fileName: string }[],
): Promise<void> {
  const admin = clientAdmin()
  if (!admin) return

  const contrat = objet.type === 'contrat'
  const codeType = contrat ? 'CONTRAT' : 'MANDAT'
  const { data: typeDoc } = await admin.from('types_documents').select('id').eq('code', codeType).maybeSingle()

  for (const [i, doc] of documents.entries()) {
    const pdf = Buffer.from(doc.pdfBase64, 'base64')
    if (!pdf.length) continue
    // Le chemin ne depend que du mandat et du rang du document : un renvoi ecrase la version
    // precedente au lieu d'accumuler des fichiers a chaque tentative.
    const nomFichier = `${contrat ? 'Contrat' : 'Mandat'}_envoye_${i + 1}_${nomSur(compteNom)}.pdf`
    const chemin = `${objet.type}s/${objet.id}/${nomFichier}`
    const url = await deposer(chemin, new Uint8Array(pdf))

    // Idempotent : renvoyer le mandat ne cree pas une seconde ligne pour le meme rang.
    const { data: existant } = await admin
      .from('documents')
      .select('id')
      .eq('entite_type', objet.type)
      .eq('entite_id', objet.id)
      .eq('nom_fichier', nomFichier)
      .maybeSingle()

    const ligne = {
      ...(typeDoc ? { type_document_id: typeDoc.id } : {}),
      nom: contrat ? 'Contrat envoyé' : NOM_ENVOYE,
      nom_fichier: nomFichier,
      url,
      mime_type: 'application/pdf',
      taille_octets: pdf.length,
      entite_type: objet.type,
      entite_id: objet.id,
    }
    if (existant) await admin.from('documents').update(ligne).eq('id', existant.id)
    else await admin.from('documents').insert(ligne)
  }
}

/**
 * Retire les lignes « Mandat envoyé » d'un mandat, une fois la version signée archivée.
 *
 * C'est la seconde moitié de la règle : la version signée remplace la version envoyée, elle ne
 * vient pas s'ajouter à côté. Les fichiers eux-mêmes sont supprimés du stockage, sans quoi le
 * bucket garderait des PDF que plus aucune ligne ne référence.
 */
export async function retirerDocumentsEnvoyes(admin: Admin, mandatId: string): Promise<void> {
  const { data: envoyes } = await admin
    .from('documents')
    .select('id, url')
    .eq('entite_type', 'mandat')
    .eq('entite_id', mandatId)
    .eq('nom', NOM_ENVOYE)

  if (!envoyes?.length) return

  const url = process.env.VITE_SUPABASE_URL as string
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  const prefixe = `${url}/storage/v1/object/public/documents/`

  for (const doc of envoyes as { id: string; url: string | null }[]) {
    if (doc.url?.startsWith(prefixe)) {
      const chemin = doc.url.slice(prefixe.length)
      await fetch(`${url}/storage/v1/object/documents/${chemin}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${cle}` },
      }).catch(() => { /* le fichier a pu disparaitre autrement : la ligne part quand meme */ })
    }
    await admin.from('documents').delete().eq('id', doc.id)
  }
}
