import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/demoMode'

export interface RoleAcces {
  id: string
  code: string
  libelle: string
  description: string | null
  niveau_hierarchique: number
  actif: boolean
}

export interface PermissionRow {
  id: string
  code: string
  libelle: string
  module: string
  action: string
}

export interface ProfilAdmin {
  id: string
  prenom: string
  nom: string
  email: string
  actif: boolean
  role_acces: { id: string; code: string; libelle: string } | null
}

async function fetchRolesAcces(): Promise<RoleAcces[]> {
  if (isDemoMode()) return []
  const { data, error } = await supabase
    .from('roles_acces')
    .select('id, code, libelle, description, niveau_hierarchique, actif')
    .order('niveau_hierarchique')
  if (error || !data) return []
  return data as unknown as RoleAcces[]
}
export function useRolesAcces() {
  return useQuery({ queryKey: ['roles-acces'], queryFn: fetchRolesAcces })
}

async function fetchPermissions(): Promise<PermissionRow[]> {
  if (isDemoMode()) return []
  const { data, error } = await supabase
    .from('permissions')
    .select('id, code, libelle, module, action')
    .order('module')
    .order('action')
  if (error || !data) return []
  return data as unknown as PermissionRow[]
}
export function usePermissionsList() {
  return useQuery({ queryKey: ['permissions-list'], queryFn: fetchPermissions })
}

interface RawProfilAdmin {
  id: string
  prenom: string
  nom: string
  email: string
  actif: boolean
}
interface RawProfilRoleAcces {
  profil_id: string
  role_acces: { id: string; code: string; libelle: string } | null
}

async function fetchProfilsAdmin(): Promise<ProfilAdmin[]> {
  if (isDemoMode()) return []
  const [profilsRes, rolesRes] = await Promise.all([
    supabase.from('profils').select('id, prenom, nom, email, actif').order('nom'),
    supabase.from('profils_roles_acces').select('profil_id, role_acces:roles_acces(id, code, libelle)'),
  ])
  if (profilsRes.error || !profilsRes.data) return []
  const roleParProfil = new Map<string, { id: string; code: string; libelle: string }>()
  for (const r of (rolesRes.data ?? []) as unknown as RawProfilRoleAcces[]) {
    if (r.role_acces) roleParProfil.set(r.profil_id, r.role_acces)
  }
  return (profilsRes.data as unknown as RawProfilAdmin[]).map((p) => ({
    ...p,
    role_acces: roleParProfil.get(p.id) ?? null,
  }))
}
export function useProfilsAdmin() {
  return useQuery({ queryKey: ['profils-admin'], queryFn: fetchProfilsAdmin })
}

export function useAssignRoleAcces() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ profilId, roleAccesId }: { profilId: string; roleAccesId: string }) => {
      const { error: deleteError } = await supabase.from('profils_roles_acces').delete().eq('profil_id', profilId)
      if (deleteError) throw new Error(deleteError.message)
      const { error } = await supabase.from('profils_roles_acces').insert({ profil_id: profilId, role_acces_id: roleAccesId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profils-admin'] }),
  })
}

async function fetchRolePermissionsMatrix(): Promise<Set<string>> {
  if (isDemoMode()) return new Set()
  const { data, error } = await supabase.from('roles_acces_permissions').select('role_acces_id, permission_id')
  if (error || !data) return new Set()
  return new Set((data as { role_acces_id: string; permission_id: string }[]).map((r) => `${r.role_acces_id}:${r.permission_id}`))
}
export function useRolePermissionsMatrix() {
  return useQuery({ queryKey: ['role-permissions-matrix'], queryFn: fetchRolePermissionsMatrix })
}

export function useToggleRolePermission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ roleAccesId, permissionId, enabled }: { roleAccesId: string; permissionId: string; enabled: boolean }) => {
      if (enabled) {
        const { error } = await supabase.from('roles_acces_permissions').insert({ role_acces_id: roleAccesId, permission_id: permissionId })
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('roles_acces_permissions')
          .delete()
          .eq('role_acces_id', roleAccesId)
          .eq('permission_id', permissionId)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['role-permissions-matrix'] }),
  })
}

interface CurrentAccess {
  roleCode: string | null
  roleLibelle: string | null
  permissions: Set<string>
}

async function fetchCurrentAccess(): Promise<CurrentAccess> {
  const empty: CurrentAccess = { roleCode: null, roleLibelle: null, permissions: new Set() }
  if (isDemoMode()) return empty
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return empty

  const { data: roleRow } = await supabase
    .from('profils_roles_acces')
    .select('role_acces:roles_acces(id, code, libelle)')
    .eq('profil_id', userData.user.id)
    .maybeSingle()
  const roleAcces = roleRow?.role_acces as unknown as { id: string; code: string; libelle: string } | null
  if (!roleAcces) return empty

  const { data: permRows } = await supabase
    .from('roles_acces_permissions')
    .select('permission:permissions(code)')
    .eq('role_acces_id', roleAcces.id)
  const permissions = new Set(
    ((permRows ?? []) as unknown as { permission: { code: string } | null }[])
      .map((r) => r.permission?.code)
      .filter((c): c is string => !!c),
  )
  return { roleCode: roleAcces.code, roleLibelle: roleAcces.libelle, permissions }
}

export function useCurrentAccess() {
  return useQuery({ queryKey: ['current-access'], queryFn: fetchCurrentAccess })
}

export function useIsAdmin() {
  const { data } = useCurrentAccess()
  return data?.roleCode === 'SUPER_ADMIN' || data?.roleCode === 'ADMIN'
}

export function useHasPermission(code: string) {
  const { data } = useCurrentAccess()
  return data?.permissions.has(code) ?? false
}

export interface ProfilAutorise {
  id: string
  email: string
  prenom: string | null
  nom: string | null
  date_creation: string
}

async function fetchProfilsAutorises(): Promise<ProfilAutorise[]> {
  if (isDemoMode()) return []
  const { data, error } = await supabase
    .from('profils_autorises')
    .select('id, email, prenom, nom, date_creation')
    .order('date_creation', { ascending: false })
  if (error || !data) return []
  return data as unknown as ProfilAutorise[]
}
export function useProfilsAutorises() {
  return useQuery({ queryKey: ['profils-autorises'], queryFn: fetchProfilsAutorises })
}

export function useAddProfilAutorise() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, prenom, nom }: { email: string; prenom: string; nom: string }) => {
      const { error } = await supabase.from('profils_autorises').insert({
        email: email.trim().toLowerCase(),
        prenom: prenom.trim() || null,
        nom: nom.trim() || null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profils-autorises'] }),
  })
}

export function useRemoveProfilAutorise() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('profils_autorises').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profils-autorises'] }),
  })
}
