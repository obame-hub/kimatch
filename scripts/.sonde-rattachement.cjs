/* Rejouer DANS LE NAVIGATEUR, avec la session de Naoelle et donc les RLS, chacun des trois
   termes du garde. C'est la seule facon de distinguer "la requete ne rend rien a cause des RLS"
   de "le garde bloque". */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5183'
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }

;(async () => {
  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport:{width:1400,height:900} })
  page.on('pageerror', e => console.log('   ERREUR PAGE :', e.message))
  try {
    const adresse = env('ADRESSE_CAPTURE'), url = env('VITE_SUPABASE_URL')
    const cle = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
    const r = await fetch(`${url}/auth/v1/admin/generate_link`, { method:'POST',
      headers:{apikey:cle,Authorization:`Bearer ${cle}`,'Content-Type':'application/json'},
      body: JSON.stringify({type:'magiclink',email:adresse,options:{redirect_to:BASE}}) })
    const corps = await r.json().catch(()=>null)
    const lien = corps?.properties?.action_link ?? corps?.action_link
    if (!lien) throw new Error('pas de lien (' + r.status + ') : ' + JSON.stringify(corps).slice(0,300))
    await page.goto(lien,{waitUntil:'domcontentloaded',timeout:60000}); await page.waitForTimeout(3000)
    const ref = new URL(url).hostname.split('.')[0], cs = `sb-${ref}-auth-token`
    const sess = await page.evaluate(c => localStorage.getItem(c), cs)
    await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'})
    await page.evaluate(([c,v]) => localStorage.setItem(c,v), [cs,sess])
    await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(6000)

    const anon = env('VITE_SUPABASE_ANON_KEY') || env('VITE_SUPABASE_PUBLISHABLE_KEY')
    const res = await page.evaluate(async ({url, anon, cs}) => {
      const jeton = JSON.parse(localStorage.getItem(cs)).access_token
      const H = { apikey: anon, Authorization: 'Bearer ' + jeton }
      const get = async (c) => { const r = await fetch(url+'/rest/v1/'+c, {headers:H}); return { ok:r.ok, corps: await r.text() } }

      const out = {}
      // 1. mon profil (RLS)
      out.profil = await get('profils?select=id,email,email_allo&email=eq.n.ghouma@kiwee-energie.fr')
      // 2. le profil vise par l'adresse allo
      out.profilAllo = await get('profils?select=id&email=ilike.w.goupil@kiwee-energie.fr')
      // 3. la requete de la modale, telle quelle, SOUS RLS
      const il2h = new Date(Date.now()-2*3600*1000).toISOString()
      out.dernier = await get(`interactions?select=id,date_interaction,contact_id,compte_id,type:types_interactions!inner(code)&type.code=eq.APPEL&auteur_profil_id=eq.14483439-27d3-4e48-b0db-b074b4fe2f4a&opportunite_id=is.null&recommandation_id=is.null&requete_id=is.null&piste_id=is.null&date_interaction=gte.${il2h}&date_interaction=lte.${new Date().toISOString()}&order=date_interaction.desc&limit=1`)
      // 4. l'appel en cours, SOUS RLS
      out.appelEnCours = await get(`appels_en_cours?select=id,numero,contact_id,compte_id,demarre_le,termine_le,ecarte_le&user_email=eq.w.goupil@kiwee-energie.fr&termine_le=is.null&ecarte_le=is.null&order=demarre_le.desc&limit=1`)
      return out
    }, { url: env('VITE_SUPABASE_URL'), anon, cs })

    for (const [k,v] of Object.entries(res)) {
      console.log(`\n── ${k} ── ok=${v.ok}`)
      console.log('   ', v.corps.slice(0,500))
    }
    fs.mkdirSync('essai-rattachement',{recursive:true})
    await page.screenshot({ path:'essai-rattachement/sonde.png' })
  } finally { await nav.close() }
})().catch(e => { console.error('ECHEC:', e.message); process.exit(1) })
