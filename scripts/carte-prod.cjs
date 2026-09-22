// ════════════════════════════════════════════════════════════════════════════════════════════════
// CE CHAMP SERT-IL ENCORE EN PRODUCTION — ET À QUOI ?
//
// William, 14/09/2026 : « si ce champ est utilisé en prod (par des règles, des formules, des process
// ou autre) ».
//
// ══ « L'APP NE LE LIT PAS » NE VEUT PAS DIRE « IL NE SERT À RIEN » ═════════════════════════════
//
// `cartographier-donnees.cjs` répond déjà à « quel écran lit cette colonne ». C'est la moitié de la
// question, et c'est la moitié qui trompe le plus : une colonne qu'aucun écran ne nomme peut être
// celle qui décide de tout. Trois exemples pris dans cette base :
//
//   · `recommandations.date_cloture_manuelle` n'est lue par aucun `select` nommé, et c'est elle qui
//     fait qu'un dossier clôturé à la main reste clôturé (fonction `recalculer_statut_recommandation`).
//     La supprimer parce qu'elle « n'est pas lue » rouvrirait les dossiers.
//   · `contrats.date_fin` n'est écrite nulle part dans le code : c'est un déclencheur qui la pose.
//   · toutes les colonnes citées par une policy RLS sont invisibles au code ET décident de qui voit
//     quoi. 271 policies en portent.
//
// Ce module lit donc les SIX mécanismes qui font vivre une colonne côté base, en plus du code.
//
// ══ LA PORTÉE EST EXACTE PARTOUT SAUF POUR LES FONCTIONS LIBRES, ET C'EST DIT ══════════════════
//
// Chercher un nom de colonne dans du SQL, c'est risquer d'attribuer `nom` — qui existe sur seize
// tables — à toutes. Le piège est évité en prenant la table À LA SOURCE plutôt qu'en la devinant :
//
//   contraintes, index, colonnes générées   `conkey`/`indkey` donnent la colonne exacte.  CERTAIN
//   vues                                    `view_column_usage` donne le couple exact.     CERTAIN
//   policies RLS                            `pg_policies.tablename` donne la table ;
//                                           le nom de colonne est cherché dans SA formule. CERTAIN
//   déclencheurs                            `pg_trigger.tgrelid` donne la table ; le nom est
//                                           cherché dans le corps de SA fonction.          CERTAIN
//   fonctions libres (RPC, calculs)         aucune table attachée : on n'attribue que si le corps
//                                           cite LA TABLE ET LA COLONNE.                   PROBABLE
//
// Le dernier cas est le seul faillible, et il est marqué « probable » dans la sortie plutôt que
// fondu dans les autres. Une carte qui donne un faux « utilisé en prod » est pire qu'un blanc :
// elle protège une colonne morte pour toujours.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Le nom de colonne est-il cité comme un mot entier dans ce SQL ? `id` ne doit pas matcher `site_id`. */
function cite(sql, colonne) {
  if (!sql) return false
  const echappe = colonne.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(String.raw`(^|[^a-zA-Z0-9_])${echappe}([^a-zA-Z0-9_]|$)`).test(sql)
}

/**
 * Pour chaque colonne, les mécanismes de la base qui s'en servent.
 *
 * @returns {Promise<Map<string, Array<{genre: string, nom: string, certain: boolean}>>>}
 */
