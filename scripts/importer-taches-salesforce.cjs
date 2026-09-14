// ════════════════════════════════════════════════════════════════════════════════════════════════
// LES TÂCHES ENCORE OUVERTES DE SALESFORCE REJOIGNENT KIMATCH
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// Naoëlle, 14/09/2026 : « commence les tâches Salesforce ». C'est le dernier bloc de travail vivant
// resté dans l'ancien outil.
//
// ══ CE QU'ON IMPORTE, ET SURTOUT CE QU'ON N'IMPORTE PAS ══════════════════════════════════════
//
// Salesforce porte 44 946 `Task`. Le croisement du 11/09 a montré que 39 195 d'entre elles sont
// DÉJÀ dans Kimatch, dans `interactions` : les courriels archivés et les appels journalisés ont été
// repris de longue date. Réimporter l'ensemble créerait 39 000 doublons.
//
// On ne prend donc que les tâches ENCORE OUVERTES et absentes de Kimatch — le travail qui attend
// vraiment quelqu'un. Relevé du 14/09 : 872 ouvertes chez Salesforce, 479 absentes ici.
//
// ── ET PARMI CELLES-LÀ, ON ÉCARTE LES 209 « PREMIER CONTRÔLE FACTURATION » ──
//
// Ce sont exactement les requêtes importées le 10/09, qui portent le même intitulé et le même
// compte : chez Salesforce la requête CRÉAIT la tâche, les deux existent pour un seul travail.
// Les importer afficherait la même chose deux fois dans Kimatch, et personne ne saurait laquelle
// fait foi. La requête reste la source — elle a un statut, une catégorie et un historique que la
// tâche n'a pas.
//
// Reste 270 tâches : 253 de nature `Task`, 17 appels à passer.
//
// ══ CE À QUOI ELLES SE RATTACHENT ════════════════════════════════════════════════════════════
//
//   compte           258      « rappeler première semaine 2028 », « contrôler facture »
//   requête            6
//   aucun parent       5
//   cotation           1
//
// D'où la colonne `actions.compte_id`, ajoutée par la migration 20260914110000 : sans elle, 258 de
// ces tâches arriveraient détachées, et une tâche qui n'apparaît sur aucune fiche est une tâche que
// personne ne fera.
//
// ══ CE QU'ON NE PEUT PAS REPRENDRE ═══════════════════════════════════════════════════════════
//
// LE PROPRIÉTAIRE. `Task.OwnerId` est rempli, mais les profils Kimatch n'ont aucun identifiant
// Salesforce. Rapprocher sur le nom attribuerait des tâches à la mauvaise personne dès la première
// homonymie — et une tâche mal attribuée ne se voit pas, alors qu'une tâche sans propriétaire se
// voit et se réattribue. Même arbitrage que pour les requêtes le 10/09.
//
// Usage : npm run sf:taches
//         npm run sf:taches -- --simulation
// ════════════════════════════════════════════════════════════════════════════════════════════════

const { Client } = require('pg')
const fs = require('fs')
const { execFileSync } = require('child_process')

const SIMULATION = process.argv.includes('--simulation')

function env(cle) {
  const ligne = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith(cle + '='))
  return ligne ? ligne.slice(cle.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}

/** Quinze ou dix-huit caractères, c'est le même enregistrement. */
const court = (id) => (id ?? '').slice(0, 15)

