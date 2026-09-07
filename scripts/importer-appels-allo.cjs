// ════════════════════════════════════════════════════════════════════════════════════════════════
// IMPORTER LES APPELS ALLO DANS KIMATCH
//
// Naoëlle, 07/09/2026 : « importe tout, avec la file des non rattachés. »
//
// ══ CE QU'IL Y A À REPRENDRE, MESURÉ LE 07/09/2026 ══
//
//   10 528 appels du 04/12/2025 au 07/09/2026, dont 7 931 avec un résumé produit par l'IA d'Allo.
//      620 SMS, laissés de côté pour l'instant : le type d'interaction SMS existe dans Kimatch avec
//           zéro ligne, et personne n'a demandé à les voir.
//
// ══ OÙ CHAQUE APPEL VA, ET LES TROIS TABLES QU'IL FAUT REGARDER ══
//
// La première version de cette mesure n'indexait que `contacts` et `comptes`, et annonçait 61 %
// d'appels orphelins. Elle oubliait `pistes`, qui porte 3 824 téléphones — PLUS que les contacts. Or
// les appels non rattachés sont de la prospection : c'est exactement là que sont les pistes. En les
// ajoutant, le rattachement passe de 39 % à 63 % :
//
//   4 061 sur un contact      38,6 %
//   2 550 sur une piste       24,2 %
//      26 sur un compte        0,2 %
//   3 891 nulle part          37,0 %   → consignés quand même, dans la file des non rattachés
//
// ══ LES ORPHELINS SONT IMPORTÉS AUSSI, ET C'EST UN CHOIX ══
//
// Un appel sans contact n'apparaît sur aucune fiche. On pourrait donc l'écarter — c'est ce qu'a fait
// la reprise des appels Salesforce, qui a laissé 7 824 consignations de côté.
//
// On les garde, pour deux raisons. La valeur des résumés IA est surtout sur la PROSPECTION, donc
// précisément sur les appels dont le numéro n'est pas encore une fiche. Et le rattachement se fait
// par numéro : rattacher un numéro une fois rattache tous ses appels, passés et futurs — 3 891
// appels se partagent 1 439 numéros, soit 2,7 appels par geste.
//
// Ils portent `numero_correspondant` et rien d'autre : c'est ce qui les rend retrouvables dans
// l'écran « Appels non rattachés ».
//
// ══ IDEMPOTENT, ET RÉVERSIBLE ══
//
// `source_externe_id` porte l'identifiant Allo (`cll-…`), comparé avant insertion : relancer
// n'ajoute rien. Le retour arrière est un `delete from interactions where source_externe_id like
// 'cll-%'`.
//
// ══ USAGE ══
//
//   node scripts/importer-appels-allo.cjs --simulation
//   node scripts/importer-appels-allo.cjs --ecrire
//   node scripts/importer-appels-allo.cjs --ecrire --depuis 2026-08-01
//
// `--simulation` ne touche à rien et affiche exactement ce qui serait écrit.
// `--depuis` limite la reprise à une date, pour un rattrapage quotidien.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.resolve(__dirname, '..')
const ecrire = process.argv.includes('--ecrire')
const simulation = process.argv.includes('--simulation')
const iDepuis = process.argv.indexOf('--depuis')
const depuis = iDepuis > -1 ? process.argv[iDepuis + 1] : null

if (!ecrire && !simulation) {
  console.log('Usage : node scripts/importer-appels-allo.cjs --simulation | --ecrire [--depuis AAAA-MM-JJ]')
  process.exit(1)
}

