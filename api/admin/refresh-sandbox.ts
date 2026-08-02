import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Rafraichit la sandbox avec les dernieres donnees de prod -- declenche depuis l'admin de la
// PROD (comme la page "Sandbox" de Salesforce, geree depuis l'org de production), pas depuis la
// sandbox elle-meme. Toujours a sens unique : lit CETTE base (prod, via ses propres identifiants
// deja configures), ecrit UNIQUEMENT sur SANDBOX_SUPABASE_URL (jamais l'inverse).
//
// La purge de chaque table passe par la fonction SQL admin_truncate_table (voir
// lot10/add_admin_truncate_function.sql) plutot qu'un DELETE via PostgREST : certaines tables
// (jonctions, extensions 1-1 comme comptes_clients/compteurs_electricite) n'ont pas de colonne
// "id" simple, donc un DELETE filtre sur "id" echoue -- TRUNCATE marche quelle que soit la
// structure et gere l'ordre parents/enfants automatiquement via CASCADE.

const EXCLUDED_TABLES = new Set(['profils_gmail_tokens', 'parametres_slack'])

const TABLES_IN_ORDER = [
  'types_comptes', 'types_energies', 'types_utilisations_compteur', 'types_courtiers_mandat',
  'types_interactions', 'types_signaux', 'types_documents', 'types_sites', 'types_origines',
  'types_actions', 'types_canaux_communication', 'types_formules_tarifaires', 'types_optimisations',
  'types_analyses', 'types_calculs', 'types_donnees', 'types_evenements_metier',
  'types_parametres_calcul', 'types_resultats_calcul', 'types_composantes_turpe', 'types_roles',
  'statuts_contrats', 'statuts_mandats', 'statuts_versions_recommandation', 'statuts_signaux',
  'statuts_actions', 'statuts_consultations_fournisseurs', 'statuts_executions', 'statuts_expertises',
  'etapes_recommandation', 'motifs_versions_recommandation', 'issues_interactions', 'segments_comptes',
  'organisations', 'equipes', 'perimetres_acces',
  'permissions', 'postes', 'roles_acces', 'postes_permissions', 'roles_acces_permissions',
  'profils', 'profils_autorises', 'profils_equipes', 'profils_organisations', 'profils_postes', 'profils_roles_acces',
  'domaines_expertise', 'expertises', 'composants_expertise', 'regles_expertise', 'moteurs_calcul',
  'algorithmes_parametres', 'parametres_algorithmes', 'coefficients_turpe', 'composantes_tarifaires',
  'formules_tarifaires_turpe', 'postes_tarifaires', 'versions_turpe',
  'comptes', 'comptes_clients', 'comptes_fournisseurs', 'comptes_partenaires',
  'contacts', 'sites', 'contacts_sites',
  'compteurs', 'compteurs_electricite', 'compteurs_gaz', 'consommations',
  'contrats', 'contrats_compteurs', 'contrats_compteurs_tarifs',
  'mandats', 'mandats_compteurs', 'mandats_courtiers',
  'recommandations', 'recommandations_mandats', 'recommandations_sites',
  'versions_recommandation', 'versions_recommandation_compteurs',
  'optimisations', 'optimisations_fournisseurs', 'suivis_consultations_fournisseurs',
  'offres_fournisseurs', 'offres_fournisseurs_compteurs', 'offres_compteurs_electricite', 'offres_compteurs_gaz',
  'signaux', 'interactions', 'actions', 'documents',
  'profils_comptes', 'historique_modifications', 'historiques_entites',
  'demandes_support', 'evenements_metier', 'traitements_evenements',
  'analyses', 'executions_calculs', 'executions_composants_expertise', 'executions_domaines_expertise',
  'executions_regles_expertise', 'decisions_algorithmes', 'resultats_algorithmes', 'algorithmes_resultats',
  'sessions_expertise',
].filter((t) => !EXCLUDED_TABLES.has(t))

interface TableResult {
  table: string
  rows: number
  error?: string
}