async function lireUsageSql(client) {
  const usage = new Map()
  const ajouter = (table, colonne, genre, nom, certain = true) => {
    const cle = `${table}.${colonne}`
    if (!usage.has(cle)) usage.set(cle, [])
    const liste = usage.get(cle)
    if (!liste.some((m) => m.genre === genre && m.nom === nom)) liste.push({ genre, nom, certain })
  }

  // ── LES RÈGLES : contraintes et index ─────────────────────────────────────────────────────────
  /* `unnest(conkey) with ordinality` déplie une contrainte multi-colonnes en une ligne par colonne :
     une clé unique sur (compte_id, reference) doit compter pour les deux. */
  const contraintes = await client.query(`
    select co.conrelid::regclass::text as table_nom, a.attname as colonne,
           co.contype, co.conname
      from pg_constraint co
      join pg_namespace n on n.oid = co.connamespace
      join unnest(co.conkey) as k(attnum) on true
      join pg_attribute a on a.attrelid = co.conrelid and a.attnum = k.attnum
     where n.nspname = 'public' and co.contype in ('c', 'u', 'f', 'p')`)
  const GENRE_CONTRAINTE = { c: 'règle (CHECK)', u: 'règle (unicité)', f: 'règle (clé étrangère)', p: 'clé primaire' }
  for (const r of contraintes.rows) {
    ajouter(r.table_nom, r.colonne, GENRE_CONTRAINTE[r.contype], r.conname)
  }

  const index = await client.query(`
    select c.relname as table_nom, a.attname as colonne, i.relname as index_nom, x.indisunique
      from pg_index x
      join pg_class c on c.oid = x.indrelid
      join pg_class i on i.oid = x.indexrelid
      join pg_namespace n on n.oid = c.relnamespace
      join unnest(x.indkey) as k(attnum) on true
      join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
     where n.nspname = 'public' and not x.indisprimary`)
  for (const r of index.rows) {
    ajouter(r.table_nom, r.colonne, r.indisunique ? 'règle (unicité)' : 'index', r.index_nom)
  }

  // ── LES FORMULES : colonnes calculées et valeurs par défaut ───────────────────────────────────
  const colonnes = await client.query(`
    select table_name, column_name, is_generated, generation_expression, column_default, is_nullable
      from information_schema.columns where table_schema = 'public'`)
  for (const r of colonnes.rows) {
    if (r.is_generated === 'ALWAYS') {
      ajouter(r.table_name, r.column_name, 'formule (colonne générée)', r.generation_expression ?? '')
    }
    /* UNE VALEUR PAR DÉFAUT N'EST PAS TOUJOURS UNE FORMULE. `now()`, `gen_random_uuid()` ou un appel
       de fonction en sont une ; `false` ou `0` n'est qu'une valeur initiale, et l'inscrire comme
       « formule » gonflerait la colonne « utilisé en prod » de 645 faux positifs. */
    if (r.column_default && /\(/.test(r.column_default)) {
      ajouter(r.table_name, r.column_name, 'formule (valeur par défaut)', r.column_default)
    }
    if (r.is_nullable === 'NO') ajouter(r.table_name, r.column_name, 'règle (obligatoire)', 'NOT NULL')
  }

  // ── LES PROCESS : vues, policies, déclencheurs, fonctions ─────────────────────────────────────
  const vues = await client.query(`
    select view_name, table_name as table_source, column_name
      from information_schema.view_column_usage
     where view_schema = 'public'`)
  for (const r of vues.rows) ajouter(r.table_source, r.column_name, 'vue', r.view_name)

  const policies = await client.query(`
    select tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as formule
      from pg_policies where schemaname = 'public'`)
  const colonnesDe = new Map()
  for (const r of colonnes.rows) {
    if (!colonnesDe.has(r.table_name)) colonnesDe.set(r.table_name, [])
    colonnesDe.get(r.table_name).push(r.column_name)
  }
  for (const r of policies.rows) {
    for (const col of colonnesDe.get(r.tablename) ?? []) {
      if (cite(r.formule, col)) ajouter(r.tablename, col, 'process (droits RLS)', r.policyname)
    }
  }

  /* LE DÉCLENCHEUR CONNAÎT SA TABLE, SA FONCTION NON. `tgrelid` donne la table exacte : chercher le
     nom de colonne dans le corps de la fonction appelée est donc bien borné, même si cette fonction
     sert à dix tables — on n'attribue qu'aux colonnes de CETTE table-là. */
  const declencheurs = await client.query(`
    select tg.tgname, tg.tgrelid::regclass::text as table_nom, p.proname, p.prosrc
      from pg_trigger tg
      join pg_proc p on p.oid = tg.tgfoid
      join pg_class c on c.oid = tg.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where not tg.tgisinternal and n.nspname = 'public'`)
  for (const r of declencheurs.rows) {
    for (const col of colonnesDe.get(r.table_nom) ?? []) {
      if (cite(r.prosrc, col)) {
        ajouter(r.table_nom, col, 'process (déclencheur)', `${r.tgname} → ${r.proname}()`)
      }
    }
  }

  /* LES FONCTIONS LIBRES — le seul maillon faillible, et il est marqué comme tel. On n'attribue que
     si le corps cite la table ET la colonne : sans la table, `nom` irait sur seize tables. Ça reste
     une présomption — une fonction peut nommer `comptes` pour une jointure et `libelle` pour une
     autre table — d'où `certain: false` et le mot « probable » dans la sortie. */
  const fonctions = await client.query(`
    select p.proname, p.prosrc, p.prokind
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc is not null`)
  const nomsDeclencheurs = new Set(declencheurs.rows.map((r) => r.proname))
  for (const f of fonctions.rows) {
    if (nomsDeclencheurs.has(f.proname)) continue // déjà attribuée exactement, ci-dessus
    for (const [table, cols] of colonnesDe) {
      if (!cite(f.prosrc, table)) continue
      for (const col of cols) {
        if (cite(f.prosrc, col)) {
          ajouter(table, col, 'process (fonction SQL)', f.proname + '()', false)
        }
      }
    }
  }

  return usage
}

/** Un résumé lisible : « oui — règle, formule, process » ou « non ». */
function resumer(mecanismes) {
  if (!mecanismes || !mecanismes.length) return { verdict: 'non', detail: '' }
  const certains = mecanismes.filter((m) => m.certain)
  const familles = [...new Set((certains.length ? certains : mecanismes).map((m) => m.genre.replace(/ \(.*/, '')))]
  return {
    verdict: certains.length ? 'oui' : 'probable',
    detail: mecanismes
      .map((m) => m.genre + (m.nom ? ' : ' + String(m.nom).slice(0, 90) : '') + (m.certain ? '' : ' (probable)'))
      .join(' · '),
    familles: familles.join(', '),
  }
}

module.exports = { lireUsageSql, resumer, cite }
