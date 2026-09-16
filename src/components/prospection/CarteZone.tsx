import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * UNE ZONE DE LA FICHE PISTE — LE RAIL, LE JETON, LE TITRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 16/09/2026, après trois essais d'en-tête : « on combine le 2 et le 3 ».
 *
 * ══ LE RAIL DIT LA FAMILLE, LE JETON DIT L'OBJET ══
 *
 * Le trait de 3 px court sur toute la hauteur de la carte. C'est ce qui le distingue d'un bandeau
 * horizontal : quand on a fait défiler le bloc et que son en-tête est sorti de l'écran, le rail
 * continue de dire de quoi on parle. Le jeton, lui, est le carré dégradé du bandeau de la fiche,
 * repris tel quel — on reconnaît l'objet sans avoir à l'apprendre.
 *
 * ET LE TITRE PREND LA TEINTE DU RAIL. Sans ça, on lirait un trait de couleur, puis un carré de
 * couleur, puis un titre noir : trois objets au lieu d'un en-tête.
 *
 * PAS DE BANDE TEINTÉE EN PLUS. Les trois éléments portent déjà la couleur ; y ajouter un fond en
 * ferait une quatrième affirmation de la même chose, et quatre blocs empilés redeviendraient une
 * liste de barres — le défaut exact de la direction écartée.
 *
 * ══ POURQUOI DEUX TEINTES SEULEMENT ══
 *
 * Pétrole pour Contact, Société et Commentaire : ce sont trois facettes du MÊME objet, et leur
 * donner une couleur chacune dirait qu'elles sont de natures différentes. Vert pour Syndic, parce
 * que c'est le bloc qui dit si l'affaire vaut l'appel — et que dans la charte, le vert est réservé
 * aux repères importants.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function CarteZone({
  titre,
  Jeton,
  teinte = 'piste',
  aDroite,
  children,
}: {
  titre: string
  /** Le picto du jeton, dessiné en blanc sur le dégradé. */
  Jeton: (p: { taille?: number }) => ReactNode
  teinte?: 'piste' | 'vert'
  /** Cartouche ou geste aligné à droite de l'en-tête. */
  aDroite?: ReactNode
  children: ReactNode
}) {
  const vert = teinte === 'vert'
  return (
    <div
      className="rounded-km-md border border-km-line bg-km-surface"
      style={{ boxShadow: `inset 3px 0 0 0 rgb(var(${vert ? '--km-green' : '--km-piste'}))` }}
    >
      <div className="flex items-center gap-2 py-2.5 pl-4 pr-[15px]">
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-km-sm text-white',
            vert ? 'bg-gradient-to-br from-km-green to-[#12a37f]' : 'bg-gradient-to-br from-km-piste to-[#2a8598]',
          )}
        >
          <Jeton taille={14} />
        </span>
        <span className={cn('text-km-body font-extrabold tracking-[-.005em]', vert ? 'text-km-green' : 'text-km-piste')}>
          {titre}
        </span>
        {aDroite && <span className="ml-auto flex shrink-0 items-center gap-1.5">{aDroite}</span>}
      </div>
      <div className="h-px bg-km-line-soft" style={{ marginLeft: 16, marginRight: 15 }} />
      {children}
    </div>
  )
}

/**
 * Le pied des champs vides.
 *
 * ══ UN CHAMP VIDE NE RÉSERVE PLUS SA PLACE ══
 *
 * C'est le vrai problème de cette fiche, et il se lit dans les taux de remplissage : sur les
 * 4 946 pistes, la fonction est renseignée 9 fois sur 100, l'e-mail 12, le mobile 6 fois sur mille.
 * Une grille qui garde une case à chaque champ affiche donc, en moyenne, une majorité de tirets —
 * et le peu qui EST renseigné se noie dedans.
 *
 * Ils se comptent donc en pied de zone, en pastilles pointillées. Un clic les ramène dans la grille
 * au-dessus, prêts à la saisie. Rien n'est caché : ce qui manque est nommé, et se répare d'un geste.
 */
export function PiedChampsVides({
  noms,
  onOuvrir,
}: {
  noms: string[]
  onOuvrir: (nom: string) => void
}) {
  if (noms.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-2.5">
      <span className="text-km-label text-km-faint">
        {noms.length} champ{noms.length > 1 ? 's' : ''} vide{noms.length > 1 ? 's' : ''}
      </span>
      {noms.map((nom) => (
        <button
          key={nom}
          type="button"
          onClick={() => onOuvrir(nom)}
          title={`Renseigner ${nom.toLowerCase()}`}
          className="rounded-km border border-dashed border-km-line px-2 py-0.5 text-km-label font-semibold italic text-km-faint transition-colors hover:border-km-green hover:text-km-green"
        >
          {nom}
        </button>
      ))}
    </div>
  )
}
