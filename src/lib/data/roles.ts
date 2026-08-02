import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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

export interface Poste {
  id: string
  code: string
  libelle: string
  description: string | null
  niveau_hierarchique: number
  actif: boolean
}

export interface ProfilAdmin {
  id: string
  prenom: string
  nom: string
  email: string
  actif: boolean
  role_acces: { id: string; code: string; libelle: string } | null
  poste: { id: string; code: string; libelle: string } | null
}

async function fetchRolesAcces(): Promise<RoleAcces[]> {
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

async function fetchPostes(): Promise<Poste[]> {
  const { data, error } = await supabase
    .from('postes')
    .select('id, code, libelle, description, niveau_hierarchique, actif')
    .order('niveau_hierarchique')
  if (error || !data) return []
  return data as unknown as Poste[]
}
export function usePostes() {
  return useQuery({ queryKey: ['postes'], queryFn: fetchPostes })
}

export function useCreatePoste() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ code, libelle, niveauHierarchique }: { code: string; libelle: string; niveauHierarchique: number }) => {
      const { error } = await supabase.from('postes').insert({
        code: code.trim().toUpperCase().replace(/\s+/g, '_'),
        libelle: libelle.trim(),
        niveau_hierarchique: niveauHierarchique,
        actif: true,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['postes'] }),
  })
}

async function fetchPermissions(): Promise<PermissionRow[]> {
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
interface RawProfilPoste {
  profil_id: string
  poste: { id: string; code: string; libelle: string } | null
}

async function fetchProfilsAdmin(): Promise<ProfilAdmin[]> {
  const [profilsRes, rolesRes, postesRes] = await Promise.all([
    supabase.from('profils').select('id, prenom, nom, email, actif').order('nom'),
    supabase.from('profils_roles_acces').select('profil_id, role_acces:roles_acces(id, code, libelle)'),
    supabase.from('profils_postes').select('profil_id, poste:postes(id, code, libelle)'),
  ])
  if (profilsRes.error || !profilsRes.data) return []
  const roleParProfil = new Map<string, { id: string; code: string; libelle: string }>()
  for (const r of (rolesRes.data ?? []) as unknown as RawProfilRoleAcces[]) {
    if (r.role_acces) roleParProfil.set(r.profil_id, r.role_acces)
  }
  const posteParProfil = new Map<string, { id: string; code: string; libelle: string }>()
  for (const r of (postesRes.data ?? []) as unknown as RawProfilPoste[]) {
    if (r.poste) posteParProfil.set(r.profil_id, r.poste)
  }
  return (profilsRes.data as unknown as RawProfilAdmin[]).map((p) => ({
    ...p,
    role_acces: roleParProfil.get(p.id) ?? null,
    poste: posteParProfil.get(p.id) ?? null,
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

export function useAssignPoste() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ profilId, posteId }: { profilId: string; posteId: string }) => {
      const { error: deleteError } = await supabase.from('profils_postes').delete().eq('profil_id', profilId)
      if (deleteError) throw new Error(deleteError.message)
      const { error } = await supabase.from('profils_postes').insert({ profil_id: profilId, poste_id: posteId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profils-admin'] }),
  })
}

async function fetchPostePermissionsMatrix(): Promise<Set<string>> {
  const { data, error } = await supabase.from('postes_permissions').select('poste_id, permission_id')
  if (error || !data) return new Set()
  return new Set((data as { poste_id: string; permission_id: string }[]).map((r) => `${r.poste_id}:${r.permission_id}`))
}
export function usePostePermissionsMatrix() {
  return useQuery({ queryKey: ['poste-permissions-matrix'], queryFn: fetchPostePermissionsMatrix })
}

export function useTogglePostePermission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ posteId, permissionId, enabled }: { posteId: string; permissionId: string; enabled: boolean }) => {
      if (enabled) {
        const { error } = await supabase.from('postes_permissions').insert({ poste_id: posteId, permission_id: permissionId })
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('postes_permissions')
          .delete()
          .eq('poste_id', posteId)
          .eq('permission_id', permissionId)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['poste-permissions-matrix'] }),
  })
}

async function fetchRolePermissionsMatrix(): Promise<Set<string>> {
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

export interface CurrentAccess {
  roleCode: string | null
  roleLibelle: string | null
  permissions: Set<string>
}

export async function fetchCurrentAccess(): Promise<CurrentAccess> {
  const empty: CurrentAccess = { roleCode: null, roleLibelle: null, permissions: new Set() }
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

export interface MonProfil {
  id: string
  prenom: string
  nom: string
  email: string
  photo_url: string | null
}

async function fetchMonProfil(): Promise<MonProfil | null> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null
  const { data, error } = await supabase
    .from('profils')
    .select('id, prenom, nom, email, photo_url')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (error || !data) return null
  return data as unknown as MonProfil
}

export function useMonProfil() {
  return useQuery({ queryKey: ['mon-profil'], queryFn: fetchMonProfil })
}

export function useUploadMaPhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Non connecté')
      const extension = file.name.split('.').pop() ?? 'jpg'
      const path = `${userData.user.id}/avatar.${extension}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (uploadError) throw new Error(uploadError.message)
      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const photoUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`
      const { error: updateError } = await supabase.from('profils').update({ photo_url: photoUrl }).eq('id', userData.user.id)
      if (updateError) throw new Error(updateError.message)
      return photoUrl
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mon-profil'] })
    },
  })
}

export function useHasPermission(code: string) {
  const { data } = useCurrentAccess()
  return data?.permissions.has(code) ?? false
}

export function useCanManage(proprietaireId: string | null | undefined) {
  const isAdmin = useIsAdmin()
  const { data: monProfil } = useMonProfil()
  if (isAdmin) return true
  if (!proprietaireId || !monProfil) return false
  return monProfil.id === proprietaireId
}

export interface ProfilAutorise {
  id: string
  email: string
  prenom: string | null
  nom: string | null
  date_creation: string
  poste_id: string | null
  role_acces_id: string | null
}

async function fetchProfilsAutorises(): Promise<ProfilAutorise[]> {
  const { data, error } = await supabase
    .from('profils_autorises')
    .select('id, email, prenom, nom, date_creation, poste_id, role_acces_id')
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
    mutationFn: async ({
      email,
      prenom,
      nom,
      posteId,
      roleAccesId,
    }: {
      email: string
      prenom: string
      nom: string
      posteId: string | null
      roleAccesId: string | null
    }) => {
      const { error } = await supabase.from('profils_autorises').insert({
        email: email.trim().toLowerCase(),
        prenom: prenom.trim() || null,
        nom: nom.trim() || null,
        poste_id: posteId,
        role_acces_id: roleAccesId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profils-autorises'] }),
  })
}

export function useUpdateProfilAutorisePosteRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      posteId,
      roleAccesId,
    }: {
      id: string
      posteId: string | null
      roleAccesId: string | null
    }) => {
      const { error } = await supabase.from('profils_autorises').update({ poste_id: posteId, role_acces_id: roleAccesId }).eq('id', id)
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
