// ════════════════════════════════════════════════════════════════════════════════════════════════
// LES PIÈCES JOINTES D'UN MAIL — DÉPOSÉES À LA SÉLECTION, ENVOYÉES PAR ADRESSE
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// William, 14/09/2026 : « dans l'envoi de mail depuis Kimatch, il faut absolument avoir la
// possibilité d'ajouter une ou plusieurs pièces jointes ».
//
// ══ POURQUOI LE FICHIER PART AVANT LE MAIL ══
//
// Le faire transiter en base64 dans le corps de la requête d'envoi était plus court d'une centaine
// de lignes, et aurait cassé une fois sur vingt : une fonction Vercel refuse au-delà de 4,5 Mo de
// corps, soit environ 3,3 Mo de fichier réel une fois l'inflation du base64 déduite. Or sur les
// 19 509 documents de la base, LE 95ᵉ CENTILE PÈSE 3,7 Mo et 1 062 dépassent 3 Mo (mesuré le
// 14/09/2026). L'échec serait tombé au moment de l'envoi, après la rédaction.
//
// Le fichier est donc déposé dès qu'on le choisit, et le volet n'en garde que l'adresse. Effet de
// bord heureux : le téléversement occupe le temps pendant lequel on écrit, au lieu de s'ajouter à
// l'attente au moment d'envoyer.
//
// ══ IL VIT DANS `emails/`, ET IL EN REPART ══
//
// Le seau `documents` est PUBLIC. Un fichier qu'on y laisse reste lisible par quiconque connaît
// l'adresse, indéfiniment. Ceux-là sont transitoires : `api/gmail/send.ts` les efface après un
// envoi réussi, et le préfixe `emails/` est ce qui permet de les distinguer des documents de fiche,
// qui eux ont leur propre vie. Retirer une pièce jointe avant l'envoi l'efface aussi.
// ════════════════════════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase'
import type { PieceJointe } from '@/lib/data/signatureEmail'

/** La limite de Gmail, message compris. Annoncée ici pour que l'écran la dise avant l'envoi. */
export const LIMITE_PIECES_JOINTES = 25 * 1024 * 1024

export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
}

/**
 * Un nom de fichier sûr pour un chemin de stockage.
 *
 * LE NOM AFFICHÉ N'EST PAS LE NOM STOCKÉ. « Mandat Kiwee — Résidence Béranger (2).pdf » contient
 * des espaces, un tiret cadratin et des parenthèses que le stockage accepte mal ; le nom d'origine
 * est conservé à part et c'est lui qui arrivera dans la boîte du destinataire.
 */
function cheminSur(nom: string): string {
  const sansAccents = nom.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return sansAccents.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'fichier'
}

/**
 * Dépose un fichier et rend de quoi le joindre.
 *
 * @param profilId Le dossier du dépôt, pour qu'un nettoyage manuel reste lisible.
 */
export async function deposerPieceJointe(fichier: File, profilId: string): Promise<PieceJointe> {
  if (fichier.size > LIMITE_PIECES_JOINTES) {
    throw new Error(
      `« ${fichier.name} » pèse ${formaterTaille(fichier.size)} — au-delà des 25 Mo que Gmail accepte.`,
    )
  }

  // `crypto.randomUUID` plutôt que l'horodatage seul : deux fichiers choisis dans la même
  // milliseconde — ce que fait un choix multiple — se écraseraient l'un l'autre.
  const chemin = `emails/${profilId}/${crypto.randomUUID()}/${cheminSur(fichier.name)}`

  const { error } = await supabase.storage
    .from('documents')
    .upload(chemin, fichier, { contentType: fichier.type || undefined, upsert: false })
  if (error) {
    throw new Error(`« ${fichier.name} » n’a pas pu être joint : ${error.message}`)
  }

  const { data } = supabase.storage.from('documents').getPublicUrl(chemin)
  return {
    nom: fichier.name,
    url: data.publicUrl,
    type: fichier.type || 'application/octet-stream',
    taille: fichier.size,
  }
}

/**
 * Retire un fichier déposé mais jamais envoyé.
 *
 * Sans effet visible en cas d'échec : la pièce disparaît de l'écran de toute façon, et insister sur
 * un fichier orphelin ferait porter à l'utilisateur un problème qui n'est pas le sien.
 */
export async function retirerPieceJointe(piece: PieceJointe): Promise<void> {
  const marqueur = '/storage/v1/object/public/documents/'
  const i = piece.url.indexOf(marqueur)
  if (i < 0) return
  const chemin = piece.url.slice(i + marqueur.length)
  if (!chemin.startsWith('emails/')) return
  try {
    await supabase.storage.from('documents').remove([chemin])
  } catch {
    /* sans conséquence */
  }
}
