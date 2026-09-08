// ════════════════════════════════════════════════════════════════════════════════════════════════
// LA CARTE DES DONNÉES : QUELLE TABLE, QUELLE COLONNE, LUE OU ÉCRITE, ET PAR QUEL ÉCRAN
//
// William, 08/09/2026, rapporté par Naoëlle : « il veut voir les tables et colonnes utilisées et où
// dans notre app. »
//
// ── POURQUOI CE SCRIPT PLUTÔT QU'UN OUTIL DU MARCHÉ ──
//
// Supabase Studio, dbdiagram, Azimutt, SchemaSpy, DBeaver savent tous lire un schéma. Aucun ne sait
// rien de notre application : le lien « cette colonne est lue par la fiche contrat » n'existe que
// dans notre code. Il n'y a donc rien à installer, il faut le dériver.
//
// ── POURQUOI IL NE TOURNE PAS DANS L'APP ──
//
// Naoëlle : « afin de ne pas ralentir l'app ». Il ne s'exécute jamais dans le navigateur : c'est une
// commande, lancée quand on veut, qui écrit des fichiers. L'application n'en sait rien.
//
// ── CE QU'IL SAIT FAIRE, ET CE QU'IL NE SAIT PAS ──
//
// Il lit le schéma vivant (144 tables, 2 071 colonnes le 08/09/2026), analyse les 371 appels
// `.from()` du code, et croise les deux. La lecture ET l'écriture sont distinguées : un `.select()`
// donne les colonnes lues, un `.insert()` ou `.update()` les colonnes écrites — savoir qu'une
// colonne n'est JAMAIS écrite par l'app dit qu'elle vient d'un import ou d'une migration.
//
// SES ANGLES MORTS SONT ÉCRITS DANS LE RAPPORT, pas masqués. Une requête en `select('*')` révèle la
// table sans révéler les colonnes utilisées ; une fonction RPC et une vue cachent leurs colonnes
// dans du SQL. Ces cas sont comptés et listés, pour qu'on sache où la carte est muette plutôt que
// de la croire complète.
//
// ── USAGE ──
//
//   node scripts/cartographier-donnees.cjs                 écrit les fichiers dans carte-donnees/
//   node scripts/cartographier-donnees.cjs --verifier      ne rien écrire, sortir 1 si incohérence
//
// `--verifier` sert de garde-fou : il échoue si le code lit une colonne qui n'existe plus en base.
// C'est ce qui transforme la carte en test — une migration qui renomme une colonne sans toucher au
// code se voit ici, avant de casser un écran.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const { pageCarte } = require('./carte-page.cjs')

const RACINE = path.resolve(__dirname, '..')
const SORTIE = path.join(RACINE, 'carte-donnees')

// ── LA BASE ─────────────────────────────────────────────────────────────────────────────────────

const RETRY = ['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED']

async function connecter(essais = 5) {
  const env = fs.readFileSync(path.join(RACINE, '.env.local'), 'utf8')
  const url = (env.match(/^SUPABASE_DB_URL=(.+)$/m) || [])[1]
  if (!url) throw new Error('SUPABASE_DB_URL absente de .env.local')
  for (let i = 1; i <= essais; i++) {
    const client = new Client({ connectionString: url.trim(), ssl: { rejectUnauthorized: false } })
    try {
      await client.connect()
      return client
    } catch (e) {
      await client.end().catch(() => {})
      if (!RETRY.includes(e.code) || i === essais) throw e
      await new Promise((r) => setTimeout(r, i * 2000))
    }
  }
}

async function lireSchema(client) {
  const colonnes = await client.query(`
    select c.table_name, c.column_name, c.data_type, c.is_nullable,
           t.table_type
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
     order by c.table_name, c.ordinal_position`)

  const tables = new Map()
  for (const r of colonnes.rows) {
    if (!tables.has(r.table_name)) {
      tables.set(r.table_name, { nom: r.table_name, vue: r.table_type === 'VIEW', colonnes: [] })
    }
    tables.get(r.table_name).colonnes.push({
      nom: r.column_name,
      type: r.data_type,
      obligatoire: r.is_nullable === 'NO',
    })
  }

  // Le volume réel : une table que la production ne lit jamais mérite d'être vue à côté du code.
  const stats = await client.query(`
    select relname, n_live_tup, seq_scan, coalesce(idx_scan, 0) as idx_scan
      from pg_stat_user_tables`)
  for (const r of stats.rows) {
    const t = tables.get(r.relname)
    if (t) {
      t.lignes = Number(r.n_live_tup)
      t.lectures = Number(r.seq_scan) + Number(r.idx_scan)
    }
  }

  return tables
}

