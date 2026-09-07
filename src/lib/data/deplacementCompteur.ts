/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉPLACER UN COMPTEUR VERS UN AUTRE COMPTE — CE QU'ON MONTRE AVANT DE LE FAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 07/09/2026 : « donne la possibilité dans le compteur de changer le compte de ce compteur
 * et bien sûr aussi des objets qui sont dépendants de ce compteur ».
 *
 * ══ UN COMPTEUR N'A PAS DE COMPTE ══
 *
 * `compteurs` ne porte pas de `compte_id` : elle porte `site_id`, et le compte se lit à travers le
 * site. Changer le compte d'un compteur, c'est donc le rattacher à un site de l'autre compte — une
 * seule écriture, mais qui entraîne tout ce qui pendait dessous.
 *
 * ══ CE FICHIER EST L'APERÇU, PAS L'ACTION ══
 *
 * L'ÉCRITURE se fait dans `fn_deplacer_compteur` (migration 20260907260000), en base, parce qu'un
 * déplacement touche quatre tables et qu'un enchaînement d'appels depuis le navigateur peut
 * s'appliquer à moitié — fabriquant l'incohérence exacte que l'écran sert à réparer.
 *
 * CE FICHIER ne fait que COMPTER, pour que la fenêtre dise la vérité avant le clic. C'est le même
 * principe que `inventaireSuppression.ts`, et la même faiblesse assumée : deux endroits décrivent
 * la même liste de tables. La fonction rend donc son propre décompte après coup, et l'écran affiche
 * ce décompte-là — un écart entre l'annonce et le résultat se voit alors immédiatement.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Un objet qui reste sur l'ancien compte, nommé quand il porte une référence lisible. */
export interface ObjetReste {
  id: string
  libelle: string
}

/** Un contact porté par le compteur, et son éligibilité sur le compte de destination. */
export interface ContactPorte {
  id: string
  nom: string
  role: 'Responsable' | 'Conseil syndical'
  /** Faux ⇒ après le déplacement, ce contact appartient à une autre société. */
  rattacheALaDestination: boolean
}

