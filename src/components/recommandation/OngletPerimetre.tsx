import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Compteur } from '@/types/domain'

/**
 * ══════════════════ L'ONGLET PÉRIMÈTRE ══════════════════
 *
 * William, 18/09/2026 : « on laissera le détail du périmètre dans un onglet prévu à cet effet
 * nommé "Périmètre" ».
 *
 * POURQUOI IL QUITTE LE CORPS DE LA FICHE : on vient ici pour vérifier un point de livraison ou
 * préparer une demande, pas en lisant l'avancement d'une consultation. Les deux lectures n'ont ni
 * le même rythme ni le même moment, et les empiler faisait descendre la version — la seule chose
 * qui bouge — sous une table qui ne bouge jamais.
 */

/**
 * ══ L'ÉCHÉANCE PORTE SA NATURE, ET CE N'EST PAS COSMÉTIQUE ══
 *
 * Kimatch distingue trois échéances, et la vue `v_compteurs_liste` les calcule déjà :
 *
 *  · PROUVÉE — un contrat actif couvre ce PDL et dit jusqu'à quand. C'est un fait.
 *  · ESTIMÉE — une date a été saisie sur le compteur, sans contrat pour l'appuyer.
 *  · ABSENTE — on ne sait pas.
 *
 * Les afficher de la même façon donnerait à une supposition le poids d'un fait, sur la donnée qui
 * décide du MOMENT où l'on consulte. Se tromper d'un an sur une échéance, c'est arriver après le
 * renouvellement du concurrent.
 *
 * ET C'EST LA MÊME JOINTURE QUI DIT CLIENT OU PROSPECT : un PDL couvert par un contrat Kiwee actif
 * est un client, les autres sont des prospects. On ne pose donc pas deux questions à la base, ni
 * deux définitions qui pourraient diverger — une seule lecture répond aux deux colonnes.
 */
interface LigneEcheance {
  id: string
  nature_echeance: 'PROUVEE' | 'ESTIMEE' | 'ABSENTE'
  date_echeance: string | null
}

function useEcheancesDuPerimetre(compteurIds: string[]) {
  const cle = [...compteurIds].sort().join(',')
  return useQuery({
    queryKey: ['perimetre', 'echeances', cle],
    enabled: compteurIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, LigneEcheance>> => {
      const { data, error } = await supabase
        .from('v_compteurs_liste')
        .select('id, nature_echeance, date_echeance')
        .in('id', compteurIds)
      if (error) throw new Error(error.message)
      return new Map((data ?? []).map((l) => [l.id as string, l as LigneEcheance]))
    },
  })
}

export function OngletPerimetre({ compteurs }: { compteurs: Compteur[] }) {
  const { data: echeances } = useEcheancesDuPerimetre(compteurs.map((c) => c.id))

  const total = compteurs.reduce((t, c) => t + (c.consommation_annuelle_mwh ?? 0), 0)
  const clients = compteurs.filter((c) => echeances?.get(c.id)?.nature_echeance === 'PROUVEE').length
  const prospects = compteurs.length - clients

  if (compteurs.length === 0) {
    return (
      <div className="rounded-[13px] border border-km-line bg-white px-[17px] py-4">
        <p className="text-km-body text-km-faint">
          Aucun point de livraison rattaché à cette recommandation.
        </p>
      </div>
    )
  }

  return (
    <div className="animate-km-fade-slide overflow-hidden rounded-[13px] border border-km-line bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-km-line-soft px-[17px] py-3">
        <span className="text-km-body font-extrabold text-km-text">
          {compteurs.length} compteur{compteurs.length > 1 ? 's' : ''}
        </span>
        {total > 0 && (
          <span className="rounded-km-pill border border-km-line bg-km-soft px-2 py-[2px] font-mono text-km-label font-semibold text-km-muted">
            {Math.round(total).toLocaleString('fr-FR')} MWh au total
          </span>
        )}
        <span className="flex-1" />
        {clients > 0 && (
          <span className="rounded-km-pill border border-km-green-line bg-km-green-soft px-2 py-[2px] text-km-label font-bold text-km-green">
            {clients} client{clients > 1 ? 's' : ''}
          </span>
        )}
        {prospects > 0 && (
          <span className="rounded-km-pill border border-km-line bg-km-soft px-2 py-[2px] text-km-label font-bold text-km-muted">
            {prospects} prospect{prospects > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-km-line-soft">
              {['Libellé', 'Point de livraison', 'Échéance', 'Fournisseur en place', 'Statut'].map((t) => (
                <th key={t} className="px-[17px] py-2 text-left text-km-tiny font-extrabold uppercase tracking-[0.07em] text-km-faint">
                  {t}
                </th>
              ))}
              <th className="px-[17px] py-2 text-right text-km-tiny font-extrabold uppercase tracking-[0.07em] text-km-faint">
                Conso. annuelle
              </th>
            </tr>
          </thead>
          <tbody>
            {compteurs.map((c) => {
              const e = echeances?.get(c.id)
              const client = e?.nature_echeance === 'PROUVEE'
              return (
                <tr key={c.id} className="border-b border-km-line-soft last:border-0 hover:bg-km-bg">
                  <td className="max-w-[240px] truncate px-[17px] py-2 text-km-body font-bold text-km-text">
                    <Link to={`/compteurs/${c.id}`} className="hover:text-km-green hover:underline">
                      {c.localisation_site || c.libelle_site || c.site_nom || 'Sans libellé'}
                    </Link>
                  </td>
                  <td className="px-[17px] py-2 font-mono text-km-body text-km-muted">{c.numero_pdl}</td>
                  <td className="px-[17px] py-2">
                    {e?.nature_echeance === 'PROUVEE' && e.date_echeance ? (
                      <span className="rounded-km-pill border border-km-amber/40 bg-km-amber-soft px-2 py-[2px] font-mono text-km-label font-semibold text-km-amber">
                        {new Date(e.date_echeance).toLocaleDateString('fr-FR')}
                      </span>
                    ) : e?.nature_echeance === 'ESTIMEE' && e.date_echeance ? (
                      <span
                        title="Date saisie sur le compteur, sans contrat pour l'appuyer."
                        className="rounded-km-pill border border-dashed border-km-line px-2 py-[2px] font-mono text-km-label text-km-faint"
                      >
                        {new Date(e.date_echeance).toLocaleDateString('fr-FR')} · estimée
                      </span>
                    ) : (
                      <span className="rounded-km-pill border border-dashed border-km-line px-2 py-[2px] text-km-label text-km-faint">
                        inconnue
                      </span>
                    )}
                  </td>
                  <td className="max-w-[180px] truncate px-[17px] py-2 text-km-body text-km-muted">
                    {c.fournisseur_actuel_nom || <span className="text-km-faint">—</span>}
                  </td>
                  <td className="px-[17px] py-2">
                    <span
                      className={cn(
                        'rounded-km-pill border px-2 py-[2px] text-km-label font-bold',
                        client
                          ? 'border-km-green-line bg-km-green-soft text-km-green'
                          : 'border-km-line bg-km-soft text-km-muted',
                      )}
                    >
                      {client ? 'Client' : 'Prospect'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-[17px] py-2 text-right font-mono text-km-body text-km-text">
                    {c.consommation_annuelle_mwh != null
                      ? `${Math.round(c.consommation_annuelle_mwh).toLocaleString('fr-FR')} MWh`
                      : <span className="text-km-faint">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
