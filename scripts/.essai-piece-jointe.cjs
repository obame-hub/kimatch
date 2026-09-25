/**
 * LA PIÈCE JOINTE PART-ELLE ENCORE, LE SEAU FERMÉ ?
 *
 * `api/gmail/send.ts` téléchargeait la pièce jointe par son URL publique. Le seau ne l'est plus :
 * ce chemin recevait « NoSuchBucket » et AUCUNE pièce jointe ne serait partie — une panne muette
 * pour les commerciaux qui envoient un mandat à signer.
 *
 * On refait donc exactement ce que fait le serveur : `storage.download()` avec la clé de service,
 * sur le chemin décodé. On ne lit pas le code, on télécharge.
 */
const fs = require('fs')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const MARQUEUR = '/storage/v1/object/public/documents/'

;(async () => {
  // Un mandat, c'est le cas qui compte : c'est ce qu'on envoie à signer.
  const docs = await (await fetch(
    U + '/rest/v1/documents?select=url,nom_fichier&url=not.is.null&limit=5', { headers: H })).json()

  console.log('')
  let ko = 0
  for (const d of docs) {
    if (!d.url || !d.url.includes(MARQUEUR)) {
      console.log('   passe   | ' + (d.nom_fichier || '?').slice(0, 52) + ' — hors du seau')
      continue
    }
    // EXACTEMENT ce que fait le serveur : le chemin est DÉCODÉ (un nom de fichier porte des
    // espaces et des accents, encodés dans l'URL ; `download` attend le chemin brut).
    const chemin = decodeURIComponent(d.url.slice(d.url.indexOf(MARQUEUR) + MARQUEUR.length))
    const r = await fetch(U + '/storage/v1/object/documents/' + encodeURI(chemin), {
      headers: { apikey: K, Authorization: 'Bearer ' + K },
    })
    const taille = r.ok ? (await r.arrayBuffer()).byteLength : 0
    if (!r.ok || taille === 0) ko++
    console.log('   ' + (r.ok && taille > 0 ? '  ok   ' : ' PANNE ') + ' | ' +
      (d.nom_fichier || '?').slice(0, 52).padEnd(52) + ' — HTTP ' + r.status +
      (taille ? '  ' + (taille / 1024).toFixed(0) + ' Ko' : ''))
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(ko === 0
    ? '  LES PIECES JOINTES PARTENT ENCORE'
    : '  *** ' + ko + ' FICHIER(S) INTROUVABLE(S) : LES MAILS PARTIRAIENT SANS ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(ko === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
