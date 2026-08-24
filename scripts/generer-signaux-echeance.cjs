/**
 * GÉNÉRATION DES SIGNAUX D'ÉCHÉANCE.
 *
 * Diapositive 9 de Michel : « 1 • DÉTECTER — création automatique. Kimatch observe le patrimoine et
 * les interactions : échéance, contrat, consommation, appel, e-mail, rendez-vous ou demande client. »
 * Ce script est le premier de ces observateurs, celui de l'échéance.
 *
 * SES DEUX RÉPONSES DU 24/08/2026 À 22:05, qui commandent tout ce fichier :
 *
 *   « Combien de mois avant l'échéance on crée le signal ? » → DOUZE MOIS.
 *   « Le signal doit être accroché à un CONTACT et ensuite analyse les sites (compteurs) liés à ce
 *     contact pour créer un signal. »
 *
 * UN SIGNAL PAR CONTACT, PAS PAR COMPTEUR. C'est la conséquence directe de sa phrase, et elle change
 * l'échelle : 1 065 compteurs arrivent à échéance dans les douze mois, mais ils appartiennent à 593
 * contacts — 1,7 compteur par contact. Le commercial appelle une personne, pas un point de livraison.
 * Le signal nomme donc le contact, et son commentaire liste les compteurs qui le motivent.
 *
 * 45 COMPTEURS NE PRODUIRONT AUCUN SIGNAL, et le script le dit à chaque passage. Ils n'ont de contact
 * ni sur le compteur, ni sur leur compte : sans contact, pas de signal — c'est sa règle. Ce sont
 * exactement les cas de sa diapositive 7, le patrimoine à réactiver.
 *
 * L'IDEMPOTENCE EST PORTÉE PAR LA BASE, pas par ce script. `signaux.cle_generation` a un index unique
 * partiel (migration 20260824190000) : la clé décrit LE FAIT qui justifie le signal — le contact et
 * l'échéance la plus proche de ses compteurs. Rejouer le script n'insère donc rien de plus, même si
 * deux exécutions se croisent ; et une échéance repoussée produit légitimement un nouveau signal.
 *
 * DEUXIÈME GARDE-FOU, celui du bon sens : on n'ouvre pas un signal d'échéance à un contact qui en a
 * déjà un ouvert. Sans lui, un contact dont deux compteurs arrivent à échéance à trois mois d'écart
 * recevrait deux signaux successifs, et le commercial appellerait deux fois pour la même conversation.
 *
 * Usage, depuis la racine du dépôt :
 *
 *   node scripts/generer-signaux-echeance.cjs               # à blanc, n'écrit rien
 *   node scripts/generer-signaux-echeance.cjs --appliquer    # écrit
 *   node scripts/generer-signaux-echeance.cjs --mois 6       # autre horizon
 *
 * À blanc par défaut, comme l'import des échéances : une génération de plusieurs centaines de lignes
 * se regarde avant de se lancer.
 */
const fs = require('fs')
const path = require('path')
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

const APPLIQUER = process.argv.includes('--appliquer')
const iMois = process.argv.indexOf('--mois')
const MOIS = iMois > -1 ? Number(process.argv[iMois + 1]) : 12

if (!Number.isFinite(MOIS) || MOIS < 1 || MOIS > 60) {
  console.error('--mois attend un nombre de mois entre 1 et 60.')
  process.exit(1)
}

const url = fs
  .readFileSync('.env.local', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('SUPABASE_DB_URL='))
  .slice('SUPABASE_DB_URL='.length)
  .trim()

const client = new Client({ connectionString: url })

