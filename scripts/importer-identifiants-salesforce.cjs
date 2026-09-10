// ════════════════════════════════════════════════════════════════════════════════════════════════
// RETROUVER, POUR CHAQUE OBJET KIMATCH, L'ENREGISTREMENT SALESFORCE DONT IL EST ISSU
//
// ══ POURQUOI CE SCRIPT EXISTE ══
//
// Réunion du 10/09/2026. William : « les équipes me disent que les fichiers du Salesforce n'ont pas
// été mis sur Kimatch. Sur tous leurs compteurs, aucun fichier n'a été remonté. » Naoëlle :
// « il faut que tous les fichiers des objets Salesforce soient reliés aux objets Kimatch, je ne
// veux plus que William me dise qu'il manque quelque chose. »
//
// Pour poser un fichier sur le bon objet, il faut d'abord savoir quel objet Kimatch correspond à
// quel enregistrement Salesforce. Cinq tables portaient déjà cette trace ; cinq ne l'avaient pas.
// La migration 20260910260000 a posé les colonnes, vides. Ce script les remplit.
//
// ══ COMMENT ON RAPPROCHE, ET POURQUOI PAS AUTREMENT ══
//
// Par une CLÉ NATURELLE — celle qui ne change pas entre les deux systèmes — et jamais par
// approximation de nom seule quand mieux existe :
//
//   compteurs  `Point_de_livraison__c.Name` = `numero_point`
//              Le nom du PDL EST son numéro. Mesuré : 7 922 des 7 934 PDL retrouvent leur
//              compteur ; les 12 autres sont des saisies de test (« 12345678912345 »).
//   comptes    `Siren__c` d'abord, le nom normalisé ensuite. 2 704 + 53 sur 2 763.
//   contacts   `Email` d'abord, prénom+nom ensuite. 3 064 + 318 sur 3 386.
//
// LE NOM N'EST QU'UN SECOND RECOURS, et il est normalisé (majuscules, sans accent ni ponctuation)
// parce que « SDC L'ORÉE-DU-BOIS » et « SDC L OREE DU BOIS » désignent le même client. Un
// rapprochement par nom qui trouverait DEUX candidats est abandonné plutôt qu'arbitré : rattacher
// les factures d'un client à un homonyme serait pire que de ne rien rattacher.
//
// ══ CE QU'IL NE FAIT PAS ══
//
// `requetes` reste vide, et ce n'est pas un échec du rapprochement : Salesforce porte 874 `Case`,
// Kimatch en a NEUF. Les dossiers n'ont jamais été importés. Les 35 fichiers qui y pendent n'ont
// donc aucune destination — c'est une reprise de données à décider, pas un lien à réparer.
//
// `suivis_consultations_fournisseurs` non plus : cette table est l'HISTORIQUE des événements d'une
// consultation, pas la consultation elle-même. Les 1 591 fichiers de `Suivi_cotation__c` iront sur
// la version de recommandation parente — voir `importer-fichiers-salesforce.cjs`.
//
//   node scripts/importer-identifiants-salesforce.cjs --simulation
//   node scripts/importer-identifiants-salesforce.cjs
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { Client } = require('pg')

const RACINE = path.resolve(__dirname, '..')
const SIMULATION = process.argv.includes('--simulation')

function connexion() {
  const chemin = path.join(RACINE, '.env.local')
  if (!fs.existsSync(chemin)) throw new Error('.env.local introuvable : ' + chemin)
  const url = fs.readFileSync(chemin, 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m)
  if (!url) throw new Error('SUPABASE_DB_URL absent de .env.local.')
  return new Client({ connectionString: url[1].trim(), ssl: { rejectUnauthorized: false }, statement_timeout: 300000 })
}

/**
 * Une requête SOQL, rendue en objets.
 *
 * `--json` plutôt que `-r csv` : les noms de compte contiennent des virgules et des guillemets, et
 * un découpage maison finirait par décaler une colonne sans le dire. `maxBuffer` large — 7 934
 * points de livraison ne tiennent pas dans le tampon par défaut.
 */
