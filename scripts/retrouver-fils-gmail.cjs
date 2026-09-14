// ════════════════════════════════════════════════════════════════════════════════════════════════
// RETROUVE LE FIL GMAIL DES 1 082 CONVERSATIONS REPRISES DE SALESFORCE
//
// Naoëlle, 14/09/2026 : « oui fais le rattrapage des 1 082 conversations Salesforce ».
//
// ══ LE PROBLÈME EN UNE LIGNE ══
//
// Les mails repris de Salesforce portent dans `fil_discussion` un `Message-ID` RFC —
// `<CAGtyFLx_AmGa8...@mail.gmail.com>` — c'est-à-dire l'identifiant d'un MESSAGE. Le rapatriement
// des réponses (`api/gmail/rapatrier.ts`) interroge Gmail par identifiant de CONVERSATION, une
// suite hexadécimale. Ces 1 082 conversations sont donc exclues du rapatriement, et les réponses
// des clients qui s'y trouvent ne remonteront jamais.
//
// Gmail sait faire la conversion : `rfc822msgid:` cherche un message par son Message-ID et rend
// son `threadId`. Une recherche par conversation, une conversion, et le rapatriement les prend.
//
// ══ DANS QUELLE BOÎTE CHERCHER ══
//
// Un Message-ID ne se trouve que dans une boîte qui contient le message. On cherche donc dans
// celle de l'AUTEUR de l'interaction — la personne qui a écrit le mail, donc celle qui l'a dans
// ses « Envoyés ». Relevé du 14/09 :
//
//     Thomas Le Guen     596 fils      Matthieu Bruere    95 fils
//     Fabien Dubarry     288 fils      Marie Thonnard     34 fils
//     (sans auteur)      243 fils   ⚠  on ne sait pas chez qui chercher
//
// Les 243 sans auteur passent par `--orphelins` : on essaie chaque boîte connectée jusqu'à
// trouver. C'est plus coûteux, donc séparé — et ça ne sert à rien tant que la première passe n'a
// pas montré que la recherche fonctionne.
//
// ══ IL FAUT LE DROIT DE LECTURE ══
//
// `rfc822msgid:` est une recherche : elle exige `gmail.readonly`, que les connexions antérieures
// au 14/09/2026 n'accordaient pas. Tant que la personne n'a pas refait sa connexion Gmail, ses
// fils ne peuvent pas être retrouvés — le script le dit et passe au suivant.
//
// ══ RÉVERSIBLE ══
//
// L'ancien Message-ID part dans `fil_origine_salesforce` (migration 20260914230000). Si une
// recherche se trompait de message — deux mails au même sujet, un transfert — on revient en
// arrière d'une instruction, et on sait exactement quelles lignes ont bougé.
//
// SANS `--appliquer`, RIEN N'EST ÉCRIT.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

const APPLIQUER = process.argv.includes('--appliquer')
const ORPHELINS = process.argv.includes('--orphelins')

const env = (cle) => {
  const ligne = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith(cle + '='))
  return ligne ? ligne.slice(cle.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}

/** Gmail veut le Message-ID SANS ses chevrons dans `rfc822msgid:`. Avec, la recherche rend vide. */
const sansChevrons = (id) => id.replace(/^</, '').replace(/>$/, '')

