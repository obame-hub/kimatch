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
    const p = (await c.query(
      'insert into comptes (nom, type_compte_id) values ($1,$2) returning id',
      ['zzz garde', tp])).rows[0].id
    const u = (await c.query(
      "select p.id from profils p join profils_roles_acces pra on pra.profil_id=p.id " +
      "join roles_acces r on r.id=pra.role_acces_id where p.actif and not r.ouvre_administration limit 1"
    )).rows[0].id
    await c.query('update profils set compte_partenaire_id=$1 where id=$2', [p, u])

    await c.query(
      "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role','authenticated')::text, true)",
      [u])
    await c.query('set local role authenticated')

    console.log('  est_partenaire()     : ' + (await c.query('select public.est_partenaire() as e')).rows[0].e)

    try {
      await c.query("select public.refuse_si_partenaire('essai')")
      console.log('  refuse_si_partenaire : *** NE LEVE PAS ***')
    } catch (e) {
      console.log('  refuse_si_partenaire : leve bien — ' + e.message.slice(0, 55))
    }

    await c.query('rollback to savepoint sp').catch(() => {})
    await c.query('savepoint sp')
    const s = (await c.query('select id from sites limit 1')).rows[0].id
    try {
      await c.query('select public.fn_deplacer_site($1,$2,$3)', [s, p, 'zzz'])
      console.log('  fn_deplacer_site     : *** PASSE — le garde ne joue pas ***')
    } catch (e) {
      console.log('  fn_deplacer_site     : refuse — ' + e.message.slice(0, 55))
    }
  } finally {
    await c.query('rollback')
    await c.end()
  }
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
