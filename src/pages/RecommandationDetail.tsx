import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Mail, Lock } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { EtapeStepper } from '@/components/ui/etape-stepper'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Textarea } from '@/components/ui/form'
import { useRecommandations } from '@/lib/data/recommandations'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useContacts } from '@/lib/data/contacts'
import { sendEmail } from '@/lib/data/gmail'
import { FALLBACK_ETAPES_RECOMMANDATION, FALLBACK_STATUTS_VERSIONS, STATUT_VERSION_TONE } from '@/lib/referenceFallbacks'
import type { Recommandation, VersionRecommandation } from '@/types/domain'

const PRIORITE_LABEL: Record<number, string> = { 1: 'Haute', 2: 'Normale', 3: 'Basse' }

function EnvoyerEmailDialog({
  open,
  onClose,
  reco,
  version,
  defaultEmail,
}: {
  open: boolean
  onClose: () => void
  reco: Recommandation
  version: VersionRecommandation
  defaultEmail: string
}) {
  const [to, setTo] = useState(defaultEmail)
  const [subject, setSubject] = useState(`KiWee Énergie — ${reco.titre}${version.nom ? ` (${version.nom})` : ''}`)
  const [text, setText] = useState(
    `Bonjour,\n\nVoici notre recommandation "${reco.titre}"${version.nom ? ` (${version.nom})` : ''} :\n${version.resume}\n\nCordialement,`,
  )
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  async function envoyer() {
    setSending(true)
    setFeedback(null)
    try {
      await sendEmail({ to, subject, text })
      setFeedback('Email envoyé ✓')
      setTimeout(onClose, 1200)
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Envoyer par email" description="Envoie cette version au destinataire choisi depuis votre propre compte Gmail.">
      <div className="space-y-3">
        <FormField label="Destinataire">
          <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@exemple.fr" />
        </FormField>
        <FormField label="Objet">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </FormField>
        <FormField label="Message">
          <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        </FormField>
        {feedback && <p className="text-xs text-navy-600">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="button" onClick={envoyer} disabled={sending || !to}>
            {sending ? 'Envoi…' : 'Envoyer'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

export default function RecommandationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: recommandations } = useRecommandations()
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const { data: statutsVersionsRef } = useReferenceTable('statuts_versions_recommandation')
  const { data: contacts } = useContacts()
  const [emailDialogVersion, setEmailDialogVersion] = useState<VersionRecommandation | null>(null)
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const statutsVersions = statutsVersionsRef && statutsVersionsRef.length > 0 ? statutsVersionsRef : FALLBACK_STATUTS_VERSIONS
  const reco = recommandations?.find((r) => r.id === id)
  const contactPrincipal = contacts?.find((c) => c.compte_id === reco?.compte_id && c.contact_principal)

  return (
    <div>
      <Topbar crumb="Recommandations" title={reco?.titre ?? 'Recommandation'} />
      <div className="p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/recommandations')}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux recommandations
        </Button>

        {!reco ? (
          <p className="text-sm text-navy-500">Recommandation introuvable.</p>
        ) : (
          <>
            <Card className="mb-4 p-6">
              <p className="mb-5 font-display text-lg font-semibold text-navy-900">{reco.titre}</p>
              <EtapeStepper steps={etapes} currentCode={reco.etape} />
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Dossier</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><span className="text-navy-400">Compte :</span> <EntityLink to={`/comptes/${reco.compte_id}`}>{reco.compte_nom}</EntityLink></p>
                  <p>
                    <span className="text-navy-400">Sites :</span>{' '}
                    {reco.sites.map((s, i) => (
                      <span key={s.id}>
                        {i > 0 && ', '}
                        <EntityLink to={`/sites/${s.id}`}>{s.nom}</EntityLink>
                      </span>
                    ))}
                  </p>
                  {reco.origine && <p><span className="text-navy-400">Origine :</span> {reco.origine}</p>}
                  <p><span className="text-navy-400">Priorité :</span> {PRIORITE_LABEL[reco.priorite] ?? reco.priorite}</p>
                  <p><span className="text-navy-400">Conseiller :</span> {reco.conseiller}</p>
                  <p><span className="text-navy-400">Créée le :</span> {new Date(reco.date_creation).toLocaleDateString('fr-FR')}</p>
                  {reco.description && <p className="text-navy-600">{reco.description}</p>}
                  {reco.commentaire_interne && (
                    <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Note interne : {reco.commentaire_interne}</p>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Historique des versions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {reco.versions.length === 0 && (
                    <p className="text-sm text-navy-400">Aucune version produite pour le moment — analyse en cours.</p>
                  )}
                  {reco.versions.map((version) => {
                    const statutLabel = statutsVersions.find((s) => s.code === version.statut)?.libelle ?? version.statut
                    return (
                      <div key={version.id} className="rounded-lg border border-navy-100 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-navy-800">
                            {version.nom || 'Version'}
                            {version.est_figee && <Lock className="h-3 w-3 text-navy-400" />}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {version.version_actuelle && <Badge tone="kiwi">Actuelle</Badge>}
                            <Badge tone={STATUT_VERSION_TONE[version.statut] ?? 'neutral'}>{statutLabel}</Badge>
                          </div>
                        </div>
                        <p className="mt-1 text-sm text-navy-600">{version.resume}</p>
                        {version.contexte_et_hypotheses && <p className="mt-1 text-xs text-navy-500">{version.contexte_et_hypotheses}</p>}

                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-navy-400">
                          {version.economie_pourcentage !== null && (
                            <span>Économie : <span className="font-medium text-kiwi-700">{version.economie_pourcentage}%</span></span>
                          )}
                          {version.niveau_confiance !== null && <span>Confiance : {version.niveau_confiance}%</span>}
                          {version.date_presentation_client && (
                            <span>Présentée le {new Date(version.date_presentation_client).toLocaleDateString('fr-FR')}</span>
                          )}
                          {version.date_decision_client && (
                            <span>Décision le {new Date(version.date_decision_client).toLocaleDateString('fr-FR')}</span>
                          )}
                        </div>

                        <div className="mt-2 flex items-center justify-between text-xs text-navy-400">
                          <span>Motif : {version.motif_creation}</span>
                          {version.gains_estimes !== null && (
                            <span className="font-medium text-kiwi-700">Gain estimé : {version.gains_estimes.toLocaleString('fr-FR')} €</span>
                          )}
                        </div>

                        {version.optimisations.length > 0 && (
                          <div className="mt-3 space-y-2 border-t border-navy-100 pt-3">
                            {version.optimisations.map((optimisation) => (
                              <div key={optimisation.id} className="pl-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-medium text-navy-600">{optimisation.nom || optimisation.type_optimisation}</p>
                                  {optimisation.est_retenue && <Badge tone="kiwi">Retenue</Badge>}
                                </div>
                                {optimisation.gain_estime_annuel !== null && (
                                  <p className="text-[11px] text-navy-500">
                                    Gain estimé : {optimisation.gain_estime_annuel.toLocaleString('fr-FR')} €/an
                                    {optimisation.roi_mois !== null ? ` · ROI ${optimisation.roi_mois} mois` : ''}
                                  </p>
                                )}
                                {optimisation.offres.length === 0 ? (
                                  <p className="pl-2 text-xs text-navy-400">Aucune offre pour cette optimisation.</p>
                                ) : (
                                  <div className="mt-1 space-y-1.5 pl-2">
                                    {optimisation.offres.map((offre) => (
                                      <div key={offre.id} className="flex items-center justify-between rounded-md bg-navy-50 px-2.5 py-1.5">
                                        <div>
                                          <p className="text-xs font-medium text-navy-800">{offre.fournisseur_nom}</p>
                                          <p className="text-[11px] text-navy-500">{offre.nom || offre.reference_offre}{offre.duree_mois ? ` · ${offre.duree_mois} mois` : ''}</p>
                                        </div>
                                        <div className="text-right">
                                          {offre.montant_annuel_ht !== null && (
                                            <p className="text-xs font-semibold text-navy-800">{offre.montant_annuel_ht.toLocaleString('fr-FR')} €/an</p>
                                          )}
                                          {offre.economie_pourcentage !== null && (
                                            <p className="text-[11px] font-medium text-kiwi-700">-{offre.economie_pourcentage}%</p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="mt-2 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setEmailDialogVersion(version)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-kiwi-700 hover:underline"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Envoyer par email
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
      {reco && emailDialogVersion && (
        <EnvoyerEmailDialog
          open={!!emailDialogVersion}
          onClose={() => setEmailDialogVersion(null)}
          reco={reco}
          version={emailDialogVersion}
          defaultEmail={contactPrincipal?.email ?? ''}
        />
      )}
    </div>
  )
}
