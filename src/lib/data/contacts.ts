import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockContacts } from '@/lib/mockData'
import type { Contact } from '@/types/domain'

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
}

interface RawContactSite {
  contact_id: string
  fonction_sur_site: string | null
  site: { id: string; nom: string } | null
}

async function fetchContacts(): Promise<Contact[]> {
  if (!isSupabaseConfigured) return mockContacts
  try {
    const [contactsRes, sitesRes] = await Promise.all([
      supabase
        .from('contacts')
        .select('id, compte_id, civilite, prenom, nom, fonction, telephone, email, contact_principal, actif, compte:comptes(nom)')
        .order('nom'),
      supabase.from('contacts_sites').select('contact_id, fonction_sur_site, site:sites(id, nom)'),
    ])
    if (contactsRes.error || !contactsRes.data || contactsRes.data.length === 0) throw contactsRes.error ?? new Error('empty')

    const sitesParContact = new Map<string, { id: string; nom: string; fonction_sur_site: string | null }[]>()
    for (const cs of (sitesRes.data ?? []) as unknown as RawContactSite[]) {
      if (!cs.site) continue
      const list = sitesParContact.get(cs.contact_id) ?? []
      list.push({ id: cs.site.id, nom: cs.site.nom, fonction_sur_site: cs.fonction_sur_site })
      sitesParContact.set(cs.contact_id, list)
    }

    return (contactsRes.data as unknown as RawContact[]).map((c) => ({
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
    }))
  } catch {
    return mockContacts
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
      }

      if (isSupabaseConfigured) {
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
      }

      queryClient.setQueryData<Contact[]>(['contacts'], (old) => (old ? [contact, ...old] : [contact]))
      return { contact, persisted }
    },
  })
}
