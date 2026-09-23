/**
 * ÉPROUVER LA MODALE DE RATTACHEMENT, SANS PERSONNE DEVANT L'ÉCRAN
 *
 * Naoëlle, 23/09/2026 : « la modale ne s'affiche toujours pas, fais les tests toi-même sur mon PC
 * et Kimatch et tout. »
 *
 * Ce script ouvre Kimatch avec sa session, attend le sondage, et dit ce qu'il voit — la modale, son
 * titre, ses bascules de catégorie et ses lignes. Il photographie aussi l'écran : c'est la seule
 * preuve qui vaille, le reste est de la déduction.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.BASE_CAPTURE || 'http://localhost:5182'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}

async function connecter(page) {
  const adresse = env('ADRESSE_CAPTURE')
  if (!adresse) throw new Error('ADRESSE_CAPTURE manquante dans .env.local')
  const url = env('VITE_SUPABASE_URL')
  const cle = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')

  const r = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: adresse, options: { redirect_to: BASE } }),
    signal: AbortSignal.timeout(25000),
  })
  const corps = await r.json().catch(() => null)
  const lien = corps?.properties?.action_link ?? corps?.action_link
  if (!lien) throw new Error('pas de lien : ' + JSON.stringify(corps).slice(0, 200))

  await page.goto(lien, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)

  const ref = new URL(url).hostname.split('.')[0]
  const cleSession = `sb-${ref}-auth-token`
  const session = await page.evaluate((c) => window.localStorage.getItem(c), cleSession)
  if (!session) throw new Error('pas de session — page : ' + page.url().slice(0, 120))

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(([c, v]) => window.localStorage.setItem(c, v), [cleSession, session])
  return adresse
}

async function observer(page, nom) {
  fs.mkdirSync(SORTIE, { recursive: true })
  await page.screenshot({ path: path.join(SORTIE, nom + '.png') })

  const vu = await page.evaluate(() => {
    const modale = document.querySelector('[role="dialog"][aria-modal="true"]')
    if (!modale) return { modale: false }
    const t = (s) => [...modale.querySelectorAll(s)].map((e) => e.innerText.trim()).filter(Boolean)
    return {
      modale: true,
      titre: modale.querySelector('p')?.innerText ?? null,
      boutons: t('button').slice(0, 12),
    }
  })

  console.log(`\n── ${nom} ──`)
  console.log('   modale  :', vu.modale ? 'OUI' : 'non')
  if (vu.modale) {
    console.log('   titre   :', vu.titre)
    console.log('   boutons :', vu.boutons.join(' | '))
  }
  return vu
}

;(async () => {
  const navigateur = await chromium.launch({ headless: true })
  const page = await navigateur.newPage({ viewport: { width: 1400, height: 900 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE :', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('   CONSOLE :', m.text().slice(0, 160)) })

  try {
    console.log('Connecté en tant que', await connecter(page))
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })

    /* LE SONDAGE EST DE DIX SECONDES : on laisse deux tours, plus le temps de charger la fiche du
       correspondant. Moins, et l'on conclurait à tort que la modale ne s'ouvre pas. */
    await page.waitForTimeout(16000)
    const vu = await observer(page, 'apres-chargement')

    /* == ON DEPLIE, ET ON REGARDE CE QU'IL Y A DESSOUS ==
     * Naoelle : « un titre depliant, et quand on deplie on voit les enregistrements ». Une modale
     * qui s'ouvre mais dont l'accordeon ne montre rien ne vaut pas mieux qu'une modale absente :
     * c'est exactement le genre de demi-preuve qu'on ne veut plus. */
    if (vu.modale) {
      const titres = await page.locator('[role="dialog"] button[aria-expanded]').all()
      console.log('')
      console.log('   sections depliantes :', titres.length)
      for (const t of titres) {
        const nom = (await t.innerText()).split(String.fromCharCode(10))[0].trim()
        await t.click()
        await page.waitForTimeout(700)
        const lignes = await page.evaluate(() => {
          const ouvert = document.querySelector('[role="dialog"] button[aria-expanded="true"]')
          if (!ouvert) return null
          const zone = ouvert.parentElement && ouvert.parentElement.querySelector('div')
          if (!zone) return []
          return Array.from(zone.querySelectorAll('button')).map((b) => b.innerText.trim())
        })
        console.log('   . ' + nom + ' -> ' + (lignes === null ? 'NE S OUVRE PAS' : lignes.length + ' enregistrement(s)'))
        if (lignes) lignes.slice(0, 3).forEach((l) => console.log('        - ' + l.split(String.fromCharCode(10)).join(' / ').slice(0, 70)))
        await page.screenshot({ path: path.join(SORTIE, 'deplie-' + nom + '.png') })
        await t.click()
        await page.waitForTimeout(300)
      }
    }
    if (!vu.modale) {
      console.log('\nPAS DE MODALE. On regarde si la LISTE de rattrapage, elle, est là :')
      const liste = await page.evaluate(() =>
        [...document.querySelectorAll('h3')].some((h) => /rattacher/i.test(h.innerText)))
      console.log('   bloc « Appels à rattacher » :', liste ? 'OUI' : 'non')
    }

    console.log('\nCaptures dans', SORTIE)
  } finally {
    await navigateur.close()
  }
})().catch((e) => {
  console.error('ÉCHEC :', e.message)
  process.exit(1)
})
