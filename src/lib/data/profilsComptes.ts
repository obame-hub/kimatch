import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TypeRole {
  id: string
  code: string
  libelle: string
  description: string | null
}

async function fetchTypesRoles(): Promise<TypeRole[]> {
  const { data, error } = await supabase.from('types_roles').select('id, code, libelle, description').order('code')
  if (error || !data) return []
  return data as unknown as TypeRole[]
}

export function useTypesRoles() {
  return useQuery({ queryKey: ['types-roles'], queryFn: fetchTypesRoles })
}

export interface ProfilCompte {
  id: string
  profil_id: string
  profil_nom: string
  compte_id: string
  compte_nom: string
  type_role_id: string
  type_role_libelle: string
  actif: boolean
}

interface RawProfilCompte {
  id: string
  profil_id: string
  compte_id: string
  type_role_id: string
  actif: boolean
  profil: { prenom: string; nom: string } | null
  compte: { nom: string } | null
  type_role: { libelle: string } | null
}

async function fetchProfilsComptes(): Promise<ProfilCompte[]> {
  const { data, error } = await supabase
    .from('profils_comptes')
    .select('id, profil_id, compte_id, type_role_id, actif, profil:profils(prenom, nom), compte:comptes(nom), type_role:types_roles(libelle)')
    .order('date_creation', { ascending: false })
  if (error || !data) return []
  return (data as unknown as RawProfilCompte[]).map((r) => ({
    id: r.id,
    profil_id: r.profil_id,
    profil_nom: r.profil ? `${r.profil.prenom} ${r.profil.nom}` : '',
    compte_id: r.compte_id,
    compte_nom: r.compte?.nom ?? '',
    type_role_id: r.type_role_id,
    type_role_libelle: r.type_role?.libelle ?? '',
    actif: r.actif,
  }))
}

export function useProfilsComptes() {
  return useQuery({ queryKey: ['profils-comptes'], queryFn: fetchProfilsComptes })
}

export function useAssignProfilCompte() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ profilId, compteId, typeRoleId }: { profilId: string; compteId: string; typeRoleId: string }) => {
      const { error } = await supabase.from('profils_comptes').insert({
        profil_id: profilId,
        compte_id: compteId,
        type_role_id: typeRoleId,
        actif: true,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profils-comptes'] }),
  })
}

export function useRemoveProfilCompte() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('profils_comptes').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profils-comptes'] }),
  })
}
