/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'UN PARTENAIRE PEUT ÉCRIRE — ET SUR QUI
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Tout ce qui a été mesuré jusqu'ici porte sur la LECTURE. Un cloisonnement peut être parfait en
 * lecture et ouvert en écriture : les policies `select` et `update` sont distinctes, et une table
 * peut très bien cacher une ligne tout en acceptant qu'on la modifie.
 *
 * TROIS QUESTIONS, dans l'ordre de gravité :
 *
 *   ① peut-il MODIFIER ce qui appartient à KiWee ou à un autre partenaire ?
 *   ② peut-il SUPPRIMER ce qui ne lui appartient pas ?
 *   ③ peut-il CRÉER un objet rattaché au compte d'un autre ?
 *
 * ON MESURE LE RÉSULTAT, PAS LE CODE HTTP. Sous RLS, un `UPDATE` filtré rend 200 avec ZÉRO ligne
 * et aucune erreur : le refus est silencieux. On relit donc la ligne après coup pour savoir si
 * elle a bougé — c'est la seule preuve qui vaille.
 *
 * DEUX PARTENAIRES sont créés, pour éprouver aussi l'étanchéité entre externes : la question n'est
 * pas seulement « voit-il KiWee », c'est aussi « voit-il son concurrent ».
 *
 * TOUT EST ANNULÉ : le script travaille dans une transaction qu'il abandonne à la fin.
 */
const fs = require('fs')
const { Client } = require('pg')

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
const c = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

let failles = 0
const dire = (ok, texte, detail) => {
  if (!ok) failles++
  console.log('   ' + (ok ? '  ok   ' : ' FAILLE') + ' | ' + texte + (detail ? '  — ' + detail : ''))
}

/** Agir au nom d'un profil, puis revenir au service. Rend { erreur, lignes }. */
async function commeLui(profil, sql, params) {
  await c.query('savepoint e')
  try {
    await c.query(
      "select set_config('request.jwt.claims', " +
      "json_build_object('sub', $1::text, 'role','authenticated')::text, true)", [profil])
    await c.query('set local role authenticated')
    const r = await c.query(sql, params)
    await c.query('reset role')
    return { erreur: null, lignes: r.rowCount }
  } catch (e) {
    await c.query('reset role').catch(() => {})
    await c.query('rollback to savepoint e')
    return { erreur: e.message.slice(0, 60), lignes: 0 }
  }
}

