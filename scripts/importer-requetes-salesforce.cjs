// ════════════════════════════════════════════════════════════════════════════════════════════════
// LES REQUÊTES DE SALESFORCE REJOIGNENT KIMATCH
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// Naoëlle, 10/09/2026 : « pareil faut importer les requêtes ». Kimatch en avait 9, Salesforce en
// a 874 — le dernier gros bloc de données jamais repris.
//
// ══ CE QUE C'EST VRAIMENT, ET IL FALLAIT LE REGARDER AVANT D'IMPORTER ═════════════════════════
//
// Le mot « requête » fait penser à une réclamation client. Relevé des sujets :
//
//   Envoyer Mail de bienvenue          346
//   Premier contrôle facturation       328
//   Lettre de résiliation              133
//   sans type                           66
//   Cotation                             1
//
// CE SONT DES TÂCHES DE PROCESSUS, PAS DES PLAINTES. Créées automatiquement pour 785 d'entre
// elles (`Type__c = Automatique`). Les importer transforme l'écran Requêtes en liste de travail —
// c'est un changement d'usage, signalé à Naoëlle avant de l'appliquer.
//
// ══ « MERGED » NE VEUT PAS DIRE FUSIONNÉ ══════════════════════════════════════════════════════
//
// 639 des 874 portent le statut `Merged`, et j'ai failli les écarter comme des doublons. Les
// sujets disent autre chose : « Envoyer Mail de bienvenue » daté de novembre 2025, avec un
// compte, un contrat et une opportunité. C'est le mot que l'équipe a utilisé pour DÉJÀ FAIT.
//
// La preuve par la répartition : 345 des 346 « Mail de bienvenue » sont Merged, contre 115 des
// 328 « Premier contrôle facturation ». Si Merged voulait dire doublon, il n'y aurait aucune
// raison qu'un type soit fusionné à 99 % et l'autre à 35 %. En revanche, qu'on ait envoyé tous
// les mails de bienvenue et pas fait tous les contrôles de facturation, c'est la vie normale
// d'une équipe.
//
// `Merged` devient donc RESOLUE, et non ABANDONNEE. Ce qui compte : les 211 « Premier contrôle
// facturation » restés Nouvelle sont du travail réel qui attend, et personne ne le voyait.
//
// ══ CE QU'ON NE PEUT PAS REPRENDRE ════════════════════════════════════════════════════════════
//
// · LE PROPRIÉTAIRE. `Case.OwnerId` est rempli sur les 874, mais les 13 profils Kimatch n'ont
//   aucun identifiant Salesforce — seulement prénom, nom, courriel. Rapprocher sur le nom
//   attribuerait des requêtes à la mauvaise personne dès la première homonymie. On laisse vide :
//   une requête sans propriétaire se voit et se réattribue, une requête attribuée à tort ne se
//   voit pas.
//
// · LE COMPTEUR. `Case.Point_de_livraison__c` est vide sur les 874 sans exception. Rien à
//   reprendre, et rien à déduire.
//
// Usage : npm run sf:requetes            importe
//         npm run sf:requetes -- --simulation   compte et rapproche sans écrire
// ════════════════════════════════════════════════════════════════════════════════════════════════

const { Client } = require('pg')
const fs = require('fs')
const { execFileSync } = require('child_process')

const SIMULATION = process.argv.includes('--simulation')

function env(cle) {
  const ligne = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith(cle + '='))
  return ligne ? ligne.slice(cle.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}

/** Quinze ou dix-huit caractères, c'est le même enregistrement — voir l'import des fichiers. */
const court = (id) => (id ?? '').slice(0, 15)

