import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, LifeBuoy } from 'lucide-react'
import { TitreOnglet } from '@/components/layout/TitreOnglet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FriseStatut } from '@/components/opportunite/FriseStatut'
import { ActivityFeed } from '@/components/site/ActivityFeed'
import { CartesRattachements } from '@/components/suivi/CartesRattachements'
import { CheckListSuivi } from '@/components/suivi/CheckListSuivi'
import { useRattachementsSuivi } from '@/lib/data/rattachementsSuivi'
import { useGoBack } from '@/lib/useGoBack'
import { useCanManage } from '@/lib/data/roles'
import { useActionsParSuiviContrat } from '@/lib/data/actions'
import { useInteractionsParSuiviContrat } from '@/lib/data/interactions'
import { useDocumentsParEntites } from '@/lib/data/documents'
import {
  useSuiviContrat, useEtapesSuivi, useMajEtapeSuivi,
  SANTE_LIBELLE, SANTE_TONE,
} from '@/lib/data/suivisContrats'

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

export default function SuiviContratDetail() {
  const { id } = useParams<{ id: string }>()
  const goBack = useGoBack('/suivis-contrats')
  const canManage = useCanManage()

  const { data: suivi, isLoading } = useSuiviContrat(id)
  const { data: etapes } = useEtapesSuivi()
  const { data: actions } = useActionsParSuiviContrat(id)
  const { data: interactions } = useInteractionsParSuiviContrat(id)
  const { data: documents } = useDocumentsParEntites(id ? [id] : undefined)
  /* Tout ce que l'onglet Rattachements affiche — lu pour CE suivi seulement, et à part de
     `useSuiviContrat` pour que la liste des 1 583 suivis n'en paie rien. */
  const { data: rattachements } = useRattachementsSuivi({
    suiviId: id,
    contratId: suivi?.contrat_id,
    contactId: suivi?.contact_principal_id,
  })
  const majEtape = useMajEtapeSuivi()

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
      <TitreOnglet crumb="Suivis de contrats" title={suivi.compte_nom ?? 'Suivi de contrat'} />

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

      {/* ══ PLUS D'ONGLETS ══
          William, 25/09/2026 : « finalement j'aimerais que tout s'affiche dans un seul onglet, donc
          plus besoin d'afficher des onglets ». Deux onglets pour deux contenus qui tiennent l'un
          sous l'autre imposaient un clic pour savoir CE QUE l'autre contenait — et sur un dossier
          qu'on ouvre justement pour vérifier où il en est, c'est le clic de trop.

          La barre reste, vidée de ses boutons : elle portait aussi le titre du volet d'activité, et
          c'est elle qui fait tomber son filet gauche au pixel sur celui du volet. */}
      <div className="grid flex-none grid-cols-1 border-b border-km-line bg-white lg:grid-cols-fiche-activite">
        <div className="flex min-w-0 items-center px-4 py-2.5 sm:px-6">
          <span className="truncate text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
            Le dossier
          </span>
        </div>
        <div className="hidden items-center border-b-2 border-km-suivi px-3 lg:flex">
          <span className="truncate text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
            Activité · suivi de contrat
          </span>
        </div>
      </div>

      {/* `grid-rows-[minmax(0,1fr)]` : sans lui, la rangée implicite de cette grille se dimensionne
          en `auto`, donc à la hauteur de son contenu. Le volet qui dépasse la fenêtre étire la
          rangée au lieu de défiler, et l'`overflow-hidden` coupe net en bas. Même défaut corrigé
          sur la fiche compte le 15/09/2026 et sur la fiche piste le 16/09 — voir leur commentaire
          pour le raisonnement complet. Latent ici tant que le contenu tient dans l'écran. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden lg:grid-cols-fiche-activite">
        {/* ══ LE DOSSIER, D'UN SEUL TENANT ══
            Les rattachements ouvrent la page : c'est ce qu'on vient lire. Le suivi proprement dit —
            prochaine action, check-list, santé — suit en dessous. */}
        <div className="col-start-1 row-start-1 overflow-y-auto bg-km-bg p-4 pb-6 sm:p-5 sm:pb-8">
          <div className="flex flex-col gap-3.5">
            {/* LA CHECK-LIST OUVRE LA PAGE. William, 25/09/2026 : « j'aimerais qu'elle soit tout
                en haut et en mode horizontal ». C'est ce que Fabien vient poser en premier quand il
                a fait un geste, et ce qu'il vient lire pour savoir ce qui reste. */}
            <CheckListSuivi suiviId={suivi.id} peutModifier={canManage} />

            {rattachements ? (
              <CartesRattachements
                data={rattachements}
                suiviId={suivi.id}
                contratId={suivi.contrat_id}
                compteId={suivi.compte_id}
                compteNom={suivi.compte_nom}
              />
            ) : (
              <p className="text-km-body text-km-faint">Lecture des rattachements…</p>
            )}

          </div>
        </div>

        {/* ══ DROITE : LE FLUX (§ 11) ══ */}
        <div className="hidden min-h-0 flex-col border-l border-km-line bg-km-bg lg:flex">
          <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-4 sm:pt-5">
            <ActivityFeed
              compteId={suivi.compte_id ?? ''}
              compteNom={suivi.compte_nom ?? ''}
              siteId={suivi.site_id}
              siteNom={suivi.site_nom ?? ''}
              interactions={interactions ?? []}
              actions={actions ?? []}
              documents={documentsDuSuivi}
              suiviContratId={suivi.id}
              rattachementTache={
                canManage
                  ? {
                      suivi_contrat_id: suivi.id,
                      site_id: suivi.site_id,
                      site_nom: suivi.site_nom ?? '',
                      contact_id: suivi.contact_principal_id,
                      contact_nom: suivi.contact_principal_nom,
                      compte_id: suivi.compte_id ?? null,
                      objet_nom: suivi.compte_nom ?? '',
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>


      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-km bg-ink-800 px-3.5 py-2 text-km-body text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
