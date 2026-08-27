import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Mandat } from '@/types/domain'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

interface RawMandat {
  id: string
  id_salesforce: string | null
  compte_id: string
  date_signature: string | null
  date_envoi: string | null
  date_debut_validite: string | null
  date_fin_validite: string | null
  contact_signataire_id: string | null
  docusign_envelope_id: string | null
  proprietaire_id: string | null
  cree_par_id: string | null
  compte: { nom: string } | null
  statut: { code: string } | null
  contact_signataire: { prenom: string; nom: string } | null
  proprietaire: { prenom: string; nom: string } | null
  createur: { prenom: string; nom: string } | null
  date_creation: string
  date_modification: string
  duree_mois?: number | null
}

/**
 * `compteId` restreint la lecture aux mandats d'un compte, jointures comprises.
 *
 * Sans lui, afficher les cinq mandats d'une fiche compte téléchargeait les 1440 mandats du CRM,
 * plus la totalité de mandats_compteurs et mandats_courtiers — mesuré le 14/08/2026 : une fiche
 * compte déclenchait 56 requêtes, dont dix pour ces seules tables, et les postes les plus lents
 * n'arrivaient jamais au bout (voir le commentaire d'en-tête de CompteDetail).
 *
 * Les jointures sont filtrées sur les identifiants réellement retenus, et non rechargées en
 * entier : c'est ce qui fait passer le coût de « toute la table » à « ce qui est affiché ».
 */
async function fetchMandats(compteId?: string, mandatId?: string, listeSeule = false): Promise<Mandat[]> {
  try {
    const mandats = await fetchAllRows<RawMandat>(
      'mandats',
      // `*` plutôt qu'une liste de colonnes fixe : `duree_mois` vient d'être ajoutée par
      // migration et peut ne pas encore exister en prod au moment du déploiement -- un select
      // nommé sur une colonne absente ferait échouer la requête (400) pour TOUS les mandats.
      '*, compte:comptes(nom), statut:statuts_mandats(code), contact_signataire:contacts(prenom, nom), proprietaire:profils!mandats_proprietaire_id_fkey(prenom, nom), createur:profils!mandats_cree_par_id_fkey(prenom, nom)',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mandatId
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (q: any) => q.eq('id', mandatId)
        : compteId
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (q: any) => q.eq('compte_id', compteId)
          : undefined,
    )
    const mandatIds = mandats.map((m) => m.id)
    // Aucun mandat : les deux jointures n'ont plus rien à chercher.
    if (compteId && mandatIds.length === 0) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const surCesMandats = compteId ? (q: any) => q.in('mandat_id', mandatIds) : undefined
    const [compteursRows, courtiersRows] = await Promise.all([
      // Le tableau de bord ne lit ni les PDL ni les courtiers d'un mandat : voir useMandatsListe.
      listeSeule
        ? Promise.resolve([] as { mandat_id: string; compteur: { id: string; site_id: string } | null }[])
        : fetchAllRows<{ mandat_id: string; compteur: { id: string; site_id: string } | null }>('mandats_compteurs', 'mandat_id, compteur:compteurs(id, site_id)', surCesMandats),
      listeSeule
        ? Promise.resolve([] as { mandat_id: string; type_courtier: { code: string } | null }[])
        : fetchAllRows<{ mandat_id: string; type_courtier: { code: string } | null }>('mandats_courtiers', 'mandat_id, type_courtier:types_courtiers_mandat(code)', surCesMandats),
    ])

    const compteurIdsParMandat = new Map<string, string[]>()
    const siteIdsParMandat = new Map<string, string[]>()
    for (const mc of compteursRows) {
      if (!mc.compteur) continue
      const compteurList = compteurIdsParMandat.get(mc.mandat_id) ?? []
      compteurList.push(mc.compteur.id)
      compteurIdsParMandat.set(mc.mandat_id, compteurList)

      const siteList = siteIdsParMandat.get(mc.mandat_id) ?? []
      if (!siteList.includes(mc.compteur.site_id)) siteList.push(mc.compteur.site_id)
      siteIdsParMandat.set(mc.mandat_id, siteList)
    }

    const courtierCodesParMandat = new Map<string, string[]>()
    for (const mc of courtiersRows) {
      if (!mc.type_courtier) continue
      const list = courtierCodesParMandat.get(mc.mandat_id) ?? []
      list.push(mc.type_courtier.code)
      courtierCodesParMandat.set(mc.mandat_id, list)
    }

    const comptesVisibles = await fetchComptesVisibles()

    return filterVisibles(mandats, comptesVisibles, (m) => m.compte_id).map((m) => ({
      id: m.id,
      id_salesforce: m.id_salesforce,
      compte_id: m.compte_id,
      compte_nom: m.compte?.nom ?? '',
      statut: m.statut?.code ?? '',
      date_signature: m.date_signature,
      date_envoi: m.date_envoi,
      date_debut_validite: m.date_debut_validite,
      date_fin_validite: m.date_fin_validite,
      nb_sites_couverts: (siteIdsParMandat.get(m.id) ?? []).length,
      site_ids: siteIdsParMandat.get(m.id) ?? [],
      compteur_ids: compteurIdsParMandat.get(m.id) ?? [],
      contact_signataire_id: m.contact_signataire_id,
      contact_signataire_nom: m.contact_signataire ? `${m.contact_signataire.prenom} ${m.contact_signataire.nom}` : undefined,
      docusign_envelope_id: m.docusign_envelope_id,
      proprietaire_id: m.proprietaire_id,
      proprietaire_nom: m.proprietaire ? `${m.proprietaire.prenom} ${m.proprietaire.nom}` : null,
      // « Connaître qui a créé et envoyé le mandat est plus important que le propriétaire »
      // (William, 12/08/2026). Mandat__c n'a même pas d'OwnerId côté Salesforce : le créateur est
      // la seule information de responsabilité qui existe sur cet objet.
      cree_par_id: m.cree_par_id,
      createur_nom: m.createur ? `${m.createur.prenom} ${m.createur.nom}` : null,
      courtier_codes: courtierCodesParMandat.get(m.id) ?? [],
      duree_mois: m.duree_mois ?? null,
      date_creation: m.date_creation,
      date_modification: m.date_modification,
    }))
  } catch (error) {
    console.error('fetchMandats', error)
    return []
  }
}


