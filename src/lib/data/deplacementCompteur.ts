/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CHANGER LE COMPTE D'UN COMPTEUR — CE QU'ON MONTRE AVANT DE LE FAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 07/09/2026 : « donne la possibilité dans le compteur de changer le compte de ce compteur
 * et bien sûr aussi des objets qui sont dépendants de ce compteur ». Puis : « il faudrait que quand
 * on change le compte du compteur, ça change automatiquement le compte du site auquel il est
 * rattaché ».
 *
 * ══ UN COMPTEUR N'A PAS DE COMPTE, D'OÙ DEUX GESTES ══
 *
 * `compteurs` porte `site_id`, pas `compte_id` : le compte se lit à travers le site. Changer le
 * compte d'un compteur, c'est donc soit
 *
 *   ① EMMENER LE SITE — le site change de compte, et tout l'immeuble suit : ses compteurs, ses
 *     signaux, ses contacts de site, ses actions. C'est le geste demandé, et le bon quand le SITE
 *     était rangé sous la mauvaise société.
 *
 *   ② RANGER LE COMPTEUR AILLEURS — seul le compteur change de parent, le site reste où il est.
 *     Le geste quand un seul PDL d'un immeuble a été mal attribué.
 *
 * MESURÉ LE 07/09/2026 : 5 352 compteurs sur 7 919 (67,6 %) sont SEULS sur leur site — ① n'emmène
 * alors rien d'autre. Les 2 567 autres (32,4 %) partagent leur site : ① emmène aussi leurs voisins,
 * et c'est pour ça que l'écran les nomme un par un avant le clic.
 *
 * ══ CE FICHIER EST L'APERÇU, PAS L'ACTION ══
 *
 * L'ÉCRITURE se fait dans `fn_deplacer_site` et `fn_deplacer_compteur` (migration 20260907260000),
 * en base, parce qu'un déplacement touche trois à quatre tables et qu'un enchaînement d'appels
 * depuis le navigateur peut s'appliquer à moitié — fabriquant l'incohérence exacte que l'écran sert
 * à réparer.
 *
 * CE FICHIER ne fait que COMPTER, pour que la fenêtre dise la vérité avant le clic. Les fonctions
 * rendent leur propre décompte après coup, et l'écran affiche celui-là : un écart entre l'annonce et
 * le résultat se voit alors immédiatement.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Un objet qui reste sur l'ancien compte, nommé quand il porte une référence lisible. */
export interface ObjetReste {
  id: string
  libelle: string
}

/** Un compteur voisin, qui suivra le site sans qu'on l'ait désigné. */
export interface CompteurVoisin {
  id: string
  numero: string
  libelle: string | null
}

/** Un contact porté par le compteur, et son éligibilité sur le compte de destination. */
export interface ContactPorte {
  id: string
  nom: string
  role: 'Responsable' | 'Conseil syndical'
  /** Faux ⇒ après le déplacement, ce contact appartient à une autre société. */
  rattacheALaDestination: boolean
}

/** Ce que les deux gestes laissent derrière eux : les objets du compte d'origine. */
export interface RestesSurLAncienCompte {
  mandats: number
  contrats: ObjetReste[]
  recommandations: ObjetReste[]
  opportunites: ObjetReste[]
  aDesRestes: boolean
}

/** ① Emmener le site. */
export interface InventaireSite extends RestesSurLAncienCompte {
  /** Les compteurs du site AUTRES que celui d'où l'on part : ils suivent sans avoir été désignés. */
  voisins: CompteurVoisin[]
  signaux: number
  contactsSite: number
  actions: number
  requetes: number
  interactions: number
}

/** ② Ranger le compteur dans un autre site. */
export interface InventaireCompteur extends RestesSurLAncienCompte {
  signaux: number
  requetes: number
  consommations: number
  contacts: ContactPorte[]
}

/** Un comptage sans transfert de lignes. Une erreur ne vaut jamais zéro : elle remonte. */
async function compter(table: string, filtres: Record<string, string>): Promise<number> {
  let r = supabase.from(table).select('id', { count: 'exact', head: true })
  for (const [col, val] of Object.entries(filtres)) r = r.eq(col, val)
  const { count, error } = await r
  if (error) throw new Error(`Impossible de compter ${table} : ${error.message}`)
  return count ?? 0
}