async function dormir(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function jetonFrais(refreshToken) {
  const rep = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GMAIL_CLIENT_ID'),
      client_secret: env('GMAIL_CLIENT_SECRET'),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const corps = await rep.json()
  if (!rep.ok) throw new Error(`rafraîchissement refusé : ${JSON.stringify(corps).slice(0, 200)}`)
  return corps.access_token
}

/**
 * Le `threadId` Gmail d'un Message-ID, ou `null` si la boîte ne le connaît pas.
 *
 * `404` n'existe pas ici : une recherche qui ne trouve rien rend une liste vide. Le seul code qui
 * doit arrêter la boucle est `403` — droit de lecture non accordé — parce qu'il vaudra pour les
 * 595 fils suivants de la même personne.
 */
async function filDe(accessToken, messageId, tentative = 1) {
  const q = encodeURIComponent(`rfc822msgid:${sansChevrons(messageId)}`)
  const rep = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (rep.status === 429 || rep.status === 503) {
    if (tentative < 4) { await dormir(Math.pow(3, tentative) * 1000); return filDe(accessToken, messageId, tentative + 1) }
  }
  if (!rep.ok) {
    const corps = await rep.text().catch(() => '')
    const e = new Error(`Gmail ${rep.status} — ${corps.slice(0, 200)}`)
    e.statut = rep.status
    throw e
  }
  const j = await rep.json()
  const premier = (j.messages || [])[0]
  return premier ? premier.threadId : null
}

;(async () => {
  const c = new Client({ connectionString: env('SUPABASE_DB_URL'), ssl: { rejectUnauthorized: false }, statement_timeout: 300000 })
  await c.connect()

  const jetons = new Map((await c.query(
    `select profil_id, email_gmail, refresh_token from public.profils_gmail_tokens`))
    .rows.map((r) => [r.profil_id, r]))

  /* LES FILS À CONVERTIR, GROUPÉS PAR PERSONNE. Un fil peut porter plusieurs messages ; on
     convertit le fil, donc toutes ses lignes d'un coup. */
  const { rows } = await c.query(`
    select i.fil_discussion as fil,
           i.auteur_profil_id as auteur,
           count(*)::int as messages
      from public.interactions i
     where i.fil_discussion like '<%'
     group by 1, 2`)

  /* ══ UN FIL, UNE SEULE RECHERCHE ══
     Le regroupement rend 1 256 couples (fil, auteur) pour 1 082 fils distincts : certaines
     conversations portent des messages de deux personnes. Sans dédoublonnage, on chercherait deux
     fois le même Message-ID — la seconde conversion ne trouverait plus rien à mettre à jour,
     puisque la première a déjà changé la valeur — et le compte annoncé serait faux de 174.

     On garde donc UNE boîte par fil, en préférant celle qui a un Gmail connecté : c'est la seule
     dans laquelle la recherche a une chance d'aboutir. */
  const boitePourLeFil = new Map()
  for (const r of rows) {
    const dejaChoisi = boitePourLeFil.get(r.fil)
    const aUnJeton = r.auteur && jetons.has(r.auteur)
    if (!dejaChoisi || (aUnJeton && !dejaChoisi.auteur)) {
      boitePourLeFil.set(r.fil, { fil: r.fil, auteur: aUnJeton ? r.auteur : null })
    }
  }

  const parPersonne = new Map()
  const orphelins = []
  for (const r of boitePourLeFil.values()) {
    if (!r.auteur) { orphelins.push(r); continue }
    if (!parPersonne.has(r.auteur)) parPersonne.set(r.auteur, [])
    parPersonne.get(r.auteur).push(r)
  }

  console.log('══ CE QUE LE RATTRAPAGE FERAIT ══')
  console.log(`fils distincts à convertir : ${boitePourLeFil.size}`)
  for (const [profil, liste] of parPersonne) {
    console.log(`   ${jetons.get(profil).email_gmail.padEnd(32)} ${String(liste.length).padStart(4)} fils`)
  }
  console.log(`   ${'(auteur inconnu ou sans Gmail)'.padEnd(32)} ${String(orphelins.length).padStart(4)} fils` +
    (ORPHELINS ? ' — cherchés dans chaque boîte' : ' — ignorés (relancer avec --orphelins)'))

  if (!APPLIQUER) {
    console.log('\nSimulation seule. Relancer avec --appliquer pour écrire.')
    await c.end()
    return
  }

  /* LE CONTRÔLE DES IDENTIFIANTS EST ICI, ET PAS EN TÊTE. Il y était d'abord, et il empêchait même
     la SIMULATION — qui ne fait que lire la base et ne touche jamais Google. On ne demande pas de
     rassembler des secrets pour avoir le droit de regarder ce qu'un script ferait. */
  if (!env('GMAIL_CLIENT_ID') || !env('GMAIL_CLIENT_SECRET')) {
    console.error('\nGMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET absentes de .env.local.')
    console.error('Elles ne vivent que dans Vercel : copiez-les localement pour écrire.')
    await c.end()
    process.exit(1)
  }

  const bilan = { convertis: 0, introuvables: 0, sansDroit: 0, erreurs: 0 }

  async function convertir(fil, accessToken) {
    const threadId = await filDe(accessToken, fil)
    if (!threadId) return false
    /* On garde l'ancien AVANT de le remplacer, dans la même instruction : un `update` en deux
       temps laisserait une fenêtre où l'on ne saurait plus d'où l'on vient. */
    const r = await c.query(
      `update public.interactions
          set fil_origine_salesforce = fil_discussion,
              fil_discussion = $1
        where fil_discussion = $2`,
      [threadId, fil])
    bilan.convertis += r.rowCount > 0 ? 1 : 0
    return true
  }

  for (const [profil, liste] of parPersonne) {
    const jeton = jetons.get(profil)
    let accessToken
    try {
      accessToken = await jetonFrais(jeton.refresh_token)
    } catch (e) {
      console.log(`\n${jeton.email_gmail} : ${e.message}`)
      bilan.erreurs += liste.length
      continue
    }

    console.log(`\n── ${jeton.email_gmail} — ${liste.length} fils ──`)
    let droitRefuse = false
    let faits = 0
    for (const r of liste) {
      if (droitRefuse) break
      try {
        const trouve = await convertir(r.fil, accessToken)
        if (!trouve) bilan.introuvables++
        faits++
        if (faits % 50 === 0) console.log(`   ${faits}/${liste.length}…`)
      } catch (e) {
        if (e.statut === 403 || e.statut === 401) {
          droitRefuse = true
          console.log('   ⚠ LECTURE REFUSÉE — cette personne doit refaire sa connexion Gmail.')
          bilan.sansDroit += liste.length - faits
          break
        }
        bilan.erreurs++
      }
      // Gmail tolère largement ce rythme ; on reste poli sur une tâche de 1 000 requêtes.
      await dormir(120)
    }
  }

  if (ORPHELINS && orphelins.length > 0) {
    console.log(`\n── ${orphelins.length} fils sans auteur : on essaie chaque boîte ──`)
    const boites = []
    for (const j of jetons.values()) {
      try { boites.push({ email: j.email_gmail, token: await jetonFrais(j.refresh_token) }) } catch { /* ignorée */ }
    }
    let faits = 0
    for (const r of orphelins) {
      let trouve = false
      for (const b of boites) {
        try {
          if (await convertir(r.fil, b.token)) { trouve = true; break }
        } catch (e) { if (e.statut !== 403 && e.statut !== 401) bilan.erreurs++ }
        await dormir(120)
      }
      if (!trouve) bilan.introuvables++
      faits++
      if (faits % 25 === 0) console.log(`   ${faits}/${orphelins.length}…`)
    }
  }

  const reste = (await c.query(
    `select count(distinct fil_discussion)::int as n from public.interactions where fil_discussion like '<%'`)).rows[0].n

  console.log('\n══ RÉSULTAT ══')
  console.log(`fils convertis        : ${bilan.convertis}`)
  console.log(`introuvables dans Gmail : ${bilan.introuvables}  (message supprimé, ou dans une autre boîte)`)
  console.log(`bloqués faute de droit  : ${bilan.sansDroit}`)
  console.log(`erreurs                 : ${bilan.erreurs}`)
  console.log(`restent au format Salesforce : ${reste}`)
  console.log('\nRetour arrière :')
  console.log("  update interactions set fil_discussion = fil_origine_salesforce,")
  console.log("         fil_origine_salesforce = null where fil_origine_salesforce is not null;")

  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
