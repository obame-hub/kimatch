/** CE QUE `docusign_connexions` EXPOSE, ET À QUI. */
const fs = require('fs')
const { Client } = require('pg')
const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
const c = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

;(async () => {
  await c.connect()
  console.log('')
  console.log('══ SA DEFINITION ══')
  console.log((await c.query(
    "select pg_get_viewdef('public.docusign_connexions'::regclass, true) d")).rows[0].d)

  console.log('══ SES COLONNES ══')
  const cols = (await c.query(
    "select column_name from information_schema.columns " +
    "where table_name='docusign_connexions' order by ordinal_position")).rows
  console.log('   ' + cols.map((x) => x.column_name).join(', '))

  console.log('')
  console.log('══ LES TABLES QU ELLE LIT, ET LEUR CLOISONNEMENT ══')
  const t = (await c.query(
    "select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
    "where n.nspname='public' and c.relname in ('docusign_tokens','profils','organisations','comptes')")).rows
  console.table(t)

  console.log('══ LES POLICIES DE docusign_tokens ══')
  console.table((await c.query(
    "select polname, polpermissive, pg_get_expr(polqual, polrelid) as expr " +
    "from pg_policy where polrelid = to_regclass('public.docusign_tokens')")).rows)

  await c.end()
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
