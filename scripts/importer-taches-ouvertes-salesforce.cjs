// ════════════════════════════════════════════════════════════════════════════════════════════════
// LES TÂCHES QUI RESTENT À FAIRE SUR LES PISTES
//
// Naoëlle, 08/09/2026 : « il faut récupérer l'activité des pistes de Salesforce ».
//
// ══ CE QUE LA MESURE A MONTRÉ, ET QUI CHANGE LA DEMANDE ══
//
// L'activité TERMINÉE est déjà là : 6 392 tâches Salesforce importées le 01/09/2026 sur 864 pistes,
// plus 2 550 appels Allo — 8 942 interactions sur 1 126 pistes. Relevé objet par objet dans
// Salesforce le 08/09/2026 : 927 leads portent une tâche, 4 un rendez-vous, 29 un message Chatter,
// et `LeadHistory` comme `ContentNote` sont vides. Il n'y a pas de gisement caché de ce côté.
//
// CE QUI MANQUAIT, ce sont les tâches encore OUVERTES. `importer-activites-leads-salesforce.cjs` les
// a écartées volontairement, et son commentaire disait juste : « une tâche ouverte est un travail à
// faire, pas un échange qui a eu lieu. Sa place est dans `actions`, pas dans `interactions`. »
//
// Le raisonnement était bon, et la conséquence est restée : ces tâches ne sont NULLE PART dans
// Kimatch. Un commercial qui reprend une piste ne voit pas la relance que Salesforce lui rappelle.
// C'est aussi ce qui explique 927 leads porteurs de tâches là-bas pour 864 pistes ici : une soixantaine
// de ces leads n'ont QUE des tâches ouvertes, donc rien n'a été importé pour eux.
//
// ══ LE NOMBRE BOUGE, ET C'EST NORMAL ══
//
// Compté à 161 puis à 156 vingt minutes plus tard : l'org est vivant, Matthieu BRUERE en porte 110 à
// lui seul et il en termine pendant qu'on regarde. Le script ne se cale donc sur aucun nombre attendu
// — il prend ce que l'export contient, et l'idempotence fait le reste.
//
// ══ CE QUE L'EXPORT CONTIENT VRAIMENT ══
//
//   TaskSubtype   « Task » pour les 156, sans exception
//   Subject       « Call » 68 fois, puis du TEXTE LIBRE écrit par les commerciaux
//   Priority      « Normal » pour les 156
//   Description   VIDE partout
//   ActivityDate  renseignée 153 fois sur 156, d'avril 2026 à mai 2029
//   Owner         5 personnes, toutes retrouvées dans `profils`
//
// DEUX CONSÉQUENCES DIRECTES. Le sous-type ne sert à rien — il dit « Task » là où le sujet dit
// « Call » : classer dessus mettrait les 156 dans « Autre action ». Et `Description` étant vide,
// c'est le SUJET qui porte toute l'information, y compris quand il fait 180 caractères de compte
// rendu (« Très bon échange avec M Nomerange, pas d'ech car traitées en totalité mais ok pour
// mail et rappel sous 1 an… »).
//
// ══ LE CLASSEMENT EST VOLONTAIREMENT PAUVRE ══
//
// Trois types seulement, sur correspondance de MOTS ENTIERS et non de fragments — la leçon de
// l'import Allo, où un `like` trop large a apparié « Dalkia » au compte « LK » :
//
//   APPELER        le sujet parle d'appeler, de rappeler, de recontacter
//   RELANCER       le sujet parle de relancer
//   AUTRE          tout le reste
//
// TOUT LE RESTE VA DANS « AUTRE », ET C'EST DÉLIBÉRÉ. On pourrait deviner davantage — « MAIL ENVOYÉ
// - NRP SUR REL » contient « mail », donc « envoyer un mail » ? Non : c'est le compte rendu d'un mail
// DÉJÀ envoyé. Un classement inventé se lit comme une donnée sûre, et personne ne saurait qu'il a
// été deviné. Le sujet complet reste affiché : le commercial reconnaît son propre texte.
//
// De même, quatre sujets commencent par « PRIO » alors que Salesforce donne « Normal » à tous. On
// garde la priorité par défaut et le mot PRIO dans le titre : deviner une urgence que le champ ne
// porte pas serait écrire dans la base ce que personne n'y a mis.
//
// ══ L'EXPORT ATTENDU ══
//
// Depuis PowerShell — `sf` ne s'appelle pas depuis Git Bash sur ce poste, son chemin contient un
// espace et le shim échoue sur « 'C:\Program' n'est pas reconnu » :
//
//   sf data query --target-org KiweeOrg --json -q "SELECT Id, WhoId, Subject, Description,
//     ActivityDate, CreatedDate, Priority, TaskSubtype, Status, Owner.Name
//     FROM Task WHERE Who.Type = 'Lead' AND Status != 'Completed'" > taches-ouvertes.json
//
// ══ USAGE ══
//
//   node scripts/importer-taches-ouvertes-salesforce.cjs <taches-ouvertes.json>
//   node scripts/importer-taches-ouvertes-salesforce.cjs <taches-ouvertes.json> --appliquer
//
// SANS `--appliquer`, RIEN N'EST ÉCRIT. Exige la migration 20260908100000, qui ajoute
// `actions.source_externe_id` — sans elle, chaque passage créerait 156 doublons de plus dans la
// liste de travail des commerciaux.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.resolve(__dirname, '..')
const FICHIER = process.argv.find((a) => a.endsWith('.json'))
const APPLIQUER = process.argv.includes('--appliquer')

