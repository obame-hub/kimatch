/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CRÉER UN COMPTE RATTACHÉ À UN PARTENAIRE — À L'ÉCRAN, DE BOUT EN BOUT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * On ne vérifie pas que le code compile : on ouvre le parcours, on coche, on choisit, on crée, et
 * l'on va relire en base ce qui a été écrit. Puis on regarde les DEUX conséquences :
 *
 *   ① le partenaire voit-il ce compte dans son espace ?
 *   ② les commerciaux le voient-ils toujours dans TOUS les comptes ?
 *
 * La seconde compte autant. Naoëlle : « même si ces comptes sont gérés et à la propriété d'un
 * partenaire, que nos propres commerciaux puissent le voir dans tous les comptes ».
 *
 * TOUT EST EFFACÉ À LA FIN, y compris en cas d'échec.
 */
const { chromium } = require('playwright')
const fs = require('fs')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const TP = '8e746506-fd52-4ec0-bb54-2ad5a461626b'

let soucis = 0
const dire = (ok, texte, detail) => {
  if (!ok) soucis++
  console.log('   ' + (ok ? '  ok   ' : ' SOUCI ') + ' | ' + texte + (detail ? '  — ' + detail : ''))
}
const a = (chemin, m, b) =>
  fetch(U + '/rest/v1/' + chemin, {
    method: m || 'GET',
    headers: Object.assign({}, H, { Prefer: 'return=representation' }),
    body: b ? JSON.stringify(b) : undefined,
  })

