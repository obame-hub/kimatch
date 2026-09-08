import { useId, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Input, Label } from '@/components/ui/form'
import { REPORTS, type ReportPropose } from '@/lib/data/gestesTache'
import { heureDe, instantTache } from '@/lib/heureTache'
import { cn } from '@/lib/utils'

/**
 * ══ REPORTER UNE TÂCHE : TROIS RACCOURCIS, ET UNE DATE PRÉCISE ══
 *
 * William, 08/09/2026 : « il faut avoir la possibilité, sur les tâches — que ce soit dans une
 * liste, sur la page vue d'ensemble ou dans un fil d'activité — de choisir une échéance précise, en
 * plus de demain, +1 semaine etc. »
 *
 * Les trois raccourcis couvrent le geste courant : on repousse une relance de vingt-quatre heures
 * sans y penser. Ils ne couvrent pas « le client rappelle le 23 » — et jusqu'ici, il fallait pour
 * cela ouvrir la fiche de la tâche, donc quitter l'écran où l'on travaillait.
 *
 * ── UN SEUL COMPOSANT POUR LES TROIS ÉCRANS ──
 *
 * La page Tâches, « Ma journée » et le volet d'activité proposaient — ou ne proposaient pas — le
 * report chacun de leur côté. Le panneau est ici, les trois l'affichent. Ce qui reste à chaque
 * écran, c'est OÙ il se déplie : le volet de droite vit dans un conteneur en `overflow-hidden`, une
 * infobulle flottante y serait rognée. D'où un panneau qui pousse le contenu plutôt qu'un survol.
 *
 * ── LES CHAMPS ONT LA TAILLE DES AUTRES ──
 *
 * William, 08/09/2026 : « même chose pour modifier les échéances ». Les deux champs faisaient 9 px
 * de texte dans 4 px de marge — choisir un jour dans un calendrier de cette taille demande de
 * viser. Ce sont désormais les `Input` de `components/ui/form`, 34 px de haut comme partout.
 *
 * ── L'HEURE RESTE FACULTATIVE ──
 *
 * `instantTache` fait la conversion : sans heure, l'échéance vaut minuit LOCAL, ce qui est la façon
 * dont toute l'application reconnaît « pas d'heure » (voir `heureTache.ts`). Le champ heure part
 * donc vide, et se pré-remplit seulement si la tâche en portait déjà une — reporter une tâche
 * prévue à 9 h ne doit pas lui faire perdre sa matinée.
 */
export function MenuReport({
  echeance,
  onReporterPreset,
  onReporterDate,
  className,
}: {
  /** L'échéance actuelle : elle sert de base aux raccourcis et pré-remplit les champs. */
  echeance: string | null | undefined
  onReporterPreset: (report: ReportPropose) => void
  onReporterDate: (instant: string) => void
  className?: string
}) {
  const [precise, setPrecise] = useState(false)
  // Les étiquettes ont besoin d'un identifiant unique : plusieurs cartes affichent ce panneau.
  const idChamp = useId()
  const base = echeance ? new Date(echeance) : null
  const [date, setDate] = useState(() => {
    // La date d'origine plutôt qu'aujourd'hui : on ouvre le calendrier là où la tâche en est.
    const d = base && !Number.isNaN(base.getTime()) ? base : new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [heure, setHeure] = useState(() => heureDe(echeance) ?? '')

  const instant = instantTache(date, heure || null)

  return (
    <div className={cn('animate-km-fade flex flex-wrap items-center gap-1 border-t border-km-line pt-1.5', className)}>
      {REPORTS.map((r) => (
        <button
          key={r.libelle}
          type="button"
          onClick={() => onReporterPreset(r)}
          className="rounded-km border border-km-line bg-km-surface px-2.5 py-1 text-km-label font-semibold text-km-muted transition-colors hover:border-km-green hover:bg-km-green-soft hover:text-km-green"
        >
          {r.libelle}
        </button>
      ))}

      <button
        type="button"
        onClick={() => setPrecise((v) => !v)}
        aria-expanded={precise}
        className={cn(
          'inline-flex items-center gap-1 rounded-km border px-2.5 py-1 text-km-label font-semibold transition-colors',
          precise
            ? 'border-km-green bg-km-green-soft text-km-green'
            : 'border-km-line bg-km-surface text-km-muted hover:border-km-green hover:bg-km-green-soft hover:text-km-green',
        )}
      >
        <CalendarDays className="h-3 w-3" />
        Date précise
      </button>

      {precise && (
        <div className="animate-km-fade mt-1.5 w-full space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[8rem] flex-1">
              <Label htmlFor={`report-date-${idChamp}`}>Nouvelle échéance</Label>
              <Input
                id={`report-date-${idChamp}`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="min-w-[6.5rem] flex-1">
              <Label htmlFor={`report-heure-${idChamp}`}>
                Heure <span className="font-normal text-km-faint">(facultative)</span>
              </Label>
              <Input
                id={`report-heure-${idChamp}`}
                type="time"
                value={heure}
                onChange={(e) => setHeure(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!instant}
              onClick={() => instant && onReporterDate(instant)}
              className="rounded-km bg-km-green px-3 py-1.5 text-km-label font-bold text-white transition-colors hover:brightness-95 disabled:opacity-50"
            >
              Reporter
            </button>
            {heure && (
              <button
                type="button"
                onClick={() => setHeure('')}
                title="Retirer l'heure : la tâche redevient une échéance de journée"
                className="rounded-km px-2.5 py-1.5 text-km-label font-semibold text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
              >
                sans heure
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
