/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * KIMATCH EST FERMÉ AUX PARTENAIRES, ET SEULEMENT À EUX
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 26/09/2026 : « il faut fermer Kimatch à un partenaire s'il a son interface externe ».
 *
 * Le risque est des deux côtés, et le second se verrait dans l'heure :
 *
 *   ① un partenaire ne doit plus pouvoir être rattaché — donc plus de session Kimatch
 *   ② l'équipe ne doit rien perdre : ni connexion, ni écriture sur les profils
 *   ③ son espace EXTERNE doit continuer de fonctionner, sinon on l'a coupé de tout
 *
 * TOUT EST ANNULÉ : le script travaille dans une transaction qu'il abandonne.
 */
const fs = require('fs')
const crypto = require('crypto')
const { Client } = require('pg')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const PROD = process.env.BASE_PROD || 'https://kimatch.fr'

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
const db = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

let soucis = 0
const dire = (ok, texte, detail) => {
  if (!ok) soucis++
  console.log('   ' + (ok ? '  ok   ' : ' SOUCI ') + ' | ' + texte + (detail ? '  — ' + detail : ''))
}

;(async () => {
  await db.connect()

  // ── ① LA PORTE EST FERMÉE ──
  await db.query('begin')
  try {
    console.log('')
    console.log('══ ① UN PARTENAIRE NE PEUT PLUS ENTRER DANS KIMATCH ══')

    const tp = (await db.query("select id from types_comptes where code='PARTENAIRE'")).rows[0].id
    const part = (await db.query(
      'insert into comptes (nom, type_compte_id) values ($1,$2) returning id',
      ['ZZZ FERME', tp])).rows[0].id
    const u = (await db.query(
      'select p.id from profils p ' +
      'join profils_roles_acces pra on pra.profil_id = p.id ' +
      'join roles_acces r on r.id = pra.role_acces_id ' +
      'where p.actif and not r.ouvre_administration and p.compte_partenaire_id is null limit 1'
    )).rows[0].id

    /* UN POINT DE SAUVEGARDE AVANT L'ESSAI : une exception abandonne toute la transaction, et
       les vérifications suivantes tomberaient sur « current transaction is aborted ». */
    await db.query('savepoint r')
    let refuse = false
    try {
      await db.query('update profils set compte_partenaire_id=$1 where id=$2', [part, u])
    } catch (e) {
      refuse = e.code === '42501'
    }
    await db.query('rollback to savepoint r')
    dire(refuse, 'un profil ne se rattache plus a un compte partenaire',
      refuse ? 'refuse' : '*** LE RATTACHEMENT PASSE ***')

    /* MÊME AVEC LA CLÉ DE SERVICE. C'est le point : l'ancien garde laissait passer
       `auth.uid() is null`, ce qui incluait l'administration et les scripts. */
    dire(refuse, 'et meme avec la cle de service', refuse ? 'refuse aussi' : '*** PASSE ***')

    console.log('')
    console.log('══ ② L EQUIPE NE PERD RIEN ══')

    await db.query('savepoint s')
    let ecritureOk = true
    try {
      await db.query('update profils set nom = nom where id=$1', [u])
    } catch {
      ecritureOk = false
    }
    await db.query('rollback to savepoint s')
    dire(ecritureOk, 'les ecritures ordinaires sur profils passent')

    const combien = (await db.query(
      "select count(*) n from profils p " +
      "join profils_roles_acces pra on pra.profil_id = p.id " +
      "join roles_acces r on r.id = pra.role_acces_id " +
      "where p.actif and p.email like '%@kiwee-energie.fr'")).rows[0].n
    dire(Number(combien) > 5, 'les profils de l equipe sont intacts', combien + ' actifs')

    const rattaches = (await db.query(
      'select count(*) n from profils where compte_partenaire_id is not null')).rows[0].n
    dire(Number(rattaches) === 0, 'plus aucun profil rattache a un partenaire',
      rattaches + ' rattache(s)')
  } finally {
    await db.query('rollback')
  }

  // ── ③ L'ESPACE EXTERNE FONCTIONNE TOUJOURS ──
  console.log('')
  console.log('══ ③ SON ESPACE EXTERNE MARCHE TOUJOURS ══')
  //
  // Sans cela, on l'aurait coupé de tout : ni Kimatch, ni sa page. C'est le risque exact de
  // cette fermeture, et c'est celui qui se verrait le plus vite.
  const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
  const a = (c, meth, b) => fetch(U + '/rest/v1/' + c, {
    method: meth || 'GET',
    headers: Object.assign({}, H, { Prefer: 'return=representation' }),
    body: b ? JSON.stringify(b) : undefined,
  })

  await a('cles_api_partenaires?libelle=eq.ZZZ%20ferme', 'DELETE')
  const partReel = (await (await a("comptes?nom=eq.PARTENAIRE%20DE%20TEST&select=id")).json())[0]

  if (!partReel) {
    dire(false, 'le compte PARTENAIRE DE TEST existe', '*** absent ***')
  } else {
    const cle = 'kw_' + crypto.randomBytes(32).toString('base64url')
    await a('cles_api_partenaires', 'POST', {
      compte_id: partReel.id, libelle: 'ZZZ ferme', prefixe: cle.slice(0, 11),
      empreinte: crypto.createHash('sha256').update(cle).digest('hex'),
    })

    const r = await fetch(PROD + '/api/partenaire/patrimoine', {
      headers: { Authorization: 'Bearer ' + cle },
    })
    const corps = r.ok ? await r.json() : null
    dire(r.status === 200, 'son API repond toujours', 'HTTP ' + r.status)
    dire(corps && Array.isArray(corps.comptes) && corps.comptes.length > 0,
      'et elle rend bien son patrimoine',
      corps ? (corps.comptes ?? []).length + ' compte(s)' : 'rien')

    const page = await fetch(PROD + '/partenaire')
    dire(page.status === 200, 'sa page s ouvre toujours', 'HTTP ' + page.status)

    await a('cles_api_partenaires?libelle=eq.ZZZ%20ferme', 'DELETE')
  }

  await db.end()

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  KIMATCH EST FERME, SON ESPACE EXTERNE EST OUVERT'
    : '  *** ' + soucis + ' SOUCI(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
