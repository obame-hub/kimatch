import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useBasculerJalon, useJalonsSuivi, type Jalon } from '@/lib/data/jalonsSuivi'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI A ÉTÉ FAIT SUR CE DOSSIER
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 25/09/2026 : « j'aimerais ajouter un composant check-list […] ce sera à Fabien de cocher
 * à la main les étapes qu'il a faites. Ce sera utile par la suite pour faire évoluer le chemin du
 * suivi de contrat. »
 *
 * ══ L'AVANCEMENT NE COMPTE QUE CE QUI EST DÛ ══
 *
 * Trois des sept jalons sont optionnels — cross-sell, bilan annuel, anticipation. Les compter dans
 * le total afficherait « 4/7 » sur un dossier pourtant complet, et un dossier qui n'a rien à se
 * reprocher n'a pas à ressembler à un dossier en retard. Ils restent cochables : ils sont simplement
 * hors du compte, et marqués comme tels.
 *
 * ══ LA DATE EST L'INFORMATION, PAS LA COCHE ══
 *
 * C'est elle qui servira à « faire évoluer le chemin » : savoir QUAND le mail de bienvenue part par
 * rapport à l'activation, c'est ce qui dira si l'étape mérite d'entrer dans la frise. Elle
 * s'affiche donc à côté de chaque jalon fait, et pas seulement au survol.
 */
