/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * RATTACHER UN COMPTEUR À UN AUTRE COMPTE — CE QU'ON LIT AVANT, CE QU'ON ÉCRIT APRÈS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 15/09/2026 : « Très important de pouvoir changer rapidement de rattachement. Par exemple
 * changer le compteur pour l'enlever de KIWEE ENERGIE FRANCE pour le rattacher à un autre compte
 * (barre de recherche dynamique). »
 *
 * ══ LA RECHERCHE VA AU SERVEUR, ELLE NE FILTRE PAS UNE LISTE CHARGÉE ══
 *
 * `useComptes()` lit la table entière — 2 782 comptes, quatre sous-requêtes imbriquées, 2,8 s
 * mesurées en production sur une fiche. L'ancienne fenêtre de déplacement s'en servait pour
 * alimenter son champ de recherche : on payait tout le CRM pour taper trois lettres.
 *
 * Ici, chaque frappe interroge le serveur sur cinq colonnes et rend vingt lignes. Le débounce est
 * dans le composant, la requête est mise en cache par React Query : retaper la même chose ne
 * renvoie rien sur le réseau.
 *
 * ON CHERCHE AUSSI PAR SIREN ET PAR VILLE parce que c'est ce qui sépare deux sociétés d'un même
 * groupe — DIMOTRANS GROUP de DIMOTRANS SOLUTIONS — et que se tromper de société est précisément
 * l'erreur que ce geste peut coûter.
 *
 * ══ L'APERÇU DIT CE QUI SUIT ET CE QUI RESTE ══
 *
 * Un mandat est signé et couvre souvent plusieurs compteurs : il ne suit pas. L'écran doit le dire
 * AVANT, sinon le compteur arrive chez une société qui n'a pas le droit de le négocier — et 2 249
 * des 7 936 compteurs sont sous mandat, 1 448 sous contrat.
 *
 * ══ L'ÉCRITURE EST EN BASE, EN UN SEUL APPEL ══
 *
 * `fn_rattacher_compteur` (migration 20260915100000) touche quatre à six tables. Un enchaînement
 * d'appels depuis le navigateur peut s'appliquer à moitié, et fabriquer l'incohérence exacte que cet
 * écran sert à réparer — c'est d'ailleurs ce qui est arrivé aux deux seuls déplacements jamais
 * effectués, restés à cheval entre deux sociétés.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/* ═══════════════════════════════ ① CHERCHER UNE SOCIÉTÉ ═══════════════════════════════════════ */

export interface CompteTrouve {
  id: string
  nom: string
  ville: string | null
  segment: string | null
  type_compte: string | null
  siren: string | null
  /** Le parc de la société d'arrivée. Rattacher à une société qui n'a aucun compteur est permis —
   *  mais ça mérite d'être vu avant de cliquer. */
  nbCompteurs: number
}

/** Les caractères qui ne comptent pas dans un nom de société : on cherche « saint-priest » en tapant « saint priest ». */
const echapper = (q: string) => q.replace(/[%_,()]/g, ' ').trim()

async function chercherComptes(q: string, exclureId: string | undefined): Promise<CompteTrouve[]> {
  const terme = echapper(q)
  if (terme.length < 2) return []

  const { data, error } = await supabase
    .from('comptes')
    .select('id, nom, ville, segment, type_compte, siren')
    .or(`nom.ilike.%${terme}%,siren.ilike.%${terme}%,siret.ilike.%${terme}%,ville.ilike.%${terme}%`)
    .order('nom')
    .limit(20)
  if (error) throw new Error(`Recherche impossible : ${error.message}`)

  const comptes = (data ?? []).filter((c) => c.id !== exclureId)
  if (comptes.length === 0) return []

  // LE PARC EN UNE SEULE LECTURE, pas une par ligne : vingt comptages séquentiels feraient vingt
  // allers-retours à chaque frappe.
  const { data: parcs, error: eParc } = await supabase
    .from('compteurs')
    .select('compte_id')
    .in('compte_id', comptes.map((c) => c.id))
  if (eParc) throw new Error(`Impossible de compter les compteurs : ${eParc.message}`)

  const parParc = new Map<string, number>()
  for (const ligne of parcs ?? []) {
    const cle = ligne.compte_id as string
    parParc.set(cle, (parParc.get(cle) ?? 0) + 1)
  }

  return comptes.map((c) => ({
    id: c.id as string,
    nom: c.nom as string,
    ville: (c.ville as string) || null,
    segment: (c.segment as string) || null,
    type_compte: (c.type_compte as string) || null,
    siren: (c.siren as string) || null,
    nbCompteurs: parParc.get(c.id as string) ?? 0,
  }))
}