/**
 * Un mandat lu par son identifiant.
 *
 * Les fiches le cherchaient avec `liste?.find(x => x.id === id)`, ce qui telechargeait la table
 * entiere pour en garder une ligne. Meme motif que useCompte et useSite.
 */
export function useMandat(mandatId: string | undefined) {
  return useQuery({
    queryKey: ['mandats', 'un', mandatId],
    queryFn: async () => (await fetchMandats(undefined, mandatId as string))[0] ?? null,
    enabled: !!mandatId,
  })
}
/** Mandats sans leurs PDL ni leurs courtiers -- pour qui n'affiche que l'en-tete. */
export function useMandatsListe() {
  return useQuery({ queryKey: ['mandats', 'liste'], queryFn: () => fetchMandats(undefined, undefined, true) })
}

export function useMandats() {
  return useQuery({ queryKey: ['mandats'], queryFn: () => fetchMandats() })
}

/** Mandats d'un seul compte, filtrés côté serveur. À préférer sur toute fiche. */
export function useMandatsParCompte(compteId: string | undefined) {
  return useQuery({
    queryKey: ['mandats', 'compte', compteId],
    queryFn: () => fetchMandats(compteId as string),
    enabled: !!compteId,
  })
}

interface CreateMandatInput {
  compte_id: string
  compte_nom: string
  compteur_ids: string[]
  compteurs: { id: string; site_id: string }[]
  date_signature: string | null
  duree_mois: number
  contact_signataire_id: string | null
  contact_signataire_nom?: string
  courtier_codes: string[]
  courtier_type_ids: string[]
}

