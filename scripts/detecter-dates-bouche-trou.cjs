// ════════════════════════════════════════════════════════════════════════════════════════════════
// DÉTECTEUR DE DATES BOUCHE-TROU
//
// Écrit le 01/09/2026, après la question de Michel : « pourquoi cette reco a été clôturée le 3 août ».
// Elle ne l'avait pas été. Une migration avait rempli les dates manquantes avec la date de dernière
// modification de la ligne, et 92 dossiers portaient le même 3 août — un jour où rien ne s'était
// passé. Le même défaut existait sur les suivis de contrat, où 542 clôtures sur 542 tombaient le
// 30 août alors que les contrats s'étaient terminés entre 2021 et 2026.
//
// ══ LE PRINCIPE ══
//
// Une date MÉTIER n'a aucune raison de se concentrer sur un jour. Une date de TRAITEMENT, si : c'est
// le jour où le traitement a tourné. Un pic est donc la signature d'un remplissage en masse, et il se
// voit sans rien savoir du métier — c'est ce qui permet de balayer TOUTES les colonnes de date de la
// base d'un coup, au lieu de se souvenir de celles qu'on a écrites.
//
// ══ CE QUI EST SIGNALÉ, ET CE QUI NE L'EST PAS ══
//
// Un pic doit rassembler au moins 10 % de la colonne ET valoir au moins cinq fois le deuxième jour.
// Les deux conditions ensemble : la première seule signalerait une colonne qui n'a que trois valeurs,
// la seconde seule signalerait un jour un peu chargé dans une colonne clairsemée.
//
// LES DATES DE CRÉATION SONT EXCLUES. Un import en masse crée légitimement dix mille lignes le même
// jour : la colonne dirait la vérité, et le détecteur crierait à chaque fois.
//
// UN PIC N'EST PAS UNE PREUVE. Au 01/09/2026, deux cas signalés sont parfaitement légitimes :
//
//   suivis_contrats.date_cloture   244 clôtures au 31/12/2025 — les contrats d'énergie finissent en
//                                  masse au 31 décembre, c'est le métier qui parle
//   signaux.date_detection         593 au 24/08/2026 — un signal EST détecté le jour où le
//                                  générateur le crée, la colonne égale date_creation sur les 1 456
//
// Le détecteur montre où regarder ; c'est en confrontant la colonne à sa source — Salesforce, la date
// de fin du contrat, l'événement métier — qu'on tranche.
//
// ══ USAGE ══
//
//   node scripts/detecter-dates-bouche-trou.cjs
//
// L'URL de connexion est lue dans .env.local, à la racine du dépôt. Le script ne fait que LIRE.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.resolve(__dirname, '..')
const cheminEnv = path.join(RACINE, '.env.local')
if (!fs.existsSync(cheminEnv)) {
  console.error('.env.local introuvable à la racine du dépôt : ' + cheminEnv)
  process.exit(1)
}
const correspondance = fs.readFileSync(cheminEnv, 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
if (!correspondance) {
  console.error('SUPABASE_DB_URL absent de .env.local.')
  process.exit(1)
}

/** Les dates que le détecteur ne regarde pas : un import légitime les concentre. */
const IGNORE = new Set(['date_creation', 'date_modification', 'created_at', 'updated_at'])

/** Un pic doit peser au moins ce quart-là de la colonne, ET dominer le deuxième jour d'autant. */
const PART_MINIMALE = 0.1
const FACTEUR_SUR_LE_SECOND = 5
/** En dessous, une colonne est trop clairsemée pour qu'un « pic » veuille dire quoi que ce soit. */
const LIGNES_MINIMALES = 20

;(async () => {
  const client = new Client({
    connectionString: correspondance[1].trim(),
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  const colonnes = await client.query(`
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and t.table_type = 'BASE TABLE'
       and c.data_type in ('date', 'timestamp with time zone', 'timestamp without time zone')
     order by c.table_name, c.column_name`)

  const suspects = []
  for (const { table_name: table, column_name: colonne } of colonnes.rows) {
    if (IGNORE.has(colonne)) continue
    let jours
    try {
      // `::text` sur le compte serait un piège : `order by` trierait alors '7' avant '244'.
      // Le jour est formaté PAR LE SERVEUR. Rendu en objet Date, il repasse par le fuseau du poste
      // et `toISOString()` recule d'un jour le soir — j'ai lu 23/08 pour un 24/08 en l'écrivant.
      jours = await client.query(
        `select to_char(${colonne}, 'DD/MM/YYYY') as jour, count(*)::int as n
           from public.${table}
          where ${colonne} is not null
          group by 1, ${colonne}::date order by count(*) desc limit 2`)
    } catch {
      continue // vue matérialisée, droits manquants : on passe, on ne bloque pas le balayage
    }
    if (!jours.rows.length) continue

    const total = (await client.query(`select count(${colonne})::int as n from public.${table}`)).rows[0].n
    const [premier, second] = jours.rows
    const nSecond = second ? second.n : 0
    if (total >= LIGNES_MINIMALES &&
        premier.n >= total * PART_MINIMALE &&
        premier.n >= Math.max(5, nSecond * FACTEUR_SUR_LE_SECOND)) {
      suspects.push({
        table, colonne,
        jour: premier.jour,
        n: premier.n, total, part: Math.round((premier.n / total) * 100), second: nSecond,
      })
    }
  }

  console.log('══ PICS DE DATE À VÉRIFIER ══')
  if (!suspects.length) {
    console.log('Aucun. Aucune colonne de date ne se concentre anormalement sur un seul jour.')
  }
  for (const s of suspects.sort((a, b) => b.part - a.part)) {
    console.log(`${(s.table + '.' + s.colonne).padEnd(38)} ${s.jour}  ${s.n}/${s.total} lignes (${s.part} %) · 2e jour : ${s.second}`)
  }
  console.log('\nUn pic n\'est pas une preuve : confrontez la colonne à sa source avant de conclure.')
  await client.end()
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
