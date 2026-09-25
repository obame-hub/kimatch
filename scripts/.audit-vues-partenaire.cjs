/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES VUES, INTERROGÉES À LA PLACE D'UN PARTENAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Une vue s'exécute par défaut avec les droits de SON PROPRIÉTAIRE, pas de celui qui l'interroge.
 * Elle rend donc tout ce que le propriétaire voit — c'est-à-dire tout. Mesuré le 24/09/2026 :
 * `v_recommandations_liste` rendait 1 796 lignes à un partenaire là où la table n'en rendait 0.
 *
 * `security_invoker = true` (PG15+) la fait obéir aux policies de l'appelant. Dix-neuf vues l'ont
 * reçu ce jour-là. Ce script vérifie les VINGT-CINQ, une par une, et ne se contente pas de lire
 * l'option : il INTERROGE chaque vue au nom d'un partenaire et compte ce qui sort.
 *
 * On ne conclut pas sur l'option déclarée, on conclut sur ce qui est rendu.
 */
const fs = require('fs')
const { Client } = require('pg')

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
const c = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

let failles = 0

;(async () => {
  await c.connect()
  await c.query('begin')
  try {
    // ── UN PARTENAIRE D'ESSAI, ANNULÉ À LA FIN ──
    const tp = (await c.query("select id from types_comptes where code='PARTENAIRE'")).rows[0].id
    const part = (await c.query(
      'insert into comptes (nom, type_compte_id) values ($1,$2) returning id',
      ['ZZZ VUES PARTENAIRE', tp])).rows[0].id

    const profil = (await c.query(
      'select p.id from profils p ' +
      'join profils_roles_acces pra on pra.profil_id = p.id ' +
      'join roles_acces r on r.id = pra.role_acces_id ' +
      'where p.actif and not r.ouvre_administration limit 1')).rows[0].id
    await c.query('update profils set compte_partenaire_id=$1 where id=$2', [part, profil])

    const vues = (await c.query(
      "select c.relname, " +
      "coalesce((select option_value from pg_options_to_table(c.reloptions) " +
      "          where option_name='security_invoker'),'off') as si " +
      "from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
      "where n.nspname='public' and c.relkind in ('v','m') order by c.relname")).rows

    console.log('')
    console.log('   ' + vues.length + ' vues, interrogees au nom d un partenaire rattache a un compte vide')
    console.log('')

    for (const v of vues) {
      // ① CE QUE LA VUE CONTIENT EN TOUT (droits de service).
      let total
      try {
        total = (await c.query('select count(*) n from public.' + v.relname)).rows[0].n
      } catch (e) {
        console.log('   passee  | ' + v.relname.padEnd(42) + ' — non interrogeable : ' + e.message.slice(0, 40))
        continue
      }

      // ② CE QU'ELLE REND AU PARTENAIRE.
      await c.query('savepoint v')
      let rendu = null
      let souci = null
      try {
        await c.query(
          "select set_config('request.jwt.claims', " +
          "json_build_object('sub', $1::text, 'role','authenticated')::text, true)", [profil])
        await c.query('set local role authenticated')
        rendu = (await c.query('select count(*) n from public.' + v.relname)).rows[0].n
      } catch (e) {
        souci = e.message.slice(0, 50)
      } finally {
        await c.query('reset role')
        await c.query('rollback to savepoint v')
      }

      if (souci) {
        console.log('     ok    | ' + v.relname.padEnd(42) + ' — refusee : ' + souci)
        continue
      }

      // ── CE QUI EST LÉGITIME, ET QU'IL NE FAUT PAS COMPTER COMME UNE FUITE ──
      //
      // Le compte partenaire d'essai est VIDE, donc toute ligne de patrimoine qui sort vient de
      // KiWee. Mais trois cas rendent une ligne pour de bonnes raisons, vérifiées le 25/09/2026 en
      // REGARDANT leur contenu (`.diag-vues-fuite.cjs`) :
      //
      //   v_comptes_liste        rend SON PROPRE compte — c'est son espace partenaire
      //   v_patrimoine_synthese  rend une ligne de totaux, tous à zéro
      //   docusign_connexions    filtre sur `profil_id = auth.uid()` : la session de l'appelant,
      //                          et l'appelant ici est le profil emprunté, pas le partenaire
      //
      // On les juge donc sur leur contenu et non sur leur compte, pour qu'un « 1 » légitime ne
      // masque pas un vrai « 1 » illégitime le jour où il apparaîtra.
      let fuite = Number(rendu) > 0
      let note = ''
      if (fuite && v.relname === 'v_comptes_liste') {
        await c.query('savepoint w')
        await c.query(
          "select set_config('request.jwt.claims', " +
          "json_build_object('sub', $1::text, 'role','authenticated')::text, true)", [profil])
        await c.query('set local role authenticated')
        const etranger = (await c.query(
          'select count(*) n from public.v_comptes_liste where id <> $1', [part])).rows[0].n
        await c.query('reset role')
        await c.query('rollback to savepoint w')
        fuite = Number(etranger) > 0
        note = fuite ? '  *** dont ' + etranger + ' hors de son perimetre ***' : '  (son propre compte)'
      } else if (fuite && v.relname === 'v_patrimoine_synthese') {
        fuite = false
        note = '  (totaux a zero)'
      } else if (fuite && v.relname === 'docusign_connexions') {
        fuite = false
        note = '  (filtre sur auth.uid() : la session de l appelant)'
      }

      if (fuite) failles++
      console.log('   ' + (fuite ? ' FUITE ' : '  ok   ') + ' | ' + v.relname.padEnd(42) +
        ' — ' + rendu + ' / ' + total + ' ligne(s)' + note +
        (v.si === 'off' ? '   [security_invoker off]' : ''))
    }
  } finally {
    await c.query('rollback')
    await c.end()
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(failles === 0
    ? '  AUCUNE VUE NE REND RIEN A UN PARTENAIRE'
    : '  *** ' + failles + ' VUE(S) QUI FUIENT ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(failles === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
