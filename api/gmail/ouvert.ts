import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * ══ L'IMAGE D'UN PIXEL QUI DIT QU'UN MAIL A ÉTÉ OUVERT ══
 *
 * William, 14/09/2026 : « tracker quand ils lisent l'email, quand ils ouvrent nos emails ».
 *
 * Le corps des mails envoyés depuis Kimatch porte `<img src=".../api/gmail/ouvert?j=<jeton>">`.
 * Quand le client de messagerie affiche le message, il demande l'image. C'est le seul signal qui
 * existe : un mail ne prévient pas qu'on le lit.
 *
 * ══ CE POINT D'ENTRÉE EST PUBLIC, ET IL DOIT L'ÊTRE ══
 *
 * Aucune session : le client de messagerie du destinataire n'en a pas. La protection est le JETON,
 * un `uuid` tiré au hasard à l'envoi et propre à ce mail. Il ne se devine pas, et il ne désigne que
 * cet envoi-là — on ne peut ni fabriquer d'ouvertures sur un autre échange, ni remonter d'une
 * adresse à l'identifiant d'une interaction.
 *
 * ══ IL REND TOUJOURS UNE IMAGE, MÊME QUAND IL ÉCHOUE ══
 *
 * Un jeton inconnu, une base injoignable : on renvoie quand même le pixel, et 200. Répondre 404
 * ferait apparaître une image cassée DANS LE MAIL DU CLIENT — un carré gris au milieu du message
 * qu'on vient de lui écrire. Le suivi est pour nous ; il n'a pas à se voir chez lui.
 *
 * ══ CE QU'ON NE FAIT PAS ══
 *
 * On n'enregistre ni adresse IP, ni agent utilisateur. Gmail recopie les images sur ses serveurs :
 * l'IP serait celle de Google et n'apprendrait rien sur le destinataire, tout en constituant une
 * donnée personnelle de plus à garder. On compte les ouvertures et on retient deux dates.
 */

/** Un GIF transparent d'un pixel — 43 octets, la plus petite image valable qui existe. */
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

function repondreLePixel(res: VercelResponse) {
  res.setHeader('Content-Type', 'image/gif')
  res.setHeader('Content-Length', String(PIXEL.length))
  /* AUCUN CACHE, sinon la deuxième ouverture ne nous parviendrait jamais : le client afficherait
     l'image qu'il a gardée. `no-store` est le seul qui tienne devant les caches intermédiaires. */
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  res.setHeader('Pragma', 'no-cache')
  res.status(200).send(PIXEL)
}

const EST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const jeton = typeof req.query.j === 'string' ? req.query.j : ''

  /* ══ ON ÉCRIT D'ABORD, ON RÉPOND ENSUITE ══
     La tentation était de rendre l'image tout de suite et d'enregistrer après : le client attend
     son image, pas notre base. Mais une fonction Vercel peut être GELÉE dès la réponse envoyée —
     rien ne garantit que le travail entamé après `res.send()` se termine. Le suivi manquerait une
     ouverture sur deux, sans la moindre trace.

     L'écriture est une instruction sur une ligne trouvée par index unique : quelques dizaines de
     millisecondes, invisibles dans l'affichage d'un mail. Et si elle échoue, on rend l'image
     quand même — le `finally` s'en charge, parce que le suivi est pour nous et n'a pas à se voir
     chez le destinataire. */
  try {
    if (!EST_UUID.test(jeton)) return

    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !cle) return
    const admin = createClient(url, cle, { auth: { persistSession: false } })

    /* `coalesce` sur la première date : elle se pose une fois et ne bouge plus. L'écraser ferait
       perdre le délai entre l'envoi et la lecture, qui est précisément ce qu'on veut savoir.
       `clock_timestamp()` et non `now()` : voir la migration 20260914210000. */
    const { error } = await admin.rpc('fn_enregistrer_ouverture_mail', { p_jeton: jeton })
    if (error) console.warn('[ouvert] enregistrement refusé :', error.message)
  } catch (e) {
    console.warn('[ouvert] enregistrement impossible :', e instanceof Error ? e.message : e)
  } finally {
    repondreLePixel(res)
  }
}
