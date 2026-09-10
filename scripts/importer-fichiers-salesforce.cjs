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
/* `--orphelins` NE RAPPORTE QUE CE QUI N'A NULLE PART OÙ SE POSER.
   616 fichiers Salesforce pendent à un enregistrement qui n'existe pas dans Kimatch. Compter ne
   suffit pas : tant qu'on ne sait pas SI ce sont des brouillons Salesforce ou de vrais dossiers
   jamais repris, on ne peut ni les importer ni les écarter. Ce mode les nomme. */
const ORPHELINS = process.argv.includes('--orphelins')
const OBJET_DEMANDE = (() => {
  const i = process.argv.indexOf('--objet')
  return i === -1 ? null : process.argv[i + 1]
})()

function env(cle) {
  const chemin = path.join(RACINE, '.env.local')
  if (!fs.existsSync(chemin)) throw new Error('.env.local introuvable : ' + chemin)
  const m = fs.readFileSync(chemin, 'utf8').match(new RegExp('^' + cle + '=(.+)$', 'm'))
  if (!m) return null
  /* ON RETIRE LES CHEVRONS ET LES GUILLEMETS. Une clé collée depuis un exemple garde souvent le
     `<…>` du gabarit ; Supabase répond alors « JWS Protected Header is invalid », un message qui
     ne dit pas du tout que la valeur est simplement entourée de deux caractères en trop. */
  return m[1].trim().replace(/^[<"']+|[>"']+$/g, '')
}

function connexion() {
  return new Client({
    connectionString: env('SUPABASE_DB_URL'),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 300000,
  })
}

/**
 * ══ L'ACCÈS SALESFORCE, LU UNE SEULE FOIS ══
 *
 * `sf org display` coûte cinq secondes ; on ne l'appelle donc qu'au démarrage et on garde
 * l'instance et le jeton pour tout le reste.
 */
let ACCES = null
function accesSalesforce() {
  if (ACCES) return ACCES
  const brut = execFileSync('sf', ['org', 'display', '-o', 'KiweeOrg', '--json'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    shell: true,
  })
  const r = JSON.parse(brut)
  if (r.status !== 0) throw new Error('Impossible de lire l’accès Salesforce.')
  ACCES = { instance: r.result.instanceUrl, jeton: r.result.accessToken }
  return ACCES
}

/**
 * ══ UNE REQUÊTE SOQL PAR L'API REST, ET NON PAR LA LIGNE DE COMMANDE ══
 *
 * La première version lançait `sf data query` — donc un processus Node complet, son
 * authentification et son démarrage — POUR CHAQUE DOCUMENT. Mesuré sur les 30 premiers fichiers :
 * 6,9 secondes l'unité, soit VINGT-QUATRE HEURES pour les 12 355. Le travail utile, lui, tient en
 * un appel HTTP de 300 millisecondes.
 *
 * L'API REST supprime ce coût d'un facteur cent, et lève au passage deux limites de la ligne de
 * commande : la longueur maximale d'une commande Windows — 8 191 caractères, atteinte dès 400
 * identifiants dans un `in (…)` — et le guillemetage du shell.
 *
 * LA PAGINATION EST SUIVIE JUSQU'AU BOUT. Salesforce rend 2 000 lignes par page ; s'arrêter à la
 * première rendrait 2 000 liens sur 30 047 sans le dire. C'est la même faute que le `limit 200`
 * du premier inventaire, et elle se paie de la même façon : une conclusion fausse.
 */
async function soqlRest(requete) {
  const { instance, jeton } = accesSalesforce()
  const enTetes = { Authorization: `Bearer ${jeton}`, Accept: 'application/json' }
  let url = `${instance}/services/data/v60.0/query?q=${encodeURIComponent(requete)}`
  const tout = []
  for (;;) {
    const r = await fetch(url, { headers: enTetes })
    if (!r.ok) throw new Error(`SOQL HTTP ${r.status} : ${(await r.text()).slice(0, 200)}`)
    const page = await r.json()
    tout.push(...page.records)
    if (page.done || !page.nextRecordsUrl) break
    url = instance + page.nextRecordsUrl
  }
  return tout
}

/** Version synchrone conservée pour les rares appels au démarrage. */
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
    versLeCompte: 'select Id, Compte__c from Point_de_livraison__c where Compte__c != null',
  },
  {
    nom: 'mandat',
    prefixe: 'a03',
    entite: 'mandat',
    cle: 'select id, id_salesforce from mandats where id_salesforce is not null',
    versLeCompte: 'select Id, Compte__c from Mandat__c where Compte__c != null',
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
    versLeCompte: 'select Id, AccountId from Contract where AccountId != null',
  },
  {
    nom: 'version de recommandation',
    prefixe: 'a07',
    entite: 'version_recommandation',
    cle: 'select id, id_salesforce from versions_recommandation where id_salesforce is not null',
    versLeCompte: 'select Id, Account__c from Cotation__c where Account__c != null',
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
    versLeCompte: 'select Id, Cotation__r.Account__c from Suivi_cotation__c where Cotation__r.Account__c != null',
    champCompte: (r) => r.Cotation__r?.Account__c,
  },
  {
    nom: 'recommandation',
    prefixe: '006',
    entite: 'recommandation',
    cle: 'select id, id_salesforce from recommandations where id_salesforce is not null',
    versLeCompte: 'select Id, AccountId from Opportunity where AccountId != null',
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
    versLeCompte: 'select Id, ConvertedAccountId from Lead where ConvertedAccountId != null',
  },
]

