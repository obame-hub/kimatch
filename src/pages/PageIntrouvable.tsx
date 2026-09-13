import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Compass, ArrowLeft, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * ══ L'ADRESSE QUI NE MÈNE NULLE PART LE DIT MAINTENANT ══
 *
 * Audit du 13/09/2026, constat RTG-01. `App.tsx` déclarait trente-sept routes et aucune route de
 * repli. Une adresse hors de cette liste traversait `ProtectedRoute`, montait `AppLayout`, et
 * laissait l'`Outlet` vide : barre latérale présente, en-tête présent, contenu absent. Ça
 * ressemblait exactement à une page cassée, et c'est une des formes de l'« écran blanc ».
 *
 * ── CE N'EST PAS UN CAS D'ÉCOLE ──
 *
 * Trois familles d'adresses sont sorties de la liste ces dernières semaines, et les liens vers
 * elles circulent encore : les deux routes des signaux, retirées le 02/09 alors que `Signaux.tsx`
 * et `SignalDetail.tsx` restent au dépôt ; les pages de site, retirées le 09/09 — celles-là
 * atterrissent bien, `RedirectionSite` s'en occupe ; et toute fiche dont l'objet a depuis été
 * supprimé. Sans compter les favoris posés par l'équipe et les liens dans d'anciens mails.
 *
 * ── ELLE MONTRE L'ADRESSE DEMANDÉE ──
 *
 * C'est le seul renseignement qui permette à quelqu'un de dire ce qu'il cherchait. « La page n'a
 * pas été trouvée » sans dire laquelle oblige à refaire le chemin pour le raconter.
 *
 * ── ELLE EST À L'INTÉRIEUR DE `AppLayout` ──
 *
 * Donc avec son menu et sa recherche. Une page d'erreur en pleine page, sans navigation, obligerait
 * à revenir en arrière pour repartir — alors que la recherche globale est justement le bon outil
 * quand on ne sait plus où est ce qu'on cherche.
 */
export default function PageIntrouvable() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  /* ══ PAS DE `Topbar` ICI, ET C'EST MESURÉ ══
   *
   * Cette page est importée STATIQUEMENT dans `App.tsx` — elle doit pouvoir s'afficher même quand
   * un chargement différé a échoué, ce qui est précisément une des situations où on en a besoin.
   * Tout ce qu'elle importe entre donc dans le morceau d'entrée, celui que les 2 700 chargements
   * quotidiens paient avant de voir quoi que ce soit.
   *
   * `Topbar` tire la recherche globale et le menu utilisateur : +19 Ko bruts, +5,4 Ko gzip sur le
   * chemin critique, mesuré au build. Pour une page qu'on voit une fois par mois, c'est un mauvais
   * échange. Le titre d'onglet, lui, ne coûte rien.
   *
   * La navigation reste entière : cette route est montée DANS `AppLayout`, avec sa barre latérale
   * et sa recherche. */
  useEffect(() => {
    document.title = 'Page introuvable · Kimatch'
  }, [])

  return (
    <>
      <div className="flex min-h-[55vh] items-center justify-center px-6">
        <div className="w-full max-w-lg">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-km-soft text-km-muted">
              <Compass className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-km-text">
                Cette adresse ne correspond à aucun écran
              </h2>
              <p className="mt-1 text-km-body text-km-muted">
                Elle a peut-être été retirée, ou l’objet qu’elle désignait a été supprimé. Rien n’est
                cassé&nbsp;: le reste de Kimatch fonctionne.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-km border border-km-line bg-km-soft p-3">
            <p className="text-km-label font-semibold uppercase tracking-wide text-km-faint">
              Adresse demandée
            </p>
            <p className="mt-1 break-all font-mono text-km-label text-km-text">{pathname}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => navigate('/')} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Tableau de bord
            </Button>
            {/* `-1` et non une adresse fixe : on revient d'où l'on vient, qui est presque toujours
                l'écran depuis lequel le mauvais lien a été cliqué. */}
            <Button onClick={() => navigate(-1)}>Page précédente</Button>
          </div>

          <p className="mt-4 flex items-start gap-1.5 text-km-label leading-snug text-km-faint">
            <Search className="mt-0.5 h-3 w-3 shrink-0" />
            La recherche en haut de l’écran retrouve un compte, un contact, un compteur ou une
            recommandation par son nom.
          </p>
        </div>
      </div>
    </>
  )
}