/**
 * Les objets d'une famille qui touchent ces lignes ET appartiennent encore à l'ancien compte.
 *
 * LES NOMS DE COLONNES SONT DES VARIABLES, donc `select()` ne peut rien inférer : le type générique
 * de supabase-js lit la chaîne littérale pour déduire la forme du résultat, et une chaîne calculée le
 * fait retomber sur `ParserError`. On passe par `unknown` une fois, explicitement, plutôt que de
 * recopier six fonctions identiques pour satisfaire l'inférence.
 */
async function restesDeLaFamille(
  liaison: string,
  colonneEnfant: string,
  idsEnfants: string[],
  colonneParent: string,
  parent: string,
  etiquette: string,
  compteOrigine: string,
): Promise<ObjetReste[]> {
  if (idsEnfants.length === 0) return []

  const lecture = (await supabase
    .from(liaison)
    .select(colonneParent)
    .in(colonneEnfant, idsEnfants)) as unknown as {
    data: Record<string, unknown>[] | null
    error: { message: string } | null
  }
  if (lecture.error) throw new Error(`Impossible de lire ${liaison} : ${lecture.error.message}`)
  const ids = [...new Set((lecture.data ?? []).map((l) => l[colonneParent] as string))].filter(Boolean)
  if (ids.length === 0) return []

  const lectureParents = (await supabase
    .from(parent)
    .select(`id, ${etiquette}`)
    .in('id', ids)
    .eq('compte_id', compteOrigine)) as unknown as {
    data: Record<string, unknown>[] | null
    error: { message: string } | null
  }
  if (lectureParents.error) throw new Error(`Impossible de lire ${parent} : ${lectureParents.error.message}`)

  return (lectureParents.data ?? []).map((ligne) => {
    const brut = ligne[etiquette]
    return {
      id: ligne.id as string,
      libelle: typeof brut === 'string' && brut.trim() ? brut : 'sans référence',
    }
  })
}

/** Combien de mandats du compte d'origine couvrent ces compteurs. */
async function mandatsRestants(idsCompteurs: string[], compteOrigine: string): Promise<number> {
  // Les mandats n'ont pas d'étiquette exploitable : 1 453 des 1 461 n'ont pas de numéro. On les
  // compte, sans prétendre les nommer.
  const restes = await restesDeLaFamille(
    'mandats_compteurs', 'compteur_id', idsCompteurs, 'mandat_id', 'mandats', 'numero', compteOrigine,
  )
  return restes.length
}

/**
 * Un contact est-il rattaché à ce compte, de quelque manière que ce soit ?
 *
 * Les trois chemins, comme partout depuis le 07/09/2026 : le compte principal, `contacts_comptes`,
 * et les sites. Un contact « lié » à un compte est éligible pour tout ce qui en découle.
 */
async function rattacheAuCompte(contactId: string, compteId: string): Promise<boolean> {
  const { data: direct } = await supabase.from('contacts').select('compte_id').eq('id', contactId).maybeSingle()
  if (direct?.compte_id === compteId) return true

  if ((await compter('contacts_comptes', { contact_id: contactId, compte_id: compteId })) > 0) return true

  const { data: sitesDuCompte } = await supabase.from('sites').select('id').eq('compte_id', compteId)
  const ids = (sitesDuCompte ?? []).map((s) => s.id as string)
  if (ids.length === 0) return false
  const { count } = await supabase
    .from('contacts_sites')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId)
    .in('site_id', ids)
  return (count ?? 0) > 0
}

async function contactsPortes(compteurId: string, compteDestination: string): Promise<ContactPorte[]> {
  const { data: compteur, error } = await supabase
    .from('compteurs')
    .select('responsable_contact_id, contact_conseil_syndical_id')
    .eq('id', compteurId)
    .maybeSingle()
  if (error) throw new Error(`Impossible de lire le compteur : ${error.message}`)
  if (!compteur) return []

  const paires: { id: string; role: ContactPorte['role'] }[] = []
  if (compteur.responsable_contact_id) paires.push({ id: compteur.responsable_contact_id as string, role: 'Responsable' })
  if (compteur.contact_conseil_syndical_id) {
    paires.push({ id: compteur.contact_conseil_syndical_id as string, role: 'Conseil syndical' })
  }
  if (paires.length === 0) return []

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, prenom, nom')
    .in('id', paires.map((p) => p.id))

  const resultats: ContactPorte[] = []
  for (const p of paires) {
    const c = (contacts ?? []).find((x) => x.id === p.id)
    resultats.push({
      id: p.id,
      nom: c ? `${c.prenom ?? ''} ${c.nom ?? ''}`.trim() || 'Contact sans nom' : 'Contact introuvable',
      role: p.role,
      rattacheALaDestination: await rattacheAuCompte(p.id, compteDestination),
    })
  }
  return resultats
}

