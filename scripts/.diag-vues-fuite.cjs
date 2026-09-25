/**
 * LES TROIS VUES QUI RENDENT UNE LIGNE : EST-CE LA SIENNE, OU CELLE D'UN AUTRE ?
 *
 * Un compte est rendu « 1 ligne » — ce n'est une fuite que si cette ligne n'est pas la sienne.
 * On ne compte plus : on REGARDE ce qui sort.
 */
const fs = require('fs')
const { Client } = require('pg')

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
const c = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

;(async () => {
  await c.connect()
  await c.query('begin')
  try {
    const tp = (await c.query("select id from types_comptes where code='PARTENAIRE'")).rows[0].id
    const part = (await c.query(
      'insert into comptes (nom, type_compte_id) values ($1,$2) returning id',
      ['ZZZ VUES PARTENAIRE', tp])).rows[0].id
    const profil = (await c.query(
      'select p.id from profils p ' +
      'join profils_roles_acces pra on pra.profil_id = p.id ' +
      'join roles_acces r on r.id = pra.role_acces_id ' +
      'where p.actif and not r.ouvre_administration limit 1')).rows[0].id
    await c.query('update profils set compte_partenaire_id=$1 where id=$2', [part, profil])

    console.log('')
    console.log('   son compte a lui : ' + part)
    console.log('')

    for (const v of ['docusign_connexions', 'v_comptes_liste', 'v_patrimoine_synthese']) {
      await c.query('savepoint v')
      await c.query(
        "select set_config('request.jwt.claims', " +
        "json_build_object('sub', $1::text, 'role','authenticated')::text, true)", [profil])
      await c.query('set local role authenticated')
      const r = await c.query('select * from public.' + v + ' limit 3')
      await c.query('reset role')
      await c.query('rollback to savepoint v')

      console.log('══ ' + v + ' ══')
      for (const ligne of r.rows) {
        // On n'affiche que de quoi juger : ce qui identifie, pas le contenu.
        const vu = {}
        for (const k of Object.keys(ligne)) {
          if (/(^id$|compte|nom|email|raison)/i.test(k)) vu[k] = ligne[k]
        }
        console.log('   ' + JSON.stringify(vu).slice(0, 230))
      }
      console.log('')
    }
  } finally {
    await c.query('rollback')
    await c.end()
  }
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
