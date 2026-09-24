/**
 * « PLUS TARD » : OU L'APPEL ATTERRIT-IL ?
 *
 * Naoelle, 24/09/2026 : « si le commercial ne fait pas de choix et met plus tard, que se passe-t-il ? »
 *
 * La reponse ne vaut que si on la VOIT. On fabrique un appel, on ouvre la modale, on clique
 * « Plus tard », puis on va regarder la vue d'ensemble : l'appel doit etre dans « Appels a
 * rattacher », et n'etre rattache a rien.
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5183'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const CONTACT = '4c59b72e-7a69-42af-bf1d-dc2512ce32e4', COMPTE = 'a05fa38d-8de9-4643-b8b4-c3a7cb4ac01b'

;(async () => {
  const t = await (await fetch(U + '/rest/v1/types_interactions?select=id&code=eq.APPEL', { headers: H })).json()
  const r = await fetch(U + '/rest/v1/interactions', { method:'POST', headers:{...H, Prefer:'return=representation'},
    body: JSON.stringify({ type_interaction_id: t[0].id, date_interaction: new Date().toISOString(),
      objet: 'zzz essai plus tard', sens: 'SORTANT',
      auteur_profil_id: '14483439-27d3-4e48-b0db-b074b4fe2f4a', contact_id: CONTACT, compte_id: COMPTE }) })
  const cree = (await r.json())[0]
  console.log('appel fabrique :', cree.id.slice(0,8))

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 950 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE :', e.message))
  try {
    const lr = await fetch(U + '/auth/v1/admin/generate_link', { method:'POST', headers:H,
      body: JSON.stringify({ type:'magiclink', email: env('ADRESSE_CAPTURE'), options:{ redirect_to: BASE } }) })
    const corps = await lr.json().catch(()=>null)
    const lien = corps?.properties?.action_link ?? corps?.action_link
    if (!lien) throw new Error('pas de lien')
    await page.goto(lien, { waitUntil:'domcontentloaded', timeout:60000 }); await page.waitForTimeout(3000)
    const ref = new URL(U).hostname.split('.')[0], cs = 'sb-' + ref + '-auth-token'
    const sess = await page.evaluate((c) => localStorage.getItem(c), cs)
    await page.goto(BASE + '/', { waitUntil:'domcontentloaded' })
    await page.evaluate(([c,v]) => localStorage.setItem(c,v), [cs,sess])
    await page.goto(BASE + '/', { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(15000)
    fs.mkdirSync(SORTIE, { recursive:true })

    if (!(await page.locator('[role="dialog"][aria-modal="true"]').count())) {
      console.log('   la modale ne s est pas ouverte : essai sans objet'); return
    }
    console.log('1. modale ouverte')
    await page.getByRole('button', { name: 'Plus tard', exact: true }).click()
    await page.waitForTimeout(6000)
    console.log('2. « Plus tard » clique')

    // ── CE QUE LA BASE DIT ──
    const apres = await (await fetch(U + '/rest/v1/interactions?id=eq.' + cree.id +
      '&select=opportunite_id,recommandation_id,requete_id,piste_id,rattachement_ecarte_le', { headers: H })).json()
    const a = apres[0]
    const rattache = [a.opportunite_id, a.recommandation_id, a.requete_id, a.piste_id].some(Boolean)
    console.log('')
    console.log('   rattache a un objet ? ', rattache ? '*** OUI — on aurait invente un lien ***' : 'NON (correct)')
    console.log('   question ecartee ?    ', a.rattachement_ecarte_le ? 'oui — elle ne se reposera plus' : 'non')

    // ── CE QUE L ECRAN MONTRE ──
    await page.reload({ waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(12000)
    await page.screenshot({ path: path.join(SORTIE, 'plus-tard-vue-ensemble.png'), fullPage: true })
    const vu = await page.evaluate(() => {
      const t = document.body.innerText
      const i = t.toLowerCase().indexOf('rattacher')
      return i < 0 ? null : t.slice(Math.max(0, i - 60), i + 260).split(String.fromCharCode(10)).filter(Boolean).join(' | ')
    })
    console.log('')
    console.log('   sur la vue d ensemble :', vu || '*** aucun bloc « rattacher » ***')
  } finally {
    await nav.close()
    await fetch(U + '/rest/v1/interactions?id=eq.' + cree.id, { method:'DELETE', headers:H })
    console.log('appel fabrique : efface.')
  }
})().catch(e => { console.error('ECHEC :', e.message); process.exit(1) })
