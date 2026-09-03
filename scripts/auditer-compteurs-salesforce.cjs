// Compare les points de livraison de Salesforce avec les compteurs de Kimatch. NE MODIFIE RIEN.
//
// ══ POURQUOI CET OUTIL ════════════════════════════════════════════════════════════════════════════
//
// Naoëlle, 03/09/2026 : « profite pour refaire une analyse des compteurs et conso sur notre
// Salesforce et compare, car ce n'est pas normal autant de manquement. » Michel, la veille,
// comparait de tête un rapport Salesforce et l'écran Patrimoine — deux nombres dont personne ne
// savait dire s'ils portaient sur la même population.
//
// D'où ce script : il pose les deux inventaires côte à côte et écrit les DEUX LISTES qu'il faut
// faire arbitrer à la source, parce qu'aucun code ne peut les trancher :
//
//   · les numéros de PDL en DOUBLON dans Salesforce, avec des consommations divergentes ;
//   · les compteurs de Kimatch que Salesforce ne connaît pas ;
//   · les PDL dont SEUL LE CAR est renseigné — voir plus bas, c'est la liste la plus utile.
//
// ══ POURQUOI LA TROISIÈME LISTE EXISTE ════════════════════════════════════════════════════════════
//
// Michel, sur le PDL 30001650909439 : « la question, c'est comment est arrivé le 2146 ». Réponse :
// il est dans `Consommation_annuelle__c` (le CAR), sur une fiche qu'il a créée lui-même le
// 02/09/2024 — pendant que `Consommation_annuelle_MWh__c`, le champ que ses rapports somment, est
// resté à zéro.
//
// CORRIGER L'IMPORT NE SUFFIT DONC PAS. Remettre Kimatch sur le bon champ met ce compteur à 0 :
// c'est cohérent avec Salesforce, mais la seule consommation connue de ce PDL disparaît. 1 931
// compteurs sont dans ce cas, et leur CAR est parfois la seule mesure existante.
//
// PIRE : LE CAR N'A PAS D'UNITÉ FIABLE. Sur le C2 ci-dessus, 2 146 se lit en MWh et c'est
// plausible ; sur le C4 30000141275009, le CAR vaut 41 674 quand la vraie valeur est 41,674 — donc
// des kWh. Aucun code ne peut trancher ligne à ligne : c'est une saisie humaine, dans deux unités.
// D'où une liste, à reprendre à la source, plutôt qu'une conversion inventée.
//
// ══ USAGE ═════════════════════════════════════════════════════════════════════════════════════════
//
//   npm run auditer:compteurs                     (interroge Salesforce lui-meme)
//   npm run auditer:compteurs -- dossier-sortie
//
// On peut lui passer un CSV deja exporte pour rejouer une extraction datee :
//   node scripts/auditer-compteurs-salesforce.cjs pdl.csv [dossier-de-sortie]
const fs = require('fs')
const path = require('path')
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

const CSV_FOURNI = process.argv.find((a) => a.endsWith('.csv'))
const SORTIE = process.argv.slice(2).find((a) => !a.endsWith('.csv')) ?? '.'

/**
 * L'extraction Salesforce, faite ici quand on ne l'a pas fournie.
 *
 * Le SOQL passe par un FICHIER : `sf` est un .cmd sous Windows, donc la commande traverse un shell,
 * et celui-ci recoupe la requete sur ses espaces des qu'elle n'est pas guillemetee comme il
 * l'attend. `--file` ne laisse plus un seul espace a proteger.
 */