function soql(requete) {
  /* WINDOWS : `sf` est un `.cmd`, donc `shell: true` — et alors le shell recoupe la requête sur les
     espaces si on ne la met pas soi-même entre guillemets. */
  const brut = execFileSync('sf', ['data', 'query', '--query', `"${requete}"`, '-o', 'KiweeOrg', '--json'],
    { shell: true, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
  const rendu = JSON.parse(brut)
  if (rendu.status !== 0) throw new Error('SOQL en échec : ' + (rendu.message ?? 'raison inconnue'))
  return rendu.result.records
}

/* ── LE DOUBLON À ÉCARTER ────────────────────────────────────────────────────────────────────
   Écrit en une expression et non en une liste de sujets : les intitulés Salesforce sont saisis à
   la main et portent des fautes — on a « fair eun point » à côté de « faire un point ». */
const DEJA_EN_REQUETE = /premier contr[oô]le facturation/i

/* Et le déchet de démonstration laissé par l'installation de Salesforce. */
const DECHET = /^delete sample/i

/**
 * ══ LE TYPE DE TÂCHE, DÉDUIT DU SUJET ══
 *
 * Kimatch a vingt-trois types précis, Salesforce n'en a aucun sur ces tâches : le sujet est le seul
 * indice. On le lit, et on retombe sur AUTRE plutôt que d'inventer — une tâche mal typée se filtre
 * mal, une tâche « Autre » se lit quand même.
 *
 * `NRP` est du jargon de plateau : « ne répond pas ». C'est un appel à refaire.
 */
function typeDeTache(sujet, nature) {
  const s = (sujet || '').toLowerCase()
  if (/^nrp\b|ne r[ée]pond pas/.test(s)) return 'APPELER'
  if (/^call\b|appel|rappeler|rappel\b|t[ée]l[ée]phon/.test(s)) return 'APPELER'
  if (/^ech\b|[ée]ch[ée]ance|engag[ée]|renouvel/.test(s)) return 'ANTICIPER_RENOUVELLEMENT'
  if (/point|suivi|rdv|rendez-vous/.test(s)) return 'POINT_SUIVI_CLIENT'
  if (/factur/.test(s)) return 'CONTROLER_PREMIERE_FACTURE'
  if (/mandat/.test(s)) return 'PREPARER_MANDAT'
  if (/r[ée]siliation/.test(s)) return 'PREPARER_RESILIATION'
  if (/mail|courriel|email/.test(s)) return 'ENVOYER_EMAIL'
  if (/relanc/.test(s)) return 'RELANCER'

  /* ══ LES TOURNURES MAISON, RELEVÉES DANS LES INTITULÉS RÉELS ══
     Cent quatre-vingt-sept intitulés distincts, tous saisis à la main. Les motifs ci-dessous
     couvrent ceux qui reviennent, fautes de frappe comprises — « RENEGO GLOABLE » existe. */
  if (/ren[ée]go/.test(s)) return 'ANTICIPER_RENOUVELLEMENT'
  if (/(proposer|envoyer|pr[ée]senter).{0,12}offre/.test(s)) return 'PRESENTER_RECOMMANDATION'
  if (/cota|cotation/.test(s)) return 'ACTUALISER_RECOMMANDATION'
  if (/^contacter/.test(s)) return 'APPELER'
  if (/prospection/.test(s)) return 'VERIFIER_INTERET'

  if (nature === 'Call') return 'APPELER'

  /* ET ON S'ARRÊTE LÀ. Restent « Retour CS » (32) et « FABA » (9) : deux sigles maison dont je ne
     connais pas le sens. Les ranger au jugé donnerait des tâches mal typées, donc mal filtrées,
     donc invisibles dans les listes où on les cherche — « Autre » est un aveu, un mauvais type est
     une erreur. La question est posée à Naoëlle ; le jour où elle répond, ces deux lignes
     s'ajoutent ici et un nouveau passage les reclassera. */
  return 'AUTRE'
}

/** Les trois statuts ouverts de Salesforce, rangés dans les cinq de Kimatch. */
const STATUT = {
  'Open': 'A_FAIRE',
  'Not Started': 'A_FAIRE',
  'In Progress': 'EN_COURS',
  'Deferred': 'EN_ATTENTE',
  'Waiting on someone else': 'EN_ATTENTE',
}

/** Les préfixes d'identifiant Salesforce, et la colonne de `actions` où ils se rangent. */
const RATTACHEMENT = {
  '001': 'compte_id',
  '500': 'requete_id',
  '006': 'opportunite_id',
  '00Q': 'piste_id',
  'a03': 'mandat_id',
  'a07': 'version_recommandation_id',
}

async function main() {
  const client = new Client({
    connectionString: env('SUPABASE_DB_URL'),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 300000,
  })
  await client.connect()
  try {
    console.log(SIMULATION ? '\nSIMULATION — rien ne sera écrit\n' : '\nIMPORT DES TÂCHES\n')

    const types = await client.query('select code, id from types_actions')
    const statuts = await client.query('select code, id from statuts_actions')
    const parType = new Map(types.rows.map((r) => [r.code, r.id]))
    const parStatut = new Map(statuts.rows.map((r) => [r.code, r.id]))

    /* CE QUE KIMATCH CONNAÎT DÉJÀ, des deux côtés. `interactions` porte les 39 195 courriels et
       appels repris de longue date : sans les compter, on les réimporterait en tâches. */
    const deja = new Set()
    for (const t of ['interactions', 'actions']) {
      const { rows } = await client.query(`select source_externe_id from ${t} where source_externe_id is not null`)
      for (const r of rows) deja.add(court(r.source_externe_id))
    }
    console.log(`   ${deja.size} identifiant(s) externe(s) déjà connus de Kimatch`)

    /* Les objets Kimatch, par leur identifiant Salesforce. Le contrat se rapproche par son NUMÉRO
       (`contrats.id_salesforce` contient « 00000170 ») mais aucune tâche ouverte n'y pend :
       inutile de traduire ce qui ne sert pas. */
    const cibles = new Map()
    for (const [table, colonne] of [
      ['comptes', 'compte_id'], ['requetes', 'requete_id'], ['opportunites', 'opportunite_id'],
      ['pistes', 'piste_id'], ['mandats', 'mandat_id'], ['versions_recommandation', 'version_recommandation_id'],
    ]) {
      /* TOUTES LES TABLES NE PORTENT PAS D'IDENTIFIANT SALESFORCE. `opportunites` n'en a pas — et
         aucune tâche ouverte n'y pend, donc rien à traduire. On l'ignore au lieu de faire échouer
         l'import entier sur une colonne absente : un rattachement qu'on ne sait pas faire coûte une
         tâche mal rangée, une exception coûte les 270. */
      const { rows: existe } = await client.query(
        `select 1 from information_schema.columns
          where table_schema = 'public' and table_name = $1 and column_name = 'id_salesforce'`, [table])
      if (existe.length === 0) {
        console.log(`   (${table} n'a pas d'identifiant Salesforce — rattachement impossible)`)
        continue
      }
      const { rows } = await client.query(`select id, id_salesforce from ${table} where id_salesforce is not null`)
      cibles.set(colonne, new Map(rows.map((r) => [court(r.id_salesforce), r.id])))
    }
    const contacts = new Map(
      (await client.query('select id, id_salesforce from contacts where id_salesforce is not null'))
        .rows.map((r) => [court(r.id_salesforce), r.id]))

    console.log('\nLecture des tâches Salesforce encore ouvertes…')
    const brutes = soql(
      'select Id, Subject, TaskSubtype, Status, Priority, ActivityDate, Description, '
      + 'WhatId, WhoId, CreatedDate from Task where IsClosed = false')
    console.log(`   ${brutes.length} ouverte(s) chez Salesforce`)

    const compte = { deja: 0, doublons: 0, dechet: 0, sansCible: 0, statutInconnu: new Map() }
    const aEcrire = []

    for (const t of brutes) {
      if (deja.has(court(t.Id))) { compte.deja++; continue }
      if (DEJA_EN_REQUETE.test(t.Subject ?? '')) { compte.doublons++; continue }
      if (DECHET.test(t.Subject ?? '')) { compte.dechet++; continue }

      const codeStatut = STATUT[t.Status] ?? 'A_FAIRE'
      if (!STATUT[t.Status]) compte.statutInconnu.set(t.Status, (compte.statutInconnu.get(t.Status) ?? 0) + 1)

      /* LE RATTACHEMENT, déduit du préfixe de `WhatId`. Une tâche dont l'objet parent n'est pas
         dans Kimatch retombe sur le contact s'il existe — et sinon n'est pas importée : la règle
         `actions_contexte_check` la refuserait, et une tâche flottante ne se verrait nulle part. */
      const liens = {}
      const prefixe = t.WhatId ? t.WhatId.slice(0, 3) : null
      const colonne = prefixe ? RATTACHEMENT[prefixe] : null
      if (colonne) {
        const cible = cibles.get(colonne)?.get(court(t.WhatId))
        if (cible) liens[colonne] = cible
      }
      if (t.WhoId) {
        const c = contacts.get(court(t.WhoId))
        if (c) liens.contact_id = c
      }
      if (Object.keys(liens).length === 0) { compte.sansCible++; continue }

      aEcrire.push({
        titre: (t.Subject ?? 'Tâche sans intitulé').slice(0, 300),
        commentaire: t.Description ?? null,
        date_prevue: t.ActivityDate ?? null,
        type_action_id: parType.get(typeDeTache(t.Subject, t.TaskSubtype)) ?? parType.get('AUTRE') ?? null,
        statut_id: parStatut.get(codeStatut) ?? null,
        /* `Priority` de Salesforce : High / Normal / Low. Kimatch chiffre de 1 à 3, 2 par défaut. */
        priorite: t.Priority === 'High' ? 1 : t.Priority === 'Low' ? 3 : 2,
        date_creation: t.CreatedDate ?? null,
        source_externe_id: t.Id,
        ...liens,
      })
    }

    console.log(`\n   ${compte.deja} déjà connue(s), ${compte.doublons} doublon(s) de requête écarté(s)`)
    if (compte.dechet > 0) console.log(`   ${compte.dechet} tâche(s) de démonstration Salesforce écartée(s)`)
    if (compte.sansCible > 0) console.log(`   ${compte.sansCible} sans aucun objet Kimatch où se poser`)
    for (const [s, n] of compte.statutInconnu) console.log(`   ⚠ statut Salesforce inconnu « ${s} » : ${n} (rangé en À faire)`)
    console.log(`   ${aEcrire.length} à écrire`)

    const parCol = new Map()
    for (const a of aEcrire) {
      for (const k of Object.keys(a)) {
        if (k.endsWith('_id') && k !== 'type_action_id' && k !== 'statut_id') {
          parCol.set(k, (parCol.get(k) ?? 0) + 1)
        }
      }
    }
    console.log('   rattachements : ' + [...parCol.entries()].filter(([k]) => k !== 'source_externe_id')
      .map(([k, n]) => `${k.replace('_id', '')} ${n}`).join(' · '))

    const parTypeChoisi = new Map()
    for (const a of aEcrire) {
      const code = [...parType.entries()].find(([, id]) => id === a.type_action_id)?.[0] ?? '?'
      parTypeChoisi.set(code, (parTypeChoisi.get(code) ?? 0) + 1)
    }
    console.log('   types : ' + [...parTypeChoisi.entries()].sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`).join(' · '))

    if (SIMULATION) {
      console.log('\nSIMULATION terminée — rien n’a été écrit.')
      return
    }

    /* UNE SEULE TRANSACTION. 270 lignes, c'est peu : soit tout entre, soit rien. Une reprise à
       moitié faite serait à démêler à la main — c'est ce qui a failli arriver le 10/09 quand
       l'import des requêtes s'est arrêté à la 200e ligne sur une contrainte non vérifiée. */
    await client.query('begin')
    let n = 0
    for (const a of aEcrire) {
      const colonnes = Object.keys(a)
      const valeurs = colonnes.map((_, i) => `$${i + 1}`)
      await client.query(
        `insert into actions (${colonnes.join(', ')}) values (${valeurs.join(', ')}) on conflict do nothing`,
        colonnes.map((c) => a[c]))
      n++
      if (n % 100 === 0) console.log(`   … ${n} / ${aEcrire.length}`)
    }
    await client.query('commit')

    const { rows: [total] } = await client.query('select count(*)::int n from actions')
    const { rows: ouvertes } = await client.query(`
      select s.code, count(*)::int n from actions a
      join statuts_actions s on s.id = a.statut_id group by s.code order by 2 desc`)
    console.log('\n── BILAN ──')
    console.log(`   ${n} tâche(s) écrite(s) · ${total.n} en base au total`)
    for (const r of ouvertes) console.log(`   ${String(r.n).padStart(5)}  ${r.code}`)

    /* RÉANALYSER APRÈS UNE INSERTION. Le 07/09/2026, un import de 10 539 lignes sans `analyze` a
       bloqué toute l'équipe : le planificateur croyait la table vide. */
    console.log('\nRéanalyse de la table…')
    await client.query('analyze actions')
    console.log('   faite.')
  } finally {
    await client.end()
  }
}

main().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1) })
