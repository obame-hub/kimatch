/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * UN PARTENAIRE CREE SES PROPRES COMPTES, ET NE VOIT QU'EUX
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoelle, 24/09/2026 : « il creera lui-meme ses comptes et objets, c'est pas a nous de rattacher ».
 *
 * C'est aussi ce que Michel decrivait : « s'ils ont cree des comptes, des contacts, des compteurs,
 * mandats, ils ont acces a leur activite ».
 *
 * ══ CE QU'ON EPROUVE ══
 *
 * Le parcours reel d'un partenaire livre a lui-meme : il cree un compte, un contact dessus, et il
 * les retrouve. Et pendant ce temps, il ne voit RIEN de KiWee — ni les 2 783 comptes, ni les
 * pistes, ni les opportunites.
 *
 * TOUT SE PASSE DANS UNE TRANSACTION ANNULEE : la base ressort exactement comme avant, et l'on peut
 * donc rejouer cet essai sur la production sans rien y laisser.
 */
const fs = require('fs')
const { Client } = require('pg')

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
if (!m) { console.error('SUPABASE_DB_URL absent de .env.local'); process.exit(1) }
const c = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

let echecs = 0
const dire = (ok, texte) => { if (!ok) echecs++; console.log('   ' + (ok ? '  ok   ' : ' ECHEC ') + ' | ' + texte) }

;(async () => {
  await c.connect()
  await c.query('begin')
  try {
    const tp = (await c.query("select id from types_comptes where code='PARTENAIRE'")).rows[0].id
    const tc = (await c.query("select id from types_comptes where code='CLIENT'")).rows[0].id

    // Le partenaire, et l'un de ses utilisateurs.
    const partenaire = (await c.query(
      'insert into comptes (nom, type_compte_id) values ($1,$2) returning id',
      ['ZZZ ESSAI PARTENAIRE', tp])).rows[0].id
    const u = (await c.query('select id from profils where actif limit 1')).rows[0].id
    await c.query('update profils set compte_partenaire_id=$1 where id=$2', [partenaire, u])

    const totalAvant = (await c.query('select count(*)::int as n from comptes')).rows[0].n

    // ── ON SE MET A SA PLACE ──
    await c.query(
      "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role','authenticated')::text, true)",
      [u])
    await c.query('set local role authenticated')

    console.log('')
    console.log('══ IL CREE SON PATRIMOINE LUI-MEME ══')

    // ① Un compte, en se designant apporteur.
    const client = (await c.query(
      'insert into comptes (nom, type_compte_id, apporteur_partenaire_id) values ($1,$2,$3) returning id',
      ['ZZZ CLIENT DU PARTENAIRE', tc, partenaire])).rows[0].id
    dire(Boolean(client), 'il cree un compte client')

    // ② Il le retrouve.
    const vu = (await c.query('select count(*)::int as n from comptes where id=$1', [client])).rows[0].n
    dire(vu === 1, 'et il le retrouve dans sa liste')

    // ③ Un contact dessus.
    const contact = (await c.query(
      'insert into contacts (nom, prenom, email, compte_id, actif) values ($1,$2,$3,$4,true) returning id',
      ['ESSAI', 'Contact', 'zzz.contact@exemple.invalid', client])).rows[0].id
    dire(Boolean(contact), 'il ajoute un contact sur ce compte')
    const vuC = (await c.query('select count(*)::int as n from contacts where id=$1', [contact])).rows[0].n
    dire(vuC === 1, 'et il le retrouve')

    console.log('')
    console.log('══ ET IL NE VOIT RIEN DE KIWEE ══')

    const n = async (t) => (await c.query('select count(*)::int as n from ' + t)).rows[0].n
    const comptes = await n('comptes')
    dire(comptes === 2, 'comptes visibles : ' + comptes + ' (le sien + celui qu il vient de creer) sur ' + totalAvant + ' en base')
    const pistes = await n('pistes')
    dire(pistes === 0, 'pistes visibles : ' + pistes + ' (aucune attendue — travail interne de KiWee)')
    const opp = await n('opportunites')
    dire(opp === 0, 'opportunites visibles : ' + opp + ' (aucune attendue)')
    const profils = await n('profils')
    dire(profils === 1, 'profils visibles : ' + profils + ' (le sien seulement)')

    console.log('')
    console.log('══ CE QU IL NE PEUT PAS FAIRE ══')

    // Creer un compte sans se designer apporteur : il ne le reverrait jamais.
    let refuse = false
    await c.query('savepoint s1')
    try {
      await c.query('insert into comptes (nom, type_compte_id) values ($1,$2)', ['ZZZ ORPHELIN', tc])
    } catch { refuse = true }
    await c.query('rollback to savepoint s1')
    dire(refuse, 'creer un compte sans se designer apporteur est refuse')

    // Creer un compte au nom d'un AUTRE partenaire.
    const autre = (await c.query("select id from comptes where type_compte_id=$1 and id<>$2 limit 1", [tp, partenaire])).rows[0]
    if (autre) {
      let refuse2 = false
      await c.query('savepoint s2')
      try {
        await c.query('insert into comptes (nom, type_compte_id, apporteur_partenaire_id) values ($1,$2,$3)',
          ['ZZZ VOL', tc, autre.id])
      } catch { refuse2 = true }
      await c.query('rollback to savepoint s2')
      dire(refuse2, 'creer un compte au nom d un AUTRE partenaire est refuse')
    }

    await c.query('reset role')
    await c.query("select set_config('request.jwt.claims','',true)")
  } finally {
    await c.query('rollback')
    await c.end()
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(echecs === 0 ? '  LE PARTENAIRE EST AUTONOME ET CLOISONNE' : '  *** ' + echecs + ' ECHEC(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('  (transaction annulee : la base est inchangee)')
  console.log('')
  process.exit(echecs === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