/**
 * ══ DE QUEL TYPE EST CE DOCUMENT ══
 *
 * `documents.type_document_id` est `not null` : il faut trancher pour chacun des 12 355. Le nom du
 * fichier le dit mieux que l'objet auquel il pend — une facture déposée sur un mandat reste une
 * facture — donc on le lit d'abord, et on retombe sur la nature de l'objet ensuite.
 *
 * « Autre » en dernier recours, et c'est volontaire : inventer « Contrat » pour un fichier dont on
 * ne sait rien salirait un classement que l'équipe utilise pour filtrer.
 */
function typeDocument(nom, entite) {
  const n = (nom || '').toLowerCase()
  if (/factur/.test(n)) return 'FACTURE'
  if (/mandat/.test(n)) return 'MANDAT'
  if (/contrat|contract/.test(n)) return 'CONTRAT'
  if (/avenant|annexe|cgv|conditions/.test(n)) return 'ANNEXE'
  if (/offre|cotation|budget|appel/.test(n)) return 'RECOMMANDATION'
  if (entite === 'mandat') return 'MANDAT'
  if (entite === 'contrat') return 'CONTRAT'
  if (entite === 'version_recommandation' || entite === 'recommandation') return 'RECOMMANDATION'
  return 'AUTRE'
}

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
    const liens = await soqlRest(
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
    const orphelinsParObjet = new Map()

    /* ══ LE REPLI SUR LE COMPTE ══
       Naoëlle, 10/09/2026 : « ou même dans les fichiers du compte si tu sais pas où les mettre ».

       616 fichiers pendaient à un enregistrement Salesforce jamais repris dans Kimatch : un
       contrat de 2024, une cotation abandonnée, une piste convertie. Faute de fiche où se poser,
       ils restaient chez Salesforce — et le jour où l'org sera coupée, ils disparaîtront.

       Mais ces enregistrements-là, EUX, connaissent leur client. Mesuré avant d'écrire une ligne :
       120 cotations sur 120, 166 pistes sur 183, 82 mandats sur 84 désignent un compte qui existe
       dans Kimatch. La facture d'un contrat de 2024 n'a plus sa fiche, mais elle a toujours son
       client, et c'est là qu'un commercial ira la chercher.

       ON DÉPOSE DONC SUR LE COMPTE PLUTÔT QUE DE RENONCER. Un fichier rangé un cran trop haut se
       retrouve ; un fichier resté chez Salesforce est perdu. */
    const comptesParSf = new Map(
      (await client.query('select id, id_salesforce from comptes where id_salesforce is not null'))
        .rows.map((r) => [court(r.id_salesforce), r.id]))
    let replis = 0
    for (const objet of objets) {
      const { rows } = await client.query(objet.cle)
      const parSf = new Map(rows.map((r) => [court(r.id_salesforce), r.id]))
      const traduction = objet.traduire ? await objet.traduire() : null

      /* Le compte de chaque enregistrement de cet objet, s'il sait le dire. Une requête par objet,
         pas une par fichier : neuf requêtes en tout. */
      const compteDe = new Map()
      if (objet.versLeCompte) {
        const lire = objet.champCompte ?? ((r) => r[Object.keys(r).find((k) => k !== 'Id' && k !== 'attributes')])
        for (const r of await soqlRest(objet.versLeCompte)) {
          const c = lire(r)
          if (c) compteDe.set(court(r.Id), court(c))
        }
      }

      let relies = 0
      let orphelins = 0
      let replisIci = 0
      for (const l of liens) {
        if (!l.LinkedEntityId.startsWith(objet.prefixe)) continue
        const cle = traduction ? court(traduction.get(court(l.LinkedEntityId))) : court(l.LinkedEntityId)
        const cible = cle ? parSf.get(cle) : undefined
        if (!cible) {
          /* PAS DE FICHE, MAIS PEUT-ÊTRE UN CLIENT. */
          const compteSf = compteDe.get(court(l.LinkedEntityId))
          const compteKimatch = compteSf ? comptesParSf.get(compteSf) : undefined
          if (compteKimatch && !ORPHELINS) {
            plan.push({ document: l.ContentDocumentId, entite_type: 'compte', entite_id: compteKimatch })
            replis++
            replisIci++
            continue
          }
          orphelins++
          if (ORPHELINS) {
            const liste = orphelinsParObjet.get(objet.nom) ?? new Set()
            liste.add(l.LinkedEntityId)
            orphelinsParObjet.set(objet.nom, liste)
          }
          continue
        }
        plan.push({ document: l.ContentDocumentId, entite_type: objet.entite, entite_id: cible })
        relies++
      }
      if (orphelins > 0) sansCible.set(objet.nom, orphelins)
      console.log(`   ${objet.nom.padEnd(26)} ${String(relies).padStart(5)} fichier(s) rattachable(s)`
        + `, ${replisIci} reporté(s) sur le compte, ${orphelins} sans cible`)
    }

    /* UN MÊME DOCUMENT PEUT PENDRE À PLUSIEURS OBJETS. On le dépose UNE fois dans le stockage et on
       crée une ligne `documents` par rattachement : le fichier n'existe qu'en un exemplaire, et il
       se retrouve depuis chacune des fiches concernées. */
    const documentsUniques = new Set(plan.map((p) => p.document))
    console.log(`\n   ${plan.length} rattachement(s) pour ${documentsUniques.size} fichier(s) distinct(s)`)
    for (const [nom, n] of sansCible) console.log(`   (${n} fichier(s) « ${nom} » sans objet correspondant dans Kimatch)`)
    if (replis > 0) {
      console.log(`   ${replis} lien(s) déposé(s) sur le COMPTE, faute de fiche pour l'objet d'origine`)
    }

    if (ORPHELINS) {
      /* SALESFORCE SAIT CE QUE SONT CES ENREGISTREMENTS — on le lui demande plutôt que de le
         déduire du préfixe. Le nom et la date de création disent tout de suite si c'est un
         brouillon abandonné de 2019 ou un dossier de cette année qu'on a laissé derrière. */
      const OBJET_SF = {
        compteur: 'Point_de_livraison__c',
        mandat: 'Mandat__c',
        contrat: 'Contract',
        'version de recommandation': 'Cotation__c',
        'consultation fournisseur': 'Suivi_cotation__c',
        recommandation: 'Opportunity',
        compte: 'Account',
        contact: 'Contact',
        piste: 'Lead',
      }
      for (const [nom, ids] of orphelinsParObjet) {
        const sfObjet = OBJET_SF[nom]
        const champNom = sfObjet === 'Contract' ? 'ContractNumber' : 'Name'
        console.log(`
══ ${nom.toUpperCase()} — ${ids.size} enregistrement(s) Salesforce absent(s) de Kimatch`)
        const tous = []
        const tableau = [...ids]
        for (let i = 0; i < tableau.length; i += 150) {
          const lot = tableau.slice(i, i + 150)
          const r = await soqlRest(
            `select Id, ${champNom}, CreatedDate from ${sfObjet} where Id in ('${lot.join("','")}')`,
          ).catch((e) => { console.log(`   (lecture impossible : ${e.message})`); return [] })
          tous.push(...r)
        }
        const parAnnee = new Map()
        for (const r of tous) {
          const an = String(r.CreatedDate ?? '').slice(0, 4)
          parAnnee.set(an, (parAnnee.get(an) ?? 0) + 1)
        }
        console.log('   par année de création : '
          + [...parAnnee.entries()].sort().map(([a2, n2]) => `${a2} → ${n2}`).join(', '))
        console.log(`   ${tous.length} lisible(s) sur ${ids.size}`)
        for (const r of tous.slice(0, 10)) {
          console.log(`   ${r.Id}  ${String(r[champNom] ?? '(sans nom)').slice(0, 60).padEnd(60)}  ${String(r.CreatedDate ?? '').slice(0, 10)}`)
        }
        if (tous.length > 10) console.log(`   … et ${tous.length - 10} autre(s)`)
      }
      await client.end()
      return
    }

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
    /* LES TYPES, LUS UNE FOIS. Douze mille lectures du référentiel pour six lignes seraient douze
       mille allers-retours de trop. */
    const { rows: typesRows } = await client.query('select id, code from types_documents')
    const typeParCode = new Map(typesRows.map((t) => [t.code, t.id]))
    const parDocument = new Map()
    for (const p of aFaire) {
      if (!parDocument.has(p.document)) parDocument.set(p.document, [])
      parDocument.get(p.document).push(p)
    }

    /* ══ TOUTES LES MÉTADONNÉES D'ABORD, PAR PAQUETS DE DEUX CENTS ══
       On ne peut pas les demander d'un coup : `select … from ContentVersion` sans filtre est
       rendu filtré par le partage — 87 lignes sur 16 908, le piège qui a faussé le premier
       inventaire. Avec des identifiants EXPLICITES, Salesforce les rend toutes.

       Deux cents par paquet : au-delà, la requête dépasse ce que l'URL accepte confortablement,
       et en dessous on multiplie les allers-retours pour rien. */
    console.log('\nLecture des métadonnées de fichier…')
    const idsDocuments = [...parDocument.keys()]
    const metaParDocument = new Map()
    for (let i = 0; i < idsDocuments.length; i += 200) {
      const lot = idsDocuments.slice(i, i + 200)
      const versions = await soqlRest(
        'select Id, ContentDocumentId, Title, FileExtension, ContentSize, VersionData '
        + `from ContentVersion where IsLatest = true and ContentDocumentId in ('${lot.join("','")}')`,
      )
      for (const v of versions) metaParDocument.set(v.ContentDocumentId, v)
      if ((i / 200) % 10 === 0) console.log(`   … ${Math.min(i + 200, idsDocuments.length)} / ${idsDocuments.length}`)
    }
    console.log(`   ${metaParDocument.size} métadonnée(s) sur ${idsDocuments.length} document(s)`)

    let deposes = 0
    let lignes = 0
    let echecs = 0
    let n = 0
    /* LES RAISONS D'ÉCHEC, COMPTÉES ET NOMMÉES. Un `catch` muet a déjà coûté deux fausses
       conclusions aujourd'hui : le rapport doit dire POURQUOI, pas seulement COMBIEN. */
    const raisons = new Map()
    const noter = (r) => raisons.set(r, (raisons.get(r) ?? 0) + 1)
    /* ══ HUIT FICHIERS À LA FOIS, ET PAS UN DE PLUS ══
       En séquentiel, chaque fichier attend son téléchargement depuis Salesforce PUIS son dépôt
       chez Supabase : trois secondes de latence réseau pendant lesquelles la machine ne fait
       rien. Mesuré sur les 250 premiers : 0,3 fichier par seconde, soit dix heures pour les
       12 000.

       Huit en parallèle, parce que c'est le point où le gain s'arrête : au-delà, ce sont les
       limites d'API de Salesforce et la bande passante qui plafonnent, et l'on ne gagne plus que
       des erreurs 503 à réessayer. Les écritures en base, elles, restent sérialisées d'office —
       une seule connexion `pg`, qui met les requêtes en file. */
    const PARALLELE = 8
    const file = [...parDocument.entries()]
    let curseur = 0

    async function travailleur() {
      for (;;) {
        const i = curseur++
        if (i >= file.length) return
        const [documentId, rattachements] = file[i]
        await traiter(documentId, rattachements)
      }
    }

    async function traiter(documentId, rattachements) {
      n += 1
      if (n % 100 === 0) console.log(`   … ${n} / ${parDocument.size} fichiers`)
      try {
        const v = metaParDocument.get(documentId)
        if (!v) {
          noter('ContentVersion introuvable (partage Salesforce)')
          echecs++
          return
        }
        const reponse = await fetch(instance + v.VersionData, { headers: { Authorization: `Bearer ${jeton}` } })
        if (!reponse.ok) {
          noter(`téléchargement Salesforce HTTP ${reponse.status}`)
          echecs++
          return
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
          const detail = await depot.text().catch(() => '')
          noter(`dépôt Supabase HTTP ${depot.status} : ${detail.slice(0, 120)}`)
          echecs++
          return
        }
        deposes++

        const publique = `${urlSupabase}/storage/v1/object/public/documents/${chemin}`
        for (const r of rattachements) {
          await client.query(
            `insert into documents (reference, nom, nom_fichier, url, mime_type, taille_octets,
                                    entite_type, entite_id, date_creation, type_document_id)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
              typeParCode.get(typeDocument(nom, r.entite_type)) ?? typeParCode.get('AUTRE'),
            ],
          )
          lignes++
        }
      } catch (e) {
        noter(String(e && e.message ? e.message : e).slice(0, 140))
        echecs++
      }
    }

    const debut = Date.now()
    await Promise.all(Array.from({ length: PARALLELE }, () => travailleur()))
    const duree = Math.round((Date.now() - debut) / 1000)

    console.log('\n── BILAN ──')
    console.log(`   ${deposes} fichier(s) déposé(s), ${lignes} rattachement(s) créé(s), ${echecs} échec(s)`)
    console.log(`   en ${Math.floor(duree / 60)} min ${duree % 60} s`)
    if (raisons.size > 0) {
      console.log('')
      console.log('   POURQUOI ILS ONT ÉCHOUÉ :')
      for (const [r, n2] of [...raisons.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`   ${String(n2).padStart(6)}  ${r}`)
      }
    }
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('ÉCHEC :', e.message)
  process.exit(1)
})
