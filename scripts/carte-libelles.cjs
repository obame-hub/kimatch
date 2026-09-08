// ════════════════════════════════════════════════════════════════════════════════════════════════
// DU LIBELLÉ AFFICHÉ À LA COLONNE DE LA BASE
//
// Naoëlle, 08/09/2026 : « ce que je comprends pas c'est comment tu peux pas me sortir les libellés
// qui correspondent aux champs des tables ? pourtant tu as accès au code source et à la database, et
// tu sais quelle variable se remplit et où, pourquoi c'est si compliqué. »
//
// Elle avait raison, et ma réponse — « 18 %, c'est ce qui est honnêtement dérivable » — était une
// mauvaise excuse. Ce n'était pas une limite du problème, c'était la limite de mon outil.
//
// ══ CE QUE JE FAISAIS, ET POURQUOI ÇA PLAFONNAIT À 18 % ═════════════════════════════════════════
//
// Je cherchais un nom de colonne DANS LES 300 CARACTÈRES suivant le libellé, et quand plusieurs
// tables portaient ce nom — `contact_id` en a onze, `nom` seize — j'abandonnais. Deux défauts, tous
// les deux évitables :
//
//   · la fenêtre coupait des paires légitimes, parce qu'un `<FormField>` de formulaire porte son
//     libellé en haut et le nom de colonne dans l'appel de mutation, vingt lignes plus bas ;
//   · l'ambiguïté n'était pas une ambiguïté. Le code dit de quelle table il s'agit.
//
// ══ LA CHAÎNE QUE JE N'AVAIS PAS CONSTRUITE ════════════════════════════════════════════════════
//
//   const { data: contrat } = useContrat(id)        ← `useContrat` vient de lib/data/contrats.ts,
//                                                     qui interroge `contrats`.
//   <InlineField label="Début" value={contrat.date_debut} />
//                                ↑ donc c'est `contrats.date_debut`, sans deviner.
//
// Trois maillons, tous lisibles dans le code : l'import donne le fichier du hook, le fichier donne
// la table, la variable donne l'objet. Il n'y a plus d'ambiguïté à trancher — il n'y en avait pas.
//
// Le second chemin est le même à l'envers, pour les formulaires :
//
//   <FormField label="Titre"><Input value={titre} … /></FormField>
//   …
//   majAction({ titre: titre.trim() })              ← la clé de l'objet EST le nom de colonne,
//                                                     et `majAction` dit la table.
//
// ══ CE QUI RESTE HORS DE PORTÉE, ET C'EST PEU ══════════════════════════════════════════════════
//
// Un libellé dont la valeur est calculée sur place — « Ancienneté » affichant un nombre d'années
// déduit de `date_creation` — ne désigne aucune colonne. Ce n'est pas un manque de la carte : il
// n'y a rien à relier.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** `compteId` → `compte_id`, `dateDebut` → `date_debut`. La convention du projet, à l'envers. */
function versSnake(nom) {
  return nom.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

/** Un libellé de champ, ou un message ? Un libellé ne finit pas par un point et n'est pas une phrase. */
function ressembleAUnLibelle(libelle) {
  if (libelle.length > 42) return false
  if (/[.!?]$/.test(libelle)) return false
  return /[A-Za-zÀ-ÿ]/.test(libelle)
}

/**
 * Les champs d'un fichier : chaque `label="…"` avec la portion de code qui lui appartient.
 *
 * LA BORNE EST LE LIBELLÉ SUIVANT, PAS UNE LONGUEUR. C'est la correction qui compte : un champ
 * s'arrête là où le suivant commence. Une fenêtre fixe coupait les formulaires au milieu et
 * débordait sur le champ d'après dans les fiches — les deux erreurs à la fois, selon l'écran.
 */
const PORTEE = 600

function champs(texte) {
  const positions = [...texte.matchAll(/label="([^"]+)"/g)]
  return positions.map((m, i) => {
    const finSuivant = positions[i + 1] ? positions[i + 1].index : texte.length
    return { libelle: m[1], bloc: texte.slice(m.index, Math.min(finSuivant, m.index + PORTEE)) }
  })
}

/**
 * Parmi des candidats repérés à des distances différentes du libellé, ceux qui lui appartiennent.
 *
 * LE PLUS PROCHE, ET CE QUI LE TALONNE. Un champ a UNE valeur : dans
 * `<InlineField label="Début" value={contrat.date_debut}`, `date_debut` est à quinze caractères et
 * tout le reste à des centaines. Ratisser le bloc entier est ce qui a produit les pires liens de la
 * version précédente — `documents.nom_fichier` → « Propriétaire », `contacts.telephone` → « Email ».
 *
 * On garde donc le plus proche, PLUS ce qui le suit de très près : un champ d'adresse écrit
 * `adresse`, `code_postal` et `ville` d'un seul geste, et les trois sont vrais.
 */
const COUDE = 90

function plusProche(candidats) {
  if (candidats.length === 0) return []
  const min = Math.min(...candidats.map((c) => c.distance))
  return candidats.filter((c) => c.distance <= min + COUDE)
}

/**
 * Les variables de ce fichier qui portent une ligne de table, et laquelle.
 *
 * `const { data: contrat } = useContrat(id)` et `const contrat = useContrat(id)`. Le nom du hook est
 * résolu par les imports du fichier — donc par le fichier qui le définit — et non par ressemblance
 * de nom : `useSuiviDuContrat` ne rend pas une ligne de `contrats`.
 */
function variablesDeTable(texte, hookVersTable) {
  const trouvees = new Map()
  const formes = [
    /const\s*\{\s*data:\s*([A-Za-z_][A-Za-z0-9_]*)[^}]*\}\s*=\s*(use[A-Za-z0-9_]+)\s*\(/g,
    /const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(use[A-Za-z0-9_]+)\s*\(/g,
  ]
  for (const re of formes) {
    for (const m of texte.matchAll(re)) {
      const table = hookVersTable.get(m[2])
      if (table) trouvees.set(m[1], table)
    }
  }
  return trouvees
}

/**
 * Les mutations appelées dans ce fichier, et la table qu'elles écrivent.
 *
 * `const majContrat = useUpdateContratPartiel()` ou `const { mutateAsync: majAction } = useMajAction()`.
 * La table vient du hook, comme pour les lectures. Les clés des objets qu'on leur passe sont alors
 * des noms de colonnes certains : c'est le code qui les envoie à PostgREST.
 */
function mutationsDuFichier(texte, hookVersTable) {
  const trouvees = new Map()
  const formes = [
    /const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(use[A-Za-z0-9_]+)\s*\(/g,
    /const\s*\{[^}]*\b(?:mutate|mutateAsync)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)[^}]*\}\s*=\s*(use[A-Za-z0-9_]+)\s*\(/g,
  ]
  for (const re of formes) {
    for (const m of texte.matchAll(re)) {
      const table = hookVersTable.get(m[2])
      if (table) trouvees.set(m[1], table)
    }
  }
  return trouvees
}

/** Les clés de premier niveau d'un objet littéral commençant à `i` (sur `{`). */
function clesObjet(texte, i) {
  if (texte[i] !== '{') return []
  let p = 0
  let j = i
  for (; j < texte.length; j++) {
    if (texte[j] === '{') p++
    else if (texte[j] === '}') {
      p--
      if (p === 0) break
    }
  }
  const corps = texte.slice(i + 1, j)
  const cles = []
  let prof = 0
  let courant = ''
  const pousser = (morceau) => {
    const m = morceau.match(/^\s*([a-z_][a-z0-9_]*)\s*:/i) || morceau.match(/^\s*([a-z_][a-z0-9_]*)\s*$/i)
    if (m) cles.push(m[1])
  }
  for (const c of corps) {
    if ('({['.includes(c)) prof++
    else if (')}]'.includes(c)) prof--
    if (c === ',' && prof === 0) {
      pousser(courant)
      courant = ''
    } else courant += c
  }
  pousser(courant)
  return cles
}

/**
 * Le dictionnaire libellé ↔ colonne.
 *
 * @param liste            fichiers du projet
 * @param lire             (fichier) => texte sans commentaires
 * @param schema           Map<table, { colonnes: [{ nom }] }> — la garde contre l'invention
 * @param hookVersTable    Map<nom de hook, table>
 * @param ecransDuFichier  Map<fichier, Set<écran>>
 */
function construireLibelles({ liste, lire, schema, hookVersTable, ecransDuFichier }) {
  const colonnesDe = new Map()
  for (const [nom, t] of schema) colonnesDe.set(nom, new Set(t.colonnes.map((c) => c.nom)))

  const RANG = { sur: 2, probable: 1 }
  const trouvees = new Map()
  const sansTable = []

  for (const f of liste) {
    if (!f.endsWith('.tsx')) continue
    const texte = lire(f)
    if (!texte.includes('label="')) continue

    const variables = variablesDeTable(texte, hookVersTable)
    const mutations = mutationsDuFichier(texte, hookVersTable)
    const ecrans = ecransDuFichier.get(f) ?? new Set()
    /* La table « principale » du fichier : celle de sa variable la plus utilisée. Elle sert au
       second chemin, quand une variable d'état porte le nom d'une colonne sans qu'aucune mutation
       ne le confirme dans la même portion de code. */
    const principale = [...variables.values()].sort(
      (a, b) => (texte.split(b).length - texte.split(a).length),
    )[0]

    const retenir = (table, colonne, libelle, certitude) => {
      if (!table || !ressembleAUnLibelle(libelle)) return
      if (!colonnesDe.get(table)?.has(colonne)) return // Inconnue de cette table : on n'invente pas.
      const cle = `${table}.${colonne}|${libelle}`
      const existant = trouvees.get(cle)
      if (existant) {
        existant.fichiers.add(f)
        for (const e of ecrans) existant.ecrans.add(e)
        if (RANG[certitude] > RANG[existant.certitude]) existant.certitude = certitude
        return
      }
      trouvees.set(cle, { table, colonne, libelle, certitude, fichiers: new Set([f]), ecrans: new Set(ecrans) })
    }

    for (const { libelle, bloc } of champs(texte)) {
      const candidats = []

      // ① LA VARIABLE DIT LA TABLE : `contrat.date_debut` avec `contrat` issu de `useContrat`.
      for (const m of bloc.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\.([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\b/g)) {
        const table = variables.get(m[1])
        if (!table || !colonnesDe.get(table)?.has(m[2])) continue
        candidats.push({ table, colonne: m[2], certitude: 'sur', distance: m.index })
      }

      // ② LA MUTATION DIT LA TABLE ET LA COLONNE : `majAction({ titre: … })`.
      for (const m of bloc.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\{/g)) {
        const table = mutations.get(m[1])
        if (!table) continue
        const debut = bloc.indexOf('{', m.index + m[1].length)
        for (const cle of clesObjet(bloc, debut)) {
          candidats.push({ table, colonne: cle, certitude: 'sur', distance: m.index })
        }
      }

      // ③ LA VARIABLE D'ÉTAT : `<FormField label="Titre"><Input value={titre} … `.
      for (const m of bloc.matchAll(/(?:value|checked)=\{([a-z][A-Za-z0-9]*)[\s?}]/g)) {
        const colonne = versSnake(m[1])
        const cible = [principale, ...variables.values()].find((t) => colonnesDe.get(t)?.has(colonne))
        if (cible) candidats.push({ table: cible, colonne, certitude: 'probable', distance: m.index })
      }

      /* ON NE GARDE QUE CE QUI TOUCHE LE LIBELLÉ. Les trois sources proposent, `plusProche`
         tranche : le candidat le plus proche du libellé, et lui seul — plus ce qui le talonne à
         moins de 90 caractères, pour le champ d'adresse qui écrit trois colonnes d'un geste. */
      const retenus = plusProche(candidats)
      for (const c of retenus) retenir(c.table, c.colonne, libelle, c.certitude)
      if (retenus.length === 0) sansTable.push({ fichier: f, libelle })
    }
  }

  return { liens: [...trouvees.values()], sansTable }
}

module.exports = { construireLibelles, versSnake }
