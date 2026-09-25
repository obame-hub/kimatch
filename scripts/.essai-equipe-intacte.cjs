/**
 * L'ÉQUIPE TRAVAILLE-T-ELLE ENCORE ?
 *
 * Chaque garde posé aujourd'hui pouvait couper quelqu'un : le seau fermé, les policies
 * restrictives, le garde des fonctions, celui des points d'entrée. Le risque est des deux côtés,
 * et le second se verrait dans l'heure — un commercial qui ne peut plus ouvrir un mandat.
 *
 * On mesure donc ce qu'un VRAI commercial lit et écrit, sans emprunter de profil administrateur.
 */
const fs = require('fs')
const { Client } = require('pg')

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
const c = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

let soucis = 0
const dire = (ok, texte, detail) => {
  if (!ok) soucis++
  console.log('   ' + (ok ? '  ok   ' : ' SOUCI ') + ' | ' + texte + (detail ? '  — ' + detail : ''))
}

;(async () => {
  await c.connect()
  await c.query('begin')
  try {
    // Un commercial ordinaire : pas d'administration, pas de rattachement partenaire.
    const u = (await c.query(
      "select p.id, p.email from profils p " +
      "join profils_roles_acces pra on pra.profil_id = p.id " +
      "join roles_acces r on r.id = pra.role_acces_id " +
      "where p.actif and not r.ouvre_administration and p.compte_partenaire_id is null " +
      "and p.email like '%@kiwee-energie.fr' limit 1")).rows[0]

    console.log('')
    console.log('   au nom de ' + u.email + ' (ni admin, ni partenaire)')
    console.log('')
    console.log('══ CE QU IL LIT ══')

    await c.query(
      "select set_config('request.jwt.claims', " +
      "json_build_object('sub', $1::text, 'role','authenticated')::text, true)", [u.id])
    await c.query('set local role authenticated')

    for (const [quoi, sql, mini] of [
      ['les comptes', 'select count(*) n from comptes', 2000],
      ['les contacts', 'select count(*) n from contacts', 3000],
      ['les compteurs', 'select count(*) n from compteurs', 7000],
      ['les documents', 'select count(*) n from documents', 19000],
      ['les mandats', 'select count(*) n from mandats', 1400],
      ['les contrats', 'select count(*) n from contrats', 1500],
      ['les recommandations', 'select count(*) n from recommandations', 1700],
      ['les interactions', 'select count(*) n from interactions', 80000],
      ['la liste des comptes (vue)', 'select count(*) n from v_comptes_liste', 2000],
      ['le vivier du cockpit (vue)', 'select count(*) n from v_vivier_cockpit', 1500],
      ['les documents (vue)', 'select count(*) n from v_documents_liste', 19000],
    ]) {
      const n = Number((await c.query(sql)).rows[0].n)
      dire(n >= mini, quoi, n + (n >= mini ? '' : '  *** attendu au moins ' + mini + ' ***'))
    }

    console.log('')
    console.log('══ CE QU IL ECRIT ══')

    // Les trois gestes que ma migration cassee refusait ce matin.
    const cpt = (await c.query('select id from compteurs where responsable_contact_id is not null limit 1')).rows[0]
    const ct = (await c.query('select id from contacts limit 1')).rows[0]
    let r = await c.query('update compteurs set responsable_contact_id=$1 where id=$2', [ct.id, cpt.id])
      .then(() => null).catch((e) => e.message.slice(0, 60))
    dire(!r, 'il change le responsable d un compteur', r ? '*** ' + r + ' ***' : 'passe')

    const md = (await c.query('select id from mandats where contact_signataire_id is not null limit 1')).rows[0]
    r = await c.query('update mandats set contact_signataire_id=$1 where id=$2', [ct.id, md.id])
      .then(() => null).catch((e) => e.message.slice(0, 60))
    dire(!r, 'il change le signataire d un mandat', r ? '*** ' + r + ' ***' : 'passe')

    const co = (await c.query('select id from comptes limit 1')).rows[0]
    r = await c.query('insert into sites (nom,compte_id) values ($1,$2)', ['ZZZ TEMOIN EQUIPE', co.id])
      .then(() => null).catch((e) => e.message.slice(0, 60))
    dire(!r, 'il cree un site', r ? '*** ' + r + ' ***' : 'passe')

    await c.query('reset role')
  } finally {
    await c.query('rollback')
    await c.end()
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  L EQUIPE TRAVAILLE NORMALEMENT'
    : '  *** ' + soucis + ' CHOSE(S) CASSEE(S) POUR L EQUIPE ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
