// ════════════════════════════════════════════════════════════════════════════════════════════════
// DU LIBELLÉ AFFICHÉ À LA COLONNE DE LA BASE
//
// Naoëlle, 08/09/2026 : « oui vas-y fais le lien colonne libellé, c'est ça aussi le plus
// important. »
//
// ── CE QUE J'AVAIS DIT, ET POURQUOI C'ÉTAIT FAUX ──
//
// J'avais annoncé que ce lien n'était « pas déductible du code ». C'est faux : dans les fiches, le
// libellé et le champ sont presque toujours dans le MÊME élément JSX.
//
//   <InlineField label="Référence fournisseur" value={contrat.reference_fournisseur} … />
//
// ── MA PREMIÈRE VERSION ÉTAIT PIRE QUE RIEN, ET LA MESURE L'A DIT ──
//
// Elle rendait 742 liens. Contrôlés à la main, un sur dix tenait. Trois exemples de ce qu'elle
// affirmait : `appels_en_cours.compte_id` → « Signataire », `comptes.code_postal` → « Site
// (optionnel) », `actions.opportunite_id` → « Piste introuvable. »
//
// La cause n'était pas la lecture du JSX mais L'ATTRIBUTION À UNE TABLE. Je rattachais un libellé à
// toute table visible depuis l'écran ; or `contact_id` existe sur onze tables et `nom` sur seize.
// Un libellé était donc recopié sur chacune. Une carte qui dit onze choses dont une est vraie ne
// vaut pas mieux qu'une carte vide : elle coûte le temps de la vérifier.
//
// ── LA RÈGLE QUI REMPLACE : TRIANGULER, PAS SUPPOSER ──
//
// Un lien n'est retenu que si LE FICHIER LUI-MÊME touche cette colonne de cette table. C'est
// vérifiable : l'analyse des requêtes sait déjà que `ContratDetail.tsx` écrit
// `contrats.reference_fournisseur`. Le libellé voisin ne peut donc désigner que ça.
//
// Ce que cette règle coûte : les composants qui n'interrogent pas la base eux-mêmes — un
// `BlocSuiviDocusign` reçoit ses données de la fiche — n'ont plus de libellé rattaché. Ce qu'elle
// évite : inventer. Le second est plus grave que le premier, parce que rien ne le contredit.
//
// ── DEUX SOURCES, DEUX NIVEAUX DE CERTITUDE ──
//
//   sur         le libellé et `objet.colonne` sont dans le même élément JSX, et le fichier touche
//               réellement cette colonne. Rien à interpréter.
//   probable    le libellé est lié à une variable d'état dont le nom, converti en tirets bas,
//               désigne une colonne que ce fichier écrit. La convention du projet fait le lien
//               (`compteId` → `compte_id`), et l'écriture le confirme.
//
// LA SOURCE « PROXIMITÉ » A ÉTÉ SUPPRIMÉE. Elle produisait 398 liens dont « Piste introuvable. » et
// « Type : » comme libellés de colonnes. Un message d'erreur n'est pas un libellé de champ, et
// aucune règle de distance ne sait faire la différence.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** `compteId` → `compte_id`, `dateDebut` → `date_debut`. La convention du projet, à l'envers. */
function versSnake(nom) {
  return nom.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

/**
 * Chaque élément JSX portant un attribut `label="…"`, avec tout son contenu.
 *
 * LE CONTENU COMPTE AUTANT QUE LA BALISE. `<FormField label="Nom"><Input value={nom} /></FormField>`
 * porte le libellé dans la balise ouvrante et la valeur dans l'enfant : s'arrêter au `>` de
 * l'ouvrante faisait passer 218 libellés sur 263 pour orphelins.
 */
function* elementsAvecLibelle(texte) {
  for (const m of texte.matchAll(/<([A-Z][A-Za-z]*)\b/g)) {
    const nom = m[1]
    const i = m.index
    let profondeur = 0
    let j = i
    while (j < texte.length) {
      const c = texte[j]
      if (c === '{') profondeur++
      else if (c === '}') profondeur--
      else if (c === '>' && profondeur === 0) break
      j++
    }
    const ouvrante = texte.slice(i, j + 1)
    const lab = ouvrante.match(/label="([^"]+)"/)
    if (!lab) continue
    if (/\/>\s*$/.test(ouvrante)) {
      yield { libelle: lab[1], bloc: ouvrante }
      continue
    }
    /* LA FENÊTRE EST COURTE, ET C'EST ELLE QUI FAIT LA PRÉCISION. Un `<FormField>` de formulaire
       peut faire deux mille caractères ; y chercher un nom de colonne rattachait au libellé des
       champs situés dix lignes plus bas. Le champ qui porte un libellé le suit immédiatement. */
    // Élément à enfants : on cherche la fermeture appariée, en comptant les imbrications du même nom.
    let prof = 1
    let k = j + 1
    while (k < texte.length && prof > 0) {
      const o = texte.indexOf('<' + nom, k)
      const c = texte.indexOf('</' + nom, k)
      if (c === -1) break
      if (o !== -1 && o < c) {
        prof++
        k = o + nom.length + 1
      } else {
        prof--
        k = c + nom.length + 2
      }
    }
    yield { libelle: lab[1], bloc: texte.slice(i, Math.min(k, i + FENETRE)) }
  }
}

