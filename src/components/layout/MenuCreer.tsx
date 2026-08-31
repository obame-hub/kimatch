import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OBJETS_CREABLES } from '@/lib/ouvrirCreation'

/**
 * LE BOUTON « CRÉER », SUR TOUS LES ÉCRANS.
 *
 * Naoëlle, 31/08/2026 : « je veux que dans toutes les vues tu remettes le bouton créer qui
 * permettait de créer tous les objets depuis n'importe quelle vue, c'est la seule demande qui
 * diffère des maquettes ».
 *
 * IL VIT DANS LA BARRE DU HAUT, et c'est ce qui le rend vraiment global : elle est montée par les
 * 36 écrans. Le mettre dans chaque en-tête de page aurait demandé 36 ajouts, et il aurait manqué
 * partout où quelqu'un oublie de le poser — c'est-à-dire sur le prochain écran créé.
 *
 * IL EST NEUTRE, PAS VERT. Le dossier de Michel autorise « une action principale au maximum » par
 * page, et cette action-là appartient à l'écran, pas à la barre : sur Pistes, la principale est
 * « Nouvelle piste ». Un second bouton vert en permanence dans la barre les mettrait à égalité et
 * ferait deux actions principales sur chaque page.
 *
 * ── CE QUE FAIT CHAQUE ENTRÉE ───────────────────────────────────────────────────────────────
 *
 * Elle navigue vers l'écran de l'objet avec `?creer=1`, et cet écran ouvre son propre formulaire.
 * Un menu qui porterait onze formulaires en dupliquerait onze : celui de la piste demande un
 * signal positif et un contact, celui du mandat une couverture de compteurs. Ces règles vivent
 * dans les écrans, et elles doivent y rester.
 *
 * Effet de bord voulu : on arrive sur l'écran de l'objet qu'on vient de créer, donc on le voit
 * dans sa liste.
 */
export function MenuCreer() {
  const navigate = useNavigate()
  const [ouvert, setOuvert] = useState(false)
  const conteneur = useRef<HTMLDivElement>(null)

  // Fermeture au clic à l'extérieur et à Échap. Un menu qui reste ouvert quand on clique ailleurs
  // masque le contenu qu'on essayait justement d'atteindre.
  useEffect(() => {
    if (!ouvert) return
    function surClic(e: MouseEvent) {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false)
    }
    function surTouche(e: KeyboardEvent) {
      if (e.key === 'Escape') setOuvert(false)
    }
    document.addEventListener('mousedown', surClic)
    document.addEventListener('keydown', surTouche)
    return () => {
      document.removeEventListener('mousedown', surClic)
      document.removeEventListener('keydown', surTouche)
    }
  }, [ouvert])

  return (
    <div ref={conteneur} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        aria-haspopup="menu"
        /* LE SEUL BOUTON PLEIN DE LA BARRE, ET LE SEUL VERT FRANC. Naoelle, 31/08/2026 :
           « mets le bouton creer en vert ». Il etait blanc bordé de gris, donc indistinguable des
           deux selecteurs a sa gauche — alors que c'est la seule action de la barre.
           Le vert plein est reserve a l'action positive, c'est la regle du dossier de Michel : il
           n'y en a qu'un par ecran, et c'est celui-ci. Le bouton grandit de 28 a 30 px pour tenir
           le poids de son fond. */
        className={cn(
          'inline-flex h-[30px] items-center gap-1.5 rounded-km px-3 text-km-label font-semibold text-white transition-colors',
          ouvert ? 'bg-kiwi-700' : 'bg-km-green hover:bg-kiwi-700',
        )}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
        Créer
      </button>

      {ouvert && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1.5 w-[196px] overflow-hidden rounded-km-md border border-km-line bg-km-surface py-1 shadow-km-shell"
        >
          {OBJETS_CREABLES.map((o) => (
            <button
              key={o.cle}
              type="button"
              role="menuitem"
              onClick={() => {
                setOuvert(false)
                /* `direct` : l'écran EST le formulaire (la création d'un compte est un parcours
                   en plusieurs étapes). Ajouter `?creer=1` n'y ouvrirait rien. */
                navigate('direct' in o && o.direct ? o.chemin : `${o.chemin}?creer=1`)
              }}
              className="flex w-full items-center gap-2 px-3 py-[7px] text-left text-km-body text-km-text transition-colors hover:bg-km-green-soft hover:text-km-green"
            >
              <span className="flex-1 truncate">{o.libelle}</span>
              {/* La lettre n'est pas un raccourci actif : c'est un repère de position, qui rend la
                  liste balayable sans la lire mot à mot. La promettre comme raccourci sans
                  l'implémenter serait pire que de ne rien afficher. */}
              <span className="shrink-0 font-mono text-km-micro text-km-faint">{o.touche}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
