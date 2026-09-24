// ════════════════════════════════════════════════════════════════════════════════════════════════
// QUI A CRÉÉ CE CHAMP, ET QUAND
//
// William, 14/09/2026 : « qui a créé le champ, quand a-t-il été créé ».
//
// ══ POSTGRES NE LE SAIT PAS, ET AUCUNE REQUÊTE NE L'APPRENDRA ══════════════════════════════════
//
// Le catalogue système ne date pas les colonnes. Il n'existe ni `created_at` sur `pg_attribute`, ni
// journal des DDL sur cette instance. Poser la question à la base rend un silence — la réponse est
// dans le DÉPÔT, pas dans le serveur, et il faut donc la reconstituer par archéologie.
//
// ══ TROIS SOURCES, DE LA PLUS SÛRE À LA PLUS FAIBLE, ET CHACUNE EST NOMMÉE DANS LA SORTIE ══════
//
//   ① LA MIGRATION QUI L'A CRÉÉE            `add column`, ou le corps d'un `create table`. Le
//      → « migration »                       fichier est daté, son commit donne l'auteur, et son
//                                            en-tête donne souvent le DEMANDEUR, qui est la vraie
//                                            réponse à « qui » : 801 commits sur 830 sont signés
//                                            Naoëlle, donc l'auteur git seul ne distingue rien.
//
//   ② LA PREMIÈRE TRACE DANS LE DÉPÔT       Pour les ~1 900 colonnes antérieures au suivi des
//      → « première trace »                  migrations. Le commit où le nom apparaît pour la
//                                            première fois dans un diff borne la date par le HAUT :
//                                            la colonne existait AU PLUS TARD ce jour-là.
//
//   ③ RIEN                                  Le socle repris de Salesforce, créé dans l'interface
//      → « socle initial »                   Supabase avant le dépôt. Écrire « inconnu » est la
//                                            seule réponse honnête, et elle vaut mieux que la date
//                                            du premier commit, qui aurait l'air d'un fait.
//
// `20260802174957_remote_schema.sql` ne fait que 39 lignes : le schéma d'origine n'a JAMAIS été
// déposé. C'est ce qui rend ③ inévitable, et c'est pour ça qu'il est nommé plutôt que masqué.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const RACINE = path.resolve(__dirname, '..')
const MIGRATIONS = path.join(RACINE, 'supabase', 'migrations')

/* HUIT MÉGAOCTETS NE SUFFISENT PLUS — 24/09/2026. `git log` de ce dépôt dépasse désormais cette
 * taille, et `execFileSync` échoue alors sur ENOBUFS : un message obscur, qui laissait croire à une
 * panne de la carte alors que le schéma allait très bien. On passe à 64 Mo — assez loin pour que la
 * question ne revienne pas avant longtemps. */
const git = (args, maxBuffer = 64 * 1024 * 1024) =>
  execFileSync('git', args, { cwd: RACINE, encoding: 'utf8', maxBuffer })

/** Le SQL sans ses commentaires. Ce dépôt commente en citant du SQL : les lire serait s'inventer des colonnes. */
function sansCommentairesSql(texte) {
  return texte
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
}

/** Le contenu de la parenthèse ouverte en `i`, parenthèses imbriquées comprises. `numeric(10,2)` y survit. */
function corpsParenthese(texte, i) {
  let p = 0
  for (let j = i; j < texte.length; j++) {
    if (texte[j] === '(') p++
    else if (texte[j] === ')') {
      p--
      if (p === 0) return texte.slice(i + 1, j)
    }
  }
  return null
}

/** Découpe une liste SQL sur les virgules de premier niveau. */
function decouper(texte) {
  const sortie = []
  let p = 0
  let courant = ''
  for (const c of texte) {
    if (c === '(') p++
    if (c === ')') p--
    if (c === ',' && p === 0) {
      sortie.push(courant)
      courant = ''
    } else courant += c
  }
  if (courant.trim()) sortie.push(courant)
  return sortie
}

