/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI UNE CONNEXION EST-ELLE REFUSÉE ?
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 26/09/2026 : « j'ai ajouté mon adresse perso à la liste autorisée SANS COMPTE
 * PARTENAIRE et j'ai essayé de m'envoyer un lien de connexion, ça ne fonctionne pas et c'est
 * normal mais vérifie que c'est bien grâce à notre sécurité ».
 *
 * La question est juste, et la réponse ne se devine pas : « ça ne marche pas » peut venir
 *
 *   · de notre garde `handle_new_user` (l'adresse n'est pas autorisée)      -> sécurité
 *   · du garde partenaire (autorisée mais sans contact rattaché)            -> sécurité
 *   · d'un quota de mails Supabase, d'un spam, d'une URL de retour          -> PANNE
 *
 * Les trois se ressemblent vues de la boîte mail. On les distingue ici en reproduisant le geste
 * sur des adresses jetables, et en LISANT ce que la base répond.
 *
 * TOUT EST EFFACÉ À LA FIN, y compris en cas d'échec.
 */
const fs = require('fs')
const { Client } = require('pg')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
const db = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

const a = (chemin, meth, corps) =>
  fetch(U + '/rest/v1/' + chemin, {
    method: meth || 'GET',
    headers: Object.assign({}, H, { Prefer: 'return=representation' }),
    body: corps ? JSON.stringify(corps) : undefined,
  })

/** On tente de créer l'utilisateur, exactement comme le fait une première connexion. */
async function tenterConnexion(email) {
  const r = await fetch(U + '/auth/v1/admin/users', {
    method: 'POST', headers: H,
    body: JSON.stringify({ email, email_confirm: true }),
  })
  const t = await r.text()
  let j = null
  try { j = JSON.parse(t) } catch { /* pas du JSON */ }
  return { statut: r.status, id: j && j.id, message: (j && (j.msg || j.message || j.error_description)) || t.slice(0, 180) }
}

