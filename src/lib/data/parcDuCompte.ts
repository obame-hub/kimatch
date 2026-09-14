// ════════════════════════════════════════════════════════════════════════════════════════════════
// CE QUE PÈSE LE PARC D'UN COMPTE
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// Les quatre mesures du bandeau de la fiche : le parc, ce qui est sous contrat, ce qui revient dans
// l'année, ce que la donnée ne dit pas encore.
//
// ELLES VIVAIENT DANS L'ONGLET COMPTEURS, en héros de haut de page. William, 14/09/2026, en
// arbitrant la direction « cockpit » : « supprime les héros dans l'onglet compteur car c'est
// redondant du coup ». Les remonter dans le bandeau les rend visibles depuis TOUS les onglets — et
// les laisser aux deux endroits aurait fait lire deux fois le même chiffre à dix centimètres
// d'écart, avec le risque qu'ils divergent au premier correctif.
//
// ══ POURQUOI UN MODULE ET NON UN CALCUL DANS LE BANDEAU ══
//
// La règle « client ou prospect » — un contrat actif et non échu, `nature_echeance = PROUVEE` — est
// la même que celle de l'onglet Compteurs, qui continue de s'en servir pour ses filtres. Deux
// implémentations finiraient par diverger sur exactement la question où il ne faut pas : savoir si
// un compteur est gagné.
// ════════════════════════════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react'
import type { Compteur } from '@/types/domain'
import { useCouvertureConseilSyndical } from '@/lib/data/relaisConseilSyndical'

export interface MesuresDuParc {
  total: number
  elec: number
  gaz: number
  mwh: number
  adresses: number
  /** Compteurs couverts par un contrat actif et non échu. */
  clients: number
  mwhClient: number
  /** Entre 0 et 100. Vaut 0 sur un parc vide — jamais NaN. */
  penetration: number
  douzeMois: number
  mwhDouze: number
  /** La première échéance à venir, en ISO, ou `null`. */
  prochaine: string | null
  sansEcheance: number
  sansResponsable: number
  /** FICHES incomplètes, et non manques : un compteur peut cumuler les deux. */
  aCompleter: number
}

export function useMesuresDuParc(compteId: string | undefined, compteurs: Compteur[]): MesuresDuParc {
  const { data: parc } = useCouvertureConseilSyndical(compteId)

  return useMemo(() => {
    const sousContrat = new Map((parc?.compteurs ?? []).map((c) => [c.id, c.sous_contrat]))
    const aujourdhui = new Date().toISOString().slice(0, 10)
    const dansUnAn = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)

    let elec = 0, mwh = 0, clients = 0, mwhClient = 0, douzeMois = 0, mwhDouze = 0
    let sansEcheance = 0, sansResponsable = 0, aCompleter = 0
    let prochaine: string | null = null
    const adresses = new Set<string>()

    for (const c of compteurs) {
      const volume = c.consommation_annuelle_mwh ?? 0
      mwh += volume
      if (c.type_energie !== 'gaz') elec += 1
      if (c.libelle_site) adresses.add(c.libelle_site)

      if (sousContrat.get(c.id)) { clients += 1; mwhClient += volume }

      const e = c.date_echeance ?? null
      if (!e) sansEcheance += 1
      else {
        if (e <= dansUnAn) { douzeMois += 1; mwhDouze += volume }
        // La PROCHAINE est la plus proche À VENIR : une échéance dépassée est un retard, pas un
        // rendez-vous, et l'annoncer comme « prochaine » ferait lire une date du passé.
        if (e >= aujourdhui && (prochaine === null || e < prochaine)) prochaine = e
      }

      if (!c.responsable_contact_nom) sansResponsable += 1
      if (!e || !c.responsable_contact_nom) aCompleter += 1
    }

    const total = compteurs.length
    return {
      total,
      elec,
      gaz: total - elec,
      mwh,
      adresses: adresses.size,
      clients,
      mwhClient,
      penetration: total === 0 ? 0 : Math.round((clients / total) * 100),
      douzeMois,
      mwhDouze,
      prochaine,
      sansEcheance,
      sansResponsable,
      aCompleter,
    }
  }, [compteurs, parc])
}