/** Les colonnes et référentiels sans lesquels le script ne peut rien écrire. */
async function verifierLesPrerequis() {
  const manquants = []

  const colonnes = await client.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'signaux'
       and column_name in ('origine', 'cle_generation', 'contact_id')`,
  )
  const presentes = new Set(colonnes.rows.map((r) => r.column_name))
  for (const c of ['origine', 'cle_generation', 'contact_id']) {
    if (!presentes.has(c)) manquants.push(`signaux.${c}`)
  }

  const type = await client.query(`select id from types_signaux where code = 'ECHEANCE_CONTRAT'`)
  const statut = await client.query(`select id from statuts_signaux where code = 'NOUVEAU'`)
  if (!type.rows.length) manquants.push(`types_signaux.code = 'ECHEANCE_CONTRAT'`)
  if (!statut.rows.length) manquants.push(`statuts_signaux.code = 'NOUVEAU'`)

  if (manquants.length) {
    console.error('Prérequis absents en base :')
    for (const m of manquants) console.error('  · ' + m)
    console.error('')
    console.error('Les colonnes viennent des migrations 20260824190000 (origine, cle_generation)')
    console.error('et 20260824220000 (contact_id). À appliquer avant de générer :')
    console.error('  node scripts/appliquer-migration.cjs 20260824190000')
    console.error('  node scripts/appliquer-migration.cjs 20260824220000')
    process.exit(1)
  }

  return { typeId: type.rows[0].id, statutId: statut.rows[0].id }
}

/**
 * Les compteurs à échéance dans l'horizon, avec le contact qui les porte.
 *
 * LE CONTACT SE CHERCHE À DEUX NIVEAUX. D'abord le responsable du compteur — c'est le plus précis, et
 * il est renseigné sur 955 des 1 065 cas. À défaut, le contact principal actif du compte : 65 cas de
 * plus. Les 45 restants n'ont personne, et ressortent en fin de script.
 *
 * `to_char` et non la date brute : le pilote `pg` rend un `date` en minuit LOCAL, et un `toISOString`
 * derrière recule d'un jour en UTC+2. C'est l'erreur qui m'avait fait lire 20/08 là où la base
 * portait 21/08 (21/08/2026).
 */
async function lireLesCompteurs() {
  const { rows } = await client.query(
    `select k.id                                   as compteur_id,
            k.numero_point,
            k.site_id,
            s.nom                                  as site_nom,
            to_char(k.date_echeance, 'YYYY-MM-DD') as echeance,
            coalesce(
              k.responsable_contact_id,
              (select ct.id from contacts ct
                where ct.compte_id = s.compte_id and ct.actif = true
                order by ct.contact_principal desc nulls last, ct.date_creation
                limit 1)
            )                                      as contact_id
       from compteurs k
       join sites s on s.id = k.site_id
      where k.actif = true
        and k.date_echeance is not null
        and k.date_echeance >= current_date
        and k.date_echeance <= current_date + ($1 || ' months')::interval
      order by k.date_echeance`,
    [String(MOIS)],
  )
  return rows
}

/** Les contacts qui ont déjà un signal d'échéance ouvert : on ne les rappelle pas deux fois. */
async function contactsDejaEnCours() {
  const { rows } = await client.query(
    `select distinct sg.contact_id
       from signaux sg
       join types_signaux t on t.id = sg.type_signal_id
       join statuts_signaux st on st.id = sg.statut_id
      where sg.contact_id is not null
        and t.code = 'ECHEANCE_CONTRAT'
        and st.code in ('NOUVEAU', 'A_QUALIFIER')`,
  )
  return new Set(rows.map((r) => r.contact_id))
}

function grouperParContact(compteurs) {
  const parContact = new Map()
  const orphelins = []
  for (const c of compteurs) {
    if (!c.contact_id) {
      orphelins.push(c)
      continue
    }
    const liste = parContact.get(c.contact_id) ?? []
    liste.push(c)
    parContact.set(c.contact_id, liste)
  }
  return { parContact, orphelins }
}

function dateFr(iso) {
  const [a, m, j] = iso.split('-')
  return `${j}/${m}/${a}`
}

/**
 * Le commentaire du signal : ce que le commercial doit savoir avant de décrocher.
 *
 * On nomme les compteurs et leurs dates plutôt que d'écrire « plusieurs échéances » : c'est
 * précisément l'information qui lui évite d'ouvrir trois fiches avant d'appeler.
 */
function commentaire(compteurs) {
  const lignes = compteurs
    .slice(0, 10)
    .map((c) => `· ${c.numero_point} — ${c.site_nom || 'site inconnu'} — échéance le ${dateFr(c.echeance)}`)
  const reste = compteurs.length - lignes.length
  return [
    `${compteurs.length} point${compteurs.length > 1 ? 's' : ''} de livraison arrive${compteurs.length > 1 ? 'nt' : ''} à échéance dans les ${MOIS} prochains mois :`,
    ...lignes,
    reste > 0 ? `· et ${reste} autre${reste > 1 ? 's' : ''}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

async function main() {
  await client.connect()
  const { typeId, statutId } = await verifierLesPrerequis()

  const compteurs = await lireLesCompteurs()
  const { parContact, orphelins } = grouperParContact(compteurs)
  const dejaEnCours = await contactsDejaEnCours()

  const aCreer = []
  let ignoresDejaEnCours = 0

  for (const [contactId, liste] of parContact) {
    if (dejaEnCours.has(contactId)) {
      ignoresDejaEnCours++
      continue
    }
    // La plus proche échéance décide de la date du signal ET de sa clé : c'est elle qui rend le
    // dossier urgent, et c'est elle qui change quand la situation change.
    const plusProche = liste[0]
    aCreer.push({
      contact_id: contactId,
      site_id: plusProche.site_id,
      compteur_id: plusProche.compteur_id,
      echeance: plusProche.echeance,
      cle_generation: `ECHEANCE:${contactId}:${plusProche.echeance}`,
      commentaire: commentaire(liste),
      nb: liste.length,
    })
  }

  console.log('══ GÉNÉRATION DES SIGNAUX D’ÉCHÉANCE ══')
  console.log(`horizon                       : ${MOIS} mois`)
  console.log(`compteurs dans l’horizon      : ${compteurs.length}`)
  console.log(`contacts concernés            : ${parContact.size}`)
  console.log(`signaux à créer               : ${aCreer.length}`)
  console.log(`contacts déjà en cours        : ${ignoresDejaEnCours}`)
  console.log(`compteurs sans aucun contact  : ${orphelins.length}  ← aucun signal possible`)
  console.log('')

  if (aCreer.length) {
    console.log('Cinq premiers signaux :')
    for (const s of aCreer.slice(0, 5)) {
      console.log(`  ${s.nb} PDL · plus proche le ${dateFr(s.echeance)} · clé ${s.cle_generation}`)
    }
    console.log('')
  }

  if (orphelins.length) {
    console.log('Compteurs sans contact (cinq premiers) — à reprendre par la réactivation :')
    for (const o of orphelins.slice(0, 5)) {
      console.log(`  ${o.numero_point} — ${o.site_nom || 'site inconnu'} — échéance le ${dateFr(o.echeance)}`)
    }
    console.log('')
  }

  if (!APPLIQUER) {
    console.log('À BLANC — rien n’a été écrit. Relancer avec --appliquer pour créer les signaux.')
    await client.end()
    return
  }

  if (!aCreer.length) {
    console.log('Rien à créer.')
    await client.end()
    return
  }

  // TOUT OU RIEN. Une génération à moitié faite laisserait une partie des contacts avec un signal et
  // l'autre sans, sans moyen de savoir où elle s'est arrêtée.
  await client.query('begin')
  try {
    let crees = 0
    for (const s of aCreer) {
      // `on conflict do nothing` sur la clé de génération : si une autre exécution a déjà créé ce
      // signal, on continue sans échouer.
      const r = await client.query(
        `insert into signaux
           (type_signal_id, statut_id, contact_id, site_id, compteur_id,
            date_detection, commentaire, origine, cle_generation, actif)
         values ($1, $2, $3, $4, $5, current_date, $6, 'AUTOMATIQUE', $7, true)
         on conflict (cle_generation) where cle_generation is not null do nothing
         returning id`,
        [typeId, statutId, s.contact_id, s.site_id, s.compteur_id, s.commentaire, s.cle_generation],
      )
      if (r.rows.length) crees++
    }
    await client.query('commit')
    console.log(`✓ ${crees} signaux créés (${aCreer.length - crees} déjà présents, ignorés par la clé).`)
  } catch (e) {
    await client.query('rollback')
    console.error('ÉCHEC — rien n’a été écrit :', e.message)
    process.exitCode = 1
  }

  await client.end()
}

main().catch((e) => {
  console.error('ERREUR :', e.message)
  process.exit(1)
})
