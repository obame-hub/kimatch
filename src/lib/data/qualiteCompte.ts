import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LE SCORE DE QUALITÉ D'UN COMPTE, ET LE DÉTAIL DE SES COMPTEURS ══
 *
 * Le calcul est en base — `v_qualite_compte` et `v_qualite_compteur`, migration 20260902100000.
 * Il n'est PAS refait ici, et c'est délibéré : le barème de Naoëlle rend six valeurs par compteur
 * puis leur moyenne, et une seconde implémentation en JavaScript finirait par afficher un chiffre
 * différent de celui qui sert à trier ou à compter. Un score qui change selon l'écran ne se croit
 * plus.
 */

/** Un compteur, son score, et les trois faits qui l'expliquent. */
export interface QualiteCompteur {
  compteur_id: string
  numero_point: string
  site_id: string
  site_nom: string | null
  type_energie: string | null
  date_echeance: string | null
  /** Le volume concerné : à score égal, c'est lui qui décide par quel compteur commencer. */
  consommation_annuelle_mwh: number | null
  responsable_nom: string
  a_contrat: boolean
  echeance_future: boolean
  a_responsable: boolean
  score: number
}

export interface QualiteCompte {
  compte_id: string
  compte_nom: string
  nb_compteurs: number
  score: number
  sans_contrat: number
  echeance_a_revoir: number
  sans_responsable: number
  parfaits: number
  /**
   * Client ou Prospect — la règle de Michel du 02/09/2026 : « un compte est considéré comme Client
   * dès lors qu'au moins un de ses compteurs est rattaché à un contrat ».
   *
   * Calculé en base (`v_qualite_compte`), avec la MÊME notion de contrat que le barème du score :
   * un contrat en cours. Le badge de la fiche l'affichait `true` en dur jusqu'ici, ce qui faisait
   * passer les 2 706 comptes consommateurs pour des clients alors que 392 le sont.
   */
  est_client: boolean
  compteurs_sous_contrat: number
}

/** Le statut commercial d'un site : la même règle, un cran plus bas. */
export interface StatutCommercialSite {
  site_id: string
  compte_id: string
  nb_compteurs: number
  compteurs_sous_contrat: number
  est_client: boolean
}

/**
 * Le score d'UN compte.
 *
 * `maybeSingle` et non `single` : un compte inactif, ou dont la vue ne rend aucune ligne, doit
 * rendre `null` sans faire échouer la fiche entière. La carte affiche alors zéro, ce qui est la
 * réponse voulue pour un compte neuf — « quand on créera un compte, ce score sera à zéro ».
 */
export function useQualiteCompte(compteId: string | undefined) {
  return useQuery({
    queryKey: ['qualite-compte', compteId],
    enabled: Boolean(compteId),
    queryFn: async (): Promise<QualiteCompte | null> => {
      const { data, error } = await supabase
        .from('v_qualite_compte')
        .select('*')
        .eq('compte_id', compteId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as QualiteCompte | null) ?? null
    },
  })
}

/**
 * Les compteurs d'un compte, du moins bon au meilleur.
 *
 * L'ORDRE EST CELUI DU TRAVAIL : le score croissant met en tête ce qui manque, puis la consommation
 * décroissante départage — entre deux compteurs à zéro, celui qui pèse mille mégawattheures se
 * traite avant celui qui en pèse dix. C'est la même logique que l'écran de qualité qu'on retire :
 * la donnée absente coûte plus cher là où il y a du volume.
 *
 * Chargé seulement quand on ouvre le détail : la fiche compte n'a besoin que du score, et lire les
 * trois cents compteurs d'un cabinet pour afficher un chiffre serait du gâchis.
 */
