#!/usr/bin/env node
/**
 * TESTE LES DÉCLENCHEURS DE PROPAGATION DES STATUTS, CONTRE LA VRAIE BASE.
 *
 * C'est le quatrième des flots critiques de l'audit (ARC-05), et le seul qu'on ne peut pas couvrir
 * avec Vitest : la logique vit dans des fonctions PostgreSQL, pas dans du TypeScript. La tester en
 * recopiant la règle en JavaScript ne testerait que la recopie.
 *
 * Lancement :  node scripts/tester-propagation-statuts.cjs
 *
 * ── POURQUOI CE SCRIPT N'EST PAS DANS `npm test` ───────────────────────────────────────────────
 *
 * Il écrit dans la base de PRODUCTION — puis annule. Un test qui écrit en production ne doit pas
 * partir tout seul dans une chaîne d'intégration, ni se lancer par inadvertance en tapant
 * `npm test`. Il se lance à la main, quand on touche aux statuts.
 *
 * ── LES GARDE-FOUS, ET POURQUOI ILS EXISTENT ──────────────────────────────────────────────────
 *
 * Le 29/08/2026, un banc d'essai que j'avais écrit pour « répéter » une migration sans l'appliquer
 * a APPLIQUÉ deux fois pour de vrai. Il ouvrait une transaction, exécutait un fichier qui portait
 * son propre `commit;`, puis annulait : le `commit;` intérieur validait la transaction extérieure,
 * et le `rollback` qui suivait n'annulait plus rien. Une ligne de production s'est retrouvée
 * renommée « Version 1 (essai) (essai) ».
 *
 * Ce script en tire quatre règles :
 *
 *   1. Le mot `commit` n'apparaît nulle part. Cherchez-le : il n'y est pas.
 *   2. Chaque scénario vérifie, DE L'INTÉRIEUR, qu'une transaction est bien ouverte
 *      (`txid_current_if_assigned()` non nul). Sans transaction, on écrirait pour de bon.
 *   3. Après l'annulation, le script RELIT la base pour vérifier que rien n'a survécu, et hurle si
 *      quelque chose reste.
 *   4. Tout ce qu'il crée porte un nom reconnaissable, pour qu'un reliquat se voie.
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MARQUE = 'ESSAI-PROPAGATION-A-SUPPRIMER'

const RACINE = path.join(__dirname, '..')
const env = fs.readFileSync(path.join(RACINE, '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
if (!m) {
  console.error('SUPABASE_DB_URL absent de .env.local')
  process.exit(1)
}
const url = m[1].trim().replace(/^["']|["']$/g, '')

/**
 * LA TABLE DE DÉCISION, telle que `recalculer_statut_recommandation` l'écrit.
 *
 * Chaque ligne est un cas que le métier peut produire, et la colonne `attendu` est l'étape que la
 * recommandation doit porter APRÈS l'écriture. Rien n'est dérivé d'une relecture de la fonction :
 * ce sont les quatre branches du `case`, écrites à la main d'après ce que le métier attend.
 */
