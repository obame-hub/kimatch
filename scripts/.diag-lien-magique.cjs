/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI L'ÉQUIPE REÇOIT SES LIENS, ET PAS UNE ADRESSE NOUVELLE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 26/09/2026 : « je comprends pas, si le lien est disabled, comment ça se fait que nous
 * on en reçoit ».
 *
 * La question est juste : `signup_disabled` a l'air de fermer la porte à tout le monde, or les dix
 * personnes de KiWee se connectent tous les jours. Il y a donc une distinction quelque part, et
 * elle ne se devine pas — on la mesure.
 *
 * L'HYPOTHÈSE À VÉRIFIER : `signup` ne veut pas dire « envoyer un lien », il veut dire « CRÉER UN
 * COMPTE ». Un utilisateur qui existe déjà dans `auth.users` ne s'inscrit pas, il se reconnecte.
 *
 * On essaie donc les deux cas, sur de vraies adresses, et l'on regarde.
 */
const fs = require('fs')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const ANON = env('VITE_SUPABASE_ANON_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

/** Exactement ce que fait l'écran de connexion de Kimatch. */
async function demanderUnLien(email) {
  const r = await fetch(U + '/auth/v1/otp', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, options: { shouldCreateUser: true } }),
  })
  const t = await r.text()
  return { statut: r.status, texte: t.slice(0, 160) }
}

;(async () => {
  console.log('')
  console.log('══ ① UNE PERSONNE DE L EQUIPE, QUI A DEJA UN COMPTE ══')
  const connu = (await (await fetch(
    U + '/rest/v1/profils?email=like.*@kiwee-energie.fr&actif=eq.true&select=email&limit=1',
    { headers: H })).json())[0]
  const existe = (await (await fetch(
    U + '/rest/v1/rpc/zzz_inexistant', { method: 'POST', headers: H, body: '{}' })).status)
  let r = await demanderUnLien(connu.email)
  console.log('   ' + connu.email)
  console.log('   -> HTTP ' + r.statut + '  ' + (r.texte || '(vide)'))
  console.log('   ' + (r.statut < 400 ? 'LE LIEN PART' : 'refuse'))

  console.log('')
  console.log('══ ② UNE ADRESSE QUI N A PAS ENCORE DE COMPTE ══')
  r = await demanderUnLien('zzz.jamais.vue@kiwee-energie.invalid')
  console.log('   zzz.jamais.vue@kiwee-energie.invalid')
  console.log('   -> HTTP ' + r.statut + '  ' + r.texte)
  console.log('   ' + (r.statut < 400 ? '*** LE LIEN PART ***' : 'REFUSE'))

  console.log('')
  console.log('══ ③ ET L ADRESSE PERSO DE NAOELLE ? ══')
  //
  // Elle est dans `profils_autorises` mais n'a PAS d'utilisateur `auth.users` : c'est donc le
  // cas ②, pas le cas ①.
  const dansAuth = (await (await fetch(
    U + '/auth/v1/admin/users?per_page=1&filter=naoelle.ghouma',
    { headers: { apikey: K, Authorization: 'Bearer ' + K } })).json())
  const trouve = (dansAuth.users ?? []).some((u) => u.email === 'naoelle.ghouma@gmail.com')
  console.log('   a-t-elle un compte dans auth.users ? ' + (trouve ? 'OUI' : 'NON'))
  r = await demanderUnLien('naoelle.ghouma@gmail.com')
  console.log('   -> HTTP ' + r.statut + '  ' + r.texte)

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log('  CE QUE CELA VEUT DIRE')
  console.log('════════════════════════════════════════════════')
  console.log('')
  console.log('  `signup_disabled` ne bloque pas l ENVOI d un lien : il bloque la CREATION d un')
  console.log('  compte. Qui a deja son compte recoit son lien comme avant — c est le cas des dix')
  console.log('  personnes de KiWee. Une adresse nouvelle, elle, devrait etre creee : c est ce que')
  console.log('  le reglage refuse.')
  console.log('')
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