// ── LE CODE ─────────────────────────────────────────────────────────────────────────────────────

/** Tous les fichiers TypeScript de l'application, chemins relatifs à la racine. */
function fichiers(dossier, acc = []) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '__tests__') continue
      fichiers(p, acc)
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      acc.push(path.relative(RACINE, p).split(path.sep).join('/'))
    }
  }
  return acc
}

/**
 * ══ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE ANALYSE ═════════════════════════════════════════
 *
 * Deux raisons, et les deux ont été constatées sur ce dépôt plutôt que supposées.
 *
 * ① UNE APOSTROPHE DE FRANÇAIS OUVRE UNE FAUSSE CHAÎNE. `fetchContrats` porte, ENTRE ses arguments,
 *   le commentaire « `*` plutôt qu'une liste de colonnes fixe ». Le `'` de « qu'une » faisait croire
 *   au découpeur qu'une chaîne commençait là et se fermait dans « d'être » deux lignes plus bas :
 *   l'argument suivant devenait illisible, et la table `contrats` — la plus lue de l'application —
 *   ressortait sans aucune colonne. C'est ce qui a fait dire à la carte que
 *   `contrats.docusign_envelope_id` n'était lue que par deux routes d'API, alors que la fiche
 *   contrat l'affiche.
 *
 * ② UN COMMENTAIRE QUI CITE DU CODE CRÉERAIT UNE FAUSSE ENTRÉE. Ce dépôt commente beaucoup, et en
 *   citant : « voir `.from('mandats')` » suffirait à inscrire une lecture qui n'existe pas. Une
 *   carte qui invente est pire qu'une carte incomplète, parce que rien ne la contredit.
 *
 * Les chaînes, elles, sont préservées telles quelles : `'// pas un commentaire'` reste une chaîne.
 */
function sansCommentaires(texte) {
  let sortie = ''
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (c === "'" || c === '"' || c === '`') {
      const l = litteral(texte, i)
      if (l) {
        sortie += texte.slice(i, l.fin)
        i = l.fin - 1
        continue
      }
    }
    if (c === '/' && texte[i + 1] === '/') {
      const fin = texte.indexOf('\n', i)
      i = fin === -1 ? texte.length : fin - 1
      continue
    }
    if (c === '/' && texte[i + 1] === '*') {
      const fin = texte.indexOf('*/', i + 2)
      i = fin === -1 ? texte.length : fin + 1
      continue
    }
    sortie += c
  }
  return sortie
}

/**
 * DÉCOUPER UNE LISTE PostgREST AU PREMIER NIVEAU.
 *
 * « id, nom, compte:comptes(nom, ville) » rend trois morceaux et non quatre : la virgule à
 * l'intérieur des parenthèses appartient à la relation. Un `split(',')` naïf attribuerait `ville` à
 * la table de départ — c'est l'erreur qui rendrait toute la carte fausse sans qu'on le voie.
 */
function decouperNiveau1(texte) {
  const morceaux = []
  let profondeur = 0
  let courant = ''
  for (const c of texte) {
    if (c === '(') profondeur++
    if (c === ')') profondeur--
    if (c === ',' && profondeur === 0) {
      morceaux.push(courant)
      courant = ''
    } else {
      courant += c
    }
  }
  if (courant.trim()) morceaux.push(courant)
  return morceaux.map((m) => m.trim()).filter(Boolean)
}

/**
 * Les colonnes d'une chaîne de `select`, table par table.
 *
 * Rend une liste de `{ table, colonne }`. `table` vaut `null` pour la table de départ — l'appelant
 * la connaît. Les relations imbriquées portent leur propre nom de table :
 *
 *   'fournisseur:comptes!contrats_fournisseur_compte_id_fkey(nom)'  →  { table: 'comptes', colonne: 'nom' }
 *
 * L'indication de clé étrangère après `!` est du routage PostgREST, pas une colonne : on la jette.
 */