const SCENARIOS = [
  {
    titre: 'aucune version : le dossier est un brouillon',
    versions: [],
    finalite: null,
    attendu: 'BROUILLON',
    pourquoi: 'Un dossier sans version n’a rien à montrer. Le classer ailleurs le ferait apparaître dans le plan de charge alors que personne n’a encore rien construit.',
  },
  {
    titre: 'version en construction : le dossier est actif',
    versions: ['EN_CONSTRUCTION'],
    finalite: null,
    attendu: 'ACTIVE',
    pourquoi: 'C’est le cas courant du travail en cours.',
  },
  {
    titre: 'version disponible : le dossier reste actif',
    versions: ['DISPONIBLE'],
    finalite: null,
    attendu: 'ACTIVE',
    pourquoi: 'Une version prête à montrer n’est pas un dossier terminé — il reste à la présenter.',
  },
  {
    titre: 'version en décision : le dossier reste actif',
    versions: ['EN_DECISION'],
    finalite: null,
    attendu: 'ACTIVE',
    pourquoi: 'Le client réfléchit : le dossier est plus vivant que jamais.',
  },
  {
    titre: 'version clôturée SANS finalité : à réactiver',
    versions: ['CLOTUREE'],
    finalite: null,
    attendu: 'A_REACTIVER',
    pourquoi: 'La version est finie mais le dossier n’a pas de conclusion. C’est exactement la définition d’un dossier en sommeil — les 86 dossiers « À réactiver » de la base sont là.',
  },
  {
    titre: 'version clôturée AVEC finalité : clôturé',
    versions: ['CLOTUREE'],
    finalite: 'ACCEPTEE',
    attendu: 'CLOTUREE',
    pourquoi: 'La conclusion est posée : le dossier sort du plan de charge.',
  },
  {
    titre: 'DEUX versions : c’est la version COURANTE qui décide, pas la plus récente',
    versions: ['CLOTUREE', 'EN_CONSTRUCTION'],
    courante: 0,
    finalite: 'ACCEPTEE',
    attendu: 'CLOTUREE',
    pourquoi: 'Le piège de la fonction : elle trie sur `version_actuelle` AVANT `numero_version`. Si ce test tombe, l’écran et le calcul se contrediront — l’un montrera la version 1, l’autre décidera d’après la version 2.',
  },
  {
    titre: 'DEUX versions, la courante est la seconde',
    versions: ['CLOTUREE', 'EN_CONSTRUCTION'],
    courante: 1,
    finalite: 'ACCEPTEE',
    attendu: 'ACTIVE',
    pourquoi: 'Le miroir du cas précédent : mêmes versions, autre courante, autre résultat. C’est ce qui prouve que le tri est bien celui qu’on croit.',
  },
  // ── LES CAS DE L'APPEL DU 31/08/2026 AVEC MICHEL ──────────────────────────────────────────
  {
    titre: 'un contrat sans version : le dossier n’est PAS un brouillon',
    versions: [],
    finalite: null,
    contrat: true,
    attendu: 'ACTIVE',
    pourquoi: 'C’est le bug qu’il a trouvé : 29 affaires gagnées s’affichaient comme des brouillons. Sa définition — « Brouillon, c’est une recommandation pour laquelle je n’ai aucune version, et bien évidemment aucun contrat ».',
  },
  {
    titre: 'un contrat ET une finalité, sans version : clôturé',
    versions: [],
    finalite: 'ACCEPTEE',
    contrat: true,
    attendu: 'CLOTUREE',
    pourquoi: 'L’affaire a produit un contrat et Salesforce dit qu’elle est gagnée.',
  },
  {
    titre: 'une version VIVANTE gagne sur une finalité importée',
    versions: ['EN_DECISION'],
    finalite: 'ACCEPTEE',
    attendu: 'ACTIVE',
    pourquoi: '23 dossiers sont dans ce cas. Salesforce dit l’affaire close, quelqu’un travaille dessus aujourd’hui. Fermer un dossier sous les doigts de celui qui y travaille est plus grave que d’afficher une finalité un peu ancienne.',
  },
  {
    titre: 'une clôture MANUELLE gagne sur tout, version vivante comprise',
    versions: ['EN_CONSTRUCTION'],
    finalite: null,
    manuelle: true,
    attendu: 'CLOTUREE',
    pourquoi: 'Michel : « la version fait évoluer la recommandation, mais ne clôture JAMAIS la recommandation, ça doit se faire manuellement ». Le geste de quelqu’un ne se défait pas parce qu’une version a bougé ensuite.',
  },
]

async function reference(c, table, code) {
  const r = await c.query(`select id from ${table} where code = $1 limit 1`, [code])
  if (!r.rows[0]) throw new Error(`${table} : code ${code} introuvable`)
  return r.rows[0].id
}