export function useQualiteCompteurs(compteId: string | undefined, actif: boolean) {
  return useQuery({
    queryKey: ['qualite-compteurs', compteId],
    enabled: Boolean(compteId) && actif,
    queryFn: async (): Promise<QualiteCompteur[]> => {
      const { data, error } = await supabase
        .from('v_qualite_compteur')
        .select('*')
        .eq('compte_id', compteId)
        .order('score', { ascending: true })
        .order('consommation_annuelle_mwh', { ascending: false, nullsFirst: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as QualiteCompteur[]
    },
  })
}

/**
 * Le score d'UN compteur, pour sa propre fiche.
 *
 * Naoëlle, 02/09/2026 : « affiche le score des compteurs sur les fiches compteurs avec le calcul
 * qu'a donné Michel, comme ça je peux vérifier si la moyenne est bonne dans l'onglet synthèse. »
 *
 * C'est la bonne façon de vérifier une moyenne : en la remontant à ses termes. La fiche lit donc
 * `v_qualite_compteur`, la MÊME vue que le compte moyenne et que la synthèse du portefeuille
 * agrège — pas un recalcul local, qui finirait tôt ou tard par afficher autre chose et rendrait la
 * vérification impossible.
 *
 * `maybeSingle` : la vue ne couvre que les compteurs actifs des comptes consommateurs (migration
 * 20260902150000). Pour les onze autres, elle rend `null` et la fiche n'affiche pas la carte.
 */
export function useQualiteCompteur(compteurId: string | undefined) {
  return useQuery({
    queryKey: ['qualite-compteur', compteurId],
    enabled: Boolean(compteurId),
    queryFn: async (): Promise<QualiteCompteur | null> => {
      const { data, error } = await supabase
        .from('v_qualite_compteur')
        .select('*')
        .eq('compteur_id', compteurId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as QualiteCompteur | null) ?? null
    },
  })
}

/**
 * La ligne du barème qui a produit le score, en toutes lettres.
 *
 * Michel, 02/09/2026, six lignes exactement. L'écrire ici plutôt que dans l'écran garantit que la
 * phrase affichée correspond au chemin réellement pris par le CASE en base — mêmes trois tests,
 * même ordre.
 */
export function ligneDuBareme(q: QualiteCompteur): string {
  if (q.a_contrat) {
    return q.a_responsable ? 'Contrat + responsable' : 'Contrat + sans responsable'
  }
  if (q.echeance_future) {
    return q.a_responsable
      ? 'Sans contrat + échéance future + responsable'
      : 'Sans contrat + échéance future + sans responsable'
  }
  return q.a_responsable
    ? 'Sans contrat + échéance absente ou dépassée + responsable'
    : 'Sans contrat + échéance absente ou dépassée + sans responsable'
}

/**
 * Le statut Client/Prospect de chaque site d'un compte.
 *
 * La fiche compte étiquette ses sites ligne par ligne, dans les onglets Contrats et Compteurs.
 * Elle lisait `site.statut === 'actif'` — le statut actif/inactif d'un site, qui n'a rien à voir
 * avec le fait d'être fourni, et qu'AUCUN site portant un compteur actif n'a jamais à `false`.
 * Tous les sites s'affichaient donc « Client ».
 *
 * Une seule requête pour toute la fiche, et le calcul reste en base : c'est le même `a_contrat`
 * que le score du compteur, donc les deux ne peuvent pas se contredire.
 */
export function useStatutCommercialSites(compteId: string | undefined) {
  return useQuery({
    queryKey: ['statut-commercial-sites', compteId],
    enabled: Boolean(compteId),
    queryFn: async (): Promise<Map<string, boolean>> => {
      const { data, error } = await supabase
        .from('v_statut_commercial_site')
        .select('site_id, est_client')
        .eq('compte_id', compteId)
      if (error) throw new Error(error.message)
      const m = new Map<string, boolean>()
      for (const l of (data ?? []) as Pick<StatutCommercialSite, 'site_id' | 'est_client'>[]) {
        m.set(l.site_id, l.est_client)
      }
      return m
    },
  })
}

/**
 * Ce qui manque à un compteur, en clair.
 *
 * Écrit une fois ici plutôt que dans l'écran : la phrase doit dire exactement ce que le barème a
 * regardé, sinon on lit « échéance dépassée » sur un compteur noté pour autre chose.
 */
export function manquesCompteur(q: QualiteCompteur): string[] {
  const manques: string[] = []
  if (!q.a_contrat) manques.push('aucun contrat en cours')
  // L'échéance ne compte QUE sans contrat : sous contrat, c'est sa date de fin qui fait l'échéance,
  // et la réclamer au client n'aurait pas de sens.
  if (!q.a_contrat && !q.echeance_future) {
    manques.push(q.date_echeance ? 'échéance dépassée' : 'aucune échéance')
  }
  if (!q.a_responsable) manques.push('aucun responsable')
  return manques
}
