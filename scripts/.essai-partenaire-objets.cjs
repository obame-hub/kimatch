/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * QUELS OBJETS UN PARTENAIRE PEUT-IL VRAIMENT CREER ?
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoelle, 24/09/2026 : « il peut creer tous les autres objets rattaches au compte ? mandats,
 * contrats, etc. »
 *
 * J'ai pose des policies sur six tables filles, mais je n'ai eprouve que comptes et contacts. Le
 * reste, je ne le SAIS pas — je l'ai ecrit. Ce n'est pas la meme chose : une colonne obligatoire
 * qu'un partenaire ne peut pas remplir, une contrainte, une policy oubliee, et la creation echoue
 * sans que rien ne l'annonce.
 *
 * ON ESSAIE DONC CHAQUE OBJET, pour de vrai, a sa place. Tout dans une transaction annulee : la
 * base ressort exactement comme avant.
 *
 * Michel, reunion du 24/09 : « s'ils ont cree des comptes, des contacts, des compteurs, mandats,
 * ils ont acces au contrat, activite tout ca ». Les contrats, il peut les VOIR — « c'est lui qui
 * les a fait signer » — mais c'est KiWee qui les emet. On verifie donc aussi ce refus-la.
 */
const fs = require('fs')
const { Client } = require('pg')

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
if (!m) { console.error('SUPABASE_DB_URL absent de .env.local'); process.exit(1) }
const c = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

const resultats = []
const noter = (objet, attendu, obtenu, detail) =>
  resultats.push({ objet, attendu, obtenu, conforme: attendu === obtenu, detail })

/** Essaie une insertion a la place du partenaire, sans casser la transaction en cas de refus. */
async function essayer(nom, sql, params) {
  await c.query('savepoint s')
  try {
    const r = await c.query(sql, params)
    return { ok: true, id: r.rows[0] ? r.rows[0].id : null }
  } catch (e) {
    await c.query('rollback to savepoint s')
    return { ok: false, erreur: e.message.split('\n')[0].slice(0, 110) }
  }
}