function colonnesDuSelect(chaine, tableDeBase) {
  const trouvees = []
  for (const morceau of decouperNiveau1(chaine)) {
    const ouvre = morceau.indexOf('(')
    if (ouvre === -1) {
      /* L'ÉTOILE N'EST PAS UNE COLONNE, y compris à l'intérieur d'une relation. Elle apparaît là
         aussi : `comptes_fournisseurs(*, contact_commercial:contacts(prenom, nom))`. Le contrôle de
         cohérence l'a signalée comme « colonne absente de la table » — il avait raison, et c'est
         exactement à ça qu'il sert. La table est bien lue en entier : c'est `toutesColonnes` qui le
         porte, renseigné par l'appelant. */
      if (morceau === '*') {
        if (tableDeBase) trouvees.push({ table: tableDeBase, colonne: '*' })
        continue
      }
      // Une colonne simple, éventuellement renommée : « prix:prix_mwh » lit `prix_mwh`.
      const nom = morceau.includes(':') ? morceau.split(':').pop().trim() : morceau
      const propre = nom.replace(/[!].*$/, '').trim()
      if (propre) trouvees.push({ table: tableDeBase, colonne: propre })
      continue
    }
    // Une relation : à gauche la cible, à l'intérieur ses colonnes.
    const gauche = morceau.slice(0, ouvre).trim()
    const dedans = morceau.slice(ouvre + 1, morceau.lastIndexOf(')'))
    const cible = (gauche.includes(':') ? gauche.split(':').pop() : gauche).split('!')[0].trim()
    // Le compteur d'agrégat `...(count)` n'est pas une colonne.
    if (cible) trouvees.push(...colonnesDuSelect(dedans, cible))
  }
  return trouvees
}

/** Le littéral de chaîne qui commence à `i` (sur le guillemet), ou null. */
function litteral(texte, i) {
  const q = texte[i]
  if (q !== "'" && q !== '"' && q !== '`') return null
  let j = i + 1
  let valeur = ''
  while (j < texte.length) {
    if (texte[j] === '\\') {
      valeur += texte[j + 1]
      j += 2
      continue
    }
    if (texte[j] === q) return { valeur, fin: j + 1 }
    valeur += texte[j]
    j++
  }
  return null
}

/** Les clés de premier niveau de l'objet littéral qui commence à `i` (sur `{`), ou null. */
function clesObjet(texte, i) {
  if (texte[i] !== '{') return null
  let profondeur = 0
  let j = i
  for (; j < texte.length; j++) {
    if (texte[j] === '{') profondeur++
    else if (texte[j] === '}') {
      profondeur--
      if (profondeur === 0) break
    }
  }
  if (profondeur !== 0) return null
  const corps = texte.slice(i + 1, j)
  const cles = []
  for (const morceau of decouperNiveauObjet(corps)) {
    const m = morceau.match(/^\s*(?:\.\.\.)?\s*([a-z_][a-z0-9_]*)\s*:/i)
    if (m) cles.push(m[1])
    else {
      // Forme abrégée `{ compte_id }` : la clé est le nom de la variable.
      const abrege = morceau.match(/^\s*([a-z_][a-z0-9_]*)\s*$/i)
      if (abrege) cles.push(abrege[1])
    }
  }
  return cles
}

/** Comme `decouperNiveau1`, mais en tenant compte des accolades, crochets et chaînes. */
function decouperNiveauObjet(texte) {
  const morceaux = []
  let p = 0
  let courant = ''
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (c === "'" || c === '"' || c === '`') {
      const l = litteral(texte, i)
      if (l) {
        courant += texte.slice(i, l.fin)
        i = l.fin - 1
        continue
      }
    }
    if ('({['.includes(c)) p++
    if (')}]'.includes(c)) p--
    if (c === ',' && p === 0) {
      morceaux.push(courant)
      courant = ''
    } else courant += c
  }
  if (courant.trim()) morceaux.push(courant)
  return morceaux
}

const OPERATIONS = ['select', 'insert', 'upsert', 'update', 'delete']

/**
 * ══ LE NOM DE TABLE NE PASSE PAS TOUJOURS PAR `.from()` ═══════════════════════════════════════
 *
 * Découvert en confrontant la première carte à un fait connu : `contrats.docusign_envelope_id`
 * apparaissait comme lue par les seules routes d'API, alors que la fiche contrat l'affiche. La
 * cause n'était pas l'analyse du `select` mais le fait que `fetchContrats` n'appelle pas `.from()` —
 * il passe par `fetchAllRows('contrats', '*')`, un enrobage de pagination. 68 requêtes empruntent
 * ce chemin, invisibles à une recherche de `.from(`.
 *
 * Chaque enrobage déclare donc où lire son nom de table et, s'il en prend une, sa chaîne de select.
 * Un enrobage ajouté demain sans être inscrit ici retombera dans les angles morts, pas dans le
 * silence : le rapport compare le nombre de requêtes vues au nombre d'appels trouvés.
 */
const ENROBAGES = [
  { nom: 'fetchAllRows', table: 0, select: 1, operation: 'lecture' },
  { nom: 'fetchReferenceTable', table: 0, select: null, operation: 'lecture' },
  { nom: 'compter', table: 0, select: null, operation: 'lecture' },
  { nom: 'truncateTable', table: 1, select: null, operation: 'suppression' },
  { nom: 'insertTable', table: 2, select: null, operation: 'ecriture' },
]

