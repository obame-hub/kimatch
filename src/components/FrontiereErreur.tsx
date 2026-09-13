import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, RotateCw, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signalerErreur } from '@/lib/signalerErreur'

/**
 * ══ L'ÉCRAN BLANC N'EST PLUS UNE FATALITÉ ══
 *
 * Audit du 13/09/2026, constat ERR-01 : une recherche sur `ErrorBoundary`, `componentDidCatch`,
 * `getDerivedStateFromError` et `errorElement` dans tout le dépôt ne renvoyait RIEN.
 *
 * ── CE QUE ÇA PRODUISAIT ──
 *
 * React 18 démonte l'arbre ENTIER quand une exception de rendu n'est rattrapée par aucune
 * frontière. Pas l'encart fautif : l'arbre entier. L'écran devient blanc, et il le reste — sans
 * message, sans bouton, sans indice. C'est la première cause des pages blanches décrites par
 * Naoëlle, devant le défaut des morceaux manquants que `chargerPage` traite déjà.
 *
 * Et le risque n'était pas théorique sur ce projet : 45 écrans, dont cinq de plus de 1 300 lignes,
 * qui affichent des données que la carte montre souvent incomplètes — échéances absentes, comptes
 * sans propriétaire, prix non renseignés. Un `compte.nom.toUpperCase()` sur un nom nul, une date
 * invalide passée à un formateur, un `.map()` sur un tableau devenu `undefined` : chacun de ces cas
 * ordinaires vidait l'écran.
 *
 * ── POURQUOI UNE CLASSE ──
 *
 * C'est le seul mécanisme que React expose pour rattraper une erreur de rendu. Il n'existe pas
 * d'équivalent en composant à fonction, et ce n'est pas un oubli de React : rattraper suppose de
 * retenir un état qui survit à l'échec du rendu.
 *
 * ── CE QU'ELLE NE RATTRAPE PAS, ET QUI EST TRAITÉ AILLEURS ──
 *
 * Les erreurs levées hors du rendu — gestionnaires d'événement, `setTimeout`, promesses rejetées —
 * ne passent jamais par une frontière. C'est `surveillerLesErreursNonRattrapees` qui les voit,
 * depuis `main.tsx`.
 */

interface Props {
  children: ReactNode
  /** Ce que la frontière protège, pour le message et pour le signalement : « la fiche compte ». */
  perimetre: string
  /** Ce qu'on affiche à la place. Par défaut, l'écran complet ci-dessous. */
  rendu?: (erreur: Error, reessayer: () => void) => ReactNode
}

interface State {
  erreur: Error | null
}

class FrontiereErreurClasse extends Component<Props & { cle: string }, State> {
  state: State = { erreur: null }

  static getDerivedStateFromError(erreur: Error): State {
    return { erreur }
  }

  componentDidCatch(erreur: Error, infos: ErrorInfo) {
    signalerErreur(erreur, {
      ou: `frontière · ${this.props.perimetre}`,
      quoi: 'rendu d’un écran',
      details: { composants: infos.componentStack },
    })
  }

  /* ══ LA FRONTIÈRE SE RÉARME QUAND ON CHANGE D'ÉCRAN ══
   *
   * Sans cela, une frontière tombée en erreur le reste : on quitterait la fiche cassée pour aller
   * ailleurs, et l'écran d'erreur suivrait. Ce serait pire que le défaut d'origine, puisqu'on ne
   * pourrait même plus naviguer pour s'en sortir.
   *
   * `cle` porte le chemin de l'adresse courante, fourni par l'enveloppe ci-dessous. */
  componentDidUpdate(precedentes: Props & { cle: string }) {
    if (this.state.erreur && precedentes.cle !== this.props.cle) {
      this.setState({ erreur: null })
    }
  }

  reessayer = () => this.setState({ erreur: null })

  render() {
    const { erreur } = this.state
    if (!erreur) return this.props.children
    if (this.props.rendu) return this.props.rendu(erreur, this.reessayer)
    return <EcranErreur erreur={erreur} perimetre={this.props.perimetre} reessayer={this.reessayer} />
  }
}

/**
 * L'enveloppe qui donne à la classe l'adresse courante.
 *
 * `useLocation` ne peut pas s'appeler dans une classe ; c'est pour cela que la frontière est en
 * deux morceaux plutôt qu'un.
 */
export function FrontiereErreur({ children, perimetre, rendu }: Props) {
  const { pathname } = useLocation()
  return (
    <FrontiereErreurClasse cle={pathname} perimetre={perimetre} rendu={rendu}>
      {children}
    </FrontiereErreurClasse>
  )
}

/**
 * ══ CE QUE VOIT LA PERSONNE ══
 *
 * Trois choses, et pas une de plus : ce qui s'est passé, ce qu'elle peut faire, et le message
 * technique pour que le signalement à l'équipe soit utile.
 *
 * LE MESSAGE TECHNIQUE EST VISIBLE, PAS CACHÉ DERRIÈRE UN REPLI. Tant que Sentry n'est pas
 * branché, c'est la seule chose qui permette de diagnostiquer : le cacher reviendrait à demander
 * à l'équipe d'ouvrir la console, ce que personne ne fait.
 */
function EcranErreur({
  erreur,
  perimetre,
  reessayer,
}: {
  erreur: Error
  perimetre: string
  reessayer: () => void
}) {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-km-amber-soft text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-km-text">
              {perimetre} n’a pas pu s’afficher
            </h2>
            <p className="mt-1 text-km-body text-km-muted">
              Le reste de Kimatch fonctionne normalement. Rien n’a été perdu&nbsp;: les données
              enregistrées avant l’incident sont en base.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-km border border-km-line bg-km-soft p-3">
          <p className="text-km-label font-semibold uppercase tracking-wide text-km-faint">
            Message technique
          </p>
          <p className="mt-1 break-words font-mono text-km-label text-km-text">{erreur.message}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={reessayer} className="gap-1.5">
            <RotateCw className="h-3.5 w-3.5" /> Réessayer
          </Button>
          {/* `reload` et non `navigate` : quand l'erreur vient d'un état devenu incohérent, seule
              une page neuve repart proprement. */}
          <Button onClick={() => window.location.reload()} className="gap-1.5">
            Recharger la page
          </Button>
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Tableau de bord
          </Button>
        </div>

        <p className="mt-4 text-km-label text-km-faint">
          Si cela se reproduit, transmettez le message technique ci-dessus&nbsp;: il dit exactement
          ce qui a échoué.
        </p>
      </div>
    </div>
  )
}