if (!FICHIER) {
  console.error('Usage : node scripts/importer-taches-ouvertes-salesforce.cjs <taches-ouvertes.json> [--appliquer]')
  process.exit(1)
}

function connexionUrl() {
  const chemin = path.join(RACINE, '.env.local')
  if (!fs.existsSync(chemin)) throw new Error('.env.local introuvable : ' + chemin)
  const m = fs.readFileSync(chemin, 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m)
  if (!m) throw new Error('SUPABASE_DB_URL absent de .env.local.')
  return m[1].trim()
}

/** Pannes DNS intermittentes du poste (18/08/2026) : on retente la CONNEXION, jamais l'écriture. */
const ERREURS_RESEAU = ['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED']
async function connecter(url, essais = 5) {
  for (let i = 1; i <= essais; i++) {
    const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
    try {
      await c.connect()
      return c
    } catch (e) {
      await c.end().catch(() => {})
      if (!ERREURS_RESEAU.includes(e.code) || i === essais) throw e
      console.log(`réseau : ${e.code} — nouvelle tentative dans ${i * 2} s`)
      await new Promise((r) => setTimeout(r, i * 2000))
    }
  }
}

/** Sans accents, sans ponctuation, en majuscules — pour comparer des mots et non des octets. */
const normal = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toUpperCase()

/**
 * Le type d'action, d'après les MOTS du sujet.
 *
 * Mots entiers, jamais des fragments : c'est la leçon de l'import Allo du 07/09/2026, où un
 * `like '%LK%'` a apparié « Dalkia » au compte « LK ». Ici, « RELANCE » ne doit pas être trouvé dans
 * un mot qui le contiendrait par hasard.
 */
const MOTS_APPEL = new Set(['CALL', 'APPEL', 'APPELER', 'RAPPELER', 'RECONTACTER', 'CONTACTER', 'TEL'])
const MOTS_RELANCE = new Set(['RELANCE', 'RELANCER', 'RELANCES', 'REL'])

function typePourSujet(sujet) {
  const mots = normal(sujet).split(' ').filter(Boolean)
  // L'APPEL PASSE AVANT LA RELANCE : « relance call » est un appel à passer, et c'est le geste
  // concret. L'inverse rangerait 68 sujets « Call » sous « Relancer le contact ».
  if (mots.some((m) => MOTS_APPEL.has(m))) return 'APPELER'
  if (mots.some((m) => MOTS_RELANCE.has(m))) return 'RELANCER'
  return 'AUTRE'
}

/**
 * Le titre affiché, et le sujet complet quand il ne tient pas dedans.
 *
 * `actions.titre` n'a pas de limite en base, mais un titre de 180 caractères casse la mise en page
 * de la liste de travail. On coupe donc à 120 sur une frontière de mot, et le sujet entier part dans
 * `commentaire` — `Description` étant vide sur les 156, la colonne est libre et rien n'est perdu.
 */
const LONGUEUR_TITRE = 120
function titreEtCommentaire(sujet) {
  const s = (sujet || '').trim() || 'Tâche reprise de Salesforce'
  if (s.length <= LONGUEUR_TITRE) return { titre: s, commentaire: null }
  const coupe = s.slice(0, LONGUEUR_TITRE)
  const espace = coupe.lastIndexOf(' ')
  return { titre: (espace > 60 ? coupe.slice(0, espace) : coupe) + '…', commentaire: s }
}

/**
 * L'échéance, à midi.
 *
 * `ActivityDate` n'a que le jour. Envoyée telle quelle, Postgres la lit à minuit UTC — soit la
 * veille au soir dans un fuseau à l'ouest, et la tâche s'affiche un jour trop tôt. Midi met la
 * journée entière à l'abri du décalage, dans les deux sens. Même précaution que l'import des
 * activités terminées.
 */
function echeance(activityDate) {
  return activityDate ? `${activityDate}T12:00:00Z` : null
}

