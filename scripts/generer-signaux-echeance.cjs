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

/** Le nombre de signaux d'échéance ouverts que chaque commercial doit avoir au plus (Michel). */
const iPlafond = process.argv.indexOf('--plafond')
const PLAFOND = iPlafond > -1 ? Number(process.argv[iPlafond + 1]) : 20

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

/**
 * LE SCORE DE PRIORITÉ ET LE COMMERCIAL DE CHAQUE CONTACT ÉLIGIBLE.
 *
 * Barème de Michel du 01/09/2026 — échéance 50, acceptation 25, interactions 15, potentiel 10 — et
 * son contrôle préalable : « si le contact possède déjà une opportunité en cours, aucun signal n'est
 * généré ». Les deux vivent dans `v_signal_score_contact`, pas ici : le score se recalcule à chaque
 * lecture, et l'écran doit pouvoir montrer le même détail que celui qui a servi au classement.
 */
async function lireLesScores() {
  const { rows } = await client.query(
    `select contact_id, commercial_id, score, pts_echeance, pts_acceptation,
            pts_interactions, pts_potentiel, opportunite_en_cours
       from v_signal_score_contact
      where eligible_signal`,
  )
  return new Map(rows.map((r) => [r.contact_id, r]))
}

/**
 * COMBIEN DE SIGNAUX D'ÉCHÉANCE OUVERTS CHAQUE COMMERCIAL A DÉJÀ.
 *
 * Michel : « fait remonter les 20 meilleurs signaux par jour et par commercial ». Naoëlle a tranché
 * la lecture le 01/09/2026 : c'est une LISTE DE VINGT TENUE À JOUR, pas vingt créations par jour.
 *
 * Le calcul complète donc jusqu'à vingt et ne crée rien tant que le commercial en a vingt ouverts.
 * L'autre lecture aurait vidé le vivier en six jours — 596 contacts éligibles pour 9 commerciaux,
 * soit 66 chacun — et empilé des signaux que personne n'aurait traités.
 */
