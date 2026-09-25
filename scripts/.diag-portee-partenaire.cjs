/**
 * CE QUE `comptes_du_partenaire()` FAIT ENTRER DANS LE PÉRIMÈTRE D'UN PARTENAIRE.
 *
 * Elle retient trois liens :
 *
 *     c.id = p.compte_partenaire_id               son propre compte
 *     c.apporteur_partenaire_id = ...             les comptes qu'il a apportés
 *     c.intermediaire_partenaire_id = ...         ← celui-ci mérite un regard
 *
 * `intermediaire_partenaire_id` est commenté en base comme « sur un compte FOURNISSEUR :
 * l'intermédiaire pricing par lequel Kiwee passe ». Ce n'est PAS un apporteur d'affaires : c'est
 * une information de facturation entre KiWee et un fournisseur d'énergie.
 *
 * Si un partenaire apporteur se trouve aussi être intermédiaire pricing d'un fournisseur, il voit
 * donc la fiche de ce fournisseur. Est-ce voulu ? On mesure d'abord ce que ça ouvre RÉELLEMENT.
 */
const fs = require('fs')
const { Client } = require('pg')

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
const c = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

;(async () => {
  await c.connect()

  console.log('')
  console.log('══ LES TROIS LIENS, EN VOLUME ══')
  for (const [quoi, sql] of [
    ['comptes de type PARTENAIRE',
      "select count(*) n from comptes where type_compte_id=(select id from types_comptes where code='PARTENAIRE')"],
    ['comptes avec un apporteur', 'select count(*) n from comptes where apporteur_partenaire_id is not null'],
    ['comptes avec un intermediaire', 'select count(*) n from comptes where intermediaire_partenaire_id is not null'],
  ]) {
    console.log('   ' + quoi.padEnd(34) + ' : ' + (await c.query(sql)).rows[0].n)
  }

  console.log('')
  console.log('══ LES COMPTES QUI PORTENT UN INTERMEDIAIRE : DE QUEL TYPE SONT-ILS ? ══')
  const t = (await c.query(
    "select coalesce(tc.libelle,'(sans type)') as type, count(*) n " +
    "from comptes c left join types_comptes tc on tc.id=c.type_compte_id " +
    "where c.intermediaire_partenaire_id is not null group by 1 order by 2 desc")).rows
  if (t.length === 0) console.log('   aucun compte ne porte d intermediaire aujourd hui.')
  else console.table(t)

  console.log('')
  console.log('══ QUI SONT LES PARTENAIRES, ET QUE VERRAIENT-ILS ? ══')
  const parts = (await c.query(
    "select c.id, c.nom from comptes c " +
    "where c.type_compte_id=(select id from types_comptes where code='PARTENAIRE') order by c.nom")).rows
  for (const p of parts) {
    const n = (await c.query(
      'select count(*) n from comptes where id=$1 or apporteur_partenaire_id=$1 or intermediaire_partenaire_id=$1',
      [p.id])).rows[0].n
    console.log('   ' + p.nom.slice(0, 46).padEnd(46) + ' : ' + n + ' compte(s)')
  }

  await c.end()
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
