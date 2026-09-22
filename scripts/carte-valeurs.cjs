// ════════════════════════════════════════════════════════════════════════════════════════════════
// CE QU'UN CHAMP A LE DROIT DE CONTENIR
//
// William, 14/09/2026 : « pour chaque objet, une liste des champs avec […] les valeurs possibles de
// ce champ ».
//
// ══ IL N'Y A AUCUN TYPE ÉNUMÉRÉ DANS CETTE BASE, ET C'EST LA PREMIÈRE CHOSE À SAVOIR ═══════════
//
// `select count(*) … typtype='e'` rend zéro. Personne n'a jamais créé de `create type … as enum`.
// Un outil qui se contenterait de lire les enums — c'est ce que font tous les générateurs de
// documentation de schéma — rendrait donc « aucune valeur contrainte » sur les 2 158 colonnes, ce
// qui est faux et dangereux : `consommations.unite` n'accepte QUE Wh, kWh et MWh.
//
// Les valeurs vivent à cinq endroits différents, et il faut les lire aux cinq :
//
//   ① LA CONTRAINTE CHECK ...= ANY (ARRAY[…])   la liste est écrite en toutes lettres, c'est la
//                                               source la plus sûre : la base refuse le reste.
//   ② LA CLÉ ÉTRANGÈRE vers `statuts_*`/`types_*`  la liste est dans des LIGNES, pas dans le
//                                               schéma. `contrats.statut_id` n'a l'air de rien —
//                                               c'est un uuid — et vaut en réalité l'une des
//                                               lignes de `statuts_contrats`.
//   ③ LE BOOLÉEN                                oui / non, et il faut le dire plutôt que d'écrire
//                                               « boolean » et laisser chercher.
//   ④ LA CONTRAINTE CHECK DE BORNES             « entre 0 et 100 » n'est pas une liste mais c'est
//                                               bien une valeur possible, et c'est ce qu'on demande.
//   ⑤ LES VALEURS RÉELLEMENT PRÉSENTES          quand rien ne contraint la colonne. `comptes.segment`
//                                               était un texte libre jusqu'au 14/09 et ne portait
//                                               pourtant que six valeurs.
//
// ══ POURQUOI ⑤ PASSE PAR `pg_stats` ET NON PAR UN `select distinct` ════════════════════════════
//
// Un `select distinct` sur 2 158 colonnes, c'est 2 158 parcours de table. Le 10/09/2026, un import
// lancé à pleine vitesse a épuisé le CPU de l'instance et mis toute l'équipe à l'arrêt (voir
// `sonder-la-base.cjs`). Cette carte ne doit jamais pouvoir refaire ça.
//
// `pg_stats` est l'échantillon que l'ANALYZE de Postgres tient déjà à jour : le lire ne coûte rien
// et ne touche aucune table. Le prix à payer est écrit dans la sortie plutôt que caché : ce sont
// des valeurs OBSERVÉES, pas des valeurs AUTORISÉES, et la colonne « Origine des valeurs » le dit.
// Une valeur rare peut manquer de l'échantillon ; `n_distinct` négatif (Postgres estime alors une
// proportion de lignes, donc beaucoup de valeurs) fait renoncer plutôt que tronquer en silence.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Combien de valeurs d'une liste on écrit avant d'abréger. Au-delà, la cellule devient illisible. */
const MAX_VALEURS = 24

/** `'ACTIF'::text` → `ACTIF`. Postgres rend toujours les littéraux d'un CHECK avec leur transtypage. */
function nettoyerLitteral(brut) {
  return brut
    .trim()
    .replace(/::[a-z_ ]+(\[\])?$/i, '')
    .replace(/^'(.*)'$/s, '$1')
    .replace(/''/g, "'")
    .trim()
}

/**
 * Les valeurs littérales d'un CHECK, s'il en impose une liste.
 *
 * DEUX FORMES, ET LA SECONDE EST CELLE DES COLONNES-TABLEAUX. `contacts.roles` est un `text[]` et sa
 * contrainte s'écrit `roles <@ ARRAY[…]` — « chaque élément est pris dans cette liste ». La forme
 * `= ANY (ARRAY[…])` du champ simple ne l'attrape pas : il a fallu lire les deux, sinon les rôles de
 * contact — le champ le plus structurant de l'onglet Contacts — ressortaient en « libre ».
 */
