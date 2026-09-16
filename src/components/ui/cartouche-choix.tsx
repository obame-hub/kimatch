import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * UNE CARTOUCHE QUI SE CHOISIT — LA MÊME ÉTIQUETTE, EN LECTURE ET EN ÉCRITURE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 16/09/2026 : « ajoute une cartouche avec l'origine. Cette cartouche doit être cliquable
 * et modifiable au clic. »
 *
 * ══ POURQUOI PAS `InlineField variant="select"` ══
 *
 * Il existe, il marche, et il est utilisé partout dans les volets. Mais il dessine un CHAMP : un
 * intitulé au-dessus, une valeur soulignée en dessous, la hauteur d'une ligne de formulaire. Dans
 * une ligne d'identité où tout fait 24 px de haut, il casse l'alignement et annonce « ici on
 * saisit » à l'endroit où l'on résume.
 *
 * Celui-ci garde la forme de la cartouche voisine — même rayon, même hauteur, même police — et n'en
 * diffère que par un chevron de 10 px. On lit une étiquette ; on découvre qu'elle s'ouvre en
 * passant dessus.
 *
 * ══ L'ÉTAT NON RENSEIGNÉ EST UNE CARTOUCHE, PAS UN VIDE ══
 *
 * 135 pistes n'ont pas d'origine. Ne rien afficher les rendrait indiscernables de celles qui en ont
 * une — et surtout, il n'y aurait rien à cliquer pour la renseigner. La cartouche s'affiche donc
 * toujours, en gris et en italique quand la valeur manque : c'est le seul endroit d'où l'on peut
 * réparer un manque qu'on voit.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function CartoucheChoix({
  valeur,
  options,
  onChoisir,
  peutModifier,
  titre,
  vide = 'non renseignée',
  teinte = 'neutre',
}: {
  /** La valeur affichée, `null` quand elle manque. */
  valeur: string | null
  /** Les choix proposés, dans l'ordre où ils doivent être lus. */
  options: string[]
  onChoisir: (valeur: string | null) => void | Promise<void>
  peutModifier: boolean
  /** L'infobulle — dit de quoi cette étiquette parle, puisqu'elle ne porte pas son intitulé. */
  titre: string
  vide?: string
  teinte?: 'neutre' | 'piste' | 'bleu'
}) {
  const [ouvert, setOuvert] = useState(false)
  const zone = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ouvert) return
    const auClic = (e: MouseEvent) => {
      if (zone.current && !zone.current.contains(e.target as Node)) setOuvert(false)
    }
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('mousedown', auClic)
    document.addEventListener('keydown', auClavier)
    return () => {
      document.removeEventListener('mousedown', auClic)
      document.removeEventListener('keydown', auClavier)
    }
  }, [ouvert])

  /* LA VALEUR INCONNUE RESTE DANS LA LISTE. Une piste peut porter une origine qui n'est pas (encore)
     au référentiel — l'import Salesforce n'en sait rien. La masquer donnerait une liste où rien
     n'est coché, et un clic malheureux effacerait une valeur juste. */
  const choix = valeur && !options.includes(valeur) ? [valeur, ...options] : options

  const pastille = cn(
    'inline-flex max-w-[15rem] items-center gap-1 rounded-km px-2 py-0.5 text-km-label font-semibold transition-colors',
    valeur
      ? teinte === 'piste'
        ? 'bg-km-piste-soft text-km-piste'
        : teinte === 'bleu'
          ? 'bg-km-blue-soft text-km-blue'
          : 'bg-km-soft text-km-muted'
      : 'bg-km-soft italic text-km-faint',
    peutModifier && 'hover:brightness-95',
  )

  if (!peutModifier) {
    return (
      <span className={pastille} title={titre}>
        <span className="truncate">{valeur ?? vide}</span>
      </span>
    )
  }

  return (
    <div className="relative shrink-0" ref={zone}>
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        title={`${titre} — cliquer pour modifier`}
        className={pastille}
      >
        <span className="truncate">{valeur ?? vide}</span>
        <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
      </button>

      {ouvert && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-72 overflow-y-auto rounded-km-md border border-km-line bg-km-surface py-1 shadow-km-pop">
          <button
            type="button"
            onClick={() => { setOuvert(false); void onChoisir(null) }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-km-name italic text-km-faint hover:bg-km-soft"
          >
            <span className="w-3 shrink-0">{valeur === null && <Check className="h-3 w-3 text-km-green" />}</span>
            {vide}
          </button>
          {choix.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => { setOuvert(false); void onChoisir(o) }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-km-name text-km-muted hover:bg-km-soft"
            >
              <span className="w-3 shrink-0">{o === valeur && <Check className="h-3 w-3 text-km-green" />}</span>
              <span className="min-w-0 flex-1">{o}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