;(async () => {
  const cree = {}
  const nav = await chromium.launch({ headless: true })
  try {
    // ── LES RESTES D'UN ESSAI PRÉCÉDENT ──
    await a('comptes?nom=like.ZZZ PARCOURS*', 'DELETE')
    await a('contacts?nom=like.ZZZ PARCOURS*', 'DELETE')

    // ── UN PARTENAIRE ET SON CONTACT, POUR AVOIR QUELQUE CHOSE À CHOISIR ──
    cree.part = (await (await a('comptes', 'POST',
      { nom: 'ZZZ PARCOURS PARTENAIRE', type_compte_id: TP })).json())[0].id
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'ZZZ PARCOURS', prenom: 'Referent', compte_id: cree.part, actif: true,
    })).json())[0].id

    // ── ON SE CONNECTE COMME UN COMMERCIAL ──
    const co = (await (await a("profils?email=like.*@kiwee-energie.fr&actif=eq.true&select=email&limit=1")).json())[0]
    const page = await nav.newPage()
    const lr = await (await fetch(U + '/auth/v1/admin/generate_link', {
      method: 'POST', headers: H,
      body: JSON.stringify({ type: 'magiclink', email: co.email, options: { redirect_to: BASE } }),
    })).json()
    await page.goto(lr.properties ? lr.properties.action_link : lr.action_link,
      { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(4000)

    console.log('')
    console.log('   connecte : ' + co.email)
    console.log('')
    console.log('══ LE PARCOURS, A L ECRAN ══')

    // ── ÉTAPE 1 · le type ──
    await page.goto(BASE + '/comptes', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500)

    // Le bouton de création : on le cherche par son libellé, pas par une classe.
    const ouvrir = page.getByRole('button', { name: /cr[ée]er|nouveau compte|\+/i }).first()
    await ouvrir.click({ timeout: 15000 })
    await page.waitForTimeout(1500)

    const carteEntreprise = page.getByText('Entreprise', { exact: true }).first()
    await carteEntreprise.click({ timeout: 15000 })
    await page.waitForTimeout(1500)
    dire(true, 'etape 1 : le type « Entreprise » est choisi')

    // ── ÉTAPE 2 · le nom, sans passer par Ellisphere ──
    const champNom = page.locator('input').filter({ hasNot: page.locator('[type=checkbox]') }).first()
    await champNom.fill('')
    await champNom.type('ZZZ PARCOURS CLIENT', { delay: 20 })
    await page.waitForTimeout(600)

    const suivant = page.getByRole('button', { name: /suivant|continuer|score/i }).first()
    if (await suivant.count()) { await suivant.click({ timeout: 10000 }); await page.waitForTimeout(2500) }
    dire(true, 'etape 2 : le nom est saisi')

    // ── ÉTAPE 3 · LA CASE PARTENAIRE, ce qu'on vient d'ajouter ──
    const laCase = page.getByText('Ce compte vient d’un partenaire').first()
    const vue = await laCase.count()
    dire(vue > 0, 'etape 3 : la case « Ce compte vient d un partenaire » est a l ecran',
      vue > 0 ? '' : '*** ABSENTE ***')

    if (vue > 0) {
      await laCase.click({ timeout: 10000 })
      await page.waitForTimeout(900)

      // Le bouton doit maintenant DIRE ce qui manque, plutot que de laisser creer sans partenaire.
      const boutonAvant = await page.getByRole('button', { name: /choisissez le partenaire/i }).count()
      dire(boutonAvant > 0, 'coche sans partenaire : le bouton dit ce qui manque',
        boutonAvant > 0 ? '' : '*** on peut creer sans choisir ***')

      // On choisit le partenaire, puis le contact.
      const listes = page.locator('select')
      await listes.nth(0).selectOption({ label: 'ZZZ PARCOURS PARTENAIRE' })
      await page.waitForTimeout(1600)
      dire(true, 'le partenaire est choisi')

      const nbListes = await listes.count()
      if (nbListes > 1) {
        const options = await listes.nth(1).locator('option').allTextContents()
        const ligne = options.find((o) => o.includes('Referent'))
        dire(Boolean(ligne), 'ses contacts sont proposes', ligne || '*** aucun contact propose ***')
        if (ligne) { await listes.nth(1).selectOption({ label: ligne }); await page.waitForTimeout(700) }
      } else {
        dire(false, 'ses contacts sont proposes', '*** la liste des contacts n apparait pas ***')
      }

      // On cree.
      const creerBtn = page.getByRole('button', { name: /^cr[ée]er le compte$/i }).first()
      dire(await creerBtn.count() > 0, 'le bouton « Creer le compte » est revenu')
      await creerBtn.click({ timeout: 15000 })
      await page.waitForTimeout(5000)
    }

    // ── CE QUI EST REELLEMENT ECRIT EN BASE ──
    console.log('')
    console.log('══ CE QUI EST ECRIT ══')
    const ecrit = (await (await a(
      'comptes?nom=like.ZZZ PARCOURS CLIENT*&select=id,nom,apporteur_partenaire_id,contact_partenaire_id')).json())[0]
    dire(Boolean(ecrit), 'le compte est cree', ecrit ? ecrit.nom : '*** introuvable ***')
    if (ecrit) {
      cree.client = ecrit.id
      dire(ecrit.apporteur_partenaire_id === cree.part, 'il porte son partenaire',
        ecrit.apporteur_partenaire_id === cree.part ? 'oui' : '*** ' + ecrit.apporteur_partenaire_id + ' ***')
      dire(ecrit.contact_partenaire_id === cree.ct, 'il porte le referent chez eux',
        ecrit.contact_partenaire_id === cree.ct ? 'oui' : '*** ' + ecrit.contact_partenaire_id + ' ***')
    }

    // ── LES DEUX CONSEQUENCES ──
    if (ecrit) {
      console.log('')
      console.log('══ QUI LE VOIT ══')
      const { Client } = require('pg')
      const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
      const db = new Client({
        connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
        ssl: { rejectUnauthorized: false },
      })
      await db.connect()
      await db.query('begin')
      try {
        // ① LE PARTENAIRE le voit-il dans son espace ?
        const up = (await db.query(
          'select p.id from profils p ' +
          'join profils_roles_acces pra on pra.profil_id = p.id ' +
          'join roles_acces r on r.id = pra.role_acces_id ' +
          'where p.actif and not r.ouvre_administration limit 1')).rows[0].id
        await db.query('update profils set compte_partenaire_id=$1 where id=$2', [cree.part, up])
        await db.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)", [up])
        await db.query('set local role authenticated')
        const vuPart = (await db.query('select count(*) n from comptes where id=$1', [ecrit.id])).rows[0].n
        await db.query('reset role')
        dire(Number(vuPart) === 1, 'le partenaire voit ce compte dans son espace',
          Number(vuPart) === 1 ? 'oui' : '*** NON — le rattachement n ouvre rien ***')

        // ② LES COMMERCIAUX le voient-ils toujours ?
        const uc = (await db.query(
          "select p.id, p.email from profils p " +
          "join profils_roles_acces pra on pra.profil_id = p.id " +
          "join roles_acces r on r.id = pra.role_acces_id " +
          "where p.actif and not r.ouvre_administration and p.compte_partenaire_id is null " +
          "and p.email like '%@kiwee-energie.fr' limit 1")).rows[0]
        await db.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)", [uc.id])
        await db.query('set local role authenticated')
        const vuCo = (await db.query('select count(*) n from comptes where id=$1', [ecrit.id])).rows[0].n
        await db.query('reset role')
        dire(Number(vuCo) === 1, 'un commercial le voit toujours dans tous les comptes',
          Number(vuCo) === 1 ? 'oui (' + uc.email + ')' : '*** NON — le compte a disparu de leurs listes ***')
      } finally {
        await db.query('rollback')
        await db.end()
      }
    }
  } finally {
    await nav.close()
    if (cree.client) await a('comptes?id=eq.' + cree.client, 'DELETE')
    await a('comptes?nom=like.ZZZ PARCOURS*', 'DELETE')
    await a('contacts?nom=like.ZZZ PARCOURS*', 'DELETE')
    const reste = (await (await a('comptes?nom=like.ZZZ PARCOURS*&select=id')).json()).length
    console.log('')
    console.log('   nettoyage : ' + (reste === 0 ? 'tout est efface' : '*** ' + reste + ' restant(s) ***'))
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  LE RATTACHEMENT MARCHE, ET N ENLEVE RIEN AUX COMMERCIAUX'
    : '  *** ' + soucis + ' SOUCI(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
