import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, CheckSquare, FileSignature, ListChecks, Zap } from 'lucide-react'
import { useCompleteAction } from '@/lib/data/actions'
import { LIBELLE_GROUPE, badgeAction, type ActionAFaire, type GroupeJournee } from '@/lib/data/tableauDeBord'
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
 * LE GROUPE « OPPORTUNITÉS » DE SA MAQUETTE N'EXISTE PAS ICI, et ce n'est pas un oubli : `actions`
 * n'a aucune colonne `opportunite_id` (vérifié en base). Le groupe s'appelle « Mandats », l'objet
 * réellement rattaché — et c'est ce que montre son propre exemple, « faire avancer le mandat ».
 *
 * LES GROUPES VIDES NE S'AFFICHENT PAS. Trois cadres vides sous un compteur à zéro donnent
 * l'impression d'un écran cassé ; une seule phrase dit mieux qu'il n'y a rien à faire.
 */

const ICONES: Record<GroupeJournee, typeof Zap> = {
  SIGNAL: Zap,
  MANDAT: FileSignature,
  RECOMMANDATION: CheckSquare,
  AUTRE: ListChecks,
}

/** Une teinte par objet, la même que sur les tuiles du tableau de bord. */
const TEINTES: Record<GroupeJournee, string> = {
  SIGNAL: 'bg-kw-amber-light text-kw-amber',
  MANDAT: 'bg-sky-50 text-kw-blue',
  RECOMMANDATION: 'bg-kw-green-light text-kw-green',
  AUTRE: 'bg-kw-bloc text-kw-meta',
}

const TONS = {
  rouge: 'bg-kw-red-light text-kw-red',
  ambre: 'bg-kw-amber-light text-kw-amber-dark',
  neutre: 'bg-kw-bloc text-kw-meta',
} as const

const ORDRE: GroupeJournee[] = ['SIGNAL', 'MANDAT', 'RECOMMANDATION', 'AUTRE']

type Portee = 'a_faire' | 'faites' | 'tout'

export function MaJournee({
  actions,
  chargement,
}: {
  actions: ActionAFaire[] | undefined
  chargement: boolean
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

  return (
    <div className="rounded-kw-3xl border border-kw-border bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pb-3.5 pt-4">
        <div className="mr-auto">
          <h2 className="text-kw-h2 font-extrabold tracking-[-0.01em] text-kw-ink">Ma journée</h2>
          <p className="mt-0.5 text-kw-xs text-kw-meta">
            {chargement
              ? 'Chargement…'
              : nbAFaire === 0
                ? 'Rien à réaliser'
                : `${nbAFaire} action${nbAFaire > 1 ? 's' : ''} à réaliser, par ordre d’urgence`}
          </p>
        </div>

        {/* Le basculement de sa maquette. « Réalisé » ne montre que la journée écoulée : au-delà,
            ce n'est plus une journée, c'est un historique — et il a une page pour ça. */}
        <span className="flex items-center gap-0.5 rounded-kw-md border border-kw-border bg-kw-bloc p-0.5">
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
                'rounded-kw-sm px-2.5 py-1 text-kw-xs font-bold',
                portee === o.cle ? 'bg-white text-kw-ink shadow-kw-card' : 'text-kw-meta hover:text-kw-ink',
              )}
            >
              {o.libelle}
            </button>
          ))}
        </span>

        <button
          type="button"
          onClick={() => navigate('/taches')}
          className="inline-flex items-center gap-1 text-kw-xs font-bold text-kw-green hover:underline"
        >
          Voir les tâches
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {groupes.length === 0 ? (
        <div className="border-t border-kw-border-faint px-5 py-5">
          <p className="text-kw-sm font-bold text-kw-ink">
            {portee === 'faites' ? 'Rien de réalisé aujourd’hui.' : 'Rien à réaliser.'}
          </p>
          <p className="mt-0.5 max-w-[70ch] text-kw-xs leading-relaxed text-kw-meta">
            Les actions arrivent ici depuis un signal, un mandat ou une recommandation — c’est là
            qu’elles ont un objet. Une action créée sans rattachement apparaît sous « Autres ».
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 border-t border-kw-border-faint p-3 lg:grid-cols-2">
          {groupes.map(({ groupe, lignes }) => {
            const Icone = ICONES[groupe]
            return (
              <div key={groupe} className="overflow-hidden rounded-kw-xl border border-kw-border">
                <div className="flex items-center gap-2.5 bg-kw-bloc px-3.5 py-2.5">
                  <span
                    className={cn('flex h-7 w-7 items-center justify-center rounded-kw-md', TEINTES[groupe])}
                  >
                    <Icone className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </span>
                  <span className="mr-auto text-kw-sm font-extrabold text-kw-ink">
                    {LIBELLE_GROUPE[groupe]}
                  </span>
                  <span className="rounded-kw-md bg-white px-2 py-0.5 font-mono text-kw-micro font-bold text-kw-meta">
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
                        i > 0 && 'border-t border-kw-border-faint',
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
                            ? 'border-kw-green bg-kw-green text-white'
                            : 'border-kw-border-strong bg-white hover:border-kw-green',
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
                            'block truncate text-kw-sm font-bold',
                            a.faite ? 'text-kw-faint line-through' : 'text-kw-ink',
                          )}
                        >
                          {a.titre}
                        </span>
                        {a.contexte && (
                          <span className="block truncate text-kw-xs text-kw-meta">{a.contexte}</span>
                        )}
                      </button>

                      {badge && (
                        <span
                          className={cn(
                            'mt-0.5 shrink-0 rounded-kw-md px-2 py-0.5 text-kw-micro font-bold',
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
