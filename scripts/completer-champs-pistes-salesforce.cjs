// ════════════════════════════════════════════════════════════════════════════════════════════════
// TOUT CE QUE SALESFORCE SAIT D'UNE PISTE, RAPATRIÉ
//
// William, 14/09/2026 : « récupérez tout sans exception, on fera le tri dans Kimatch ».
//
// ══ CE QU'IL FAUT SAVOIR AVANT DE LE LANCER ══════════════════════════════════════════════════
//
// CE SCRIPT NE MET À JOUR QUE LES 26 COLONNES DE LA MIGRATION 20260914170000, et rien d'autre.
// Il ne touche ni `societe`, ni `email`, ni `telephone`, ni `commentaire`, ni `segment`, ni le
// statut, ni le propriétaire, ni le lot. Ces colonnes-là existent depuis le 01/09 et portent déjà
// les valeurs de Salesforce — mais elles ont pu être corrigées à la main dans Kimatch depuis, et
// les rapatrier écraserait ce travail. La règle du 14/09 pour les pistes vaut ici : on ajoute ce
// qui manque, on ne rapatrie pas l'org par-dessus le CRM.
//
// ══ TROIS CHOIX QUI SE VOIENT DANS LES DONNÉES ═══════════════════════════════════════════════
//
// L'IDENTITÉ SE REMET EN FORME AU PASSAGE. `LastName` arrive en « Dupont », « DUPONT », « dupont »
// selon qui a saisi. On écrit le nom EN MAJUSCULES et le prénom en Capitale — la règle demandée le
// 14/09 pour les contacts, appliquée ici aussi, parce qu'un rapport qui groupe par nom ne doit pas
// compter « Dupont » et « DUPONT » comme deux personnes.
//
// LE MOBILE SORT DU TÉLÉPHONE. La reprise écrivait `Phone || MobilePhone` dans une seule colonne :
// 56 pistes n'ont qu'un mobile, et il passait pour un fixe. Chacun retrouve la sienne, et
// `telephone` n'est PAS réécrit — seul `telephone_mobile` se remplit.
//
// LA VRAIE DATE DE CRÉATION VA DANS SA PROPRE COLONNE. Les 5 131 pistes reprises sont toutes datées
// du 01/09/2026 dans `date_creation` ; Salesforce les échelonne de 2024 à aujourd'hui. On écrit la
// vraie dans `date_creation_salesforce` et on ne touche pas à l'autre : réécrire une date de
// création change l'ordre de toutes les listes et les anciennetés. La bascule est une décision.
//
// ══ L'EXPORT ATTENDU ═════════════════════════════════════════════════════════════════════════
//
//   sf data query -o KiweeOrg --json --result-format json ^
//     -q "SELECT Id, Salutation, FirstName, LastName, Street, State, Country, MobilePhone,
//         Site_internet__c, Website, LinkedIn__c, Nombres_coproprietes__c, Liste_copros__c,
//         Echeance_actuelle__c, Industry, Role__c, Rating, LastActivityDate, FirstCallDateTime,
//         FirstEmailDateTime, EmailBouncedDate, EmailBouncedReason, IsUnreadByOwner,
//         IsPriorityRecord, CreatedDate, LastModifiedDate, CreatedBy.Name, LastModifiedBy.Name
//         FROM Lead WHERE IsConverted = false"
//         > leads-complet.json
//
// SANS `--appliquer`, RIEN N'EST ÉCRIT.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

const FICHIER = process.argv.filter((a) => a.endsWith('.json'))[0]
if (!FICHIER) {
  console.error('Usage : node scripts/completer-champs-pistes-salesforce.cjs <leads-complet.json> [--appliquer]')
  process.exit(1)
}
const APPLIQUER = process.argv.includes('--appliquer')

const url = fs.readFileSync('.env.local', 'utf8').split('\n')
  .find((l) => l.startsWith('SUPABASE_DB_URL='))
  .slice('SUPABASE_DB_URL='.length).trim()

/** « dupont » et « DUPONT » sont la même personne dans un rapport : le nom se range en majuscules. */
const enMajuscules = (s) => (s || '').trim() ? s.trim().toUpperCase() : null

/**
 * Le prénom en Capitale, composés compris.
 *
 * `Jean-pierre` devient `Jean-Pierre`, `marie claire` devient `Marie Claire`. On coupe sur les
 * espaces ET les traits d'union, parce qu'un prénom composé mal capitalisé est exactement ce qu'on
 * cherche à corriger ; l'apostrophe, elle, ne coupe rien — `D'Artagnan` n'est pas deux prénoms.
 */
