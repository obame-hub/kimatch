import { Mail, Lock, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { OffresDuFournisseur } from '@/components/recommandation/OffresDuFournisseur'
import { STATUT_VERSION_TONE } from '@/lib/referenceFallbacks'
import { cn } from '@/lib/utils'
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
  onChangerStatut,
  statutsConsultation,
  peutModifier,
  signaler,
  onSupprimer,
}: {
  version: VersionRecommandation
  statutsVersions: ReferenceRow[]
  onEnvoyerEmail: () => void
  onAjouterFournisseur: (optimisation: Optimisation) => void
  /** Change le statut de la demande, en enregistrant un événement de suivi daté. */
  onChangerStatut: (fc: FournisseurConsulte, statutId: string) => void
  statutsConsultation: ReferenceRow[]
  peutModifier: boolean
  signaler: (message: string) => void
  /** Ouvre la confirmation de suppression, tenue par la fiche : elle sait ce qui va être perdu. */
  onSupprimer: () => void
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
        {/* Supprimer une version créée par erreur (demande de la réunion du 17/08/2026). Discret et
            à droite : c'est un geste de rattrapage, pas une action courante. */}
        {peutModifier && (
          <button
            type="button"
            onClick={onSupprimer}
            title="Supprimer cette version"
            className="rounded-kw-sm p-1 text-kw-ghost hover:bg-kw-red-light hover:text-kw-red"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
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

                {/*
                  Fournisseurs consultés, et SOUS CHACUN ses offres.
                  « Il faut qu'on voie sous chaque fournisseur consulté la ou les offres
                  différentes, sinon la version ne sert à rien » (Michel, 17/08/2026). Les offres
                  étaient listées à plat sous l'optimisation, sans qu'on sache laquelle venait de
                  qui, et sans pouvoir en comparer deux d'un même fournisseur.
                */}
                {(optimisation.type_optimisation_code === MISE_EN_CONCURRENCE
                  || optimisation.fournisseurs_consultes.length > 0) && (
                  <div className="mt-2 border-t border-kw-border-faint pt-2">
                    <div className="flex items-center justify-between">
                      <p className="text-kw-sm font-bold uppercase tracking-wide text-kw-faint">
                        Fournisseurs consultés et offres reçues
                      </p>
                      {peutModifier && (
                        <button
                          type="button"
                          onClick={() => onAjouterFournisseur(optimisation)}
                          className="text-kw-base font-semibold text-kw-green hover:underline"
                        >
                          + Consulter un fournisseur
                        </button>
                      )}
                    </div>
                    {optimisation.fournisseurs_consultes.length === 0 ? (
                      <p className="pl-2 text-kw-base text-kw-faint">Aucun fournisseur consulté pour l'instant.</p>
                    ) : (
                      <div className="mt-1.5 space-y-2">
                        {optimisation.fournisseurs_consultes.map((fc) => {
                          const retenue = fc.offres.find((o) => o.est_offre_recommandee)
                          const chiffrees = fc.offres.filter((o) => o.montant_annuel_ht != null || o.prix_moyen_mwh != null)
                          return (
                            <div
                              key={fc.id}
                              className={cn(
                                'rounded-kw-lg border px-2.5 py-2',
                                retenue ? 'border-[#dcc39c] bg-[#fdf9f0]/60' : 'border-kw-border bg-kw-subtle',
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-kw-md font-bold text-kw-ink">{fc.fournisseur_nom}</p>
                                {/* Ce que ce fournisseur a répondu, d'un coup d'œil. */}
                                <span className="text-kw-sm text-kw-meta">
                                  {fc.offres.length === 0
                                    ? 'aucune offre suivie'
                                    : `${chiffrees.length}/${fc.offres.length} offre${fc.offres.length > 1 ? 's' : ''} chiffrée${chiffrees.length > 1 ? 's' : ''}`}
                                </span>
                                {fc.offres.some((o) => o.statut === 'REFUSEE') && fc.offres.some((o) => o.statut === 'ACCEPTEE') && (
                                  // Le commercial doit voir ça sans ouvrir chaque offre : c'est tout
                                  // l'objet du statut « acceptée partiellement ».
                                  <span className="rounded-kw-xs bg-kw-amber-light px-1.5 py-0.5 text-kw-micro font-extrabold uppercase tracking-[0.05em] text-kw-amber-dark">
                                    partiellement accepté
                                  </span>
                                )}
                                <span className="flex-1" />
                                {/*
                                  Le statut de la DEMANDE, au niveau du fournisseur consulté : elle
                                  porte sur toutes ses offres à la fois. Chaque changement ajoute une
                                  ligne datée dans l'historique — c'est un objet d'activité, pas un
                                  champ (réunion du 17/08/2026). « Offre reçue » fait basculer en
                                  reçues les seules offres acceptées.
                                */}
                                {peutModifier ? (
                                  <select
                                    value=""
                                    onChange={(e) => { if (e.target.value) onChangerStatut(fc, e.target.value) }}
                                    className="rounded-kw-sm border border-kw-border-strong bg-white px-1.5 py-0.5 text-kw-base font-semibold text-kw-label outline-none"
                                  >
                                    <option value="">
                                      {fc.statut_actuel ? `${fc.statut_actuel} — changer…` : 'Statut de la demande…'}
                                    </option>
                                    {statutsConsultation.map((st) => (
                                      <option key={st.id} value={st.id}>{st.libelle}</option>
                                    ))}
                                  </select>
                                ) : (
                                  fc.statut_actuel && <Badge tone="neutral">{fc.statut_actuel}</Badge>
                                )}
                              </div>

                              {fc.historique.length > 0 && (
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-kw-sm text-kw-faint hover:text-kw-label">
                                    Historique de consultation ({fc.historique.length})
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

                              <OffresDuFournisseur
                                fournisseur={fc}
                                optimisationId={optimisation.id}
                                dureesDemandees={version.durees}
                                typesPrixDemandes={version.types_prix}
                                peutModifier={peutModifier}
                                signaler={signaler}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Offres sans fournisseur consulté : les 0 ligne actuelles n'en produiront pas, mais
                    une offre orpheline ne doit pas devenir invisible sous prétexte qu'elle ne se
                    range nulle part. */}
                {optimisation.offres.some((o) => !o.optimisation_fournisseur_id) && (
                  <div className="mt-2 border-t border-kw-border-faint pt-2">
                    <p className="text-kw-sm font-bold uppercase tracking-wide text-kw-faint">
                      Offres non rattachées à un fournisseur consulté
                    </p>
                    {optimisation.offres
                      .filter((o) => !o.optimisation_fournisseur_id)
                      .map((offre) => (
                        <div key={offre.id} className="mt-1 flex items-center justify-between gap-2 rounded-kw-md bg-kw-bg px-2.5 py-1.5">
                          <span className="truncate text-kw-base font-semibold text-kw-ink">
                            {offre.fournisseur_nom} · {offre.nom || offre.reference_offre || 'Offre'}
                          </span>
                          <span className="shrink-0 font-mono text-kw-base text-kw-label">
                            {offre.montant_annuel_ht != null ? `${offre.montant_annuel_ht.toLocaleString('fr-FR')} €/an` : '—'}
                          </span>
                        </div>
                      ))}
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
