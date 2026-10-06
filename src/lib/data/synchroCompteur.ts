import { useEnedisFetch } from '@/lib/data/enedis'
import { useGrdFetch } from '@/lib/data/grd'
import { useSyncCompteurElec, useSyncCompteurGaz } from '@/lib/data/compteurs'

/**
 * ══ SYNCHRONISER UN COMPTEUR AVEC ENEDIS OU GRDF ══
 * Le même geste sur la fiche compteur et dans le Pricer — William, 06/10/2026 : « dans la ligne du
 * compteur, ajouter le bouton pour actualiser GRDF ou ENEDIS si les critères sont respectés ». Les
 * critères sont ceux de la fiche : un mandat KiWee actif qui couvre le compteur (`mandatKiweeCouvre`,
 * revérifié par le serveur), et un code postal au gaz.
 */
export interface CompteurASynchroniser {
  id: string
  numero: string
  energie: 'electricite' | 'gaz'
  codePostal: string | null | undefined
}

export function useSynchroCompteur(dire: (m: string) => void) {
  const enedisFetch = useEnedisFetch()
  const syncCompteurElec = useSyncCompteurElec()
  const grdFetch = useGrdFetch()
  const syncCompteurGaz = useSyncCompteurGaz()
  const enCours = enedisFetch.isPending || syncCompteurElec.isPending || grdFetch.isPending || syncCompteurGaz.isPending

  /**
   * Rend vrai quand la synchronisation a réussi. `message` reçoit, pour CET appel, ce qui serait
   * dit à l'écran — plusieurs compteurs peuvent se synchroniser en même temps (création d'une
   * recommandation) ; sans lui, c'est `onToast`.
   */
  async function synchroniser(c: CompteurASynchroniser, autorisee: boolean, message?: (m: string) => void): Promise<boolean> {
    const onToast = message ?? dire
    if (!message && enCours) return false
    const estElec = c.energie === 'electricite'
    if (!autorisee) {
      onToast('Aucun mandat KiWee actif ne couvre ce compteur : synchronisation impossible.')
      return false
    }
    try {
      if (estElec) {
        const result = await enedisFetch.mutateAsync(c.numero)
        if (!result.success) { onToast(result.error ?? 'Échec de la synchronisation Enedis.'); return false }
        await syncCompteurElec.mutateAsync({ compteurId: c.id, result })
        onToast('✓ Synchronisation Enedis réussie')
      } else {
        if (!c.codePostal) { onToast('Impossible de synchroniser : aucun code postal sur ce compteur.'); return false }
        const result = await grdFetch.mutateAsync({ pce: c.numero, codePostal: c.codePostal })
        if (!result.success) { onToast(result.error ?? 'Échec de la synchronisation GRDF.'); return false }
        await syncCompteurGaz.mutateAsync({ compteurId: c.id, result })
        onToast('✓ Synchronisation GRDF réussie')
      }
      return true
    } catch (err) {
      onToast(err instanceof Error ? err.message : `Échec de la synchronisation ${estElec ? 'Enedis' : 'GRDF'}.`)
      return false
    }
  }

  return { synchroniser, enCours }
}