function addMonthsISO(dateISO: string, months: number): string {
  const d = new Date(dateISO)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

interface CreateMandatResult {
  mandat: Mandat
  persisted: boolean
}

export function useCreateMandat() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateMandatInput): Promise<CreateMandatResult> => {
      let persisted = false
      const siteIds = [...new Set(input.compteurs.map((c) => c.site_id))]
      const dateDebut = input.date_signature ?? new Date().toISOString().slice(0, 10)
      const dateFin = addMonthsISO(dateDebut, input.duree_mois)
      let mandat: Mandat = {
        id: `local-${Date.now()}`,
        id_salesforce: null,
        compte_id: input.compte_id,
        compte_nom: input.compte_nom,
        statut: 'A_PREPARER',
        date_signature: input.date_signature,
        date_envoi: null,
        date_debut_validite: dateDebut,
        date_fin_validite: dateFin,
        nb_sites_couverts: siteIds.length,
        site_ids: siteIds,
        compteur_ids: input.compteur_ids,
        contact_signataire_id: input.contact_signataire_id,
        contact_signataire_nom: input.contact_signataire_nom,
        proprietaire_id: null,
        cree_par_id: null,
        courtier_codes: input.courtier_codes,
        duree_mois: input.duree_mois,
      }

      // Le créateur et le statut initial n'étaient pas écrits : chaque mandat créé dans Kimatch
      // reproduisait donc le trou qu'on vient de combler côté Salesforce (1429 cree_par_id vides),
      // et repartait sans statut — donc invisible dans tous les filtres qui s'appuient dessus.
      const [{ data: utilisateur }, { data: statutInitial }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('statuts_mandats').select('id').eq('code', 'A_PREPARER').maybeSingle(),
      ])
      const creePar = utilisateur.user?.id ?? null
      const statutId = (statutInitial as { id: string } | null)?.id ?? null
      mandat = { ...mandat, cree_par_id: creePar }

      const { data, error } = await supabase
        .from('mandats')
        .insert({
          compte_id: input.compte_id,
          date_signature: input.date_signature,
          date_debut_validite: dateDebut,
          date_fin_validite: dateFin,
          duree_mois: input.duree_mois,
          ...(creePar ? { cree_par_id: creePar } : {}),
          ...(statutId ? { statut_id: statutId } : {}),
          ...(input.contact_signataire_id ? { contact_signataire_id: input.contact_signataire_id } : {}),
        })
        .select('id')
        .single()
      if (!error && data) {
        const mandatId = (data as { id: string }).id
        mandat = { ...mandat, id: mandatId }
        persisted = true
        if (input.compteur_ids.length > 0) {
          await supabase
            .from('mandats_compteurs')
            .insert(input.compteur_ids.map((compteur_id) => ({ mandat_id: mandatId, compteur_id })))
        }
        if (input.courtier_type_ids.length > 0) {
          await supabase
            .from('mandats_courtiers')
            .insert(input.courtier_type_ids.map((type_courtier_id) => ({ mandat_id: mandatId, type_courtier_id })))
        }
      }

      queryClient.setQueryData<Mandat[]>(['mandats'], (old) => (old ? [mandat, ...old] : [mandat]))
      return { mandat, persisted }
    },
  })
}

interface MarkMandatEnvoyeResult {
  persisted: boolean
}

export function useMarkMandatEnvoye() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ mandatId, envelopeId, statutId }: { mandatId: string; envelopeId: string; statutId: string | null }): Promise<MarkMandatEnvoyeResult> => {
      const { error } = await supabase
        .from('mandats')
        .update({ docusign_envelope_id: envelopeId, ...(statutId ? { statut_id: statutId } : {}) })
        .eq('id', mandatId)
      const persisted = !error
      queryClient.setQueryData<Mandat[]>(['mandats'], (old) =>
        old?.map((m) => (m.id === mandatId ? { ...m, docusign_envelope_id: envelopeId, ...(statutId ? { statut: 'ENVOYE' } : {}) } : m)),
      )
      return { persisted }
    },
  })
}

