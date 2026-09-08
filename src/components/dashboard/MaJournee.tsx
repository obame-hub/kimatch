import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock,
  Filter,
  Inbox,
  LifeBuoy,
  ListChecks,
  ShieldCheck,
  Sparkle,
  Target,
  Undo2,
  User,
} from 'lucide-react'
import { REPORTS, useGestesTache } from '@/lib/data/gestesTache'
import { useReporterEnLot } from '@/lib/data/actions'
import {
  LIBELLE_GROUPE,
  badgeAction,
  useContexteJournee,
  type ActionAFaire,
  type GroupeJournee,
} from '@/lib/data/tableauDeBord'
import { cn } from '@/lib/utils'

/**
 * « MA JOURNÉE » — page 1 du PDF de Michel du 25/08/2026 au soir.
 *
 * IL L'A REDESSINÉE LE JOUR MÊME, et dans l'autre sens : sa maquette du matin montrait un agenda
 * horaire (« 09:30 · Présenter la recommandation »), celle du soir montre une LISTE À COCHER groupée
 * par objet, avec un badge d'urgence à droite et un basculement à réaliser / réalisé / tout.
 *
 * C'EST PLUS JUSTE, et ça valait la peine de le suivre : une relance n'a pas d'heure. Un plan de
 * travail dit ce qui attend et permet de le rayer ; un emploi du temps impose une précision que
 * personne ne saisira.
 *
 * ══ CE QUE WILLIAM A DEMANDÉ LE 08/09/2026 ══
 *
 * Six points, plus quatre propositions retenues. Ils tiennent tous en une phrase : la carte doit
 * dire D'OÙ vient la tâche et permettre d'y retourner, et le bloc doit se traiter sans le quitter.
 *
 *   · une cartouche nomme l'objet d'origine, avec sa couleur — voir `STYLE_OBJET` ;
 *   · une cartouche nomme le contact, et mène à sa fiche ;
 *   · une flèche renvoie à l'objet, en surlignant la tâche dans son fil (paramètre `?tache=`) ;
 *   · dix lignes par groupe, le reste au défilement ;
 *   · le retard d'abord, puis les rendez-vous du jour — le tri vit dans `rangJournee` ;
 *   · cocher avec cinq secondes pour se rétracter, et reporter en un clic.
 *
 * LES RACCOURCIS CLAVIER ONT ÉTÉ RETIRÉS LE JOUR MÊME, à sa demande. Ils avaient été demandés le
 * matin puis jugés de trop l'après-midi : un écran de tableau de bord se parcourt à la souris, et
 * des touches qui agissent sans qu'on ait cliqué nulle part surprennent plus qu'elles ne servent.
 *
 * LES GROUPES VIDES NE S'AFFICHENT PAS. Trois cadres vides sous un compteur à zéro donnent
 * l'impression d'un écran cassé ; une seule phrase dit mieux qu'il n'y a rien à faire.
 */

/**
 * ══ UNE TEINTE PAR OBJET, ET TROIS SONT NEUVES ══
 *
 * Piste, requête et suivi de contrat portaient toutes les trois `km-green` sur le liseré de leur
 * fiche. Trois cartouches identiques n'auraient rien distingué — William, 08/09/2026, a tranché
 * pour des « teintes distinctes ». Le pétrole, l'indigo et l'olive sont définis dans `index.css`,
 * avec la raison de leur choix.
 *
 * LE BRUN DE LA RECOMMANDATION EST ÉCRIT EN DUR : c'est un accent de page (`border-[#8a4b2a]` sur
 * `RecommandationDetail`), jamais promu en jeton. Le promouvoir demanderait de reprendre la fiche,
 * ce qui n'est pas le sujet du jour ; le noter ici évite de croire à un oubli.
 */