;(async () => {
  const brut = fs.readFileSync(FICHIER, 'utf8').replace(/^\uFEFF/, '')
  const taches = JSON.parse(brut.slice(brut.indexOf('{'))).result.records
  if (!Array.isArray(taches)) throw new Error('Export illisible : `result.records` attendu.')

  const c = await connecter(connexionUrl())

  // ── Ce que la base sait déjà ────────────────────────────────────────────────────────────────
  const colonne = await c.query(`
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'actions' and column_name = 'source_externe_id'`)
  if (colonne.rowCount === 0) {
    throw new Error('La migration 20260908100000 n’est pas appliquée : `actions.source_externe_id` '
      + 'n’existe pas, et sans elle chaque passage créerait des doublons.\n'
      + '  node scripts/appliquer-migration.cjs 20260908100000')
  }

  const pistes = new Map()
  for (const r of (await c.query(
    `select id, id_salesforce from public.pistes where id_salesforce is not null`)).rows) {
    pistes.set(r.id_salesforce, r.id)
    // L'Id Salesforce existe en 15 et en 18 caractères ; l'import des leads a pu stocker l'une ou
    // l'autre forme, et un export en rend toujours 18.
    pistes.set(String(r.id_salesforce).slice(0, 15), r.id)
  }
  const types = new Map((await c.query('select code, id from public.types_actions')).rows.map((r) => [r.code, r.id]))
  const statuts = new Map((await c.query('select code, id from public.statuts_actions')).rows.map((r) => [r.code, r.id]))
  const profils = new Map((await c.query('select id, prenom, nom from public.profils')).rows
    .map((r) => [normal(`${r.prenom} ${r.nom}`), r.id]))
  const dejaLa = new Set((await c.query(
    `select source_externe_id from public.actions where source_externe_id is not null`)).rows
    .map((r) => r.source_externe_id))

  const statutAFaire = statuts.get('A_FAIRE')
  if (!statutAFaire) throw new Error('Le statut A_FAIRE est absent de `statuts_actions`.')
  for (const code of ['APPELER', 'RELANCER', 'AUTRE']) {
    if (!types.has(code)) throw new Error(`Le type d’action « ${code} » est absent de \`types_actions\`.`)
  }

  // ── TOUS LES CONTRÔLES AVANT LA TRANSACTION ────────────────────────────────────────────────
  //
  // La leçon du 31/08/2026 : `sens` écrit en minuscules a fait refuser 1 010 appels d'un bloc, au
  // milieu de l'écriture. Ce qui peut être vérifié avant de commencer l'est avant de commencer.
  const aEcrire = []
  const sansPiste = []
  const dejaImportees = []
  const sansProprietaire = []

  for (const t of taches) {
    if (dejaLa.has(t.Id)) { dejaImportees.push(t.Id); continue }
    const piste = pistes.get(t.WhoId) ?? pistes.get(String(t.WhoId || '').slice(0, 15))
    if (!piste) { sansPiste.push({ id: t.Id, who: t.WhoId, sujet: t.Subject }); continue }

    const proprietaire = t.Owner && t.Owner.Name ? profils.get(normal(t.Owner.Name)) ?? null : null
    if (t.Owner && t.Owner.Name && !proprietaire) sansProprietaire.push(t.Owner.Name)

    const { titre, commentaire } = titreEtCommentaire(t.Subject)
    aEcrire.push({
      id: t.Id,
      piste,
      type: types.get(typePourSujet(t.Subject)),
      codeType: typePourSujet(t.Subject),
      titre,
      commentaire,
      datePrevue: echeance(t.ActivityDate),
      proprietaire,
    })
  }

  const parType = {}
  for (const e of aEcrire) parType[e.codeType] = (parType[e.codeType] || 0) + 1

  console.log('\n══ CE QUE L’IMPORT FERAIT ══\n')
  console.log(`  tâches lues dans l’export : ${taches.length}`)
  console.log(`  déjà importées            : ${dejaImportees.length}`)
  console.log(`  à écrire                  : ${aEcrire.length}  ${JSON.stringify(parType)}`)
  console.log(`  sans piste retrouvée      : ${sansPiste.length}`)
  console.log(`  sans échéance             : ${aEcrire.filter((e) => !e.datePrevue).length}`)
  console.log(`  pistes qui gagneront du travail à faire : ${new Set(aEcrire.map((e) => e.piste)).size}`)

  if (sansPiste.length > 0) {
    // ON NE LES AVALE PAS EN SILENCE. Ce sont des leads Salesforce que l'import du 01/09 n'a pas
    // fait entrer : leur travail à faire est perdu tant qu'ils n'existent pas comme pistes.
    console.log('\n  ── Ces tâches n’ont pas de piste correspondante ──')
    console.log('     Leur lead n’est pas dans Kimatch. À reprendre avec `importer-leads-salesforce`.')
    for (const s of sansPiste.slice(0, 8)) {
      console.log(`     ${s.who}  ${(s.sujet || '').slice(0, 50)}`)
    }
    if (sansPiste.length > 8) console.log(`     … et ${sansPiste.length - 8} autres`)
  }
  if (sansProprietaire.length > 0) {
    console.log(`\n  ── ${new Set(sansProprietaire).size} propriétaire(s) Salesforce sans profil Kimatch ──`)
    console.log(`     ${[...new Set(sansProprietaire)].join(', ')}`)
    console.log('     Leurs tâches sont importées sans responsable, pas écartées.')
  }

  if (!APPLIQUER) {
    console.log('\n  Simulation seule. Relancer avec --appliquer pour écrire.\n')
    await c.end()
    return
  }

  if (aEcrire.length === 0) {
    // L'ARRÊT PRÉCOCE NE REGARDE QUE CE QU'IL Y A À ÉCRIRE, et le dit. La version de l'import Allo
    // annonçait « rien à insérer » alors que 3 897 appels attendaient une autre file.
    console.log('\n  Rien de nouveau à écrire : les tâches de cet export sont déjà toutes en base.\n')
    await c.end()
    return
  }

  await c.query('begin')
  try {
    // SIGNER LA SESSION, par précaution et non pour réparer quoi que ce soit.
    //
    // J'avais écrit ici que ce réglage évitait « Auteur inconnu » sur 156 lignes d'historique.
    // C'ÉTAIT FAUX, et la vérification après l'import du 08/09/2026 l'a montré : `fn_audit_trace`
    // n'écrit dans `historique_modifications` que sur UPDATE, jamais sur INSERT. L'import a donc
    // créé 0 ligne d'historique — mesuré, pas supposé.
    //
    // Le réglage reste, parce qu'il ne coûte rien et qu'il sert dès qu'une écriture de ce script
    // deviendrait une modification (une reprise qui mettrait à jour une action existante, par
    // exemple). Mais il ne faut pas lui prêter un effet qu'il n'a pas.
    await c.query('select set_config($1, $2, false)', ['kimatch.origine', 'import Salesforce — tâches ouvertes'])

    for (const e of aEcrire) {
      await c.query(
        `insert into public.actions
           (type_action_id, statut_id, titre, commentaire, date_prevue, piste_id,
            responsable_profil_id, proprietaire_id, source_externe_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (source_externe_id) where source_externe_id is not null do nothing`,
        [e.type, statutAFaire, e.titre, e.commentaire, e.datePrevue, e.piste,
          e.proprietaire, e.proprietaire, e.id])
    }

    const controle = await c.query(`
      select count(*) filter (where source_externe_id is not null)::int as importees,
             count(*) filter (where source_externe_id is not null and piste_id is null)::int as sans_piste,
             count(*) filter (where source_externe_id is not null and titre is null)::int as sans_titre
        from public.actions`)
    const k = controle.rows[0]
    if (k.sans_piste > 0 || k.sans_titre > 0) {
      throw new Error(`${k.sans_piste} action(s) importée(s) sans piste et ${k.sans_titre} sans titre.`)
    }

    await c.query('commit')
    console.log(`\n✓ ${aEcrire.length} tâche(s) écrite(s) dans les actions.`)
    console.log(`  ${k.importees} action(s) portent désormais une origine Salesforce.`)
    console.log('  Retour arrière : delete from actions where source_externe_id is not null.')
  } catch (err) {
    await c.query('rollback')
    console.error('\n✗ Rien n’a été écrit : ' + err.message)
    process.exitCode = 1
    await c.end()
    return
  }

  // ── ANALYZE APRÈS L'INSERTION ──────────────────────────────────────────────────────────────
  //
  // L'arrêt du 07/09/2026 : 10 539 lignes ajoutées à `interactions` sans réanalyse, et vingt minutes
  // plus tard toute l'équipe était bloquée sur « Chargement… ». 156 lignes ne referont pas ça, mais
  // la règle ne se négocie pas au cas par cas — c'est ainsi qu'on l'oublie le jour où elle compte.
  // Hors transaction : `analyze` prend ses propres verrous légers.
  process.stdout.write('\n  analyze actions… ')
  const debut = Date.now()
  await c.query('analyze public.actions')
  console.log(`${Math.round((Date.now() - debut) / 1000)} s`)

  console.log('\n  Où les voir : fiche piste → panneau « Activité · piste ».\n')
  await c.end()
})().catch((e) => {
  console.error('\n' + e.message + '\n')
  process.exit(1)
})