export interface InventaireDeplacement {
  /** Ce qui suit le compteur parce que la fonction le réécrit. */
  signaux: number
  requetes: number
  /** Ce qui suit sans rien faire : ces tables ne connaissent que le compteur. */
  consommations: number
  /** Ce qui reste sur l'ancien compte, par famille. */
  mandats: number
  contrats: ObjetReste[]
  recommandations: ObjetReste[]
  opportunites: ObjetReste[]
  /** Vrai quand quelque chose reste derrière — la seule vraie mise en garde de la fenêtre. */
  aDesRestes: boolean
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
 * Les objets d'une famille qui contiennent ce compteur ET appartiennent encore à l'ancien compte.
 *
 * `table` est la table de liaison, `colonneParent` sa colonne vers le parent, `parent` la table du
 * parent, et `etiquette` la colonne qui le nomme à l'écran.
 */
async function restesDeLaFamille(
  table: string,
  colonneParent: string,
  parent: string,
  etiquette: string,
  compteurId: string,
  compteOrigine: string,
): Promise<ObjetReste[]> {
  const lecture = (await supabase.from(table).select(colonneParent).eq('compteur_id', compteurId)) as unknown as {
    data: Record<string, unknown>[] | null
    error: { message: string } | null
  }
  if (lecture.error) throw new Error(`Impossible de lire ${table} : ${lecture.error.message}`)
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

/**
 * Un contact est-il rattaché à ce compte, de quelque manière que ce soit ?
 *
 * Les trois chemins, comme partout depuis le 07/09/2026 : le compte principal, `contacts_comptes`,
 * et les sites. Un contact « lié » à un compte est éligible pour tout ce qui en découle.
 */
async function rattacheAuCompte(contactId: string, compteId: string): Promise<boolean> {
  const { data: direct } = await supabase.from('contacts').select('compte_id').eq('id', contactId).maybeSingle()
  if (direct?.compte_id === compteId) return true

  const parCompte = await compter('contacts_comptes', { contact_id: contactId, compte_id: compteId })
  if (parCompte > 0) return true

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

/**
 * L'aperçu du déplacement.
 *
 * `siteDestinationId` peut être vide : on n'interroge rien tant que la destination n'est pas
 * choisie, parce que « ce qui reste derrière » n'a pas de sens sans savoir où l'on va.
 */
export function useInventaireDeplacement(
  compteurId: string | undefined,
  compteOrigine: string | undefined,
  compteDestination: string | undefined,
  siteOrigineId: string | undefined,
  actif: boolean,
) {
  return useQuery({
    queryKey: ['deplacement-compteur', compteurId, compteOrigine, compteDestination],
    enabled: actif && !!compteurId && !!compteOrigine && !!compteDestination && !!siteOrigineId,
    // Un aperçu périmé serait pire que pas d'aperçu : on le relit à chaque ouverture.
    staleTime: 0,
    queryFn: async (): Promise<InventaireDeplacement> => {
      const cId = compteurId as string
      const origine = compteOrigine as string
      const destination = compteDestination as string
      const memeCompte = origine === destination

      const [signaux, requetes, consommations, mandats, contrats, recos, opportunites, contacts] = await Promise.all([
        // Seuls les signaux encore accrochés au site d'origine seront réécrits : c'est exactement ce
        // que fait la fonction en base, et l'aperçu doit dire la même chose qu'elle.
        compter('signaux', { compteur_id: cId, site_id: siteOrigineId as string }),
        compter('requetes', { compteur_id: cId }),
        compter('consommations', { compteur_id: cId }),
        // Les mandats n'ont pas d'étiquette exploitable : 1 453 des 1 461 n'ont pas de numéro. On les
        // compte, sans prétendre les nommer.
        memeCompte ? Promise.resolve(0) : compter('mandats_compteurs', { compteur_id: cId }),
        memeCompte ? Promise.resolve([]) : restesDeLaFamille('contrats_compteurs', 'contrat_id', 'suivis_contrats', 'reference', cId, origine),
        memeCompte ? Promise.resolve([]) : restesDeLaFamille('recommandations_compteurs', 'recommandation_id', 'recommandations', 'nom', cId, origine),
        memeCompte ? Promise.resolve([]) : restesDeLaFamille('opportunites_compteurs', 'opportunite_id', 'opportunites', 'reference', cId, origine),
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

/** Ce que la fonction en base rend après coup — les nombres réellement écrits. */
export interface ResultatDeplacement {
  compteur: string
  change_de_compte: boolean
  site_origine: string
  site_destination: string
  suivis: { signaux: number; requetes: number; contacts_detaches: number }
  restes: { mandats: number; contrats: number; recommandations: number; opportunites: number }
}

export function useDeplacerCompteur() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      compteurId: string
      siteDestinationId: string
      detacherContacts: boolean
      motif: string | null
    }): Promise<ResultatDeplacement> => {
      const { data, error } = await supabase.rpc('fn_deplacer_compteur', {
        p_compteur_id: input.compteurId,
        p_site_destination_id: input.siteDestinationId,
        p_detacher_contacts: input.detacherContacts,
        p_motif: input.motif,
      })
      if (error) {
        // LA FONCTION MANQUANTE EST UN CAS À PART. Tant que la migration n'est pas appliquée, un
        // message brut de PostgREST ferait chercher un bug ailleurs.
        if (error.message.includes('fn_deplacer_compteur')) {
          throw new Error('Le déplacement n’est pas encore disponible : la migration 20260907260000 n’a pas été appliquée.')
        }
        throw new Error(error.message)
      }
      return data as ResultatDeplacement
    },
    onSuccess: () => {
      // TOUT CE QUI DÉPEND DE L'ARBRE compte → site → compteur est à relire : la fiche du compteur,
      // celles des deux comptes, les listes de sites, les signaux et les requêtes déplacés.
      for (const cle of [['compteurs'], ['sites'], ['comptes'], ['signaux'], ['requetes'], ['deplacement-compteur']]) {
        void queryClient.invalidateQueries({ queryKey: cle })
      }
    },
  })
}
