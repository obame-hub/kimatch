// ════════════════════════════════════════════════════════════════════════════════════════════════
// LES FICHIERS DE SALESFORCE REJOIGNENT LEURS OBJETS DANS KIMATCH
//
// ══ POURQUOI CE SCRIPT EXISTE ══
//
// Réunion du 10/09/2026. William : « les équipes me disent que les fichiers du Salesforce n'ont pas
// été mis sur Kimatch. Sur tous leurs compteurs, aucun fichier n'a été remonté. » Michel doutait
// que de vieilles factures vaillent la peine ; William a tranché : « je préférerais supprimer de la
// data plutôt que ne pas l'importer. » Naoëlle : « je ne veux plus que William me dise qu'il manque
// quelque chose. »
//
// ══ CE QU'IL Y A VRAIMENT À REPRENDRE, ET UN COMPTE QUI MENTAIT ══
//
// Premier relevé : `select count() from ContentDocument` → 87. Faux, et dangereusement rassurant.
// Salesforce filtre CETTE table par le partage, même pour un administrateur système : on ne voit
// que les documents de ses propres bibliothèques. Compté par les LIENS — `ContentDocumentLink`,
// que la même requête rend sans filtre — le total est de 30 047, dont 13 140 sur des objets métier :
//
//   3 549  Mandat__c                 2 846  Contract              2 577  Point_de_livraison__c
//   1 890  Cotation__c               1 591  Suivi_cotation__c       296  Opportunity
//     120  Account                      52  Lead                     50  Contact      35  Case
//
// Les 16 907 restants pendent à des utilisateurs : bibliothèques personnelles, pas de la donnée
// d'entreprise. On ne les reprend pas.
//
// LE CORPS DU FICHIER, LUI, RESTE LISIBLE : une requête `ContentVersion` filtrée par
// `ContentDocumentId` rend la ligne même quand le compte global l'ignore. Le filtre de partage ne
// mord que sur les requêtes non filtrées. Vérifié sur le PDL GI041477 avant d'écrire une ligne.
//
// ══ OÙ CHAQUE FICHIER ATTERRIT ══
//
//   Point_de_livraison__c  → compteur                 par `compteurs.id_salesforce`
//   Mandat__c              → mandat                   par `mandats.id_salesforce`
//   Contract               → contrat                  par le NUMÉRO — `contrats.id_salesforce`
//                            contient « 00000170 », pas un Id. Voir le commentaire de la colonne.
//   Cotation__c            → version de recommandation par `versions_recommandation.id_salesforce`
//   Suivi_cotation__c      → la version de la cotation PARENTE. Cette table n'a pas d'équivalent
//                            direct : côté Kimatch, `suivis_consultations_fournisseurs` est
//                            l'historique des événements d'une consultation, pas la consultation.
//                            Les offres des fournisseurs se lisent donc sur la cotation.
//   Opportunity            → recommandation           par `recommandations.id_salesforce`
//   Account                → compte                   par `comptes.id_salesforce`
//   Contact                → contact                  par `contacts.id_salesforce`
//   Lead                   → piste                    par `pistes.id_salesforce`
//   Case                   → NULLE PART. Salesforce en porte 874, Kimatch neuf : les dossiers
//                            n'ont jamais été repris. Les 35 fichiers restent en attente de cette
//                            décision, et le rapport les compte plutôt que de les taire.
//
// ══ CE QU'IL FAUT AVANT DE LE LANCER ══
//
// `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local`. Le dépôt dans le bucket `documents` exige un
// utilisateur authentifié (politique `documents_authenticated_insert`), ce qu'un script n'est pas.
// La clé se prend dans Supabase → Project Settings → API → `service_role`.
//
//   node scripts/importer-fichiers-salesforce.cjs --simulation
//   node scripts/importer-fichiers-salesforce.cjs --objet compteur
//   node scripts/importer-fichiers-salesforce.cjs
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { Client } = require('pg')

const RACINE = path.resolve(__dirname, '..')
const SIMULATION = process.argv.includes('--simulation')
const OBJET_DEMANDE = (() => {
  const i = process.argv.indexOf('--objet')
  return i === -1 ? null : process.argv[i + 1]
})()

