import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Clock, Trash2, Undo2 } from 'lucide-react'
import { joursJusqua } from '@/lib/dateRelative'
import { useDeleteAction } from '@/lib/data/actions'
import { REPORTS, useGestesTache } from '@/lib/data/gestesTache'
import { useIsAdmin, useMonProfil } from '@/lib/data/roles'
import { cn } from '@/lib/utils'
import type { ActionItem } from '@/types/domain'

/**
 * LES TÂCHES OUVERTES, ÉPINGLÉES AU-DESSUS DU FIL.
 *
 * William, 07/09/2026 : « les tâches ouvertes doivent toujours apparaître en haut du volet
 * d'activité, une fois terminé la tâche se range dans l'historique d'activité. C'est un
 * comportement assez commun aux CRM. »
 *
 * ══ POURQUOI UNE SECTION À PART, ET PAS UN TRI DANS LE FIL ══
 *
 * Le fil est chronologique : il classe par date, du plus récent au plus ancien. Une tâche à échéance
 * FUTURE y remonte donc naturellement — mais une tâche EN RETARD descend dans le passé, d'autant
 * plus bas qu'elle est oubliée depuis longtemps. Mesuré le 07/09/2026 : 10 tâches ouvertes en retard,
 * enterrées exactement là où il faudrait qu'elles crient.
 *
 * Aucun tri ne répare ça, parce que ce ne sont pas deux façons de trier la même liste : le fil dit
 * CE QUI S'EST PASSÉ, cette section dit CE QUI RESTE À FAIRE. Salesforce sépare de même « Next
 * Steps » et « Past Activity », HubSpot « Upcoming » et « Activity ».
 *
 * ══ TOUTES LES TÂCHES DU DOSSIER, PAS SEULEMENT LES MIENNES ══
 *
 * Choix de William : le responsable est affiché sur la ligne. Un dossier se reprend à plusieurs chez
 * Kiwee — voir qu'un collègue porte déjà la relance évite de la faire deux fois.
 */

/** Ce que la ligne annonce, et le ton qui va avec. */
function echeanceLisible(iso: string): { texte: string; ton: 'retard' | 'aujourdhui' | 'venir' } {
  const jours = joursJusqua(iso)
  if (jours === null) return { texte: 'Sans échéance', ton: 'venir' }

  const d = new Date(iso)

  /**
   * MINUIT NE S'ÉCRIT PAS. William, 07/09/2026 : « si je n'ai pas mis l'heure, n'affiche pas
   * minuit, juste n'affiche pas l'heure du tout ».
   *
   * Le formulaire traite l'heure comme facultative depuis l'origine — « la plupart des tâches sont
   * des à-faire, pas des rendez-vous » — et une échéance sans heure vaut minuit local. L'afficher
   * annonçait un rendez-vous nocturne pour une tâche qu'on comptait simplement faire dans la
   * journée.
   */
  const sansHeure = d.getHours() === 0 && d.getMinutes() === 0
  const a = sansHeure ? '' : ` à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`

  if (jours < 0) {
    const n = Math.abs(jours)
    return { texte: n === 1 ? 'En retard d’un jour' : `En retard de ${n} jours`, ton: 'retard' }
  }
  if (jours === 0) return { texte: `Aujourd’hui${a}`, ton: 'aujourdhui' }
  if (jours === 1) return { texte: `Demain${a}`, ton: 'venir' }
  return {
    texte: `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}${a}`,
    ton: 'venir',
  }
}

const TON_ECHEANCE: Record<'retard' | 'aujourdhui' | 'venir', string> = {
  retard: 'text-km-red',
  aujourdhui: 'text-km-amber',
  venir: 'text-km-faint',
}

