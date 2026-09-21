import { Link, useLocation } from 'react-router-dom'
import { Compass } from 'lucide-react'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * UNE ADRESSE QUI N'EXISTE PAS LE DIT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Relevé le 21/09/2026 : aucune route de repli n'était déclarée. Toute adresse inconnue rendait un
 * écran ENTIÈREMENT BLANC — pas un message, pas un lien, rien. Trouvé en ouvrant `/pistes`, qui
 * semblait évident et n'existait pas : la liste vivait sous `/prospection`.
 *
 * QUI TOMBE LÀ-DESSUS. Un lien envoyé dans Slack après un renommage de route, un favori posé il y a
 * trois mois, une adresse tapée de mémoire, le bouton « précédent » après une suppression. Dans
 * tous ces cas la personne conclut que Kimatch est en panne, et le signale — ou pire, ne le signale
 * pas et contourne.
 *
 * ON MONTRE L'ADRESSE DEMANDÉE. C'est la seule information qui permet à quelqu'un de comprendre son
 * erreur (une faute de frappe se voit) et de la rapporter utilement. Une page d'erreur qui cache ce
 * qu'on a demandé oblige à redécrire de mémoire ce qu'on faisait.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export default function PageIntrouvable() {
  const { pathname } = useLocation()

  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <Compass className="h-8 w-8 text-km-faint" />
      <h1 className="mt-4 text-km-title font-bold text-km-text">Cette page n’existe pas</h1>
      <p className="mt-2 max-w-md text-km-body text-km-muted">
        L’adresse demandée ne correspond à aucun écran de Kimatch. Un lien a peut-être vieilli, ou
        la fiche a été supprimée depuis.
      </p>
      <code className="mt-3 rounded-km border border-km-line bg-km-soft px-2.5 py-1 font-mono text-km-label text-km-faint">
        {pathname}
      </code>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link
          to="/"
          className="rounded-km bg-km-green px-4 py-2 text-km-body font-bold text-white transition-opacity hover:opacity-90"
        >
          Retour à la vue d’ensemble
        </Link>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-km border border-km-line bg-white px-4 py-2 text-km-body font-bold text-km-muted transition-colors hover:text-km-text"
        >
          Page précédente
        </button>
      </div>
    </div>
  )
}