function valeursDuCheck(definition) {
  const m = definition.match(/ARRAY\[(.+?)\]/s)
  if (!m) return null
  if (!/=\s*ANY\s*\(/i.test(definition) && !/<@\s*ARRAY/i.test(definition)) return null
  const valeurs = []
  let courant = ''
  let dansChaine = false
  for (let i = 0; i < m[1].length; i++) {
    const c = m[1][i]
    if (c === "'") {
      // `''` est une apostrophe échappée, pas une fin de chaîne.
      if (dansChaine && m[1][i + 1] === "'") {
        courant += "''"
        i++
        continue
      }
      dansChaine = !dansChaine
    }
    if (c === ',' && !dansChaine) {
      valeurs.push(courant)
      courant = ''
      continue
    }
    courant += c
  }
  if (courant.trim()) valeurs.push(courant)
  const propres = valeurs.map(nettoyerLitteral).filter(Boolean)
  return propres.length ? propres : null
}

/** Les bornes numériques d'un CHECK, quand il en pose. « entre 0 et 100 », « au moins 0 ». */
function bornesDuCheck(definition, colonne) {
  const nb = String.raw`\(?\(?([-\d.]+)\)?(?:::[a-z ]+)?\)?`
  const col = colonne.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const min = definition.match(new RegExp(String.raw`${col}\s*>=\s*${nb}`, 'i'))
  const max = definition.match(new RegExp(String.raw`${col}\s*<=\s*${nb}`, 'i'))
  if (min && max) return `entre ${min[1]} et ${max[1]}`
  if (min) return `au moins ${min[1]}`
  if (max) return `au plus ${max[1]}`
  return null
}

/** Les valeurs d'un tableau Postgres rendu en texte : `{a,"b c"}` → ['a', 'b c']. */
function tableauTexte(brut) {
  if (!brut) return []
  const corps = String(brut).replace(/^\{/, '').replace(/\}$/, '')
  const sortie = []
  let courant = ''
  let guillemets = false
  for (let i = 0; i < corps.length; i++) {
    const c = corps[i]
    if (c === '\\') {
      courant += corps[++i] ?? ''
      continue
    }
    if (c === '"') {
      guillemets = !guillemets
      continue
    }
    if (c === ',' && !guillemets) {
      sortie.push(courant)
      courant = ''
      continue
    }
    courant += c
  }
  if (courant) sortie.push(courant)
  return sortie.map((v) => v.trim()).filter((v) => v && v !== 'NULL')
}

const abreger = (liste) =>
  liste.length > MAX_VALEURS
    ? liste.slice(0, MAX_VALEURS).join(' | ') + ` | … (${liste.length} au total)`
    : liste.join(' | ')

/**
 * Pour chaque colonne : ce qu'elle a le droit de contenir, et d'où on le sait.
 *
 * @returns {Promise<Map<string, {valeurs: string, origine: string}>>} clé « table.colonne »
 */
async function lireValeurs(client) {
  const valeurs = new Map()
  const poser = (cle, v, origine) => {
    // Le premier arrivé gagne : les sources sont interrogées de la plus sûre à la plus faible.
    if (!valeurs.has(cle) && v) valeurs.set(cle, { valeurs: v, origine })
  }

  // ── ① LES CONTRAINTES CHECK ───────────────────────────────────────────────────────────────────
  /* UNE CONTRAINTE PEUT PORTER SUR PLUSIEURS COLONNES, et `conkey` les donne toutes. On ne retient
     que celles à UNE colonne : `CHECK (date_fin >= date_debut)` en touche deux et n'énumère aucune
     valeur — l'attribuer aux deux écrirait « entre … » sur des dates, ce qui est faux. */
  const checks = await client.query(`
    select co.conrelid::regclass::text as table_nom,
           a.attname as colonne,
           pg_get_constraintdef(co.oid) as definition,
           array_length(co.conkey, 1) as nb_colonnes
      from pg_constraint co
      join pg_namespace n on n.oid = co.connamespace
      join pg_attribute a on a.attrelid = co.conrelid and a.attnum = co.conkey[1]
     where n.nspname = 'public' and co.contype = 'c'`)

  const bornes = new Map()
  for (const r of checks.rows) {
    if (Number(r.nb_colonnes) !== 1) continue
    const cle = `${r.table_nom}.${r.colonne}`
    const liste = valeursDuCheck(r.definition)
    if (liste) {
      poser(cle, abreger(liste), 'contrainte CHECK en base — la base refuse toute autre valeur')
      continue
    }
    const borne = bornesDuCheck(r.definition, r.colonne)
    if (borne) bornes.set(cle, borne)
  }

  // ── ② LES CLÉS ÉTRANGÈRES VERS LES TABLES DE RÉFÉRENCE ────────────────────────────────────────
  /* `contrats.statut_id` est un uuid : son type ne dit rien, et c'est pourtant le champ dont on
     demande le plus souvent les valeurs. Elles sont dans les LIGNES de `statuts_contrats`. */
  const fks = await client.query(`
    select con.conrelid::regclass::text as table_nom,
           a.attname as colonne,
           con.confrelid::regclass::text as cible
      from pg_constraint con
      join pg_namespace n on n.oid = con.connamespace
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
     where n.nspname = 'public' and con.contype = 'f' and array_length(con.conkey, 1) = 1`)

  /* LES TABLES DE RÉFÉRENCE SE RECONNAISSENT À LEURS COLONNES, PAS À LEUR NOM. Filtrer sur
     `statuts_%`/`types_%` marcherait aujourd'hui et raterait la première table de référence nommée
     autrement. Porter `code` ET `libelle` est ce qui définit réellement une liste de valeurs ici. */
  const refs = await client.query(`
    select table_name
      from information_schema.columns
     where table_schema = 'public' and column_name in ('code', 'libelle')
     group by table_name
    having count(distinct column_name) = 2`)
  const tablesRef = new Set(refs.rows.map((r) => r.table_name))

  const aColonne = await client.query(`
    select table_name, column_name from information_schema.columns where table_schema = 'public'`)
  const colonnesDe = new Map()
  for (const r of aColonne.rows) {
    if (!colonnesDe.has(r.table_name)) colonnesDe.set(r.table_name, new Set())
    colonnesDe.get(r.table_name).add(r.column_name)
  }

  /** Le contenu d'une table de référence, lu une seule fois même si dix colonnes y pointent. */
  const contenuRef = new Map()
  for (const cible of new Set(fks.rows.map((r) => r.cible).filter((c) => tablesRef.has(c)))) {
    const cols = colonnesDe.get(cible) ?? new Set()
    const ordre = cols.has('ordre') ? 'ordre, ' : ''
    /* LE FILTRE `actif` EST INDISPENSABLE et c'est la migration du 14/09 qui l'a montré :
       `types_comptes` portait quatre valeurs à zéro compte, désactivées ce jour-là plutôt que
       supprimées. Les lister comme « possibles » ferait proposer un vocabulaire mort. Elles sont
       comptées à part, pas effacées — savoir qu'il en existe trois inactives a son prix. */
    const filtre = cols.has('actif') ? 'where actif is true' : ''
    try {
      const r = await client.query(
        `select code, libelle from "${cible}" ${filtre} order by ${ordre}libelle limit 200`,
      )
      const inactives = cols.has('actif')
        ? Number((await client.query(`select count(*) n from "${cible}" where actif is not true`)).rows[0].n)
        : 0
      contenuRef.set(cible, {
        liste: r.rows.map((x) => (x.libelle && x.libelle !== x.code ? `${x.libelle} (${x.code})` : x.code ?? x.libelle)),
        inactives,
      })
    } catch {
      contenuRef.set(cible, { liste: [], inactives: 0 })
    }
  }

  for (const r of fks.rows) {
    const cle = `${r.table_nom}.${r.colonne}`
    const ref = contenuRef.get(r.cible)
    if (ref && ref.liste.length) {
      poser(
        cle,
        abreger(ref.liste) + (ref.inactives ? ` — et ${ref.inactives} valeur(s) désactivée(s)` : ''),
        `lignes de la table ${r.cible}`,
      )
    } else {
      poser(cle, `un identifiant de ${r.cible}`, `clé étrangère vers ${r.cible}`)
    }
  }

  // ── ③④⑤ LE TYPE, LES BORNES, PUIS CE QUE LES DONNÉES MONTRENT ────────────────────────────────
  const colonnes = await client.query(`
    select c.table_name, c.column_name, c.data_type, c.is_generated, c.generation_expression,
           c.column_default, c.character_maximum_length
      from information_schema.columns c
     where c.table_schema = 'public'`)

  for (const r of colonnes.rows) {
    const cle = `${r.table_name}.${r.column_name}`
    if (r.is_generated === 'ALWAYS' && r.generation_expression) {
      poser(cle, 'calculée : ' + r.generation_expression, 'colonne générée par la base')
    }
    if (r.data_type === 'boolean') poser(cle, 'oui | non', 'type booléen')
    if (bornes.has(cle)) poser(cle, bornes.get(cle), 'contrainte CHECK en base')
    if (r.data_type === 'uuid' && /(^|_)id$/.test(r.column_name)) {
      poser(cle, 'un identifiant technique', 'type uuid')
    }
    if (r.character_maximum_length) {
      poser(cle, `texte de ${r.character_maximum_length} caractères au plus`, 'longueur déclarée au schéma')
    }
  }

  /* ⑤ LES VALEURS OBSERVÉES — le dernier recours, et le plus fragile. N'est posé qu'en dernier,
     donc seulement là où rien ne contraint la colonne. `n_distinct` négatif veut dire « Postgres
     estime une PROPORTION de lignes distinctes » : la colonne est quasi unique, il n'y a pas de
     liste à en tirer. Au-delà de 40 valeurs non plus : ce n'est plus un vocabulaire.

     ══ ET UN ÉCHANTILLON DE DONNÉES N'EST PAS UNE LISTE DE VALEURS ══════════════════════════════

     La première version rendait ceci, et c'était deux fautes à la fois :

       appels_non_rattaches.decroche_par : Thomas LE GUEN | Fabien DUBARRY | Matthieu BRUERE …
       appels_en_cours.user_email        : m.thonnard@kiwee-energie.fr | m.bruere@kiwee-energie.fr …
       comptes.date_modification         : 2026-09-10 10:27:30.261615+00 | 2026-08-03 14:21:12 …

     · Ce ne sont pas des valeurs POSSIBLES. Personne ne choisit « Thomas LE GUEN » dans un menu :
       c'est le contenu du moment, et il aura changé demain. La colonne « valeurs possibles » d'un
       champ nom, courriel ou date ne veut rien dire — écrire du contenu à la place est plus faux
       qu'un blanc, parce que ça se lit comme une règle.
     · Et ce catalogue est fait pour être DÉPOSÉ DANS UN DRIVE et ouvert en Sheet — c'est la demande
       de Naoëlle du 08/09. Y recopier les noms et les adresses de l'équipe, sans que personne ne
       l'ait demandé, c'est disséminer des données personnelles dans un fichier qui circule.

     Le filtre ci-dessous exclut donc ce qui ne peut pas être un vocabulaire : les types qui ne s'en
     font jamais un (dates, uuid, JSON), puis, à la lecture des valeurs, les adresses, numéros,
     horodatages, phrases et « Prénom NOM ». Il vaut mieux un blanc qu'un faux vocabulaire. */
  const TYPES_SANS_VOCABULAIRE = /^(timestamp|date|time|uuid|json|bytea|interval|numeric|double|real)/

  /** Une valeur qui n'a rien à faire dans une liste de valeurs possibles. */
  const estDuContenu = (v) =>
    /[\w.+-]+@[\w-]+\.\w+/.test(v) // une adresse électronique
    || /\b0[1-9](?:[ .-]?\d{2}){4}\b/.test(v) // un numéro de téléphone français
    || /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(v) // une date
    || /^\d{9,}$/.test(v) // un SIRET, un PDL, un identifiant
    || v.length > 44 // une phrase
    || /[.!?]$/.test(v) // une phrase, encore
    || /^[A-ZÀ-Ý][a-zà-ÿ'-]+ [A-ZÀ-Ý][A-ZÀ-Ý'\s-]+$/.test(v) // « Prénom NOM » : une personne

  const typeDe = new Map(colonnes.rows.map((r) => [`${r.table_name}.${r.column_name}`, r.data_type]))

  const stats = await client.query(`
    select tablename, attname, n_distinct, most_common_vals::text as vals
      from pg_stats
     where schemaname = 'public' and n_distinct between 1 and 40 and most_common_vals is not null`)
  const ecartees = []
  for (const r of stats.rows) {
    const cle = `${r.tablename}.${r.attname}`
    if (valeurs.has(cle)) continue // déjà contraint : rien à observer
    if (TYPES_SANS_VOCABULAIRE.test(typeDe.get(cle) ?? '')) continue
    const observees = tableauTexte(r.vals)
    if (!observees.length) continue
    /* UNE SEULE VALEUR SUSPECTE DISQUALIFIE TOUTE LA LISTE, et non elle seule. Filtrer valeur par
       valeur laisserait passer les noms qui ne ressemblent pas à un nom — et surtout rendrait une
       liste amputée en la présentant comme complète. */
    if (observees.some(estDuContenu)) {
      ecartees.push(cle)
      continue
    }
    const lisibles = observees.map((v) => (v === 't' ? 'oui' : v === 'f' ? 'non' : v))
    const complet = lisibles.length >= Number(r.n_distinct)
    poser(
      `${r.tablename}.${r.attname}`,
      abreger(lisibles) + (complet ? '' : ` | … (${r.n_distinct} valeurs distinctes en base)`),
      complet
        ? 'valeurs OBSERVÉES dans les données — rien ne les contraint, une nouvelle peut apparaître'
        : 'valeurs les plus fréquentes OBSERVÉES — la liste n’est pas exhaustive',
    )
  }

  for (const r of colonnes.rows) {
    poser(`${r.table_name}.${r.column_name}`, 'libre (' + r.data_type + ')', 'aucune contrainte de valeur')
  }

  /* CE QUI A ÉTÉ ÉCARTÉ EST COMPTÉ, PAS OUBLIÉ. C'est un angle mort de la carte au même titre que
     les `select('*')` : ces champs n'ont pas de liste de valeurs ici, et on doit savoir que c'est
     un refus délibéré plutôt qu'une absence de contrainte. */
  valeurs.ecartees = ecartees

  return valeurs
}

module.exports = { lireValeurs, valeursDuCheck, tableauTexte, nettoyerLitteral }