/* ── Les identifiants, lus dans .env.local et jamais affichés ──────────────────────────────── */
function secrets() {
  const chemin = path.join(RACINE, '.env.local')
  if (!fs.existsSync(chemin)) throw new Error('.env.local introuvable : ' + chemin)
  const env = fs.readFileSync(chemin, 'utf8')
  const cleAllo = env.match(/^ALLO_API_KEY=(.+)$/m)
  const urlBase = env.match(/^SUPABASE_DB_URL=(.+)$/m)
  if (!cleAllo) throw new Error('ALLO_API_KEY absent de .env.local.')
  if (!urlBase) throw new Error('SUPABASE_DB_URL absent de .env.local.')
  return { cleAllo: cleAllo[1].trim(), urlBase: urlBase[1].trim() }
}

/* ── La normalisation des numéros ───────────────────────────────────────────────────────────────
   Recopiée de `src/lib/telephone.ts`, qui est testée (16 tests) et mesurée sur les 3 399 fiches :
   3 269 numéros sur 3 273 deviennent comparables. Recopiée et non importée parce que ce script est
   en CommonJS et le module en TypeScript ; toute correction doit être portée aux deux. */
const INDICATIF = '+33'

function corrigerFrance(numero) {
  let national = numero.slice(INDICATIF.length)
  if (national.startsWith('0')) national = national.slice(1)
  if (!/^[1-9]\d{8}$/.test(national)) return null
  return INDICATIF + national
}

function normaliser(brut) {
  if (!brut) return null
  const premier = String(brut).split(/[/;]|\s[-–]\s/)[0]
  const plus = premier.trim().startsWith('+')
  const chiffres = premier.replace(/\D/g, '')
  if (!chiffres) return null
  if (chiffres.startsWith('0033')) return corrigerFrance('+33' + chiffres.slice(4))
  if (plus || chiffres.startsWith('33')) {
    const avecPlus = '+' + chiffres
    if (avecPlus.startsWith(INDICATIF)) return corrigerFrance(avecPlus)
    return avecPlus.length >= 8 ? avecPlus : null
  }
  if (chiffres.length === 10 && chiffres.startsWith('0')) return corrigerFrance(INDICATIF + chiffres.slice(1))
  if (chiffres.length === 9 && chiffres[0] !== '0') return INDICATIF + chiffres
  return null
}

function tousLesNumeros(...bruts) {
  const trouves = new Set()
  for (const brut of bruts) {
    if (!brut) continue
    for (const morceau of String(brut).split(/[/;,]|\s[-–]\s/)) {
      const n = normaliser(morceau)
      if (n) trouves.add(n)
    }
  }
  return [...trouves]
}

/* ── Allo ─────────────────────────────────────────────────────────────────────────────────────── */
const TENTATIVES = 4