const STYLE_OBJET: Record<GroupeJournee, { icone: typeof Target; plaque: string; cartouche: string }> = {
  PISTE: {
    icone: Filter,
    plaque: 'bg-km-piste-soft text-km-piste',
    cartouche: 'border-km-piste-line bg-km-piste-soft text-km-piste hover:bg-km-piste hover:text-white',
  },
  OPPORTUNITE: {
    icone: Target,
    plaque: 'bg-opp-50 text-opp-500',
    cartouche: 'border-opp-200 bg-opp-50 text-opp-500 hover:bg-opp-500 hover:text-white',
  },
  RECOMMANDATION: {
    icone: Sparkle,
    plaque: 'bg-[#f7f0ea] text-[#8a4b2a]',
    cartouche: 'border-[#e6d5c8] bg-[#f7f0ea] text-[#8a4b2a] hover:bg-[#8a4b2a] hover:text-white',
  },
  MANDAT: {
    icone: ShieldCheck,
    plaque: 'bg-km-amber-soft text-km-amber',
    cartouche: 'border-km-amber-line bg-km-amber-soft text-km-amber hover:bg-km-amber hover:text-white',
  },
  SUIVI_CONTRAT: {
    icone: LifeBuoy,
    plaque: 'bg-km-suivi-soft text-km-suivi',
    cartouche: 'border-km-suivi-line bg-km-suivi-soft text-km-suivi hover:bg-km-suivi hover:text-white',
  },
  REQUETE: {
    icone: Inbox,
    plaque: 'bg-km-requete-soft text-km-requete',
    cartouche: 'border-km-requete-line bg-km-requete-soft text-km-requete hover:bg-km-requete hover:text-white',
  },
  AUTRE: {
    icone: ListChecks,
    plaque: 'bg-km-soft text-km-muted',
    cartouche: 'border-km-line bg-km-soft text-km-muted',
  },
}

const TONS = {
  rouge: 'bg-km-red-soft text-km-red',
  ambre: 'bg-km-amber-soft text-km-amber',
  neutre: 'bg-km-soft text-km-muted',
} as const

/* L'ordre suit la chaîne commerciale, du plus amont au plus aval : on descend le tunnel de gauche à
   droite. Les quatre groupes d'origine s'arrêtaient à la recommandation — voir `GroupeJournee`. */
const ORDRE: GroupeJournee[] = [
  'PISTE',
  'OPPORTUNITE',
  'RECOMMANDATION',
  'MANDAT',
  'SUIVI_CONTRAT',
  'REQUETE',
  'AUTRE',
]

type Portee = 'a_faire' | 'faites' | 'tout'

/**
 * DIX LIGNES, PUIS ON DÉFILE.
 *
 * William, 08/09/2026 : « j'aimerais que ça affiche 10 tâches max mais que je puisse scroller à
 * l'intérieur pour voir les suivantes ». Fabien porte 161 tâches sur des suivis de contrat : sans
 * plafond, son bloc « Suivis de contrat » mesurerait dix mètres et repousserait tout le reste du
 * tableau de bord hors de l'écran.
 *
 * La hauteur est fixée en `rem` plutôt que calculée sur le nombre de lignes : une ligne peut faire
 * deux hauteurs selon qu'elle porte ou non des cartouches, et mesurer le DOM pour trancher coûterait
 * un rendu de plus à chaque affichage. 34 rem valent une dizaine de lignes, et le dégradé du bas dit
 * qu'il y en a d'autres.
 */
const HAUTEUR_LISTE = 'max-h-[34rem]'

