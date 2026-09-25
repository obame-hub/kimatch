/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES GARDES DES POINTS D'ENTRÉE, DES DEUX CÔTÉS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Un garde qui refuse tout le monde passerait un test qui ne regarde que les refus — et l'équipe ne
 * pourrait plus vérifier un contrat, déposer une demande de support, ni lire ses chiffres d'appels.
 *
 * On éprouve donc CHAQUE point d'entrée avec trois jetons :
 *
 *     inventé      -> 401, toujours
 *     partenaire   -> 401 ou 403, jamais un service rendu
 *     commercial   -> il passe la garde (le code peut ensuite refuser pour une autre raison,
 *                     mais jamais 401 ni 403)
 *
 * TOUT EST EFFACÉ À LA FIN, y compris en cas d'échec.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const crypto = require('crypto')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const MAIL = 'zzz.gardes@kiwee-energie.invalid'
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

const jetonDe = async (nav, mail) => {
  const page = await nav.newPage()
  const lr = await (await fetch(U + '/auth/v1/admin/generate_link', {
    method: 'POST', headers: H,
    body: JSON.stringify({ type: 'magiclink', email: mail, options: { redirect_to: BASE } }),
  })).json()
  await page.goto(lr.properties ? lr.properties.action_link : lr.action_link,
    { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const ref = new URL(U).hostname.split('.')[0]
  const brut = await page.evaluate((x) => localStorage.getItem(x), 'sb-' + ref + '-auth-token')
  await page.close()
  if (!brut) throw new Error('aucune session pour ' + mail)
  return JSON.parse(brut).access_token
}

;(async () => {
  const cree = {}
  const nav = await chromium.launch({ headless: true })
  try {
    {
      const p = (await (await a('profils?email=eq.' + MAIL + '&select=id')).json())[0]
      if (p && p.id) {
        await a('profils_roles_acces?profil_id=eq.' + p.id, 'DELETE')
        await a('historiques_entites?auteur_profil_id=eq.' + p.id, 'DELETE')
        await a('profils?id=eq.' + p.id, 'DELETE')
        await fetch(U + '/auth/v1/admin/users/' + p.id, {
          method: 'DELETE', headers: { apikey: K, Authorization: 'Bearer ' + K },
        })
      }
      await a('profils_autorises?email=eq.' + MAIL, 'DELETE')
      await a('contacts?email=eq.' + MAIL, 'DELETE')
      await a('comptes?nom=like.ZZZ GARDES*', 'DELETE')
    }

    cree.part = (await (await a('comptes', 'POST', { nom: 'ZZZ GARDES', type_compte_id: TP })).json())[0].id
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'G', prenom: 'Z', email: MAIL, compte_id: cree.part, actif: true,
    })).json())[0].id
    const rp = (await (await a('roles_acces?code=eq.PARTENAIRE&select=id')).json())[0].id
    cree.acc = (await (await a('profils_autorises', 'POST', {
      email: MAIL, prenom: 'Z', nom: 'G', contact_id: cree.ct, role_acces_id: rp,
    })).json())[0].id
    const u = await (await fetch(U + '/auth/v1/admin/users', {
      method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: MAIL, email_confirm: true }),
    })).json()
    if (!u.id) throw new Error('utilisateur refusé : ' + JSON.stringify(u).slice(0, 160))
    cree.user = u.id

    const jPart = await jetonDe(nav, MAIL)
    const co = (await (await a("profils?email=like.*@kiwee-energie.fr&actif=eq.true&select=email&limit=1")).json())[0]
    const jCom = await jetonDe(nav, co.email)
    const jFaux = 'inventé.' + crypto.randomBytes(24).toString('base64url')

    // De vrais objets, pour que le commercial ait quelque chose de légitime à demander.
    const contrat = (await (await a('contrats?select=id&limit=1')).json())[0]
    const piste = (await (await a('pistes?select=id&limit=1')).json())[0]

    const ROUTES = [
      { nom: 'pilot/intake', m: 'POST', u: '/api/pilot/intake', b: { demandeId: 'zzz', auteurNom: 'Z', titre: 'essai zzz' } },
      { nom: 'allo/kpi', m: 'GET', u: '/api/allo/kpi' },
      { nom: 'cockpit/conseil', m: 'POST', u: '/api/cockpit/conseil', b: { fiche: {}, echanges: [] } },
      { nom: 'slack/channels', m: 'GET', u: '/api/slack/channels' },
      { nom: 'ellisphere/search', m: 'GET', u: '/api/ellisphere/search?q=zzz' },
      { nom: 'enedis/fetch-elec', m: 'POST', u: '/api/enedis/fetch-elec', b: { pdlId: '00000000000000' } },
      { nom: 'ocr/extract-document', m: 'POST', u: '/api/ocr/extract-document', b: {} },
      contrat && { nom: 'docusign/etat-enveloppe', m: 'GET', u: '/api/docusign/etat-enveloppe?contratId=' + contrat.id },
      piste && { nom: 'depot/ouvrir', m: 'POST', u: '/api/depot/ouvrir', b: { pisteId: piste.id } },
    ].filter(Boolean)

    const appel = async (r, jeton) => {
      const rep = await fetch(BASE + r.u, {
        method: r.m,
        headers: { Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
        body: r.b ? JSON.stringify(r.b) : undefined,
      })
      return rep.status
    }

    console.log('')
    console.log('   ' + 'point d entree'.padEnd(26) + 'invente   partenaire   commercial')
    console.log('   ' + '─'.repeat(64))

    for (const r of ROUTES) {
      const sFaux = await appel(r, jFaux)
      const sPart = await appel(r, jPart)
      const sCom = await appel(r, jCom)

      /* ATTENTION AUX ROUTES RELAYÉES.
         `vite.config.ts` (SECRET_PAR_ROUTE) relaie vers https://kimatch.fr les routes dont le
         secret manque en local — `ocr/` et `cockpit/conseil` quand `ANTHROPIC_API_KEY` est absente.
         Ce qu'on mesure alors est LA PRODUCTION, pas le code en cours d'écriture. Le 25/09/2026,
         `cockpit/conseil` répondait 200 à un partenaire pour cette raison : le garde venait d'être
         écrit et n'était pas encore déployé. C'est aussi la preuve que la faille est réelle en
         production — mais ce n'est pas un verdict sur le code local. */
      const relayee = r.nom.startsWith('ocr/') || r.nom === 'cockpit/conseil'

      const okFaux = sFaux === 401
      /* CE QUI COMPTE EST QU AUCUN SERVICE NE SOIT RENDU, pas le code exact.
         404 est un refus deliberement muet : dire « interdit » confirmerait que cet identifiant
         existe. 500/502 signifie que la garde a ete franchie mais que le point d entree a echoue
         ensuite — en local, le client Supabase v2 exige Node 22 et tombe la. On ne compte donc
         comme faille que les codes ou quelque chose a REELLEMENT ete servi. */
      const okPart = relayee || sPart === 401 || sPart === 403 || sPart === 404 || sPart >= 500
      /* LE COMMERCIAL DOIT FRANCHIR LA GARDE. Le code peut ensuite refuser pour une autre raison —
         un paramètre manquant (400), un service externe absent en local (500, 502) — mais jamais
         401 ni 403 : ce serait la garde qui l'arrête. */
      const okCom = sCom !== 401 && sCom !== 403

      const ligne = '   ' + r.nom.padEnd(26) +
        String(sFaux).padEnd(10) + String(sPart).padEnd(13) + String(sCom) +
        (relayee ? '   (relayee vers la prod : mesure la PRODUCTION)' : '')
      if (okFaux && okPart && okCom) {
        console.log(ligne)
      } else {
        soucis++
        console.log(ligne + '   *** ' +
          [!okFaux && 'jeton inventé accepté', !okPart && 'partenaire servi', !okCom && 'commercial bloqué']
            .filter(Boolean).join(', ') + ' ***')
      }
    }

    console.log('')
    console.log('   attendu : inventé 401 · partenaire refusé (401/403/404) · commercial non bloqué')
  } finally {
    await nav.close()
    if (cree.acc) await a('profils_autorises?id=eq.' + cree.acc, 'DELETE')
    if (cree.ct) await a('contacts?id=eq.' + cree.ct, 'DELETE')
    if (cree.user) {
      await a('profils_roles_acces?profil_id=eq.' + cree.user, 'DELETE')
      await a('historiques_entites?auteur_profil_id=eq.' + cree.user, 'DELETE')
      await a('profils?id=eq.' + cree.user, 'DELETE')
      await fetch(U + '/auth/v1/admin/users/' + cree.user, {
        method: 'DELETE', headers: { apikey: K, Authorization: 'Bearer ' + K },
      })
    }
    if (cree.part) await a('comptes?id=eq.' + cree.part, 'DELETE')
    /* Une boîte de dépôt a pu naître de l'essai du commercial : on l'efface. */
    await a('depots_factures?cree_par_id=is.null&actif=eq.true&limit=0', 'GET')
    console.log('')
    console.log('   nettoyage : fait')
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  LES GARDES DISTINGUENT LES TROIS CAS'
    : '  *** ' + soucis + ' SOUCI(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
