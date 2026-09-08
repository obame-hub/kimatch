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
/* `NOM_SIGNE` a disparu le 08/09/2026 avec le PDF combiné : il n'y a plus UNE ligne « Mandat
   signé », mais une par pièce de l'enveloppe, nommée d'après le document lui-même. Garder une
   constante qui ne décrit plus rien aurait fait chercher ce qu'elle désigne. */

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
 * ══ CHAQUE DOCUMENT SIGNÉ REVIENT DANS SON PROPRE PDF ══
 *
 * William, 08/09/2026 : « il faudrait que ce soit des PDF distincts et non combinés qui soient
 * récupérés. Exemple : je fais signer le mandat Kiwee + mandat Energix, alors je dois récupérer
 * 3 PDF : mandat Kiwee signé, mandat Energix signé et certificat de signature. »
 *
 * ── CE QUI SE PASSAIT ──
 *
 * L'archivage appelait `/envelopes/{id}/documents/combined`. Ce point d'entrée DocuSign fait
 * exactement ce que son nom dit : il fusionne tous les documents de l'enveloppe, certificat compris,
 * en un seul fichier. On déposait donc un unique « Mandat signé » de plusieurs dizaines de pages,
 * dans lequel il fallait chercher lequel des deux mandats on voulait relire — et d'où l'on ne
 * pouvait plus extraire une pièce pour l'envoyer à un fournisseur.
 *
 * Le côté ENVOI, lui, archivait déjà les documents un par un (`Mandat_envoye_1`, `_2`…). Seul le
 * retour les écrasait ensemble.
 *
 * ── CE QUE RENVOIE DOCUSIGN ──
 *
 * `GET /envelopes/{id}/documents` liste les pièces avec leur `documentId` et leur `name`. Trois
 * natures s'y mêlent :
 *
 *   type « content »    les documents qu'on a fait signer, un par fichier envoyé
 *   type « summary »    le certificat de signature, `documentId` valant « certificate »
 *   autres              images de signature, pièces jointes du signataire — pas des documents
 *
 * On prend les deux premières et on écarte le reste : une image de paraphe déposée à côté du mandat
 * ferait une ligne de plus dans la fiche sans rien apprendre à personne.
 *
 * ── LES NOMS VIENNENT DE DOCUSIGN, PAS D'UN COMPTEUR ──
 *
 * « Mandat Kiwee signé » et « Mandat Energix signé » ne se distinguent que par le nom que porte le
 * document dans l'enveloppe. Un rang numérique (`_1`, `_2`) obligerait à ouvrir les deux pour
 * savoir lequel est lequel — c'est le défaut qu'on est en train de corriger, en plus petit.
 */
interface DocumentEnveloppe {
  documentId: string
  nom: string
  certificat: boolean
}

async function listerDocuments(
  session: { base_uri: string; account_id: string; access_token: string },
  envelopeId: string,
): Promise<DocumentEnveloppe[]> {
  const res = await fetch(
    `${session.base_uri}/restapi/v2.1/accounts/${session.account_id}/envelopes/${envelopeId}/documents`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  )
  if (!res.ok) throw new Error(`liste des documents refusée (${res.status})`)
  const corps = (await res.json()) as {
    envelopeDocuments?: { documentId?: string; name?: string; type?: string }[]
  }
  const documents = corps.envelopeDocuments ?? []
  return documents
    .filter((d) => d.documentId && (d.type === 'content' || d.type === 'summary'))
    .map((d) => ({
      documentId: d.documentId as string,
      nom: d.name?.trim() || `Document ${d.documentId}`,
      certificat: d.type === 'summary',
    }))
}

async function telechargerDocument(
  session: { base_uri: string; account_id: string; access_token: string },
  envelopeId: string,
  documentId: string,
): Promise<Uint8Array> {
  const res = await fetch(
    `${session.base_uri}/restapi/v2.1/accounts/${session.account_id}/envelopes/${envelopeId}/documents/${documentId}`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  )
  if (!res.ok) throw new Error(`téléchargement du document ${documentId} refusé (${res.status})`)
  const pdf = new Uint8Array(await res.arrayBuffer())
  if (!pdf.length) throw new Error(`document ${documentId} vide`)
  return pdf
}

/**
 * Archive les pièces signées d'une enveloppe, une ligne `documents` par PDF.
 *
 * IDEMPOTENT PAR NOM DE FICHIER, et c'est nécessaire : DocuSign rejoue ses notifications, et le
 * script de rattrapage repasse sur les enveloppes manquées. On met à jour la ligne existante plutôt
 * que d'en empiler une seconde — même règle que du côté envoi.
 *
 * Rend le nombre de pièces archivées, pour que l'appelant puisse le journaliser.
 */
export async function archiverDocumentsSignes(
  admin: Admin,
  session: { base_uri: string; account_id: string; access_token: string },
  envelopeId: string,
  objet: ObjetSigne,
  compteNom: string,
): Promise<number> {
  const contrat = objet.type === 'contrat'
  const documents = await listerDocuments(session, envelopeId)
  if (documents.length === 0) throw new Error('enveloppe sans document exploitable')

  const { data: typeDoc } = await admin
    .from('types_documents')
    .select('id')
    .eq('code', contrat ? 'CONTRAT' : 'MANDAT')
    .maybeSingle()

  let archives = 0
  for (const doc of documents) {
    const pdf = await telechargerDocument(session, envelopeId, doc.documentId)

    // Le certificat n'est pas un mandat : il porte son propre nom, celui que William emploie.
    const libelle = doc.certificat ? 'Certificat de signature' : `${doc.nom} — signé`
    const nomFichier = `${nomSur(doc.certificat ? `Certificat_signature_${compteNom}` : `${doc.nom}_signe`)}.pdf`
    const chemin = `${objet.type}s/${objet.id}/${nomFichier}`
    const url = await deposer(chemin, pdf)

    const { data: existant } = await admin
      .from('documents')
      .select('id')
      .eq('entite_type', objet.type)
      .eq('entite_id', objet.id)
      .eq('nom_fichier', nomFichier)
      .maybeSingle()

    const ligne = {
      ...(typeDoc ? { type_document_id: typeDoc.id } : {}),
      nom: libelle,
      nom_fichier: nomFichier,
      url,
      mime_type: 'application/pdf',
      taille_octets: pdf.length,
      entite_type: objet.type,
      entite_id: objet.id,
    }
    if (existant) await admin.from('documents').update(ligne).eq('id', existant.id)
    else await admin.from('documents').insert(ligne)
    archives += 1
  }
  return archives
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
