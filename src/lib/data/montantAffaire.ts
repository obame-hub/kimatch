import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LA CASCADE DES MONTANTS D'UNE RECOMMANDATION ══
 *
 * Refonte demandée par William le 09/09/2026 : « à mes yeux ils ne sont pas assez précis ou
 * clairs ». Six montants au lieu de quatre, et chacun répond à une question différente :
 *
 *   MONTANT BRUT   ce que Kiwee (ou son intermédiaire) facture au fournisseur
 *   CIP            ce que l'intermédiaire pricing prélève au passage
 *   CHIFFRE D'AFF. ce qui entre réellement dans les caisses de Kiwee
 *   CAA            ce qu'on reverse à l'apporteur d'affaires
 *   MONTANT NET    ce qui reste après l'apporteur
 *   MONTANT        la référence des commissions commerciales et des objectifs
 *
 * ── LA FORMULE VIT DANS `v_montants_recommandation`, ET NULLE PART AILLEURS ──
 *
 * Elle sert la fiche, la liste et le tableau de bord. Trois implémentations d'une même formule
 * finiraient par donner trois chiffres — et c'est exactement ce qui a produit l'écart de 137 038 €
 * entre le rapport Salesforce et celui de Kimatch. Ce crochet ne fait que lire.
 *
 * Il rend aussi les TERMES du calcul — volume, durée, marge, taux, intermédiaire — pour que
 * l'infobulle montre « 227 ÷ 12 × 36 × (4 × 50 %) » avec les vrais nombres du dossier, et nomme ce
 * qui manque quand le calcul n'aboutit pas.
 *
 * ══ IL SE TAIT PLUTÔT QUE DE CASSER LA FICHE ══
 *
 * Le déploiement part au push, la migration s'applique à la main. Entre les deux, la vue n'existe
 * pas et PostgREST répond 404. Une erreur remonterait jusqu'à la fiche entière et la rendrait
 * blanche pour un bloc secondaire : on rend donc `null`, le bloc se tait, et il réapparaît de
 * lui-même une fois la migration passée.
 */

export interface MontantsRecommandation {
  recommandation_id: string
  nb_compteurs: number
  fournisseur_nom: string | null
  /** L'intermédiaire pricing du fournisseur. `null` = Kiwee facture en direct. */
  intermediaire_nom: string | null
  taux_repartition: number | null
  taux_commissionnement: number | null
  taux_commerciaux: number | null
  duree_mois: number | null
  conso_totale_mwh: number | null
  marge_eur_mwh: number | null
  /** Vrai si au moins un compteur porte une marge fixe, qui traverse la cascade sans être entamée. */
  a_une_marge_fixe: boolean

  montant_brut: number | null
  commission_intermediaire: number | null
  chiffre_affaires: number | null
  commission_apporteur: number | null
  montant_net: number | null
  /** Le « Montant » : la référence des commissions commerciales. */
  montant_reference: number | null

  sans_conso: number
  sans_marge: number
  sans_duree: number
  lignes_incalculables: number
}

export function useMontantsRecommandation(recommandationId: string | undefined) {
  return useQuery({
    queryKey: ['montants-recommandation', recommandationId],
    enabled: Boolean(recommandationId),
    // Une erreur ici ne doit pas faire réessayer trois fois : si la vue n'est pas là, elle ne le
    // sera pas dans deux secondes.
    retry: false,
    queryFn: async (): Promise<MontantsRecommandation | null> => {
      const { data, error } = await supabase
        .from('v_montants_recommandation')
        .select('*')
        .eq('recommandation_id', recommandationId)
        .maybeSingle()
      if (error) {
        if (/does not exist|schema cache|404/i.test(error.message)) return null
        throw new Error(error.message)
      }
      return (data as MontantsRecommandation | null) ?? null
    },
  })
}

/**
 * Ce qui empêche le calcul d'aboutir, en une phrase par cause.
 *
 * DIRE « MONTANT INDISPONIBLE » NE SERT À PERSONNE : la question suivante est toujours « pourquoi »,
 * et la réponse se trouve dans l'offre retenue. On nomme donc le manque et l'endroit où il se
 * comble, plutôt que de laisser un tiret.
 */
export function manquesDuCalcul(m: MontantsRecommandation | null | undefined): string[] {
  if (!m) return []
  if (m.nb_compteurs === 0) {
    return ['Aucune offre retenue sur la version courante — le calcul part de l’offre retenue.']
  }
  const manques: string[] = []
  if (m.sans_conso > 0) manques.push(`${m.sans_conso} compteur(s) sans consommation annuelle de référence.`)
  if (m.sans_marge > 0) manques.push(`${m.sans_marge} compteur(s) sans marge €/MWh dans l’offre retenue.`)
  if (m.sans_duree > 0) manques.push(`${m.sans_duree} compteur(s) sans durée sur l’offre.`)
  return manques
}

/**
 * Le taux de répartition d'un fournisseur, lu seul.
 *
 * `OffresDuFournisseur` en a besoin pendant la SAISIE d'une offre, pour montrer ce que la marge
 * annoncée laissera réellement à Kiwee — avant qu'une recommandation n'existe et que la vue ne
 * puisse rien calculer. C'est le seul endroit où ce taux se lit hors de la cascade.
 *
 * Il s'appelait `taux_marge_kiwee` jusqu'au 09/09/2026 ; la colonne a été renommée
 * `taux_repartition`, le nom du crochet suit.
 */
export function useTauxRepartition(compteId: string | null | undefined) {
  return useQuery({
    queryKey: ['taux-repartition', compteId],
    enabled: Boolean(compteId),
    retry: false,
    // Le taux d'un fournisseur ne bouge pas pendant qu'on saisit une offre.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from('comptes')
        .select('taux_repartition')
        .eq('id', compteId)
        .maybeSingle()
      if (error) {
        if (/does not exist|schema cache|404/i.test(error.message)) return null
        throw new Error(error.message)
      }
      return (data as { taux_repartition: number | null } | null)?.taux_repartition ?? null
    },
  })
}
