import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * LES QUATRE BLOCS DE LA PAGE PATRIMOINE — règle n° 2 du dossier UX du 26/08/2026.
 *
 * « Afficher UNIQUEMENT le nombre de comptes client/prospect et par segment, le nombre de compteurs
 * avec échéance vide ou dépassée, le nombre de compteurs sans responsable, et les compteurs à échéance
 * valide répartis par période. »
 *
 * LE MOT « UNIQUEMENT » EST LA CONSIGNE. La page « Performance » livrée le matin même — score sur 100,
 * quatre dimensions pondérées, tableau des 2 635 comptes — est remplacée par du comptage. L'appel
 * enregistré confirme le revirement de sa propre voix : « on ne va pas le compter, on ne va pas le
 * compter », puis « le plus important, c'est de savoir le nombre de compteurs qui ont des dates
 * d'échéance vides ou fausses, c'est-à-dire dépassées ».
 *
 * DEUX REQUÊTES, PAS TREIZE. La vue `v_patrimoine_synthese` rend les douze nombres en une ligne ; les
 * segments demandent un regroupement, donc une requête à part. C'est le minimum indivisible.
 */

export interface SynthesePatrimoine {
  nbComptes: number
  /** Comptes ayant au moins un contrat actif — la mesure la plus défendable d'un « client ». */
  nbAvecContrat: number
  nbSansContrat: number

  nbEcheanceVide: number
  nbEcheanceDepassee: number

  nbSansResponsable: number
  nbCompteurs: number

  nbEcheanceValide: number
  nb0a3: number
  nb4a6: number
  nb7a12: number
  nbPlus12: number
}

export interface SegmentPatrimoine {
  segment: string
  nb: number
}

/** Un entier depuis PostgREST, qui rend les `count()` de Postgres en chaîne. */
const ent = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0)

export function useSynthesePatrimoine() {
  return useQuery({
    queryKey: ['patrimoine', 'synthese-blocs'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ synthese: SynthesePatrimoine; segments: SegmentPatrimoine[] }> => {
      const [vue, comptes] = await Promise.all([
        supabase.from('v_patrimoine_synthese').select('*').maybeSingle(),
        // Le segment vit sur `comptes` : PostgREST ne sait pas grouper, on rapporte la colonne seule
        // sur 2 701 lignes — quelques kilo-octets — et on compte ici.
        supabase.from('comptes').select('segment, type_compte').eq('actif', true),
      ])

      if (vue.error) throw new Error(vue.error.message)
      const r = (vue.data ?? {}) as Record<string, unknown>

      const parSegment = new Map<string, number>()
      for (const c of (comptes.data ?? []) as { segment: string | null; type_compte: string | null }[]) {
        // On ne compte que les consommateurs : fournisseurs et partenaires ne sont pas du patrimoine.
        if (c.type_compte && c.type_compte !== 'client') continue
        const s = c.segment?.trim() || 'Non renseigné'
        parSegment.set(s, (parSegment.get(s) ?? 0) + 1)
      }

      return {
        synthese: {
          nbComptes: ent(r.nb_comptes),
          nbAvecContrat: ent(r.nb_avec_contrat),
          nbSansContrat: ent(r.nb_sans_contrat),
          nbEcheanceVide: ent(r.nb_echeance_vide),
          nbEcheanceDepassee: ent(r.nb_echeance_depassee),
          nbSansResponsable: ent(r.nb_sans_responsable),
          nbCompteurs: ent(r.nb_compteurs),
          nbEcheanceValide: ent(r.nb_echeance_valide),
          nb0a3: ent(r.nb_0_3_mois),
          nb4a6: ent(r.nb_4_6_mois),
          nb7a12: ent(r.nb_7_12_mois),
          nbPlus12: ent(r.nb_plus_12_mois),
        },
        segments: [...parSegment.entries()]
          .map(([segment, nb]) => ({ segment, nb }))
          .sort((a, b) => b.nb - a.nb),
      }
    },
  })
}
