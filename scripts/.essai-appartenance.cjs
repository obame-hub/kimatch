/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * `exigerAcces` : L'OBJET D'UN AUTRE EST REFUSÉ, LE SIEN PASSE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Trois points d'entrée prenaient un identifiant dans le corps de la requête puis travaillaient
 * avec la clé de service : `depot/ouvrir`, `cockpit/conseil`, `docusign/send`. Ce n'était pas une
 * faille partenaire — un commercial de KiWee agissait de même sur le dossier d'un collègue.
 *
 * On éprouve le garde comme il se comporte réellement : il relit la ligne AVEC LE JETON DE
 * L'APPELANT, et refuse si les policies ne la montrent pas.
 *
 * DES DEUX CÔTÉS. Un garde qui refuse tout le monde passerait un test qui ne regarde que les
 * refus — et l'équipe ne pourrait plus envoyer un mandat à signer.
 */
const { chromium } = require('playwright')
const fs = require('fs')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const ANON = env('VITE_SUPABASE_ANON_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const BASE = 'http://localhost:5184'
const MAIL = 'zzz.acces@kiwee-energie.invalid'
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

/** EXACTEMENT ce que fait `exigerAcces` : relire la ligne avec le jeton de l'appelant. */
const acces = async (jeton, table, id) => {
  const r = await fetch(
    U + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id) + '&select=id&limit=1',
    { headers: { apikey: ANON, Authorization: 'Bearer ' + jeton } })
  if (!r.ok) return { autorise: false, code: 503 }
  const l = await r.json()
  return { autorise: Array.isArray(l) && l.length > 0, code: r.status }
}

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
      await a('comptes?nom=like.ZZZ ACCES*', 'DELETE')
    }

    // ── UN PARTENAIRE, POUR LE CAS EXTERNE ──
    cree.part = (await (await a('comptes', 'POST', { nom: 'ZZZ ACCES', type_compte_id: TP })).json())[0].id
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'A', prenom: 'Z', email: MAIL, compte_id: cree.part, actif: true,
    })).json())[0].id
    const rp = (await (await a('roles_acces?code=eq.PARTENAIRE&select=id')).json())[0].id
    cree.acc = (await (await a('profils_autorises', 'POST', {
      email: MAIL, prenom: 'Z', nom: 'A', contact_id: cree.ct, role_acces_id: rp,
    })).json())[0].id
    const u = await (await fetch(U + '/auth/v1/admin/users', {
      method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: MAIL, email_confirm: true }),
    })).json()
    if (!u.id) throw new Error('utilisateur refusé : ' + JSON.stringify(u).slice(0, 160))
    cree.user = u.id

    const jp = await jetonDe(nav, MAIL)
    const co = (await (await a("profils?email=like.*@kiwee-energie.fr&actif=eq.true&select=email&limit=1")).json())[0]
    const jc = await jetonDe(nav, co.email)

    // ── DE VRAIS OBJETS DE KIWEE ──
    const mandat = (await (await a('mandats?select=id&limit=1')).json())[0]
    const contrat = (await (await a('contrats?select=id&limit=1')).json())[0]
    const piste = (await (await a('pistes?select=id&limit=1')).json())[0]
    const inter = (await (await a('interactions?select=id&limit=1')).json())[0]

    console.log('')
    console.log('══ ① CE QU UN PARTENAIRE OBTIENT ══')
    for (const [quoi, table, id] of [
      ['un mandat de KiWee', 'mandats', mandat && mandat.id],
      ['un contrat de KiWee', 'contrats', contrat && contrat.id],
      ['une piste de KiWee', 'pistes', piste && piste.id],
      ['une interaction de KiWee', 'interactions', inter && inter.id],
    ]) {
      if (!id) continue
      const r = await acces(jp, table, id)
      dire(!r.autorise, 'partenaire -> ' + quoi + ' : refuse',
        r.autorise ? '*** AUTORISE ***' : 'refuse')
    }

    console.log('')
    console.log('══ ② CE QU UN COMMERCIAL OBTIENT ══')
    //
    // SANS CECI, LE TEST NE PROUVE RIEN : un garde qui refuse tout le monde passerait ①, et plus
    // personne ne pourrait envoyer un mandat a la signature.
    for (const [quoi, table, id] of [
      ['un mandat', 'mandats', mandat && mandat.id],
      ['un contrat', 'contrats', contrat && contrat.id],
      ['une piste', 'pistes', piste && piste.id],
      ['une interaction', 'interactions', inter && inter.id],
    ]) {
      if (!id) continue
      const r = await acces(jc, table, id)
      dire(r.autorise, 'commercial -> ' + quoi + ' : passe',
        r.autorise ? 'passe' : '*** REFUSE — l equipe serait bloquee ***')
    }

    console.log('')
    console.log('══ ③ UN IDENTIFIANT QUI N EXISTE PAS ══')
    const r = await acces(jc, 'mandats', '00000000-0000-0000-0000-000000000000')
    dire(!r.autorise, 'un identifiant inconnu est refuse', r.autorise ? '*** AUTORISE ***' : 'refuse')
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
    console.log('')
    console.log('   nettoyage : fait')
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  LE GARDE DISTINGUE, ET NE BLOQUE PAS L EQUIPE'
    : '  *** ' + soucis + ' SOUCI(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