;(async () => {
  await c.connect()
  await c.query('begin')
  try {
    const tp = (await c.query("select id from types_comptes where code='PARTENAIRE'")).rows[0].id
    const tc = (await c.query("select id from types_comptes where code='CLIENT'")).rows[0].id

    // ── DEUX PARTENAIRES CONCURRENTS, ET UN CLIENT DE KIWEE ──
    const pA = (await c.query('insert into comptes (nom,type_compte_id) values ($1,$2) returning id',
      ['ZZZ ECR PARTENAIRE A', tp])).rows[0].id
    const pB = (await c.query('insert into comptes (nom,type_compte_id) values ($1,$2) returning id',
      ['ZZZ ECR PARTENAIRE B', tp])).rows[0].id
    const client = (await c.query('insert into comptes (nom,type_compte_id) values ($1,$2) returning id',
      ['ZZZ ECR CLIENT KIWEE', tc])).rows[0].id

    const profils = (await c.query(
      'select p.id from profils p ' +
      'join profils_roles_acces pra on pra.profil_id = p.id ' +
      'join roles_acces r on r.id = pra.role_acces_id ' +
      'where p.actif and not r.ouvre_administration limit 2')).rows
    const uA = profils[0].id
    const uB = profils[1].id
    await c.query('update profils set compte_partenaire_id=$1 where id=$2', [pA, uA])
    await c.query('update profils set compte_partenaire_id=$1 where id=$2', [pB, uB])

    // ── DES OBJETS À CONVOITER ──
    const siteB = (await c.query('insert into sites (nom,compte_id) values ($1,$2) returning id',
      ['ZZZ ECR SITE DE B', pB])).rows[0].id
    const siteK = (await c.query('insert into sites (nom,compte_id) values ($1,$2) returning id',
      ['ZZZ ECR SITE DE KIWEE', client])).rows[0].id
    const ctK = (await c.query(
      'insert into contacts (nom,prenom,compte_id,actif) values ($1,$2,$3,true) returning id',
      ['ECR', 'Client', client])).rows[0].id

    console.log('')
    console.log('   A = ' + pA.slice(0, 8) + '   B = ' + pB.slice(0, 8) + '   client KiWee = ' + client.slice(0, 8))

    console.log('')
    console.log('══ ⓪ IL ECRIT BIEN CHEZ LUI ══')
    //
    // SANS CE CONTROLE, TOUT LE RESTE NE PROUVE RIEN. Une base ou personne n'ecrit rien passerait
    // les quinze scenarios ci-dessous avec un sans-faute — et un partenaire incapable de creer un
    // site chez lui serait une panne, pas une securite.
    let r0 = await commeLui(uA, 'insert into sites (nom,compte_id) values ($1,$2) returning id',
      ['ZZZ ECR CHEZ LUI', pA])
    dire(!r0.erreur && r0.lignes > 0, 'A cree un site sous SON PROPRE compte',
      r0.erreur ? '*** REFUSE : ' + r0.erreur + ' ***' : r0.lignes + ' ligne(s)')

    const sienId = (await c.query('select id from sites where nom=$1', ['ZZZ ECR CHEZ LUI'])).rows[0]
    if (sienId) {
      r0 = await commeLui(uA, 'update sites set nom=$1 where id=$2', ['ZZZ ECR RENOMME', sienId.id])
      const n0 = (await c.query('select nom from sites where id=$1', [sienId.id])).rows[0].nom
      dire(n0 === 'ZZZ ECR RENOMME', 'A renomme SON PROPRE site',
        n0 === 'ZZZ ECR RENOMME' ? 'renomme' : '*** REFUSE : ' + (r0.erreur || '0 ligne') + ' ***')
    }

    console.log('')
    console.log('══ ① MODIFIER CE QUI N EST PAS A LUI ══')

    // Le compte d'un client de KiWee.
    let r = await commeLui(uA, 'update comptes set nom=$1 where id=$2', ['VOLE PAR A', client])
    let nom = (await c.query('select nom from comptes where id=$1', [client])).rows[0].nom
    dire(nom === 'ZZZ ECR CLIENT KIWEE',
      'A ne renomme pas le compte d un client de KiWee', nom === 'ZZZ ECR CLIENT KIWEE'
        ? (r.erreur ? 'refuse : ' + r.erreur : r.lignes + ' ligne(s) touchee(s)')
        : '*** RENOMME EN « ' + nom + ' » ***')

    // Le compte de l'autre partenaire.
    r = await commeLui(uA, 'update comptes set nom=$1 where id=$2', ['VOLE PAR A', pB])
    nom = (await c.query('select nom from comptes where id=$1', [pB])).rows[0].nom
    dire(nom === 'ZZZ ECR PARTENAIRE B',
      'A ne renomme pas le compte du partenaire B', nom === 'ZZZ ECR PARTENAIRE B'
        ? (r.erreur ? 'refuse : ' + r.erreur : r.lignes + ' ligne(s) touchee(s)')
        : '*** RENOMME EN « ' + nom + ' » ***')

    // Le site d'un client, déplacé vers son propre compte : le vol direct, sans passer par la RPC.
    r = await commeLui(uA, 'update sites set compte_id=$1 where id=$2', [pA, siteK])
    let cid = (await c.query('select compte_id from sites where id=$1', [siteK])).rows[0].compte_id
    dire(cid === client, 'A ne s approprie pas le site d un client', cid === client
      ? (r.erreur ? 'refuse : ' + r.erreur : r.lignes + ' ligne(s)')
      : '*** LE SITE EST PASSE SUR SON COMPTE ***')

    // Le site de l'autre partenaire.
    r = await commeLui(uA, 'update sites set compte_id=$1 where id=$2', [pA, siteB])
    cid = (await c.query('select compte_id from sites where id=$1', [siteB])).rows[0].compte_id
    dire(cid === pB, 'A ne s approprie pas le site du partenaire B', cid === pB
      ? (r.erreur ? 'refuse : ' + r.erreur : r.lignes + ' ligne(s)')
      : '*** LE SITE DE B EST PASSE SUR LE COMPTE DE A ***')

    // Un contact de KiWee.
    r = await commeLui(uA, 'update contacts set nom=$1 where id=$2', ['VOLE', ctK])
    nom = (await c.query('select nom from contacts where id=$1', [ctK])).rows[0].nom
    dire(nom === 'ECR', 'A ne modifie pas un contact de KiWee', nom === 'ECR'
      ? (r.erreur ? 'refuse : ' + r.erreur : r.lignes + ' ligne(s)')
      : '*** MODIFIE ***')

    console.log('')
    console.log('══ ② SUPPRIMER CE QUI N EST PAS A LUI ══')

    for (const [quoi, table, id, temoin] of [
      ['le site d un client de KiWee', 'sites', siteK, client],
      ['le site du partenaire B', 'sites', siteB, pB],
      ['le compte d un client de KiWee', 'comptes', client, null],
      ['un contact de KiWee', 'contacts', ctK, null],
    ]) {
      r = await commeLui(uA, 'delete from ' + table + ' where id=$1', [id])
      const reste = (await c.query('select count(*) n from ' + table + ' where id=$1', [id])).rows[0].n
      dire(Number(reste) === 1, 'A ne supprime pas ' + quoi,
        Number(reste) === 1 ? (r.erreur ? 'refuse : ' + r.erreur : r.lignes + ' ligne(s)') : '*** SUPPRIME ***')
    }

    console.log('')
    console.log('══ ③ CREER SOUS LE COMPTE D UN AUTRE ══')

    for (const [quoi, sql, params, table] of [
      ['un site sous le compte d un client de KiWee',
        'insert into sites (nom,compte_id) values ($1,$2) returning id', ['ZZZ ECR INTRUS', client], 'sites'],
      ['un site sous le compte du partenaire B',
        'insert into sites (nom,compte_id) values ($1,$2) returning id', ['ZZZ ECR INTRUS B', pB], 'sites'],
      ['un contact sous le compte d un client de KiWee',
        'insert into contacts (nom,prenom,compte_id,actif) values ($1,$2,$3,true) returning id',
        ['INTRUS', 'Z', client], 'contacts'],
    ]) {
      r = await commeLui(uA, sql, params)
      // Sous RLS, un insert refusé lève ; mais un `with check` absent le laisserait passer.
      const cree = !r.erreur && r.lignes > 0
      dire(!cree, 'A ne cree pas ' + quoi,
        cree ? '*** CREE ***' : 'refuse : ' + (r.erreur || '0 ligne'))
    }

    console.log('')
    console.log('══ ④ SE RATTACHER AILLEURS ══')
    //
    // La faille du 24/09 : un partenaire mettait `compte_partenaire_id` à null et voyait toute la
    // base. Un déclencheur l'en empêche désormais — on vérifie qu'il tient encore, et qu'il couvre
    // aussi le fait de se rattacher au compte d'un AUTRE.
    r = await commeLui(uA, 'update profils set compte_partenaire_id=null where id=$1', [uA])
    let att = (await c.query('select compte_partenaire_id from profils where id=$1', [uA])).rows[0].compte_partenaire_id
    dire(att === pA, 'A ne se detache pas de son compte', att === pA
      ? 'refuse : ' + (r.erreur || '0 ligne') : '*** DETACHE ***')

    r = await commeLui(uA, 'update profils set compte_partenaire_id=$1 where id=$2', [pB, uA])
    att = (await c.query('select compte_partenaire_id from profils where id=$1', [uA])).rows[0].compte_partenaire_id
    dire(att === pA, 'A ne se rattache pas au compte de B', att === pA
      ? 'refuse : ' + (r.erreur || '0 ligne') : '*** RATTACHE A B ***')

    r = await commeLui(uA, 'update profils set compte_partenaire_id=null where id=$1', [uB])
    att = (await c.query('select compte_partenaire_id from profils where id=$1', [uB])).rows[0].compte_partenaire_id
    dire(att === pB, 'A ne detache pas le profil de B', att === pB
      ? 'refuse : ' + (r.erreur || '0 ligne') : '*** LE PROFIL DE B EST DETACHE ***')
  } finally {
    await c.query('rollback')
    await c.end()
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(failles === 0
    ? '  UN PARTENAIRE N ECRIT QUE CHEZ LUI'
    : '  *** ' + failles + ' FAILLE(S) EN ECRITURE ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(failles === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
