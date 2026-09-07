// Interrogation en lecture seule de la base, pour vérifier avant d'affirmer.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = 'C:\\Users\\nghou\\kiwee-os'
const env = fs.readFileSync(path.join(RACINE, '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
if (!m) { console.error('SUPABASE_DB_URL absent'); process.exit(1) }

const sql = fs.readFileSync(process.argv[2], 'utf8')

;(async () => {
  const c = new Client({ connectionString: m[1].trim(), ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    const res = await c.query(sql)
    const tous = Array.isArray(res) ? res : [res]
    for (const r of tous) {
      if (!r.rows) continue
      console.log('--- ' + r.rows.length + ' ligne(s)')
      console.log(JSON.stringify(r.rows, null, 1))
    }
  } finally {
    await c.end()
  }
})().catch((e) => { console.error(e.message); process.exit(1) })