async function dormir(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function chercherItems(cle, filtre, tentative = 1) {
  const res = await fetch('https://api.withallo.com/v2/api/conversations/items/search', {
    method: 'POST',
    headers: { Authorization: `Api-Key ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(filtre),
  })
  if (res.status === 429) {
    const attente = Number(res.headers.get('X-RateLimit-Reset')) || 1
    if (tentative < TENTATIVES) { await dormir(attente * 1000); return chercherItems(cle, filtre, tentative + 1) }
  }
  if (!res.ok) {
    const texte = (await res.text()).replace(/ak_(live|test)_[A-Za-z0-9_-]+/g, 'ak_***')
    // ALLO DIT LUI-MÊME SI L'ERREUR VAUT UNE SECONDE CHANCE. Constaté le 07/09 : un 500
    // `retryable: true` en pleine lecture des 10 528 appels a arrêté le parcours à la page 30.
    const rejouable = /"retryable"\s*:\s*true/.test(texte) || res.status >= 502
    if (rejouable && tentative < TENTATIVES) {
      await dormir(Math.pow(3, tentative - 1) * 1000)
      return chercherItems(cle, filtre, tentative + 1)
    }
    throw new Error(`Allo ${res.status} — ${texte.slice(0, 300)}`)
  }
  return res.json()
}

/** Le texte d'une transcription, avec qui parle : c'est ce qui la rend relisible. */
function transcriptionEnTexte(lignes) {
  if (!Array.isArray(lignes) || lignes.length === 0) return null
  return lignes
    .map((l) => `${l.source === 'USER' ? 'KiWee' : 'Correspondant'} : ${l.text}`)
    .join('\n')
}

/** Le résultat d'un appel en clair : c'est ce qu'un commercial lit, pas le code d'Allo. */
function resultatLisible(r) {
  if (r === 'ANSWERED') return 'Décroché'
  if (r === 'VOICEMAIL') return 'Messagerie'
  if (r === 'TRANSFERRED') return 'Transféré'
  return 'Sans réponse'
}

/** Les valeurs qu'Allo écrit quand son IA n'a rien trouvé. Elles ne valent pas mieux qu'un vide. */
const BOUCHE_TROUS = new Set(['NOT AVAILABLE', 'NULL', '.NULL', 'N/A', 'NONE', 'JOB_TITLE', 'COMPANY', '/', '.', '-', ''])

function valeurUtile(v) {
  if (!v) return null
  const t = String(v).trim()
  return t && !BOUCHE_TROUS.has(t.toUpperCase()) ? t : null
}

/* ── Le programme ─────────────────────────────────────────────────────────────────────────────── */
async function main() {
  const { cleAllo, urlBase } = secrets()
  const client = new Client({ connectionString: urlBase, ssl: { rejectUnauthorized: false } })
  await client.connect()

  try {
    /* 1. L'index des numéros connus — LES TROIS TABLES. */
    // UNE REQUÊTE APRÈS L'AUTRE, et non un `Promise.all` : un client `pg` porte UNE connexion, il
    // sérialise de toute façon les requêtes concurrentes et prévient qu'il le fera. Les paralléliser
    // ne gagnait rien et masquait ce fait derrière un avertissement de dépréciation.
    const contacts = await client.query(`select id, compte_id, telephone, telephone_mobile from contacts where actif = true`)
    const comptes = await client.query(`select id, telephone from comptes where actif = true and coalesce(telephone,'') <> ''`)
    const pistes = await client.query(`select id, compte_id, contact_id, telephone from pistes where actif = true and coalesce(telephone,'') <> ''`)
    const profils = await client.query(`select id, lower(email) as email from profils where actif = true and coalesce(email,'') <> ''`)
    const typeAppel = await client.query(`select id from types_interactions where code = 'APPEL'`)
    const dejaImportes = await client.query(`select source_externe_id from interactions where source_externe_id like 'cll-%'`)

    if (typeAppel.rows.length === 0) throw new Error("Le type d'interaction APPEL est absent de types_interactions.")
    const typeAppelId = typeAppel.rows[0].id

    const parNumero = new Map()
    const poser = (numero, cible) => {
      if (!parNumero.has(numero)) parNumero.set(numero, cible)
    }
    // ORDRE DE PRIORITÉ : contact, puis piste, puis compte. Un numéro qui est à la fois sur un
    // contact et sur une piste désigne quelqu'un qu'on connaît déjà : la fiche contact est la bonne.
    for (const c of contacts.rows) {
      for (const n of tousLesNumeros(c.telephone, c.telephone_mobile)) {
        poser(n, { contact_id: c.id, compte_id: c.compte_id, piste_id: null })
      }
    }
    for (const p of pistes.rows) {
      for (const n of tousLesNumeros(p.telephone)) {
        poser(n, { contact_id: p.contact_id, compte_id: p.compte_id, piste_id: p.id })
      }
    }
    for (const k of comptes.rows) {
      for (const n of tousLesNumeros(k.telephone)) {
        poser(n, { contact_id: null, compte_id: k.id, piste_id: null })
      }
    }

    const profilParEmail = new Map(profils.rows.map((p) => [p.email, p.id]))
    const dejaLa = new Set(dejaImportes.rows.map((r) => r.source_externe_id))

    console.log(`index Kimatch : ${parNumero.size} numéros connus (contacts, pistes, comptes)`)
    console.log(`déjà importés : ${dejaLa.size} appels Allo`)
    console.log(`profils reconnus par email : ${profilParEmail.size}`)
    if (depuis) console.log(`limité aux appels depuis le ${depuis}`)
    console.log('')

    /* 2. Les appels, page par page, avec leur transcription. */
    const aEcrire = []
    const enFile = []
    // La file n'existe qu'apres la migration 20260907220000. Sans elle on importe les rattaches et
    // on dit combien attendent : ils restent chez Allo, une seconde execution les reprendra.
    const fileExiste = (await client.query(
      "select 1 from information_schema.tables where table_schema = 'public' and table_name = 'appels_non_rattaches'",
    )).rows.length > 0
    const dejaEnFile = fileExiste
      ? new Set((await client.query('select source_externe_id from appels_non_rattaches')).rows
          .map((r) => r.source_externe_id))
      : new Set()
    const stats = {
      lus: 0, deja: 0, contact: 0, piste: 0, compte: 0, orphelin: 0,
      resume: 0, transcription: 0, enregistrement: 0, auteurInconnu: 0,
    }
    const auteursInconnus = new Set()

    let page = 1
    for (;;) {
      const filtre = { type: 'CALL', size: 100, page, sort: 'DATE_ASC', extend: 'transcript' }
      if (depuis) filtre.date = { from: depuis }
      const reponse = await chercherItems(cleAllo, filtre)
      const lot = reponse.data ?? []

      for (const a of lot) {
        stats.lus += 1
        if (dejaLa.has(a.id) || dejaEnFile.has(a.id)) { stats.deja += 1; continue }

        const numero = normaliser(a.contact_number)
        const cible = numero ? parNumero.get(numero) : null
        if (cible?.contact_id) stats.contact += 1
        else if (cible?.piste_id) stats.piste += 1
        else if (cible?.compte_id) stats.compte += 1
        else stats.orphelin += 1

        if (a.summary) stats.resume += 1
        if (a.transcript?.length) stats.transcription += 1
        if (a.recording_url) stats.enregistrement += 1

        // QUI A DÉCROCHÉ : reconnu par son adresse KiWee, la seule clé commune entre Allo et
        // Kimatch. Inconnue, l'appel est consigné sans auteur plutôt que d'être écarté.
        const auteurId = a.user?.email ? profilParEmail.get(a.user.email.trim().toLowerCase()) ?? null : null
        if (a.user?.email && !auteurId) { stats.auteurInconnu += 1; auteursInconnus.add(a.user.email) }

        // ══ SEULS LES APPELS RATTACHÉS DEVIENNENT DES `interactions` ══
        //
        // Constaté en lançant l'import : `interactions_contexte_check` exige qu'une interaction soit
        // liée à AU MOINS UN objet — compte, contact, site, signal, mandat, recommandation, version,
        // tâche, opportunité, suivi de contrat ou piste. C'est la même leçon que la reprise
        // Salesforce avait écrite en commentaire — « une consignation qui n'apparaît sur aucune fiche
        // ne consigne rien » — et on ne desserre pas cette règle pour lui faire de la place.
        //
        // Les orphelins vont donc dans `appels_non_rattaches` (migration 20260907220000), qui EST
        // la file demandée. Tant que la migration n'est pas passée, ils sont comptés et laissés chez
        // Allo : ce script est idempotent, une seconde exécution les reprendra.
        if (!cible) {
          if (fileExiste) {
            enFile.push({
              source_externe_id: a.id,
              numero: numero ?? a.contact_number ?? null,
              date_appel: a.date,
              sens: a.direction === 'INBOUND' ? 'ENTRANT' : 'SORTANT',
              duree_secondes: a.duration ?? null,
              resultat: resultatLisible(a.result),
              decroche_par: a.user?.name?.trim() || null,
              auteur_profil_id: auteurId,
              resume_ia: a.summary ?? null,
              transcription: transcriptionEnTexte(a.transcript),
              enregistrement_url: a.recording_url ?? null,
              societe_devinee: valeurUtile(a.extracted_data?.contact?.company),
              personne_devinee: valeurUtile(a.extracted_data?.contact?.name),
              fonction_devinee: valeurUtile(a.extracted_data?.contact?.job_title),
            })
          }
          continue
        }

        aEcrire.push({
          source_externe_id: a.id,
          type_interaction_id: typeAppelId,
          auteur_profil_id: auteurId,
          proprietaire_id: auteurId,
          cree_par_id: auteurId,
          contact_id: cible?.contact_id ?? null,
          compte_id: cible?.compte_id ?? null,
          piste_id: cible?.piste_id ?? null,
          date_interaction: a.date,
          sens: a.direction === 'INBOUND' ? 'ENTRANT' : 'SORTANT',
          objet: (a.summary ? a.summary.slice(0, 200) : `Appel ${a.direction === 'INBOUND' ? 'entrant' : 'sortant'}`),
          resume_ia: a.summary ?? null,
          transcription: transcriptionEnTexte(a.transcript),
          enregistrement_url: a.recording_url ?? null,
          duree_appel_secondes: a.duration ?? null,
          duree_minutes: a.duration != null ? Math.round(a.duration / 60) : null,
          appel_manque: a.result !== 'ANSWERED',
          messagerie_vocale: a.result === 'VOICEMAIL',
          numero_correspondant: numero ?? a.contact_number ?? null,
          decroche_par: a.user?.name?.trim() || null,
          // Le résultat en clair, plutôt que le code d'Allo : c'est ce qu'un commercial lit.
          resultat: resultatLisible(a.result),
          // La société extraite par l'IA, gardée en prochaine étape quand elle est exploitable :
          // c'est l'indice qui permettra de rattacher les orphelins.
          prochaine_etape: cible ? null : (valeurUtile(a.extracted_data?.contact?.company)
            ? `À rattacher — société annoncée : ${valeurUtile(a.extracted_data.contact.company)}`
            : null),
        })
      }

      if (!reponse.pagination?.has_more) break
      page += 1
      if (page > 200) { console.log('garde-fou : arrêt à la page 200.'); break }
    }

    /* 3. Le compte rendu. */
    console.log('══ CE QUI SERAIT ÉCRIT ══')
    console.log(`appels lus chez Allo ......... ${stats.lus}`)
    console.log(`déjà dans Kimatch ............ ${stats.deja}`)
    console.log(`à insérer .................... ${aEcrire.length}`)
    console.log('')
    console.log(`  sur un contact ............. ${stats.contact}`)
    console.log(`  sur une piste .............. ${stats.piste}`)
    console.log(`  sur un compte .............. ${stats.compte}`)
    console.log(`  non rattachés .............. ${stats.orphelin}`)
    console.log('')
    console.log(`  avec un résumé IA .......... ${stats.resume}`)
    console.log(`  avec une transcription ..... ${stats.transcription}`)
    console.log(`  avec un enregistrement ..... ${stats.enregistrement}`)
    if (auteursInconnus.size > 0) {
      console.log('')
      console.log(`  auteurs Allo sans profil Kimatch : ${[...auteursInconnus].join(', ')}`)
      console.log(`  (${stats.auteurInconnu} appels consignés sans auteur)`)
    }

    if (!ecrire) {
      console.log('\nSimulation : rien n\'a été écrit.')
      return
    }

    /* 4. L'écriture, par lots, dans une seule transaction. */
    const COLONNES = Object.keys(aEcrire[0] ?? {})
    // LA SORTIE ANTICIPÉE REGARDE LES DEUX LISTES, et c'est un défaut que la seconde exécution a
    // révélé : il peut n'y avoir aucune interaction à créer et 3 897 appels à mettre en file.
    // Ne tester que `aEcrire` faisait sortir avant d'avoir rempli la file, en annonçant
    // « rien à insérer » alors qu'il y avait tout à insérer.
    if (aEcrire.length === 0 && enFile.length === 0) { console.log('\nRien à insérer.'); return }

    await client.query('begin')
    const LOT = 200
    let ecrits = 0
    for (let i = 0; i < aEcrire.length; i += LOT) {
      const lot = aEcrire.slice(i, i + LOT)
      const valeurs = []
      const place = lot.map((ligne, j) => {
        const params = COLONNES.map((_, k) => `$${j * COLONNES.length + k + 1}`)
        valeurs.push(...COLONNES.map((c) => ligne[c]))
        return `(${params.join(',')})`
      })
      // ══ `ON CONFLICT`, ET C'EST LA BASE QUI M'A CORRIGÉE ══
      //
      // Le commentaire précédent affirmait que l'index unique n'existait pas, et s'en remettait à
      // la garde `dejaLa` lue en mémoire. Faux : `interactions_source_externe_id_idx` est un index
      // UNIQUE partiel sur `source_externe_id where source_externe_id is not null`. La deuxième
      // exécution a donc échoué sur deux identifiants, et tout l'import a été annulé.
      //
      // Une garde lue en mémoire ne peut pas tenir : entre le moment où on lit la liste des déjà
      // importés et celui où l'on écrit, Allo a pu renvoyer un appel de plus — le total est passé
      // de 10 533 à 10 537 pendant cette seule matinée. La contrainte en base, elle, tient toujours.
      //
      // La clause reprend le prédicat de l'index partiel : sans `where`, Postgres ne reconnaît pas
      // l'index et refuse la clause.
      await client.query(
        `insert into interactions (${COLONNES.join(',')}) values ${place.join(',')} `
        + `on conflict (source_externe_id) where source_externe_id is not null do nothing`,
        valeurs,
      )
      ecrits += lot.length
      process.stdout.write(`\r  interactions : ${ecrits} / ${aEcrire.length}`)
    }
    if (aEcrire.length > 0) process.stdout.write('\n')

    // ── LA FILE : les appels dont le numéro n'est sur aucune fiche ──
    //
    // Ils ne peuvent pas être des interactions — `interactions_contexte_check` exige un objet de
    // rattachement — et c'est la bonne règle : une consignation qui n'apparaît sur aucune fiche ne
    // consigne rien. Ils attendent donc dans `appels_non_rattaches`, où l'écran « Appels non
    // rattachés » permet de leur trouver leur fiche.
    let misEnFile = 0
    if (enFile.length > 0) {
      const COLS = Object.keys(enFile[0])
      for (let i = 0; i < enFile.length; i += LOT) {
        const lot = enFile.slice(i, i + LOT)
        const valeurs = []
        const place = lot.map((ligne, j) => {
          const params = COLS.map((_, k) => `$${j * COLS.length + k + 1}`)
          valeurs.push(...COLS.map((c) => ligne[c]))
          return `(${params.join(',')})`
        })
        // `source_externe_id` est unique sur cette table : la clause rend la reprise rejouable, y
        // compris si le même appel apparaît deux fois dans la pagination d'Allo.
        await client.query(
          `insert into appels_non_rattaches (${COLS.join(',')}) values ${place.join(',')} `
          + `on conflict (source_externe_id) do nothing`,
          valeurs,
        )
        misEnFile += lot.length
        process.stdout.write(`\r  mis en file  : ${misEnFile} / ${enFile.length}`)
      }
      process.stdout.write('\n')
    }

    await client.query('commit')
    console.log(`\n${ecrits} appel(s) consigné(s) sur une fiche, ${misEnFile} mis en file d'attente.`)
    console.log('Retour arrière : delete from interactions where source_externe_id like \'cll-%\';')
    console.log('                 delete from appels_non_rattaches;')
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('\n' + e.message)
  process.exit(1)
})