/** Les arguments littéraux d'un appel commençant à la parenthèse `i`, `null` pour les non-littéraux. */
function argumentsLitteraux(texte, i) {
  if (texte[i] !== '(') return null
  let p = 0
  let j = i
  for (; j < texte.length; j++) {
    if (texte[j] === '(') p++
    else if (texte[j] === ')') {
      p--
      if (p === 0) break
    }
  }
  if (p !== 0) return null
  return decouperNiveauObjet(texte.slice(i + 1, j)).map((a) => {
    const t = a.trim()
    const l = litteral(t, 0)
    return l && l.fin === t.length ? l.valeur : null
  })
}

/** Les accès passant par un enrobage déclaré. */
function accesParEnrobage(texte) {
  const acces = []
  for (const e of ENROBAGES) {
    // `fetchAllRows<RawContrat>(` autant que `fetchAllRows(` : le paramètre de type est facultatif.
    const re = new RegExp(String.raw`\b${e.nom}\s*(?:<[^>(]*>)?\s*\(`, 'g')
    let m
    while ((m = re.exec(texte))) {
      if (/(?:function|const|let)\s+$/.test(texte.slice(Math.max(0, m.index - 20), m.index))) continue
      const args = argumentsLitteraux(texte, m.index + m[0].length - 1)
      const table = args && args[e.table]
      if (!table || !/^[a-z_][a-z0-9_]*$/.test(table)) continue
      const chaine = e.select != null && args[e.select] ? args[e.select].trim() : null
      if (!chaine) {
        acces.push({ table, operation: e.operation, colonnes: [], etoile: true })
      } else if (chaine === '*' || chaine.startsWith('*')) {
        const reste = chaine.replace(/^\*\s*,?\s*/, '')
        acces.push({ table, operation: e.operation, etoile: true, colonnes: reste ? colonnesDuSelect(reste, null) : [] })
      } else {
        acces.push({ table, operation: e.operation, etoile: false, colonnes: colonnesDuSelect(chaine, null) })
      }
    }
  }
  return acces
}

/**
 * Les accès aux données d'un fichier.
 *
 * On part de chaque `.from('table')` et on cherche la PREMIÈRE opération qui suit, avant le
 * prochain `.from(`. C'est une heuristique, et elle tient parce que le client Supabase impose cet
 * ordre : `.from()` puis l'opération. Les cas qu'elle rate sont comptés, pas devinés.
 */