;(async () => {
  await c.connect()
  await c.query('begin')
  try {
    const tp = (await c.query("select id from types_comptes where code='PARTENAIRE'")).rows[0].id
    const tc = (await c.query("select id from types_comptes where code='CLIENT'")).rows[0].id
    const partenaire = (await c.query(
      'insert into comptes (nom, type_compte_id) values ($1,$2) returning id',
      ['zzz essai partenaire', tp])).rows[0].id
    const u = (await c.query('select id from profils where actif limit 1')).rows[0].id
    await c.query('update profils set compte_partenaire_id=$1 where id=$2', [partenaire, u])

    await c.query(
      "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role','authenticated')::text, true)",
      [u])
    await c.query('set local role authenticated')

    // ── LE COMPTE, d'abord : tout le reste s'y accroche ──
    const compte = await essayer('compte',
      'insert into comptes (nom, type_compte_id, apporteur_partenaire_id) values ($1,$2,$3) returning id',
      ['zzz client du partenaire', tc, partenaire])
    noter('compte', true, compte.ok, compte.erreur)
    if (!compte.ok) { console.log('Le compte ne se cree pas : le reste est sans objet.'); return }

    // ── CONTACT ──
    const contact = await essayer('contact',
      'insert into contacts (nom, prenom, email, compte_id, actif) values ($1,$2,$3,$4,true) returning id',
      ['ZZZ', 'Essai', 'zzz@exemple.invalid', compte.id])
    noter('contact', true, contact.ok, contact.erreur)

    // ── SITE ──
    const site = await essayer('site',
      'insert into sites (nom, compte_id) values ($1,$2) returning id',
      ['zzz site', compte.id])
    noter('site', true, site.ok, site.erreur)

    // ── COMPTEUR ── site_id, type_energie_id, numero_point et compte_id sont obligatoires.
    const energie = (await c.query("select id from types_energies limit 1")).rows[0]
    const compteur = site.ok && energie
      ? await essayer("compteur",
        "insert into compteurs (compte_id, site_id, type_energie_id, numero_point) values ($1,$2,$3,$4) returning id",
        [compte.id, site.id, energie.id, "ZZZ00000000001"])
      : { ok: false, erreur: site.ok ? "aucun type d energie en base" : "le site n a pas ete cree" }
    noter("compteur", true, compteur.ok, compteur.erreur)

    // ── MANDAT ──
    const colsMandat = (await c.query(
      "select column_name, is_nullable from information_schema.columns where table_name='mandats'"
    )).rows
    const obligatoires = colsMandat.filter((r) => r.is_nullable === 'NO' && r.column_name !== 'id')
      .map((r) => r.column_name)
    const champsM = ['compte_id']
    const valsM = [compte.id]
    if (obligatoires.includes('reference')) { champsM.push('reference'); valsM.push('ZZZ-MANDAT') }
    const mandat = await essayer('mandat',
      'insert into mandats (' + champsM.join(',') + ') values (' +
      champsM.map((_, i) => '$' + (i + 1)).join(',') + ') returning id', valsM)
    noter('mandat', true, mandat.ok, mandat.erreur)

    // ── RECOMMANDATION ── C'est l'objet pour lequel il vient : Michel, « c'est juste pour faire une
    //    demande de recommandation ».
    // etape_id est obligatoire : on prend la premiere etape du cycle.
    const etape = (await c.query("select id from etapes_recommandation order by ordre limit 1")).rows[0]
    const reco = etape
      ? await essayer("recommandation",
        "insert into recommandations (nom, compte_id, etape_id) values ($1,$2,$3) returning id",
        ["zzz recommandation du partenaire", compte.id, etape.id])
      : { ok: false, erreur: "aucune etape de recommandation en base" }
    noter('recommandation', true, reco.ok, reco.erreur)

    // ── INTERACTION ── son activite sur ses comptes.
    const typeAppel = (await c.query("select id from types_interactions where code='APPEL'")).rows[0]
    const inter = typeAppel
      ? await essayer('interaction',
        'insert into interactions (type_interaction_id, date_interaction, objet, compte_id, auteur_profil_id) values ($1, now(), $2, $3, $4) returning id',
        [typeAppel.id, 'zzz essai', compte.id, u])
      : { ok: false, erreur: 'type APPEL introuvable' }
    noter('interaction', true, inter.ok, inter.erreur)

    // ── CONTRAT ── Michel : il peut le VOIR, pas l'emettre. On attend un refus.
    const colsContrat = (await c.query(
      "select column_name, is_nullable from information_schema.columns where table_name='contrats' and is_nullable='NO' and column_name<>'id'"
    )).rows.map((r) => r.column_name)
    const champsC = ['compte_id']
    const valsC = [compte.id]
    if (colsContrat.includes('reference')) { champsC.push('reference'); valsC.push('ZZZ-CONTRAT') }
    const contrat = await essayer('contrat',
      'insert into contrats (' + champsC.join(',') + ') values (' +
      champsC.map((_, i) => '$' + (i + 1)).join(',') + ') returning id', valsC)
    noter('contrat (creation)', false, contrat.ok, contrat.erreur)

    // ── PISTE et OPPORTUNITE ── jamais, c'est le travail interne de KiWee.
    const piste = await essayer('piste',
      'insert into pistes (societe) values ($1) returning id', ['zzz piste'])
    noter('piste', false, piste.ok, piste.erreur)

    const opp = await essayer('opportunite',
      'insert into opportunites (nom, compte_id) values ($1,$2) returning id',
      ['zzz opportunite', compte.id])
    noter('opportunite', false, opp.ok, opp.erreur)

    await c.query('reset role')
    await c.query("select set_config('request.jwt.claims','',true)")
  } finally {
    await c.query('rollback')
    await c.end()
  }

  console.log('')
  console.log('══ CE QU UN PARTENAIRE PEUT CREER ══')
  console.log('')
  let ecarts = 0
  for (const r of resultats) {
    if (!r.conforme) ecarts++
    const verdict = r.obtenu ? 'CREE' : 'refuse'
    const attendu = r.attendu ? 'doit pouvoir' : 'ne doit pas'
    console.log('   ' + (r.conforme ? '  ok   ' : ' ECART ') + ' | ' + r.objet.padEnd(20) +
      verdict.padEnd(8) + '(' + attendu + ')' + (r.detail && !r.obtenu && r.attendu ? '  — ' + r.detail : ''))
  }
  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(ecarts === 0 ? '  CONFORME A CE QUI A ETE DECIDE' : '  *** ' + ecarts + ' ECART(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('  (transaction annulee : la base est inchangee)')
  console.log('')
  process.exit(ecarts === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