/** Les compteurs d'un site, celui d'où l'on part exclu. */
async function voisinsDuSite(siteId: string, compteurId: string): Promise<CompteurVoisin[]> {
  const { data, error } = await supabase
    .from('compteurs')
    .select('id, numero_point, libelle')
    .eq('site_id', siteId)
  if (error) throw new Error(`Impossible de lire les compteurs du site : ${error.message}`)
  return (data ?? [])
    .filter((c) => c.id !== compteurId)
    .map((c) => ({ id: c.id as string, numero: c.numero_point as string, libelle: (c.libelle as string) ?? null }))
}

/**
 * ① L'aperçu de « emmener le site ».
 *
 * Rien n'est interrogé tant que la société de destination n'est pas choisie : « ce qui reste
 * derrière » n'a pas de sens sans savoir où l'on va.
 */
export function useInventaireSite(
  siteId: string | undefined,
  compteurId: string | undefined,
  compteOrigine: string | undefined,
  compteDestination: string | undefined,
  actif: boolean,
) {
  return useQuery({
    queryKey: ['deplacement-site', siteId, compteOrigine, compteDestination],
    enabled: actif && !!siteId && !!compteurId && !!compteOrigine && !!compteDestination,
    staleTime: 0,
    queryFn: async (): Promise<InventaireSite> => {
      const sId = siteId as string
      const origine = compteOrigine as string

      const voisins = await voisinsDuSite(sId, compteurId as string)
      const tousLesCompteurs = [compteurId as string, ...voisins.map((v) => v.id)]

      const [signaux, contactsSite, actions, interactions, mandats, contrats, recos, opportunites] =
        await Promise.all([
          compter('signaux', { site_id: sId }),
          compter('contacts_sites', { site_id: sId }),
          compter('actions', { site_id: sId }),
          compter('interactions', { site_id: sId, compte_id: origine }),
          mandatsRestants(tousLesCompteurs, origine),
          restesDeLaFamille('contrats_compteurs', 'compteur_id', tousLesCompteurs, 'contrat_id', 'suivis_contrats', 'reference', origine),
          restesDeLaFamille('recommandations_sites', 'site_id', [sId], 'recommandation_id', 'recommandations', 'nom', origine),
          restesDeLaFamille('opportunites_sites', 'site_id', [sId], 'opportunite_id', 'opportunites', 'reference', origine),
        ])

      // LES REQUÊTES SE COMPTENT EN UNE FOIS, sans additionner deux comptages : une réclamation qui
      // nomme à la fois le site et un de ses compteurs serait alors comptée deux fois.
      const { count: requetes, error: eReq } = await supabase
        .from('requetes')
        .select('id', { count: 'exact', head: true })
        .eq('compte_id', origine)
        .or(`site_id.eq.${sId},compteur_id.in.(${tousLesCompteurs.join(',')})`)
      if (eReq) throw new Error(`Impossible de compter les requêtes : ${eReq.message}`)

      return {
        voisins,
        signaux,
        contactsSite,
        actions,
        requetes: requetes ?? 0,
        interactions,
        mandats,
        contrats,
        recommandations: recos,
        opportunites,
        aDesRestes: mandats + contrats.length + recos.length + opportunites.length > 0,
      }
    },
  })
}