function env(cle) {
  const chemin = path.join(RACINE, '.env.local')
  if (!fs.existsSync(chemin)) throw new Error('.env.local introuvable : ' + chemin)
  const m = fs.readFileSync(chemin, 'utf8').match(new RegExp('^' + cle + '=(.+)$', 'm'))
  return m ? m[1].trim() : null
}

function connexion() {
  return new Client({
    connectionString: env('SUPABASE_DB_URL'),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 300000,
  })
}

/** Une requête SOQL, rendue en objets. Voir `importer-identifiants-salesforce.cjs` pour le
 *  guillemetage, obligatoire sous Windows où `sf` est un `.cmd`. */
function soql(requete) {
  const cite = '"' + requete.replace(/"/g, '\\"') + '"'
  const brut = execFileSync('sf', ['data', 'query', '-o', 'KiweeOrg', '-q', cite, '--json'], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    shell: true,
  })
  const rendu = JSON.parse(brut)
  if (rendu.status !== 0) throw new Error('SOQL en échec : ' + (rendu.message ?? 'raison inconnue'))
  return rendu.result.records
}

/** L'URL de l'instance Salesforce et son jeton, pour télécharger les corps de fichier. */
function accesSalesforce() {
  const brut = execFileSync('sf', ['org', 'display', '-o', 'KiweeOrg', '--json'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    shell: true,
  })
  const r = JSON.parse(brut)
  if (r.status !== 0) throw new Error('Impossible de lire l’accès Salesforce.')
  return { instance: r.result.instanceUrl, jeton: r.result.accessToken }
}

/**
 * LES OBJETS REPRIS, dans l'ordre où on veut les voir arriver.
 *
 * `prefixe` est celui des identifiants Salesforce à 3 caractères — c'est lui qui dit, pour un lien,
 * de quel objet il s'agit, sans avoir à interroger Salesforce une seconde fois.
 */
const OBJETS = [
  {
    nom: 'compteur',
    prefixe: 'a01',
    entite: 'compteur',
    cle: 'select id, id_salesforce from compteurs where id_salesforce is not null',
  },
  {
    nom: 'mandat',
    prefixe: 'a03',
    entite: 'mandat',
    cle: 'select id, id_salesforce from mandats where id_salesforce is not null',
  },
  {
    nom: 'contrat',
    prefixe: '800',
    entite: 'contrat',
    cle: 'select id, id_salesforce from contrats where id_salesforce is not null',
    /* LE LIEN PASSE PAR LE NUMÉRO, PAS PAR L'ID. `contrats.id_salesforce` contient
       « 00000170 » — c'est `Contract.ContractNumber`. On traduit donc l'Id du lien en numéro. */
    traduire: async () => {
      const lignes = soql('select Id, ContractNumber from Contract')
      return new Map(lignes.map((x) => [x.Id.slice(0, 15), x.ContractNumber]))
    },
  },
  {
    nom: 'version de recommandation',
    prefixe: 'a07',
    entite: 'version_recommandation',
    cle: 'select id, id_salesforce from versions_recommandation where id_salesforce is not null',
  },
  {
    nom: 'consultation fournisseur',
    prefixe: 'a0U',
    entite: 'version_recommandation',
    cle: 'select id, id_salesforce from versions_recommandation where id_salesforce is not null',
    /* LA COTATION PARENTE. `Suivi_cotation__c` n'a pas d'équivalent direct côté Kimatch — voir
       l'en-tête — donc ses fichiers rejoignent la version de la cotation dont il dépend. */
    traduire: async () => {
      const lignes = soql('select Id, Cotation__c from Suivi_cotation__c where Cotation__c != null')
      return new Map(lignes.map((x) => [x.Id.slice(0, 15), x.Cotation__c]))
    },
  },
  {
    nom: 'recommandation',
    prefixe: '006',
    entite: 'recommandation',
    cle: 'select id, id_salesforce from recommandations where id_salesforce is not null',
  },
  {
    nom: 'compte',
    prefixe: '001',
    entite: 'compte',
    cle: 'select id, id_salesforce from comptes where id_salesforce is not null',
  },
  {
    nom: 'contact',
    prefixe: '003',
    entite: 'contact',
    cle: 'select id, id_salesforce from contacts where id_salesforce is not null',
  },
  {
    nom: 'piste',
    prefixe: '00Q',
    entite: 'piste',
    cle: 'select id, id_salesforce from pistes where id_salesforce is not null',
  },
]

