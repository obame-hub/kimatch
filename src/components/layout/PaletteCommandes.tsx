import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  CheckSquare,
  Clock,
  FileCheck2,
  FileSignature,
  FileText,
  Filter,
  Gauge,
  MapPin,
  MessageSquare,
  Search,
  Sparkle,
  Target,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { pagesRecherchables, partenaireNavItems } from '@/lib/navItems'
import { useRechercheGlobale } from '@/lib/data/rechercheGlobale'
import { SEARCH_KIND_LABEL, type SearchKind } from '@/lib/search'
import { useConsultationsRecentes } from '@/lib/data/consultationsRecentes'
import { raccourci } from '@/lib/raccourci'
import { useEstPartenaire } from '@/lib/data/roles'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA PALETTE — LA RECHERCHE QUITTE LE BANDEAU
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 16/09/2026 : « est-ce qu'il existe un moyen de garder la barre de recherche sans qu'elle
 * soit visible en permanence dans un bandeau en haut, ce qui prend de la place horizontalement sur
 * chaque écran ? »
 *
 * Le champ occupait 260 px au repos et 340 en saisie, sur chacun des 36 écrans — et il n'existait
 * pas du tout en dessous de 640 px de large, donc il n'y avait aucune recherche sur mobile. Il ne
 * reste qu'une loupe de 30 px ; la palette, elle, est PLUS grande que le champ qu'elle remplace
 * (620 px) au moment où l'on s'en sert.
 *
 * ══ TROIS PORTES, ET CHACUNE POUR UN MOMENT ══
 *
 *   · TAPER UNE LETTRE, n'importe où hors d'un champ. C'est la plus rapide : on ne cherche plus la
 *     recherche, on écrit. La lettre frappée est déjà dans la palette quand elle s'ouvre.
 *   · LA LOUPE, pour qui ne saura jamais le reste.
 *   · ⌘K / Ctrl K, la seule qui fonctionne PENDANT qu'on écrit dans un champ, puisqu'un
 *     modificateur ne tape aucun caractère.
 *
 * LA BARRE D'ESPACE A ÉTÉ ÉCARTÉE, et pas seulement à cause des champs de saisie. Elle fait défiler
 * la page — un geste qui sert vraiment sur une liste de trois cents compteurs — et elle appuie sur
 * l'élément qui a le focus, ce qui est un contrat d'accessibilité. Après un clic sur un bouton, ce
 * bouton garde le focus : l'espace y serait rejoué. Son effet aurait donc dépendu d'un état
 * invisible, et un raccourci imprévisible coûte plus cher qu'un raccourci à deux touches.
 *
 * ══ CE QUI A RENDU « TAPER UNE LETTRE » POSSIBLE ══
 *
 * Kimatch avait déjà des raccourcis à une touche : 1 à 9 changeaient d'onglet sur six fiches, « C »
 * ouvrait le hub de création, et le sprint du Cockpit tenait sur F/P/A. Ils entraient en collision
 * frontale avec l'idée. William, 16/09/2026 : « oublie les raccourcis clavier, même pour le Cockpit
 * et pour tout le reste de l'app qui reste à coder. La navigation se fera au clic uniquement. »
 *
 * Ils sont partis, et l'échange est favorable : ces touches AGISSAIENT — le hub s'ouvrait, et « R »
 * a créé des tâches de relance en base jusqu'en août. Une frappe involontaire faisait quelque chose.
 * Ici, elle ouvre un panneau qui n'exécute rien avant Entrée et se referme sur Échap.
 *
 * ══ À VIDE, ELLE SERT DÉJÀ ══
 *
 * Les cinq derniers enregistrements ouverts d'abord, puis les pages. À l'ouverture, l'intention la
 * plus probable n'est pas de chercher un nom : c'est de revenir sur ce qu'on vient de quitter.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ══ LES ICÔNES ET LES TEINTES VIENNENT DE L'ANCIENNE LISTE DE RÉSULTATS ══
   Elles vivaient dans `Topbar`, qui ne les affiche plus : la palette a repris le rendu, elle reprend
   donc les tables. Une famille de résultats qui ne se reconnaît pas d'un coup d'œil oblige à lire
   l'intitulé, et c'est tout ce que la colonne d'icônes sert à éviter. */
