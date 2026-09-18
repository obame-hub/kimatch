import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pencil, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ══════════ TOUT RATTACHEMENT SE CHANGE, LÀ OÙ IL S'AFFICHE ══════════
 *
 * William, 18/09/2026 : « partout sur Kimatch, les rattachements doivent avoir la possibilité
 * d'être changés, c'est très important donc prends-le en compte aussi pour le futur, il faut
 * toujours avoir cette fonctionnalité. »
 *
 * C'était sa troisième demande du même ordre en quatre jours — le compte d'un compteur le 15/09,
 * le propriétaire d'une piste le 16/09, le contact signataire d'une recommandation le 18. Trois
 * fois la même correction sur trois écrans différents : ce n'est plus un cas, c'est une règle, et
 * une règle mérite un composant plutôt qu'une bonne intention répétée.
 *
 * POURQUOI ELLE COMPTE : le portefeuille bouge en permanence. Une société change de syndic, un
 * interlocuteur quitte son poste, un compteur passe d'un compte à l'autre. Un rattachement posé à
 * la création et jamais modifiable oblige à supprimer et recréer l'enregistrement — donc à perdre
 * son historique, ses documents et ses tâches.
 *
 * LE GESTE APPARAÎT AU SURVOL, jamais en permanence. Un rattachement se lit cent fois pour se
 * changer une : un bouton visible en continu ferait de chaque ligne d'identité un formulaire. Il
 * reste atteignable au clavier — `focus-within` le montre aussi — parce qu'un geste qui n'existe
 * qu'à la souris n'existe pas pour tout le monde.
 *
 * LA CRÉATION À LA VOLÉE N'EST PAS REPRISE de la maquette. Créer un contact demande au minimum un
 * nom, un prénom et un compte ; un contact né d'un mot tapé dans une barre de recherche est un
 * doublon de plus dans une table qui en compte 3 380. Le lien se fait vers un enregistrement qui
 * existe — `onCreer` ouvre le vrai formulaire quand l'écran appelant en propose un.
 */
export function RattachementModifiable({
  children,
  options,
  valeurId,
  onChoisir,
  placeholder,
  legende,
  desactive,
  libelleBouton = 'changer',
  onCreer,
  libelleCreer,
  className,
}: {
  /** La ligne d'identité telle qu'elle se lit — nom, pastille, lien vers la fiche. */
  children: ReactNode
  options: { id: string; libelle: string; sousLibelle?: string | null }[]
  /** Ce qui est rattaché aujourd'hui : il reste en tête de liste, marqué « actuel ». */
  valeurId: string | null
  onChoisir: (id: string) => void
  placeholder: string
  /** Où l'on cherche, dit en clair sous la saisie (« contacts de CABINET MOLINIER »). */
  legende?: string
  desactive?: boolean
  libelleBouton?: string
  onCreer?: () => void
  libelleCreer?: string
  className?: string
}) {
  const [ouvert, setOuvert] = useState(false)
  const [recherche, setRecherche] = useState('')
  const boite = useRef<HTMLDivElement>(null)

  /* Refermer au clic dehors et à Échap. Sans ça, ouvrir un second sélecteur en laisse un premier
     béant derrière lui, et les deux listes se recouvrent. */
  useEffect(() => {
    if (!ouvert) return
    function dehors(e: MouseEvent) {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false)
    }
    function echap(e: KeyboardEvent) {
      if (e.key === 'Escape') setOuvert(false)
    }
    document.addEventListener('mousedown', dehors)
    document.addEventListener('keydown', echap)
    return () => {
      document.removeEventListener('mousedown', dehors)
      document.removeEventListener('keydown', echap)
    }
  }, [ouvert])

  const terme = recherche.trim().toLowerCase()
  const filtrees = options
    .filter((o) => !terme || `${o.libelle} ${o.sousLibelle ?? ''}`.toLowerCase().includes(terme))
    /* L'ACTUEL EN TÊTE : on doit pouvoir ouvrir la liste, regarder, et refermer sans rien
       changer. S'il se perdait au milieu des autres, le sélecteur inviterait à cliquer ailleurs. */
    .sort((a, b) => (a.id === valeurId ? -1 : b.id === valeurId ? 1 : 0))
    .slice(0, 6)

  return (
    <div ref={boite} className={cn('group/rattach relative', className)}>
      {children}

      {!desactive && (
        <button
          type="button"
          onClick={() => { setOuvert((v) => !v); setRecherche('') }}
          className={cn(
            'absolute right-[3px] top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-km-sm border border-km-line bg-white px-[7px] py-[2px] text-km-label font-bold text-km-muted transition-opacity',
            'hover:border-km-green-line hover:bg-km-green-soft hover:text-km-green',
            'focus-visible:opacity-100 group-focus-within/rattach:opacity-100 group-hover/rattach:opacity-100',
            ouvert ? 'border-km-green-line bg-km-green-soft text-km-green opacity-100' : 'opacity-0',
          )}
        >
          <Pencil className="h-[11px] w-[11px]" />
          {libelleBouton}
        </button>
      )}

      {ouvert && (
        <div className="absolute inset-x-0 top-full z-30 mt-[7px] animate-km-hub-pop overflow-hidden rounded-km-md border border-km-green-line bg-white shadow-km-pop">
          <div className="flex items-center gap-[7px] border-b border-km-line-soft px-2.5 py-[7px]">
            <Search className="h-[11px] w-[11px] shrink-0 text-km-faint" />
            <input
              autoFocus
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={placeholder}
              className="min-w-0 flex-1 border-0 bg-transparent text-km-body text-km-text outline-none placeholder:text-km-faint"
            />
            {legende && <span className="shrink-0 text-km-tiny text-km-faint">{legende}</span>}
          </div>
          {filtrees.length === 0 ? (
            <p className="px-2.5 py-2 text-km-body text-km-faint">Aucun résultat.</p>
          ) : (
            filtrees.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChoisir(o.id); setOuvert(false); setRecherche('') }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-km-green-soft"
              >
                <span className="min-w-0 flex-1 truncate text-km-body font-semibold text-km-text">
                  {o.libelle}
                  {o.sousLibelle && <span className="font-normal text-km-faint"> · {o.sousLibelle}</span>}
                </span>
                {o.id === valeurId && (
                  <span className="shrink-0 rounded-km-pill bg-km-green-soft px-[7px] py-px text-km-tiny font-extrabold text-km-green">
                    actuel
                  </span>
                )}
              </button>
            ))
          )}
          {onCreer && (
            <button
              type="button"
              onClick={() => { setOuvert(false); onCreer() }}
              className="flex w-full items-center gap-2 border-t border-km-line-soft px-2.5 py-1.5 text-left text-km-body text-km-muted hover:bg-km-bg"
            >
              {libelleCreer ?? 'Créer…'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
