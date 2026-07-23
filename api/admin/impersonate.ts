import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

interface ImpersonateBody {
  targetProfilId?: string
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

  const body = req.body as ImpersonateBody
  if (!body?.targetProfilId) {
    res.status(400).json({ error: 'targetProfilId requis' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    res.status(500).json({ error: 'Supabase non configuré côté serveur' })
    return
  }

  const supabaseAuthed = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabaseAuthed.auth.getUser()
  if (userError || !userData.user) {
    res.status(401).json({ error: 'Session invalide' })
    return
  }

  if (body.targetProfilId === userData.user.id) {
    res.status(400).json({ error: 'Vous êtes déjà connecté en tant que vous-même' })
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // Ne jamais faire confiance au rôle envoyé par le client : on revérifie côté serveur
  // avec la clé service role que l'appelant est bien admin.
  const { data: callerRoleRow } = await supabase
    .from('profils_roles_acces')
    .select('role_acces:roles_acces(code)')
    .eq('profil_id', userData.user.id)
    .maybeSingle()
  const callerCode = (callerRoleRow?.role_acces as unknown as { code: string } | null)?.code
  if (callerCode !== 'ADMIN' && callerCode !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Réservé aux administrateurs' })
    return
  }

  const { data: targetProfil, error: targetError } = await supabase
    .from('profils')
    .select('id, email, prenom, nom')
    .eq('id', body.targetProfilId)
    .maybeSingle()
  if (targetError || !targetProfil) {
    res.status(404).json({ error: 'Utilisateur introuvable' })
    return
  }

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: targetProfil.email as string,
  })
  if (linkError || !linkData) {
    res.status(502).json({ error: linkError?.message ?? 'Erreur Supabase inconnue' })
    return
  }

  // Journalise l'emprunt d'identité dans l'historique existant, sur la fiche du profil emprunté.
  await supabase.from('historique_modifications').insert({
    table_nom: 'profils',
    ligne_id: targetProfil.id,
    champ: 'connexion_en_tant_que',
    ancienne_valeur: null,
    nouvelle_valeur: `Emprunté par ${userData.user.email ?? userData.user.id}`,
    modifie_par_id: userData.user.id,
  })

  res.status(200).json({
    tokenHash: linkData.properties.hashed_token,
    email: targetProfil.email,
    nom: `${targetProfil.prenom} ${targetProfil.nom}`,
  })
}
