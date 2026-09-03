import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LE MONTANT DE L'AFFAIRE, CALCULÉ ══
 *
 * La formule vit dans `v_montant_recommandation` (migration 20260903160000) et nulle part ailleurs :
 * le montant sert à la fiche, à la liste et à la somme du tableau de bord, et trois implémentations
 * d'une même formule finiraient par donner trois chiffres.
 *
 * Ce crochet ne fait que la lire, et rend aussi les TERMES du calcul — volume, durée, marge, taux —
 * pour que l'infobulle puisse montrer « 227 ÷ 12 × 36 × (4 × 50 %) » avec les vrais nombres du
 * dossier, et nommer ce qui manque quand le calcul n'aboutit pas.
 *
 * ══ IL SE TAIT PLUTÔT QUE DE CASSER LA FICHE ══
 *
 * Le déploiement part au push, la migration s'applique à la main. Entre les deux, la vue n'existe pas
 * et PostgREST répond 404. Une erreur remonterait jusqu'à la fiche entière et la rendrait blanche
 * pour un bloc secondaire : on rend donc `null`, le bloc se tait, et il apparaît de lui-même une
 * fois la migration passée.
 */

export interface MontantCalcule {
  recommandation_id: string
  nb_compteurs: number
  montant_calcule: number | null
  fournisseur_nom: string | null
  taux_marge: number | null
  duree_mois: number | null
  conso_totale_mwh: number | null
  marge_eur_mwh: number | null
  sans_conso: number
  sans_marge: number
  sans_duree: number
}

export function useMontantCalcule(recommandationId: string | undefined) {
  return useQuery({
    queryKey: ['montant-calcule', recommandationId],
    enabled: Boolean(recommandationId),
    // Une erreur ici ne doit pas faire réessayer trois fois : si la vue n'est pas là, elle ne le
    // sera pas dans deux secondes.
    retry: false,
    queryFn: async (): Promise<MontantCalcule | null> => {
      const { data, error } = await supabase
        .from('v_montant_recommandation')
        .select('*')
        .eq('recommandation_id', recommandationId)
        .maybeSingle()
      if (error) {
        // Vue absente : la migration n'est pas encore appliquée. On se tait.
        if (/does not exist|schema cache|404/i.test(error.message)) return null
        throw new Error(error.message)
      }
      return (data as MontantCalcule | null) ?? null
    },
  })
}

/**
 * Ce qui empêche le calcul d'aboutir, en clair.
 *
 * Écrit ici et pas dans l'écran : la phrase doit dire exactement ce que la vue a regardé, sinon on
 * lira « pas de volume » sur un dossier bloqué pour une autre raison.
 */
export function manquesMontant(m: MontantCalcule | null | undefined): string[] {
  if (!m) return ['Le calcul n’est pas encore disponible sur cette base.']
  if (m.nb_compteurs === 0) {
    return [
      'Aucune offre n’est marquée comme retenue sur la dernière version : le calcul part de l’offre retenue.',
    ]
  }
  const manques: string[] = []
  if (m.sans_conso > 0) {
    manques.push(
      m.sans_conso > 1
        ? `${m.sans_conso} compteurs de l’offre retenue n’ont pas de volume de référence.`
        : 'Le compteur de l’offre retenue n’a pas de volume de référence.',
    )
  }
  if (m.sans_marge > 0) {
    manques.push(
      m.sans_marge > 1
        ? `${m.sans_marge} compteurs de l’offre retenue n’ont pas de marge saisie.`
        : 'L’offre retenue n’a pas de marge saisie.',
    )
  }
  if (m.sans_duree > 0) manques.push('L’offre retenue n’a pas de durée.')
  return manques
}
