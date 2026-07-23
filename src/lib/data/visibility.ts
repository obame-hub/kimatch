import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/demoMode'
import { fetchCurrentAccess } from '@/lib/data/roles'

// Périmètre de visibilité par compte (profils_comptes), voulu par Michel : un admin
// (SUPER_ADMIN/ADMIN) voit tout, tout le monde d'autre ne voit que les comptes qui lui
// sont explicitement assignés. `null` = aucune restriction (voit tout) ; sinon la liste
// des compte_id autorisés (peut être vide = ne voit aucun compte).
export async function fetchComptesVisibles(): Promise<string[] | null> {
  if (isDemoMode()) return null

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return []

  const access = await fetchCurrentAccess()
  if (access.roleCode === 'SUPER_ADMIN' || access.roleCode === 'ADMIN') return null

  const { data, error } = await supabase
    .from('profils_comptes')
    .select('compte_id')
    .eq('profil_id', userData.user.id)
    .eq('actif', true)
  if (error || !data) return []
  return (data as { compte_id: string }[]).map((r) => r.compte_id)
}

// Dérive les sites visibles à partir des comptes visibles — pour les entités qui ne
// portent qu'un site_id (signaux, compteurs, contrats...) et pas un compte_id direct.
export async function fetchSitesVisiblesIds(comptesVisibles: string[] | null): Promise<string[] | null> {
  if (comptesVisibles === null) return null
  if (comptesVisibles.length === 0) return []

  const { data, error } = await supabase.from('sites').select('id').in('compte_id', comptesVisibles)
  if (error || !data) return []
  return (data as { id: string }[]).map((r) => r.id)
}

// `null` = pas de restriction. Sinon, ne garde que les éléments dont l'id extrait
// (compte_id ou site_id selon l'entité) figure dans la liste autorisée.
export function filterVisibles<T>(
  items: T[],
  visibleIds: string[] | null,
  getScopeId: (item: T) => string | null | undefined,
): T[] {
  if (visibleIds === null) return items
  const set = new Set(visibleIds)
  return items.filter((item) => {
    const id = getScopeId(item)
    return id != null && set.has(id)
  })
}
