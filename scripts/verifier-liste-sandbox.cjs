#!/usr/bin/env node
/**
 * LA LISTE DE TABLES DE LA RECOPIE SANDBOX EST-ELLE ENCORE COMPLÈTE ?
 *
 * Lancement :  npm run verifier:sandbox
 *
 * `api/admin/refresh-sandbox.ts` énumère À LA MAIN les tables à recopier vers la sandbox. Rien ne
 * signalait qu'elle avait pris du retard : le 31/08/2026, la base portait 133 tables et la liste
 * en nommait 107. Les 24 restantes n'étaient pas recopiées — sans erreur, sans avertissement.
 *
 * Ce qui manquait n'était pas anecdotique : 3 535 rattachements contact-compte, 2 098 liens
 * recommandation-compteur, 1 907 durées de version, plus les pistes, les opportunités, les
 * requêtes et quatre jeux de statuts. La sandbox était vide là où la production ne l'est pas —
 * et répéter un geste dans une sandbox qui a perdu ses tables de liaison ne prouve rien.
 *
 * D'où ce contrôle : à lancer après toute migration qui crée une table. Il ne modifie rien.
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.join(__dirname, '..')
const env = fs.readFileSync(path.join(RACINE, '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
if (!m) {
  console.error('SUPABASE_DB_URL absent de .env.local')
  process.exit(1)
}
const url = m[1].trim().replace(/^["']|["']$/g, '')

const src = fs.readFileSync(path.join(RACINE, 'api/admin/refresh-sandbox.ts'), 'utf8')
const bloc = src.match(/const TABLES_IN_ORDER = \[([\s\S]*?)\n\]/)
if (!bloc) {
  console.error('TABLES_IN_ORDER introuvable dans refresh-sandbox.ts — le format a change')
  process.exit(1)
}
const listees = new Set([...bloc[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]))
const exclues = new Set(
  [...(src.match(/EXCLUDED_TABLES = new Set\(\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]),
)

;(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  // Lecture seule, et forcee : ce controle ne doit rien pouvoir ecrire, meme par accident.
  await c.query('SET default_transaction_read_only = on')
  await c.query('BEGIN READ ONLY')
  const { rows } = await c.query(`
    select table_name,
           (select n_live_tup from pg_stat_user_tables t where t.relname = table_name) as lignes
      from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`)
  await c.query('ROLLBACK')
  await c.end()

  const enBase = new Set(rows.map((r) => r.table_name))
  const oubliees = rows.filter((r) => !listees.has(r.table_name) && !exclues.has(r.table_name))
  const fantomes = [...listees].filter((t) => !enBase.has(t))

  console.log(`\n  ${enBase.size} tables en base · ${listees.size} listees · ${exclues.size} exclues volontairement\n`)

  if (oubliees.length) {
    console.log(`  ${oubliees.length} TABLE(S) NE SERAIENT PAS RECOPIEES :\n`)
    for (const r of oubliees) {
      console.log(`    ${String(r.lignes ?? 0).padStart(7)} lignes   ${r.table_name}`)
    }
    console.log('\n  A ajouter dans TABLES_IN_ORDER — references et statuts avant les liaisons.\n')
  }

  if (fantomes.length) {
    console.log(`  ${fantomes.length} TABLE(S) LISTEE(S) MAIS INEXISTANTE(S) :\n`)
    for (const t of fantomes) console.log(`    ${t}`)
    console.log('')
  }

  if (!oubliees.length && !fantomes.length) {
    console.log('  La liste couvre exactement la base.\n')
  }

  if (oubliees.length || fantomes.length) process.exit(1)
})().catch((e) => {
  console.error('\n  ECHEC :', e.message, '\n')
  process.exit(1)
})
