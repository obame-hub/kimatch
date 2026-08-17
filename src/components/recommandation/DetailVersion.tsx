import { Mail, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { STATUT_VERSION_TONE } from '@/lib/referenceFallbacks'
import type { ReferenceRow } from '@/lib/data/referenceTables'
import type { VersionRecommandation, Optimisation, FournisseurConsulte } from '@/types/domain'

const MISE_EN_CONCURRENCE = 'MISE_EN_CONCURRENCE'

/**
 * Détail de la version affichée : optimisations, offres reçues, et suivi des fournisseurs consultés.
 *
 * CE BLOC N'EST PAS DANS LA MAQUETTE, et il est gardé volontairement. Le design s'arrête au
 * comparatif, qui compare des versions mais ne dit rien de la mise en concurrence : qui a été
 * consulté, où en est chacun, quelle offre est arrivée. C'est la matière même d'une cotation, et
 * c'est le seul endroit de l'application où l'on peut enregistrer un suivi de consultation. Le
 * supprimer pour coller au dessin ferait perdre une fonction, pas un ornement.
 *
 * Il est simplement resserré sur LA version affichée, au lieu de dérouler toutes les versions les
 * unes sous les autres comme avant le portage.
 */
export function DetailVersion({
  version,
  statutsVersions,
  onEnvoyerEmail,
  onAjouterFournisseur,
  onAjouterSuivi,
  peutModifier,
}: {
  version: VersionRecommandation
  statutsVersions: ReferenceRow[]
  onEnvoyerEmail: () => void
  onAjouterFournisseur: (optimisation: Optimisation) => void
  onAjouterSuivi: (optimisationId: string, fc: FournisseurConsulte) => void
  peutModifier: boolean
}) {
  const statutLabel = statutsVersions.find((s) => s.code === version.statut)?.libelle ?? version.statut

  return (
    <div className="rounded-[13px] border border-kw-border bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-kw-border-subtle px-[17px] py-3">
        <span className="text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-faint">
          Détail de {version.nom || `la version ${version.numero_version ?? ''}`}
        </span>
        {version.est_figee && (
          <span title="Version figée">
            <Lock className="h-3 w-3 text-kw-faint" />
          </span>
        )}
        <span className="flex-1" />
        {version.version_actuelle && <Badge tone="kiwi">Actuelle</Badge>}
        <Badge tone={STATUT_VERSION_TONE[version.statut] ?? 'neutral'}>{statutLabel}</Badge>
      </div>

      <div className="space-y-3 px-[17px] py-3.5">
        <div>
          <p className="text-kw-lg text-kw-body">{version.resume || 'Aucun résumé.'}</p>
          {version.contexte_et_hypotheses && (
            <p className="mt-1 text-kw-base text-kw-meta">{version.contexte_et_hypotheses}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-kw-base text-kw-faint">
          <span>Motif : {version.motif_creation || '—'}</span>
          {version.economie_pourcentage !== null && (
            <span>Économie : <span className="font-medium text-kw-green">{version.economie_pourcentage} %</span></span>
          )}
          {version.niveau_confiance !== null && <span>Confiance : {version.niveau_confiance} %</span>}
          {version.date_presentation_client && (
            <span>Présentée le {new Date(version.date_presentation_client).toLocaleDateString('fr-FR')}</span>
          )}
          {version.date_decision_client && (
            <span>Décision le {new Date(version.date_decision_client).toLocaleDateString('fr-FR')}</span>
          )}
          {version.types_prix.length > 0 && <span>Type de prix : {version.types_prix.join(', ')}</span>}
          {version.contact_id && (
            <span>
              Contact de la cotation :{' '}
              <EntityLink to={`/contacts/${version.contact_id}`}>{version.contact_nom}</EntityLink>
            </span>
          )}
        </div>

        {version.optimisations.length === 0 ? (
          <p className="text-kw-base text-kw-faint">Aucune optimisation sur cette version.</p>
        ) : (
          <div className="space-y-2.5 border-t border-kw-border-faint pt-3">
            {version.optimisations.map((optimisation) => (
              <div key={optimisation.id}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-kw-base font-semibold text-kw-label">
                    {optimisation.type_optimisation || optimisation.nom}
                  </p>
                  {optimisation.est_retenue && <Badge tone="kiwi">Retenue</Badge>}
                </div>
                {optimisation.gain_estime_annuel !== null && (
                  <p className="text-kw-sm text-kw-meta">
                    Gain estimé : {optimisation.gain_estime_annuel.toLocaleString('fr-FR')} €/an
                    {optimisation.roi_mois !== null ? ` · ROI ${optimisation.roi_mois} mois` : ''}
                  </p>
                )}

                {/* Offres reçues */}
                {optimisation.offres.length === 0 ? (
                  <p className="pl-2 text-kw-base text-kw-faint">Aucune offre chiffrée pour cette optimisation.</p>
                ) : (
                  <div className="mt-1.5 space-y-1.5 pl-2">
                    {optimisation.offres.map((offre) => (
                      <div key={offre.id} className="rounded-kw-md bg-kw-bg px-2.5 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-kw-base font-semibold text-kw-ink">{offre.fournisseur_nom}</p>
                            <p className="truncate text-kw-sm text-kw-meta">
                              {offre.nom || offre.reference_offre || offre.statut || 'Offre'}
                              {offre.duree_mois ? ` · ${offre.duree_mois} mois` : ''}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            {offre.montant_annuel_ht !== null && (
                              <p className="text-kw-base font-bold text-kw-ink">
                                {offre.montant_annuel_ht.toLocaleString('fr-FR')} €/an
                              </p>
                            )}
                            {offre.economie_pourcentage !== null && (
                              <p className="text-kw-sm font-semibold text-kw-green">−{offre.economie_pourcentage} %</p>
                            )}
                          </div>
                        </div>
                        {offre.details_par_compteur.length > 0 && (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-kw-sm text-kw-faint hover:text-kw-label">
                              Détail par compteur ({offre.details_par_compteur.length})
                            </summary>
                            <div className="mt-1 space-y-1 border-t border-kw-border-faint pt-1.5">
                              {offre.details_par_compteur.map((d) => (
                                <div key={d.id} className="flex items-center justify-between text-kw-base">
                                  <span className="text-kw-label">{d.compteur_label || '—'}</span>
                                  <span className="font-medium text-kw-label">
                                    {d.cout_total_annuel_estime_ht !== null
                                      ? `${d.cout_total_annuel_estime_ht.toLocaleString('fr-FR')} €/an`
                                      : '—'}
                                    {d.economie_pourcentage !== null ? ` · −${d.economie_pourcentage} %` : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Fournisseurs consultés — le suivi de mise en concurrence. */}
                {optimisation.type_optimisation_code === MISE_EN_CONCURRENCE && (
                  <div className="mt-2 border-t border-kw-border-faint pt-2">
                    <div className="flex items-center justify-between">
                      <p className="text-kw-sm font-bold uppercase tracking-wide text-kw-faint">
                        Fournisseurs consultés
                      </p>
                      {peutModifier && (
                        <button
                          type="button"
                          onClick={() => onAjouterFournisseur(optimisation)}
                          className="text-kw-base font-semibold text-kw-green hover:underline"
                        >
                          + Ajouter
                        </button>
                      )}
                    </div>
                    {optimisation.fournisseurs_consultes.length === 0 ? (
                      <p className="pl-2 text-kw-base text-kw-faint">Aucun fournisseur consulté pour l'instant.</p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        {optimisation.fournisseurs_consultes.map((fc) => (
                          <div key={fc.id} className="flex items-start justify-between gap-2 rounded-kw-md bg-kw-bg px-2.5 py-1.5">
                            <div className="min-w-0">
                              <p className="truncate text-kw-base font-semibold text-kw-ink">{fc.fournisseur_nom}</p>
                              {fc.historique.length > 0 && (
                                <details className="mt-0.5">
                                  <summary className="cursor-pointer text-kw-sm text-kw-faint hover:text-kw-label">
                                    Historique ({fc.historique.length})
                                  </summary>
                                  <div className="mt-1 space-y-0.5 border-t border-kw-border-faint pt-1">
                                    {fc.historique.map((h) => (
                                      <p key={h.id} className="text-kw-base text-kw-meta">
                                        {new Date(h.date_evenement).toLocaleDateString('fr-FR')} — {h.statut}
                                        {h.commentaire ? ` · ${h.commentaire}` : ''}
                                      </p>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {fc.statut_actuel && <Badge tone="neutral">{fc.statut_actuel}</Badge>}
                              {peutModifier && (
                                <button
                                  type="button"
                                  onClick={() => onAjouterSuivi(optimisation.id, fc)}
                                  className="text-kw-base font-semibold text-kw-green hover:underline"
                                >
                                  + Suivi
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-kw-border-faint pt-2.5">
          <button
            type="button"
            onClick={onEnvoyerEmail}
            className="inline-flex items-center gap-1.5 text-kw-base font-semibold text-kw-green hover:underline"
          >
            <Mail className="h-3.5 w-3.5" />
            Envoyer cette version par email
          </button>
        </div>
      </div>
    </div>
  )
}
