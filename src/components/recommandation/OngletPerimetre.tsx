import { MapPin, Zap, Flame, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { Recommandation, Compteur } from '@/types/domain'

/**
 * Onglet « Périmètre » — les points de livraison du dossier, groupés par site.
 *
 * Le bandeau du haut est l'avertissement du design, et ce n'est pas un détail décoratif : le
 * périmètre est UNIQUE pour tout le dossier, toutes les versions portent sur les mêmes PDL. Sans
 * cette phrase, on croit pouvoir changer de périmètre en changeant de version.
 */
export function OngletPerimetre({
  reco,
  compteurs,
}: {
  reco: Recommandation
  compteurs: Compteur[]
}) {
  const navigate = useNavigate()
  const ids = reco.compteur_ids ?? []
  const duPerimetre = compteurs.filter((c) => ids.includes(c.id))

  // Groupés par site, dans l'ordre des sites de la recommandation. Les compteurs dont le site n'est
  // pas dans la liste tombent dans un groupe « autre » plutôt que de disparaître.
  const groupes = reco.sites.map((s) => ({
    site: s,
    compteurs: duPerimetre.filter((c) => c.site_id === s.id),
  }))
  const orphelins = duPerimetre.filter((c) => !reco.sites.some((s) => s.id === c.site_id))

  return (
    <div className="flex animate-kw-fade-slide flex-col gap-3.5">
      <div className="rounded-kw-lg border border-[#f0e4cd] bg-kw-amber-light px-3 py-2.5 text-kw-sm text-kw-meta">
        Périmètre <b className="text-kw-ink">unique pour tout le dossier</b> : toutes les versions
        portent sur ces mêmes points de livraison.
      </div>

      {duPerimetre.length === 0 && (
        <div className="rounded-[13px] border border-kw-border bg-white p-6 text-center">
          <p className="text-kw-lg font-semibold text-kw-ink">Aucun point de livraison rattaché</p>
          <p className="mt-1 text-kw-base text-kw-meta">
            {ids.length > 0
              ? `${ids.length} compteur(s) référencé(s) mais hors de votre périmètre de visibilité.`
              : 'Cette recommandation ne porte encore sur aucun compteur : la cotation ne pourra pas être lancée.'}
          </p>
        </div>
      )}

      {[...groupes, ...(orphelins.length > 0 ? [{ site: null, compteurs: orphelins }] : [])]
        .filter((g) => g.compteurs.length > 0 || g.site)
        .map((groupe) => (
          <div
            key={groupe.site?.id ?? 'orphelins'}
            className="overflow-hidden rounded-[13px] border border-kw-border bg-white"
          >
            <div className="flex flex-wrap items-center gap-2.5 border-b border-[#d9e8e0] bg-[#eef5f1] px-4 py-3">
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-kw-md bg-kw-green text-white">
                <MapPin className="h-3 w-3" />
              </span>
              {groupe.site ? (
                <button
                  type="button"
                  onClick={() => navigate(`/sites/${groupe.site!.id}`)}
                  className="text-[13.5px] font-bold text-kw-ink hover:text-kw-green hover:underline"
                >
                  {groupe.site.nom}
                </button>
              ) : (
                <span className="text-[13.5px] font-bold text-kw-ink">Compteurs sans site rattaché à la fiche</span>
              )}
              <span className="flex-1" />
              <span className="text-kw-sm font-bold text-kw-green">
                {groupe.compteurs.length} compteur{groupe.compteurs.length > 1 ? 's' : ''}
              </span>
            </div>
            {groupe.compteurs.length === 0 ? (
              <p className="px-4 py-2.5 text-kw-base text-kw-faint">
                Aucun compteur de ce site n'est dans le périmètre.
              </p>
            ) : (
              groupe.compteurs.map((c, i) => {
                const gaz = c.type_energie === 'gaz'
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate(`/compteurs/${c.id}`)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-kw-subtle',
                      i < groupe.compteurs.length - 1 && 'border-b border-kw-border-faint',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-kw-sm',
                        gaz ? 'bg-kw-gas-light text-kw-gas' : 'bg-kw-gold-light text-kw-gold',
                      )}
                    >
                      {gaz ? <Flame className="h-2.5 w-2.5" /> : <Zap className="h-2.5 w-2.5" />}
                    </span>
                    {/* Un compteur n'a pas de nom propre : c'est son usage qui le désigne
                        (« Communs Bât. A »), ou sa localisation sur place à défaut. */}
                    <span className="whitespace-nowrap text-kw-lg font-bold text-kw-ink">
                      {c.utilisation || c.localisation_site || c.type_utilisation_compteur || 'Compteur'}
                    </span>
                    <span className="truncate font-mono text-[9.5px] text-kw-faint">{c.numero_pdl}</span>
                    <span className="flex-1" />
                    <span className="whitespace-nowrap font-mono text-kw-xs text-kw-label">
                      {c.consommation_annuelle_mwh != null
                        ? `${c.consommation_annuelle_mwh.toLocaleString('fr-FR')} MWh/an`
                        : 'conso inconnue'}
                      {c.date_echeance ? ` · éch. ${new Date(c.date_echeance).toLocaleDateString('fr-FR')}` : ''}
                    </span>
                    <ChevronRight className="h-3 w-3 shrink-0 text-kw-ghost" />
                  </button>
                )
              })
            )}
          </div>
        ))}
    </div>
  )
}
