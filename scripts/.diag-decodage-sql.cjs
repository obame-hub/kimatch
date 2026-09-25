/**
 * QUELLE FORMULE SQL DÉCODE CORRECTEMENT UN CHEMIN PERCENT-ENCODÉ ?
 *
 * La policy à venir compare `chemin_du_document(documents.url)` à `storage.objects.name`. Si le
 * décodage rate un caractère, le fichier devient invisible — sans erreur, sans trace.
 *
 * On essaie les formulations sur les VRAIES urls et l'on compte celles qui retrouvent leur fichier.
 * On garde celle qui en retrouve le plus. Aucune n'est écrite dans une migration avant d'être
 * mesurée ici.
 */
const fs = require('fs')
const { Client } = require('pg')

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
const c = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

const FORMULES = {
  // ① `convert_from` sur la chaîne où % devient \x — la plus directe.
  'convert_from + replace %->\\x':
    `convert_from(decode(replace(substring(u from position('/documents/' in u) + 11), '%', '\\x'), 'escape'), 'UTF8')`,

  // ② Sans décodage du tout : les chemins sans caractère spécial passent déjà.
  'aucun decodage':
    `substring(u from position('/documents/' in u) + 11)`,

  // ③ Les remplacements explicites, limités aux cas vus dans les données.
  'replace explicites':
    `replace(replace(replace(replace(substring(u from position('/documents/' in u) + 11),
       '%20',' '), '%28','('), '%29',')'), '%27','''')`,
}

;(async () => {
  await c.connect()

  // On fabrique une table temporaire avec les urls et les noms, pour comparer en SQL pur.
  await c.query('create temp table zzz_urls as select url as u from documents where url is not null')
  await c.query("create temp table zzz_noms as select name as n from storage.objects where bucket_id='documents'")
  const total = (await c.query('select count(*) n from zzz_noms')).rows[0].n

  console.log('')
  console.log('   fichiers dans le seau : ' + total)
  console.log('')
  console.log('══ CE QUE CHAQUE FORMULE RETROUVE ══')

  let meilleure = null
  for (const [nom, expr] of Object.entries(FORMULES)) {
    try {
      const r = await c.query(
        'select count(*) n from zzz_noms o where exists (select 1 from zzz_urls d where ' + expr + ' = o.n)')
      const n = Number(r.rows[0].n)
      const pct = (n / Number(total) * 100).toFixed(1)
      console.log('   ' + nom.padEnd(30) + ' : ' + String(n).padStart(6) + '  (' + pct + ' %)')
      if (!meilleure || n > meilleure.n) meilleure = { nom, expr, n }
    } catch (e) {
      console.log('   ' + nom.padEnd(30) + ' : ECHEC — ' + e.message.slice(0, 60))
    }
  }

  console.log('')
  if (meilleure) {
    console.log('   -> a retenir : ' + meilleure.nom + '  (' + meilleure.n + ' fichiers retrouves)')

    // Ce que cette formule laisse de côté, pour le dire plutôt que de le découvrir plus tard.
    const restes = await c.query(
      'select o.n from zzz_noms o where not exists (select 1 from zzz_urls d where ' +
      meilleure.expr + ' = o.n) limit 6')
    if (restes.rows.length) {
      console.log('')
      console.log('   ce qu elle ne retrouve pas (6 premiers) :')
      for (const x of restes.rows) console.log('      ' + x.n.slice(0, 82))
    }
  }

  await c.end()
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