export function TachesOuvertes({ actions }: { actions: ActionItem[] }) {
  const { cocher, annuler, reporter, annulables, enCours } = useGestesTache()
  const supprimer = useDeleteAction()
  const { data: monProfil } = useMonProfil()
  const estAdmin = useIsAdmin()

  /**
   * QUI PEUT SUPPRIMER : son auteur, et les administrateurs.
   *
   * William, 07/09/2026 : « il faudrait la possibilité de supprimer une tâche si on a fait une
   * erreur ». Le besoin est de rattraper SA faute, d'où l'auteur ; les administrateurs gardent la
   * main sur le reste. La même règle est posée en base par la migration 20260907330000 — celle-ci
   * n'est que sa traduction à l'écran, pour ne pas montrer un bouton qui échouerait.
   */
  function peutSupprimer(action: ActionItem): boolean {
    return estAdmin || (Boolean(monProfil?.id) && action.cree_par_id === monProfil?.id)
  }

  const [reportOuvert, setReportOuvert] = useState<string | null>(null)

  /**
   * ══ ARRIVER SUR LA BONNE LIGNE, PAS SEULEMENT SUR LA BONNE FICHE ══
   *
   * William, 08/09/2026 : « je dois pouvoir être renvoyé en un clic vers la recommandation dans
   * laquelle la tâche s'affiche dans le flux d'activité ». Une fiche s'ouvre avec un fil de
   * quarante lignes ; sans repère, on relit tout pour retrouver celle d'où l'on vient.
   *
   * « Ma journée » ajoute donc `?tache=<id>` à chaque lien d'objet. La ligne défile jusque sous les
   * yeux et bat deux fois. LE PARAMÈTRE RESTE DANS L'ADRESSE une fois joué : c'est ce qui rend le
   * lien partageable — « regarde cette relance » se colle dans un message.
   */
  const [parametres] = useSearchParams()
  const cible = parametres.get('tache')
  const lignes = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    if (!cible) return
    // Un temps de battement : le volet peut encore être en train de se peindre quand la fiche
    // arrive, et `scrollIntoView` sur un élément de hauteur nulle ne va nulle part.
    const t = window.setTimeout(() => {
      lignes.current.get(cible)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 120)
    return () => window.clearTimeout(t)
  }, [cible, actions])
  /** La tâche dont on vient de demander la suppression : sa ligne demande confirmation sur place. */
  const [aConfirmer, setAConfirmer] = useState<string | null>(null)

  const ouvertes = actions
    // UNE TÂCHE ANNULÉE N'EST PAS UNE TÂCHE À FAIRE, et elle n'a pourtant pas de date de
    // réalisation — c'est le seul cas où l'absence de date ne veut pas dire « en cours ». Aucune
    // ligne ne porte ce statut aujourd'hui, mais il existe au référentiel et la page Tâches le
    // range déjà avec les terminées.
    .filter((a) => !a.date_realisation && a.statut !== 'ANNULEE')
    .sort((a, b) => {
      // L'échéance la plus proche d'abord. Une tâche sans échéance passe en dernier : elle n'est
      // pas urgente, elle est simplement mal renseignée.
      if (!a.echeance) return 1
      if (!b.echeance) return -1
      return new Date(a.echeance).getTime() - new Date(b.echeance).getTime()
    })

  if (ouvertes.length === 0 && annulables.length === 0) return null

  return (
    <div className="shrink-0 space-y-1.5 border-b border-km-line pb-2.5">
      <p className="text-km-tiny font-bold uppercase tracking-[0.08em] text-km-faint">À faire</p>

      {ouvertes.map((action) => {
        const echeance = echeanceLisible(action.echeance)
        const enRetard = echeance.ton === 'retard'
        return (
          <div
            key={action.id}
            ref={(el) => {
              if (el) lignes.current.set(action.id, el)
              else lignes.current.delete(action.id)
            }}
            className={cn(
              'rounded-km-md border px-2 py-1.5 transition-colors',
              enRetard ? 'border-km-red/25 bg-km-red-soft/40' : 'border-km-line bg-km-surface',
              cible === action.id && 'animate-km-surligne',
            )}
          >
            <div className="flex items-start gap-2">
              {/* LA CASE EST UN VRAI BOUTON, pas une `<input type=checkbox>` : elle doit porter le
                  nom de la tâche pour un lecteur d'écran, et la coche dessinée suit nos jetons. */}
              <button
                type="button"
                onClick={() => cocher(action.id, action.titre)}
                disabled={enCours}
                aria-label={`Marquer « ${action.titre} » comme terminée`}
                className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-km-line bg-white text-transparent transition-colors hover:border-km-green hover:bg-km-green-soft hover:text-km-green disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-km-label font-semibold text-km-text">{action.titre}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-km-tiny">
                  <span className={cn('font-semibold', TON_ECHEANCE[echeance.ton])}>{echeance.texte}</span>
                  {action.responsable && (
                    <>
                      <span className="text-km-line" aria-hidden="true">·</span>
                      <span className="truncate text-km-faint">{action.responsable}</span>
                    </>
                  )}
                </p>
              </div>

              {peutSupprimer(action) && (
                <button
                  type="button"
                  onClick={() => {
                    setAConfirmer((v) => (v === action.id ? null : action.id))
                    setReportOuvert(null)
                  }}
                  aria-label={`Supprimer « ${action.titre} »`}
                  title="Supprimer"
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-km-sm transition-colors',
                    aConfirmer === action.id
                      ? 'bg-km-red-soft text-km-red'
                      : 'text-km-faint hover:bg-km-red-soft hover:text-km-red',
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setReportOuvert((v) => (v === action.id ? null : action.id))
                  setAConfirmer(null)
                }}
                aria-expanded={reportOuvert === action.id}
                aria-label={`Reporter « ${action.titre} »`}
                title="Reporter"
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-km-sm transition-colors',
                  reportOuvert === action.id
                    ? 'bg-km-green-soft text-km-green'
                    : 'text-km-faint hover:bg-km-soft hover:text-km-text',
                )}
              >
                <Clock className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* ══ LA CONFIRMATION TIENT SUR LA LIGNE ══
                Pas de fenêtre modale : la suppression est RÉVERSIBLE — le déclencheur
                `trg_journaliser_suppression` garde la ligne entière et la corbeille sait la
                restaurer. Une modale plein écran pour un geste rattrapable coûte plus d'attention
                qu'elle n'en protège. Deux temps suffisent à écarter le clic involontaire. */}
            {aConfirmer === action.id && (
              <div className="animate-km-fade mt-1.5 flex flex-wrap items-center gap-2 border-t border-km-line pt-1.5">
                <span className="text-km-tiny text-km-muted">Supprimer cette tâche ?</span>
                <button
                  type="button"
                  onClick={() => {
                    supprimer.mutate(action.id)
                    setAConfirmer(null)
                  }}
                  className="rounded-km-sm bg-km-red-soft px-2 py-0.5 text-km-tiny font-bold text-km-red transition-colors hover:bg-km-red hover:text-white"
                >
                  Supprimer
                </button>
                <button
                  type="button"
                  onClick={() => setAConfirmer(null)}
                  className="rounded-km-sm px-2 py-0.5 text-km-tiny font-semibold text-km-muted transition-colors hover:bg-km-soft hover:text-km-text"
                >
                  Annuler
                </button>
              </div>
            )}

            {reportOuvert === action.id && (
              <div className="animate-km-fade mt-1.5 flex flex-wrap gap-1 border-t border-km-line pt-1.5">
                {REPORTS.map((r) => (
                  <button
                    key={r.libelle}
                    type="button"
                    onClick={() => {
                      reporter(action.id, action.echeance, r)
                      setReportOuvert(null)
                    }}
                    className="rounded-km-sm border border-km-line bg-km-surface px-2 py-0.5 text-km-tiny font-semibold text-km-muted transition-colors hover:border-km-green hover:bg-km-green-soft hover:text-km-green"
                  >
                    {r.libelle}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* ══ LES CINQ SECONDES POUR SE RÉTRACTER ══
          La ligne cochée ne disparaît pas d'un coup : elle se change en confirmation, à sa place,
          avec le geste inverse à portée. Sans ça, un clic malheureux obligeait à quitter la fiche
          pour aller rouvrir la tâche depuis la page Tâches. */}
      {annulables.map((a) => (
        <div
          key={`annulable-${a.id}`}
          className="animate-km-fade flex items-center gap-2 rounded-km-md border border-km-green-line bg-km-green-soft px-2 py-1.5"
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
  )
}