const KIND_ICON: Record<SearchKind, typeof Building2> = {
  compte: Building2,
  /* `Filter` : la même icône que la fiche piste et que le rail de gauche. Une famille de résultats
     qui ne se reconnaît pas d'un coup d'œil oblige à lire l'intitulé, et c'est tout ce que la
     colonne d'icônes sert à éviter. */
  piste: Filter,
  site: MapPin,
  contact: User,
  compteur: Gauge,
  mandat: FileCheck2,
  opportunite: Target,
  recommandation: Sparkle,
  contrat: FileSignature,
  document: FileText,
  tache: CheckSquare,
  interaction: MessageSquare,
}

const KIND_TINT: Record<SearchKind, string> = {
  compte: 'text-sky-500',
  piste: 'text-indigo-500',
  site: 'text-km-green',
  contact: 'text-violet-500',
  compteur: 'text-km-muted',
  opportunite: 'text-opp-500',
  mandat: 'text-amber-600',
  recommandation: 'text-amber-500',
  contrat: 'text-sky-500',
  document: 'text-km-muted',
  tache: 'text-amber-600',
  interaction: 'text-sky-500',
}

/** Les pages n'ont pas de famille métier : la boussole du rail leur va mieux qu'une icône d'objet. */
const ICONE_PAGE = Search

type Famille = 'page' | SearchKind

interface Entree {
  cle: string
  groupe: string
  famille: Famille
  libelle: string
  sousLibelle?: string | null
  chemin: string
  /** L'heure relative, sur les récents seulement. */
  quand?: string
}

