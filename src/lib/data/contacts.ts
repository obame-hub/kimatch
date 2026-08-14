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
  site: { id: string; nom: string; compte_id: string | null } | null
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
    // Le rattachement d'un contact a un compte est de trois natures : sa colonne compte_id, une
    // ligne dans contacts_comptes (y compris indirecte), ou un site du compte via contacts_sites.
    // Un filtre serveur naif sur contacts.compte_id ferait donc disparaitre des contacts
    // legitimes -- c'est la raison pour laquelle cette fonction lisait tout et triait en memoire.
    //
    // On identifie donc d'abord QUI concerne le compte, puis on ne lit que ces contacts. Cinq
    // requetes legeres remplacent onze lectures de tables entieres (mesure du 14/08/2026 sur
    // CABINET MOLINIER, dernier gros poste de la fiche apres le passage des autres sources en
    // filtrage serveur).
    let idsRetenus: string[] | null = null
    if (compteId) {
      const [liensComptes, sitesDuCompte] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchAllRows<{ contact_id: string }>('contacts_comptes', 'contact_id', (q: any) => q.eq('compte_id', compteId)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchAllRows<{ id: string }>('sites', 'id', (q: any) => q.eq('compte_id', compteId)),
      ])
      const siteIds = sitesDuCompte.map((s) => s.id)
      const liensSites = siteIds.length
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await fetchAllRows<{ contact_id: string }>('contacts_sites', 'contact_id', (q: any) => q.in('site_id', siteIds))
        : []
      idsRetenus = [...new Set([...liensComptes.map((l) => l.contact_id), ...liensSites.map((l) => l.contact_id)])]
    }

    const [contacts, contactsSites, contactsComptes] = await Promise.all([
      fetchAllRows<RawContact>(
        'contacts',
        // `*` plutot qu'une liste de colonnes fixe : `role`/`telephone_mobile` viennent d'etre
        // ajoutees par migration et peuvent ne pas encore exister en prod au moment du deploiement
        // -- un select nomme sur une colonne absente ferait echouer la requete (400) pour TOUS les
        // contacts (voir le meme choix dans referenceTables.ts).
        '*, compte:comptes(nom), canal_communication:types_canaux_communication(libelle), proprietaire:profils!contacts_proprietaire_id_fkey(prenom, nom)',
        // Le contact dont c'est le compte principal est repris meme s'il n'apparait dans aucune
        // table de liaison : c'est le cas des contacts crees avant la migration du 13/08.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => {
          if (!compteId) return q.order('nom')
          const parIds = idsRetenus && idsRetenus.length ? `,id.in.(${idsRetenus.join(',')})` : ''
          return q.or(`compte_id.eq.${compteId}${parIds}`).order('nom')
        },
      ),
      // Rattachements d'affichage : il faut TOUS les comptes et sites des contacts retenus -- une
      // fiche montre « aussi rattache a X ». On les lit pour ces contacts seulement.
      fetchAllRows<RawContactSite>(
        'contacts_sites',
        'contact_id, fonction_sur_site, site:sites(id, nom, compte_id)',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        compteId && idsRetenus && idsRetenus.length ? (q: any) => q.in('contact_id', idsRetenus as string[]) : undefined,
      ),
      fetchAllRows<RawContactCompte>(
        'contacts_comptes',
        'contact_id, relation_directe, compte:comptes(id, nom)',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        compteId && idsRetenus && idsRetenus.length ? (q: any) => q.in('contact_id', idsRetenus as string[]) : undefined,
      ),
    ])

    const sitesParContact = new Map<string, { id: string; nom: string; compte_id: string | null; fonction_sur_site: string | null }[]>()
    for (const cs of contactsSites) {
      if (!cs.site) continue
      const list = sitesParContact.get(cs.contact_id) ?? []
      list.push({ id: cs.site.id, nom: cs.site.nom, compte_id: cs.site.compte_id, fonction_sur_site: cs.fonction_sur_site })
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
        // Les sites choisis à la création appartiennent au compte du contact : on le renseigne
        // ici plutôt que de l'exiger de l'appelant, qui ne l'a pas sous la main.
        sites: input.sites.map((st) => ({ ...st, compte_id: input.compte_id })),
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

// ── Rattachement d'un contact à plusieurs comptes ───────────────────────────────────────────────
// Reprise de AccountContactRelation (13/08/2026) : jusque-là un contact n'appartenait qu'à un seul
// compte. Ces deux mutations sont ce qui permet de créer et défaire ces liens depuis l'interface —
// sans elles, seuls les 146 liens repris de Salesforce existeraient, sans moyen d'en ajouter.

export function useLierContactCompte() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      contactId,
      compteId,
      fonction,
    }: {
      contactId: string
      compteId: string
      fonction: string | null
    }) => {
      const { error } = await supabase.from('contacts_comptes').insert({
        contact_id: contactId,
        compte_id: compteId,
        relation_directe: false,
        ...(fonction ? { fonction_sur_compte: fonction } : {}),
      })
      // La contrainte d'unicité (contact_id, compte_id) empêche le doublon. On traduit le code
      // Postgres plutôt que de laisser remonter « duplicate key value violates unique constraint ».
      if (error) {
        throw new Error(error.code === '23505' ? 'Ce contact est déjà rattaché à ce compte.' : error.message)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })
}

