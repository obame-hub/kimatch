/**
 * Compare les points de livraison de Salesforce (CSV exporté par `sf data query`) avec les
 * compteurs de Kimatch. Ne modifie rien.
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.join(__dirname, '..')
const env = fs.readFileSync(path.join(RACINE, '.env.local'), 'utf8')
const url = env.match(/^SUPABASE_DB_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
const CSV = process.argv[2]

const lignes = fs.readFileSync(CSV, 'utf8').split(/\r?\n/).filter((l) => l.trim())
lignes.shift()
const sf = new Map()
for (const l of lignes) {
  const c = l.split(',')
  sf.set(c[0], { mwh: c[1] === '' ? null : Number(c[1]), car: c[2] === '' ? null : Number(c[2]), seg: c[3], ene: c[4] })
}

const client = new Client({ connectionString: url })
;(async () => {
  await client.connect()
  const { rows } = await client.query(
    'select numero_point, consommation_annuelle_mwh from compteurs where actif',
  )
  const km = new Map(rows.map((r) => [r.numero_point, Number(r.consommation_annuelle_mwh)]))

  const absentsDeKimatch = [...sf.keys()].filter((n) => !km.has(n))
  const absentsDeSalesforce = [...km.keys()].filter((n) => !sf.has(n))

  console.log('PDL Salesforce :', sf.size, '· compteurs Kimatch actifs :', km.size)
  console.log('')
  console.log('DANS SALESFORCE, PAS DANS KIMATCH :', absentsDeKimatch.length)
  for (const n of absentsDeKimatch.slice(0, 25)) {
    const s = sf.get(n)
    console.log('  ', n, '| MWh=' + s.mwh, '| CAR=' + s.car, '|', s.seg, '|', s.ene)
  }
  console.log('')
  console.log('DANS KIMATCH, PAS DANS SALESFORCE :', absentsDeSalesforce.length)
  for (const n of absentsDeSalesforce.slice(0, 25)) console.log('  ', n, '| conso Kimatch =', km.get(n))

  // Sur les PDL communs : Kimatch suit-il le CAR ou le MWh ?
  let suitCar = 0, suitMwh = 0, suitNiUnNiAutre = 0, ecartTotalSiMwh = 0
  for (const [n, s] of sf) {
    if (!km.has(n)) continue
    const k = km.get(n)
    const car = s.car ?? 0
    const mwh = s.mwh ?? 0
    if (Math.abs(k - car) < 0.51) suitCar++
    else if (Math.abs(k - mwh) < 0.51) suitMwh++
    else suitNiUnNiAutre++
    ecartTotalSiMwh += mwh - k
  }
  console.log('')
  console.log('SUR LES PDL COMMUNS, la valeur de Kimatch correspond :')
  console.log('   au CAR (Consommation_annuelle__c) :', suitCar)
  console.log('   au champ MWh (Consommation_annuelle_MWh__c) :', suitMwh)
  console.log('   à ni l’un ni l’autre :', suitNiUnNiAutre)
  console.log('')
  console.log('Si Kimatch prenait le champ MWh, son total varierait de',
    Math.round(ecartTotalSiMwh).toLocaleString('fr-FR'), 'MWh')

  await client.end()
})()
