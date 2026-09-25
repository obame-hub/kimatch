/**
 * POURQUOI 429 FICHIERS N'ONT-ILS PAS DE FICHE ?
 *
 * 222 contrats et 163 mandats. Avant de poser une policy qui les rendrait invisibles, il faut
 * savoir ce qu'ils sont : des doublons remplacés, des restes d'un import, ou de vrais documents que
 * l'équipe ouvre encore. La réponse change la règle à écrire.
 */
const fs = require('fs')
const { Client } = require('pg')

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
const c = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

const MARQ = '/documents/'

;(async () => {
  await c.connect()

  const noms = (await c.query(
    "select name, created_at from storage.objects where bucket_id='documents'")).rows
  const urls = (await c.query("select url from documents where url is not null")).rows.map((r) => r.url)

  const connus = new Set()
  for (const u of urls) {
    const i = u.indexOf(MARQ)
    if (i < 0) continue
    try { connus.add(decodeURIComponent(u.slice(i + MARQ.length))) }
    catch { connus.add(u.slice(i + MARQ.length)) }
  }

  const orphelins = noms.filter((n) => !connus.has(n.name))
  console.log('')
  console.log('   orphelins : ' + orphelins.length)

  // ── ① L'ENTITÉ QU'ILS DÉSIGNENT EXISTE-T-ELLE ENCORE ? ──
  //
  // Le chemin porte le type et l'uuid : `contrats/<uuid>/…`. Si le contrat n'existe plus, le
  // fichier est un reste d'une suppression — personne ne le cherche.
  const TABLES = {
    contrats: 'contrats', contrat: 'contrats',
    mandats: 'mandats', mandat: 'mandats',
    compteur: 'compteurs', compte: 'comptes', contact: 'contacts', site: 'sites',
  }
  let entiteVivante = 0
  let entiteMorte = 0
  let nonVerifiable = 0
  const exemplesVivants = []

  for (const o of orphelins) {
    const [dossier, uuid] = o.name.split('/')
    const table = TABLES[dossier]
    if (!table || !uuid || uuid.length !== 36) { nonVerifiable++; continue }
    const n = (await c.query('select count(*) n from ' + table + ' where id=$1', [uuid])).rows[0].n
    if (Number(n) > 0) {
      entiteVivante++
      if (exemplesVivants.length < 6) exemplesVivants.push({ dossier, uuid: uuid.slice(0, 8), nom: o.name.split('/').pop().slice(0, 40) })
    } else entiteMorte++
  }

  console.log('')
  console.log('══ CE QUE DESIGNE LEUR CHEMIN ══')
  console.log('   l entite existe encore  : ' + entiteVivante + '   <- ceux-la comptent')
  console.log('   l entite a ete supprimee: ' + entiteMorte)
  console.log('   chemin non interpretable: ' + nonVerifiable)

  if (exemplesVivants.length) {
    console.log('')
    console.log('══ DES FICHIERS RATTACHES A UNE ENTITE VIVANTE, MAIS SANS FICHE ══')
    console.table(exemplesVivants)
  }

  // ── ② SONT-ILS DES DOUBLONS D'UN FICHIER QUI, LUI, A UNE FICHE ? ──
  //
  // Même entité + même nom de fichier à quelques secondes d'écart = un téléversement recommencé.
  let doublons = 0
  for (const o of orphelins) {
    const parts = o.name.split('/')
    if (parts.length < 3) continue
    const prefixe = parts.slice(0, 2).join('/')
    const nomFichier = parts[2].replace(/^\d+_/, '')
    const jumeau = [...connus].some((k) => k.startsWith(prefixe + '/') && k.replace(/^.*\/\d+_/, '') === nomFichier)
    if (jumeau) doublons++
  }
  console.log('')
  console.log('   dont un fichier de MEME NOM sur la meme entite a, lui, une fiche : ' + doublons)

  console.log('')
  console.log('══ QUAND ONT-ILS ETE DEPOSES ? ══')
  const parAnnee = {}
  for (const o of orphelins) {
    const a = o.created_at ? new Date(o.created_at).toISOString().slice(0, 7) : '(inconnu)'
    parAnnee[a] = (parAnnee[a] || 0) + 1
  }
  console.table(Object.entries(parAnnee).sort().map(([mois, n]) => ({ mois, n })))

  await c.end()
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
