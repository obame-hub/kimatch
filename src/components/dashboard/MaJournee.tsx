import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, CheckSquare, Diamond, FileSignature, ListChecks, Zap } from 'lucide-react'
import { useCompleteAction } from '@/lib/data/actions'
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
 * personne ne saisira. La case à cocher est d'ailleurs le seul élément de ses six maquettes qui
 * ÉCRIT quelque chose — tout le reste affiche.
 *
 * LE GROUPE « OPPORTUNITÉS » DE SA MAQUETTE EXISTE DEPUIS LE 27/08/2026 : il manquait la colonne
 * `actions.opportunite_id`, ajoutée par la migration 20260827100000.
 *
 * LES GROUPES VIDES NE S'AFFICHENT PAS. Trois cadres vides sous un compteur à zéro donnent
 * l'impression d'un écran cassé ; une seule phrase dit mieux qu'il n'y a rien à faire.
 */

const ICONES: Record<GroupeJournee, typeof Zap> = {
  SIGNAL: Zap,
  OPPORTUNITE: Diamond,
  MANDAT: FileSignature,
  RECOMMANDATION: CheckSquare,
  AUTRE: ListChecks,
}

/** Une teinte par objet, la même que sur les tuiles du tableau de bord. */
const TEINTES: Record<GroupeJournee, string> = {
  SIGNAL: 'bg-km-amber-soft text-km-amber',
  OPPORTUNITE: 'bg-opp-50 text-opp-600',
  MANDAT: 'bg-sky-50 text-km-blue',
  RECOMMANDATION: 'bg-km-green-soft text-km-green',
  AUTRE: 'bg-km-soft text-km-muted',
}

const TONS = {
  rouge: 'bg-km-red-soft text-km-red',
  ambre: 'bg-km-amber-soft text-km-amber',
  neutre: 'bg-km-soft text-km-muted',
} as const

/* L'ordre de la chaîne : signal, opportunité, mandat, recommandation. On descend le tunnel du plus
   amont au plus aval, comme sur la page 5 de sa présentation. */
const ORDRE: GroupeJournee[] = ['SIGNAL', 'OPPORTUNITE', 'MANDAT', 'RECOMMANDATION', 'AUTRE']

