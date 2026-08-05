import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import type { Compteur, Contrat, Mandat, Recommandation } from '@/types/domain'

const VERSIONS_INACTIVES = new Set(['REFUSEE', 'EXPIREE', 'ARCHIVEE', 'REMPLACEE'])
const SEUIL_ECHEANCE_JOURS = 90

function joursAvant(date: string | null): number | null {
  if (!date) return null
  const diff = new Date(date).getTime() - Date.now()
  return Math.floor(diff / (24 * 60 * 60 * 1000))
}

export function CoverageMatrix({
  compteurs,
  contrats,
  recommandations,
  mandat,
}: {
  compteurs: Compteur[]
  contrats: Contrat[]
  recommandations: Recommandation[]
  mandat: Mandat | undefined
}) {
  const navigate = useNavigate()
  if (compteurs.length === 0) return null

  const mandatActif = mandat?.statut === 'ACTIF'

  return (
    <div className="overflow-x-auto rounded-xl border border-navy-100 bg-white">
      <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-navy-400">Matrice de couverture</span>
        <div className="flex items-center gap-2 text-xs text-navy-500">
          <span>Mandat du site :</span>
          {mandat ? (
            <Badge tone={mandatActif ? 'kiwi' : 'amber'}>{mandat.statut}</Badge>
          ) : (
            <Badge tone="neutral">Aucun mandat</Badge>
          )}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-navy-100 text-left text-xs uppercase tracking-wide text-navy-400">
            <th className="px-4 py-2 font-medium">Compteur</th>
            <th className="px-4 py-2 font-medium">Contrat</th>
            <th className="px-4 py-2 font-medium">Échéance</th>
            <th className="px-4 py-2 font-medium">Recommandation active</th>
            <th className="px-4 py-2 font-medium">Statut</th>
          </tr>
        </thead>
        <tbody>
          {compteurs.map((compteur) => {
            const contratsDuCompteur = contrats.filter((c) => c.compteurs.some((cc) => cc.id === compteur.id))
            const contratActif = contratsDuCompteur.find((c) => c.statut === 'ACTIF') ?? contratsDuCompteur[0]
            const jours = contratActif ? joursAvant(contratActif.date_fin) : null
            const echeanceProche = jours !== null && jours <= SEUIL_ECHEANCE_JOURS

            const recoCouvrante = recommandations.find((r) =>
              r.versions.some((v) => !VERSIONS_INACTIVES.has(v.statut) && v.compteur_ids.includes(compteur.id)),
            )

            // Le statut du contrat (échéance, couverture) et l'absence de mandat sont deux
            // informations distinctes -- l'une ne doit jamais masquer l'autre (avant ce correctif,
            // l'absence de mandat écrasait un contrat échu/urgent avec un simple badge neutre).
            // Le badge "Mandat du site" en en-tête du tableau reste le seul endroit où l'état du
            // mandat est affiché ; cette colonne ne montre que l'état réel du contrat.
            let statutLabel = 'OK'
            let statutTone: 'kiwi' | 'amber' | 'red' | 'neutral' = 'neutral'
            if (echeanceProche && !recoCouvrante) {
              statutLabel = jours !== null && jours < 0 ? 'Échu — à traiter' : 'À traiter'
              statutTone = 'red'
            } else if (recoCouvrante) {
              statutLabel = 'Couvert'
              statutTone = 'kiwi'
            } else if (echeanceProche) {
              statutLabel = 'À surveiller'
              statutTone = 'amber'
            } else if (!contratActif) {
              statutLabel = 'Aucun contrat'
              statutTone = 'neutral'
            }

            return (
              <tr key={compteur.id} className="border-b border-navy-50 last:border-0">
                <td className="px-4 py-2">
                  <button className="font-medium text-navy-800 hover:underline" onClick={() => navigate(`/compteurs/${compteur.id}`)}>
                    {compteur.utilisation || compteur.numero_pdl}
                  </button>
                </td>
                <td className="px-4 py-2 text-navy-600">
                  {contratActif ? (
                    <button className="hover:underline" onClick={() => navigate(`/contrats/${contratActif.id}`)}>
                      {contratActif.fournisseur_nom}
                    </button>
                  ) : (
                    <span className="text-navy-400">Aucun contrat</span>
                  )}
                </td>
                <td className="px-4 py-2 text-navy-600">
                  {contratActif?.date_fin ? new Date(contratActif.date_fin).toLocaleDateString('fr-FR') : '—'}
                </td>
                <td className="px-4 py-2">
                  {recoCouvrante ? (
                    <button className="text-navy-600 hover:underline" onClick={() => navigate(`/recommandations/${recoCouvrante.id}`)}>
                      {recoCouvrante.titre}
                    </button>
                  ) : (
                    <span className="text-navy-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <Badge tone={statutTone}>{statutLabel}</Badge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
