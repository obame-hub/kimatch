import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Building2, FileText, Gauge, LifeBuoy, MapPin, Plus, ShieldCheck, User } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { FriseStatut } from '@/components/opportunite/FriseStatut'
import { EntityLink } from '@/components/ui/entity-link'
import { InlineField } from '@/components/ui/inline-field'
import { ActivityFeed } from '@/components/site/ActivityFeed'
import { DialogNouvelleTache } from '@/components/tache/DialogNouvelleTache'
import { useGoBack } from '@/lib/useGoBack'
import { useCanManage } from '@/lib/data/roles'
import { useActionsParSuiviContrat } from '@/lib/data/actions'
import { useInteractionsParSuiviContrat } from '@/lib/data/interactions'
import { useDocumentsParEntites } from '@/lib/data/documents'
import {
  useSuiviContrat, useEtapesSuivi, useMajEtapeSuivi, useMajChampSuivi,
  SANTE_LIBELLE, SANTE_TONE,
} from '@/lib/data/suivisContrats'
import { cn } from '@/lib/utils'

/**
 * FICHE SUIVI DE CONTRAT.
 *
 * Le flux d'activité reste à droite, tandis que les objets liés sont regroupés dans l'onglet
 * Rattachements afin de libérer le plan de travail principal.
 * Le bandeau conserve l'étape, la santé et le prochain geste AU-DESSUS de tout onglet :
 * une page doit rendre immédiatement compréhensibles le
 * statut, le prochain geste et le blocage éventuel ».
 *
 * L'ÉTAPE AVANCE D'UN CRAN À LA FOIS, et le bouton ne propose que la suivante. Trois étapes sur huit
 * sont des gestes humains que la base ne peut pas déduire — confirmer l'envoi de la résiliation,
 * veiller à la double signature, ouvrir le renouvellement. Les cinq autres arrivent seules. Un
 * sélecteur libre aurait laissé n'importe qui poser « Terminé » sur un contrat qui court encore.
 */

/**
 * Les sept jalons du parcours. CLOTURE n'en fait pas partie : c'est la sortie, et son libellé
 * « Terminé ou résilié » dit lui-même qu'elle recouvre deux fins différentes — la frise la porte
 * en finalité, avec le mot juste.
 */
const JALONS_SUIVI = [
  'A_PREPARER',
  'RESILIATION_A_CONFIRMER',
  'EN_ATTENTE_ACTIVATION',
  'CONTRAT_ACTIF',
  'SUIVI_CLIENT',
  'RENOUVELLEMENT_A_ANTICIPER',
  'EN_RENOUVELLEMENT',
] as const

const ETAPES_ORDRE = [
  'A_PREPARER',
  'RESILIATION_A_CONFIRMER',
  'EN_ATTENTE_ACTIVATION',
  'CONTRAT_ACTIF',
  'SUIVI_CLIENT',
  'RENOUVELLEMENT_A_ANTICIPER',
  'EN_RENOUVELLEMENT',
  'CLOTURE',
]

function dateLisible(v: string | null | undefined) {
  return v ? new Date(v).toLocaleDateString('fr-FR') : '—'
}

/** Une ligne de l'onglet Rattachements, avec navigation directe vers l'objet. */
function Rattachement({ icone: Icone, libelle, valeur, to }: {
  icone: typeof Building2
  libelle: string
  valeur: string | null
  to?: string
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-km-soft text-km-muted">
        <Icone className="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-km-label uppercase tracking-wide text-km-faint">{libelle}</p>
        {valeur ? (
          to ? (
            <EntityLink to={to}>{valeur}</EntityLink>
          ) : (
            <p className="truncate text-km-body font-bold text-km-text">{valeur}</p>
          )
        ) : (
          <p className="text-km-body text-km-faint">non renseigné</p>
        )}
      </div>
    </div>
  )
}