function accesDuFichier(texte, constantes) {
  const acces = []
  const re = /\.from\((['"`])([a-z_][a-z0-9_]*)\1\)/g
  let m
  while ((m = re.exec(texte))) {
    /* `supabase.storage.from('avatars')` N'EST PAS UNE TABLE. Le client de stockage porte la même
       méthode que le client de base : la carte inscrivait donc `avatars` et `documents` — deux
       compartiments de fichiers — parmi les tables, en les signalant comme « opération non
       identifiée » puisqu'aucun `select` ne suit. Deux fausses tables, repérées parce qu'elles
       n'existent pas au schéma. */
    if (/\.storage\s*$/.test(texte.slice(Math.max(0, m.index - 12), m.index))) continue
    const table = m[2]
    const depuis = m.index + m[0].length
    const prochainFrom = texte.slice(depuis).search(/\.from\(['"`]/)
    const zone = texte.slice(depuis, prochainFrom === -1 ? texte.length : depuis + prochainFrom)

    let trouve = null
    for (const op of OPERATIONS) {
      const i = zone.indexOf('.' + op + '(')
      if (i !== -1 && (trouve === null || i < trouve.i)) trouve = { i, op }
    }
    if (!trouve) {
      acces.push({ table, operation: 'inconnue', colonnes: [], etoile: false })
      continue
    }

    const apres = trouve.i + trouve.op.length + 2
    const debutArg = zone.slice(apres).search(/\S/) + apres

    if (trouve.op === 'select') {
      const l = litteral(zone, debutArg)
      if (l) {
        const chaine = l.valeur.trim()
        if (chaine === '*' || chaine.startsWith('*')) {
          const reste = chaine.replace(/^\*\s*,?\s*/, '')
          acces.push({
            table,
            operation: 'lecture',
            etoile: true,
            colonnes: reste ? colonnesDuSelect(reste, null) : [],
          })
        } else {
          acces.push({ table, operation: 'lecture', etoile: false, colonnes: colonnesDuSelect(chaine, null) })
        }
      } else {
        // `.select(UNE_CONSTANTE)` : on la résout dans le catalogue des constantes du projet.
        const nom = (zone.slice(debutArg).match(/^([A-Za-z_][A-Za-z0-9_]*)/) || [])[1]
        const valeur = nom ? constantes.get(nom) : null
        if (valeur) {
          acces.push({ table, operation: 'lecture', etoile: false, colonnes: colonnesDuSelect(valeur, null) })
        } else {
          acces.push({ table, operation: 'lecture', etoile: true, colonnes: [], constante: nom ?? null })
        }
      }
    } else if (trouve.op === 'delete') {
      acces.push({ table, operation: 'suppression', colonnes: [], etoile: false })
    } else {
      const cles = clesObjet(zone, debutArg)
      acces.push({
        table,
        operation: 'ecriture',
        etoile: cles === null,
        colonnes: (cles ?? []).map((c) => ({ table: null, colonne: c })),
      })
    }
  }
  return acces
}

/** Toutes les constantes de chaîne du projet, pour résoudre `.select(INTERACTIONS_SELECT)`. */
function catalogueConstantes(liste) {
  const map = new Map()
  for (const f of liste) {
    const texte = sansCommentaires(fs.readFileSync(path.join(RACINE, f), 'utf8'))
    const re = /(?:const|let)\s+([A-Z][A-Z0-9_]{2,})\s*(?::\s*string\s*)?=\s*(['"`])/g
    let m
    while ((m = re.exec(texte))) {
      const l = litteral(texte, m.index + m[0].length - 1)
      if (l && l.valeur.length > 3) map.set(m[1], l.valeur)
    }
    /* UNE CONSTANTE PEUT ÊTRE BÂTIE SUR UNE AUTRE. `INTERACTION_DETAIL_SELECT = INTERACTIONS_SELECT
       + ', transcription, …'` : la forme précédente ne voyait qu'une affectation commençant par un
       guillemet, donc celle-ci restait introuvable et la fiche interaction sortait sans colonnes.
       Un seul niveau de composition est résolu — deux ne se rencontrent pas ici, et une résolution
       générale demanderait d'évaluer le fichier. */
    const compose = /(?:const|let)\s+([A-Z][A-Z0-9_]{2,})\s*(?::\s*string\s*)?=\s*([A-Z][A-Z0-9_]{2,})\s*\+\s*(['"`])/g
    while ((m = compose.exec(texte))) {
      const l = litteral(texte, m.index + m[0].length - 1)
      const base = map.get(m[2])
      if (l && base) map.set(m[1], base + l.valeur)
    }
  }
  return map
}

// ── DU FICHIER À L'ÉCRAN ────────────────────────────────────────────────────────────────────────

/** Les imports internes d'un fichier, résolus en chemins de projet. */
function importsDe(fichier, texte) {
  const cibles = []
  const re = /from\s+'([^']+)'/g
  let m
  while ((m = re.exec(texte))) {
    const spec = m[1]
    let base
    if (spec.startsWith('@/')) base = 'src/' + spec.slice(2)
    else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(fichier), spec))
    else continue
    cibles.push(base.replace(/\.js$/, ''))
  }
  return cibles
}

/** Le nom lisible d'un écran, déduit du nom de son fichier de page. */
function nomEcran(fichier) {
  const base = path.basename(fichier).replace(/\.tsx?$/, '')
  return base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^Detail /, '')
    .trim()
}

/**
 * Pour chaque fichier, les écrans qui l'atteignent.
 *
 * On remonte le graphe des imports depuis chaque page. Un fichier de `lib/data` importé par la
 * fiche compte ET par la fiche site est attribué aux deux — c'est bien ce qu'on veut savoir.
 */
function ecransParFichier(liste) {
  const contenu = new Map()
  for (const f of liste) contenu.set(f, sansCommentaires(fs.readFileSync(path.join(RACINE, f), 'utf8')))

  const existe = (base) => {
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      if (contenu.has(base + ext)) return base + ext
    }
    return contenu.has(base) ? base : null
  }

  const sortants = new Map()
  for (const [f, texte] of contenu) {
    sortants.set(f, importsDe(f, texte).map(existe).filter(Boolean))
  }

  const pages = liste.filter((f) => /^src\/pages\//.test(f))
  const resultat = new Map()
  for (const page of pages) {
    const vus = new Set([page])
    const file = [page]
    while (file.length) {
      const courant = file.shift()
      for (const suivant of sortants.get(courant) ?? []) {
        if (vus.has(suivant)) continue
        vus.add(suivant)
        file.push(suivant)
      }
    }
    for (const f of vus) {
      if (!resultat.has(f)) resultat.set(f, new Set())
      resultat.get(f).add(nomEcran(page))
    }
  }

  // Les routes d'API n'ont pas d'écran : elles sont leur propre point d'entrée.
  for (const f of liste) {
    if (/^api\//.test(f)) {
      if (!resultat.has(f)) resultat.set(f, new Set())
      resultat.get(f).add('API ' + f.replace(/^api\//, '').replace(/\.ts$/, ''))
    }
  }
  return resultat
}

// ── LE CROISEMENT ───────────────────────────────────────────────────────────────────────────────

async function construire() {
  const client = await connecter()
  const schema = await lireSchema(client)
  const fonctions = await client.query(`
    select p.proname as nom
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'`)
  await client.end()

  const liste = [...fichiers(path.join(RACINE, 'src')), ...fichiers(path.join(RACINE, 'api'))]
  const constantes = catalogueConstantes(liste)
  const ecrans = ecransParFichier(liste)

  /** clé « table.colonne » → { lue: Set<écran>, ecrite: Set<écran>, fichiers: Set } */
  const usage = new Map()
  const tablesVues = new Map()
  /** table → écrans qui la lisent en `select('*')`, donc sans qu'on sache quelles colonnes servent. */
  const etoiles = new Map()
  const angles = { etoiles: [], constantesNonResolues: [], rpc: new Set(), sansOperation: [] }

  for (const f of liste) {
    const texte = sansCommentaires(fs.readFileSync(path.join(RACINE, f), 'utf8'))
    for (const m of texte.matchAll(/\.rpc\((['"`])([a-z_][a-z0-9_]*)\1/g)) angles.rpc.add(m[2])

    for (const a of [...accesDuFichier(texte, constantes), ...accesParEnrobage(texte)]) {
      const ecransDuFichier = [...(ecrans.get(f) ?? new Set(['(non relié à un écran)']))]
      if (!tablesVues.has(a.table)) tablesVues.set(a.table, { lecture: new Set(), ecriture: new Set(), fichiers: new Set() })
      const t = tablesVues.get(a.table)
      t.fichiers.add(f)
      for (const e of ecransDuFichier) {
        if (a.operation === 'ecriture' || a.operation === 'suppression') t.ecriture.add(e)
        else t.lecture.add(e)
      }

      if (a.etoile) {
        if (a.constante) angles.constantesNonResolues.push({ fichier: f, table: a.table, constante: a.constante })
        else angles.etoiles.push({ fichier: f, table: a.table, operation: a.operation })
      }
      if (a.operation === 'inconnue') angles.sansOperation.push({ fichier: f, table: a.table })

      /* UNE TABLE LUE EN `select('*')` EST LUE EN ENTIER, et ses colonnes doivent le dire.
         Sans ça, `contrats.docusign_envelope_id` s'affichait « non lue » alors que la fiche contrat
         l'affiche : `fetchContrats` lit `*` volontairement, pour qu'une colonne ajoutée arrive sans
         qu'on touche au code. La carte distinguait donc mal « personne ne s'en sert » de « on ne
         sait pas laquelle sert ». Ces tables sont marquées à part, et la colonne « Lue par l'app »
         rend « oui (select *) » — une certitude moindre, dite comme telle. */
      if (a.etoile && a.operation === 'lecture') {
        if (!etoiles.has(a.table)) etoiles.set(a.table, new Set())
        for (const e of ecransDuFichier) etoiles.get(a.table).add(e)
      }

      for (const c of a.colonnes) {
        const table = c.table ?? a.table
        if (c.colonne === '*') {
          if (!etoiles.has(table)) etoiles.set(table, new Set())
          for (const e of ecransDuFichier) etoiles.get(table).add(e)
          continue
        }
        const cle = `${table}.${c.colonne}`
        if (!usage.has(cle)) usage.set(cle, { table, colonne: c.colonne, lue: new Set(), ecrite: new Set(), fichiers: new Set() })
        const u = usage.get(cle)
        u.fichiers.add(f)
        for (const e of ecransDuFichier) {
          if (a.operation === 'ecriture') u.ecrite.add(e)
          else u.lue.add(e)
        }
      }
    }
  }

  const nbPages = liste.filter((f) => /^src\/pages\//.test(f)).length
  return { schema, usage, tablesVues, etoiles, angles, nbPages, fonctions: fonctions.rows.map((r) => r.nom), liste }
}

// ── LES SORTIES ─────────────────────────────────────────────────────────────────────────────────

const csv = (v) => {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
/** Point-virgule et BOM : Excel en français ouvre alors le fichier en colonnes, sans assistant. */
const ecrireCsv = (nom, entetes, lignes) => {
  const corps = [entetes, ...lignes].map((l) => l.map(csv).join(';')).join('\r\n')
  fs.writeFileSync(path.join(SORTIE, nom), '﻿' + corps, 'utf8')
  return lignes.length
}

function main() {
  const verifier = process.argv.includes('--verifier')

  construire()
    .then(({ schema, usage, tablesVues, etoiles, angles, nbPages, fonctions }) => {
      /* ══ « 42 ÉCRANS » N'EST PAS UNE RÉPONSE ═══════════════════════════════════════════════════
         La première carte attribuait `contrats.reference` à 42 écrans sur 46. Ce n'était pas faux —
         la recherche globale (⌘K) est montée dans la mise en page, donc elle est bien partout — mais
         ce n'est pas ce que William demande. Au-delà de 60 % des écrans, on écrit ce que ça veut
         dire, et la colonne « Fichiers » garde la réponse précise, qui elle est toujours exacte. */
      const lister = (set) => {
        if (!set || set.size === 0) return ''
        if (set.size >= Math.ceil(nbPages * 0.6)) return `Toute l’app (${set.size} écrans)`
        return [...set].sort().join(', ')
      }
      // ── L'INCOHÉRENCE QUI DOIT FAIRE ÉCHOUER : le code lit une colonne qui n'existe pas ──
      const fantomes = []
      for (const u of usage.values()) {
        const t = schema.get(u.table)
        if (!t) {
          // Une « table » inconnue du schéma est souvent une relation nommée par son alias.
          fantomes.push({ ...u, raison: 'table absente du schéma' })
          continue
        }
        if (!t.colonnes.some((c) => c.nom === u.colonne) && u.colonne !== 'count') {
          fantomes.push({ ...u, raison: 'colonne absente de la table' })
        }
      }

      if (verifier) {
        console.log('tables en base      : ' + schema.size)
        console.log('couples table.colonne cites par le code : ' + usage.size)
        console.log('incoherences        : ' + fantomes.length)
        for (const f of fantomes.slice(0, 40)) {
          console.log('  ! ' + f.table + '.' + f.colonne + ' — ' + f.raison + '  (' + [...f.fichiers][0] + ')')
        }
        if (fantomes.length > 40) console.log('  … et ' + (fantomes.length - 40) + ' autres')
        process.exit(fantomes.length ? 1 : 0)
      }

      fs.mkdirSync(SORTIE, { recursive: true })

      // ① PAR COLONNE — la feuille que William ouvrira.
      const parColonne = []
      for (const t of [...schema.values()].sort((a, b) => a.nom.localeCompare(b.nom))) {
        for (const c of t.colonnes) {
          const u = usage.get(`${t.nom}.${c.nom}`)
          const etoile = etoiles.get(t.nom)
          parColonne.push([
            t.nom,
            t.vue ? 'vue' : 'table',
            c.nom,
            c.type,
            c.obligatoire ? 'obligatoire' : '',
            /* TROIS ÉTATS ET NON DEUX. « oui » veut dire que la colonne est nommée quelque part dans
               le code ; « oui (select *) » qu'elle n'est jamais nommée mais que sa table est lue en
               entier. La nuance compte pour décider de supprimer une colonne : dans le second cas,
               rien ne prouve qu'un écran s'en serve — il la reçoit sans l'avoir demandée. */
            u && u.lue.size ? 'oui' : etoile ? 'oui (select *)' : 'non',
            u && u.ecrite.size ? 'oui' : 'non',
            /* LES DEUX ORIGINES SONT RÉUNIES. Ne montrer que les lecteurs explicites cachait la
               fiche contrat sur `contrats.docusign_envelope_id` : elle le lit via `select('*')`,
               et la carte ne créditait que les deux routes d'API qui le nomment. */
            lister(new Set([...(u ? u.lue : []), ...(etoile ?? [])])),
            u ? lister(u.ecrite) : '',
            u ? [...u.fichiers].sort().join(', ') : '',
          ])
        }
      }
      const n1 = ecrireCsv(
        '1-par-colonne.csv',
        ['Table', 'Nature', 'Colonne', 'Type', 'Contrainte', 'Lue par l’app', 'Écrite par l’app',
         'Écrans qui la lisent', 'Écrans qui l’écrivent', 'Fichiers'],
        parColonne,
      )

      // ② PAR TABLE — la vue d'ensemble, avec le volume réel.
      const parTable = [...schema.values()]
        .sort((a, b) => a.nom.localeCompare(b.nom))
        .map((t) => {
          const u = tablesVues.get(t.nom)
          const etoile = etoiles.get(t.nom)
          const lues = t.colonnes.filter((c) => usage.get(`${t.nom}.${c.nom}`)?.lue.size).length
          const ecrites = t.colonnes.filter((c) => usage.get(`${t.nom}.${c.nom}`)?.ecrite.size).length
          return [
            t.nom,
            t.vue ? 'vue' : 'table',
            t.lignes ?? '',
            t.colonnes.length,
            etoile ? t.colonnes.length : lues,
            ecrites,
            etoile ? 0 : t.colonnes.length - lues,
            u ? lister(u.lecture) : '',
            u ? lister(u.ecriture) : '',
            u ? (etoile ? 'Lue en select(*) : le détail par colonne est inconnu' : '') : 'JAMAIS CITÉE PAR LE CODE',
          ]
        })
      const n2 = ecrireCsv(
        '2-par-table.csv',
        ['Table', 'Nature', 'Lignes', 'Colonnes', 'Colonnes lues', 'Colonnes écrites',
         'Colonnes jamais lues', 'Écrans qui lisent', 'Écrans qui écrivent', 'Remarque'],
        parTable,
      )

      // ③ PAR ÉCRAN — la question inverse : de quoi cet écran dépend-il ?
      const parEcran = new Map()
      for (const [nom, u] of tablesVues) {
        for (const e of u.lecture) {
          if (!parEcran.has(e)) parEcran.set(e, { lit: new Set(), ecrit: new Set() })
          parEcran.get(e).lit.add(nom)
        }
        for (const e of u.ecriture) {
          if (!parEcran.has(e)) parEcran.set(e, { lit: new Set(), ecrit: new Set() })
          parEcran.get(e).ecrit.add(nom)
        }
      }
      const n3 = ecrireCsv(
        '3-par-ecran.csv',
        ['Écran', 'Tables lues', 'Tables écrites', 'Détail des tables lues', 'Détail des tables écrites'],
        [...parEcran.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([e, u]) => [e, u.lit.size, u.ecrit.size, [...u.lit].sort().join(', '), [...u.ecrit].sort().join(', ')]),
      )

      // ④ LES ANGLES MORTS — dits, pas masqués.
      const trous = [
        ...angles.etoiles.map((a) => ['select(*)', a.table, a.fichier, 'La table est lue, les colonnes utilisées sont inconnues']),
        ...angles.constantesNonResolues.map((a) => ['constante non résolue', a.table, a.fichier, 'select(' + a.constante + ') : définition introuvable']),
        ...angles.sansOperation.map((a) => ['opération non identifiée', a.table, a.fichier, 'from() sans select/insert/update/delete reconnu']),
        ...[...angles.rpc].sort().map((f) => ['fonction RPC', f, '', 'Ses colonnes vivent dans le corps SQL de la fonction']),
        ...fantomes.map((f) => ['INCOHÉRENCE', f.table + '.' + f.colonne, [...f.fichiers].join(', '), f.raison]),
      ]
      const n4 = ecrireCsv('4-angles-morts.csv', ['Nature', 'Cible', 'Fichier', 'Ce que la carte ne sait pas'], trous)

      // Le test porte sur le texte exact : la colonne « Remarque » porte aussi le cas `select(*)`,
      // et un `filter(l => l[9])` comptait les deux ensemble — 109 au lieu de 55.
      /* ── LA PAGE, écrite par le même passage que les CSV ──
         Les deux sortent des mêmes tableaux, elles ne peuvent donc pas se contredire. Si la page
         était générée à part, elle vieillirait dès la première migration. */
      const genereLe = new Date().toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      fs.writeFileSync(
        path.join(SORTIE, 'carte.html'),
        pageCarte({ colonnes: parColonne, tables: parTable, trous, genereLe }),
        'utf8',
      )

      const jamais = parTable.filter((l) => l[9] === 'JAMAIS CITÉE PAR LE CODE').length
      const enEtoile = parTable.filter((l) => String(l[9]).startsWith('Lue en select')).length
      console.log('carte écrite dans carte-donnees/')
      console.log('  1-par-colonne.csv    ' + n1 + ' colonnes')
      console.log('  2-par-table.csv      ' + n2 + ' tables et vues, dont ' + jamais + ' jamais citées par le code'
        + (enEtoile ? ' et ' + enEtoile + ' lues en select(*)' : ''))
      console.log('  3-par-ecran.csv      ' + n3 + ' écrans')
      console.log('  4-angles-morts.csv   ' + n4 + ' points où la carte est muette')
      console.log('  carte.html           page consultable, cherchable, à jour du même passage')
      console.log('')
      console.log('fonctions SQL du schéma : ' + fonctions.length + '  ·  appelées depuis le code : ' + angles.rpc.size)
      if (fantomes.length) console.log('⚠  ' + fantomes.length + ' incohérence(s) — voir 4-angles-morts.csv')
    })
    .catch((e) => {
      console.error(e.message)
      process.exit(1)
    })
}

main()
