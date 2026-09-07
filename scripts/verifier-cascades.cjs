// ════════════════════════════════════════════════════════════════════════════════════════════════
// AUCUN OBJET ENFANT NE DOIT POUVOIR EMPORTER SON PARENT
//
// Naoëlle, 07/09/2026, après que Guillaume a perdu le compte « ALAIN - CHEZ GILLES (BAR DE
// L'ADOUR) » : « il ne faut absolument pas que supprimer un objet enfant du compte supprime le
// compte, il faut enlever cette règle-là absolument. »
//
// Cette règle n'existait pas — vérifié six fois le jour même : `comptes` ne porte que cinq clés
// étrangères, toutes en NO ACTION ; aucune règle Postgres dans le schéma ; aucun déclencheur de
// suppression sur `contacts` ni sur `comptes` ; `contacts` et `comptes` sont de vraies tables et non
// des vues avec un INSTEAD OF ; aucune fonction en base ne supprime de compte ; et `useDeleteContact`
// n'a jamais fait qu'un `delete` sur `contacts`, depuis son premier commit du 22/07/2026.
//
// Mais « ça n'existe pas aujourd'hui » n'est pas une garantie. Une clé étrangère mal orientée
// s'ajoute en une ligne de migration, et ne se voit nulle part à l'écran : elle se découvre le jour
// où quelqu'un perd un compte. Ce script transforme donc la demande en garde-fou permanent.
//
// ── CE QU'IL CHERCHE ──
//
// Le SENS INTERDIT : une table PARENTE dont une clé étrangère est en `on delete cascade` vers une de
// ses tables ENFANTS. Exemple de ce qu'il refuserait :
//
//   alter table comptes add constraint fk_principal
//     foreign key (contact_principal_id) references contacts(id) on delete cascade;
//
// Cette ligne est innocente à la lecture. Elle veut dire : « quand ce contact disparaît, supprime le
// compte ». C'est exactement l'accident qu'on veut rendre impossible.
//
// ── COMMENT IL SAIT QUI EST LE PARENT ──
//
// Par la hiérarchie métier de Kimatch, déclarée ci-dessous et non devinée. Compte → Site →
// Compteur ; Compte → Contact ; et les objets de cotation sous eux. Un cascade qui remonte cette
// hiérarchie est une erreur ; un cascade qui la descend est le comportement voulu.
//
// ── USAGE ──
//
//   node scripts/verifier-cascades.cjs
//
// Sort en code 1 s'il trouve un sens interdit, en 0 sinon. À lancer après toute migration qui touche
// aux clés étrangères.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.resolve(__dirname, '..')

/**
 * LA HIÉRARCHIE MÉTIER, du plus général au plus précis.
 *
 * Chaque entrée dit : « cette table est un PARENT de celles-ci ». Le sens autorisé va du parent vers
 * l'enfant — supprimer un compte emporte ses sites. Le sens inverse est refusé.
 *
 * Elle est volontairement courte : elle ne couvre que les objets qu'un utilisateur reconnaît et
 * risque de supprimer depuis une fiche. Un lien technique entre deux tables de jointure ne présente
 * pas ce danger, parce que personne ne les supprime à la main.
 */
const ENFANTS_DE = {
  comptes: ['contacts', 'sites', 'compteurs', 'contrats', 'mandats', 'recommandations', 'opportunites', 'signaux', 'pistes', 'requetes', 'interactions'],
  sites: ['compteurs', 'contrats', 'signaux', 'requetes', 'interactions'],
  compteurs: ['consommations', 'signaux', 'requetes'],
  contrats: ['suivis_contrats', 'remunerations', 'requetes'],
  recommandations: ['versions_recommandation', 'contrats', 'remunerations'],
  versions_recommandation: ['offres_fournisseurs', 'optimisations'],
  contacts: ['interactions', 'actions', 'requetes'],
  mandats: ['recommandations'],
}

/** Toutes les paires interdites, aplaties : « si <parent> casca­de vers <enfant>, c'est une erreur ». */
function pairesInterdites() {
  const paires = []
  for (const [parent, enfants] of Object.entries(ENFANTS_DE)) {
    for (const enfant of enfants) paires.push([parent, enfant])
  }
  return paires
}

const REQUETE = `
  select src.relname as table_source,
         (select string_agg(a.attname, ', ' order by k.ord)
            from unnest(c.conkey) with ordinality k(att, ord)
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att) as colonne,
         cible.relname as pointe_vers,
         c.conname as contrainte
  from pg_constraint c
  join pg_class src   on src.oid = c.conrelid
  join pg_class cible on cible.oid = c.confrelid
  join pg_namespace n on n.oid = src.relnamespace
  where c.contype = 'f' and c.confdeltype = 'c' and n.nspname = 'public'
`

async function main() {
  const cheminEnv = path.join(RACINE, '.env.local')
  if (!fs.existsSync(cheminEnv)) {
    console.error('.env.local introuvable : ' + cheminEnv)
    process.exit(1)
  }
  const url = fs.readFileSync(cheminEnv, 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m)
  if (!url) {
    console.error('SUPABASE_DB_URL absent de .env.local.')
    process.exit(1)
  }

  const client = new Client({ connectionString: url[1].trim(), ssl: { rejectUnauthorized: false } })
  await client.connect()
  let cascades
  try {
    cascades = (await client.query(REQUETE)).rows
  } finally {
    await client.end()
  }

  const interdites = pairesInterdites()
  const fautes = cascades.filter((c) =>
    interdites.some(([parent, enfant]) => c.table_source === parent && c.pointe_vers === enfant))

  console.log(`${cascades.length} clés étrangères en « on delete cascade » dans le schéma.`)

  if (fautes.length === 0) {
    console.log('\n✓ Aucun sens interdit : supprimer un objet enfant ne peut pas emporter son parent.')
    process.exit(0)
  }

  console.error(`\n✗ ${fautes.length} CASCADE DANS LE SENS INTERDIT\n`)
  for (const f of fautes) {
    console.error(`  ${f.table_source}.${f.colonne} → ${f.pointe_vers}  (${f.contrainte})`)
    console.error(`    Supprimer un ${f.pointe_vers.replace(/s$/, '')} supprimerait le ${f.table_source.replace(/s$/, '')}.`)
    console.error(`    Correction : alter table ${f.table_source} drop constraint ${f.contrainte};`)
    console.error(`                 alter table ${f.table_source} add constraint ${f.contrainte}`)
    console.error(`                   foreign key (${f.colonne}) references ${f.pointe_vers}(id) on delete set null;\n`)
  }
  process.exit(1)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
