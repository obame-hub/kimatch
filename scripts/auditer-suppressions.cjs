// ════════════════════════════════════════════════════════════════════════════════════════════════
// TOUTE SUPPRESSION QUE L'APPLICATION PROPOSE DOIT ABOUTIR
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ══ POURQUOI CE SCRIPT EXISTE ══
//
// Le 10/09/2026, Guillaume ne pouvait pas supprimer un compte. La fenêtre annonçait 27
// enregistrements à détruire, puis la base refusait. Trois défauts empilés, et AUCUN n'était
// visible en lisant le code : ils ne se révélaient qu'au moment d'appuyer sur le bouton.
//
//   ① une clé étrangère en `no action` là où toute sa famille est en `cascade` ;
//   ② une colonne `not null` qu'une clé étrangère cherchait à vider — contradiction qui n'a
//      jamais pu s'appliquer une seule fois, et qui attendait qu'on supprime pour se montrer ;
//   ③ deux gardes-fous qui se renvoyaient la responsabilité pendant une cascade, chacun croyant
//      que l'autre gardait le lien.
//
// LES TROIS ONT ATTENDU UN UTILISATEUR POUR SE MANIFESTER. C'est ce que ce script empêche : il
// les cherche AVANT, sur toutes les suppressions que l'application propose, et pas seulement sur
// celle qui a cassé.
//
// ══ CE QU'IL FAIT, EN DEUX TEMPS ══
//
// LE RELEVÉ STATIQUE est exhaustif. Pour chaque table supprimable, il examine TOUTES les clés
// étrangères qui pointent vers elle et signale les deux formes de contradiction (① et ②). Il ne
// dépend d'aucune donnée : ce qu'il dit vaut pour toutes les lignes, y compris celles qui
// n'existent pas encore.
//
// L'ESSAI RÉEL, lui, supprime pour de vrai — puis annule. Un relevé statique ne verra jamais le
// défaut ③, qui naît de l'ORDRE dans lequel les déclencheurs passent, pas d'une règle isolée. On
// choisit donc la ligne LA PLUS RATTACHÉE de chaque table, celle qui traverse le plus de chemins,
// et on tente sa suppression dans une transaction annulée. Rien n'est détruit.
//
// ══ CE QU'IL NE PROUVE PAS ══
//
// L'essai réel porte sur une ligne, pas sur toutes. Il attrape les défauts de structure — ceux qui
// frapperaient n'importe qui — pas une donnée singulière. C'est le relevé statique qui couvre
// l'ensemble ; l'essai réel couvre ce que le statique ne peut pas voir. Les deux ensemble, et
// aucun des deux seul.
//
// Usage : npm run suppressions
// ════════════════════════════════════════════════════════════════════════════════════════════════

const { Client } = require('pg')
const fs = require('fs')

/** Les tables que l'application propose de supprimer — relevé des `.delete()` de `src/lib/data`. */
const SUPPRIMABLES = [
  'comptes', 'contacts', 'compteurs', 'contrats', 'mandats', 'recommandations',
  'versions_recommandation', 'signaux', 'actions', 'interactions', 'consommations',
  'documents', 'offres_fournisseurs', 'contrats_compteurs_tarifs',
]

/**
 * LES REFUS QU'ON VEUT GARDER.
 *
 * Un audit qui compte les refus légitimes comme des défauts sort toujours en erreur, et un
 * contrôle qui crie au loup à chaque passage ne se lance plus. Ces deux-là protègent les données
 * d'autres clients : ils doivent refuser, et la fenêtre de suppression les nomme désormais avant
 * le clic (`inventaireSuppression.ts`). Ce qui reste inacceptable, c'est un refus SUBI — celui
 * que personne n'a décidé et que l'utilisateur découvre en cliquant.
 *
 * Pour en ajouter un : il faut qu'il soit à la fois voulu ET annoncé dans la fenêtre. Sans les
 * deux, ce n'est pas un refus légitime, c'est un blocage qu'on maquille.
 */
const REFUS_VOULUS = {
  contrats_fournisseur_compte_id_fkey:
    'un compte fournisseur est cité sur les contrats d’autres clients',
  compteurs_fournisseur_actuel_compte_id_fkey:
    'un compte fournisseur est cité sur les compteurs d’autres clients',
  recommandations_fournisseur_compte_id_fkey:
    'un compte fournisseur est cité sur les chiffrages d’autres clients',
  optimisations_fournisseurs_fournisseur_compte_id_fkey:
    'une optimisation n’existe pas sans son fournisseur',
  recommandations_compte_id_fkey:
    'une recommandation engage un chiffrage transmis au client',
  mandats_compteurs_compteur_id_fkey:
    'un mandat signé liste ses compteurs — en retirer un en silence falsifierait le document',
}

function env(cle) {
  const ligne = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith(cle + '='))
  return ligne ? ligne.slice(cle.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}

