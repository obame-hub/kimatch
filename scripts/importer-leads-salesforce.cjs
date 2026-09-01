// ════════════════════════════════════════════════════════════════════════════════════════════════
// IMPORTE LES LEADS SALESFORCE COMME PISTES, RANGÉS EN LOTS DE TRAVAIL
//
// Michel, 01/09/2026 : « il faut importer les leads comme pistes même si c'est un chantier ».
//
// POURQUOI ÇA COMPTE : 804 des 839 « contacts » derrière les appels manquants sont des Leads, et
// 3 570 consignations d'appels leur sont rattachées. Sans les Leads dans Kimatch, ces appels n'ont
// nulle part où atterrir, et le critère « interactions » du barème des signaux reste à zéro sur 489
// des 596 contacts éligibles. Cet import est le préalable à celui des appels.
//
// ══ L'EXPORT ATTENDU ══
//
//   sf data query --target-org KiweeOrg --json --result-format json ^
//     -q "SELECT Id, Company, Name, FirstName, LastName, Title, Email, Phone, MobilePhone, City,
//         PostalCode, Status, LeadSource, Segment__c, Activite__c, SIREN__c, SIRET__c,
//         Commentaire__c, Nombre_de_lots__c, Motifs_des_pistes_disqualifiees__c, Owner.Name
//         FROM Lead WHERE IsConverted = false" > leads.json
//
// LES CONVERTIS SONT EXCLUS PAR LA REQUÊTE, et c'est essentiel : les 177 Leads convertis sont déjà
// devenus compte + contact + opportunité dans Salesforce, donc déjà repris dans Kimatch. Les
// importer comme pistes créerait un doublon de prospect en face de chaque client.
//
// ══ CE QUE LE SCRIPT FAIT ══
//
//   1. Résout le commercial : Owner.Name de Salesforce → `profils`, sur prénom + nom normalisés.
//   2. Rapproche d'un compte existant : SIRET, puis SIREN, puis nom exact. 121 des 5 131 en ont un.
//   3. Range en lots de 250 par commercial et par segment — « Thomas Le Guen · Syndics (1/7) ».
//      Les disqualifiées n'ont PAS de lot : elles entrent inactives, pour l'historique et les appels.
//   4. Insère, ou met à jour si l'identifiant Salesforce est déjà là.
//
// LES CINQ VALIDATIONS RESTENT À FAIRE. `contact_valide`, `societe_validee`, `email_valide`,
// `portable_valide`, `est_decisionnaire` entrent toutes à faux, même quand la donnée est présente :
// valider, c'est un geste du commercial qui a eu quelqu'un au téléphone, pas la présence d'un champ.
// Les pré-cocher rendrait la frise mensongère dès le premier jour.
//
// SANS `--appliquer`, RIEN N'EST ÉCRIT. Le script compte, montre les lots qu'il créerait et
// s'arrête. Cinq mille lignes dans un CRM en production se regardent avant de se lancer.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

const FICHIER = process.argv.find((a) => a.endsWith('.json'))
if (!FICHIER) {
  console.error('Usage : node scripts/importer-leads-salesforce.cjs <leads.json> [--appliquer]')
  process.exit(1)
}
const APPLIQUER = process.argv.includes('--appliquer')

/** Taille d'un lot : ce qu'un commercial peut finir avant de se décourager. */
const TAILLE_LOT = 250

const url = fs
  .readFileSync('.env.local', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('SUPABASE_DB_URL='))
  .slice('SUPABASE_DB_URL='.length)
  .trim()

/** Le BOM que `sf` place en tête de ses exports fait échouer JSON.parse sans rien expliquer. */
function lireLeads() {
  const brut = fs.readFileSync(FICHIER, 'utf8').replace(/^﻿/, '')
  const json = JSON.parse(brut.slice(brut.indexOf('{')))
  return json.result.records
}

const chiffres = (s) => (s || '').replace(/\D/g, '')
/** Casse, accents et ponctuation retirés : « Thomas LE GUEN » et « Thomas Le Guen » doivent coller. */
const normal = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toUpperCase()

const SEGMENT_COURT = { 'Syndic professionnel': 'Syndics', Entreprise: 'Entreprises' }

