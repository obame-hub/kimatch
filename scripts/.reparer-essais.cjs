/**
 * REMETTRE CE QUE LES ESSAIS ONT DEPLACE.
 *
 * L'audit des fonctions a exploite une faille reelle : `fn_deplacer_site` et `fn_rattacher_compteur`
 * n'avaient aucun controle de droits, et l'essai a donc DEPLACE de vrais sites et compteurs vers un
 * compte de test. C'est la preuve que la faille existait — et une dette a rembourser tout de suite.
 *
 * On retrouve le compte d'origine par ce qui N'A PAS bouge : les mandats et les recommandations
 * restent lies au site, et ils portent le compte. A defaut, les compteurs du site.
 */
const fs = require('fs')
const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const q = async (c, m, b) => {
  const r = await fetch(U + '/rest/v1/' + c, {
    method: m || 'GET', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
    body: b ? JSON.stringify(b) : undefined,
  })
  const t = await r.text()
  let j = null
  try { j = JSON.parse(t) } catch { /* pas du JSON */ }
  return { ok: r.ok, statut: r.status, lignes: Array.isArray(j) ? j : [], texte: t }
}

;(async () => {
  const tests = (await q('comptes?nom=like.ZZZ*&select=id,nom')).lignes
  if (!tests.length) { console.log('aucun compte de test.'); return }

  for (const t of tests) {
    console.log('')
    console.log('══ compte de test ' + t.id.slice(0, 8) + ' ══')

    // ── LES SITES ──
    for (const s of (await q('sites?compte_id=eq.' + t.id + '&select=id,nom')).lignes) {
      // On cherche le compte d'origine dans l'ordre de fiabilite.
      let origine = null
      let via = null

      const m = (await q('mandats?site_id=eq.' + s.id + '&select=compte_id&limit=1')).lignes[0]
      if (m && m.compte_id && m.compte_id !== t.id) { origine = m.compte_id; via = 'mandat' }

      if (!origine) {
        const rs = (await q('recommandations_sites?site_id=eq.' + s.id +
          '&select=recommandation:recommandations(compte_id)&limit=1')).lignes[0]
        if (rs && rs.recommandation && rs.recommandation.compte_id !== t.id) {
          origine = rs.recommandation.compte_id; via = 'recommandation'
        }
      }

      if (!origine) {
        const os = (await q('opportunites_sites?site_id=eq.' + s.id +
          '&select=opportunite:opportunites(compte_id)&limit=1')).lignes[0]
        if (os && os.opportunite && os.opportunite.compte_id !== t.id) {
          origine = os.opportunite.compte_id; via = 'opportunite'
        }
      }

      if (!origine) {
        console.log('  site « ' + s.nom + ' » : ORIGINE INTROUVABLE — a traiter a la main')
        continue
      }
      const nom = (await q('comptes?id=eq.' + origine + '&select=nom')).lignes[0]
      const r = await q('sites?id=eq.' + s.id, 'PATCH', { compte_id: origine })
      console.log('  site « ' + s.nom + ' » -> « ' + (nom ? nom.nom : '?') + ' » (par ' + via + ') : HTTP ' + r.statut)
    }

    // ── LES COMPTEURS : ils suivent leur site ──
    for (const c of (await q('compteurs?compte_id=eq.' + t.id + '&select=id,numero_point,site_id')).lignes) {
      if (!c.site_id) { console.log('  compteur ' + c.numero_point + ' : sans site, a traiter a la main'); continue }
      const s = (await q('sites?id=eq.' + c.site_id + '&select=compte_id,nom')).lignes[0]
      if (!s || s.compte_id === t.id) { console.log('  compteur ' + c.numero_point + ' : son site est encore sur le test'); continue }
      const r = await q('compteurs?id=eq.' + c.id, 'PATCH', { compte_id: s.compte_id })
      console.log('  compteur ' + c.numero_point + ' -> le compte de « ' + s.nom + ' » : HTTP ' + r.statut)
    }
  }

  // ── ON EFFACE LES COMPTES DE TEST, une fois vides ──
  console.log('')
  console.log('══ nettoyage ══')
  for (const t of tests) {
    await q('profils?compte_partenaire_id=eq.' + t.id, 'PATCH', { compte_partenaire_id: null })
    const r = await q('comptes?id=eq.' + t.id, 'DELETE')
    console.log('  ' + t.id.slice(0, 8) + ' : ' + (r.ok ? 'efface' : 'retenu — ' + r.texte.slice(0, 110)))
  }

  const reste = (await q('comptes?nom=like.ZZZ*&select=nom')).lignes
  console.log('')
  console.log('  comptes de test restants : ' + (reste.length ? JSON.stringify(reste.map((x) => x.nom)) : 'aucun'))
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
