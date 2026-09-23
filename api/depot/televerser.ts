import type { VercelRequest, VercelResponse } from '@vercel/node'
import { admin, lireBoite, MAX_FICHIERS, MAX_OCTETS, TYPES_ACCEPTES, SEAU } from './_boite.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉPÔT D'UN FICHIER — UN PAR REQUÊTE, ET VÉRIFIÉ TROIS FOIS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══ UN FICHIER PAR REQUÊTE, PAS LE LOT ══
 *
 * Un syndic qui envoie six factures depuis une connexion de bureau d'agence coupe souvent au
 * milieu. Envoyer le lot en une fois perd les six ; les envoyer un par un en garde cinq, et la page
 * n'a qu'à reproposer le dernier. C'est aussi ce qui permet d'afficher une progression honnête.
 *
 * ══ LES TROIS VÉRIFICATIONS, DANS CET ORDRE ══
 *
 * 1. LE JETON — sans lui rien n'existe, et il est revérifié à chaque fichier : une boîte peut
 *    expirer entre le premier et le sixième.
 * 2. LE TYPE ET LA TAILLE — annoncés par le client, donc jamais crus sur parole : on mesure
 *    l'octet réel après décodage. Un `Content-Type` se falsifie, une longueur non.
 * 3. LE NOMBRE DÉJÀ DÉPOSÉ — compté en base, pas envoyé par la page. C'est la seule façon
 *    d'empêcher une boucle de téléversement de remplir le seau.
 *
 * ══ LE NOM DU FICHIER N'EST JAMAIS UN CHEMIN ══
 *
 * On ne range pas le fichier sous le nom que le client donne : « ../../secret.pdf » est un nom de
 * fichier valide pour un navigateur. Le chemin est construit à partir de l'identifiant de la boîte
 * et d'un identifiant tiré ici ; le nom d'origine n'est gardé que comme libellé, et c'est tout ce
 * qu'il mérite.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const db = admin()
  if (!db) {
    res.status(200).json({ ok: false, erreur: 'Dépôt indisponible pour le moment.' })
    return
  }

  const { jeton, nom, mediaType, contenuBase64 } = (req.body ?? {}) as {
    jeton?: string; nom?: string; mediaType?: string; contenuBase64?: string
  }

  const lu = await lireBoite(db, jeton)
  if ('refus' in lu) {
    res.status(200).json({ ok: false, refus: lu.refus })
    return
  }
  const boite = lu.boite

  if (typeof contenuBase64 !== 'string' || !contenuBase64) {
    res.status(200).json({ ok: false, erreur: 'Fichier vide.' })
    return
  }
  if (!TYPES_ACCEPTES.includes(mediaType as typeof TYPES_ACCEPTES[number])) {
    res.status(200).json({ ok: false, erreur: 'Format non accepté : envoyez un PDF, un JPEG ou un PNG.' })
    return
  }

  const octets = Buffer.from(contenuBase64, 'base64')
  if (octets.length === 0) {
    res.status(200).json({ ok: false, erreur: 'Fichier illisible.' })
    return
  }
  if (octets.length > MAX_OCTETS) {
    res.status(200).json({ ok: false, erreur: `Fichier trop lourd (${Math.round(octets.length / 1024 / 1024)} Mo). Maximum ${Math.round(MAX_OCTETS / 1024 / 1024)} Mo.` })
    return
  }

  const { count } = await db
    .from('depots_fichiers')
    .select('id', { count: 'exact', head: true })
    .eq('depot_id', boite.id)
  if ((count ?? 0) >= MAX_FICHIERS) {
    res.status(200).json({ ok: false, erreur: `Maximum ${MAX_FICHIERS} fichiers par envoi.` })
    return
  }

  /* LE NOM D'ORIGINE SERT D'ÉTIQUETTE, JAMAIS DE CHEMIN. On garde son extension parce qu'elle aide
     l'aperçu, et on l'écrête : un nom de 400 caractères existe et ne sert à rien. */
  const nomPropre = typeof nom === 'string' && nom.trim() ? nom.trim().slice(0, 180) : 'facture'
  const extension = (nomPropre.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? 'bin').toLowerCase()
  const chemin = `${boite.id}/${crypto.randomUUID()}.${extension}`

  const { error: erreurDepot } = await db.storage
    .from(SEAU)
    .upload(chemin, octets, { contentType: mediaType, upsert: false })
  if (erreurDepot) {
    res.status(200).json({ ok: false, erreur: `Le dépôt a échoué : ${erreurDepot.message}` })
    return
  }

  const { error } = await db.from('depots_fichiers').insert({
    depot_id: boite.id,
    nom_fichier: nomPropre,
    chemin,
    mime_type: mediaType,
    taille_octets: octets.length,
  })
  if (error) {
    /* LA LIGNE N'A PAS PU S'ÉCRIRE : on retire le fichier plutôt que de laisser un octet orphelin
       dans le seau, invisible de partout et impossible à retrouver. */
    await db.storage.from(SEAU).remove([chemin])
    res.status(200).json({ ok: false, erreur: error.message })
    return
  }

  res.status(200).json({ ok: true, nom: nomPropre, octets: octets.length, deposes: (count ?? 0) + 1 })
}