;(async () => {
  await db.connect()
  const cree = {}
  const jetables = []

  try {
    console.log('')
    console.log('══ ① UNE ADRESSE QUI N EST PAS DANS LA LISTE ══')
    const inconnue = 'zzz.inconnue@kiwee-energie.invalid'
    jetables.push(inconnue)
    let r = await tenterConnexion(inconnue)
    console.log('   ' + inconnue)
    console.log('   -> HTTP ' + r.statut + '  ' + r.message.slice(0, 150))
    console.log('   ' + (r.statut >= 400 ? 'REFUSEE' : '*** ACCEPTEE ***'))

    console.log('')
    console.log('══ ② UNE ADRESSE AUTORISEE, SANS CONTACT — VOTRE CAS EXACT ══')
    const autorisee = 'zzz.autorisee@kiwee-energie.invalid'
    jetables.push(autorisee)
    const rp = (await (await a('roles_acces?code=eq.PARTENAIRE&select=id')).json())[0].id
    cree.acc = (await (await a('profils_autorises', 'POST', {
      email: autorisee, prenom: 'Z', nom: 'AUTORISEE', role_acces_id: rp,
    })).json())[0].id
    console.log('   ' + autorisee + '  (role PARTENAIRE, contact_id null)')
    r = await tenterConnexion(autorisee)
    console.log('   -> HTTP ' + r.statut + '  ' + r.message.slice(0, 150))
    if (r.id) cree.user = r.id

    if (r.statut < 400) {
      // Elle est passée : que voit-elle ?
      const p = (await (await a('profils?id=eq.' + r.id + '&select=email,compte_partenaire_id')).json())[0]
      console.log('   profil cree, rattache a : ' + (p && p.compte_partenaire_id ? p.compte_partenaire_id : 'RIEN'))

      await db.query('begin')
      try {
        await db.query(
          "select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)",
          [r.id])
        await db.query('set local role authenticated')
        const ep = (await db.query('select public.est_partenaire() e')).rows[0].e
        const comptes = (await db.query('select count(*) n from comptes')).rows[0].n
        const contacts = (await db.query('select count(*) n from contacts')).rows[0].n
        const docs = (await db.query('select count(*) n from documents')).rows[0].n
        await db.query('reset role')
        console.log('')
        console.log('   CE QU ELLE VERRAIT EN SE CONNECTANT :')
        console.log('      est_partenaire() : ' + ep)
        console.log('      comptes   : ' + comptes)
        console.log('      contacts  : ' + contacts)
        console.log('      documents : ' + docs)
      } finally {
        await db.query('rollback')
      }
    }

    console.log('')
    console.log('══ ③ LA MEME, AVEC UN CONTACT DE PARTENAIRE ══')
    const TP = (await (await a('types_comptes?code=eq.PARTENAIRE&select=id')).json())[0].id
    cree.part = (await (await a('comptes', 'POST', {
      nom: 'ZZZ DIAG CX', type_compte_id: TP, type_compte: 'partenaire', actif: true,
    })).json())[0].id
    const liee = 'zzz.liee@kiwee-energie.invalid'
    jetables.push(liee)
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'LIEE', prenom: 'Z', email: liee, compte_id: cree.part, actif: true,
    })).json())[0].id
    cree.acc2 = (await (await a('profils_autorises', 'POST', {
      email: liee, prenom: 'Z', nom: 'LIEE', contact_id: cree.ct, role_acces_id: rp,
    })).json())[0].id

    r = await tenterConnexion(liee)
    console.log('   ' + liee + '  (contact du compte ZZZ DIAG CX)')
    console.log('   -> HTTP ' + r.statut + '  ' + r.message.slice(0, 120))
    if (r.id) {
      cree.user2 = r.id
      const p = (await (await a('profils?id=eq.' + r.id + '&select=compte_partenaire_id')).json())[0]
      console.log('   rattache a : ' + (p && p.compte_partenaire_id === cree.part ? 'son compte partenaire' : (p && p.compte_partenaire_id) || 'RIEN'))
    }

    console.log('')
    console.log('══ ④ L ENVOI DU MAIL LUI-MEME ══')
    //
    // Distinguer « la base refuse » de « le mail n'est jamais parti » : le second se verrait
    // pareil dans la boite de reception, et n'aurait rien d'une securite.
    const envoi = await fetch(U + '/auth/v1/otp', {
      method: 'POST',
      headers: { apikey: env('VITE_SUPABASE_ANON_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'zzz.envoi@kiwee-energie.invalid', create_user: true }),
    })
    const texte = (await envoi.text()).slice(0, 200)
    console.log('   POST /auth/v1/otp sur une adresse inconnue')
    console.log('   -> HTTP ' + envoi.status + '  ' + texte)
  } finally {
    // ── LE MÉNAGE ──
    for (const k of ['user', 'user2']) {
      if (cree[k]) {
        await a('profils_roles_acces?profil_id=eq.' + cree[k], 'DELETE')
        await a('historiques_entites?auteur_profil_id=eq.' + cree[k], 'DELETE')
        await a('profils?id=eq.' + cree[k], 'DELETE')
        await fetch(U + '/auth/v1/admin/users/' + cree[k], {
          method: 'DELETE', headers: { apikey: K, Authorization: 'Bearer ' + K },
        })
      }
    }
    for (const e of jetables) {
      await a('profils_autorises?email=eq.' + e, 'DELETE')
      await a('contacts?email=eq.' + e, 'DELETE')
    }
    if (cree.part) await a('comptes?id=eq.' + cree.part, 'DELETE')
    await a('comptes?nom=like.ZZZ DIAG CX*', 'DELETE')

    const reste = (await db.query(
      "select count(*) n from auth.users where email like 'zzz.%@kiwee-energie.invalid'")).rows[0].n
    console.log('')
    console.log('   nettoyage : ' + (Number(reste) === 0 ? 'tout est efface' : '*** ' + reste + ' restant(s) ***'))
    await db.end()
  }
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
