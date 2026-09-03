// Remet les consommations annuelles des compteurs sur le BON champ Salesforce.
//
// ══ CE QUI EST CASSÉ ══════════════════════════════════════════════════════════════════════════════
//
// Michel, réunion du 02/09/2026 : « on s'est rendu compte qu'il y avait une conso qu'on avait qui
// était à 40 gigas mais en fait il y a 4 Go », puis « il y a des compteurs qui ont des
// consommations alors que sur Salesforce on est à zéro ».
//
// LES DEUX SYMPTÔMES ONT LA MÊME CAUSE. `Point_de_livraison__c` porte DEUX champs de consommation :
//
//     Consommation_annuelle_MWh__c   « Consommation annuelle (MWh) »   total 1 578 907 MWh
//     Consommation_annuelle__c       « CAR (MWh) »                     total 4 177 064
//
// L'import a pris le SECOND. Vérifié sur les PDL communs le 03/09/2026 : 7 389 compteurs portent
// exactement la valeur du CAR, 485 seulement celle du champ MWh. D'où :
//
//   · PDL 30000141275009 (ETS COQUART, C4) : MWh = 41,674 · CAR = 41 674 → Kimatch affiche 41 674.
//   · PDL 30001650909439 (GEOPETROL, C2)   : MWh = 0      · CAR = 2 146  → Kimatch affiche 2 146.
//
// Le second cas n'est pas une consommation inventée : c'est le CAR, que Michel ne regardait pas.
//
// LES DEUX CHAMPS NE SONT PAS UNE CONVERSION L'UN DE L'AUTRE. 19 PDL seulement ont CAR = MWh × 1000
// — mais ils pèsent 1 318 256 à eux seuls. 2 844 sont identiques, 231 divergent d'un rapport
// quelconque (un CAR arrondi), 1 937 n'ont QUE le CAR et 523 n'ont QUE le champ MWh. Ce sont deux
// données saisies séparément, pas la même dans deux unités : il n'y a donc rien à convertir, il
// faut lire l'autre colonne.
//
// LE GAZ N'EST PAS CONCERNÉ. `compteurs_gaz.car_mwh` est déjà rempli sur ses 3 095 lignes pour
// 1 480 031 MWh, contre 1 484 121 côté Salesforce : le CAR gaz, lui, a bien été importé depuis le
// bon champ. Ce script ne touche que `compteurs.consommation_annuelle_mwh`.
//
// ══ CE QUE ÇA VA CHANGER ══════════════════════════════════════════════════════════════════════════
//
// Le total du patrimoine passe de 4 224 295 à ~1 578 907 MWh. 1 937 compteurs perdent une
// consommation qu'ils n'auraient jamais dû afficher, 523 en gagnent une qu'ils affichaient à zéro.
//
// ══ LES DOUBLONS SONT ÉCARTÉS, PAS ARBITRÉS ═══════════════════════════════════════════════════════
//
// 31 numéros de PDL apparaissent DEUX FOIS dans Salesforce, avec des consommations différentes
// (GI041021 à 475 et 382,543 · 30001641542251 avec un CAR de 85 et de 98). Choisir pour Michel
// écrirait une valeur que personne n'a validée : le script les laisse tels quels et les liste, à
// arbitrer à la source.
//
// ══ USAGE ═════════════════════════════════════════════════════════════════════════════════════════
//
//   node scripts/corriger-consommations-salesforce.cjs               (essai à blanc)
//   node scripts/corriger-consommations-salesforce.cjs --appliquer
//
// SANS ARGUMENT, LE SCRIPT INTERROGE SALESFORCE LUI-MÊME via la CLI `sf` (org KiweeOrg). C'était
// d'abord un CSV à produire à part, et la première exécution s'est arrêtée sur un `ENOENT: pdl.csv`
// — deux commandes à enchaîner dans le bon ordre, dont une longue à recopier, c'est une marche de
// trop pour un script qu'on relancera à chaque reprise de données.
//
// On peut toujours lui passer un CSV déjà exporté, par exemple pour rejouer une extraction datée :
//   node scripts/corriger-consommations-salesforce.cjs pdl.csv
//
// Sans `--appliquer`, RIEN n'est écrit : le script compte et repart. Une écriture de 7 900 lignes
// en production se regarde avant de se lancer.
const fs = require('fs')
const path = require('path')
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