type Portee = 'a_faire' | 'faites' | 'tout'

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
  const navigate = useNavigate()
  const terminer = useCompleteAction()
  const [portee, setPortee] = useState<Portee>('a_faire')

  const toutes = actions ?? []
  const visibles = toutes.filter((a) =>
    portee === 'a_faire' ? !a.faite : portee === 'faites' ? a.faite : true,
  )
  const nbAFaire = toutes.filter((a) => !a.faite).length

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
   *
   * Mesuré ce matin : trois tâches dans toute la base, toutes closes, toutes à Matthieu. Le bloc
   * était donc vide pour TOUT LE MONDE, y compris pour lui. Ce n'était pas un défaut d'affichage.
   */
  const { data: contexte } = useContexteJournee(profilId, groupes.length === 0)

  return (
    <div className="rounded-kw-3xl border border-km-line bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pb-3.5 pt-4">
        <div className="mr-auto">
          <h2 className="text-kw-h2 font-extrabold tracking-[-0.01em] text-km-text">Ma journée</h2>
          <p className="mt-0.5 text-km-label text-km-muted">
            {chargement
              ? 'Chargement…'
              : nbAFaire === 0
                ? 'Rien à réaliser'
                : `${nbAFaire} action${nbAFaire > 1 ? 's' : ''} à réaliser, par ordre d’urgence`}
          </p>
        </div>

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
                portee === o.cle ? 'bg-white text-km-text shadow-kw-card' : 'text-km-muted hover:text-km-text',
              )}
            >
              {o.libelle}
            </button>
          ))}
        </span>

        <button
          type="button"
          onClick={() => navigate('/taches')}
          className="inline-flex items-center gap-1 text-km-label font-bold text-km-green hover:underline"
        >
          Voir les tâches
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {groupes.length === 0 ? (
        <div className="border-t border-km-line px-5 py-5">
          <p className="text-km-body font-bold text-km-text">
            {portee === 'faites' ? 'Rien de réalisé aujourd’hui.' : 'Rien à réaliser.'}
          </p>
          {/* On dit ce qu'on sait, dans l'ordre de ce qui est actionnable. */}
          {contexte && contexte.total === 0 ? (
            <p className="mt-0.5 max-w-[70ch] text-km-label leading-relaxed text-km-muted">
              Aucune tâche n’existe encore dans Kimatch. Elles se créent depuis la{' '}
              <button
                type="button"
                onClick={() => navigate('/signaux')}
                className="font-bold text-km-green hover:underline"
              >
                prochaine action d’un signal
              </button>
              , depuis une opportunité, un mandat ou une recommandation — ou directement dans{' '}
              <button
                type="button"
                onClick={() => navigate('/taches')}
                className="font-bold text-km-green hover:underline"
              >
                Tâches
              </button>
              .
            </p>
          ) : contexte && contexte.sansResponsable > 0 ? (
            <p className="mt-0.5 max-w-[70ch] text-km-label leading-relaxed text-km-muted">
              {contexte.sansResponsable} tâche{contexte.sansResponsable > 1 ? 's' : ''} ouverte
              {contexte.sansResponsable > 1 ? 's' : ''} n’{contexte.sansResponsable > 1 ? 'ont' : 'a'} pas
              de responsable : personne ne {contexte.sansResponsable > 1 ? 'les' : 'la'} verra tant
              qu’elle{contexte.sansResponsable > 1 ? 's ne seront' : ' ne sera'} pas attribuée
              {contexte.sansResponsable > 1 ? 's' : ''}.{' '}
              <button
                type="button"
                onClick={() => navigate('/taches')}
                className="font-bold text-km-green hover:underline"
              >
                Voir les tâches
              </button>
            </p>
          ) : contexte && contexte.ailleurs > 0 ? (
            <p className="mt-0.5 max-w-[70ch] text-km-label leading-relaxed text-km-muted">
              Rien pour vous : {contexte.ailleurs} tâche{contexte.ailleurs > 1 ? 's' : ''} ouverte
              {contexte.ailleurs > 1 ? 's' : ''} {contexte.ailleurs > 1 ? 'sont' : 'est'} suivie
              {contexte.ailleurs > 1 ? 's' : ''} par d’autres commerciaux.
            </p>
          ) : (
            <p className="mt-0.5 max-w-[70ch] text-km-label leading-relaxed text-km-muted">
              Les actions arrivent ici depuis un signal, une opportunité, un mandat ou une
              recommandation — c’est là qu’elles ont un objet. Une action créée sans rattachement
              apparaît sous « Autres ».
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 border-t border-km-line p-3 lg:grid-cols-2">
          {groupes.map(({ groupe, lignes }) => {
            const Icone = ICONES[groupe]
            return (
              <div key={groupe} className="overflow-hidden rounded-km-lg border border-km-line">
                <div className="flex items-center gap-2.5 bg-km-soft px-3.5 py-2.5">
                  <span
                    className={cn('flex h-7 w-7 items-center justify-center rounded-km', TEINTES[groupe])}
                  >
                    <Icone className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </span>
                  <span className="mr-auto text-km-body font-extrabold text-km-text">
                    {LIBELLE_GROUPE[groupe]}
                  </span>
                  <span className="rounded-km bg-white px-2 py-0.5 font-mono text-km-label font-bold text-km-muted">
                    {lignes.length}
                  </span>
                </div>

                {lignes.map((a, i) => {
                  const badge = badgeAction(a)
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        'flex items-start gap-3 px-3.5 py-2.5',
                        i > 0 && 'border-t border-km-line',
                      )}
                    >
                      {/* LA CASE ÉCRIT EN BASE. Elle ne se décoche pas : rouvrir une action faite se
                          fait sur sa fiche, où l'on voit ce qu'on rouvre. */}
                      <button
                        type="button"
                        disabled={a.faite || terminer.isPending}
                        onClick={() => terminer.mutate(a.id)}
                        title={a.faite ? 'Action réalisée' : 'Marquer comme réalisée'}
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                          a.faite
                            ? 'border-km-green bg-km-green text-white'
                            : 'border-km-line bg-white hover:border-km-green',
                        )}
                      >
                        {a.faite && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate('/taches/' + a.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span
                          className={cn(
                            'block truncate text-km-body font-bold',
                            a.faite ? 'text-km-faint line-through' : 'text-km-text',
                          )}
                        >
                          {a.titre}
                        </span>
                        {a.contexte && (
                          <span className="block truncate text-km-label text-km-muted">{a.contexte}</span>
                        )}
                      </button>

                      {badge && (
                        <span
                          className={cn(
                            'mt-0.5 shrink-0 rounded-km px-2 py-0.5 text-km-label font-bold',
                            TONS[badge.ton],
                          )}
                        >
                          {badge.texte}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