/** ② L'aperçu de « ranger le compteur dans un autre site ». */
export function useInventaireCompteur(
  compteurId: string | undefined,
  compteOrigine: string | undefined,
  compteDestination: string | undefined,
  siteOrigineId: string | undefined,
  actif: boolean,
) {
  return useQuery({
    queryKey: ['deplacement-compteur', compteurId, compteOrigine, compteDestination],
    enabled: actif && !!compteurId && !!compteOrigine && !!compteDestination && !!siteOrigineId,
    staleTime: 0,
    queryFn: async (): Promise<InventaireCompteur> => {
      const cId = compteurId as string
      const origine = compteOrigine as string
      const destination = compteDestination as string
      const memeCompte = origine === destination

      const [signaux, requetes, consommations, mandats, contrats, recos, opportunites, contacts] =
        await Promise.all([
          // Seuls les signaux encore accrochés au site d'origine seront réécrits : c'est ce que fait
          // la fonction en base, et l'aperçu doit dire la même chose qu'elle.
          compter('signaux', { compteur_id: cId, site_id: siteOrigineId as string }),
          compter('requetes', { compteur_id: cId }),
          compter('consommations', { compteur_id: cId }),
          memeCompte ? Promise.resolve(0) : mandatsRestants([cId], origine),
          memeCompte ? Promise.resolve([]) : restesDeLaFamille('contrats_compteurs', 'compteur_id', [cId], 'contrat_id', 'suivis_contrats', 'reference', origine),
          memeCompte ? Promise.resolve([]) : restesDeLaFamille('recommandations_compteurs', 'compteur_id', [cId], 'recommandation_id', 'recommandations', 'nom', origine),
          memeCompte ? Promise.resolve([]) : restesDeLaFamille('opportunites_compteurs', 'compteur_id', [cId], 'opportunite_id', 'opportunites', 'reference', origine),
          memeCompte ? Promise.resolve([]) : contactsPortes(cId, destination),
        ])

      return {
        signaux,
        requetes,
        consommations,
        mandats,
        contrats,
        recommandations: recos,
        opportunites,
        aDesRestes: mandats + contrats.length + recos.length + opportunites.length > 0,
        contacts,
      }
    },
  })
}

/* ═════════════════════════════════════ LES DEUX ÉCRITURES ═════════════════════════════════════ */

export interface ResultatSite {
  geste: 'site'
  site: string
  compte_origine: string
  compte_destination: string
  suivis: { compteurs: number; signaux: number; contacts_site: number; actions: number; requetes: number; interactions: number }
  restes: { mandats: number; contrats: number; recommandations: number; opportunites: number }
}

export interface ResultatCompteur {
  geste: 'compteur'
  compteur: string
  change_de_compte: boolean
  site_origine: string
  site_destination: string
  suivis: { signaux: number; requetes: number; contacts_detaches: number }
  restes: { mandats: number; contrats: number; recommandations: number; opportunites: number }
}

export type ResultatDeplacement = ResultatSite | ResultatCompteur

/** Le message quand la migration n'est pas encore passée : un message brut ferait chercher ailleurs. */
function erreurLisible(message: string): string {
  if (message.includes('fn_deplacer_site') || message.includes('fn_deplacer_compteur')) {
    return 'Le déplacement n’est pas encore disponible : la migration 20260907260000 n’a pas été appliquée.'
  }
  return message
}

/** TOUT CE QUI DÉPEND DE L'ARBRE compte → site → compteur est à relire après un déplacement. */
function relire(queryClient: ReturnType<typeof useQueryClient>) {
  for (const cle of [
    ['compteurs'], ['sites'], ['comptes'], ['signaux'], ['requetes'], ['interactions'],
    ['actions'], ['contacts'], ['deplacement-site'], ['deplacement-compteur'],
  ]) {
    void queryClient.invalidateQueries({ queryKey: cle })
  }
}

export function useDeplacerSite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { siteId: string; compteDestinationId: string; motif: string | null }): Promise<ResultatSite> => {
      const { data, error } = await supabase.rpc('fn_deplacer_site', {
        p_site_id: input.siteId,
        p_compte_destination_id: input.compteDestinationId,
        p_motif: input.motif,
      })
      if (error) throw new Error(erreurLisible(error.message))
      return data as ResultatSite
    },
    onSuccess: () => relire(queryClient),
  })
}

export function useDeplacerCompteur() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      compteurId: string
      siteDestinationId: string
      detacherContacts: boolean
      motif: string | null
    }): Promise<ResultatCompteur> => {
      const { data, error } = await supabase.rpc('fn_deplacer_compteur', {
        p_compteur_id: input.compteurId,
        p_site_destination_id: input.siteDestinationId,
        p_detacher_contacts: input.detacherContacts,
        p_motif: input.motif,
      })
      if (error) throw new Error(erreurLisible(error.message))
      return data as ResultatCompteur
    },
    onSuccess: () => relire(queryClient),
  })
}
