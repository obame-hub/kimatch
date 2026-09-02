import { useQuery } from '@tanstack/react-query'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

/**
 * ══ LA QUALITÉ DU PORTEFEUILLE ══
 *
 * Cadrage validé de Naoëlle, 02/09/2026. La page suit « la qualité des données du portefeuille au
 * niveau des comptes et des compteurs, puis identifie rapidement les corrections à effectuer ».
 *
 * ══ POURQUOI TOUT CHARGER, ICI ET NULLE PART AILLEURS ══
 *
 * Les listes de Kimatch filtrent et paginent EN BASE — c'est la règle, et elle vient d'un incident :
 * les écrans chargeaient leur table entière avant de trier en mémoire, et l'onglet Compteurs a gelé
 * en production le 24/08.
 *
 * Cette page fait l'inverse, et c'est délibéré. Ses trois filtres se combinent librement, ses deux
 * graphiques doivent montrer « toutes les dates comprises dans les filtres sélectionnés », et ses
 * totaux doivent suivre les mêmes filtres. Un aller-retour serveur par changement de filtre
 * demanderait trois requêtes agrégées supplémentaires — une par graphique, une pour les totaux — et
 * un délai à chaque clic sur une page qu'on manipule justement en cliquant partout.
 *
 * LA LIGNE EST PLATE ET ÉTROITE : quinze colonnes scalaires, aucune relation imbriquée. Les 7 915
 * compteurs actifs tiennent en un peu plus d'un mégaoctet, chargés une fois, et tout le reste — les
 * filtres, les deux camemberts, les deux histogrammes, le tableau — devient instantané.
 *
 * La limite est connue : au-delà de quelques dizaines de milliers de compteurs, il faudra passer aux
 * agrégats en base. Le jour où le portefeuille double, c'est ce fichier qu'il faudra rouvrir.
 */

/** Un compteur, tel que `v_qualite_compteur` le rend. */
export interface CompteurQualite {
  compteur_id: string
  numero_point: string
  site_id: string
  site_nom: string | null
  compte_id: string | null
  compte_nom: string | null
  type_energie: string | null
  consommation_annuelle_mwh: number | null
  date_echeance: string | null
  responsable_nom: string
  a_contrat: boolean
  echeance_future: boolean
  a_responsable: boolean
  score: number
  opportunite_en_cours: boolean
  recommandation_en_cours: boolean
  dans_processus_commercial: boolean
}

/** Un compte et son score moyen — la partie haute de la page. */
export interface CompteQualite {
  compte_id: string
  compte_nom: string
  nb_compteurs: number
  score: number
}

const COLONNES_COMPTEUR =
  'compteur_id, numero_point, site_id, site_nom, compte_id, compte_nom, type_energie, ' +
  'consommation_annuelle_mwh, date_echeance, responsable_nom, a_contrat, echeance_future, ' +
  'a_responsable, score, opportunite_en_cours, recommandation_en_cours, dans_processus_commercial'

export function useCompteursQualite() {
  return useQuery({
    queryKey: ['qualite-portefeuille', 'compteurs'],
    // Une donnée de pilotage ne change pas d'une minute à l'autre : on évite de recharger un
    // mégaoctet chaque fois qu'on revient sur l'onglet.
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchAllRows<CompteurQualite>('v_qualite_compteur', COLONNES_COMPTEUR),
  })
}

export function useComptesQualite() {
  return useQuery({
    queryKey: ['qualite-portefeuille', 'comptes'],
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      fetchAllRows<CompteQualite>('v_qualite_compte', 'compte_id, compte_nom, nb_compteurs, score'),
  })
}

/**
 * ══ LES TROIS TRANCHES DU CADRAGE ══
 *
 * « Pour les deux camemberts, utiliser les tranches : 80–100, 50–79 et 0–49. » Les mêmes servent au
 * filtre de scoring, qui les reprend mot pour mot.
 *
 * ELLES NE SONT PAS CELLES DE `niveauScore`, qui en compte quatre — rouge, orange, jaune, vert —
 * demandées la veille pour les héros de la fiche compte. Ce n'est pas une incohérence à corriger
 * en douce : ce sont deux découpages voulus, pour deux usages. Sur une fiche, quatre niveaux
 * nuancent un seul chiffre ; sur un camembert, trois parts se lisent d'un regard et six seraient
 * illisibles. Les couleurs, elles, restent cohérentes : le vert de « tenu », l'orange du milieu, le
 * rouge de ce qui manque.
 */
export type TrancheScore = '80-100' | '50-79' | '0-49'

export const TRANCHES: { cle: TrancheScore; libelle: string; couleur: string }[] = [
  { cle: '80-100', libelle: '80 à 100', couleur: '#0d7a5f' },
  { cle: '50-79', libelle: '50 à 79', couleur: '#d1873a' },
  { cle: '0-49', libelle: '0 à 49', couleur: '#c0503a' },
]

export function trancheDe(score: number): TrancheScore {
  if (score >= 80) return '80-100'
  if (score >= 50) return '50-79'
  return '0-49'
}

/**
 * Les anomalies à corriger sur un compteur, telles que le cadrage les nomme : « compteur sans
 * contrat, échéance absente ou dépassée et responsable non renseigné ».
 *
 * L'ÉCHÉANCE N'EST UNE ANOMALIE QUE SANS CONTRAT. Sous contrat en cours, c'est la date de fin du
 * contrat qui fait l'échéance : réclamer au client une date qu'on possède déjà serait un faux
 * travail, et le barème ne la compte pas non plus dans ce cas.
 */
export function anomaliesCompteur(c: CompteurQualite): string[] {
  const liste: string[] = []
  if (!c.a_contrat) liste.push('Compteur sans contrat en cours')
  if (!c.a_contrat && !c.echeance_future) {
    liste.push(c.date_echeance ? 'Échéance dépassée' : 'Échéance absente')
  }
  if (!c.a_responsable) liste.push('Responsable non renseigné')
  return liste
}