/**
 * La longueur de code, après le libellé, dans laquelle on accepte de chercher son champ.
 *
 * Mesurée plutôt que choisie : les formes du projet — `<InlineField label=… value={x.col} …>` et
 * `<FormField label=…><Input value={col} …>` — tiennent toutes sous 300 caractères. Au-delà, on
 * ramasse le champ suivant.
 */
const FENETRE = 300

/** Un libellé de champ, ou un message ? Un libellé ne finit pas par un point et n'est pas une phrase. */
function ressembleAUnLibelle(libelle) {
  if (libelle.length > 42) return false
  if (/[.!?]$/.test(libelle)) return false
  return /[A-Za-zÀ-ÿ]/.test(libelle)
}

/**
 * Le dictionnaire libellé ↔ colonne.
 *
 * @param liste             fichiers du projet, chemins relatifs
 * @param lire              (fichier) => texte, déjà débarrassé des commentaires
 * @param usageDuFichier    Map<fichier, Set<"table.colonne">> — ce que CE fichier touche vraiment
 * @param ecransDuFichier   Map<fichier, Set<écran>>
 */
/**
 * De quelle entité parle ce fichier ? `ContratDetail.tsx` → « contrat », `SiteDetail.tsx` → « site ».
 *
 * Sert d'arbitre quand plusieurs tables portent le même nom de colonne. `code_postal` existe sur
 * `comptes` et sur `sites` : sur la fiche site, c'est celle du site. Quand le nom du fichier ne
 * tranche pas, on s'abstient plutôt que de choisir la première venue.
 */
function entiteDuFichier(fichier) {
  const base = fichier.split('/').pop().replace(/\.tsx?$/, '')
  const mots = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/)
  return mots.filter((m) => m.length > 3 && !['detail', 'dialog', 'form', 'carte', 'bloc', 'onglet', 'volet', 'liste', 'page'].includes(m))
}

function construireLibelles({ liste, lire, usageDuFichier, ecransDuFichier }) {
  const RANG = { sur: 2, probable: 1 }
  /** clé « table.colonne | libellé » → meilleure trouvaille */
  const trouvees = new Map()
  /** Les libellés qu'on a refusé de rattacher : comptés, pour savoir ce que la prudence coûte. */
  const ambigus = []

  for (const f of liste) {
    if (!f.endsWith('.tsx')) continue
    const touchees = usageDuFichier.get(f)
    if (!touchees || touchees.size === 0) continue
    const entites = entiteDuFichier(f)

    /* colonne → tables que CE FICHIER touche avec cette colonne. Quand il y en a plusieurs, on
       s'abstient : le fichier lit `compte_id` sur trois tables, rien ne dit laquelle porte le
       libellé. Un « ambigu » silencieux valait mieux qu'un choix au hasard répété trois fois. */
    const parColonne = new Map()
    for (const cle of touchees) {
      const i = cle.indexOf('.')
      const table = cle.slice(0, i)
      const colonne = cle.slice(i + 1)
      if (!parColonne.has(colonne)) parColonne.set(colonne, new Set())
      parColonne.get(colonne).add(table)
    }

    const texte = lire(f)
    const ecrans = ecransDuFichier.get(f) ?? new Set()

    const retenir = (colonne, libelle, certitude) => {
      if (!ressembleAUnLibelle(libelle)) return
      const tables = parColonne.get(colonne)
      if (!tables || tables.size === 0) return
      let table
      if (tables.size === 1) {
        table = [...tables][0]
      } else {
        /* PLUSIEURS TABLES PORTENT CETTE COLONNE. Le nom du fichier tranche quand il désigne l'une
           d'elles — sur la fiche site, `code_postal` est celui du site. Sinon on s'abstient : c'est
           exactement le cas où la première version recopiait le libellé sur les onze tables. */
        const prefere = [...tables].filter((t) => entites.some((e) => t.startsWith(e)))
        if (prefere.length !== 1) {
          ambigus.push({ fichier: f, colonne, libelle, tables: [...tables].sort() })
          return
        }
        table = prefere[0]
      }
      const cle = `${table}.${colonne}|${libelle}`
      const existant = trouvees.get(cle)
      if (existant) {
        existant.fichiers.add(f)
        for (const e of ecrans) existant.ecrans.add(e)
        if (RANG[certitude] > RANG[existant.certitude]) existant.certitude = certitude
        return
      }
      trouvees.set(cle, {
        table,
        colonne,
        libelle,
        certitude,
        fichiers: new Set([f]),
        ecrans: new Set(ecrans),
      })
    }

    for (const { libelle, bloc } of elementsAvecLibelle(texte)) {
      // ① SÛR : `objet.colonne` dans le même élément que le libellé.
      for (const m of bloc.matchAll(/\b[a-z][A-Za-z0-9]*\.([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g)) {
        retenir(m[1], libelle, 'sur')
      }
      // ② PROBABLE : la valeur est une variable d'état dont le nom désigne une colonne du fichier.
      for (const m of bloc.matchAll(/(?:value|checked)=\{([a-z][A-Za-z0-9]*)[\s?}]/g)) {
        retenir(versSnake(m[1]), libelle, 'probable')
      }
    }
  }

  return { liens: [...trouvees.values()], ambigus }
}

module.exports = { construireLibelles, versSnake }