;(async () => {
  const leads = lireLeads()
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()

  // ── Les référentiels de rapprochement ──
  const profils = (await client.query(`select id, prenom, nom from public.profils`)).rows
  const parPersonne = new Map(profils.map((p) => [normal(`${p.prenom} ${p.nom}`), p.id]))

  const comptes = (await client.query(
    `select id, nom, siret, siren from public.comptes where actif`)).rows
  const parSiret = new Map(), parSiren = new Map(), parNomCompte = new Map()
  for (const c of comptes) {
    if (chiffres(c.siret).length === 14) parSiret.set(chiffres(c.siret), c.id)
    if (chiffres(c.siren).length === 9) parSiren.set(chiffres(c.siren), c.id)
    if (normal(c.nom)) parNomCompte.set(normal(c.nom), c.id)
  }

  const dejaLa = new Map(
    (await client.query(
      `select id, id_salesforce from public.pistes where id_salesforce is not null`))
      .rows.map((r) => [r.id_salesforce, r.id]))

  // ── Préparation ──
  const prepares = []
  const sansCommercial = []
  for (const l of leads) {
    const proprietaire = parPersonne.get(normal(l.Owner && l.Owner.Name)) ?? null
    if (!proprietaire) sansCommercial.push(l.Owner && l.Owner.Name)

    const si = chiffres(l.SIRET__c), sn = chiffres(l.SIREN__c)
    const compte =
      (si.length === 14 && parSiret.get(si)) ||
      (sn.length === 9 && parSiren.get(sn)) ||
      parNomCompte.get(normal(l.Company)) ||
      null

    const disqualifiee = l.Status === 'Disqualifiée'
    prepares.push({
      id_salesforce: l.Id,
      societe: l.Company || null,
      // `Name` colle prénom et nom ; il est vide quand le lead n'a pas de personne identifiée.
      contact_nom: (l.Name || '').trim() || null,
      email: l.Email || null,
      // Le fixe d'abord — il est renseigné sur 74 % des leads, le portable sur 1 %.
      telephone: l.Phone || l.MobilePhone || null,
      fonction: l.Title || null,
      siret: si.length === 14 ? si : null,
      siren: sn.length === 9 ? sn : null,
      ville: l.City || null,
      code_postal: l.PostalCode || null,
      segment: l.Segment__c || null,
      source: l.LeadSource || null,
      activite: l.Activite__c || null,
      nombre_de_lots: l.Nombre_de_lots__c != null ? Math.round(l.Nombre_de_lots__c) : null,
      commentaire: l.Commentaire__c || null,
      statut_salesforce: l.Status || null,
      motif_disqualification: l.Motifs_des_pistes_disqualifiees__c || null,
      proprietaire_id: proprietaire,
      compte_id: compte,
      actif: !disqualifiee,
      disqualifiee,
    })
  }

  // ── Les lots : par commercial, par segment, par paquets de 250 ──
  // Les disqualifiées n'en reçoivent pas : elles n'ont pas à être travaillées.
  const groupes = new Map()
  for (const p of prepares) {
    if (p.disqualifiee) continue
    const cle = `${p.proprietaire_id ?? 'sans'}|${p.segment ?? 'Autres'}`
    if (!groupes.has(cle)) groupes.set(cle, [])
    groupes.get(cle).push(p)
  }
  const nomDe = new Map(profils.map((p) => [p.id, `${p.prenom} ${p.nom}`]))
  const lots = []
  for (const [cle, membres] of groupes) {
    const [prop, segment] = cle.split('|')
    const proprietaire = prop === 'sans' ? null : prop
    const total = Math.ceil(membres.length / TAILLE_LOT)
    for (let i = 0; i < total; i++) {
      const tranche = membres.slice(i * TAILLE_LOT, (i + 1) * TAILLE_LOT)
      const etiquette = SEGMENT_COURT[segment] || segment
      lots.push({
        nom: `${nomDe.get(proprietaire) ?? 'Non attribué'} · ${etiquette}${total > 1 ? ` (${i + 1}/${total})` : ''}`,
        proprietaire_id: proprietaire,
        membres: tranche,
      })
    }
  }

  // ── Le rapport ──
  const nouvelles = prepares.filter((p) => !dejaLa.has(p.id_salesforce)).length
  console.log('══ CE QUE L\'IMPORT FERAIT ══')
  console.log(`leads lus                 : ${leads.length}`)
  console.log(`déjà présentes            : ${prepares.length - nouvelles}`)
  console.log(`à créer                   : ${nouvelles}`)
  console.log(`rattachées à un compte    : ${prepares.filter((p) => p.compte_id).length}`)
  console.log(`inactives (disqualifiées) : ${prepares.filter((p) => p.disqualifiee).length}`)
  console.log(`sans commercial reconnu   : ${sansCommercial.length}` +
    (sansCommercial.length ? ` — ${[...new Set(sansCommercial)].join(', ')}` : ''))
  console.log(`\nlots à créer : ${lots.length}`)
  for (const l of lots) console.log(`   ${String(l.membres.length).padStart(4)}  ${l.nom}`)

  if (!APPLIQUER) {
    console.log('\nSimulation seule. Relancer avec --appliquer pour écrire.')
    await client.end()
    return
  }

  // ── L'écriture, en UNE transaction ──
  // Cinq mille lignes réparties sur deux tables : un échec au milieu laisserait des lots vides et
  // des pistes orphelines. Tout passe ou rien ne passe.
  await client.query('begin')
  try {
    let creees = 0, majs = 0
    for (const lot of lots) {
      const r = await client.query(
        `insert into public.lots_prospection (nom, proprietaire_id, origine)
         values ($1, $2, 'Reprise Salesforce du 01/09/2026') returning id`,
        [lot.nom, lot.proprietaire_id])
      lot.id = r.rows[0].id
      for (const p of lot.membres) p.lot_id = lot.id
    }

    for (const p of prepares) {
      const colonnes = [
        'id_salesforce', 'societe', 'contact_nom', 'email', 'telephone', 'fonction', 'siret',
        'siren', 'ville', 'code_postal', 'segment', 'source', 'activite', 'nombre_de_lots',
        'commentaire', 'statut_salesforce', 'motif_disqualification', 'proprietaire_id',
        'compte_id', 'actif', 'lot_id',
      ]
      const valeurs = colonnes.map((c) => (c === 'lot_id' ? p.lot_id ?? null : p[c]))
      const jetons = colonnes.map((_, i) => `$${i + 1}`).join(', ')
      // `on conflict` sur l'identifiant Salesforce : le script se rejoue sans rien dupliquer, et
      // rafraîchit ce qui a bougé côté Salesforce depuis le dernier passage.
      const maj = colonnes.filter((c) => c !== 'id_salesforce')
        .map((c) => `${c} = excluded.${c}`).join(', ')
      const res = await client.query(
        `insert into public.pistes (${colonnes.join(', ')}) values (${jetons})
         on conflict (id_salesforce) where id_salesforce is not null
         do update set ${maj}, date_modification = now()
         returning (xmax = 0) as creee`,
        valeurs)
      if (res.rows[0].creee) creees++
      else majs++
    }

    // ── Le garde-fou, dans la transaction : on vérifie avant de valider ──
    const controle = await client.query(
      `select count(*) filter (where id_salesforce is not null) importees,
              count(*) filter (where id_salesforce is not null and lot_id is null and actif) sans_lot,
              count(*) filter (where id_salesforce is null) anciennes
         from public.pistes`)
    const { importees, sans_lot, anciennes } = controle.rows[0]
    if (Number(anciennes) !== 5) {
      throw new Error(`Les 5 pistes d'origine ne sont plus 5 mais ${anciennes}`)
    }
    if (Number(sans_lot) > 0) {
      throw new Error(`${sans_lot} pistes actives sans lot : elles seraient invisibles dans l'écran`)
    }
    await client.query('commit')
    console.log(`\n✓ ${creees} pistes créées, ${majs} mises à jour, ${lots.length} lots.`)
    console.log(`  ${importees} pistes portent désormais un identifiant Salesforce.`)
  } catch (e) {
    await client.query('rollback')
    console.error('\n✗ Rien n\'a été écrit : ' + e.message)
    process.exitCode = 1
  }
  await client.end()
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