export function CheckListSuivi({ suiviId, peutModifier }: { suiviId: string; peutModifier: boolean }) {
  const { data: jalons, isLoading } = useJalonsSuivi(suiviId)
  const basculer = useBasculerJalon()
  const piste = useRef<HTMLDivElement>(null)
  const [reste, setReste] = useState({ gauche: false, droite: false })

  const dus = (jalons ?? []).filter((j) => !j.optionnel)
  const faitsDus = dus.filter((j) => j.fait_le).length

  /* ══ LE DÉGRADÉ N'APPARAÎT QUE S'IL Y A VRAIMENT QUELQUE CHOSE À VOIR ══
     Un voile permanent sur le bord droit promettrait du contenu même quand la rangée tient en
     entier — et sur un grand écran, elle tient. On mesure donc le débordement réel, et on le
     remesure quand la fenêtre change ou qu'un jalon se coche (le libellé « Fait le… » ne change
     pas la largeur, mais un jalon ajouté en référence, si). */
  const mesurer = useCallback(() => {
    const el = piste.current
    if (!el) return
    const marge = 4 // quelques pixels de tolérance : un arrondi de rendu ne vaut pas un débordement
    setReste({
      gauche: el.scrollLeft > marge,
      droite: el.scrollLeft + el.clientWidth < el.scrollWidth - marge,
    })
  }, [])

  useEffect(() => {
    mesurer()
    window.addEventListener('resize', mesurer)
    return () => window.removeEventListener('resize', mesurer)
  }, [mesurer, jalons])

  function glisser(sens: -1 | 1) {
    piste.current?.scrollBy({ left: sens * 240, behavior: 'smooth' })
  }

  return (
    <section className="rounded-km-md border border-km-line bg-km-surface px-3.5 py-2">
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
          Ce qui a été fait
        </span>
        {dus.length > 0 && (
          <span
            className={cn(
              'shrink-0 rounded-km-sm px-1.5 py-px text-km-micro font-bold',
              faitsDus === dus.length ? 'bg-km-green-soft text-km-green' : 'bg-km-soft text-km-muted',
            )}
            title="Les jalons optionnels ne sont pas comptés dans l’avancement."
          >
            {faitsDus}/{dus.length}
          </span>
        )}

        {isLoading ? (
          <span className="flex items-center gap-1.5 text-km-body text-km-faint">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lecture…
          </span>
        ) : (
          /* ══ UNE SEULE LIGNE, QUI GLISSE ══
             William, 25/09/2026 : « j'aimerais que tout tienne sur une ligne […] peut-être un
             slider avec un élément graphique permettant de comprendre qu'on peut slide ? »

             `flex-nowrap` force la ligne unique ; le débordement glisse au doigt, au trackpad, et
             par les deux boutons. Les dégradés aux extrémités sont l'élément graphique demandé :
             un libellé coupé net sous un voile se lit comme « ça continue », là qu'un bord franc
             se lit comme une fin. */
          <div className="relative min-w-0 flex-1">
            <div
              ref={piste}
              onScroll={mesurer}
              className="flex flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {(jalons ?? []).map((j, i) => (
                <PastilleJalon
                  key={j.id}
                  numero={i + 1}
                  jalon={j}
                  peutModifier={peutModifier && !basculer.isPending}
                  onBasculer={() => basculer.mutate({ suiviId, jalonId: j.id, fait: !j.fait_le })}
                />
              ))}
            </div>

            {reste.gauche && (
              <>
                <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-km-surface to-transparent" />
                <button
                  type="button"
                  onClick={() => glisser(-1)}
                  aria-label="Voir les jalons précédents"
                  className="absolute left-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-km-line bg-km-surface text-km-muted shadow-km-pop transition-colors hover:border-km-green hover:text-km-green"
                >
                  <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
              </>
            )}
            {reste.droite && (
              <>
                <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-km-surface to-transparent" />
                <button
                  type="button"
                  onClick={() => glisser(1)}
                  aria-label="Voir les jalons suivants"
                  className="absolute right-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-km-line bg-km-surface text-km-muted shadow-km-pop transition-colors hover:border-km-green hover:text-km-green"
                >
                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {basculer.isError && (
        <p className="mt-1.5 text-km-label text-km-red">
          {basculer.error instanceof Error ? basculer.error.message : 'La case n’a pas pu être enregistrée.'}
        </p>
      )}
    </section>
  )
}

/**
 * ══ LE NUMÉRO DIT LE SENS DE LECTURE, LA PASTILLE GARDE SON INDÉPENDANCE ══
 *
 * William, 25/09/2026 : « ordre plus clair (là, difficile de savoir le sens de lecture) », suivi de
 * la liste numérotée de 1 à 7.
 *
 * Le numéro répond exactement à ça — il dit dans quel ordre ces gestes se font NORMALEMENT — sans
 * pour autant les enchaîner : cocher le 4 n'a jamais coché le 3. C'est ce qui distingue une liste
 * ordonnée d'une frise, et c'est ce qui permettra d'observer les dossiers où l'ordre n'est pas
 * respecté, plutôt que de le leur imposer.
 *
 * IL CÈDE LA PLACE À LA COCHE une fois le jalon fait : le numéro sert à s'orienter dans ce qui
 * reste, la coche à voir ce qui est acquis. Les deux au même endroit, jamais en même temps.
 */
function PastilleJalon({ numero, jalon, peutModifier, onBasculer }: {
  numero: number
  jalon: Jalon
  peutModifier: boolean
  onBasculer: () => void
}) {
  const fait = Boolean(jalon.fait_le)
  const quand = jalon.fait_le ? new Date(jalon.fait_le).toLocaleDateString('fr-FR') : null

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={fait}
      aria-label={`${numero}. ${jalon.libelle}${jalon.optionnel ? ' (optionnel)' : ''}`}
      disabled={!peutModifier}
      onClick={onBasculer}
      title={
        fait
          ? `Fait le ${quand}${jalon.fait_par ? ` par ${jalon.fait_par}` : ''} — cliquer pour décocher`
          : jalon.optionnel
            ? 'Optionnel — cliquer si vous l’avez fait'
            : 'Cliquer si vous l’avez fait'
      }
      className={cn(
        'inline-flex min-h-[30px] shrink-0 items-center gap-1.5 rounded-km-pill border py-1 pl-1 pr-2.5 text-km-label transition-colors',
        fait
          ? 'border-km-green bg-km-green-soft font-bold text-km-green'
          : 'border-km-line bg-km-surface font-medium text-km-muted',
        peutModifier && !fait && 'hover:border-km-green hover:text-km-green',
        peutModifier && fait && 'hover:bg-km-green hover:text-white',
        !peutModifier && 'cursor-default',
      )}
    >
      <span
        className={cn(
          'flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full text-km-micro font-bold',
          fait ? 'bg-km-green text-white' : 'bg-km-soft text-km-muted',
        )}
      >
        {fait ? <Check className="h-[10px] w-[10px]" strokeWidth={3.5} /> : numero}
      </span>
      <span className="whitespace-nowrap">{jalon.libelle}</span>
      {/* L'ASTÉRISQUE DIT « OPTIONNEL » SANS PRENDRE DE PLACE. En toutes lettres, le mot doublait
          la largeur de trois pastilles sur sept ; l'infobulle et `aria-label` le disent en entier. */}
      {jalon.optionnel && <span className="shrink-0 text-km-faint">*</span>}
    </button>
  )
}
