import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * LE PATRIMOINE VU PAR COMPTE — page 2 du PDF de Michel du 25/08/2026.
 *
 * « Mesurez la valeur de chaque compte et fiabilisez les données qui pilotent vos actions. » Sa page
 * porte quatre indicateurs en tête, puis un tableau des comptes avec, pour chacun, la qualité de la
 * donnée de ses compteurs.
 *
 * TOUT VIENT DE `v_comptes_patrimoine` (migration 20260826110000), qui calcule les taux et le score
 * EN BASE. C'est délibéré : sur 2 635 comptes, trier ou paginer côté navigateur imposerait de tout
 * charger, et c'est exactement la faute qui a gelé l'onglet des compteurs le 24/08.
 *
 * SON SCORE COMPTE TROIS DIMENSIONS ET NON QUATRE, et c'est la seule liberté prise sur sa maquette.
 * Il en décrit quatre à 25 % — volume de compteurs, contact, échéance, recommandations. Les trois
 * dernières sont des taux, elles valent 0 à 100 par construction. Le VOLUME non : un nombre de
 * compteurs n'est pas un pourcentage, et le noter demande un objectif (« combien vaut 100 ? ») que
 * lui seul peut fixer. Le nombre est donc affiché, pas noté.
 *
 * CE QUE LES CHIFFRES DISENT, mesuré le 26/08/2026 : score moyen 47/100 sur 2 635 comptes, 85 % de
 * compteurs rattachés à un contact, mais 44 % seulement d'échéances valides. Sa maquette annonçait
 * 72/100 — l'écart n'est pas une erreur de calcul, c'est l'état réel de la donnée.
 */

export interface CompteDuPatrimoine {
  compte_id: string
  compte_nom: string
  nb_compteurs: number
  nb_avec_contact: number
  nb_echeance_valide: number
  nb_recos_acceptees: number
  volume_mwh: number | null
  pct_contact: number
  pct_echeance: number
  pct_recommandation: number
  score: number
  /** Total de la sélection, rendu par la base — identique sur chaque ligne. */
  total: number
}

export type TriPatrimoine = 'score' | 'nb_compteurs' | 'compte_nom' | 'volume_mwh'

export function useComptesPatrimoine(options: {
  recherche: string
  tri: TriPatrimoine
  sens: 'asc' | 'desc'
  limite: number
}) {
  const { recherche, tri, sens, limite } = options
  return useQuery({
    queryKey: ['patrimoine-comptes', recherche.trim(), tri, sens, limite],
    queryFn: async (): Promise<CompteDuPatrimoine[]> => {
      let q = supabase.from('v_comptes_patrimoine').select('*', { count: 'exact' })

      const mots = recherche.trim()
      if (mots) q = q.ilike('compte_nom', `%${mots}%`)

      const { data, error, count } = await q
        .order(tri, { ascending: sens === 'asc', nullsFirst: false })
        .range(0, Math.max(0, limite - 1))
      if (error) throw new Error(error.message)

      return ((data ?? []) as unknown as Omit<CompteDuPatrimoine, 'total'>[]).map((c) => ({
        ...c,
        total: count ?? 0,
      }))
    },
  })
}

export interface SynthesePatrimoine {
  nbComptes: number
  nbCompteurs: number
  nbAvecContact: number
  nbEcheanceValide: number
  nbRecosAcceptees: number
  /** Moyenne des scores des comptes — le « 72 / 100 » de sa maquette. */
  scoreMoyen: number | null
}

/**
 * LES QUATRE INDICATEURS DE TÊTE, et le score moyen.
 *
 * On rapporte cinq nombres par compte sur 2 635 comptes et on additionne : PostgREST ne fait pas de
 * SUM, et une vue d'agrégat supplémentaire ne se justifie pas pour cinq colonnes numériques — c'est
 * une dizaine de milliers de nombres, quelques dizaines de kilo-octets.
 *
 * LA MOYENNE EST CELLE DES COMPTES, PAS DES COMPTEURS. Un compte à trois compteurs pèse autant qu'un
 * compte à trois cents : c'est ce que dit son libellé, « performance moyenne des COMPTES », et c'est
 * le bon choix — pondérer par le volume noierait deux mille petits syndics derrière dix gros.
 */
export function useSynthesePatrimoine() {
  return useQuery({
    queryKey: ['patrimoine-comptes', 'synthese'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SynthesePatrimoine> => {
      const { data, error } = await supabase
        .from('v_comptes_patrimoine')
        .select('nb_compteurs, nb_avec_contact, nb_echeance_valide, nb_recos_acceptees, score')
      if (error) throw new Error(error.message)

      type Ligne = {
        nb_compteurs: number
        nb_avec_contact: number
        nb_echeance_valide: number
        nb_recos_acceptees: number
        score: number
      }
      const lignes = (data ?? []) as unknown as Ligne[]

      const t = { compteurs: 0, contact: 0, echeance: 0, recos: 0, score: 0 }
      for (const l of lignes) {
        t.compteurs += l.nb_compteurs ?? 0
        t.contact += l.nb_avec_contact ?? 0
        t.echeance += l.nb_echeance_valide ?? 0
        t.recos += l.nb_recos_acceptees ?? 0
        t.score += l.score ?? 0
      }

      return {
        nbComptes: lignes.length,
        nbCompteurs: t.compteurs,
        nbAvecContact: t.contact,
        nbEcheanceValide: t.echeance,
        nbRecosAcceptees: t.recos,
        scoreMoyen: lignes.length > 0 ? Math.round(t.score / lignes.length) : null,
      }
    },
  })
}
