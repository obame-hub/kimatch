// ════════════════════════════════════════════════════════════════════════════════════════════════
// RETIRER LES DOUBLONS CRÉÉS PAR LA RELECTURE DU CANAL SLACK
//
// 16/09/2026, 4 h 50 : la tâche de nuit a relu #leads et créé 93 pistes. 64 doublaient une piste
// déjà présente, venue de l'import Salesforce. Des commerciaux allaient rappeler des prospects
// déjà en cours de traitement par un collègue.
//
// LA CAUSE est corrigée dans `api/pistes/_creerPisteDepuisLead.ts` : la création compare désormais
// aussi l'e-mail et les neuf derniers chiffres du téléphone, pas seulement l'horodatage Slack.
// Ce script nettoie ce qui a été créé avant la correction.
//
// ── CE QU'IL SUPPRIME, ET CE QU'IL NE TOUCHE PAS ──
//
// Uniquement des pistes qui réunissent QUATRE conditions : créées par la relecture (elles portent
// un horodatage Slack), créées le 16/09, ayant une piste ANTÉRIEURE avec le même e-mail ou le même
// téléphone, et n'ayant reçu ni interaction ni tâche depuis. Les 29 leads réellement nouveaux
// restent, et les pistes d'origine ne sont jamais touchées.
//
// L'HORODATAGE SLACK EST REPORTÉ SUR LA PISTE D'ORIGINE avant la suppression : sans ça, la
// relecture de cette nuit recréerait exactement les mêmes doublons.
//
//   node scripts/retirer-doublons-rattrapage-slack.cjs --simulation
//   node scripts/retirer-doublons-rattrapage-slack.cjs
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

const PAIRES = `
  select distinct on (n.id)
         n.id as doublon_id, n.reference as doublon, n.societe, n.source_externe_id,
         a.id as origine_id, a.reference as origine, a.source_externe_id as origine_ts
    from public.pistes n
    join public.pistes a
      on a.id <> n.id
     and a.date_creation < n.date_creation
     and (
       (n.email is not null and a.email is not null and lower(a.email) = lower(n.email))
       or (n.telephone is not null and a.telephone is not null
           and length(regexp_replace(n.telephone,'\\D','','g')) >= 9
           and right(regexp_replace(a.telephone,'\\D','','g'), 9)
             = right(regexp_replace(n.telephone,'\\D','','g'), 9))
     )
   where n.source_externe_id is not null
     and n.date_creation >= '2026-09-16'
     and not exists (select 1 from public.interactions i where i.piste_id = n.id)
     and not exists (select 1 from public.actions t where t.piste_id = n.id)
   order by n.id, a.date_creation`

;(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL })
  await c.connect()
  const { rows } = await c.query(PAIRES)

  console.log(`${rows.length} doublon(s) à retirer :`)
  for (const r of rows.slice(0, 10)) {
    console.log(`  ${r.doublon} → garde ${r.origine.padEnd(14)} ${String(r.societe).slice(0, 40)}`)
  }
  if (rows.length > 10) console.log(`  … et ${rows.length - 10} autres`)

  if (simulation) { console.log('\n--simulation : rien supprimé.'); await c.end(); return }

  await c.query('begin')
  try {
    let reportes = 0
    for (const r of rows) {
      // Le marquage n'écrase jamais un horodatage déjà posé sur l'origine.
      if (!r.origine_ts) {
        await c.query('update public.pistes set source_externe_id = $1 where id = $2 and source_externe_id is null',
          [r.source_externe_id, r.origine_id])
        reportes++
      }
      await c.query('delete from public.pistes where id = $1', [r.doublon_id])
    }

    // GARDE-FOU : on vérifie que les ORIGINES sont toujours là. Supprimer le mauvais côté de la
    // paire serait la seule erreur irrattrapable de ce script.
    const { rows: survivants } = await c.query(
      'select count(*)::int n from public.pistes where id = any($1::uuid[])',
      [rows.map((r) => r.origine_id)])
    const attendus = new Set(rows.map((r) => r.origine_id)).size
    if (survivants[0].n !== attendus) {
      throw new Error(`${attendus - survivants[0].n} piste(s) d'origine ont disparu — annulation.`)
    }
    await c.query('commit')
    console.log(`\n${rows.length} doublon(s) supprimé(s), ${reportes} horodatage(s) reporté(s) sur l'origine.`)
    console.log(`${survivants[0].n} piste(s) d'origine intactes.`)
  } catch (e) {
    await c.query('rollback')
    throw e
  }
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