function soql(requete) {
  /* WINDOWS : `sf` est un `.cmd`, donc `shell: true` — et alors le shell recoupe la requête sur
     les espaces si on ne la met pas soi-même entre guillemets. */
  const brut = execFileSync('sf', ['data', 'query', '--query', `"${requete}"`, '-o', 'KiweeOrg', '--json'],
    { shell: true, maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
  const rendu = JSON.parse(brut)
  if (rendu.status !== 0) throw new Error('SOQL en échec : ' + (rendu.message ?? 'raison inconnue'))
  return rendu.result.records
}

/* ── LES CORRESPONDANCES, ÉTABLIES SUR LES VALEURS RÉELLEMENT PRÉSENTES ───────────────────────── */

const STATUT = {
  'Nouvelle': 'NOUVELLE',
  'En cours de traitement': 'EN_TRAITEMENT',
  'Procédure engagée': 'EN_TRAITEMENT',
  'Abandonnée': 'ABANDONNEE',
  'Merged': 'RESOLUE',
}

/* Les quatre types de Kimatch ne recouvrent pas les huit de Salesforce. On range par ce que la
   tâche VÉRIFIE ou DEMANDE, pas par son intitulé. */
const TYPE = {
  'Premier contrôle facturation': 'CONTROLE_TARIFAIRE',
  'Lettre de résiliation': 'CONTROLE_CONTRACTUEL',
  'Mail de bienvenue': 'DEMANDE',
  'Cotation': 'DEMANDE',
  'Question': 'DEMANDE',
  'Demande de fonctionnalité': 'DEMANDE',
  'Problème': 'RECLAMATION',
  'Audit compte client / prospect': 'CONTROLE_CONTRACTUEL',
}

/* ── LA CATÉGORIE EST UNE LISTE FERMÉE CÔTÉ KIMATCH ──────────────────────────────────────────
   `requetes_categorie_check` n'accepte que sept valeurs, et j'ai lancé l'import sans le vérifier :
   il s'est arrêté à la 200e ligne. La transaction a tout annulé — c'est bien pour ça qu'elle est
   là — mais la leçon vaut d'être écrite : une colonne texte n'est pas une colonne libre.

   Salesforce en a huit, plus fines, qui se rangent sans perte dans les sept. */
const CATEGORIE = {
  'Facturation & contrôle': 'FACTURATION',
  'Taxes, contributions & lignes de facture': 'FACTURATION',
  'Contrat et vie du contrat': 'CONTRAT',
  'Consommation et estimation': 'COMPTEUR',
  'Données techniques & puissance': 'COMPTEUR',
  'Documents et justificatifs': 'DOCUMENT',
  'Incidents et urgences': 'RECLAMATION',
  'Accompagnement & conseil': 'AUTRE',
}

/* ET QUAND SALESFORCE NE DIT RIEN — 822 cas sur 874 — LE SUJET LE DIT.
   « Premier contrôle facturation » est une affaire de facturation, qu'on ait rempli le champ
   catégorie ou non. Laisser vide serait fidèle à Salesforce et inutile à Kimatch : la liste des
   requêtes se filtre par catégorie, et 822 lignes « sans catégorie » ne se filtrent pas. */
const CATEGORIE_PAR_TYPE = {
  'Premier contrôle facturation': 'FACTURATION',
  'Lettre de résiliation': 'CONTRAT',
  'Mail de bienvenue': 'AUTRE',
  'Cotation': 'CONTRAT',
  'Audit compte client / prospect': 'CONTRAT',
  'Problème': 'RECLAMATION',
  'Question': 'AUTRE',
  'Demande de fonctionnalité': 'AUTRE',
}

async function main() {
  const client = new Client({
    connectionString: env('SUPABASE_DB_URL'),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 300000,
  })
  await client.connect()
  try {
    console.log(SIMULATION ? '\nSIMULATION — rien ne sera écrit\n' : '\nIMPORT DES REQUÊTES\n')

    /* UNE SEULE CONNEXION `pg` NE PARALLÉLISE PAS. Un `Promise.all` sur le même client fait
       tourner les requêtes en file de toute façon, et `pg` en avertit depuis la version 8. On les
       enchaîne donc franchement : même durée, sans le mensonge. */
    const statuts = await client.query('select code, id from statuts_requetes')
    const types = await client.query('select code, id from types_requetes')
    const comptes = await client.query('select id, id_salesforce from comptes where id_salesforce is not null')
    const contacts = await client.query('select id, id_salesforce from contacts where id_salesforce is not null')
    const contrats = await client.query('select id, id_salesforce from contrats where id_salesforce is not null')
    const dejaLa = await client.query('select id_salesforce from requetes where id_salesforce is not null')
    const parStatut = new Map(statuts.rows.map((r) => [r.code, r.id]))
    const parType = new Map(types.rows.map((r) => [r.code, r.id]))
    const parCompte = new Map(comptes.rows.map((r) => [court(r.id_salesforce), r.id]))
    const parContact = new Map(contacts.rows.map((r) => [court(r.id_salesforce), r.id]))
    const dejaImporte = new Set(dejaLa.rows.map((r) => r.id_salesforce))

    /* LE CONTRAT SE RAPPROCHE PAR SON NUMÉRO, PAS PAR SON ID — `contrats.id_salesforce` contient
       « 00000170 », c'est `Contract.ContractNumber`. Même traduction que pour les fichiers. */
    const numeroDeContrat = new Map(
      soql('select Id, ContractNumber from Contract').map((c) => [court(c.Id), c.ContractNumber]))
    const parContrat = new Map(contrats.rows.map((r) => [r.id_salesforce, r.id]))

    console.log('Lecture des requêtes Salesforce…')
    const cas = soql(
      'select Id, CaseNumber, Subject, Description, Status, Type, Origin, Cat_gorie__c, '
      + 'AccountId, ContactId, Contrat__c, CreatedDate, ClosedDate from Case')
    console.log(`   ${cas.length} requête(s)\n`)

    const compte = { statutInconnu: new Map(), typeInconnu: new Map(), categorieInconnue: new Map(),
      sansCompte: 0, sansContact: 0, sansContrat: 0, deja: 0 }
    const aEcrire = []

    for (const c of cas) {
      if (dejaImporte.has(c.Id)) { compte.deja++; continue }

      const codeStatut = STATUT[c.Status]
      if (!codeStatut) compte.statutInconnu.set(c.Status, (compte.statutInconnu.get(c.Status) ?? 0) + 1)
      const codeType = TYPE[c.Type]
      if (c.Type && !codeType) compte.typeInconnu.set(c.Type, (compte.typeInconnu.get(c.Type) ?? 0) + 1)

      const compteId = c.AccountId ? parCompte.get(court(c.AccountId)) : null
      const contactId = c.ContactId ? parContact.get(court(c.ContactId)) : null
      const numero = c.Contrat__c ? numeroDeContrat.get(court(c.Contrat__c)) : null
      const contratId = numero ? parContrat.get(numero) : null
      if (c.AccountId && !compteId) compte.sansCompte++
      if (c.ContactId && !contactId) compte.sansContact++
      if (c.Contrat__c && !contratId) compte.sansContrat++

      const categorie = CATEGORIE[c.Cat_gorie__c] ?? CATEGORIE_PAR_TYPE[c.Type] ?? null
      if (c.Cat_gorie__c && !CATEGORIE[c.Cat_gorie__c]) {
        compte.categorieInconnue.set(c.Cat_gorie__c, (compte.categorieInconnue.get(c.Cat_gorie__c) ?? 0) + 1)
      }

      aEcrire.push([
        c.CaseNumber,
        categorie,
        c.Subject ?? null,
        c.Description ?? null,
        compteId ?? null,
        contactId ?? null,
        contratId ?? null,
        parStatut.get(codeStatut ?? 'NOUVELLE') ?? null,
        codeType ? parType.get(codeType) ?? null : null,
        c.CreatedDate ?? null,
        c.ClosedDate ?? null,
        c.Id,
      ])
    }

    console.log(`   ${compte.deja} déjà importée(s), ${aEcrire.length} à écrire`)
    console.log(`   rapprochements manqués — compte ${compte.sansCompte}, contact ${compte.sansContact}, contrat ${compte.sansContrat}`)
    for (const [s, n] of compte.statutInconnu) console.log(`   ⚠ statut Salesforce inconnu « ${s} » : ${n} (rangées en NOUVELLE)`)
    for (const [t, n] of compte.typeInconnu) console.log(`   ⚠ type Salesforce inconnu « ${t} » : ${n} (laissées sans type)`)
    for (const [k, n] of compte.categorieInconnue) console.log(`   ⚠ catégorie Salesforce inconnue « ${k} » : ${n} (déduite du type)`)
    const parCategorie = new Map()
    for (const l of aEcrire) parCategorie.set(l[1] ?? '(aucune)', (parCategorie.get(l[1] ?? '(aucune)') ?? 0) + 1)
    console.log('   catégories : ' + [...parCategorie.entries()].sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`).join(' · '))

    if (SIMULATION) {
      console.log('\nSIMULATION terminée — rien n’a été écrit.')
      return
    }

    /* UNE SEULE TRANSACTION. 874 lignes, c'est peu : soit tout entre, soit rien, et on ne se
       retrouve pas avec une reprise à moitié faite qu'il faudrait démêler. */
    await client.query('begin')
    let n = 0
    for (const l of aEcrire) {
      await client.query(
        `insert into requetes (reference, categorie, objet, description, compte_id, contact_id,
                               contrat_id, statut_id, type_requete_id, date_creation,
                               date_resolution, id_salesforce)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict do nothing`, l)
      n++
      if (n % 200 === 0) console.log(`   … ${n} / ${aEcrire.length}`)
    }
    await client.query('commit')

    const { rows: [total] } = await client.query('select count(*)::int n from requetes')
    const { rows: ouvertes } = await client.query(`
      select s.code, count(*)::int n from requetes r
      join statuts_requetes s on s.id = r.statut_id group by s.code order by 2 desc`)
    console.log(`\n── BILAN ──`)
    console.log(`   ${n} requête(s) écrite(s) · ${total.n} en base au total`)
    for (const r of ouvertes) console.log(`   ${String(r.n).padStart(5)}  ${r.code}`)

    /* RÉANALYSER APRÈS UNE INSERTION MASSIVE. Le 07/09/2026, un import de 10 539 lignes sans
       `analyze` a bloqué toute l'équipe : le planificateur croyait la table vide. */
    console.log('\nRéanalyse de la table…')
    await client.query('analyze requetes')
    console.log('   faite.')
  } finally {
    await client.end()
  }
}

main().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1) })
