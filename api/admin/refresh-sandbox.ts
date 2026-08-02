import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Rafraichit la base sandbox avec les dernieres donnees de prod (comme un "Refresh" de sandbox
// Salesforce) -- toujours a sens unique : lit la prod, ecrit UNIQUEMENT sur la base sandbox
// (celle du deploiement sur lequel cette fonction tourne). Jamais l'inverse, jamais la meme
// fonction deployee sur la prod (PROD_SUPABASE_* ne doit exister que sur le projet Vercel sandbox).

// Tables volontairement exclues : donnees personnelles/secretes qui ne doivent jamais transiter
// vers un environnement de test.
const EXCLUDED_TABLES = new Set(['profils_gmail_tokens', 'parametres_slack'])

// Ordre de dependances "raisonnable" (parents avant enfants) -- les eventuelles erreurs de FK
// sont de toute facon retentees sur plusieurs passages, donc l'ordre exact n'a pas besoin d'etre
// parfait.
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
  // Vraies donnees (comptes, sites, etc.)
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

async function refreshTable(prod: SupabaseClient, sandbox: SupabaseClient, table: string): Promise<TableResult> {
  const { data, error: readError } = await prod.from(table).select('*')
  if (readError) return { table, rows: 0, error: 'lecture prod: ' + readError.message }
  if (!data) return { table, rows: 0 }

  const { error: deleteError } = await sandbox.from(table).delete().not('id', 'is', null)
  if (deleteError) return { table, rows: 0, error: 'purge sandbox: ' + deleteError.message }

  if (data.length === 0) return { table, rows: 0 }

  const BATCH = 500
  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH)
    const { error: insertError } = await sandbox.from(table).insert(batch)
    if (insertError) return { table, rows: i, error: 'ecriture sandbox: ' + insertError.message }
  }
  return { table, rows: data.length }
}

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

  const sandboxUrl = process.env.VITE_SUPABASE_URL
  const sandboxAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const sandboxServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const prodUrl = process.env.PROD_SUPABASE_URL
  const prodServiceRoleKey = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY
  if (!sandboxUrl || !sandboxAnonKey || !sandboxServiceRoleKey || !prodUrl || !prodServiceRoleKey) {
    res.status(500).json({ error: 'Configuration serveur incomplète (variables sandbox/prod manquantes)' })
    return
  }

  // Garde-fou : cette route ne doit exister que sur le deploiement sandbox. Si jamais elle
  // tournait sur la prod par erreur (mauvais VITE_ENV_LABEL), on refuse tout.
  if (process.env.VITE_ENV_LABEL !== 'sandbox') {
    res.status(403).json({ error: "Cette route n'est active que sur le déploiement sandbox" })
    return
  }

  const sandboxAuthed = createClient(sandboxUrl, sandboxAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await sandboxAuthed.auth.getUser()
  if (userError || !userData.user) {
    res.status(401).json({ error: 'Session invalide' })
    return
  }

  const sandbox = createClient(sandboxUrl, sandboxServiceRoleKey)

  const { data: callerRoleRow } = await sandbox
    .from('profils_roles_acces')
    .select('role_acces:roles_acces(code)')
    .eq('profil_id', userData.user.id)
    .maybeSingle()
  const callerCode = (callerRoleRow?.role_acces as unknown as { code: string } | null)?.code
  if (callerCode !== 'ADMIN' && callerCode !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Réservé aux administrateurs' })
    return
  }

  const prod = createClient(prodUrl, prodServiceRoleKey)

  const results: TableResult[] = []
  let remaining = [...TABLES_IN_ORDER]
  for (let pass = 1; pass <= 3 && remaining.length > 0; pass++) {
    const stillFailing: string[] = []
    for (const table of remaining) {
      const result = await refreshTable(prod, sandbox, table)
      if (result.error && pass < 3) {
        stillFailing.push(table)
      } else {
        results.push(result)
      }
    }
    remaining = stillFailing
  }

  const failed = results.filter((r) => r.error)
  res.status(200).json({
    ok: failed.length === 0,
    tablesOk: results.length - failed.length,
    tablesFailed: failed,
    totalRows: results.reduce((sum, r) => sum + r.rows, 0),
  })
}