/** « il y a 3 min », « hier, 17:42 » — on situe sans faire lire une date complète. */
function ilYA(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const minutes = Math.round((Date.now() - d.getTime()) / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const heures = Math.round(minutes / 60)
  if (heures < 8) return `il y a ${heures} h`
  const hier = new Date()
  hier.setDate(hier.getDate() - 1)
  const memeJour = d.toDateString() === new Date().toDateString()
  if (memeJour) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hier.toDateString()) {
    return `hier, ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  }
  return d.toLocaleDateString('fr-FR')
}

const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** La partie qui correspond, soulignée : on voit POURQUOI une ligne remonte. */
function Surligne({ texte, recherche }: { texte: string; recherche: string }): ReactNode {
  if (!recherche) return texte
  const i = sansAccent(texte).indexOf(sansAccent(recherche))
  if (i < 0) return texte
  return (
    <>
      {texte.slice(0, i)}
      <mark className="bg-transparent font-extrabold text-inherit underline decoration-km-green underline-offset-2">
        {texte.slice(i, i + recherche.length)}
      </mark>
      {texte.slice(i + recherche.length)}
    </>
  )
}

export function PaletteCommandes({
  ouverte,
  onFermer,
  saisieInitiale,
}: {
  ouverte: boolean
  onFermer: () => void
  /** La lettre qui a ouvert la palette, déjà dans le champ. */
  saisieInitiale?: string
}) {
  const navigate = useNavigate()
  const [recherche, setRecherche] = useState('')
  const [choisi, setChoisi] = useState(0)
  const champRef = useRef<HTMLInputElement>(null)
  const listeRef = useRef<HTMLDivElement>(null)

  const { data: recents } = useConsultationsRecentes(5)
  const estPartenaire = useEstPartenaire()
  const terme = recherche.trim()
  const { data: resultats, isFetching } = useRechercheGlobale(terme)

  useEffect(() => {
    if (!ouverte) return
    setRecherche(saisieInitiale ?? '')
    setChoisi(0)
    /* Le focus après la peinture : demandé pendant le rendu, il tombe sur un champ que le
       navigateur n'a pas encore posé, et la lettre suivante part dans le vide. */
    const t = window.setTimeout(() => champRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [ouverte, saisieInitiale])

  const entrees = useMemo<Entree[]>(() => {
    /* ══ LA PALETTE NE PROPOSE PAS CE QUE LE RAIL CACHE — 24/09/2026 ══
     *
     * Naoëlle : « aussi de faire une recherche commande K comme ce que Will a mis en place ». Elle
     * doit donc marcher pour un partenaire — mais sur SES pages.
     *
     * C'EST PRÉCISÉMENT PAR ICI QU'ON RETOMBAIT SUR CE QU'ON AVAIT RETIRÉ : la leçon des Signaux, le
     * 02/09/2026. Sortir une page du rail sans la sortir de la recherche ne la retire pas, ça la
     * déplace. Un partenaire aurait tapé « pist » et serait tombé sur nos pistes — vides grâce aux
     * policies, mais proposées, ce qui suffit à faire douter du cloisonnement.
     *
     * On part donc de SA liste, la même que le rail : deux entrées, et ce qui n'y est pas n'existe
     * pas pour lui. */
    const catalogue = estPartenaire ? partenaireNavItems : pagesRecherchables
    const pages = catalogue
      .filter((p) => !terme || sansAccent(p.label).includes(sansAccent(terme)))
      .map((p) => ({ cle: `page:${p.to}`, groupe: 'Pages', famille: 'page' as const, libelle: p.label, chemin: p.to }))

    const lesRecents: Entree[] = (recents ?? []).map((r) => ({
      cle: `recent:${r.entite_type}:${r.entite_id}`,
      groupe: 'Récents',
      famille: r.entite_type,
      libelle: r.libelle,
      sousLibelle: r.sous_libelle,
      chemin: r.chemin,
      quand: ilYA(r.date_consultation),
    }))

    if (!terme) return [...lesRecents, ...pages]

    /* ══ CE QU'ON A OUVERT RÉCEMMENT REMONTE ══
       Deux comptes portent le nom « FONCIA MONTPELLIER ». Celui qu'on cherche est presque toujours
       celui qu'on vient de quitter : le classer d'abord épargne la lecture des deux lignes, et ne
       coûte qu'un tri. */
    const vusRecemment = new Set(lesRecents.map((r) => `${r.famille}:${r.chemin}`))
    const trouves: Entree[] = (resultats ?? []).map((r) => ({
      cle: `${r.kind}:${r.to}`,
      groupe: SEARCH_KIND_LABEL[r.kind],
      famille: r.kind,
      libelle: r.label,
      sousLibelle: r.sublabel,
      chemin: r.to,
    }))
    const remontes = trouves
      .filter((t) => vusRecemment.has(`${t.famille}:${t.chemin}`))
      .map((t) => ({ ...t, groupe: 'Récents', quand: 'déjà ouvert' }))
    const cles = new Set(remontes.map((r) => r.cle))

    return [...remontes, ...pages, ...trouves.filter((t) => !cles.has(t.cle))]
  }, [terme, recents, resultats, estPartenaire])

  useEffect(() => {
    if (choisi >= entrees.length) setChoisi(Math.max(0, entrees.length - 1))
  }, [entrees.length, choisi])

  function ouvrirEntree(e: Entree | undefined) {
    if (!e) return
    onFermer()
    navigate(e.chemin)
  }

  useEffect(() => {
    if (!ouverte) return
    function auClavier(ev: KeyboardEvent) {
      if (ev.key === 'Escape') { ev.preventDefault(); onFermer(); return }
      if (ev.key === 'ArrowDown') { ev.preventDefault(); setChoisi((i) => Math.min(i + 1, entrees.length - 1)) }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); setChoisi((i) => Math.max(i - 1, 0)) }
      if (ev.key === 'Enter') { ev.preventDefault(); ouvrirEntree(entrees[choisi]) }
    }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  })

  /* La ligne retenue reste dans la fenêtre quand on descend aux flèches — sans quoi la sélection
     sort par le bas et on pilote à l'aveugle. */
  useEffect(() => {
    listeRef.current?.querySelector('[data-choisi="oui"]')?.scrollIntoView({ block: 'nearest' })
  }, [choisi, entrees.length])

  if (!ouverte) return null

  let groupePrecedent: string | null = null

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-center bg-km-text/40 px-4 pt-[12vh] backdrop-blur-[1.5px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rechercher"
        className="flex max-h-[62vh] w-full max-w-[620px] animate-km-hub-pop flex-col overflow-hidden rounded-km-lg border border-km-line bg-km-surface shadow-kw-panel"
      >
        <div className="flex flex-none items-center gap-2.5 border-b border-km-line-soft px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-km-faint" />
          <input
            ref={champRef}
            value={recherche}
            onChange={(e) => { setRecherche(e.target.value); setChoisi(0) }}
            placeholder="Chercher un enregistrement ou une page…"
            aria-label="Rechercher"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-km-text outline-none placeholder:text-km-faint"
          />
          <span className="shrink-0 rounded-km-sm border border-km-line px-1.5 font-mono text-km-tiny text-km-faint">échap</span>
        </div>

        <div ref={listeRef} className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {entrees.length === 0 ? (
            <p className="px-4 py-6 text-center text-km-body text-km-faint">
              {isFetching ? 'Recherche…' : `Aucun résultat pour « ${terme} ».`}
            </p>
          ) : (
            entrees.map((e, i) => {
              const nouveauGroupe = e.groupe !== groupePrecedent
              groupePrecedent = e.groupe
              const actif = i === choisi
              /* L'icône dit la famille — compte, piste, compteur… — sauf sur un récent, où c'est
                 l'horloge : à cet endroit, ce qui compte est « tu y étais », pas « c'est un compte ».
                 La famille reste lisible sur la ligne, dans le sous-libellé. */
              const Icone = e.quand ? Clock : e.famille === 'page' ? ICONE_PAGE : KIND_ICON[e.famille]
              const teinte = e.famille === 'page' ? 'text-km-faint' : KIND_TINT[e.famille]
              return (
                <div key={e.cle}>
                  {nouveauGroupe && (
                    <p className="px-4 pb-1 pt-2 text-km-tiny font-bold uppercase tracking-[0.1em] text-km-faint">
                      {e.groupe}
                    </p>
                  )}
                  <button
                    type="button"
                    data-choisi={actif ? 'oui' : 'non'}
                    onMouseMove={() => { if (!actif) setChoisi(i) }}
                    onClick={() => ouvrirEntree(e)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-4 py-1.5 text-left transition-colors',
                      actif && 'bg-km-green-soft',
                    )}
                  >
                    <Icone className={cn('h-3.5 w-3.5 shrink-0', actif ? 'text-km-green' : teinte)} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-km-name font-semibold', actif ? 'text-km-green' : 'text-km-text')}>
                        <Surligne texte={e.libelle} recherche={terme} />
                      </span>
                      {e.sousLibelle && (
                        <span className="block truncate text-km-label text-km-faint">
                          <Surligne texte={e.sousLibelle} recherche={terme} />
                        </span>
                      )}
                    </span>
                    {e.quand && <span className={cn('shrink-0 text-km-label', actif ? 'text-km-green' : 'text-km-faint')}>{e.quand}</span>}
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="flex flex-none items-center gap-3.5 border-t border-km-line-soft bg-km-soft px-4 py-1.5 text-km-label text-km-faint">
          <span><span className="font-mono">↑↓</span> naviguer</span>
          <span><span className="font-mono">↵</span> ouvrir</span>
          <span className="hidden sm:inline"><span className="font-mono">{raccourci('K')}</span> rappeler</span>
          {entrees.length > 0 && (
            <span className="ml-auto tabular-nums">
              {entrees.length} résultat{entrees.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