async function ouvertsParCommercial() {
  const { rows } = await client.query(
    `select sg.responsable_profil_id as commercial_id, count(*)::int as n
       from signaux sg
       join statuts_signaux st on st.id = sg.statut_id
       join types_signaux ty on ty.id = sg.type_signal_id
      where sg.actif and ty.code = 'ECHEANCE_CONTRAT'
        and st.code not in ('CONVERTI', 'ECARTE')
        and sg.responsable_profil_id is not null
      group by sg.responsable_profil_id`,
  )
  return new Map(rows.map((r) => [r.commercial_id, r.n]))
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
  const scores = await lireLesScores()
  const dejaOuverts = await ouvertsParCommercial()

  // ══ 1. LES CANDIDATS ══
  const candidats = []
  let ignoresDejaEnCours = 0
  let ignoresOpportunite = 0
  let ignoresSansScore = 0

  for (const [contactId, liste] of parContact) {
    if (dejaEnCours.has(contactId)) {
      ignoresDejaEnCours++
      continue
    }
    const sc = scores.get(contactId)
    if (!sc) {
      // Absent de la vue des éligibles : soit une opportunité est en cours, soit son échéance est
      // sortie de la fenêtre entre les deux lectures. On distingue les deux pour le compte rendu.
      const { rows } = await client.query(
        'select opportunite_en_cours from v_signal_score_contact where contact_id = $1',
        [contactId],
      )
      if (rows[0] && rows[0].opportunite_en_cours) ignoresOpportunite++
      else ignoresSansScore++
      continue
    }
    // La plus proche échéance décide de la date du signal ET de sa clé : c'est elle qui rend le
    // dossier urgent, et c'est elle qui change quand la situation change.
    const plusProche = liste[0]
    candidats.push({
      contact_id: contactId,
      commercial_id: sc.commercial_id,
      score: sc.score,
      detail: `${sc.pts_echeance}+${sc.pts_acceptation}+${sc.pts_interactions}+${sc.pts_potentiel}`,
      site_id: plusProche.site_id,
      compteur_id: plusProche.compteur_id,
      echeance: plusProche.echeance,
      cle_generation: `ECHEANCE:${contactId}:${plusProche.echeance}`,
      commentaire: commentaire(liste),
      nb: liste.length,
    })
  }

  // ══ 2. LE CLASSEMENT, PUIS LES VINGT ══
  // Le tri part du score, et l'échéance départage à score égal : deux contacts à 60 points ne se
  // valent pas si l'un arrive à terme dans trois semaines et l'autre dans trois mois.
  candidats.sort((a, b) => b.score - a.score || String(a.echeance).localeCompare(String(b.echeance)))

  const aCreer = []
  const places = new Map()
  let ignoresQuota = 0
  for (const c of candidats) {
    const cle = c.commercial_id ?? 'SANS_COMMERCIAL'
    if (!places.has(cle)) places.set(cle, PLAFOND - (dejaOuverts.get(c.commercial_id) ?? 0))
    if (places.get(cle) <= 0) {
      ignoresQuota++
      continue
    }
    places.set(cle, places.get(cle) - 1)
    aCreer.push(c)
  }

  console.log('══ GÉNÉRATION DES SIGNAUX D’ÉCHÉANCE ══')
  console.log(`horizon                       : ${MOIS} mois`)
  console.log(`plafond par commercial        : ${PLAFOND} signaux ouverts`)
  console.log(`compteurs dans l’horizon      : ${compteurs.length}`)
  console.log(`contacts concernés            : ${parContact.size}`)
  console.log('')
  console.log('── écartés avant classement ──')
  console.log(`  signal d’échéance déjà ouvert : ${ignoresDejaEnCours}`)
  console.log(`  opportunité en cours          : ${ignoresOpportunite}`)
  console.log(`  hors fenêtre au recalcul      : ${ignoresSansScore}`)
  console.log('')
  console.log(`candidats classés             : ${candidats.length}`)
  console.log(`écartés faute de place        : ${ignoresQuota}`)
  console.log(`SIGNAUX À CRÉER               : ${aCreer.length}`)
  console.log(`compteurs sans aucun contact  : ${orphelins.length}  ← aucun signal possible`)
  console.log('')

  // Les places restantes par commercial : c'est ce qui explique un petit nombre de créations.
  if (places.size) {
    console.log('Places restantes après génération :')
    for (const [cle, reste] of places) {
      const deja = dejaOuverts.get(cle === 'SANS_COMMERCIAL' ? null : cle) ?? 0
      console.log(`  ${String(cle).slice(0, 8)}… : ${deja} déjà ouverts · ${Math.max(0, reste)} place(s) libre(s)`)
    }
    console.log('')
  }

  if (aCreer.length) {
    console.log('Cinq premiers signaux, par score décroissant :')
    for (const s of aCreer.slice(0, 5)) {
      console.log(`  ${String(s.score).padStart(3)} pts (${s.detail}) · ${s.nb} PDL · plus proche le ${dateFr(s.echeance)}`)
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
      /* `gravite` PORTE LE SCORE, et `responsable_profil_id` le commercial.
         Les deux colonnes existaient et n'étaient jamais remplies — `gravite` était vide sur les
         1 456 signaux, `responsable_profil_id` sur la totalité. Sans elles, « classé par priorité »
         et « par commercial » ne veulent rien dire : l'écran triait par date de création. */
      const r = await client.query(
        `insert into signaux
           (type_signal_id, statut_id, contact_id, site_id, compteur_id,
            date_detection, commentaire, origine, cle_generation, actif,
            gravite, responsable_profil_id)
         values ($1, $2, $3, $4, $5, current_date, $6, 'AUTOMATIQUE', $7, true, $8, $9)
         on conflict (cle_generation) where cle_generation is not null do nothing
         returning id`,
        [typeId, statutId, s.contact_id, s.site_id, s.compteur_id, s.commentaire, s.cle_generation,
         s.score, s.commercial_id],
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
