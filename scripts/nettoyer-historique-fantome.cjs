// ════════════════════════════════════════════════════════════════════════════════════════════════
// EFFACER LES LIGNES D'HISTORIQUE QUI DÉCRIVENT UN CHANGEMENT INEXISTANT
//
// `fn_audit_trace` comparait les colonnes GÉNÉRÉES, que PostgreSQL calcule après les déclencheurs
// « before » : elles valaient donc toujours null dans NEW, et chaque mise à jour écrivait une ligne
// annonçant un changement qui n'a pas eu lieu. La cause est corrigée par la migration
// 20260920140000 ; ce script efface ce qui a déjà été écrit.
//
// ── POURQUOI CE N'EST PAS DANS LA MIGRATION ──
//
// Supprimer de l'historique est une décision, pas un effet de bord. L'historique sert à répondre à
// « qui a changé quoi » : y toucher sans que personne l'ait demandé serait exactement le genre de
// geste qu'on lui reproche.
//
// ── CE QU'IL EFFACE, ET RIEN D'AUTRE ──
//
// Uniquement les lignes dont le CHAMP est une colonne générée — lues dans le catalogue, pas écrites
// en dur. Toute autre ligne reste, y compris celles de la même seconde et du même auteur.
//
//   node scripts/nettoyer-historique-fantome.cjs --simulation
//   node scripts/nettoyer-historique-fantome.cjs
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.join(__dirname, '..')
for (const l of fs.readFileSync(path.join(RACINE, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const simulation = process.argv.includes('--simulation')

;(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL })
  await c.connect()

  const { rows: generees } = await c.query(`
    select cl.relname as table_nom, a.attname as colonne
      from pg_attribute a
      join pg_class cl on cl.oid = a.attrelid
      join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'public' and a.attgenerated <> '' and a.attnum > 0 and not a.attisdropped`)
  console.log('colonnes générées :', generees.map((r) => `${r.table_nom}.${r.colonne}`).join(', '))
  if (generees.length === 0) { console.log('Rien à faire.'); await c.end(); return }

  const couples = generees.map((r) => [r.table_nom, r.colonne])
  const { rows: avant } = await c.query(`
    select table_nom, champ, count(*)::int as n,
           min(date_modification)::date as du, max(date_modification)::date as au
      from public.historique_modifications
     where (table_nom, champ) in (${couples.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')})
     group by 1, 2 order by 3 desc`, couples.flat())
  console.log('lignes fantômes :'); console.table(avant)
  const total = avant.reduce((s, r) => s + r.n, 0)
  if (total === 0) { console.log('Rien à effacer.'); await c.end(); return }

  if (simulation) { console.log(`\n--simulation : ${total} ligne(s) seraient effacées.`); await c.end(); return }

  await c.query('begin')
  try {
    const { rows: totalAvant } = await c.query('select count(*)::int n from public.historique_modifications')
    const { rowCount } = await c.query(`
      delete from public.historique_modifications
       where (table_nom, champ) in (${couples.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')})`,
      couples.flat())
    const { rows: totalApres } = await c.query('select count(*)::int n from public.historique_modifications')

    /* GARDE-FOU : on n'efface QUE ce qu'on a compté. Un écart signifierait que la condition a
       attrapé autre chose — et l'historique est précisément ce qu'on ne peut pas reconstituer. */
    if (totalAvant[0].n - totalApres[0].n !== total) {
      throw new Error(`Écart : ${totalAvant[0].n - totalApres[0].n} supprimées pour ${total} comptées.`)
    }
    await c.query('commit')
    console.log(`\n${rowCount} ligne(s) fantôme(s) effacée(s). Historique : ${totalApres[0].n} lignes.`)
  } catch (e) {
    await c.query('rollback')
    throw e
  }
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