export function useDelierContactCompte() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ contactId, compteId }: { contactId: string; compteId: string }) => {
      // `relation_directe` est exclu du delete : le compte principal vit dans contacts.compte_id,
      // le retirer d'ici laisserait les deux sources en désaccord. L'interface ne propose déjà pas
      // le bouton sur le principal, cette garde couvre le cas d'un appel direct.
      const { error } = await supabase
        .from('contacts_comptes')
        .delete()
        .eq('contact_id', contactId)
        .eq('compte_id', compteId)
        .eq('relation_directe', false)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })
}

/**
 * Mise à jour d'un seul champ, pour l'édition au clic.
 *
 * `useUpdateContact` exige l'objet complet : il convient à un formulaire, pas à un champ qu'on
 * modifie seul. William, le 13/08/2026 : « la logique qu'on avait mise pour modifier les champs,
 * c'était pas d'appuyer sur le bouton, c'était d'appuyer sur le champ ».
 *
 * Le formatage du téléphone et la casse du nom sont appliqués ici aussi : les passer seulement
 * dans la version complète ferait qu'un numéro saisi au clic resterait non formaté, et deux
 * chemins d'écriture produiraient deux résultats différents pour la même saisie.
 */
export function useUpdateContactField() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Contact> }) => {
      const normalise: Record<string, unknown> = { ...patch }
      if (typeof patch.telephone === 'string') normalise.telephone = patch.telephone ? formatPhoneFR(patch.telephone) : null
      if (typeof patch.telephone_mobile === 'string')
        normalise.telephone_mobile = patch.telephone_mobile ? formatPhoneFR(patch.telephone_mobile) : null
      if (typeof patch.nom === 'string') normalise.nom = toUpperFR(patch.nom) || patch.nom
      if (typeof patch.prenom === 'string') normalise.prenom = toTitleCaseFR(patch.prenom) || patch.prenom
      // `contact_principal` est dérivé du rôle et jamais saisi seul, même règle que dans Tools.
      if (typeof patch.role === 'string') normalise.contact_principal = patch.role === 'Décisionnaire'
      // Champs calculés à la lecture : les envoyer ferait échouer la requête sur une colonne absente.
      delete normalise.comptes
      delete normalise.sites
      delete normalise.compte_nom
      delete normalise.proprietaire_nom
      delete normalise.canal_communication

      const { error } = await supabase.from('contacts').update(normalise).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  })
}