async function refreshTable(source: SupabaseClient, target: SupabaseClient, table: string): Promise<TableResult> {
  const { data, error: readError } = await source.from(table).select('*')
  if (readError) return { table, rows: 0, error: 'lecture: ' + readError.message }
  if (!data) return { table, rows: 0 }

  const { error: truncError } = await target.rpc('admin_truncate_table', { table_name: table })
  if (truncError) return { table, rows: 0, error: 'purge sandbox: ' + truncError.message }
  if (data.length === 0) return { table, rows: 0 }

  const BATCH = 500
  for (let i = 0; i < data.length; i += BATCH) {
    const { error: insertError } = await target.from(table).insert(data.slice(i, i + BATCH))
    if (insertError) return { table, rows: i, error: 'ecriture sandbox: ' + insertError.message }
  }
  return { table, rows: data.length }
}

// Reponse en NDJSON (une ligne JSON par evenement) pour que le front puisse afficher une
// progression en direct (table X/Y) plutot qu'une simple attente aveugle.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Non authentifié' })
    return
  }

  const ownUrl = process.env.VITE_SUPABASE_URL
  const ownAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const ownServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const sandboxUrl = process.env.SANDBOX_SUPABASE_URL
  const sandboxServiceRoleKey = process.env.SANDBOX_SUPABASE_SERVICE_ROLE_KEY
  if (!ownUrl || !ownAnonKey || !ownServiceRoleKey || !sandboxUrl || !sandboxServiceRoleKey) {
    res.status(500).json({ error: 'Configuration serveur incomplète (variables sandbox manquantes)' })
    return
  }
  if (sandboxUrl === ownUrl) {
    res.status(500).json({ error: 'SANDBOX_SUPABASE_URL pointe vers la même base que la prod — annulé par sécurité' })
    return
  }

  const ownAuthed = createClient(ownUrl, ownAnonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await ownAuthed.auth.getUser()
  if (userError || !userData.user) {
    res.status(401).json({ error: 'Session invalide' })
    return
  }

  const own = createClient(ownUrl, ownServiceRoleKey)

  const { data: callerRoleRow } = await own
    .from('profils_roles_acces')
    .select('role_acces:roles_acces(code)')
    .eq('profil_id', userData.user.id)
    .maybeSingle()
  const callerCode = (callerRoleRow?.role_acces as unknown as { code: string } | null)?.code
  if (callerCode !== 'ADMIN' && callerCode !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Réservé aux administrateurs' })
    return
  }

  const sandbox = createClient(sandboxUrl, sandboxServiceRoleKey)

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' })

  const results: TableResult[] = []
  let remaining = [...TABLES_IN_ORDER]
  const total = remaining.length
  let done = 0
  for (let pass = 1; pass <= 3 && remaining.length > 0; pass++) {
    const stillFailing: string[] = []
    for (const table of remaining) {
      const result = await refreshTable(own, sandbox, table)
      if (result.error && pass < 3) {
        stillFailing.push(table)
      } else {
        results.push(result)
        done++
        res.write(JSON.stringify({ type: 'progress', table, done, total, rows: result.rows, error: result.error }) + '\n')
      }
    }
    remaining = stillFailing
  }

  const failed = results.filter((r) => r.error)

  await own.from('historique_modifications').insert({
    table_nom: 'sandbox',
    ligne_id: userData.user.id,
    champ: 'refresh',
    ancienne_valeur: null,
    nouvelle_valeur: failed.length === 0 ? 'Sandbox rafraîchie avec succès' : `Rafraîchie avec ${failed.length} erreur(s)`,
    modifie_par_id: userData.user.id,
  })

  res.write(
    JSON.stringify({
      type: 'done',
      ok: failed.length === 0,
      tablesOk: results.length - failed.length,
      tablesFailed: failed,
      totalRows: results.reduce((sum, r) => sum + r.rows, 0),
    }) + '\n',
  )
  res.end()
}
