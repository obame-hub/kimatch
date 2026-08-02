import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Contact } from '@/types/domain'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

interface RawContact {
  id: string
  compte_id: string
  civilite: string | null
  prenom: string
  nom: string
  fonction: string | null
  telephone: string | null
  email: string | null
  contact_principal: boolean
  actif: boolean
  compte: { nom: string } | null
  proprietaire_id: string | null
  linkedin_url: string | null
  disponibilites: string | null
  type_canal_communication_id: string | null
  canal_communication: { libelle: string } | null
  proprietaire: { prenom: string; nom: string } | null
  date_creation: string
  date_modification: string
}

interface RawContactSite {
  contact_id: string
  fonction_sur_site: string | null
  site: { id: string; nom: string } | null
}

async function fetchContacts(): Promise<Contact[]> {
  try {
    const [contacts, contactsSites] = await Promise.all([
      fetchAllRows<RawContact>(
        'contacts',
        'id, compte_id, civilite, prenom, nom, fonction, telephone, email, contact_principal, actif, compte:comptes(nom), proprietaire_id, linkedin_url, disponibilites, type_canal_communication_id, canal_communication:types_canaux_communication(libelle), proprietaire:profils!contacts_proprietaire_id_fkey(prenom, nom), date_creation, date_modification',
        (q) => q.order('nom'),
      ),
      fetchAllRows<RawContactSite>('contacts_sites', 'contact_id, fonction_sur_site, site:sites(id, nom)'),
    ])

    const sitesParContact = new Map<string, { id: string; nom: string; fonction_sur_site: string | null }[]>()
    for (const cs of contactsSites) {
      if (!cs.site) continue
      const list = sitesParContact.get(cs.contact_id) ?? []
      list.push({ id: cs.site.id, nom: cs.site.nom, fonction_sur_site: cs.fonction_sur_site })
      sitesParContact.set(cs.contact_id, list)
    }

    const comptesVisibles = await fetchComptesVisibles()

    return filterVisibles(contacts, comptesVisibles, (c) => c.compte_id).map((c) => ({
      id: c.id,
      compte_id: c.compte_id,
      compte_nom: c.compte?.nom ?? '',
      civilite: c.civilite,
      prenom: c.prenom,
      nom: c.nom,
      fonction: c.fonction,
      telephone: c.telephone,
      email: c.email,
      contact_principal: c.contact_principal,
      actif: c.actif,
      sites: sitesParContact.get(c.id) ?? [],
      proprietaire_id: c.proprietaire_id,
      proprietaire_nom: c.proprietaire ? `${c.proprietaire.prenom} ${c.proprietaire.nom}` : null,
      linkedin_url: c.linkedin_url,
      disponibilites: c.disponibilites,
      type_canal_communication_id: c.type_canal_communication_id,
      canal_communication: c.canal_communication?.libelle ?? null,
      date_creation: c.date_creation,
      date_modification: c.date_modification,
    }))
  } catch (error) {
    console.error('fetchContacts', error)
    return []
  }
}

export function useContacts() {
  return useQuery({ queryKey: ['contacts'], queryFn: fetchContacts })
}

interface CreateContactInput {
  compte_id: string
  compte_nom: string
  civilite: string | null
  prenom: string
  nom: string
  fonction: string | null
  telephone: string | null
  email: string | null
  contact_principal: boolean
  site_ids: string[]
  sites: { id: string; nom: string; fonction_sur_site: string | null }[]
}

interface CreateContactResult {
  contact: Contact
  persisted: boolean
}

export function useCreateContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateContactInput): Promise<CreateContactResult> => {
      let persisted = false
      let contact: Contact = {
        id: `local-${Date.now()}`,
        compte_id: input.compte_id,
        compte_nom: input.compte_nom,
        civilite: input.civilite,
        prenom: input.prenom,
        nom: input.nom,
        fonction: input.fonction,
        telephone: input.telephone,
        email: input.email,
        contact_principal: input.contact_principal,
        actif: true,
        sites: input.sites,
        proprietaire_id: null,
        linkedin_url: null,
        disponibilites: null,
        type_canal_communication_id: null,
        canal_communication: null,
      }

      const { data, error } = await supabase
        .from('contacts')
        .insert({
          compte_id: input.compte_id,
          civilite: input.civilite,
          prenom: input.prenom,
          nom: input.nom,
          fonction: input.fonction,
          telephone: input.telephone,
          email: input.email,
          contact_principal: input.contact_principal,
        })
        .select('id')
        .single()
      if (!error && data) {
        const contactId = (data as { id: string }).id
        contact = { ...contact, id: contactId }
        persisted = true
        if (input.site_ids.length > 0) {
          await supabase
            .from('contacts_sites')
            .insert(input.site_ids.map((site_id) => ({ contact_id: contactId, site_id })))
        }
      }

      queryClient.setQueryData<Contact[]>(['contacts'], (old) => (old ? [contact, ...old] : [contact]))
      return { contact, persisted }
    },
  })
}

export interface UpdateContactInput {
  id: string
  civilite: string | null
  prenom: string
  nom: string
  fonction: string | null
  telephone: string | null
  email: string | null
  contact_principal: boolean
  actif: boolean
  proprietaire_id: string | null
  linkedin_url: string | null
  disponibilites: string | null
  type_canal_communication_id: string | null
}

export function useUpdateContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateContactInput) => {
      const { error } = await supabase
        .from('contacts')
        .update({
          civilite: input.civilite,
          prenom: input.prenom,
          nom: input.nom,
          fonction: input.fonction,
          telephone: input.telephone,
          email: input.email,
          contact_principal: input.contact_principal,
          actif: input.actif,
          proprietaire_id: input.proprietaire_id,
          linkedin_url: input.linkedin_url,
          disponibilites: input.disponibilites,
          type_canal_communication_id: input.type_canal_communication_id,
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useDeleteContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  })
}