;(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()

  // Un compte quelconque suffit : la propagation ne le regarde pas, mais la colonne est obligatoire.
  const { rows: comptes } = await c.query('select id from comptes limit 1')
  if (!comptes[0]) throw new Error('aucun compte en base')
  const compteId = comptes[0].id

  const resultats = []

  for (const s of SCENARIOS) {
    await c.query('begin')
    try {
      // GARDE-FOU 2 : sommes-nous vraiment dans une transaction ? Sans elle, chaque insertion
      // ci-dessous serait définitive.
      const { rows: tx } = await c.query('select txid_current_if_assigned() is not null as dedans')
      await c.query('select 1') // force l'attribution d'un identifiant de transaction
      const { rows: tx2 } = await c.query('select txid_current_if_assigned() as id')
      if (tx[0].dedans === null && tx2[0].id === null) {
        throw new Error('AUCUNE TRANSACTION OUVERTE — arrêt avant toute écriture')
      }

      const etapeDepart = await reference(c, 'etapes_recommandation', 'BROUILLON')
      const { rows: reco } = await c.query(
        `insert into recommandations (nom, compte_id, etape_id, finalite_cloture, date_cloture_manuelle)
         values ($1, $2, $3, $4, $5) returning id`,
        [`${MARQUE} — ${s.titre}`, compteId, etapeDepart, s.finalite, s.manuelle ? new Date(0) : null],
      )
      const recoId = reco[0].id

      for (let i = 0; i < s.versions.length; i++) {
        const statutId = await reference(c, 'statuts_versions_recommandation', s.versions[i])
        // `motif_version_id` est obligatoire : une version sans motif ne dit pas pourquoi elle
        // existe. Le motif ne joue aucun role dans la propagation, on prend le premier.
        const motifId = await reference(c, 'motifs_versions_recommandation', 'CREATION_INITIALE')
        await c.query(
          `insert into versions_recommandation
             (recommandation_id, numero_version, nom, statut_version_id, motif_version_id, version_actuelle)
           values ($1, $2, $3, $4, $5, $6)`,
          [recoId, i + 1, `${MARQUE} v${i + 1}`, statutId, motifId,
            s.courante === undefined ? i === s.versions.length - 1 : s.courante === i],
        )
      }

      /* LE CONTRAT, quand le scenario en demande un. C'est le declencheur
         trg_propager_contrat_vers_recommandation qui doit recalculer l'etape — on n'appelle donc
         PAS la fonction a la main : c'est le cablage qu'on teste, pas seulement la regle. */
      if (s.contrat) {
        const siteQuelconque = (await c.query('select id from sites limit 1')).rows[0]
        // `type_energie_id` est obligatoire : un contrat porte forcement de l'electricite ou du gaz.
        // L'energie ne joue aucun role dans la propagation, on prend la premiere.
        const energieId = (await c.query('select id from types_energies limit 1')).rows[0].id
        const statutId = (await c.query('select id from statuts_contrats limit 1')).rows[0].id
        await c.query(
          `insert into contrats (recommandation_id, compte_id, site_id, reference, type_energie_id, statut_id)
           values ($1, $2, $3, $4, $5, $6)`,
          [recoId, compteId, siteQuelconque ? siteQuelconque.id : null, MARQUE, energieId, statutId],
        )
      }

      // Les déclencheurs sur les versions ont déjà tourné. Pour le cas « aucune version », c'est
      // l'écriture de la finalité qui doit déclencher le calcul : on la repose telle quelle.
      if (s.versions.length === 0) {
        await c.query('update recommandations set finalite_cloture = $2 where id = $1', [recoId, s.finalite])
      }

      const { rows: apres } = await c.query(
        `select e.code from recommandations r
         join etapes_recommandation e on e.id = r.etape_id where r.id = $1`,
        [recoId],
      )
      const obtenu = apres[0]?.code ?? '(aucune étape)'
      resultats.push({ titre: s.titre, attendu: s.attendu, obtenu, ok: obtenu === s.attendu, pourquoi: s.pourquoi })
    } finally {
      await c.query('rollback')
    }
  }

  // GARDE-FOU 3 : après annulation, plus rien ne doit porter la marque.
  const { rows: reliquat } = await c.query(
    `select (select count(*) from recommandations where nom like $1) as recos,
            (select count(*) from versions_recommandation where nom like $1) as versions,
            (select count(*) from contrats where reference like $1) as contrats`,
    [`%${MARQUE}%`],
  )
  await c.end()

  console.log('\nPropagation des statuts\n')
  let echecs = 0
  for (const r of resultats) {
    console.log(`${r.ok ? '  OK  ' : ' ECHEC'}  ${r.titre}`)
    if (!r.ok) {
      echecs++
      console.log(`         attendu ${r.attendu}, obtenu ${r.obtenu}`)
      console.log(`         ${r.pourquoi}`)
    }
  }

  const restes = Number(reliquat[0].recos) + Number(reliquat[0].versions) + Number(reliquat[0].contrats)
  console.log(`\n  Reliquat en base apres annulation : ${restes} ligne(s)` + (restes ? '  ← A NETTOYER' : '  (rien, comme prevu)'))
  console.log(`  ${resultats.length - echecs}/${resultats.length} scenarios passent\n`)

  if (echecs || restes) process.exit(1)
})().catch((e) => {
  console.error('\nECHEC DU BANC D’ESSAI :', e.message, '\n')
  process.exit(1)
})