function exporterDepuisSalesforce() {
  const { execSync } = require('child_process')
  const os = require('os')
  console.log('Interrogation de Salesforce (org KiweeOrg)…')
  const soql = path.join(os.tmpdir(), 'kimatch-audit-' + Date.now() + '.soql')
  fs.writeFileSync(
    soql,
    'SELECT Name, Consommation_annuelle_MWh__c, Consommation_annuelle__c, Segment__c, Energie__c FROM Point_de_livraison__c',
    'utf8',
  )
  const csv = execSync(
    'sf data query --file "' + soql + '" --target-org KiweeOrg --result-format csv',
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  fs.unlinkSync(soql)
  const fichier = path.join(os.tmpdir(), 'kimatch-audit-' + Date.now() + '.csv')
  fs.writeFileSync(fichier, csv, 'utf8')
  return fichier
}

const CSV = CSV_FOURNI ?? exporterDepuisSalesforce()

const url = fs
  .readFileSync('.env.local', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('SUPABASE_DB_URL='))
  .slice('SUPABASE_DB_URL='.length)
  .trim()

/** Découpage CSV respectant les guillemets : un `split(',')` naïf décale la ligne en silence. */
function champs(ligne) {
  const out = []
  let cur = ''
  let guillemets = false
  for (let i = 0; i < ligne.length; i += 1) {
    const ch = ligne[i]
    if (ch === '"') {
      if (guillemets && ligne[i + 1] === '"') { cur += '"'; i += 1 }
      else guillemets = !guillemets
    } else if (ch === ',' && !guillemets) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const nb = (v) => (v === '' || v == null ? null : Number(v))

;(async () => {
  const lignes = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  const e = champs(lignes.shift())
  const col = {
    nom: e.indexOf('Name'),
    mwh: e.indexOf('Consommation_annuelle_MWh__c'),
    car: e.indexOf('Consommation_annuelle__c'),
    seg: e.indexOf('Segment__c'),
    ene: e.indexOf('Energie__c'),
  }
  if (col.nom < 0 || col.mwh < 0) throw new Error('colonnes attendues absentes : ' + e.join(','))

  const parNom = new Map()
  for (const l of lignes) {
    const c = champs(l)
    const nom = (c[col.nom] || '').trim()
    if (!nom) continue
    const ligne = {
      nom,
      mwh: nb(c[col.mwh]),
      car: col.car >= 0 ? nb(c[col.car]) : null,
      seg: col.seg >= 0 ? c[col.seg] : '',
      ene: col.ene >= 0 ? c[col.ene] : '',
    }
    if (!parNom.has(nom)) parNom.set(nom, [])
    parNom.get(nom).push(ligne)
  }

  const doublons = [...parNom.entries()].filter(([, v]) => v.length > 1)

  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const { rows } = await c.query(`
    select cm.numero_point, cm.consommation_annuelle_mwh, cm.date_creation,
           s.nom as site_nom, cp.nom as compte_nom
      from compteurs cm
      left join sites s on s.id = cm.site_id
      left join comptes cp on cp.id = s.compte_id
     where cm.actif
  `)
  await c.end()
  const km = new Map(rows.map((r) => [r.numero_point, r]))

  /* ══ LE COMPTE RENDU ══
     Les nombres d'abord, parce que c'est ce qui se compare à un rapport Salesforce ; les listes
     ensuite, dans des fichiers, parce qu'on ne les lit pas dans un terminal — on les envoie. */
  const totalLignes = lignes.length
  const sommeMwh = [...parNom.values()].flat().reduce((t, l) => t + (l.mwh ?? 0), 0)
  const sommeCar = [...parNom.values()].flat().reduce((t, l) => t + (l.car ?? 0), 0)
  const sommeKm = rows.reduce((t, r) => t + Number(r.consommation_annuelle_mwh ?? 0), 0)

  const f = (n) => Math.round(n).toLocaleString('fr-FR')
  console.log('')
  console.log('                                 SALESFORCE      KIMATCH')
  console.log('  lignes / compteurs actifs   ' + String(totalLignes).padStart(11) + String(rows.length).padStart(13))
  console.log('  numeros distincts           ' + String(parNom.size).padStart(11) + String(km.size).padStart(13))
  console.log('  consommation annuelle (MWh) ' + f(sommeMwh).padStart(11) + f(sommeKm).padStart(13))
  console.log('  champ CAR (pour memoire)    ' + f(sommeCar).padStart(11))
  console.log('')

  // Kimatch suit-il le CAR ou le champ MWh ? C'est le diagnostic central.
  let suitCar = 0, suitMwh = 0, ni = 0
  for (const [nom, l] of parNom) {
    if (l.length > 1 || !km.has(nom)) continue
    const k = Number(km.get(nom).consommation_annuelle_mwh ?? 0)
    if (Math.abs(k - (l[0].car ?? 0)) < 0.51) suitCar++
    else if (Math.abs(k - (l[0].mwh ?? 0)) < 0.51) suitMwh++
    else ni++
  }
  console.log('  Sur les PDL uniques communs, la valeur de Kimatch correspond :')
  console.log('    au CAR (Consommation_annuelle__c)          : ' + suitCar)
  console.log('    au champ MWh (Consommation_annuelle_MWh__c) : ' + suitMwh)
  console.log('    a ni l un ni l autre                       : ' + ni)
  console.log('')

  const absentsDeSf = [...km.keys()].filter((n) => !parNom.has(n))
  console.log('  PDL Salesforce sans compteur Kimatch : ' + [...parNom.keys()].filter((n) => !km.has(n)).length)
  console.log('  compteurs Kimatch inconnus de Salesforce : ' + absentsDeSf.length)
  console.log('  numeros de PDL en doublon dans Salesforce : ' + doublons.length)
  console.log('')

  const fichier1 = path.join(SORTIE, 'pdl-en-doublon-salesforce.csv')
  fs.writeFileSync(
    fichier1,
    'PDL;occurrences;consommations MWh;CAR;segments;energie\n' +
      doublons
        .map(([n, l]) =>
          [n, l.length, l.map((x) => x.mwh ?? '').join(' | '), l.map((x) => x.car ?? '').join(' | '),
            l.map((x) => x.seg).join(' | '), l.map((x) => x.ene).join(' | ')].join(';'))
        .join('\n') + '\n',
    'utf8',
  )

  /* La liste la plus utile des trois : les PDL dont le champ officiel est vide alors que le CAR
     porte une valeur. C'est exactement ce qui disparaîtra de Kimatch au passage sur le bon champ,
     et ce que quelqu'un doit reporter dans `Consommation_annuelle_MWh__c` — après avoir décidé de
     son unité. Triée par CAR décroissant : on commence par ce qui pèse. */
  const carSeul = [...parNom.entries()]
    .filter(([, l]) => l.length === 1 && !(l[0].mwh > 0) && l[0].car > 0)
    .map(([n, l]) => ({ nom: n, car: l[0].car, seg: l[0].seg, ene: l[0].ene, k: km.get(n) }))
    .sort((a, b) => b.car - a.car)

  const fichier3 = path.join(SORTIE, 'pdl-avec-car-mais-sans-consommation-officielle.csv')
  fs.writeFileSync(
    fichier3,
    'PDL;CAR Salesforce;segment;energie;compte;site;affiche aujourd hui dans Kimatch\n' +
      carSeul
        .map((x) =>
          [x.nom, x.car, x.seg, x.ene, x.k?.compte_nom ?? '', x.k?.site_nom ?? '',
            x.k?.consommation_annuelle_mwh ?? ''].join(';'))
        .join('\n') + '\n',
    'utf8',
  )
  console.log('  PDL avec un CAR mais sans consommation officielle : ' + carSeul.length)
  console.log('')

  const fichier2 = path.join(SORTIE, 'compteurs-kimatch-inconnus-de-salesforce.csv')
  fs.writeFileSync(
    fichier2,
    'PDL;consommation Kimatch (MWh);compte;site;cree le\n' +
      absentsDeSf
        .map((n) => {
          const r = km.get(n)
          return [n, r.consommation_annuelle_mwh ?? '', r.compte_nom ?? '', r.site_nom ?? '',
            r.date_creation ? new Date(r.date_creation).toISOString().slice(0, 10) : ''].join(';')
        })
        .join('\n') + '\n',
    'utf8',
  )

  console.log('  A FAIRE ARBITRER A LA SOURCE :')
  console.log('    ' + fichier1)
  console.log('    ' + fichier2)
  console.log('    ' + fichier3)
})()
