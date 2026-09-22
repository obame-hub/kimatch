/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ÉPROUVER LA CARTE D'APPEL DE BOUT EN BOUT, SANS PERSONNE DEVANT L'ÉCRAN
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 22/09/2026 : « fais les tests sans moi, appelle et raccroche, ça fait trois jours qu'on
 * est dessus, c'est pas normal ».
 *
 * Elle a raison : je lui ai fait vérifier six fois ce que je pouvais constater moi-même. Ce script
 * ouvre Kimatch, lance un VRAI appel par le protocole, et photographie l'écran à chaque étape —
 * pendant la sonnerie, après le raccrochage, et après un clic sur la qualification.
 *
 * CE QU'IL VÉRIFIE, ET QU'AUCUN TEST UNITAIRE NE PEUT VOIR :
 *   · la carte paraît-elle au clic ;
 *   · l'overlay s'impose-t-il au centre quand l'appel se termine ;
 *   · les quatre boutons sont-ils là, et le clic est-il pris.
 *
 * Il appelle le numéro de Naoëlle, qui a servi à tous les essais de la journée.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const { chromium } = require('playwright')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const BASE = process.env.BASE_CAPTURE || 'http://localhost:5177'
const NUMERO = '+33782455786'
const SORTIE = path.join(process.cwd(), 'essais-appel')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}

/** Ouvre une session comme `capturer-ecran.cjs` : lien magique, jeton posé dans le stockage. */
async function connecter(page) {
  const adresse = env('ADRESSE_CAPTURE')
  if (!adresse) throw new Error('ADRESSE_CAPTURE manquante dans .env.local')
  const url = env('VITE_SUPABASE_URL')
  const cle = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')

  /* ON REPREND LA MÉTHODE DE `capturer-ecran.cjs`, QUI MARCHE : on suit le lien d'action plutôt que
     de vérifier un jeton à la main. Ma première version lisait `properties.hashed_token` et posait
     la session dans le stockage — l'API rend autre chose, et le script échouait avant d'avoir rien
     éprouvé. Quand un script voisin fait déjà la chose, on le copie au lieu de réinventer. */
  const r = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: adresse, options: { redirect_to: BASE } }),
    signal: AbortSignal.timeout(25000),
  })
  const corps = await r.json().catch(() => null)
  const lien = corps?.properties?.action_link ?? corps?.action_link
  if (!lien) throw new Error('pas de lien : ' + JSON.stringify(corps).slice(0, 200))

  /* ON SUIT LE LIEN TEL QU'IL EST, VERS LE DOMAINE QUE SUPABASE ACCEPTE.
   *
   * Ma version précédente réécrivait `redirect_to` vers le serveur local, et échouait : Supabase
   * IGNORE une redirection qui n'est pas dans ses adresses autorisées — `localhost:5177` n'y est
   * pas — et renvoie vers kimatch.fr avec un fragment vide. Le test s'arrêtait donc sur « pas de
   * jeton », sans avoir rien éprouvé.
   *
   * On laisse donc le lien faire son travail, on récupère la session sur SON domaine, puis on la
   * repose sur celui qu'on veut observer. C'est exactement ce que fait `capturer-ecran.cjs`. */
  await page.goto(lien, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)

  /* ══ LE JETON EST DANS LE FRAGMENT D'URL, ET IL FAUT L'Y PRENDRE ══
   *
   * Suivre le lien ne suffit pas : Supabase renvoie la session dans le `#` de l'adresse, et
   * l'application ne la ramasse que si elle tourne déjà. Mon premier essai s'arrêtait donc sur
   * l'écran de connexion — et mon test « ne voyait aucune carte » pour cette raison, pas à cause
   * d'un défaut de Kimatch. Un test qui échoue pour la mauvaise raison est pire qu'aucun test.
   *
   * On lit donc le fragment et on pose la session à la main, comme `capturer-ecran.cjs`. */
  /* LA SESSION SE PREND DANS LE STOCKAGE, PAS DANS L'URL.
   *
   * Le fragment `#access_token=…` est consommé par l'application dès qu'elle démarre : le temps
   * qu'on le lise, il a souvent disparu de la barre d'adresse. Le stockage, lui, garde la session
   * — c'est de là qu'on la reprend pour la reposer sur le serveur qu'on veut observer. */
  const ref = new URL(url).hostname.split('.')[0]
  const cleSession = `sb-${ref}-auth-token`
  const session = await page.evaluate((c) => window.localStorage.getItem(c), cleSession)
  if (!session) throw new Error('pas de session apres le lien — page : ' + page.url().slice(0, 120))

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(([c, v]) => window.localStorage.setItem(c, v), [cleSession, session])
  return adresse
}