export function useRechercheComptes(q: string, exclureId: string | undefined) {
  return useQuery({
    queryKey: ['recherche-comptes', q, exclureId],
    enabled: echapper(q).length >= 2,
    // Une recherche ne se périme pas en trente secondes : revenir sur une frappe déjà faite doit
    // être instantané.
    staleTime: 60_000,
    queryFn: () => chercherComptes(q, exclureId),
  })
}

/* ═══════════════════════════════ ② CE QUE LE CHANGEMENT ENTRAÎNE ══════════════════════════════ */

export interface VoisinDuLieu {
  id: string
  numero: string
  libelle: string | null
}

/**
 * Un mandat que le compteur va quitter.
 *
 * `entier` : ce compteur est le DERNIER que ce mandat couvre encore, donc le mandat tout entier
 * deviendra caduc. C'est la différence entre « ce PDL sort du périmètre » et « ce document ne sert
 * plus à rien » — et elle change ce qu'il y a à faire ensuite.
 */
export interface MandatQuiDevientCaduc {
  id: string
  reference: string | null
  statut: string
  entier: boolean
}

export interface ApercuRattachement {
  /** Les compteurs du même lieu, encore chez le compte d'origine, hors celui qu'on déplace. */
  voisins: VoisinDuLieu[]
  /** Faux ⇒ le responsable actuel appartiendra à une autre société que le compteur. */
  responsableRattache: boolean
  /** Ce qui suit le compteur sans qu'on l'ait désigné. */
  signaux: number
  requetes: number
  consommations: number
  /**
   * LES MANDATS QUE LE COMPTEUR QUITTE. Ce ne sont pas des « restes » : un mandat lie une société à
   * SES points de livraison, donc celui qui part cesse d'être couvert. C'est la conséquence la plus
   * lourde du geste, et la seule qui se traduise par « il faut refaire signer ».
   */
  mandatsCaducs: MandatQuiDevientCaduc[]
  /**
   * Ce qui ne bouge pas, parce que ce sont des engagements du compte d'origine. Le CONTRAT en
   * particulier reste attaché au compte qui l'a signé — William, 15/09/2026 : « le contrat lui n'est
   * pas caduque, il doit rester attaché au compte de base et au(x) compteur(s) ».
   */
  contrats: number
  recommandations: number
  opportunites: number
  aDesRestes: boolean
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
 * Combien d'objets d'une famille, appartenant encore au compte d'origine, couvrent ce compteur.
 *
 * LES NOMS DE COLONNES SONT DES VARIABLES, donc `select()` ne peut rien inférer : le type générique
 * de supabase-js lit la chaîne littérale pour déduire la forme du résultat. On passe par `unknown`
 * une fois, explicitement, plutôt que de recopier quatre fonctions identiques.
 */
async function restesDeLaFamille(
  liaison: string,
  colonneParent: string,
  parent: string,
  compteurId: string,
  compteOrigine: string,
): Promise<number> {
  const lecture = (await supabase
    .from(liaison)
    .select(colonneParent)
    .eq('compteur_id', compteurId)) as unknown as {
    data: Record<string, unknown>[] | null
    error: { message: string } | null
  }
  if (lecture.error) throw new Error(`Impossible de lire ${liaison} : ${lecture.error.message}`)

  const ids = [...new Set((lecture.data ?? []).map((l) => l[colonneParent] as string))].filter(Boolean)
  if (ids.length === 0) return 0

  const { count, error } = await supabase
    .from(parent)
    .select('id', { count: 'exact', head: true })
    .in('id', ids)
    .eq('compte_id', compteOrigine)
  if (error) throw new Error(`Impossible de lire ${parent} : ${error.message}`)
  return count ?? 0
}

/**
 * Les mandats que ce compteur quitte, et lesquels d'entre eux se videront complètement.
 *
 * ON NE REGARDE QUE LES LIENS ENCORE VIVANTS (`caduc_depuis is null`) : un compteur déjà sorti du
 * périmètre d'un mandat n'en sort pas une seconde fois, et l'annoncer ferait croire à une perte qui
 * a déjà eu lieu.
 *
 * `entier` se calcule en comptant ce qui RESTERAIT au mandat : ce compteur est-il le dernier ? La
 * même condition que celle qui fera basculer le statut en base — l'écran et la fonction doivent dire
 * la même chose, sinon l'un des deux ment.
 */
async function mandatsQuittes(compteurId: string, compteDestination: string): Promise<MandatQuiDevientCaduc[]> {
  const { data: liens, error } = await supabase
    .from('mandats_compteurs')
    .select('mandat_id, mandat:mandats(id, reference, compte_id, statut:statuts_mandats(code))')
    .eq('compteur_id', compteurId)
    .is('caduc_depuis', null)
  if (error) throw new Error(`Impossible de lire les mandats : ${error.message}`)

  const concernes = (liens ?? [])
    .map((l) => l.mandat as unknown as { id: string; reference: string | null; compte_id: string; statut: { code: string } | null } | null)
    .filter((m): m is { id: string; reference: string | null; compte_id: string; statut: { code: string } | null } =>
      Boolean(m) && m!.compte_id !== compteDestination)
  if (concernes.length === 0) return []

  // Les autres compteurs encore couverts par ces mandats, en une seule lecture.
  const { data: restants, error: eRestants } = await supabase
    .from('mandats_compteurs')
    .select('mandat_id, compteur_id')
    .in('mandat_id', concernes.map((m) => m.id))
    .is('caduc_depuis', null)
  if (eRestants) throw new Error(`Impossible de lire le périmètre des mandats : ${eRestants.message}`)

  const autresParMandat = new Map<string, number>()
  for (const l of restants ?? []) {
    if (l.compteur_id === compteurId) continue
    autresParMandat.set(l.mandat_id as string, (autresParMandat.get(l.mandat_id as string) ?? 0) + 1)
  }

  return concernes.map((m) => ({
    id: m.id,
    reference: m.reference,
    statut: m.statut?.code ?? '',
    entier: (autresParMandat.get(m.id) ?? 0) === 0,
  }))
}

/**
 * Rien n'est interrogé tant que la société de destination n'est pas choisie : « ce qui reste
 * derrière » n'a pas de sens sans savoir où l'on va.
 */
export function useApercuRattachement(
  compteurId: string | undefined,
  groupeSiteId: string | undefined,
  compteOrigine: string | undefined,
  compteDestination: string | undefined,
  responsableId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['apercu-rattachement', compteurId, compteDestination, responsableId],
    enabled: !!compteurId && !!groupeSiteId && !!compteOrigine && !!compteDestination,
    staleTime: 0,
    queryFn: async (): Promise<ApercuRattachement> => {
      const cId = compteurId as string
      const origine = compteOrigine as string
      const destination = compteDestination as string

      const [voisinsBruts, signaux, requetes, consommations, mandatsCaducs, contrats, recos, opportunites, responsableRattache] =
        await Promise.all([
          supabase
            .from('compteurs')
            .select('id, numero_point, libelle')
            .eq('groupe_site_id', groupeSiteId as string)
            .eq('compte_id', origine),
          compter('signaux', { compteur_id: cId }),
          compter('requetes', { compteur_id: cId }),
          compter('consommations', { compteur_id: cId }),
          mandatsQuittes(cId, destination),
          restesDeLaFamille('contrats_compteurs', 'contrat_id', 'suivis_contrats', cId, origine),
          restesDeLaFamille('recommandations_compteurs', 'recommandation_id', 'recommandations', cId, origine),
          restesDeLaFamille('opportunites_compteurs', 'opportunite_id', 'opportunites', cId, origine),
          // LA MÊME FONCTION QUE CELLE QUI TRANCHERA À L'ÉCRITURE. Réimplémenter le test ici ferait
          // dire à l'écran « ce contact est rattaché » là où la base refuserait — les trois chemins
          // de rattachement (compte principal, contacts_comptes, contacts_sites) sont subtils.
          responsableId
            ? supabase.rpc('fn_contact_rattache_au_compte', {
                p_contact_id: responsableId,
                p_compte_id: destination,
              })
            : Promise.resolve({ data: true, error: null }),
        ])

      if (voisinsBruts.error) throw new Error(`Impossible de lire le lieu : ${voisinsBruts.error.message}`)

      return {
        voisins: (voisinsBruts.data ?? [])
          .filter((c) => c.id !== cId)
          .map((c) => ({ id: c.id as string, numero: c.numero_point as string, libelle: (c.libelle as string) ?? null })),
        responsableRattache: Boolean(responsableRattache.data),
        signaux,
        requetes,
        consommations,
        mandatsCaducs,
        contrats,
        recommandations: recos,
        opportunites,
        aDesRestes: contrats + recos + opportunites > 0,
      }
    },
  })
}

