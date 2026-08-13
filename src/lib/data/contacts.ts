import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Contact, LienCompteContact } from '@/types/domain'
import { fetchComptesVisibles } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'
import { toUpperFR, toTitleCaseFR, formatPhoneFR } from '@/lib/textFormat'

interface RawContact {
  id: string
  compte_id: string
  civilite: string | null
  prenom: string
  nom: string
  fonction: string | null
  telephone: string | null
  telephone_mobile: string | null
  email: string | null
  role: string | null
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

interface RawContactCompte {
  contact_id: string
  relation_directe: boolean
  compte: { id: string; nom: string } | null
}

/**
 * @param compteId Ne charger que les contacts de ce compte. Les fiches de détail n'ont besoin que
 *   de ceux-là ; tirer les 3380 contacts pour en afficher deux coûtait plusieurs secondes.
 */
async function fetchContacts(compteId?: string): Promise<Contact[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // Volontairement sans filtre serveur sur compte_id : un contact rattaché au compte demandé par
    // une relation indirecte a un compte_id différent, le filtrer ici le ferait disparaître. Le tri
    // se fait plus bas, sur l'ensemble des rattachements.
    const restreindre = (q: any) => q
    const [contacts, contactsSites, contactsComptes] = await Promise.all([
      fetchAllRows<RawContact>(
        'contacts',
        // `*` plutôt qu'une liste de colonnes fixe : `role`/`telephone_mobile` viennent d'être
        // ajoutées par migration et peuvent ne pas encore exister en prod au moment du déploiement
        // -- un select nommé sur une colonne absente ferait échouer la requête (400) pour TOUS les
        // contacts (voir le même choix dans referenceTables.ts).
        '*, compte:comptes(nom), canal_communication:types_canaux_communication(libelle), proprietaire:profils!contacts_proprietaire_id_fkey(prenom, nom)',
        (q) => restreindre(q).order('nom'),
      ),
      fetchAllRows<RawContactSite>('contacts_sites', 'contact_id, fonction_sur_site, site:sites(id, nom)'),
      // Rattachements aux comptes. Chargés sans restriction même quand `compteId` est fourni : il
      // faut connaître TOUS les comptes d'un contact pour savoir s'il concerne celui demandé, y
      // compris par une relation indirecte que contacts.compte_id ne porte pas.
      fetchAllRows<RawContactCompte>('contacts_comptes', 'contact_id, relation_directe, compte:comptes(id, nom)'),
    ])

    const sitesParContact = new Map<string, { id: string; nom: string; fonction_sur_site: string | null }[]>()
    for (const cs of contactsSites) {
      if (!cs.site) continue
      const list = sitesParContact.get(cs.contact_id) ?? []
      list.push({ id: cs.site.id, nom: cs.site.nom, fonction_sur_site: cs.fonction_sur_site })
      sitesParContact.set(cs.contact_id, list)
    }

    const comptesParContact = new Map<string, LienCompteContact[]>()
    for (const cc of contactsComptes) {
      if (!cc.compte) continue
      const list = comptesParContact.get(cc.contact_id) ?? []
      list.push({ id: cc.compte.id, nom: cc.compte.nom, relation_directe: cc.relation_directe })
      comptesParContact.set(cc.contact_id, list)
    }

    const comptesVisibles = await fetchComptesVisibles()
    const autorises = comptesVisibles === null ? null : new Set(comptesVisibles)

    return contacts
      .map((c) => ({
        brut: c,
        // Le compte principal figure déjà dans contacts_comptes (relation_directe = true). On le
        // rajoute en secours pour les contacts créés avant la migration du 13/08, qui n'y sont pas.
        liens:
          comptesParContact.get(c.id) ??
          (c.compte_id ? [{ id: c.compte_id, nom: c.compte?.nom ?? '', relation_directe: true }] : []),
      }))
      // Un contact est visible dès qu'UN de ses comptes l'est : le restreindre à son compte
      // principal masquerait un contact légitimement rattaché à un compte du périmètre.
      .filter(({ liens }) => autorises === null || liens.some((l) => autorises.has(l.id)))
      // Tri sur l'ensemble des rattachements, et non sur le seul compte principal.
      .filter(({ liens }) => !compteId || liens.some((l) => l.id === compteId))
      .map(({ brut: c, liens }) => ({
      id: c.id,
      compte_id: c.compte_id,
      compte_nom: c.compte?.nom ?? '',
      comptes: liens,
      civilite: c.civilite,
      prenom: c.prenom,
      nom: c.nom,
      fonction: c.fonction,
      telephone: c.telephone,
      telephone_mobile: c.telephone_mobile ?? null,
      email: c.email,
      role: c.role ?? null,
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
  return useQuery({ queryKey: ['contacts'], queryFn: () => fetchContacts() })
}

/** Contacts d'un seul compte -- pour les fiches de détail, qui n'ont pas besoin des 3380 autres. */
export function useContactsParCompte(compteId: string | undefined) {
  return useQuery({
    queryKey: ['contacts', 'compte', compteId],
    queryFn: () => fetchContacts(compteId as string),
    enabled: !!compteId,
  })
}

interface CreateContactInput {
  compte_id: string
  compte_nom: string
  civilite: string | null
  prenom: string
  nom: string
  fonction: string | null
  telephone: string | null
  telephone_mobile: string | null
  email: string | null
  /** Décisionnaire | Administratif | Conseil syndical -- `contact_principal` est dérivé de ce
   * champ (role === 'Décisionnaire'), jamais saisi séparément, pour rester synchronisé (même
   * logique que Role__c/D_cisionnaire__c dans Tools). */
  role: string | null
  site_ids: string[]
  sites: { id: string; nom: string; fonction_sur_site: string | null }[]
}

interface CreateContactResult {
  contact: Contact
  persisted: boolean
}

/** Recherche de doublons -- ALERTE uniquement, jamais de blocage (contrairement au SIRET compte).
 * Recherche globale (tout l'org), pas scopée au compte : email normalisé, OU téléphone/mobile
 * croisés dans les deux champs, OU prénom+nom exact -- même règle que Tools. */
export interface ContactDuplicate {
  contact: Contact
  fields: ('email' | 'phone' | 'mobile' | 'fullName')[]
}

export function findContactDuplicates(
  contacts: Contact[],
  input: { prenom: string; nom: string; email: string | null; telephone: string | null; telephoneMobile: string | null },
): ContactDuplicate[] {
  const emailNorm = input.email?.trim().toLowerCase() || null
  const telNorm = input.telephone?.trim() || null
  const mobNorm = input.telephoneMobile?.trim() || null
  const prenomNorm = input.prenom.trim().toLowerCase()
  const nomNorm = input.nom.trim().toLowerCase()

  const results: ContactDuplicate[] = []
  for (const c of contacts) {
    const fields: ContactDuplicate['fields'] = []
    if (emailNorm && c.email && c.email.trim().toLowerCase() === emailNorm) fields.push('email')
    // Croisé sur les deux colonnes du contact existant, comme Tools : un fixe saisi ici peut
    // matcher le mobile déjà enregistré (et inversement).
    if (telNorm && [c.telephone, c.telephone_mobile].some((n) => n && n === telNorm)) fields.push('phone')
    if (mobNorm && [c.telephone, c.telephone_mobile].some((n) => n && n === mobNorm)) fields.push('mobile')
    if (prenomNorm && nomNorm && c.prenom.trim().toLowerCase() === prenomNorm && c.nom.trim().toLowerCase() === nomNorm) fields.push('fullName')
    if (fields.length > 0) results.push({ contact: c, fields })
  }
  return results
}

export function useCreateContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateContactInput): Promise<CreateContactResult> => {
      const nom = toUpperFR(input.nom) || input.nom
      const contactPrincipal = input.role === 'Décisionnaire'

      let persisted = false
      let contact: Contact = {
        id: `local-${Date.now()}`,
        compte_id: input.compte_id,
        compte_nom: input.compte_nom,
        comptes: [{ id: input.compte_id, nom: input.compte_nom, relation_directe: true }],
        civilite: input.civilite,
        prenom: input.prenom,
        nom,
        fonction: input.fonction,
        telephone: input.telephone ? formatPhoneFR(input.telephone) : null,
        telephone_mobile: input.telephone_mobile ? formatPhoneFR(input.telephone_mobile) : null,
        email: input.email,
        role: input.role,
        contact_principal: contactPrincipal,
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
          nom,
          fonction: input.fonction,
          telephone: contact.telephone,
          telephone_mobile: contact.telephone_mobile,
          email: input.email,
          role: input.role,
          contact_principal: contactPrincipal,
        })
        .select('id')
        .single()
      if (!error && data) {
        const contactId = (data as { id: string }).id
        contact = { ...contact, id: contactId }
        persisted = true

        // Rattachement au compte dans la table de liaison. La lecture se replie sur compte_id
        // quand la ligne manque, donc l'oublier ne casserait rien tout de suite — mais le contact
        // ne pourrait jamais être rattaché à un second compte, ce qui est précisément ce que la
        // reprise du 13/08/2026 rend possible.
        await supabase
          .from('contacts_comptes')
          .insert({ contact_id: contactId, compte_id: input.compte_id, relation_directe: true })

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
  telephone_mobile: string | null
  email: string | null
  role: string | null
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
          prenom: toTitleCaseFR(input.prenom) || input.prenom,
          nom: toUpperFR(input.nom) || input.nom,
          fonction: input.fonction,
          telephone: input.telephone ? formatPhoneFR(input.telephone) : null,
          telephone_mobile: input.telephone_mobile ? formatPhoneFR(input.telephone_mobile) : null,
          email: input.email,
          role: input.role,
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