function soql(requete) {
  /* `shell: true` EST OBLIGATOIRE SOUS WINDOWS — `sf` y est un script `.cmd`, que `execFileSync`
     ne sait pas lancer directement. Mais il faut alors GUILLEMETER la requête soi-même : sans
     cela le shell la découpe aux espaces et `sf` reçoit « select » suivi de « Id, ». */
  const cite = '"' + requete.replace(/"/g, '\\"') + '"'
  const brut = execFileSync('sf', ['data', 'query', '-o', 'KiweeOrg', '-q', cite, '--json'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: true,
  })
  const rendu = JSON.parse(brut)
  if (rendu.status !== 0) throw new Error('SOQL en échec : ' + (rendu.message ?? 'raison inconnue'))
  return rendu.result.records
}

/** Majuscules sans accent ni ponctuation : « SDC L'ORÉE-DU-BOIS » et « SDC L OREE DU BOIS » se rejoignent. */
function normaliser(valeur) {
  return (valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/**
 * Construit un index clé → identifiant, en ÉCARTANT les clés ambiguës.
 *
 * Une clé portée par deux lignes est retirée de l'index : rattacher les factures d'un client à son
 * homonyme est pire que ne rien rattacher. Le nombre d'ambiguïtés est rendu pour qu'il se voie.
 */
function indexer(lignes, cle) {
  const index = new Map()
  const ambigus = new Set()
  for (const ligne of lignes) {
    const k = cle(ligne)
    if (!k) continue
    if (index.has(k)) ambigus.add(k)
    index.set(k, ligne.id)
  }
  for (const k of ambigus) index.delete(k)
  return { index, ambigus: ambigus.size }
}

async function rapprocher(client, def) {
  const enregistrements = soql(def.soql)
  const { rows } = await client.query(def.lecture)

  const primaire = def.clePrimaire ? indexer(rows, def.clePrimaire.kimatch) : null
  const secondaire = def.cleSecondaire ? indexer(rows, def.cleSecondaire.kimatch) : null

  const aEcrire = new Map()
  let parPrimaire = 0
  let parSecondaire = 0
  const orphelins = []

  for (const e of enregistrements) {
    let cible = null
    if (primaire) {
      const k = def.clePrimaire.salesforce(e)
      if (k && primaire.index.has(k)) {
        cible = primaire.index.get(k)
        parPrimaire++
      }
    }
    if (!cible && secondaire) {
      const k = def.cleSecondaire.salesforce(e)
      if (k && secondaire.index.has(k)) {
        cible = secondaire.index.get(k)
        parSecondaire++
      }
    }
    if (!cible) {
      orphelins.push(def.etiquette(e))
      continue
    }
    /* UN OBJET KIMATCH NE REÇOIT QU'UN IDENTIFIANT. Si deux enregistrements Salesforce tombent sur
       la même ligne, on garde le premier et on signale : c'est un doublon côté Salesforce, pas une
       erreur de rapprochement, et l'écraser silencieusement ferait perdre la trace du premier. */
    if (!aEcrire.has(cible)) aEcrire.set(cible, e.Id)
  }

  console.log('')
  console.log(`── ${def.nom.toUpperCase()} ──`)
  console.log(`   ${enregistrements.length} enregistrement(s) Salesforce, ${rows.length} ligne(s) Kimatch`)
  console.log(`   ${parPrimaire} par ${def.clePrimaire.nom}` + (secondaire ? `, ${parSecondaire} par ${def.cleSecondaire.nom}` : ''))
  console.log(`   ${aEcrire.size} identifiant(s) à écrire, ${orphelins.length} sans correspondance`)
  if (primaire?.ambigus) console.log(`   ${primaire.ambigus} clé(s) ${def.clePrimaire.nom} ambiguë(s), écartées`)
  if (secondaire?.ambigus) console.log(`   ${secondaire.ambigus} clé(s) ${def.cleSecondaire.nom} ambiguë(s), écartées`)
  if (orphelins.length > 0) console.log(`   exemples sans correspondance : ${orphelins.slice(0, 5).join(' · ')}`)

  if (SIMULATION || aEcrire.size === 0) return { table: def.table, ecrits: 0, prevus: aEcrire.size }

  /* UNE SEULE INSTRUCTION POUR TOUTE LA TABLE. Treize mille `update` un par un tiendraient la
     connexion plusieurs minutes ; un `update … from (values …)` fait le tour en une passe. */
  const valeurs = [...aEcrire.entries()]
  const params = []
  const tuples = valeurs.map(([id, sf], i) => {
    params.push(id, sf)
    return `($${i * 2 + 1}::uuid, $${i * 2 + 2}::text)`
  })
  const res = await client.query(
    `update ${def.table} t set id_salesforce = v.sf
       from (values ${tuples.join(',')}) as v(id, sf)
      where t.id = v.id and t.id_salesforce is distinct from v.sf`,
    params,
  )
  console.log(`   → ${res.rowCount} ligne(s) écrite(s)`)
  return { table: def.table, ecrits: res.rowCount, prevus: aEcrire.size }
}

const DEFINITIONS = [
  {
    nom: 'compteurs',
    table: 'compteurs',
    soql: 'select Id, Name from Point_de_livraison__c',
    lecture: 'select id, numero_point from compteurs',
    clePrimaire: {
      nom: 'numéro de PDL',
      salesforce: (e) => (e.Name ?? '').trim(),
      kimatch: (r) => String(r.numero_point ?? '').trim(),
    },
    etiquette: (e) => e.Name,
  },
  {
    nom: 'comptes',
    table: 'comptes',
    soql: 'select Id, Name, Siren__c from Account',
    lecture: 'select id, nom, siren from comptes',
    clePrimaire: {
      nom: 'SIREN',
      salesforce: (e) => (e.Siren__c ?? '').replace(/\D/g, '') || null,
      kimatch: (r) => String(r.siren ?? '').replace(/\D/g, '') || null,
    },
    cleSecondaire: {
      nom: 'nom',
      salesforce: (e) => normaliser(e.Name) || null,
      kimatch: (r) => normaliser(r.nom) || null,
    },
    etiquette: (e) => e.Name,
  },
  {
    nom: 'contacts',
    table: 'contacts',
    soql: 'select Id, FirstName, LastName, Email from Contact',
    lecture: 'select id, prenom, nom, email from contacts',
    clePrimaire: {
      nom: 'email',
      salesforce: (e) => (e.Email ?? '').toLowerCase().trim() || null,
      kimatch: (r) => (r.email ?? '').toLowerCase().trim() || null,
    },
    cleSecondaire: {
      nom: 'prénom + nom',
      salesforce: (e) => (normaliser(e.FirstName) + '|' + normaliser(e.LastName)).replace(/^\|$/, '') || null,
      kimatch: (r) => (normaliser(r.prenom) + '|' + normaliser(r.nom)).replace(/^\|$/, '') || null,
    },
    etiquette: (e) => `${e.FirstName ?? ''} ${e.LastName ?? ''}`.trim(),
  },
]

async function main() {
  const client = connexion()
  await client.connect()
  try {
    console.log('')
    console.log(SIMULATION ? 'SIMULATION — rien ne sera écrit' : 'ÉCRITURE')

    await client.query('begin')
    const bilan = []
    for (const def of DEFINITIONS) bilan.push(await rapprocher(client, def))

    if (SIMULATION) {
      await client.query('rollback')
      console.log('\nSIMULATION terminée — transaction annulée.')
    } else {
      await client.query('commit')
      console.log('\n── BILAN ──')
      for (const b of bilan) console.log(`   ${b.table.padEnd(12)} ${b.ecrits} écrit(s) sur ${b.prevus} prévu(s)`)
    }

    /* CE QUE LE SCRIPT NE PEUT PAS RELIER, ET POURQUOI. Le taire donnerait l'impression d'une
       reprise complète, et c'est exactement le reproche auquel ce travail répond. */
    console.log('')
    console.log('── CE QUI RESTE SANS DESTINATION, ET CE N\'EST PAS UN ÉCHEC DE RAPPROCHEMENT ──')
    console.log('   requetes : Salesforce porte 874 « Case », Kimatch en a 9 — les dossiers n\'ont')
    console.log('              jamais été importés. Les 35 fichiers qui y pendent n\'ont nulle part')
    console.log('              où aller tant que cette reprise n\'est pas décidée.')
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('ÉCHEC :', e.message)
  process.exit(1)
})
