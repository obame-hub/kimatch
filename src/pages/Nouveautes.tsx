import { lazy, Suspense, useMemo, useState } from 'react'
import { Megaphone, Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { MenuChoix } from '@/components/ui/menu-choix'
import { FiltrePeriode, PERIODE_VIDE, type Periode } from '@/components/ui/filtre-periode'
import { CartePublication } from '@/components/nouveautes/CartePublication'
import { useListControls } from '@/lib/useListControls'
import { dateRelative } from '@/lib/dateRelative'
import { useIsAdmin } from '@/lib/data/roles'
import { usePublications, useSupprimerPublication, type Publication } from '@/lib/data/publications'

/**
 * L'HISTORIQUE COMPLET DES NOUVEAUTÉS.
 *
 * La popup ne montre que ce qu'on n'a pas lu ; cette page montre tout, et c'est ici qu'on revient
 * chercher « c'était quoi déjà, le changement sur les mandats en août ? ». D'où la recherche et les
 * trois filtres, qui n'auraient aucun sens dans une fenêtre de rattrapage.
 *
 * LA FRISE PLUTÔT QU'UNE LISTE DE CARTES : les publications se lisent dans le temps, et la colonne
 * de dates à gauche donne l'échelle d'un coup d'œil — trois publications en une semaine puis rien
 * pendant deux mois, ça se voit sans lire un mot.
 */

/**
 * L'ÉDITEUR NE SE TÉLÉCHARGE QU'AU MOMENT D'ÉCRIRE.
 *
 * TipTap et ses extensions pèsent 490 ko : sept des treize personnes ne publieront jamais, et
 * l'immense majorité des visites de cette page servent à LIRE. Le différer garde la page à sa
 * taille, et n'ajoute une attente que là où l'on s'apprête de toute façon à rédiger.
 */
const DialogPublication = lazy(() =>
  import('@/components/nouveautes/DialogPublication').then((m) => ({ default: m.DialogPublication })),
)

/** Le texte d'une publication, balises retirées, pour que la recherche porte aussi sur le corps. */
function texteBrut(html: string): string {
  if (!html) return ''
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
}

/** La date qui fait foi pour trier et filtrer : celle de parution, ou celle de rédaction si brouillon. */
function dateUtile(p: Publication): string {
  return p.date_publication ?? p.date_creation
}

export default function Nouveautes() {
  const isAdmin = useIsAdmin()
  const { data: publications } = usePublications()
  const supprimer = useSupprimerPublication()

  const [categorie, setCategorie] = useState('')
  const [auteur, setAuteur] = useState('')
  const [periode, setPeriode] = useState<Periode>(PERIODE_VIDE)
  const [edition, setEdition] = useState<{ ouvert: boolean; publication: Publication | null }>({
    ouvert: false,
    publication: null,
  })
  const [aSupprimer, setASupprimer] = useState<Publication | null>(null)

  const categories = useMemo(() => {
    const vues = new Map<string, string>()
    ;(publications ?? []).forEach((p) => {
      if (p.type_code) vues.set(p.type_code, p.type_libelle)
    })
    return [...vues.entries()].map(([valeur, libelle]) => ({ valeur, libelle }))
  }, [publications])

  const auteurs = useMemo(() => {
    const vus = new Map<string, string>()
    ;(publications ?? []).forEach((p) => {
      if (p.auteur) vus.set(p.auteur.id, `${p.auteur.prenom} ${p.auteur.nom}`.trim())
    })
    return [...vus.entries()].map(([valeur, libelle]) => ({ valeur, libelle }))
  }, [publications])

  // Catégorie, auteur et période s'appliquent AVANT la recherche : le compteur de la barre doit
  // annoncer ce qui est réellement affiché, pas ce qui reste après le seul mot cherché.
  const filtrees = useMemo(() => {
    return (publications ?? []).filter((p) => {
      if (categorie && p.type_code !== categorie) return false
      if (auteur && p.auteur?.id !== auteur) return false
      if (periode.min || periode.max) {
        const jour = dateUtile(p).slice(0, 10)
        if (periode.min && jour < periode.min) return false
        if (periode.max && jour > periode.max) return false
      }
      return true
    })
  }, [publications, categorie, auteur, periode])

  const { query, setQuery, items } = useListControls(filtrees, {
    searchFields: (p) => [p.titre, p.type_libelle, texteBrut(p.contenu_html), p.auteur ? `${p.auteur.prenom} ${p.auteur.nom}` : ''],
    sorters: {
      date: (a, b) => new Date(dateUtile(b)).getTime() - new Date(dateUtile(a)).getTime(),
    },
    defaultSort: 'date',
  })

  const liste = items ?? []

  return (
    <div>
      <Topbar title="Nouveautés" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Nouveautés"
          description="Tout ce qui a changé dans Kimatch, de la plus récente à la plus ancienne."
          actions={
            isAdmin ? (
              <Button
                variant="primary"
                onClick={() => setEdition({ ouvert: true, publication: null })}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvelle publication
              </Button>
            ) : undefined
          }
        />

        <ListToolbar
          query={query}
          onQueryChange={setQuery}
          placeholder="Rechercher dans les nouveautés…"
          count={liste.length}
          secondaryRow={
            <>
              <MenuChoix
                ariaLabel="Catégorie"
                valeur={categorie}
                onChange={setCategorie}
                choix={[{ valeur: '', libelle: 'Toutes les catégories' }, ...categories]}
              />
              <MenuChoix
                ariaLabel="Auteur"
                valeur={auteur}
                onChange={setAuteur}
                choix={[{ valeur: '', libelle: 'Tous les auteurs' }, ...auteurs]}
              />
              <FiltrePeriode libelle="Publication" valeur={periode} onChange={setPeriode} />
            </>
          }
        />

        {liste.length === 0 ? (
          <div className="rounded-km-md border border-km-line bg-km-surface py-14 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-km-soft">
              <Megaphone className="h-5 w-5 text-km-faint" />
            </span>
            <p className="mt-3 text-km-body font-semibold text-km-text">Aucune nouveauté</p>
            <p className="mt-1 text-km-label text-km-faint">
              {publications?.length
                ? 'Aucune publication ne correspond à ces filtres.'
                : 'Rien n’a encore été publié.'}
            </p>
          </div>
        ) : (
          <div>
            {liste.map((publication, i) => (
              <div key={publication.id} className="flex gap-3 sm:gap-4">
                <time
                  className="hidden w-[92px] shrink-0 pt-1 text-right text-km-label text-km-faint sm:block"
                  dateTime={dateUtile(publication)}
                  title={new Date(dateUtile(publication)).toLocaleString('fr-FR')}
                >
                  {dateRelative(dateUtile(publication))}
                </time>
                {/* Le filet ne descend pas sous la dernière publication : une frise qui continue
                    dans le vide laisse croire qu'il reste quelque chose à charger. */}
                <div
                  className={
                    i === liste.length - 1
                      ? 'relative min-w-0 flex-1 pb-2 pl-5'
                      : 'relative min-w-0 flex-1 border-l border-km-line pb-8 pl-5'
                  }
                >
                  <span
                    className="absolute -left-[6px] top-1.5 h-[11px] w-[11px] rounded-full border-2 border-km-green bg-km-surface"
                    aria-hidden="true"
                  />
                  <CartePublication
                    publication={publication}
                    masquerDate
                    onModifier={isAdmin ? (p) => setEdition({ ouvert: true, publication: p }) : undefined}
                    onSupprimer={isAdmin ? setASupprimer : undefined}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {edition.ouvert && (
        <Suspense fallback={null}>
          <DialogPublication
            open={edition.ouvert}
            publication={edition.publication}
            onClose={() => setEdition({ ouvert: false, publication: null })}
          />
        </Suspense>
      )}

      <Dialog
        open={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        title="Supprimer cette publication ?"
        description={aSupprimer ? `« ${aSupprimer.titre} » ne sera plus visible de l’équipe.` : undefined}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setASupprimer(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={supprimer.isPending}
            onClick={() => {
              if (!aSupprimer) return
              supprimer.mutate(aSupprimer.id, { onSuccess: () => setASupprimer(null) })
            }}
          >
            {supprimer.isPending ? 'Suppression…' : 'Supprimer'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
