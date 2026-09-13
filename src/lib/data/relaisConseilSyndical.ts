// ════════════════════════════════════════════════════════════════════════════════════════════════
// LA COUVERTURE D'UN COMPTE PAR SES RELAIS DE CONSEIL SYNDICAL
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// William, 13/09/2026 : « Les membres CS appartiennent à une résidence et ne peuvent en aucun cas
// contractualiser. En revanche il est utile de les suivre au cas où le cabinet perd la résidence
// (alors le membre CS sera notre seul moyen de suivre le contrat de la résidence et de connaître
// leur nouveau cabinet de syndic). »
//
// ══ LA MAILLE EST LE COMPTEUR ══
//
// L'objet Site est en cours de retrait (chantier de Naoëlle). C'est bien le compteur qui
// contractualise, et il porte DÉJÀ ses deux contacts : `responsable_contact_id` pour celui qui
// engage l'entreprise ou le cabinet, `contact_conseil_syndical_id` pour le relais. Deux fentes,
// pas une de plus — le maximum est une contrainte de structure, pas une règle à faire respecter.
//
// ══ CE QU'ON COMPTE, ET CE QU'ON NE COMPTE PAS ══
//
// Le dénominateur est le compteur SOUS CONTRAT au sens de `nature_echeance = 'PROUVEE'` : un
// contrat actif dont la date de fin n'est pas passée. Un contrat terminé ne prouve rien sur
// l'échéance à venir (règle du 24/08/2026, src/lib/echeance.ts) — le compter gonflerait le
// dénominateur national de 1 033 à 1 454, soit 40 % de contrats morts.
//
// Mesuré le 13/09/2026, après le nettoyage des 389 recopies : 1 033 compteurs sous contrat,
// 43 couverts. Soit 4,2 %.
// ════════════════════════════════════════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

export interface CompteurRelais {
  id: string
  numero_pdl: string
  libelle: string
  adresse: string | null
  type_energie: 'electricite' | 'gaz'
  mwh: number | null
  /** La date qui fait foi : celle du contrat quand il y en a un, la déclarée sinon. */
  echeance: string | null
  sous_contrat: boolean
  responsable_contact_id: string | null
  relais_contact_id: string | null
}

export interface CouvertureCompte {
  compteurs: CompteurRelais[]
  /** Compteurs sous contrat — le dénominateur de la couverture. */
  sousContrat: number
  /** Compteurs sous contrat dotés d'un relais. */
  couverts: number
  /** Compteurs sous contrat sans relais : ce qu'il reste à faire, et le chiffre qui pique. */
  sansFilet: number
  /** Entre 0 et 100. Vaut 0 quand il n'y a aucun compteur sous contrat — jamais NaN. */
  taux: number
}

interface Ligne {
  id: string
  numero_point: string
  site_nom: string | null
  adresse_site: string | null
  type_energie_code: string | null
  consommation_annuelle_mwh: number | null
  date_echeance: string | null
  nature_echeance: 'PROUVEE' | 'ESTIMEE' | 'ABSENTE'
  responsable_contact_id: string | null
  contact_conseil_syndical_id: string | null
}

/**
 * UNE SEULE LECTURE, SUR LA VUE. `v_compteurs_liste` porte la nature de l'échéance — que la table
 * `compteurs` ne porte pas — et depuis la migration du 13/09/2026 les deux contacts. Lire la table
 * puis les contrats à part demanderait les deux, et c'est exactement ce qui avait gelé l'onglet
 * Compteurs le 24/08.
 */
export function useCouvertureConseilSyndical(compteId: string | undefined) {
  return useQuery({
    queryKey: ['couverture-cs', compteId],
    enabled: !!compteId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CouvertureCompte> => {
      const lignes = await fetchAllRows<Ligne>(
        'v_compteurs_liste',
        'id, numero_point, site_nom, adresse_site, type_energie_code, consommation_annuelle_mwh, date_echeance, nature_echeance, responsable_contact_id, contact_conseil_syndical_id',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => q.eq('compte_id', compteId).eq('actif', true),
      )

      const compteurs: CompteurRelais[] = lignes.map((l) => ({
        id: l.id,
        numero_pdl: l.numero_point,
        libelle: l.site_nom ?? '',
        adresse: l.adresse_site,
        type_energie: l.type_energie_code?.toLowerCase() === 'gaz' ? 'gaz' : 'electricite',
        mwh: l.consommation_annuelle_mwh,
        echeance: l.date_echeance,
        sous_contrat: l.nature_echeance === 'PROUVEE',
        responsable_contact_id: l.responsable_contact_id,
        relais_contact_id: l.contact_conseil_syndical_id,
      }))

      // LE TRI EST L'URGENCE, PAS L'ALPHABET. Un compteur découvert dont l'échéance tombe bientôt
      // est celui où perdre le cabinet coûterait le plus cher ; à échéance égale, le volume tranche.
      compteurs.sort((a, b) => {
        const couvert = Number(!!a.relais_contact_id) - Number(!!b.relais_contact_id)
        if (couvert !== 0) return couvert
        const contrat = Number(b.sous_contrat) - Number(a.sous_contrat)
        if (contrat !== 0) return contrat
        // Une échéance absente n'est pas une échéance lointaine : elle passe après les datées.
        if (a.echeance !== b.echeance) {
          if (!a.echeance) return 1
          if (!b.echeance) return -1
          return a.echeance < b.echeance ? -1 : 1
        }
        return (b.mwh ?? 0) - (a.mwh ?? 0)
      })

      const sousContrat = compteurs.filter((c) => c.sous_contrat).length
      const couverts = compteurs.filter((c) => c.sous_contrat && c.relais_contact_id).length

      return {
        compteurs,
        sousContrat,
        couverts,
        sansFilet: sousContrat - couverts,
        taux: sousContrat === 0 ? 0 : Math.round((couverts / sousContrat) * 100),
      }
    },
  })
}
