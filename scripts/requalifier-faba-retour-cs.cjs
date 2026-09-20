// ════════════════════════════════════════════════════════════════════════════════════════════════
// « RETOUR CS » ET « FABA » SONT DES APPELS
//
// William, 20/09/2026, après la question de Naoëlle : ces tâches Salesforce sans type sont des
// appels. Elles étaient arrivées dans Kimatch en « Autre interaction », faute de type à l'import —
// 146 échanges créés par Matthieu Bruère (et un par Thomas Le Guen) entre novembre 2025 et
// août 2026.
//
// ── CE QU'ON TOUCHE, ET RIEN D'AUTRE ──
//
// Uniquement les échanges dont l'objet est exactement « FABA » ou commence par « Retour CS », ET
// qui portent aujourd'hui le type « Autre interaction ». Les quatre « Retour CS » déjà typés Email
// restent tels quels : ce sont de vrais mails, et les requalifier en appel serait remplacer une
// information juste par une fausse.
//
//   node scripts/requalifier-faba-retour-cs.cjs --simulation
//   node scripts/requalifier-faba-retour-cs.cjs
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

const CIBLES = `
  from public.interactions i
  join public.types_interactions t on t.id = i.type_interaction_id
 where t.libelle = 'Autre interaction'
   and (btrim(i.objet) ilike 'faba' or btrim(i.objet) ilike 'retour cs%')`

;(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL })
  await c.connect()

  const { rows: appel } = await c.query(
    `select id, libelle from public.types_interactions where libelle = 'Appel téléphonique'`)
  if (appel.length !== 1) {
    throw new Error(`Type « Appel téléphonique » introuvable ou ambigu (${appel.length} trouvé·s).`)
  }

  const { rows: avant } = await c.query(`
    select case when btrim(i.objet) ilike 'faba' then 'FABA' else 'Retour CS' end as famille,
           coalesce(p.prenom || ' ' || p.nom, '(sans auteur)') as auteur, count(*)::int as n
      from public.interactions i
      join public.types_interactions t on t.id = i.type_interaction_id
      left join public.profils p on p.id = i.auteur_profil_id
     where t.libelle = 'Autre interaction'
       and (btrim(i.objet) ilike 'faba' or btrim(i.objet) ilike 'retour cs%')
     group by 1, 2 order by 1, 3 desc`)
  console.log('À requalifier en « Appel téléphonique » :')
  console.table(avant)
  const total = avant.reduce((s, r) => s + r.n, 0)
  console.log(`total : ${total}`)

  /* CE QU'ON NE TOUCHE PAS, dit à voix haute : sans cette ligne, on ne saurait pas que quatre
     échanges portant le même objet restent en dehors du lot. */
  const { rows: laisses } = await c.query(`
    select t.libelle as type, count(*)::int as n
      from public.interactions i
      join public.types_interactions t on t.id = i.type_interaction_id
     where t.libelle <> 'Autre interaction'
       and (btrim(i.objet) ilike 'faba' or btrim(i.objet) ilike 'retour cs%')
     group by 1 order by 2 desc`)
  if (laisses.length > 0) { console.log('Laissés tels quels (déjà typés) :'); console.table(laisses) }

  if (simulation) { console.log('\n--simulation : rien écrit.'); await c.end(); return }
  if (total === 0) { console.log('\nRien à faire.'); await c.end(); return }

  await c.query('begin')
  try {
    /* L'ORIGINE SIGNE L'ÉCRITURE dans `historique_modifications` : sans elle, 146 changements de
       type apparaîtraient sans qu'on sache d'où ils viennent. */
    await c.query("select set_config('kimatch.origine', 'requalifier-faba-retour-cs', true)")
    const { rowCount } = await c.query(
      `update public.interactions i set type_interaction_id = $1
        where i.id in (select i.id ${CIBLES})`, [appel[0].id])

    const { rows: reste } = await c.query(`select count(*)::int n ${CIBLES}`)
    if (reste[0].n !== 0) throw new Error(`${reste[0].n} échange(s) non requalifié(s) — annulation.`)

    await c.query('commit')
    console.log(`\n${rowCount} échange(s) requalifié(s) en « Appel téléphonique ».`)
  } catch (e) {
    await c.query('rollback')
    throw e
  }
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