/**
 * VALIDER UN MANDAT À LA MAIN — quand la signature s'est faite ailleurs.
 *
 * Naoëlle, 27/08/2026 : « il faudrait avoir la possibilité de valider un mandat manuellement, car
 * certains partenaires passent par leur propre DocuSign. »
 *
 * ══ CE QUI EXISTE DÉJÀ, ET CE QUI MANQUAIT VRAIMENT ══
 *
 * `api/docusign/webhook.ts` reçoit les événements DocuSign, vérifie leur signature HMAC, met à jour
 * mandats ET contrats, et archive le PDF signé. Il fonctionne : 6 mandats sont passés à ACTIF avec
 * date d'envoi et date de signature par ce chemin, dont un le 27/08 même.
 *
 * Le trou n'était donc PAS le webhook — c'était le cas où DocuSign n'est jamais impliqué. Quand un
 * partenaire signe sur SON outil, ou renvoie un PDF signé à l'ancienne, aucune enveloppe n'existe
 * chez nous : aucun événement n'arrivera jamais, et rien dans l'application ne permettait de
 * l'enregistrer. `useMarkMandatEnvoye` s'arrête à « envoyé », et l'édition en place ne touche que
 * `date_signature` sans changer le statut.
 *
 * ══ QUEL STATUT POSER : NI DEVINÉ, NI « SIGNÉ » ══
 *
 * La base répond sans ambiguïté, et ce n'est pas le statut qu'on croirait :
 *
 *   ACTIF    1 080 mandats — signés 1 080/1 080, encore valides 1 080/1 080
 *   EXPIRE      71 mandats — signés    71/71,    périmés         71/71
 *   SIGNE        0 mandat
 *
 * « Signé » (ordre 40) existe dans la table de référence mais n'est utilisé par aucune ligne : la
 * convention réelle est qu'un mandat signé est ACTIF s'il court encore, EXPIRÉ sinon. On suit cette
 * convention plutôt que d'introduire un troisième état que rien ne lit — sans quoi les mandats
 * validés à la main formeraient un groupe à part, invisible des écrans qui filtrent sur « actif ».
 *
 * ══ LA VALIDITÉ SE COMPLÈTE, ELLE NE S'ÉCRASE PAS ══
 *
 * Un mandat « à préparer » n'a pas de dates de validité (291 des 294 sont dans ce cas). On les pose
 * donc à la validation, avec la même formule qu'à la création — début = signature, fin = début +
 * `duree_mois`. Mais on ne touche PAS à celles déjà renseignées : elles peuvent venir du document
 * lui-même, et le partenaire a signé ce document-là, pas notre calcul.
 */
export function useValiderMandatManuellement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      mandatId: string
      dateSignature: string
      /** Où la signature a eu lieu, pour qu'un collègue ne cherche pas une enveloppe inexistante. */
      commentaire: string | null
      /** Les statuts de référence, résolus par l'écran (les codes ne sont pas des identifiants). */
      statutActifId: string | null
      statutExpireId: string | null
      /** Dates et durée actuelles, pour ne compléter que ce qui manque. */
      dateDebutValidite: string | null
      dateFinValidite: string | null
      dureeMois: number | null
    }) => {
      const debut = input.dateDebutValidite ?? input.dateSignature
      const fin =
        input.dateFinValidite ??
        (input.dureeMois ? addMonthsISO(debut, input.dureeMois) : null)

      // Le statut suit la validité, pas la date du jour de la saisie : on peut très bien enregistrer
      // aujourd'hui un mandat signé l'an dernier et déjà périmé.
      const aujourdHui = new Date().toISOString().slice(0, 10)
      const encoreValide = !fin || fin >= aujourdHui
      const statutId = encoreValide ? input.statutActifId : input.statutExpireId

      const { error } = await supabase
        .from('mandats')
        .update({
          date_signature: input.dateSignature,
          date_debut_validite: debut,
          ...(fin ? { date_fin_validite: fin } : {}),
          ...(statutId ? { statut_id: statutId } : {}),
          ...(input.commentaire ? { commentaire: input.commentaire } : {}),
        })
        .eq('id', input.mandatId)
      if (error) throw new Error(error.message)

      return { expire: !encoreValide, dateFin: fin }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mandats'] })
      // Le périmètre du compte affiche l'état des mandats : sans cette invalidation, la fiche
      // compte continuerait d'annoncer un mandat à préparer.
      void queryClient.invalidateQueries({ queryKey: ['comptes'] })
    },
  })
}

export interface UpdateMandatInput {
  id: string
  date_signature: string | null
  proprietaire_id: string | null
}

export function useUpdateMandat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateMandatInput) => {
      const { error } = await supabase
        .from('mandats')
        .update({ date_signature: input.date_signature, proprietaire_id: input.proprietaire_id })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['mandats'] }) },
  })
}

/** Colonnes réellement modifiables de `mandats`, pour l'édition en place. */
export type PatchMandat = Partial<{
  date_signature: string | null
  proprietaire_id: string | null
}>

/** Mise à jour d'un seul champ. Ne pas passer par `useUpdateMandat` pour ça : il écrit les deux
 * colonnes à chaque appel, et modifier la date de signature effacerait le propriétaire. */
export function useUpdateMandatPartiel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PatchMandat }) => {
      const { error } = await supabase.from('mandats').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mandats'] }),
  })
}

export function useDeleteMandat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mandats').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['mandats'] }) },
  })
}