function enCapitale(s) {
  const t = (s || '').trim()
  if (!t) return null
  return t.toLowerCase().replace(/(^|[\s-])([\p{L}])/gu, (_, sep, lettre) => sep + lettre.toUpperCase())
}

/** Salesforce écrit « M. », « Mr », « Mme »… ; on range en deux valeurs lisibles, ou on garde tel quel. */
function civiliteLisible(s) {
  const t = (s || '').trim()
  if (!t) return null
  const n = t.toLowerCase().replace(/\./g, '')
  /* « M. » et « Mme » : la forme retenue le 15/09/2026 — « c'est mieux et plus compact ». La
     civilité s'affiche collée au nom dans des listes et des colonnes de tableau ; la forme longue
     y pousse le nom hors de sa colonne. Même règle que `fn_formater_identite_contact` en base. */
  if (['m', 'mr', 'monsieur'].includes(n)) return 'M.'
  if (['mme', 'mrs', 'ms', 'madame'].includes(n)) return 'Mme'
  if (['mlle', 'miss', 'mademoiselle'].includes(n)) return 'Mme'
  /* Une civilité qu'on ne reconnaît pas se garde telle quelle : « Dr », « Me », « Prof » existent,
     et les effacer perdrait une information juste au motif qu'elle sort de la liste. */
  return t
}

/** « Thomas LE GUEN » et « Thomas Le Guen » doivent se rejoindre : casse, accents et ponctuation ôtés. */
const normal = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toUpperCase()

const entier = (v) => (v === null || v === undefined ? null : Math.round(Number(v)))
const texte = (v) => { const t = (v ?? '').toString().trim(); return t || null }