/**
 * Ce contact est-il rattaché à ce compte ?
 *
 * LA MÊME FONCTION QUE CELLE QUI TRANCHE À L'ÉCRITURE. Les trois chemins de rattachement — compte
 * principal, `contacts_comptes`, `contacts_sites` — sont subtils ; les réimplémenter ici ferait dire
 * à l'écran « ce contact est rattaché » là où la base refuserait.
 *
 * C'est la question que pose le cartouche du responsable, au repos, sans rien déplacer.
 */
export function useContactRattacheAuCompte(contactId: string | null | undefined, compteId: string | null | undefined) {
  return useQuery({
    queryKey: ['contact-rattache', contactId, compteId],
    enabled: !!contactId && !!compteId,
    staleTime: 30_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('fn_contact_rattache_au_compte', {
        p_contact_id: contactId as string,
        p_compte_id: compteId as string,
      })
      if (error) throw new Error(`Impossible de vérifier le rattachement : ${error.message}`)
      return Boolean(data)
    },
  })
}

/* ═══════════════════════════════ ③ L'ÉCRITURE ═════════════════════════════════════════════════ */

/** Ce qu'on décide du responsable quand il n'appartient pas à la société d'arrivée. */
export type ActionResponsable = 'CHOISIR' | 'RATTACHER' | 'LAISSER' | 'RETIRER'