const MOTS_NON_COLONNE = /^(constraint|primary|unique|check|foreign|exclude|like|partition)\b/i
const denom = (s) => (s || '').replace(/"/g, '').replace(/^public\./, '').trim().toLowerCase()

/**
 * Les colonnes créées par un fichier de migration, et celles qu'il supprime ou renomme.
 *
 * @returns {{creees: Array<[string, string]>, supprimees: Array<[string,string]>, renommees: Array}}
 */
function ddlDuFichier(sql) {
  const texte = sansCommentairesSql(sql)
  const creees = []
  const supprimees = []
  const renommees = []

  // create table … ( … )
  const reCreate = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)\s*\(/gi
  let m
  while ((m = reCreate.exec(texte))) {
    const table = denom(m[1])
    const corps = corpsParenthese(texte, texte.indexOf('(', m.index + m[0].length - 1))
    if (!corps) continue
    for (const morceau of decouper(corps)) {
      const t = morceau.trim()
      if (!t || MOTS_NON_COLONNE.test(t)) continue
      const nom = (t.match(/^"?([a-z_][a-z0-9_]*)"?/i) || [])[1]
      if (nom) creees.push([table, nom.toLowerCase()])
    }
  }

  /* UN `alter table` PORTE PLUSIEURS ACTIONS SÉPARÉES PAR DES VIRGULES. `add column a …, add column
     b …` est la forme courante ici : ne lire que la première en perdrait la moitié. On repart donc
     du nom de table puis on balaie toutes les actions jusqu'au point-virgule. */
  const reAlter = /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([a-z0-9_."]+)([\s\S]*?);/gi
  while ((m = reAlter.exec(texte))) {
    const table = denom(m[1])
    const corps = m[2]
    for (const a of corps.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      creees.push([table, a[1].toLowerCase()])
    }
    for (const a of corps.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      supprimees.push([table, a[1].toLowerCase()])
    }
    for (const a of corps.matchAll(/rename\s+column\s+"?([a-z_][a-z0-9_]*)"?\s+to\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
      renommees.push([table, a[1].toLowerCase(), a[2].toLowerCase()])
      creees.push([table, a[2].toLowerCase()])
    }
  }
  return { creees, supprimees, renommees }
}

/**
 * LE DEMANDEUR, PAS L'AUTEUR DU COMMIT.
 *
 * Les migrations de ce dépôt s'ouvrent sur la raison, et la raison porte un nom : « William,
 * 14/09/2026 : « j'ai l'impression que le champ typologie… » ». C'est cette personne-là qui a décidé
 * du champ. L'auteur git, lui, est Naoëlle dans 801 commits sur 830 — le renseigner seul reviendrait
 * à écrire la même réponse partout, c'est-à-dire à ne rien répondre.
 *
 * On ne lit que l'EN-TÊTE (les 60 premières lignes) : plus bas, un nom cité appartient au récit
 * — « Naoëlle applique elle-même les migrations » — et non à la demande.
 */
function demandeurDuFichier(sql) {
  const entete = sql.split('\n').slice(0, 60).join('\n')
  const noms = new Set()
  for (const m of entete.matchAll(/--\s*([A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+)?)\s*,\s*(?:le\s+)?\d{2}\/\d{2}/g)) {
    noms.add(m[1].trim())
  }
  for (const m of entete.matchAll(/--.*\bdemand[ée]\s+par\s+([A-ZÀ-Ý][a-zà-ÿ]+)/gi)) noms.add(m[1].trim())
  return [...noms].join(', ')
}

/** Le commit qui a introduit chaque fichier de migration : date, auteur, sujet. Une seule commande. */
function commitsDesMigrations() {
  const brut = git([
    'log', '--reverse', '--diff-filter=A', '--name-only', '--date=short',
    '--format=@@@%H|%ad|%an|%s', '--', 'supabase/migrations',
  ])
  const parFichier = new Map()
  let courant = null
  for (const ligne of brut.split('\n')) {
    if (ligne.startsWith('@@@')) {
      const [hash, date, auteur, ...sujet] = ligne.slice(3).split('|')
      courant = { hash, date, auteur, sujet: sujet.join('|') }
      continue
    }
    const f = ligne.trim()
    if (f && courant && !parFichier.has(f)) parFichier.set(f, courant)
  }
  return parFichier
}

/**
 * LA PREMIÈRE FOIS QUE CHAQUE NOM DE COLONNE APPARAÎT DANS LE DÉPÔT.
 *
 * Un seul `git log -p` sur tout l'historique — 27 Mo, moins d'une seconde — plutôt que 2 158
 * `git log -S` (une commande par colonne, plusieurs minutes). On ne lit que les lignes AJOUTÉES :
 * une ligne supprimée ne crée rien.
 *
 * DEUX PRÉCISIONS DIFFÉRENTES SONT TENUES SÉPARÉMENT, parce qu'elles ne valent pas la même chose :
 *   · `table.colonne` cités sur la MÊME ligne ajoutée — un `create table` ou un `select` — c'est le
 *     bon couple, sans ambiguïté ;
 *   · le nom de colonne seul — `date_debut` existe sur onze tables, la date obtenue est celle de la
 *     PREMIÈRE d'entre elles. C'est une borne, pas une date de création, et la sortie le dit.
 */
function premieresTraces(colonnesParTable) {
  const brut = git(
    ['log', '--reverse', '-p', '-U0', '--date=short', '--format=@@@%H|%ad|%an|%s', '--', 'src', 'api', 'supabase'],
    64 * 1024 * 1024,
  )
  const exact = new Map()
  const large = new Map()
  const tables = [...colonnesParTable.keys()]
  const colonnesConnues = new Set()
  for (const cols of colonnesParTable.values()) for (const c of cols) colonnesConnues.add(c)

  let commit = null
  for (const ligne of brut.split('\n')) {
    if (ligne.startsWith('@@@')) {
      const [hash, date, auteur, ...sujet] = ligne.slice(3).split('|')
      commit = { hash, date, auteur, sujet: sujet.join('|') }
      continue
    }
    if (!commit || ligne[0] !== '+' || ligne.startsWith('+++')) continue
    const contenu = ligne.slice(1)
    const mots = contenu.match(/[a-z_][a-z0-9_]{2,}/g)
    if (!mots) continue
    const presents = new Set(mots)
    for (const mot of presents) {
      if (!colonnesConnues.has(mot)) continue
      if (!large.has(mot)) large.set(mot, commit)
    }
    // Le couple exact : la table est nommée sur la même ligne que la colonne.
    for (const table of tables) {
      if (!presents.has(table)) continue
      for (const col of colonnesParTable.get(table)) {
        if (!presents.has(col)) continue
        const cle = `${table}.${col}`
        if (!exact.has(cle)) exact.set(cle, commit)
      }
    }
  }
  return { exact, large }
}

/**
 * L'histoire de chaque colonne.
 *
 * @param {Map<string, Set<string>>} colonnesParTable  le schéma vivant : table → noms de colonnes
 * @returns {{histoire: Map<string, object>, disparues: Array, migrations: number}}
 */
function lireHistoire(colonnesParTable) {
  const histoire = new Map()
  const commits = commitsDesMigrations()
  const fichiers = fs.existsSync(MIGRATIONS) ? fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort() : []

  /* LE PREMIER FICHIER QUI CRÉE UNE COLONNE GAGNE, et l'ordre des noms de fichier est l'ordre
     chronologique d'application (préfixe `AAAAMMJJHHMMSS`). Une colonne supprimée puis recréée plus
     tard porte donc sa PREMIÈRE création : c'est discutable, et c'est pourquoi la recréation est
     enregistrée à part, dans `recreee`. */
  const disparues = []
  for (const f of fichiers) {
    const chemin = path.join(MIGRATIONS, f)
    const sql = fs.readFileSync(chemin, 'utf8')
    const { creees, supprimees, renommees } = ddlDuFichier(sql)
    const commit = commits.get('supabase/migrations/' + f) ?? null
    const demandeur = demandeurDuFichier(sql)

    for (const [table, colonne] of creees) {
      const cle = `${table}.${colonne}`
      if (histoire.has(cle)) {
        histoire.get(cle).recreee = f
        continue
      }
      histoire.set(cle, {
        source: 'migration',
        migration: f,
        date: commit ? commit.date : f.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
        auteurGit: commit ? commit.auteur : '',
        demandeur,
        commit: commit ? commit.hash.slice(0, 7) : '',
        sujet: commit ? commit.sujet : '',
      })
    }
    for (const [table, colonne] of supprimees) disparues.push({ table, colonne, migration: f, genre: 'supprimée' })
    for (const [table, ancien, nouveau] of renommees) {
      disparues.push({ table, colonne: ancien, migration: f, genre: 'renommée en ' + nouveau })
    }
  }

  // ── ② ET ③ : ce que les migrations ne savent pas ──────────────────────────────────────────────
  const restantes = []
  for (const [table, cols] of colonnesParTable) {
    for (const col of cols) if (!histoire.has(`${table}.${col}`)) restantes.push([table, col])
  }

  if (restantes.length) {
    const { exact, large } = premieresTraces(colonnesParTable)
    /* LE PREMIER COMMIT DU DÉPÔT N'EST PAS UNE DATE DE CRÉATION. Tout ce que le socle repris de
       Salesforce contient apparaît forcément dans les tout premiers commits — dire « créé le
       17/07/2026 » serait inventer une précision. Ces colonnes sont donc rendues au socle. */
    /* LE COMMIT RACINE SE DEMANDE PAR `--max-parents=0`, PAS PAR `--reverse --max-count=1`.
       Git applique la limite AVANT l'inversion : `--reverse -n 1` rend donc le commit le plus
       RÉCENT. Avec cette date-là, `trace.date > premierCommit` était faux partout et les 1 594
       colonnes concernées tombaient toutes dans « socle initial » — la carte annonçait zéro date
       déduite alors que le balayage en avait trouvé des centaines. Une erreur silencieuse : la
       colonne se remplissait, avec la mauvaise réponse. */
    const premierCommit = git(['log', '--max-parents=0', '--date=short', '--format=%ad']).trim().split('\n').pop()
    for (const [table, col] of restantes) {
      const cle = `${table}.${col}`
      /* LA PLUS ANCIENNE DES DEUX TRACES GAGNE, et non la plus précise. On cherche une BORNE
         HAUTE — « la colonne existait au plus tard ce jour-là » — donc la plus vieille preuve est
         la meilleure. Préférer systématiquement le couple exact donnait `comptes.reference` créée
         le 15/08 parce que c'est la première fois que `comptes` et `reference` se croisent sur une
         même ligne ; le nom, lui, est là depuis le premier commit. La colonne datait d'un mois de
         trop, ce qui est exactement l'erreur qu'une borne haute ne doit pas commettre. */
      const candidats = [exact.get(cle), large.get(col)].filter(Boolean)
      const trace = candidats.sort((a, b) => a.date.localeCompare(b.date))[0]
      if (trace && trace.date > premierCommit) {
        histoire.set(cle, {
          source: trace === exact.get(cle) ? 'première trace' : 'première trace (nom seul)',
          migration: '',
          date: trace.date,
          auteurGit: trace.auteur,
          demandeur: '',
          commit: trace.hash.slice(0, 7),
          sujet: trace.sujet,
        })
      } else {
        histoire.set(cle, {
          source: 'socle initial',
          migration: '',
          date: '',
          auteurGit: '',
          demandeur: '',
          commit: '',
          sujet: '',
        })
      }
    }
  }

  return { histoire, disparues, migrations: fichiers.length }
}

/** Ce que la feuille affiche dans « Créé par » : le demandeur d'abord, l'auteur git ensuite. */
function creePar(h) {
  if (!h) return ''
  if (h.source === 'socle initial') return 'inconnu — socle repris de Salesforce'
  if (h.demandeur) return `${h.demandeur} (demande) · ${h.auteurGit} (mise en œuvre)`
  return h.auteurGit || ''
}

/** Ce que la feuille affiche dans « D'où on le sait ». Le degré de certitude, dit en clair. */
function provenance(h) {
  if (!h) return ''
  if (h.source === 'migration') return `migration ${h.migration}${h.commit ? ' · commit ' + h.commit : ''}`
  if (h.source === 'première trace') return `au plus tard à ce commit (${h.commit}) — antérieur au suivi des migrations`
  if (h.source === 'première trace (nom seul)') {
    return `borne haute, déduite du nom seul (commit ${h.commit}) — le nom existe sur plusieurs tables`
  }
  return 'antérieur au dépôt — créé dans Supabase au moment de la reprise Salesforce'
}

module.exports = { lireHistoire, creePar, provenance, ddlDuFichier, demandeurDuFichier }