;(async () => {
  const brut = fs.readFileSync(FICHIER, 'utf8').replace(/^﻿/, '')
  const leads = JSON.parse(brut.slice(brut.indexOf('{'))).result.records

  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 300000 })
  await c.connect()

  const pistes = new Map((await c.query(
    `select id, id_salesforce from public.pistes where id_salesforce is not null`))
    .rows.map((r) => [r.id_salesforce.slice(0, 15), r.id]))

  /* QUI A CRÉÉ, QUI A MODIFIÉ. Le bloc « Informations système » de Salesforce les montre, et ils
     étaient vides ici : 0 créateur sur 5 139, 3 modificateurs. On rapproche sur prénom + nom
     normalisés, comme partout ailleurs — les sept auteurs de l'org sont tous dans `profils`. */
  const profils = new Map((await c.query(`select id, prenom, nom from public.profils`))
    .rows.map((r) => [normal(`${r.prenom} ${r.nom}`), r.id]))

  const aEcrire = [], sansPiste = []
  for (const l of leads) {
    const piste = pistes.get(l.Id.slice(0, 15))
    if (!piste) { sansPiste.push(l.Id); continue }
    aEcrire.push({
      piste,
      civilite: civiliteLisible(l.Salutation),
      prenom: enCapitale(l.FirstName),
      nom: enMajuscules(l.LastName),
      rue: texte(l.Street),
      region: texte(l.State),
      pays: texte(l.Country),
      telephone_mobile: texte(l.MobilePhone),
      site_internet: texte(l.Site_internet__c),
      site_web: texte(l.Website),
      linkedin: texte(l.LinkedIn__c),
      nombre_coproprietes: entier(l.Nombres_coproprietes__c),
      liste_coproprietes: texte(l.Liste_copros__c),
      echeance_actuelle: l.Echeance_actuelle__c || null,
      secteur_activite: texte(l.Industry),
      role_contact: texte(l.Role__c),
      cote: texte(l.Rating),
      date_derniere_activite: l.LastActivityDate || null,
      date_premier_appel: l.FirstCallDateTime || null,
      date_premier_email: l.FirstEmailDateTime || null,
      email_rejete_le: l.EmailBouncedDate || null,
      email_rejete_motif: texte(l.EmailBouncedReason),
      non_lu_par_proprietaire: l.IsUnreadByOwner ?? null,
      prioritaire: l.IsPriorityRecord ?? null,
      date_creation_salesforce: l.CreatedDate || null,
      date_modification_salesforce: l.LastModifiedDate || null,
      cree_par_id: (l.CreatedBy && profils.get(normal(l.CreatedBy.Name))) || null,
      /* PAS `modifie_par_id` : `fn_audit_trace` le repose à `auth.uid()` — nul en connexion
         directe — à chaque écriture. Et il a raison : cette colonne répond à « qui a touché la
         piste DANS KIMATCH ». Le fait Salesforce a sa colonne (migration 20260914190000). */
      modifie_par_salesforce_id:
        (l.LastModifiedBy && profils.get(normal(l.LastModifiedBy.Name))) || null,
    })
  }

  const COLONNES = Object.keys(aEcrire[0] || {}).filter((k) => k !== 'piste')
  const remplis = {}
  for (const e of aEcrire) for (const k of COLONNES) if (e[k] !== null && e[k] !== undefined) remplis[k] = (remplis[k] || 0) + 1

  console.log('══ CE QUE LA COMPLÉTION FERAIT ══')
  console.log(`leads lus            : ${leads.length}`)
  console.log(`pistes à compléter   : ${aEcrire.length}`)
  console.log(`piste introuvable    : ${sansPiste.length}\n`)
  console.log('valeurs par colonne :')
  for (const k of COLONNES) {
    console.log('   ' + String(remplis[k] || 0).padStart(5) + '  ' + k)
  }

  if (!APPLIQUER) {
    console.log('\nSimulation seule. Relancer avec --appliquer pour écrire.')
    await c.end()
    return
  }

  await c.query('begin')
  try {
    /* UNE SEULE REQUÊTE, PAS 5 139. Le rattrapage des mails a mis sept minutes à faire 1 341
       aller-retours ; ici on envoie le tout en une fois et PostgreSQL déplie. `unnest` prend un
       tableau par colonne — d'où la préparation en colonnes plutôt qu'en lignes. */
    const colonnes = COLONNES
    const TYPES = {
      nombre_coproprietes: 'integer',
      echeance_actuelle: 'date',
      date_derniere_activite: 'date',
      date_premier_appel: 'timestamptz',
      date_premier_email: 'timestamptz',
      email_rejete_le: 'timestamptz',
      non_lu_par_proprietaire: 'boolean',
      prioritaire: 'boolean',
      cree_par_id: 'uuid',
      modifie_par_salesforce_id: 'uuid',
      date_creation_salesforce: 'timestamptz',
      date_modification_salesforce: 'timestamptz',
    }
    const valeurs = [aEcrire.map((e) => e.piste), ...colonnes.map((k) => aEcrire.map((e) => e[k]))]
    const jetons = colonnes
      .map((k, i) => `unnest($${i + 2}::${TYPES[k] || 'text'}[]) as ${k}`)
      .join(',\n                ')
    const majs = colonnes.map((k) => `${k} = n.${k}`).join(', ')

    await c.query(
      `with n as (
         select unnest($1::uuid[]) as id,
                ${jetons}
       )
       update public.pistes p set ${majs}, date_modification = now()
         from n where n.id = p.id`,
      valeurs)

    // ── Le garde-fou, dans la transaction ──
    const k = (await c.query(
      `select count(*) filter (where nom is not null)::int as avec_nom,
              count(*) filter (where nom is not null and nom <> upper(nom))::int as nom_mal_casse,
              count(*) filter (where civilite is not null)::int as avec_civilite,
              count(*) filter (where date_creation_salesforce is not null)::int as avec_date_sf,
              count(*) filter (where date_creation_salesforce > now())::int as date_sf_future,
              count(*) filter (where echeance_actuelle is not null)::int as avec_echeance,
              count(*) filter (where cree_par_id is not null)::int as avec_createur,
              count(*) filter (where modifie_par_salesforce_id is not null)::int as avec_modificateur
         from public.pistes where id_salesforce is not null`)).rows[0]
    if (k.nom_mal_casse > 0) {
      throw new Error(`${k.nom_mal_casse} nom(s) ne sont pas en majuscules : la mise en forme n'a pas pris`)
    }
    if (k.date_sf_future > 0) {
      throw new Error(`${k.date_sf_future} piste(s) créées dans le futur côté Salesforce : la date est mal lue`)
    }
    if (k.avec_nom < aEcrire.length) {
      throw new Error(`${k.avec_nom} pistes ont un nom pour ${aEcrire.length} attendues`)
    }

    await c.query('commit')
    console.log(`\n✓ ${aEcrire.length} pistes complétées.`)
    console.log(`  ${k.avec_nom} noms en majuscules, ${k.avec_civilite} civilités, ${k.avec_echeance} échéances,`)
    console.log(`  ${k.avec_date_sf} vraies dates de création Salesforce,`)
    console.log(`  ${k.avec_createur} créateurs et ${k.avec_modificateur} derniers modificateurs Salesforce.`)
  } catch (e) {
    await c.query('rollback')
    console.error('\n✗ Rien n\'a été écrit : ' + e.message)
    process.exitCode = 1
  }
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
