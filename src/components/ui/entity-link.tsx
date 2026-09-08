import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * LIEN VERS UNE AUTRE FICHE — un VRAI lien, depuis le 08/09/2026.
 *
 * William : « sur tous les liens cliquables de Kimatch, quand je clique droit, on ne me propose pas
 * d'ouvrir dans un nouvel onglet ».
 *
 * ══ CE QUI SE PASSAIT ══
 *
 * Ce composant était un `<span role="link">` avec un `onClick` qui appelait `navigate()`. Il avait
 * l'apparence d'un lien — souligné, curseur en main — sans en être un. Or tout ce que le navigateur
 * offre autour d'un lien vient de l'attribut `href`, pas de l'apparence :
 *
 *   clic droit       « Ouvrir dans un nouvel onglet », « Copier l'adresse du lien »
 *   ⌘ + clic         ouvre l'onglet en arrière-plan
 *   clic molette     idem
 *   survol           l'adresse s'affiche en bas de la fenêtre
 *   lecteur d'écran  annonce la destination, et non un simple « lien » sans cible
 *
 * Les cinq manquaient d'un coup, sur les 64 liens de l'application. `role="link"` ne donne rien de
 * tout cela : ce n'est qu'une étiquette d'accessibilité posée sur un élément qui n'en est pas un.
 *
 * ══ POURQUOI `stopPropagation` RESTE, ET POURQUOI IL NE CASSE PAS ⌘ + CLIC ══
 *
 * Ces liens vivent souvent dans une ligne de tableau déjà cliquable : sans lui, cliquer le nom d'un
 * contact déclencherait AUSSI la navigation de la ligne, vers un autre écran.
 *
 * `stopPropagation` empêche le parent de réagir, mais ne touche pas au comportement du lien
 * lui-même — c'est `preventDefault` qui l'annulerait, et il n'est pas appelé. Le `Link` de React
 * Router, de son côté, laisse la main au navigateur dès qu'une touche de modification est enfoncée.
 * Le clic simple navigue donc en interne, ⌘ + clic ouvre un onglet, et la ligne parente se tait dans
 * les deux cas.
 *
 * La gestion du clavier disparaît avec le `<span>` : un `<a>` répond nativement à Entrée, et se place
 * seul dans l'ordre de tabulation.
 */
export function EntityLink({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  if (!children) return <span className="text-km-faint">—</span>
  return (
    <Link
      to={to}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'cursor-pointer text-km-text underline decoration-navy-200 underline-offset-2 hover:text-km-green hover:decoration-kiwi-400',
        className,
      )}
    >
      {children}
    </Link>
  )
}
