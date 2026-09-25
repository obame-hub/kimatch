/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'API PARTENAIRE, ÉPROUVÉE COMME UN PARTENAIRE L'UTILISERAIT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * On émet une clé, on appelle les trois points d'entrée, et l'on vérifie :
 *
 *   ① sans clé, ou avec une clé inventée -> refusé
 *   ② avec sa clé                        -> il voit SON patrimoine
 *   ③ et RIEN d'autre                    -> pas un compte de KiWee, pas un autre partenaire
 *   ④ aucune écriture n'est possible
 *   ⑤ les champs sensibles ne sortent pas (marges de KiWee, commentaire interne, taux)
 *   ⑥ une clé révoquée cesse de valoir
 *
 * TOUT EST EFFACÉ À LA FIN, y compris en cas d'échec.
 */
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

const appel = async (chemin, cle, methode) => {
  const r = await fetch(BASE + chemin, {
    method: methode || 'GET',
    headers: cle ? { Authorization: 'Bearer ' + cle } : {},
  })
  const t = await r.text()
  let j = null
  try { j = JSON.parse(t) } catch { /* pas du JSON */ }
  return { statut: r.status, corps: j, texte: t.slice(0, 160) }
}

;(async () => {
  const cree = {}
  try {
    // ── LE MÉNAGE D'ABORD ──
    await a('cles_api_partenaires?libelle=like.ZZZ*', 'DELETE')
    await a('sites?nom=like.ZZZ API*', 'DELETE')
    await a('comptes?nom=like.ZZZ API*', 'DELETE')

    // ── UN PARTENAIRE, UN CLIENT QU'IL A APPORTÉ, ET UN CONCURRENT ──
    const TC = (await (await a('types_comptes?code=eq.CLIENT&select=id')).json())[0].id
    cree.part = (await (await a('comptes', 'POST', { nom: 'ZZZ API PARTENAIRE', type_compte_id: TP })).json())[0].id
    cree.rival = (await (await a('comptes', 'POST', { nom: 'ZZZ API CONCURRENT', type_compte_id: TP })).json())[0].id
    cree.sien = (await (await a('comptes', 'POST', {
      nom: 'ZZZ API SON CLIENT', type_compte_id: TC, apporteur_partenaire_id: cree.part,
    })).json())[0].id
    cree.site = (await (await a('sites', 'POST', { nom: 'ZZZ API SITE', compte_id: cree.sien })).json())[0].id

    /* UNE AFFAIRE SUR SON COMPTE, ET UNE SUR UN COMPTE DE KIWEE.
       Sans la première, « 0 recommandation rendue » passerait le test sans rien prouver — une API
       en panne rend zéro tout aussi bien. Sans la seconde, on ne saurait pas s'il voit celles des
       autres. Les marges sont renseignées pour vérifier que `marge_apporteur` sort et que
       `marge_nette` reste dedans. */
    const etape = (await (await a('etapes_recommandation?select=id&limit=1')).json())[0]
    cree.reco = (await (await a('recommandations', 'POST', {
      nom: 'ZZZ API SON AFFAIRE', compte_id: cree.sien, etape_id: etape ? etape.id : null,
      montant: 12345, marge_apporteur: 500, marge_nette: 9999,
      commentaire_interne: 'ZZZ SECRET INTERNE', actif: true,
    })).json())[0].id

    const compteKiwee = (await (await a('comptes?nom=not.like.ZZZ*&select=id&limit=1')).json())[0]
    cree.recoAutre = compteKiwee
      ? (await (await a('recommandations', 'POST', {
          nom: 'ZZZ API AFFAIRE DE KIWEE', compte_id: compteKiwee.id,
          etape_id: etape ? etape.id : null, actif: true,
        })).json())[0].id
      : null

    // ── LA CLÉ, fabriquée comme l'écran le fait ──
    const cle = 'kw_' + crypto.randomBytes(32).toString('base64url')
    const empreinte = crypto.createHash('sha256').update(cle).digest('hex')
    cree.cle = (await (await a('cles_api_partenaires', 'POST', {
      compte_id: cree.part, libelle: 'ZZZ essai', empreinte, prefixe: cle.slice(0, 11),
    })).json())[0].id

    console.log('')
    console.log('══ ① SANS CLE VALIDE ══')
    for (const [quoi, c] of [
      ['aucune clé', null],
      ['une clé inventée', 'kw_' + crypto.randomBytes(32).toString('base64url')],
      ['une clé sans le préfixe', crypto.randomBytes(32).toString('base64url')],
    ]) {
      const r = await appel('/api/partenaire/patrimoine', c)
      dire(r.statut === 401, quoi + ' -> refusé', 'HTTP ' + r.statut)
    }

    console.log('')
    console.log('══ ② AVEC SA CLE ══')
    const doc = await appel('/api/partenaire', cle)
    dire(doc.statut === 200, 'la documentation répond', 'HTTP ' + doc.statut)

    const pat = await appel('/api/partenaire/patrimoine', cle)
    dire(pat.statut === 200, 'le patrimoine répond', 'HTTP ' + pat.statut)

    const comptes = pat.corps && pat.corps.comptes ? pat.corps.comptes : []
    const noms = comptes.map((c) => c.nom).sort()
    dire(noms.length === 2 && noms.includes('ZZZ API PARTENAIRE') && noms.includes('ZZZ API SON CLIENT'),
      'il voit son compte et celui qu il a apporté', JSON.stringify(noms))

    const sites = pat.corps && pat.corps.sites ? pat.corps.sites : []
    dire(sites.length === 1 && sites[0].nom === 'ZZZ API SITE',
      'il voit le site de son client', sites.length + ' site(s)')

    console.log('')
    console.log('══ ③ ET RIEN D AUTRE ══')
    dire(!noms.includes('ZZZ API CONCURRENT'), 'il ne voit pas le compte du concurrent',
      noms.includes('ZZZ API CONCURRENT') ? '*** IL LE VOIT ***' : 'absent')

    const totalBase = (await (await a('comptes?select=id', 'HEAD')).headers) // non utilisé, lisibilité
    const tousComptes = (await (await a('comptes?select=id&limit=3000')).json()).length
    dire(comptes.length < 10, 'il ne voit pas les comptes de KiWee',
      comptes.length + ' sur ' + tousComptes + ' en base')

    const reco = await appel('/api/partenaire/recommandations', cle)
    dire(reco.statut === 200, 'les recommandations répondent', 'HTTP ' + reco.statut)
    const recos = reco.corps && reco.corps.recommandations ? reco.corps.recommandations : []
    const nomsReco = recos.map((r) => r.nom).sort()
    dire(nomsReco.length === 1 && nomsReco[0] === 'ZZZ API SON AFFAIRE',
      'il voit SON affaire, et elle seule', JSON.stringify(nomsReco))
    dire(!nomsReco.includes('ZZZ API AFFAIRE DE KIWEE'),
      'il ne voit pas une affaire de KiWee',
      nomsReco.includes('ZZZ API AFFAIRE DE KIWEE') ? '*** IL LA VOIT ***' : 'absente')
    const sienne = recos[0]
    dire(Boolean(sienne) && sienne.marge_apporteur === 500,
      'sa marge d apporteur lui est rendue', sienne ? String(sienne.marge_apporteur) : 'aucune ligne')
    dire(Boolean(sienne) && sienne.etape && sienne.etape.libelle,
      'l etape est rendue en clair', sienne && sienne.etape ? sienne.etape.libelle : '*** absente ***')

    console.log('')
    console.log('══ ④ AUCUNE ECRITURE ══')
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const r = await appel('/api/partenaire/patrimoine', cle, m)
      dire(r.statut === 405, m + ' est refusé', 'HTTP ' + r.statut)
    }

    console.log('')
    console.log('══ ⑤ LES CHAMPS SENSIBLES NE SORTENT PAS ══')
    const brut = JSON.stringify(pat.corps) + JSON.stringify(reco.corps)
    for (const champ of [
      'taux_commission_courtier', 'taux_repartition', 'limite_ellipro',
      'commentaire_interne', 'ZZZ SECRET INTERNE', 'marge_brute', 'marge_nette', 'score_ellipro',
    ]) {
      dire(!brut.includes(champ), champ + ' n est pas rendu',
        brut.includes(champ) ? '*** PRESENT ***' : 'absent')
    }

    console.log('')
    console.log('══ ⑥ UNE CLE REVOQUEE NE VAUT PLUS ══')
    await a('cles_api_partenaires?id=eq.' + cree.cle, 'PATCH',
      { actif: false, revoquee_le: new Date().toISOString() })
    const apres = await appel('/api/partenaire/patrimoine', cle)
    dire(apres.statut === 401, 'la clé révoquée est refusée', 'HTTP ' + apres.statut)
  } finally {
    await a('cles_api_partenaires?libelle=like.ZZZ*', 'DELETE')
    await a('recommandations?nom=like.ZZZ API*', 'DELETE')
    if (cree.site) await a('sites?id=eq.' + cree.site, 'DELETE')
    for (const k of ['sien', 'rival', 'part']) {
      if (cree[k]) await a('comptes?id=eq.' + cree[k], 'DELETE')
    }
    const reste = (await (await a('comptes?nom=like.ZZZ API*&select=id')).json()).length
    console.log('')
    console.log('   nettoyage : ' + (reste === 0 ? 'tout est efface' : '*** ' + reste + ' restant(s) ***'))
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  L API REND SON PERIMETRE, ET RIEN DE PLUS'
    : '  *** ' + soucis + ' SOUCI(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