export function MaJournee({
  actions,
  chargement,
  profilId,
}: {
  actions: ActionAFaire[] | undefined
  chargement: boolean
  /** Sert à expliquer un bloc vide : les tâches sont-elles ailleurs, ou nulle part ? */
  profilId?: string | null
}) {
  const { cocher, annuler, reporter, annulables, enCours } = useGestesTache()
  const reporterEnLot = useReporterEnLot()
  const [portee, setPortee] = useState<Portee>('a_faire')
  const [reportOuvert, setReportOuvert] = useState<string | null>(null)
  const [lotConfirme, setLotConfirme] = useState(false)

  const toutes = actions ?? []
  const visibles = toutes.filter((a) =>
    portee === 'a_faire' ? !a.faite : portee === 'faites' ? a.faite : true,
  )
  const nbAFaire = toutes.filter((a) => !a.faite).length
  const nbFaites = toutes.filter((a) => a.faite).length
  const enRetard = toutes.filter((a) => !a.faite && a.joursRestants != null && a.joursRestants < 0)

  const groupes = ORDRE.map((g) => ({ groupe: g, lignes: visibles.filter((a) => a.groupe === g) })).filter(
    (g) => g.lignes.length > 0,
  )

  /**
   * POURQUOI C'EST VIDE — la question que Naoëlle a dû poser deux fois, le 27/08/2026.
   *
   * UN BLOC VIDE A TROIS CAUSES QUI NE SE RESSEMBLENT PAS : aucune tâche n'existe, elles sont à
   * quelqu'un d'autre, ou personne ne les a prises. La première se règle en créant du travail, la
   * deuxième n'est pas un problème, la troisième est un oubli d'attribution. Afficher « Rien à
   * réaliser » dans les trois cas laisse chercher — et c'est exactement ce qui s'est passé.
   */
  const { data: contexte } = useContexteJournee(profilId, groupes.length === 0)

  return (
    <div className="rounded-km-lg border border-km-line bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pb-3.5 pt-4">
        <div className="mr-auto min-w-0">
          <h2 className="text-km-title font-extrabold tracking-[-0.01em] text-km-text">Ma journée</h2>
          <p className="mt-0.5 text-km-label text-km-muted">
            {chargement
              ? 'Chargement…'
              : nbAFaire === 0
                ? 'Rien à réaliser'
                : `${nbAFaire} action${nbAFaire > 1 ? 's' : ''} à réaliser, par ordre d’urgence`}
          </p>
        </div>

        {/* ══ LA PROGRESSION DU JOUR ══
            Proposition D, retenue par William le 08/09/2026. Ce n'est pas un ornement : une liste
            dit ce qui reste, une barre dit ce qui a été fait — et c'est la seule trace du travail
            accompli dans un écran qui, sinon, ne montre que la dette. Elle n'apparaît qu'une fois
            la première tâche cochée : « 0 sur 8 » au réveil est un reproche, pas une information. */}
        {nbFaites > 0 && (
          <div className="flex min-w-[9rem] flex-col gap-1">
            <span className="text-km-tiny font-bold text-km-muted">
              {nbFaites} sur {nbFaites + nbAFaire} réalisée{nbFaites + nbAFaire > 1 ? 's' : ''}
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-km-soft">
              <span
                className="block h-full rounded-full bg-km-green transition-[width] duration-500"
                style={{ width: `${Math.round((nbFaites / (nbFaites + nbAFaire)) * 100)}%` }}
              />
            </span>
          </div>
        )}

        {/* Le basculement de sa maquette. « Réalisé » ne montre que la journée écoulée : au-delà,
            ce n'est plus une journée, c'est un historique — et il a une page pour ça. */}
        <span className="flex items-center gap-0.5 rounded-km border border-km-line bg-km-soft p-0.5">
          {(
            [
              { cle: 'a_faire' as const, libelle: 'À réaliser' },
              { cle: 'faites' as const, libelle: 'Réalisé' },
              { cle: 'tout' as const, libelle: 'Tout' },
            ]
          ).map((o) => (
            <button
              key={o.cle}
              type="button"
              onClick={() => setPortee(o.cle)}
              className={cn(
                'rounded-km-sm px-2.5 py-1 text-km-label font-bold',
                portee === o.cle ? 'bg-white text-km-text shadow-km-card' : 'text-km-muted hover:text-km-text',
              )}
            >
              {o.libelle}
            </button>
          ))}
        </span>

        <Link
          to="/taches"
          className="inline-flex items-center gap-1 text-km-label font-bold text-km-green hover:underline"
        >
          Voir les tâches
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* ══ RATTRAPER LE RETARD D'UN GESTE ══
          Proposition C, retenue le 08/09/2026. Matthieu portait 49 tâches en retard ce matin : à
          cette échelle, le retard cesse d'être une liste et devient un mur qu'on contourne. Le
          seuil de trois évite de proposer un geste de masse pour deux lignes qu'on traite plus vite
          à la main. La confirmation tient sur place, sans modale : rien n'est détruit, tout est
          reportable à nouveau. */}
      {portee !== 'faites' && enRetard.length >= 3 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-km-red-line bg-km-red-soft/40 px-5 py-2.5">
          <span className="mr-auto text-km-label font-bold text-km-red">
            {enRetard.length} tâches en retard
          </span>
          {lotConfirme ? (
            <>
              <span className="text-km-label text-km-muted">Toutes les reporter à demain 9 h ?</span>
              <button
                type="button"
                disabled={reporterEnLot.isPending}
                onClick={() => {
                  const demain = new Date()
                  demain.setDate(demain.getDate() + 1)
                  demain.setHours(9, 0, 0, 0)
                  reporterEnLot.mutate({ ids: enRetard.map((a) => a.id), echeance: demain.toISOString() })
                  setLotConfirme(false)
                }}
                className="rounded-km-sm bg-km-red px-2.5 py-1 text-km-label font-bold text-white transition-colors hover:brightness-95 disabled:opacity-60"
              >
                Confirmer
              </button>
              <button
                type="button"
                onClick={() => setLotConfirme(false)}
                className="rounded-km-sm px-2 py-1 text-km-label font-semibold text-km-muted hover:text-km-text"
              >
                Annuler
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setLotConfirme(true)}
              className="inline-flex items-center gap-1.5 rounded-km-sm border border-km-red-line bg-white px-2.5 py-1 text-km-label font-bold text-km-red transition-colors hover:bg-km-red hover:text-white"
            >
              <Clock className="h-3 w-3" />
              Tout reporter à demain
            </button>
          )}
        </div>
      )}

      {groupes.length === 0 ? (
        <div className="border-t border-km-line px-5 py-5">
          <p className="text-km-body font-bold text-km-text">
            {portee === 'faites' ? 'Rien de réalisé aujourd’hui.' : 'Rien à réaliser.'}
          </p>
          {/* On dit ce qu'on sait, dans l'ordre de ce qui est actionnable. */}
          {contexte && contexte.total === 0 ? (
            <p className="mt-0.5 max-w-[70ch] text-km-label leading-relaxed text-km-muted">
              Aucune tâche n’existe encore dans Kimatch. Elles se créent depuis une piste, une
              opportunité, une recommandation ou un suivi de contrat — ou directement dans{' '}
              <Link to="/taches" className="font-bold text-km-green hover:underline">
                Tâches
              </Link>
              .
            </p>
          ) : contexte && contexte.sansResponsable > 0 ? (
            <p className="mt-0.5 max-w-[70ch] text-km-label leading-relaxed text-km-muted">
              {contexte.sansResponsable} tâche{contexte.sansResponsable > 1 ? 's' : ''} ouverte
              {contexte.sansResponsable > 1 ? 's' : ''} n’{contexte.sansResponsable > 1 ? 'ont' : 'a'} pas
              de responsable : personne ne {contexte.sansResponsable > 1 ? 'les' : 'la'} verra tant
              qu’elle{contexte.sansResponsable > 1 ? 's ne seront' : ' ne sera'} pas attribuée
              {contexte.sansResponsable > 1 ? 's' : ''}.{' '}
              <Link to="/taches" className="font-bold text-km-green hover:underline">
                Voir les tâches
              </Link>
            </p>
          ) : contexte && contexte.ailleurs > 0 ? (
            <p className="mt-0.5 max-w-[70ch] text-km-label leading-relaxed text-km-muted">
              Rien pour vous : {contexte.ailleurs} tâche{contexte.ailleurs > 1 ? 's' : ''} ouverte
              {contexte.ailleurs > 1 ? 's' : ''} {contexte.ailleurs > 1 ? 'sont' : 'est'} suivie
              {contexte.ailleurs > 1 ? 's' : ''} par d’autres commerciaux.
            </p>
          ) : (
            <p className="mt-0.5 max-w-[70ch] text-km-label leading-relaxed text-km-muted">
              Les actions arrivent ici depuis une piste, une opportunité, une recommandation ou un
              suivi de contrat — c’est là qu’elles ont un objet. Une action créée sans rattachement
              apparaît sous « Autres ».
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 border-t border-km-line p-3 lg:grid-cols-2">
          {groupes.map(({ groupe, lignes }) => {
            const style = STYLE_OBJET[groupe]
            const Icone = style.icone
            return (
              <div key={groupe} className="overflow-hidden rounded-km-lg border border-km-line">
                <div className="flex items-center gap-2.5 bg-km-soft px-3.5 py-2.5">
                  <span className={cn('flex h-7 w-7 items-center justify-center rounded-km', style.plaque)}>
                    <Icone className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </span>
                  <span className="mr-auto text-km-body font-extrabold text-km-text">
                    {LIBELLE_GROUPE[groupe]}
                  </span>
                  <span className="rounded-km bg-white px-2 py-0.5 font-mono text-km-label font-bold text-km-muted">
                    {lignes.length}
                  </span>
                </div>

                {/* Le dégradé du bas n'est pas décoratif : sans lui, une liste coupée net ressemble
                    à une liste finie, et personne ne pense à faire défiler. */}
                <div className={cn('relative', lignes.length > 10 && 'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-6 after:bg-gradient-to-t after:from-white')}>
                  <div className={cn('overflow-y-auto', HAUTEUR_LISTE)}>
                    {lignes.map((a, i) => (
                      <LigneAction
                        key={a.id}
                        action={a}
                        premiere={i === 0}
                        enCours={enCours}
                        reportOuvert={reportOuvert === a.id}
                        onCocher={() => cocher(a.id, a.titre)}
                        onBasculerReport={() => setReportOuvert((v) => (v === a.id ? null : a.id))}
                        onReporter={(r) => {
                          reporter(a.id, a.echeance, r)
                          setReportOuvert(null)
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══ LES CINQ SECONDES POUR SE RÉTRACTER ══
          Le même geste que dans le volet d'activité, et le même code — voir `useGestesTache`. Le
          bandeau vit en bas du bloc plutôt qu'à la place de la ligne : ici la ligne appartient à un
          groupe qui peut défiler, et une confirmation qu'on doit aller chercher ne confirme rien. */}
      {annulables.length > 0 && (
        <div className="space-y-1.5 border-t border-km-line px-3 py-2.5">
          {annulables.map((a) => (
            <div
              key={`annulable-${a.id}`}
              className="animate-km-fade flex items-center gap-2 rounded-km-md border border-km-green-line bg-km-green-soft px-2.5 py-1.5"
            >
              <Check className="h-3.5 w-3.5 shrink-0 text-km-green" />
              <p className="min-w-0 flex-1 truncate text-km-label text-km-text">
                <span className="font-semibold">Terminée</span> · {a.titre}
              </p>
              <button
                type="button"
                onClick={() => annuler(a.id)}
                className="flex shrink-0 items-center gap-1 rounded-km-sm px-1.5 py-0.5 text-km-tiny font-bold text-km-green transition-colors hover:bg-white"
              >
                <Undo2 className="h-3 w-3" />
                Annuler
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

/**
 * UNE LIGNE DU PLAN DE TRAVAIL.
 *
 * Deux étages : ce qu'il y a à faire, puis d'où ça vient. L'inverse — le contexte d'abord — a été
 * essayé sur le fil d'activité et abandonné : on relit trois fois « William a ajouté une note sur
 * KIWEE ENERGIE » avant d'atteindre ce qui compte.
 */
function LigneAction({
  action,
  premiere,
  enCours,
  reportOuvert,
  onCocher,
  onBasculerReport,
  onReporter,
}: {
  action: ActionAFaire
  premiere: boolean
  enCours: boolean
  reportOuvert: boolean
  onCocher: () => void
  onBasculerReport: () => void
  onReporter: (report: (typeof REPORTS)[number]) => void
}) {
  const badge = badgeAction(action)
  const style = STYLE_OBJET[action.groupe]

  return (
    <div
      className={cn(
        'group/ligne px-3.5 py-2.5 transition-colors hover:bg-km-soft/60',
        !premiere && 'border-t border-km-line',
      )}
    >
      <div className="flex items-start gap-3">
        {/* LA CASE ÉCRIT EN BASE. Elle ne se décoche pas : rouvrir une action faite se fait depuis
            le bandeau d'annulation, ou sur sa fiche, où l'on voit ce qu'on rouvre. */}
        <button
          type="button"
          disabled={action.faite || enCours}
          onClick={onCocher}
          aria-label={action.faite ? 'Action réalisée' : `Marquer « ${action.titre} » comme réalisée`}
          title={action.faite ? 'Action réalisée' : 'Marquer comme réalisée'}
          className={cn(
            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
            action.faite
              ? 'border-km-green bg-km-green text-white'
              : 'border-km-line bg-white text-transparent hover:border-km-green hover:bg-km-green-soft hover:text-km-green',
          )}
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
        </button>

        <div className="min-w-0 flex-1">
          <Link
            to={`/taches/${action.id}`}
            className={cn(
              'block truncate text-km-body font-bold hover:underline',
              action.faite ? 'text-km-faint line-through' : 'text-km-text',
            )}
          >
            {action.titre}
          </Link>

          {/* ══ LES CARTOUCHES : D'OÙ VIENT CETTE TÂCHE, ET AVEC QUI ══
              Elles portent le NOM de l'objet, pas son type. Dans un bloc « Pistes », une cartouche
              « Piste » n'apprendrait rien à personne ; « Groupe Solstice » situe le travail. */}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {action.objet && (
              <Link
                to={action.objet.chemin}
                title={`${LIBELLE_GROUPE[action.objet.groupe]} · ${action.objet.nom}`}
                className={cn(
                  'inline-flex max-w-[15rem] items-center gap-1 rounded-km-pill border px-1.5 py-0.5 text-km-tiny font-bold transition-colors',
                  style.cartouche,
                )}
              >
                <style.icone className="h-2.5 w-2.5 shrink-0" strokeWidth={2.6} />
                <span className="truncate">{action.objet.nom}</span>
              </Link>
            )}

            {action.contact ? (
              <Link
                to={`/contacts/${action.contact.id}`}
                title={action.contact.nom}
                className="inline-flex max-w-[12rem] items-center gap-1 rounded-km-pill border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-km-tiny font-bold text-km-violet transition-colors hover:bg-km-violet hover:text-white"
              >
                <User className="h-2.5 w-2.5 shrink-0" strokeWidth={2.6} />
                <span className="truncate">{action.contact.nom}</span>
              </Link>
            ) : (
              action.contexte && <span className="truncate text-km-tiny text-km-muted">{action.contexte}</span>
            )}
          </div>
        </div>

        {badge && (
          <span className={cn('mt-0.5 shrink-0 rounded-km px-2 py-0.5 text-km-label font-bold', TONS[badge.ton])}>
            {badge.texte}
          </span>
        )}

        {/* Le report et la flèche n'apparaissent qu'au survol ou sous le curseur clavier : trois
            commandes permanentes sur chaque ligne feraient un tableau de bord de boutons. */}
        {!action.faite && (
          <button
            type="button"
            onClick={onBasculerReport}
            aria-expanded={reportOuvert}
            aria-label={`Reporter « ${action.titre} »`}
            title="Reporter"
            className={cn(
              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-km-sm transition-all',
              reportOuvert
                ? 'bg-km-green-soft text-km-green opacity-100'
                : 'text-km-faint opacity-0 hover:bg-km-soft hover:text-km-text focus:opacity-100 group-hover/ligne:opacity-100',
            )}
          >
            <Clock className="h-3.5 w-3.5" />
          </button>
        )}

        {action.objet && (
          <Link
            to={action.objet.chemin}
            aria-label={`Ouvrir ${LIBELLE_GROUPE[action.objet.groupe].toLowerCase()} ${action.objet.nom}`}
            title="Ouvrir la fiche, tâche surlignée"
            className={cn(
              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-km-sm text-km-faint transition-all hover:bg-km-soft hover:text-km-text',
              'opacity-0 focus:opacity-100 group-hover/ligne:opacity-100',
            )}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {reportOuvert && (
        <div className="animate-km-fade mt-1.5 flex flex-wrap gap-1 border-t border-km-line pt-1.5">
          {REPORTS.map((r) => (
            <button
              key={r.libelle}
              type="button"
              onClick={() => onReporter(r)}
              className="rounded-km-sm border border-km-line bg-km-surface px-2 py-0.5 text-km-tiny font-semibold text-km-muted transition-colors hover:border-km-green hover:bg-km-green-soft hover:text-km-green"
            >
              {r.libelle}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
