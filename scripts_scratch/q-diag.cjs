const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.join(__dirname, '..')
const env = fs.readFileSync(path.join(RACINE, '.env.local'), 'utf8')
const url = env.match(/^SUPABASE_DB_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
const sql = fs.readFileSync(process.argv[2], 'utf8')

const c = new Client({ connectionString: url })
;(async () => {
  await c.connect()
  for (const bloc of sql.split(/^-- ---+$/m)) {
    const q = bloc.trim()
    if (!q) continue
    try {
      const r = await c.query(q)
      console.log('\n### ' + q.split('\n')[0].slice(0, 120))
      console.log(JSON.stringify(r.rows, null, 1))
    } catch (e) {
      console.log('\n### ERREUR : ' + q.split('\n')[0].slice(0, 120))
      console.log(e.message)
    }
  }
  await c.end()
})()