async function main() {
  const client = new Client({
    connectionString: env('SUPABASE_DB_URL'),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
  })
  await client.connect()
  /* Les notices des gardes-fous sont du bruit ici : on veut le verdict, pas le détail. */
  client.on('notice', () => {})

  let defauts = 0

  // ══════════════════════════════════════════════════════════════════════════════════════════
  // 1. LE RELEVÉ STATIQUE — vrai pour toutes les lignes, présentes et futures
  // ══════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n══ LES RÈGLES QUI SE CONTREDISENT ══\n')

  const { rows: liens } = await client.query(`
    select
      ccu.table_name  as cible,
      tc.table_name   as origine,
      kcu.column_name as colonne,
      tc.constraint_name as contrainte,
      rc.delete_rule  as regle,
      col.is_nullable = 'NO' as obligatoire
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
    join information_schema.referential_constraints rc
      on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.constraint_schema
    join information_schema.columns col
      on col.table_name = tc.table_name and col.column_name = kcu.column_name
     and col.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
    order by ccu.table_name, tc.table_name, kcu.column_name`)

  for (const cible of SUPPRIMABLES) {
    const entrants = liens.filter((l) => l.cible === cible)
    const bloquants = entrants.filter((l) => l.regle === 'NO ACTION' || l.regle === 'RESTRICT')
    const impossibles = entrants.filter((l) => l.regle === 'SET NULL' && l.obligatoire)

    if (impossibles.length === 0 && bloquants.length === 0) {
      console.log(`  ✓ ${cible.padEnd(28)} ${entrants.length} lien(s) entrant(s), tous cohérents`)
      continue
    }

    console.log(`  · ${cible}`)
    for (const l of impossibles) {
      /* CELUI-CI EST TOUJOURS UN DÉFAUT, sans exception possible : la règle demande d'écrire null
         dans une colonne qui l'interdit. Elle ne peut aboutir aucune fois. */
      console.log(`      ✗ ${l.origine}.${l.colonne} : SET NULL sur une colonne NOT NULL — impossible par construction`)
      defauts++
    }
    for (const l of bloquants) {
      const voulu = REFUS_VOULUS[l.contrainte]
      console.log(voulu
        ? `      ~ ${l.origine}.${l.colonne} : ${l.regle} — voulu, ${voulu}`
        : `      ? ${l.origine}.${l.colonne} : ${l.regle} — refusera tant qu'une ligne y pend`)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════
  // 2. L'ESSAI RÉEL — sur la ligne la plus rattachée, puis annulé
  // ══════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n══ ON SUPPRIME POUR DE VRAI, PUIS ON ANNULE ══\n')

  for (const table of SUPPRIMABLES) {
    const entrants = liens.filter((l) => l.cible === table)

    /* LA LIGNE LA PLUS RATTACHÉE, et non la première venue : c'est elle qui traverse le plus de
       chemins de cascade, donc elle qui rencontre le plus de contradictions. Supprimer une ligne
       isolée ne prouverait presque rien. */
    let cible = null
    if (entrants.length > 0) {
      const morceaux = entrants.map((l) =>
        `coalesce((select count(*) from public.${l.origine} o where o.${l.colonne} = t.id), 0)`)
      const { rows } = await client.query(
        `select t.id, (${morceaux.join(' + ')}) as poids from public.${table} t
         order by poids desc limit 1`)
      cible = rows[0]
    } else {
      const { rows } = await client.query(`select id, 0 as poids from public.${table} limit 1`)
      cible = rows[0]
    }

    if (!cible) {
      console.log(`  – ${table.padEnd(28)} table vide, rien à essayer`)
      continue
    }

    await client.query('begin')
    let verdict
    try {
      await client.query(`delete from public.${table} where id = $1`, [cible.id])
      verdict = { ok: true }
    } catch (e) {
      verdict = { ok: false, code: e.code, contrainte: e.constraint, table: e.table, message: e.message }
    }
    await client.query('rollback')

    if (verdict.ok) {
      console.log(`  ✓ ${table.padEnd(28)} passe (ligne à ${cible.poids} rattachement(s))`)
    } else if (REFUS_VOULUS[verdict.contrainte]) {
      console.log(`  ~ ${table.padEnd(28)} refus VOULU et annoncé dans la fenêtre`)
      console.log(`        ${REFUS_VOULUS[verdict.contrainte]}`)
    } else {
      console.log(`  ✗ ${table.padEnd(28)} REFUSÉE (ligne à ${cible.poids} rattachement(s))`)
      console.log(`        ${verdict.code}  ${verdict.contrainte ?? ''}  sur ${verdict.table ?? '?'}`)
      console.log(`        ${verdict.message}`)
      defauts++
    }
  }

  console.log('')
  if (defauts === 0) {
    console.log('══ AUCUN REFUS SUBI : TOUTE SUPPRESSION ABOUTIT, OU REFUSE POUR UNE RAISON ANNONCÉE ══')
  } else {
    console.log(`══ ${defauts} DÉFAUT(S) À CORRIGER ══`)
  }
  console.log('')
  await client.end()
  process.exitCode = defauts === 0 ? 0 : 1
}

main().catch((e) => {
  console.error('ÉCHEC :', e.message)
  process.exit(1)
})