const APPLIQUER = process.argv.includes('--appliquer')
const CSV_FOURNI = process.argv.find((a) => a.endsWith('.csv'))

/**
 * L'extraction Salesforce, faite ici quand on ne l'a pas fournie.
 *
 * `--result-format csv` écrit sur la sortie standard : on la capture plutôt que de rediriger, pour
 * que le fichier temporaire vive dans le dossier système et disparaisse avec lui.
 */
function exporterDepuisSalesforce() {
  const { execSync } = require('child_process')
  const os = require('os')
  console.log('Interrogation de Salesforce (org KiweeOrg)…')

  /* LA REQUÊTE PASSE PAR UN FICHIER, PAS PAR --query, et ce n'est pas un détour gratuit.
     `sf` est un .cmd sous Windows : il faut donc un shell, et un shell recoupe la requête sur ses
     espaces dès qu'elle n'est pas guillemetée exactement comme il l'attend — première tentative :
     « Unexpected arguments: Name,, Consommation_annuelle_MWh__c,, … ». `--file` ne traverse aucun
     shell : le SOQL est lu tel quel, et la commande n'a plus un seul espace à protéger. */
  const soql = path.join(os.tmpdir(), 'kimatch-pdl-' + Date.now() + '.soql')
  fs.writeFileSync(
    soql,
    'SELECT Name, Consommation_annuelle_MWh__c, Consommation_annuelle__c, Energie__c FROM Point_de_livraison__c',
    'utf8',
  )
  const csv = execSync(
    'sf data query --file "' + soql + '" --target-org KiweeOrg --result-format csv',
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  fs.unlinkSync(soql)

  const fichier = path.join(os.tmpdir(), 'kimatch-pdl-' + Date.now() + '.csv')
  fs.writeFileSync(fichier, csv, 'utf8')
  console.log('  export : ' + fichier)
  return fichier
}

const CSV = CSV_FOURNI ?? exporterDepuisSalesforce()

const url = fs
  .readFileSync('.env.local', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('SUPABASE_DB_URL='))
  .slice('SUPABASE_DB_URL='.length)
  .trim()

/**
 * Découpage CSV qui respecte les guillemets.
 *
 * Un `split(',')` naïf suffirait pour des numéros et des nombres, mais pas si un jour la requête
 * ramène un nom de compte : la ligne se décalerait alors en silence, et le script écrirait la
 * consommation d'un PDL sur un autre. Le coût de la prudence est de dix lignes.
 */
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

function lireCsv() {
  // Le CSV de `sf` commence par un BOM : sans le retirer, la première colonne s'appelle « ﻿Name ».
  const lignes = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  const entetes = champs(lignes.shift())
  const iNom = entetes.indexOf('Name')
  const iMwh = entetes.indexOf('Consommation_annuelle_MWh__c')
  if (iNom < 0 || iMwh < 0) throw new Error('colonnes attendues absentes du CSV : ' + entetes.join(','))

  const parNom = new Map()
  const doublons = new Set()
  for (const l of lignes) {
    const c = champs(l)
    const nom = (c[iNom] || '').trim()
    if (!nom) continue
    const brut = (c[iMwh] || '').trim()
    // Une case vide n'est pas un zéro : « on ne sait pas » et « zéro mégawattheure » sont deux
    // réponses différentes, et la fiche les affiche différemment.
    const valeur = brut === '' ? null : Number(brut)
    if (valeur !== null && !Number.isFinite(valeur)) continue
    if (parNom.has(nom)) { doublons.add(nom); continue }
    parNom.set(nom, valeur)
  }
  for (const n of doublons) parNom.delete(n)
  return { paires: [...parNom.entries()], doublons: [...doublons] }
}

;(async () => {
  const { paires, doublons } = lireCsv()
  console.log('PDL lus dans Salesforce (hors doublons) : ' + paires.length)
  if (doublons.length > 0) {
    console.log('PDL EN DOUBLON, ECARTES (a arbitrer dans Salesforce) : ' + doublons.length)
    console.log('  ' + doublons.slice(0, 40).join(', ') + (doublons.length > 40 ? ' …' : ''))
  }

  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query('begin')
  try {
    await c.query(
      'create temporary table maj_conso (numero_point text primary key, mwh numeric) on commit drop',
    )
    const taille = 500
    for (let i = 0; i < paires.length; i += taille) {
      const tranche = paires.slice(i, i + taille)
      const valeurs = tranche.map((_, j) => '($' + (j * 2 + 1) + ',$' + (j * 2 + 2) + '::numeric)').join(',')
      await c.query(
        'insert into maj_conso (numero_point, mwh) values ' + valeurs + ' on conflict (numero_point) do nothing',
        tranche.flat(),
      )
    }

    const bilan = await c.query(`
      select
        (select count(*)::int from maj_conso) lus,
        (select count(*)::int from compteurs k join maj_conso m on m.numero_point = k.numero_point) rapproches,
        (select count(*)::int from compteurs k join maj_conso m on m.numero_point = k.numero_point
          where k.consommation_annuelle_mwh is distinct from m.mwh) a_changer,
        (select count(*)::int from compteurs k join maj_conso m on m.numero_point = k.numero_point
          where coalesce(k.consommation_annuelle_mwh, 0) > 0 and coalesce(m.mwh, 0) = 0) perdent_leur_conso,
        (select count(*)::int from compteurs k join maj_conso m on m.numero_point = k.numero_point
          where coalesce(k.consommation_annuelle_mwh, 0) = 0 and coalesce(m.mwh, 0) > 0) gagnent_une_conso,
        (select count(*)::int from maj_conso m
          where not exists (select 1 from compteurs k where k.numero_point = m.numero_point)) sans_compteur,
        (select count(*)::int from compteurs k
          where k.actif and not exists (select 1 from maj_conso m where m.numero_point = k.numero_point)) inconnus_de_salesforce,
        (select round(sum(coalesce(consommation_annuelle_mwh, 0)))::bigint from compteurs where actif) total_avant,
        (select round(sum(coalesce(m.mwh, 0)))::bigint from compteurs k join maj_conso m on m.numero_point = k.numero_point where k.actif) total_apres
    `)
    const b = bilan.rows[0]
    console.log('  rapproches avec un compteur      : ' + b.rapproches)
    console.log('  valeurs a changer                : ' + b.a_changer)
    console.log('    dont perdent leur consommation : ' + b.perdent_leur_conso)
    console.log('    dont en gagnent une            : ' + b.gagnent_une_conso)
    console.log('  PDL sans compteur en face        : ' + b.sans_compteur)
    console.log('  compteurs inconnus de Salesforce : ' + b.inconnus_de_salesforce)
    console.log('  total MWh avant : ' + Number(b.total_avant).toLocaleString('fr-FR'))
    console.log('  total MWh apres : ' + Number(b.total_apres).toLocaleString('fr-FR'))

    // Les dix plus gros écarts : de quoi vérifier à la main avant d'écrire.
    const ecarts = await c.query(`
      select k.numero_point, k.consommation_annuelle_mwh as avant, m.mwh as apres
        from compteurs k join maj_conso m on m.numero_point = k.numero_point
       where k.consommation_annuelle_mwh is distinct from m.mwh
       order by abs(coalesce(k.consommation_annuelle_mwh, 0) - coalesce(m.mwh, 0)) desc
       limit 10
    `)
    console.log('  les dix plus gros ecarts :')
    for (const e of ecarts.rows) console.log('    ' + e.numero_point + ' : ' + e.avant + ' -> ' + e.apres)

    if (!APPLIQUER) {
      await c.query('rollback')
      console.log('--- ESSAI A BLANC : rien n a ete ecrit (relancer avec --appliquer) ---')
      await c.end()
      return
    }

    const maj = await c.query(`
      update compteurs k set consommation_annuelle_mwh = m.mwh, date_modification = now()
      from maj_conso m
      where m.numero_point = k.numero_point
        and k.consommation_annuelle_mwh is distinct from m.mwh
    `)
    await c.query('commit')
    console.log('--- APPLIQUE : ' + maj.rowCount + ' compteurs mis a jour ---')
    await c.end()
  } catch (e) {
    await c.query('rollback')
    await c.end()
    throw e
  }
})()
