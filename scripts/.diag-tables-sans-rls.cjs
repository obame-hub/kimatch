/**
 * LES TABLES QUE LA BOUCLE DU 24/09 A SAUTÉES.
 *
 * La migration `20260924203000` ferme les tables « par défaut », mais sa boucle ne parcourt que
 * `where c.relrowsecurity` — c'est-à-dire les tables où RLS est DÉJÀ activée. Une table sans RLS
 * n'est ni fermée, ni signalée : elle est simplement absente du compte rendu.
 *
 * C'est un angle que l'analyse statique ne peut pas trancher. On le mesure, et pour chaque table
 * trouvée on regarde ce qu'elle contient et ce qu'un partenaire en obtiendrait.
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

  const sansRls = (await c.query(
    "select c.relname, c.reltuples::bigint as lignes " +
    "from pg_class c join pg_namespace n on n.oid = c.relnamespace " +
    "where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity " +
    "order by c.reltuples desc")).rows

  console.log('')
  console.log('   tables SANS RLS active : ' + sansRls.length)
  if (sansRls.length === 0) {
    console.log('   -> rien a signaler.')
    await c.end()
    return
  }

  // ── CE QU'UN PARTENAIRE EN OBTIENDRAIT ──
  await c.query('begin')
  let fuites = 0
  try {
    const tp = (await c.query("select id from types_comptes where code='PARTENAIRE'")).rows[0].id
    const part = (await c.query(
      'insert into comptes (nom, type_compte_id) values ($1,$2) returning id',
      ['ZZZ RLS', tp])).rows[0].id
    const profil = (await c.query(
      'select p.id from profils p ' +
      'join profils_roles_acces pra on pra.profil_id = p.id ' +
      'join roles_acces r on r.id = pra.role_acces_id ' +
      'where p.actif and not r.ouvre_administration limit 1')).rows[0].id
    await c.query('update profils set compte_partenaire_id=$1 where id=$2', [part, profil])

    console.log('')
    console.log('══ CE QU UN PARTENAIRE Y LIT ══')
    console.log('')

    for (const t of sansRls) {
      let total
      try {
        total = (await c.query('select count(*) n from public.' + t.relname)).rows[0].n
      } catch { continue }

      await c.query('savepoint v')
      let vu = null
      try {
        await c.query(
          "select set_config('request.jwt.claims', " +
          "json_build_object('sub', $1::text, 'role','authenticated')::text, true)", [profil])
        await c.query('set local role authenticated')
        vu = (await c.query('select count(*) n from public.' + t.relname)).rows[0].n
      } catch {
        vu = null
      } finally {
        await c.query('reset role').catch(() => {})
        await c.query('rollback to savepoint v')
      }

      if (vu === null) {
        console.log('     ok    | ' + t.relname.padEnd(38) + ' — refusee')
        continue
      }
      const fuite = Number(vu) > 0
      if (fuite) fuites++
      console.log('   ' + (fuite ? ' FUITE ' : '  ok   ') + ' | ' + t.relname.padEnd(38) +
        ' — ' + vu + ' / ' + total + ' ligne(s)')
    }
  } finally {
    await c.query('rollback')
  }

  console.log('')
  console.log('   -> ' + (fuites === 0
    ? 'aucune de ces tables ne rend quoi que ce soit a un partenaire.'
    : '*** ' + fuites + ' table(s) lui rendent des lignes ***'))

  await c.end()
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
