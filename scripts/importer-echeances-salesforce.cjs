// Importe les échéances des compteurs depuis Salesforce.
//
// MICHEL, 24/08/2026 : « dans nos compteurs, je n'ai pas vu l'élément échéance du compteur. Donc ça,
// c'est la priorité maximum. » Sans échéance, aucun signal ne se déclenche : toute la chaîne
// commerciale est à l'arrêt.
//
// LA CAUSE EST UN OUBLI D'IMPORT, confirmé par Naoëlle. Vérifié avant d'écrire ce script :
// `Point_de_livraison__c.Echeance__c` est renseignée sur 7 337 des 7 934 PDL de Salesforce, contre
// 13 sur 7 899 dans Kimatch.
//
// LA CLEF EST LE NUMÉRO DE PDL : `Point_de_livraison__c.Name` côté Salesforce, `numero_point` côté
// Kimatch — unique sur les 7 899 lignes (contrôlé). On ne passe donc pas par un identifiant
// Salesforce, que la table `compteurs` ne porte pas.
//
// PASSER `--appliquer` POUR ÉCRIRE. Sans ce drapeau, le script ne fait que compter : combien se
// rapprochent, combien changeraient, combien resteraient orphelins. Une écriture de 7 000 lignes en
// production se regarde avant de se lancer.
const fs = require('fs')
const path = require('path')
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

// Le CSV attendu vient de :
//   sf data query --query "SELECT Name, Echeance__c FROM Point_de_livraison__c WHERE Echeance__c != NULL" //     --target-org KiweeOrg --result-format csv > echeances-pdl.csv
const CSV = process.argv.find((a) => a.endsWith('.csv'))
if (!CSV) {
  console.error('Usage : node scripts/importer-echeances-salesforce.cjs <export.csv> [--appliquer]')
  process.exit(1)
}
const APPLIQUER = process.argv.includes('--appliquer')

const url = fs
  .readFileSync('.env.local', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('SUPABASE_DB_URL='))
  .slice('SUPABASE_DB_URL='.length)
  .trim()

function lireCsv() {
  // Le CSV de `sf` commence par un BOM : sans le retirer, la première colonne s'appelle
  // « ﻿Name » et la recherche d'en-tête échoue.
  const lignes = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  const entetes = lignes.shift().split(',')
  const iNom = entetes.indexOf('Name')
  const iEch = entetes.indexOf('Echeance__c')
  if (iNom < 0 || iEch < 0) throw new Error('colonnes attendues absentes du CSV : ' + entetes.join(','))
  const paires = []
  for (const l of lignes) {
    // Aucune valeur ne contient de virgule (un numéro de PDL et une date ISO) : un découpage simple
    // suffit, et il est plus sûr qu'un analyseur maison qui se tromperait en silence.
    const champs = l.split(',')
    const nom = (champs[iNom] || '').trim()
    const ech = (champs[iEch] || '').trim()
    if (nom && /^\d{4}-\d{2}-\d{2}/.test(ech)) paires.push([nom, ech.slice(0, 10)])
  }
  return paires
}

;(async () => {
  const paires = lireCsv()
  console.log('echeances lues dans Salesforce : ' + paires.length)

  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query('begin')
  try {
    // Table de travail temporaire : une jointure vaut mieux que 7 337 requêtes.
    await c.query('create temporary table maj_echeances (numero_point text primary key, echeance date) on commit drop')
    const taille = 500
    for (let i = 0; i < paires.length; i += taille) {
      const tranche = paires.slice(i, i + taille)
      const valeurs = tranche.map((_, j) => '($' + (j * 2 + 1) + ',$' + (j * 2 + 2) + '::date)').join(',')
      await c.query(
        'insert into maj_echeances (numero_point, echeance) values ' + valeurs + ' on conflict (numero_point) do nothing',
        tranche.flat(),
      )
    }

    const bilan = await c.query(`
      select
        (select count(*)::int from maj_echeances) lues,
        (select count(*)::int from compteurs k join maj_echeances m on m.numero_point = k.numero_point) rapprochees,
        (select count(*)::int from compteurs k join maj_echeances m on m.numero_point = k.numero_point
          where k.date_echeance is null) a_remplir,
        (select count(*)::int from compteurs k join maj_echeances m on m.numero_point = k.numero_point
          where k.date_echeance is not null and k.date_echeance <> m.echeance) a_corriger,
        (select count(*)::int from maj_echeances m
          where not exists (select 1 from compteurs k where k.numero_point = m.numero_point)) sans_compteur
    `)
    const b = bilan.rows[0]
    console.log('  rapprochees avec un compteur : ' + b.rapprochees)
    console.log('  a remplir (echeance vide)    : ' + b.a_remplir)
    console.log('  a corriger (valeur differente): ' + b.a_corriger)
    console.log('  sans compteur correspondant   : ' + b.sans_compteur)

    // Répartition dans le temps : c'est ce qui dira combien de signaux sont réellement exploitables.
    const t = await c.query(`
      select
        count(*) filter (where m.echeance < current_date)::int passees,
        count(*) filter (where m.echeance >= current_date and m.echeance < current_date + 180)::int sous_6_mois,
        count(*) filter (where m.echeance >= current_date + 180 and m.echeance < current_date + 730)::int sous_2_ans,
        count(*) filter (where m.echeance >= current_date + 730)::int au_dela
      from compteurs k join maj_echeances m on m.numero_point = k.numero_point
    `)
    console.log('  repartition : ' + JSON.stringify(t.rows[0]))

    if (!APPLIQUER) {
      await c.query('rollback')
      console.log('--- ESSAI A BLANC : rien n a ete ecrit (relancer avec --appliquer) ---')
      await c.end()
      return
    }

    const maj = await c.query(`
      update compteurs k set date_echeance = m.echeance, date_modification = now()
      from maj_echeances m
      where m.numero_point = k.numero_point
        and (k.date_echeance is null or k.date_echeance <> m.echeance)
    `)
    await c.query('commit')
    console.log('--- APPLIQUE : ' + maj.rowCount + ' compteurs mis a jour ---')
    const apres = await c.query('select count(*)::int total, count(date_echeance)::int avec from compteurs')
    console.log('compteurs avec une echeance : ' + apres.rows[0].avec + ' / ' + apres.rows[0].total)
  } catch (e) {
    await c.query('rollback').catch(() => {})
    throw e
  } finally {
    await c.end()
  }
})().catch((e) => {
  console.error('ECHEC : ' + e.message)
  process.exit(1)
})
