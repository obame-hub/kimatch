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

  // ── VINGT-QUATRE TABLES QUI MANQUAIENT, AJOUTÉES LE 31/08/2026 ─────────────────────────────
  //
  // Cette liste est écrite à la main, et rien ne signalait qu'elle avait pris du retard : la base
  // portait 133 tables, la liste en nommait 107. Les 24 restantes n'étaient pas recopiées — sans
  // erreur, sans avertissement. La sandbox était donc VIDE là où la production ne l'est pas :
  // 3 535 rattachements contact-compte, 2 098 liens recommandation-compteur, 1 907 durées de
  // version. Répéter un geste dans une sandbox qui a perdu ses tables de liaison ne prouve rien.
  //
  // L'ordre suit toujours la même règle : les références et les statuts d'abord, les liaisons
  // ensuite, pour que les clés étrangères trouvent leur cible.
  'types_requetes', 'types_objectifs_client',
  'statuts_contrats_avancement', 'statuts_contrats_vie', 'statuts_opportunites', 'statuts_requetes',
  'eligibility_rules', 'mapping_rules', 'parametres_emails',
  'contacts_comptes',
  'listes', 'pistes',
  'opportunites', 'opportunites_compteurs', 'opportunites_sites',
  'recommandations_compteurs', 'recommandations_objectifs',
  'versions_recommandation_durees',
  'requetes', 'remunerations', 'objectifs_mensuels', 'partages_etude_client',
  'docusign_sessions', 'proprietaires_en_attente',
].filter((t) => !EXCLUDED_TABLES.has(t))

interface TableResult {
  table: string
  rows: number
  error?: string
}

// Phase 1 : vide TOUTES les tables avant de rien reinserer. TRUNCATE ... CASCADE sur une table
// vide aussi tout ce qui la reference ailleurs dans le schema (ex. truncate "profils" vide en
// cascade "recommandations", "interactions", etc. qui ont un profil comme proprietaire/auteur) --
// si la purge et le remplissage etaient entrelaces table par table, un truncate tardif pouvait
// effacer des donnees deja correctement reinserees plus tot. En vidant tout d'abord, ce risque
// disparait completement.
async function truncateTable(target: SupabaseClient, table: string): Promise<{ table: string; error?: string }> {
  const { error } = await target.rpc('admin_truncate_table', { table_name: table })
  return error ? { table, error: 'purge sandbox: ' + error.message } : { table }
}

// Phase 2 : remplit chaque table depuis la prod, dans l'ordre (avec plusieurs passages pour les
// FK qui dependent d'une table plus bas dans la liste).
async function insertTable(source: SupabaseClient, target: SupabaseClient, table: string): Promise<TableResult> {
  const { data, error: readError } = await source.from(table).select('*')
  if (readError) return { table, rows: 0, error: 'lecture: ' + readError.message }
  if (!data || data.length === 0) return { table, rows: 0 }

  const BATCH = 500
  for (let i = 0; i < data.length; i += BATCH) {
    const { error: insertError } = await target.from(table).insert(data.slice(i, i + BATCH))
    if (insertError) return { table, rows: i, error: 'ecriture sandbox: ' + insertError.message }
  }
  return { table, rows: data.length }
}

// Phase 3 : reconcilie les vrais utilisateurs de la sandbox. Se connecter a la sandbox cree un
// utilisateur Auth avec un id DIFFERENT de celui du meme email cote prod (deux projets Supabase
// Auth distincts) -- le "profils" copie a la phase 2 reste donc rattache a l'ancien id prod, et
// la personne se retrouve sans aucun role ("aucun role attribue"), sans compte visible
// (fetchComptesVisibles filtre par profil_id) et sans acces admin. On redonne SUPER_ADMIN a
// quiconque a deja un compte Auth sur la sandbox : ce n'est qu'un environnement de test, la
// seule vraie barriere d'acces est le lien magique reçu par email (profils_autorises).
async function reconcileSandboxUsers(sandbox: SupabaseClient): Promise<{ count: number; error?: string }> {
  const { data: role, error: roleError } = await sandbox.from('roles_acces').select('id').eq('code', 'SUPER_ADMIN').maybeSingle()
  if (roleError) return { count: 0, error: roleError.message }
  if (!role) return { count: 0, error: 'rôle SUPER_ADMIN introuvable dans la sandbox' }

  const { data: usersData, error: listError } = await sandbox.auth.admin.listUsers({ perPage: 200 })
  if (listError) return { count: 0, error: listError.message }

  let count = 0
  for (const user of usersData.users) {
    if (!user.email) continue
    const meta = user.user_metadata as Record<string, string> | undefined
    const { data: existingProfil } = await sandbox.from('profils').select('id').eq('id', user.id).maybeSingle()
    if (!existingProfil) {
      await sandbox.from('profils').insert({
        id: user.id,
        email: user.email,
        prenom: meta?.prenom ?? user.email.split('@')[0],
        nom: meta?.nom ?? '',
        actif: true,
      })
    }
    const { data: existingRole } = await sandbox
      .from('profils_roles_acces')
      .select('profil_id')
      .eq('profil_id', user.id)
      .eq('role_acces_id', role.id)
      .maybeSingle()
    if (!existingRole) {
      await sandbox.from('profils_roles_acces').insert({ profil_id: user.id, role_acces_id: role.id })
    }
    count++
  }
  return { count }
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

  // Phase 1 : tout vider d'abord (l'ordre n'a pas d'importance, CASCADE s'en charge).
  const totalSteps = TABLES_IN_ORDER.length * 2
  let done = 0
  const truncateErrors: string[] = []
  for (const table of TABLES_IN_ORDER) {
    const result = await truncateTable(sandbox, table)
    if (result.error) truncateErrors.push(`${table} (${result.error})`)
    done++
    res.write(JSON.stringify({ type: 'progress', table: `Purge : ${table}`, done, total: totalSteps }) + '\n')
  }

  // Phase 2 : tout remplir, avec plusieurs passages pour les FK qui dependent d'une table listee
  // plus bas (aucun nouveau truncate ici, donc plus aucun risque d'effacer une donnee deja bonne).
  const results: TableResult[] = []
  let remaining = [...TABLES_IN_ORDER]
  for (let pass = 1; pass <= 3 && remaining.length > 0; pass++) {
    const stillFailing: string[] = []
    for (const table of remaining) {
      const result = await insertTable(own, sandbox, table)
      if (result.error && pass < 3) {
        stillFailing.push(table)
      } else {
        results.push(result)
        done++
        res.write(JSON.stringify({ type: 'progress', table, done, total: totalSteps, rows: result.rows, error: result.error }) + '\n')
      }
    }
    remaining = stillFailing
  }

  const failed = results.filter((r) => r.error)
  for (const table of truncateErrors) failed.push({ table, rows: 0, error: 'purge' })

  // Phase 3 : ne s'exécute que si les données de base (rôles) ont bien été copiées.
  const reconcile = await reconcileSandboxUsers(sandbox)
  res.write(JSON.stringify({ type: 'progress', table: 'Réconciliation des accès sandbox', done: totalSteps, total: totalSteps, rows: reconcile.count, error: reconcile.error }) + '\n')
  if (reconcile.error) failed.push({ table: 'réconciliation des accès', rows: 0, error: reconcile.error })

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