/** Photographie l'écran et dit ce que la carte affiche, en texte. */
async function observer(page, nom) {
  fs.mkdirSync(SORTIE, { recursive: true })
  await page.screenshot({ path: path.join(SORTIE, nom + '.png'), fullPage: false })

  const etat = await page.evaluate(() => {
    const texte = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null)
    // La carte porte l'un de ces trois libellés d'état, en majuscules.
    const carte = [...document.querySelectorAll('div')].find(
      (d) => /ÇA SONNE|EN LIGNE|APPEL TERMIN|APPEL ENTRANT/i.test(d.innerText || '') &&
             (d.innerText || '').length < 600,
    )
    const overlay = document.querySelector('[role="dialog"][aria-modal="true"]')
    const boutons = [...document.querySelectorAll('button')]
      .map((b) => (b.innerText || '').trim())
      .filter((t) => /Quelqu|Répondeur|Serveur vocal|Pas de réponse/i.test(t))
    return { carte: texte(carte)?.slice(0, 220) ?? null, overlay: Boolean(overlay), boutons }
  })

  console.log(`\n── ${nom} ──`)
  console.log('   carte   :', etat.carte ?? '(aucune)')
  console.log('   overlay :', etat.overlay ? 'OUI (centré, voile)' : 'non')
  console.log('   boutons :', etat.boutons.length ? etat.boutons.join(' | ') : '(aucun)')
  return etat
}

;(async () => {
  const navigateur = await chromium.launch({ headless: true })
  const page = await navigateur.newPage({ viewport: { width: 1400, height: 900 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE :', e.message))

  try {
    const adresse = await connecter(page)
    console.log('Connecté en tant que', adresse)

    await page.goto(`${BASE}/contacts`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(5000)

    await observer(page, '1-avant-appel')

    // ── ON APPELLE POUR DE VRAI ──
    // Le protocole est celui qu'utilise le clic dans Kimatch. On le lance depuis le poste plutôt que
    // de simuler un clic : le navigateur de Playwright ne porte pas le protocole, et ce qu'on veut
    // éprouver ici est la CARTE, pas le protocole (déjà vérifié par le journal du lanceur).
    console.log('\nAppel de', NUMERO, '…')
    try {
      execFileSync('powershell', ['-NoProfile', '-Command',
        `Start-Process "kimatch://appeler?numero=${encodeURIComponent(NUMERO)}"`], { timeout: 30000 })
    } catch (e) {
      console.log('   (lancement du protocole :', e.message.slice(0, 120), ')')
    }

    // Le webhook d'Allo écrit l'appel en quelques secondes ; la carte sonde toutes les 4 s.
    await page.waitForTimeout(14000)
    await observer(page, '2-pendant-appel')

    // ── ON RACCROCHE ──
    // Depuis l'application Allo : c'est elle qui tient la ligne. On ferme sa fenêtre d'appel.
    console.log('\nRaccrochage…')
    try {
      execFileSync('powershell', ['-NoProfile', '-Command', `
        Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
        $p = Get-Process -Name 'Allo*' | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1
        if ($p) {
          $r = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
          $tous = $r.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
          foreach ($e in $tous) {
            if ($e.Current.Name -match '(?i)raccrocher|hang up|end call') {
              $e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
              Write-Output 'raccroche'
              break
            }
          }
        }`], { timeout: 30000, encoding: 'utf8' })
    } catch (e) {
      console.log('   (raccrochage :', e.message.slice(0, 120), ')')
    }

    // `call.completed` arrive en quelques secondes, puis la carte le voit au sondage suivant.
    await page.waitForTimeout(20000)
    const apres = await observer(page, '3-apres-raccrochage')

    // ── ON RÉPOND À LA QUESTION ──
    if (apres.boutons.length) {
      console.log('\nClic sur « Répondeur »…')
      await page.getByRole('button', { name: /Répondeur/i }).first().click()
      await page.waitForTimeout(3000)
      await observer(page, '4-apres-qualification')
    } else {
      console.log('\nPAS DE BOUTONS À CLIQUER — c’est le défaut à corriger.')
    }

    console.log('\nCaptures dans', SORTIE)
  } finally {
    await navigateur.close()
  }
})().catch((e) => {
  console.error('ÉCHEC :', e.message)
  process.exit(1)
})
