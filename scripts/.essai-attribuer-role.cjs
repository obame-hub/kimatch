/**
 * ATTRIBUER UN ROLE A QUELQU'UN QUI N'EN A PAS.
 *
 * C'est le dernier geste de la page qui n'avait pas ete eprouve. Et c'est le plus delicat :
 * la mutation SUPPRIME puis INSERE, donc un echec entre les deux laisserait la personne sans
 * aucun role — sans droits, et sans que rien ne le signale.
 *
 * On fabrique un profil, on lui donne un role par l'ecran, on verifie en base, on efface.
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const MAIL = 'zzz.essai.role@kiwee-energie.invalid'

;(async () => {
  /* ON NE FABRIQUE PAS DE PROFIL : `profils.id` reference `auth.users`, donc il faudrait creer un
     vrai compte d'authentification en production pour un essai. On EMPRUNTE plutot le role d'un
     conseiller existant — on le retire, on le fait reattribuer par l'ecran, et on remet l'etat
     d'origine quoi qu'il arrive. */
  const cible = (await (await fetch(U + '/rest/v1/profils_roles_acces?select=profil_id,role_acces_id,' +
    'profil:profils(prenom,nom,actif),role_acces:roles_acces(code)', { headers: H })).json())
    .find((x) => x.role_acces?.code === 'CONSEILLER' && x.profil?.actif)
  if (!cible) { console.log('aucun conseiller actif : essai sans objet'); return }
  const id = cible.profil_id
  const roleOrigine = cible.role_acces_id
  const nomCible = (cible.profil.prenom + ' ' + cible.profil.nom).trim()
  console.log('on emprunte le role de :', nomCible, '(CONSEILLER)')
  await fetch(U + '/rest/v1/profils_roles_acces?profil_id=eq.' + id, { method: 'DELETE', headers: H })
  console.log('son role est retire : elle apparait maintenant « sans rôle »')

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE :', e.message))
  try {
    const lr = await fetch(U + '/auth/v1/admin/generate_link', { method:'POST', headers:H,
      body: JSON.stringify({ type:'magiclink', email: env('ADRESSE_CAPTURE'), options:{ redirect_to: BASE } }) })
    const corps = await lr.json().catch(()=>null)
    const lien = corps?.properties?.action_link ?? corps?.action_link
    if (!lien) throw new Error('pas de lien')
    await page.goto(lien, { waitUntil:'domcontentloaded', timeout:60000 }); await page.waitForTimeout(3000)
    const ref = new URL(U).hostname.split('.')[0], cs = 'sb-' + ref + '-auth-token'
    const sess = await page.evaluate((x) => localStorage.getItem(x), cs)
    await page.goto(BASE + '/', { waitUntil:'domcontentloaded' })
    await page.evaluate(([x,v]) => localStorage.setItem(x,v), [cs,sess])
    await page.goto(BASE + '/administration', { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(5000)
    await page.getByRole('button', { name: /Rôles & permissions/ }).click()
    await page.waitForTimeout(4000)
    fs.mkdirSync(SORTIE, { recursive:true })

    // Le bloc d'alerte doit signaler la personne sans role.
    const alerte = await page.getByText(/sans rôle/i).count()
    console.log('1. bloc « personne sans rôle » :', alerte ? 'affiche' : '*** absent ***')
    const vu = await page.getByText(nomCible).count()
    console.log('2. la personne y figure       :', vu ? 'oui' : '*** non ***')
    if (!vu) { await page.screenshot({ path: path.join(SORTIE, 'attribution-absente.png'), fullPage: true }); return }

    await page.screenshot({ path: path.join(SORTIE, 'attribution-1.png'), fullPage: true })

    // On lui donne « Conseiller » par le menu deroulant.
    const choix = page.locator('select').last()
    await choix.selectOption({ label: 'Conseiller' })
    await page.waitForTimeout(3500)

    const apres = await (await fetch(U + '/rest/v1/profils_roles_acces?profil_id=eq.' + id +
      '&select=role_acces:roles_acces(code)', { headers: H })).json()
    console.log('')
    console.log('3. ATTRIBUER :', apres.length === 1
      ? 'role « ' + apres[0].role_acces.code + ' » ecrit en base'
      : (apres.length === 0 ? '*** rien ecrit : la personne reste sans role ***' : '*** ' + apres.length + ' roles : doublon ***'))
    await page.screenshot({ path: path.join(SORTIE, 'attribution-2.png'), fullPage: true })
  } finally {
    await nav.close()
    /* ON REMET SON ROLE D'ORIGINE, quoi qu'il soit arrive plus haut : laisser quelqu'un sans role
       le priverait de tout acces sans qu'il comprenne pourquoi. */
    await fetch(U + '/rest/v1/profils_roles_acces?profil_id=eq.' + id, { method: 'DELETE', headers: H })
    await fetch(U + '/rest/v1/profils_roles_acces', { method: 'POST', headers: H,
      body: JSON.stringify({ profil_id: id, role_acces_id: roleOrigine }) })
    const remis = await (await fetch(U + '/rest/v1/profils_roles_acces?profil_id=eq.' + id +
      '&select=role_acces:roles_acces(code)', { headers: H })).json()
    console.log('')
    console.log('role de ' + nomCible + ' remis :', remis[0]?.role_acces?.code ?? '*** AUCUN — A CORRIGER ***')
  }
})().catch(e => { console.error('ECHEC :', e.message); process.exit(1) })