export default function SuiviContratDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const goBack = useGoBack('/suivis-contrats')
  const canManage = useCanManage()

  const { data: suivi, isLoading } = useSuiviContrat(id)
  const { data: etapes } = useEtapesSuivi()
  const { data: actions } = useActionsParSuiviContrat(id)
  const { data: interactions } = useInteractionsParSuiviContrat(id)
  const { data: documents } = useDocumentsParEntites(id ? [id] : undefined)
  const majEtape = useMajEtapeSuivi()
  const majChamp = useMajChampSuivi()

  const [tacheOuverte, setTacheOuverte] = useState(false)
  const [onglet, setOnglet] = useState<'suivi' | 'rattachements'>('suivi')
  const [toast, setToast] = useState<string | null>(null)
  function signaler(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 2600)
  }

  if (isLoading) return <div className="p-6 text-km-body text-km-faint">Chargement…</div>
  if (!suivi) return <div className="p-6 text-km-body text-km-faint">Suivi introuvable.</div>

  const rang = ETAPES_ORDRE.indexOf(suivi.etape)
  const codeSuivant = rang >= 0 && rang < ETAPES_ORDRE.length - 1 ? ETAPES_ORDRE[rang + 1] : null
  const etapeSuivante = (etapes ?? []).find((e) => e.code === codeSuivant)
  const clos = suivi.etape === 'CLOTURE'

  // Les documents rattachés à CE suivi. `useDocumentsParEntites` interroge par identifiant : on
  // retient ceux qui portent bien le type, sinon un objet de même identifiant se mélangerait.
  const documentsDuSuivi = (documents ?? []).filter((d) => d.entite_type === 'suivi_contrat')

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar crumb="Suivis de contrats" title={suivi.compte_nom ?? 'Suivi de contrat'} />

      {/* ══ LE BANDEAU : STATUT, PROCHAIN GESTE, BLOCAGE — sans ouvrir d'onglet (§ 1 et § 11) ══ */}
      <div className="flex flex-none flex-wrap items-center gap-3 border-b border-km-line bg-white px-4 py-3 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux suivis">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-km-green-soft text-km-green">
          <LifeBuoy className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-km-title font-bold text-km-text">{suivi.compte_nom ?? 'Compte inconnu'}</p>
            {/* LA PASTILLE D'ÉTAPE EST PARTIE, la frise ci-dessous la dit mieux (Naoëlle,
                03/09/2026). LA SANTÉ RESTE : ce n'est pas une étape du parcours mais un jugement
                porté dessus — un suivi « en renouvellement » peut être sain ou en souffrance, et
                c'est justement quand les deux divergent qu'il faut le voir. Elle porte toujours son
                libellé : « la couleur seule ne porte jamais l'information » (§ 11). */}
            <Badge tone={SANTE_TONE[suivi.sante] ?? 'neutral'}>{SANTE_LIBELLE[suivi.sante] ?? suivi.sante}</Badge>
          </div>
          {/* Ce que l'étape sert à obtenir, mot pour mot le § 7. Sans elle, « À préparer » ne dit
              rien de ce qu'il y a à préparer. */}
          <p className="truncate text-km-body text-km-muted">{suivi.etape_finalite}</p>
        </div>
        {canManage && !clos && etapeSuivante && (
          <Button
            onClick={async () => {
              try {
                await majEtape.mutateAsync({
                  id: suivi.id,
                  etape_id: etapeSuivante.id,
                  cloture: etapeSuivante.code === 'CLOTURE',
                  finalite: etapeSuivante.code === 'CLOTURE' ? 'TERMINE' : null,
                })
                signaler(`→ ${etapeSuivante.libelle}`)
              } catch (e) {
                signaler(e instanceof Error ? e.message : 'Enregistrement impossible')
              }
            }}
            disabled={majEtape.isPending}
          >
            {etapeSuivante.libelle}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* ══ LE PARCOURS ══════════════════════════════════════════════════════════════════════════

          C'était une bande de huit libellés séparés par des chevrons, le courant sur fond noir. Elle
          disait l'étape, pas le chemin : rien n'indiquait ce qui restait à franchir, et elle n'était
          pas animée. Naoëlle, 03/09/2026 : « garde les frises animées de statut, c'est plus parlant
          pour nous ; les objets où on n'a pas encore mis de frise, mets-le ».

          SEPT JALONS, PAS HUIT. « Terminé ou résilié » (CLOTURE) n'est pas une huitième étape, c'est
          la sortie — et son libellé dit lui-même qu'elle recouvre deux fins différentes. Elle ferme
          donc la frise en portant la finalité réelle, résilié ou terminé, ce que la bande précédente
          ne savait pas montrer.

          CLIQUABLE SUR TOUT LE PARCOURS. Le bouton « étape suivante » de l'en-tête ne permettait
          d'avancer que d'un cran à la fois et jamais de revenir — or un suivi rouvert après une
          résiliation annulée existe. */}
      <div className="flex-none border-b border-km-line bg-km-bg/60 px-4 pb-1 sm:px-6">
        <FriseStatut
          teinte="recommandation"
          jalons={JALONS_SUIVI.map((code) => ({
            code,
            libelle: (etapes ?? []).find((x) => x.code === code)?.libelle ?? code,
          }))}
          courant={clos ? JALONS_SUIVI[JALONS_SUIVI.length - 1] : suivi.etape}
          finalite={
            clos
              ? {
                  libelle: suivi.finalite === 'RESILIE' ? 'Résilié' : 'Terminé',
                  perdue: suivi.finalite === 'RESILIE',
                  neutre: suivi.finalite !== 'RESILIE',
                }
              : null
          }
          onJalon={
            canManage
              ? (code: string) => {
                  const cible = (etapes ?? []).find((x) => x.code === code)
                  if (!cible || cible.code === suivi.etape) return
                  majEtape
                    .mutateAsync({ id: suivi.id, etape_id: cible.id, cloture: false, finalite: null })
                    .then(() => signaler(`→ ${cible.libelle}`))
                    .catch((e) => signaler(e instanceof Error ? e.message : 'Enregistrement impossible'))
                }
              : undefined
          }
          issues={
            canManage && !clos
              ? [{ code: 'CLOTURE', libelle: (etapes ?? []).find((x) => x.code === 'CLOTURE')?.libelle ?? 'Terminé ou résilié' }]
              : undefined
          }
        />
      </div>

      <div className="flex flex-none items-center gap-0.5 border-b border-km-line bg-white px-4 pt-2.5 sm:px-6">
        {([
          { cle: 'suivi' as const, libelle: 'Suivi' },
          { cle: 'rattachements' as const, libelle: 'Rattachements' },
        ]).map((item) => (
          <button
            key={item.cle}
            type="button"
            onClick={() => setOnglet(item.cle)}
            className={cn(
              'border-b-2 px-3 pb-2 pt-1.5 text-km-body transition-colors',
              onglet === item.cle
                ? 'border-km-green font-bold text-km-text'
                : 'border-transparent font-medium text-km-muted hover:text-km-text',
            )}
          >
            {item.libelle}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Contenu de l'onglet Rattachements. */}
        <div className={cn('col-start-1 row-start-1 flex min-h-0 flex-col gap-3 overflow-y-auto bg-km-bg/60 p-4 sm:p-5', onglet !== 'rattachements' && 'hidden')}>
          <Card className="p-3.5">
            <p className="mb-1 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
              Rattachements
            </p>
            <Rattachement
              icone={FileText}
              libelle="Contrat"
              valeur={suivi.contrat_reference || 'sans référence'}
              to={`/contrats/${suivi.contrat_id}`}
            />
            <Rattachement
              icone={Building2}
              libelle="Compte"
              valeur={suivi.compte_nom}
              to={suivi.compte_id ? `/comptes/${suivi.compte_id}` : undefined}
            />
            <Rattachement
              icone={MapPin}
              libelle="Site"
              valeur={suivi.site_nom}
              to={suivi.site_id ? `/sites/${suivi.site_id}` : undefined}
            />
            <Rattachement
              icone={User}
              libelle="Contact principal"
              valeur={suivi.contact_principal_nom || null}
              to={suivi.contact_principal_id ? `/contacts/${suivi.contact_principal_id}` : undefined}
            />
            <Rattachement
              icone={Gauge}
              libelle="Fournisseur"
              valeur={suivi.fournisseur_nom}
              to={suivi.fournisseur_compte_id ? `/comptes/${suivi.fournisseur_compte_id}` : undefined}
            />
            {suivi.recommandation_id && (
              <Rattachement
                icone={ShieldCheck}
                libelle="Recommandation d'origine"
                valeur="ouvrir le dossier"
                to={`/recommandations/${suivi.recommandation_id}`}
              />
            )}
          </Card>

          <Card className="p-3.5">
            <p className="mb-2 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
              Le contrat
            </p>
            <p className="text-km-body text-km-muted">
              Début : <span className="font-bold text-km-text">{dateLisible(suivi.date_debut)}</span>
            </p>
            <p className="text-km-body text-km-muted">
              Échéance : <span className="font-bold text-km-text">{dateLisible(suivi.date_fin)}</span>
            </p>
            {suivi.jours_avant_echeance != null && (
              <p className={cn('mt-1 text-km-label', suivi.jours_avant_echeance < 0 ? 'font-bold text-km-red' : 'text-km-faint')}>
                {suivi.jours_avant_echeance < 0
                  ? `Dépassée depuis ${-suivi.jours_avant_echeance} jours`
                  : `Dans ${suivi.jours_avant_echeance} jours`}
              </p>
            )}
            <p className="mt-2 border-t border-km-line pt-2 text-km-label text-km-faint">
              Suivi ouvert le {dateLisible(suivi.date_ouverture)}
              {suivi.date_cloture && ` · clos le ${dateLisible(suivi.date_cloture)}`}
            </p>
          </Card>
        </div>

        {/* ══ CENTRE ══ */}
        <div className={cn('col-start-1 row-start-1 overflow-y-auto bg-km-bg p-4 sm:p-5', onglet === 'rattachements' && 'hidden')}>
          <div className="flex flex-col gap-3.5">
            {/* LA PROCHAINE ACTION, SON RESPONSABLE ET SON ÉCHÉANCE (§ 9). */}
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
                  Prochaine action
                </p>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setTacheOuverte(true)}
                    className="inline-flex items-center gap-1 text-km-label font-bold text-indigo-600 hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Nouvelle tâche
                  </button>
                )}
              </div>
              {suivi.prochaine_action ? (
                <>
                  <p className="text-km-body font-bold text-km-text">{suivi.prochaine_action}</p>
                  <p className="text-km-label text-km-muted">
                    {suivi.prochain_responsable || 'sans responsable'}
                    {suivi.prochaine_echeance && ` · pour le ${dateLisible(suivi.prochaine_echeance)}`}
                  </p>
                </>
              ) : (
                <p className="text-km-body text-km-faint">
                  Aucune action ouverte. {suivi.etape_finalite}
                </p>
              )}
              {(suivi.actions_en_retard > 0 || suivi.requetes_en_retard > 0) && (
                <p className="mt-2 border-t border-km-line pt-2 text-km-label font-bold text-km-red">
                  {suivi.actions_en_retard > 0 && `${suivi.actions_en_retard} action(s) en retard`}
                  {suivi.actions_en_retard > 0 && suivi.requetes_en_retard > 0 && ' · '}
                  {suivi.requetes_en_retard > 0 && `${suivi.requetes_en_retard} requête(s) en retard`}
                </p>
              )}
            </Card>

            <Card className="p-4">
              <p className="mb-2 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
                Suivi du dossier
              </p>
              <InlineField
                variant="longtext"
                label="Commentaire"
                emptyLabel="aucun"
                value={suivi.commentaire ?? ''}
                onCommit={(v: string) =>
                  majChamp.mutateAsync({ id: suivi.id, patch: { commentaire: v.trim() || null } })
                }
                onSaved={() => signaler('✓ Enregistré')}
                onError={(e: Error) => signaler(e.message)}
              />
              {/* LA SANTÉ FORCÉE EST L'EXCEPTION DÉCLARÉE. Elle l'emporte sur le calcul, donc elle
                  doit dire pourquoi : une santé rouge sans motif relance la question à chaque
                  lecture, et personne ne saura s'il faut la lever. */}
              <div className="mt-3 border-t border-km-line pt-2">
                <p className="mb-1 text-km-label text-km-faint">
                  Santé calculée : <span className="font-bold text-km-text">{SANTE_LIBELLE[suivi.sante]}</span>
                  {suivi.sante_forcee && ' — forcée à la main'}
                </p>
                {suivi.sante_forcee && (
                  <p className="text-km-label text-km-muted">
                    Motif : {suivi.motif_sante_forcee || 'non précisé'}
                  </p>
                )}
              </div>
            </Card>

            <Card className="p-4">
              <p className="mb-2 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
                Ce qui est ouvert
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-2xl font-bold tracking-tight text-km-text">{suivi.actions_ouvertes}</p>
                  <p className="text-km-label text-km-muted">
                    action{suivi.actions_ouvertes > 1 ? 's' : ''} à faire
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight text-km-text">{suivi.requetes_ouvertes}</p>
                  <p className="text-km-label text-km-muted">
                    requête{suivi.requetes_ouvertes > 1 ? 's' : ''} ouverte{suivi.requetes_ouvertes > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              {suivi.requetes_ouvertes > 0 && (
                <button
                  type="button"
                  onClick={() => navigate('/requetes')}
                  className="mt-2 text-km-label font-bold text-indigo-600 hover:underline"
                >
                  Voir les requêtes du contrat →
                </button>
              )}
              {documentsDuSuivi.length > 0 && (
                <p className="mt-2 border-t border-km-line pt-2 text-km-label text-km-muted">
                  {documentsDuSuivi.length} document{documentsDuSuivi.length > 1 ? 's' : ''} rattaché
                  {documentsDuSuivi.length > 1 ? 's' : ''}
                </p>
              )}
            </Card>
          </div>
        </div>

        {/* ══ DROITE : LE FLUX (§ 11) ══ */}
        <div className="hidden min-h-0 flex-col border-l border-km-line bg-white lg:flex">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ActivityFeed
              compteId={suivi.compte_id ?? ''}
              compteNom={suivi.compte_nom ?? ''}
              siteId={suivi.site_id}
              siteNom={suivi.site_nom ?? ''}
              interactions={interactions ?? []}
              actions={actions ?? []}
              documents={documentsDuSuivi}
              suiviContratId={suivi.id}
            />
          </div>
        </div>
      </div>

      {tacheOuverte && (
        <DialogNouvelleTache
          open
          onClose={() => setTacheOuverte(false)}
          signaler={signaler}
          rattachement={{
            suivi_contrat_id: suivi.id,
            site_id: suivi.site_id,
            site_nom: suivi.site_nom ?? '',
            contact_id: suivi.contact_principal_id,
            contact_nom: suivi.contact_principal_nom,
            libelle_cible: `le suivi du contrat ${suivi.compte_nom ?? ''}`.trim(),
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-km bg-ink-800 px-3.5 py-2 text-km-body text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