/** Un nom de fichier sûr pour un chemin de stockage — même règle que le dépôt depuis l'interface. */
function nomSur(nom) {
  return (nom || 'fichier')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 120)
}

/**
 * QUINZE OU DIX-HUIT CARACTÈRES, C'EST LE MÊME ENREGISTREMENT.
 *
 * Salesforce rend tantôt l'un tantôt l'autre selon l'API : la forme longue ajoute trois caractères
 * de contrôle de casse. Comparer les deux formes telles quelles ferait manquer un rapprochement sur
 * deux, en silence. On tronque donc tout à 15.
 */
const court = (id) => (id ?? '').slice(0, 15)

async function main() {
  const service = env('SUPABASE_SERVICE_ROLE_KEY')
  const urlSupabase = env('VITE_SUPABASE_URL') || env('SUPABASE_URL')
  if (!service && !SIMULATION) {
    console.error('')
    console.error('SUPABASE_SERVICE_ROLE_KEY manque dans .env.local.')
    console.error('Le bucket `documents` n’accepte le dépôt que d’un utilisateur authentifié')
    console.error('(politique `documents_authenticated_insert`), ce qu’un script n’est pas.')
    console.error('À prendre dans Supabase → Project Settings → API → service_role.')
    console.error('')
    console.error('`--simulation` fonctionne sans la clé : elle compte et rapproche sans déposer.')
    process.exit(1)
  }

  const client = connexion()
  await client.connect()
  try {
    console.log('')
    console.log(SIMULATION ? 'SIMULATION — aucun fichier ne sera déposé' : 'IMPORT')

    // ── LES LIENS, TOUS, SANS LIMITE ────────────────────────────────────────────────────────────
    /* SANS `limit`. Le premier relevé en portait un de 200, et les 200 premières lignes étaient
       toutes des liens vers des utilisateurs : j'en ai conclu qu'aucun fichier ne pendait à un
       objet métier. Il y en a 13 140. Une limite sur une requête d'inventaire ne tronque pas le
       résultat, elle tronque la conclusion. */
    console.log('\nLecture des liens de fichiers…')
    const liens = soql(
      'select ContentDocumentId, LinkedEntityId from ContentDocumentLink '
      + 'where ContentDocumentId in (select Id from ContentDocument)',
    )
    console.log(`   ${liens.length} lien(s) au total`)

    const objets = OBJET_DEMANDE ? OBJETS.filter((o) => o.nom === OBJET_DEMANDE) : OBJETS
    if (objets.length === 0) {
      throw new Error(`--objet « ${OBJET_DEMANDE} » inconnu. Au choix : ${OBJETS.map((o) => o.nom).join(', ')}`)
    }

    // ── LE PLAN : quel document va sur quel objet Kimatch ───────────────────────────────────────
    const plan = []
    const sansCible = new Map()
    for (const objet of objets) {
      const { rows } = await client.query(objet.cle)
      const parSf = new Map(rows.map((r) => [court(r.id_salesforce), r.id]))
      const traduction = objet.traduire ? await objet.traduire() : null

      let relies = 0
      let orphelins = 0
      for (const l of liens) {
        if (!l.LinkedEntityId.startsWith(objet.prefixe)) continue
        const cle = traduction ? court(traduction.get(court(l.LinkedEntityId))) : court(l.LinkedEntityId)
        const cible = cle ? parSf.get(cle) : undefined
        if (!cible) {
          orphelins++
          continue
        }
        plan.push({ document: l.ContentDocumentId, entite_type: objet.entite, entite_id: cible })
        relies++
      }
      if (orphelins > 0) sansCible.set(objet.nom, orphelins)
      console.log(`   ${objet.nom.padEnd(26)} ${String(relies).padStart(5)} fichier(s) rattachable(s), ${orphelins} sans cible`)
    }

    /* UN MÊME DOCUMENT PEUT PENDRE À PLUSIEURS OBJETS. On le dépose UNE fois dans le stockage et on
       crée une ligne `documents` par rattachement : le fichier n'existe qu'en un exemplaire, et il
       se retrouve depuis chacune des fiches concernées. */
    const documentsUniques = new Set(plan.map((p) => p.document))
    console.log(`\n   ${plan.length} rattachement(s) pour ${documentsUniques.size} fichier(s) distinct(s)`)
    for (const [nom, n] of sansCible) console.log(`   (${n} fichier(s) « ${nom} » sans objet correspondant dans Kimatch)`)

    // ── CE QUI EST DÉJÀ LÀ ──────────────────────────────────────────────────────────────────────
    /* LE SCRIPT DOIT POUVOIR SE RELANCER. Un import de 13 000 fichiers s'interrompt — réseau,
       jeton expiré, machine qui dort — et le reprendre depuis zéro déposerait tout en double. La
       référence porte l'identifiant Salesforce du document : c'est elle qui dit ce qui est passé. */
    const { rows: dejaLa } = await client.query(
      "select reference from documents where reference like 'SF-%'",
    )
    const dejaImporte = new Set(dejaLa.map((r) => r.reference))
    const aFaire = plan.filter((p) => !dejaImporte.has(`SF-${p.document}-${p.entite_id}`))
    console.log(`   ${dejaImporte.size} déjà importé(s), ${aFaire.length} à faire`)

    if (SIMULATION) {
      console.log('\nSIMULATION terminée — rien n’a été déposé.')
      return
    }

    // ── LE TÉLÉCHARGEMENT ET LE DÉPÔT ───────────────────────────────────────────────────────────
    const { instance, jeton } = accesSalesforce()
    const parDocument = new Map()
    for (const p of aFaire) {
      if (!parDocument.has(p.document)) parDocument.set(p.document, [])
      parDocument.get(p.document).push(p)
    }

    let deposes = 0
    let lignes = 0
    let echecs = 0
    let n = 0
    for (const [documentId, rattachements] of parDocument) {
      n += 1
      if (n % 100 === 0) console.log(`   … ${n} / ${parDocument.size} fichiers`)
      try {
        const versions = soql(
          `select Id, Title, FileExtension, ContentSize, VersionData from ContentVersion `
          + `where ContentDocumentId = '${documentId}' and IsLatest = true`,
        )
        if (versions.length === 0) {
          echecs++
          continue
        }
        const v = versions[0]
        const reponse = await fetch(instance + v.VersionData, { headers: { Authorization: `Bearer ${jeton}` } })
        if (!reponse.ok) {
          echecs++
          continue
        }
        const corps = Buffer.from(await reponse.arrayBuffer())
        const nom = `${v.Title}${v.FileExtension ? '.' + v.FileExtension : ''}`
        const premier = rattachements[0]
        const chemin = `${premier.entite_type}/${premier.entite_id}/sf_${documentId}_${nomSur(nom)}`

        const depot = await fetch(`${urlSupabase}/storage/v1/object/documents/${chemin}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${service}`,
            apikey: service,
            'Content-Type': 'application/octet-stream',
            'x-upsert': 'true',
          },
          body: corps,
        })
        if (!depot.ok) {
          echecs++
          continue
        }
        deposes++

        const publique = `${urlSupabase}/storage/v1/object/public/documents/${chemin}`
        for (const r of rattachements) {
          await client.query(
            `insert into documents (reference, nom, nom_fichier, url, mime_type, taille_octets,
                                    entite_type, entite_id, date_creation)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             on conflict do nothing`,
            [
              `SF-${documentId}-${r.entite_id}`,
              nom,
              nomSur(nom),
              publique,
              null,
              v.ContentSize ?? null,
              r.entite_type,
              r.entite_id,
              new Date().toISOString(),
            ],
          )
          lignes++
        }
      } catch {
        echecs++
      }
    }

    console.log('\n── BILAN ──')
    console.log(`   ${deposes} fichier(s) déposé(s), ${lignes} rattachement(s) créé(s), ${echecs} échec(s)`)
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('ÉCHEC :', e.message)
  process.exit(1)
})