export interface ResultatRattachement {
  compteur: string
  lieu: string | null
  compte_origine: string
  compte_destination: string
  suivis: {
    compteurs_voisins: number
    lieu_suit: boolean
    requetes: number
    interactions: number
    responsable_action: ActionResponsable
    responsable_nom: string | null
    relais_nom: string | null
    tache_relais: string | null
  }
  /** Ce que la caducité a réellement écrit — les nombres viennent de la base, pas de l'aperçu. */
  caducite: { liens_caducs: number; mandats_caducs: number }
  restes: { mandats: number; contrats: number; recommandations: number; opportunites: number }
}

/** Le message quand la migration n'est pas encore passée : un message brut ferait chercher ailleurs. */
function erreurLisible(message: string): string {
  if (message.includes('fn_rattacher_compteur')) {
    return 'Le rattachement n’est pas encore disponible : la migration 20260915100000 n’a pas été appliquée.'
  }
  return message
}

/** TOUT CE QUI DÉPEND DE L'ARBRE compte → compteur est à relire après un rattachement. */
function relire(queryClient: ReturnType<typeof useQueryClient>) {
  for (const cle of [
    ['compteurs'], ['compteur'], ['sites'], ['comptes'], ['compte'], ['signaux'], ['requetes'],
    ['interactions'], ['actions'], ['contacts'], ['apercu-rattachement'], ['couverture-cs'],
    ['compteurs-liste'],
  ]) {
    void queryClient.invalidateQueries({ queryKey: cle })
  }
}

export function useRattacherCompteur() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      compteurId: string
      compteDestinationId: string
      emmenerLeLieu: boolean
      actionResponsable: ActionResponsable
      responsableContactId: string | null
      motif: string | null
    }): Promise<ResultatRattachement> => {
      const { data, error } = await supabase.rpc('fn_rattacher_compteur', {
        p_compteur_id: input.compteurId,
        p_compte_destination_id: input.compteDestinationId,
        p_emmener_le_lieu: input.emmenerLeLieu,
        p_responsable_action: input.actionResponsable,
        p_responsable_contact_id: input.responsableContactId,
        p_motif: input.motif,
      })
      if (error) throw new Error(erreurLisible(error.message))
      return data as ResultatRattachement
    },
    onSuccess: () => relire(queryClient),
  })
}
