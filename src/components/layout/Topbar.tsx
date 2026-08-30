import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogOut,
  Search,
  Building2,
  MapPin,
  User,
  Gauge,
  Radio,
  FileCheck2,
  Sparkle,
  FileSignature,
  FileText,
  CheckSquare,
  MessageSquare,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { pagesRecherchables } from '@/lib/navItems'
import type { NavItem } from '@/lib/navItems'
import { cn } from '@/lib/utils'
import { useMarketTicker } from '@/lib/data/marche'
import { useRechercheGlobale } from '@/lib/data/rechercheGlobale'
import { SEARCH_KIND_LABEL, type SearchKind } from '@/lib/search'

const KIND_ICON: Record<SearchKind, typeof Building2> = {
  compte: Building2,
  site: MapPin,
  contact: User,
  compteur: Gauge,
  signal: Radio,
  mandat: FileCheck2,
  recommandation: Sparkle,
  contrat: FileSignature,
  document: FileText,
  tache: CheckSquare,
  interaction: MessageSquare,
}

const KIND_TINT: Record<SearchKind, string> = {
  compte: 'text-sky-500',
  site: 'text-kiwi-600',
  contact: 'text-violet-500',
  compteur: 'text-navy-500',
  signal: 'text-red-500',
  mandat: 'text-amber-600',
  recommandation: 'text-amber-500',
  contrat: 'text-sky-500',
  document: 'text-navy-500',
  tache: 'text-amber-600',
  interaction: 'text-sky-500',
}

// Bandeau PEG (gaz) / BASE (élec), visible en permanence dans le header (demande design William) --
// vert quand le prix baisse, rouge quand il monte (point de vue conseil énergie : une baisse est
// une bonne nouvelle pour le client, pas un signal "négatif" comme en finance classique).
function MarketTicker() {
  const data = useMarketTicker()

  function line(label: string, value: { price: number; changePct: number } | undefined) {
    const down = (value?.changePct ?? 0) < 0
    return (
      <span>
        {label} Cal27{' '}
        <b className={cn('font-bold', !value ? 'text-kw-ghost' : down ? 'text-kw-green' : 'text-kw-red')}>
          {value ? `${value.price.toLocaleString('fr-FR')} ${down ? '▾' : '▴'}${Math.abs(value.changePct).toLocaleString('fr-FR')}%` : '—'}
        </b>
      </span>
    )
  }

  return (
    <div className="hidden shrink-0 items-center gap-3 rounded-[7px] border border-kw-border bg-kw-bg px-3 py-[5px] font-mono text-kw-base text-kw-meta lg:flex">
      {line('PEG', data?.peg)}
      <span className="text-[#d5d4cf]">│</span>
      {line('BASE', data?.base)}
    </div>
  )
}

/**
 * Resultats de la recherche globale.
 *
 * Composant separe et monte UNIQUEMENT quand l'utilisateur se sert de la barre de recherche.
 * C'est volontaire : l'index a besoin de onze tables entieres (~100 000 lignes, dont 66 000
 * interactions). Quand ces hooks vivaient directement dans Topbar -- presente sur toutes les
 * pages -- chaque ecran de l'application les chargeait, meme sans jamais ouvrir la recherche :
 * 112 requetes et 25 secondes pour afficher la liste des sites (mesure du 06/08/2026). En
 * differant le montage, une page ne paie plus que ses propres donnees.
 */
function ResultatsRecherche({
  query,
  pageMatches,
  onGoTo,
  onPremierResultat,
}: {
  query: string
  pageMatches: NavItem[]
  onGoTo: (to: string) => void
  onPremierResultat: (to: string | null) => void
}) {
  // La base cherche, le navigateur affiche. L'index etait construit ici a partir de onze tables
  // entieres -- environ 100 000 lignes, dont 66 000 interactions et 130 Mo -- des la premiere
  // lettre tapee. Le montage differe de ce composant evitait de le faire sur chaque page, mais la
  // premiere frappe payait toujours la note.
  const { data: resultats, isFetching } = useRechercheGlobale(query)

  const dataMatches = useMemo(
    () => (resultats ?? []).map((entry) => ({ entry, score: 1 })),
    [resultats],
  )

  const groupedData = useMemo(() => {
    const groups = new Map<SearchKind, typeof dataMatches>()
    for (const m of dataMatches) {
      const list = groups.get(m.entry.kind) ?? []
      list.push(m)
      groups.set(m.entry.kind, list)
    }
    return groups
  }, [dataMatches])

  // Remonte le premier resultat pour que la touche Entree fonctionne depuis l'input.
  useEffect(() => {
    onPremierResultat(dataMatches[0]?.entry.to ?? null)
  }, [dataMatches, onPremierResultat])

  const indexation = isFetching
  const hasResults = pageMatches.length > 0 || dataMatches.length > 0

  return (
    <div className="absolute left-0 top-full z-20 mt-1.5 max-h-[420px] w-[380px] overflow-y-auto rounded-lg border border-navy-100 bg-white py-1.5 shadow-lg">
      {indexation && <p className="px-3 py-2 text-[12px] text-navy-400">Indexation en cours…</p>}
      {!indexation && !hasResults && <p className="px-3 py-2 text-[12px] text-navy-400">Aucun résultat pour « {query} ».</p>}

      {pageMatches.length > 0 && (
        <div className="mb-1 border-b border-navy-50 pb-1">
          <p className="px-3 pb-1 text-[9.5px] font-bold uppercase tracking-wide text-navy-300">Pages</p>
          {pageMatches.map((m) => (
            <button
              key={m.to}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onGoTo(m.to)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-navy-700 hover:bg-navy-50"
            >
              <m.icon className="h-3.5 w-3.5 text-navy-400" />
              {m.label}
            </button>
          ))}
        </div>
      )}

      {[...groupedData.entries()].map(([kind, matches]) => {
        const Icon = KIND_ICON[kind]
        return (
          <div key={kind} className="mb-1 last:mb-0">
            <p className="px-3 pb-1 text-[9.5px] font-bold uppercase tracking-wide text-navy-300">{SEARCH_KIND_LABEL[kind]}</p>
            {matches.map(({ entry }) => (
              <button
                key={`${entry.kind}-${entry.id}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onGoTo(entry.to)}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-navy-50"
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0', KIND_TINT[kind])} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-navy-800">{entry.label}</span>
                  {entry.sublabel && <span className="block truncate text-[10.5px] text-navy-400">{entry.sublabel}</span>}
                </span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export function Topbar({ title, crumb }: { title: string; crumb?: string }) {
  const { signOut } = useAuth()

  /**
   * LE NOM DE L'ONGLET DU NAVIGATEUR.
   *
   * Les trente-huit ecrans annoncaient tous « Kimatch », le seul <title> du index.html. Cinq onglets
   * ouverts cote a cote donnaient cinq etiquettes identiques : impossible de retrouver la fiche
   * qu'on venait de laisser autrement qu'en cliquant dessus une par une. L'historique du navigateur
   * et les favoris souffraient du meme mal — trente entrees « Kimatch » et rien pour les distinguer.
   *
   * Le titre que la barre affiche deja fait exactement l'affaire, et il vaut aussi pour les fiches :
   * l'onglet d'un compte porte le nom du compte. Le fil d'Ariane s'y ajoute quand il apporte quelque
   * chose — « ACME SAS · Comptes · Kimatch » — et non quand il repete le titre.
   */
  useEffect(() => {
    const morceaux = [title, crumb === title ? null : crumb, 'Kimatch'].filter(Boolean)
    document.title = morceaux.join(' · ')
  }, [title, crumb])
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [premierResultat, setPremierResultat] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const trimmed = query.trim()
  // On cherche dans TOUTES les pages, pas seulement dans le rail : les listes sorties du rail
  // (Signaux, Contrats, Mandats, Taches, Documents, Interactions, Versions) resteraient sinon
  // atteignables a l'URL seule.
  const pageMatches = trimmed
    ? pagesRecherchables.filter((n) => n.label.toLowerCase().includes(trimmed.toLowerCase())).slice(0, 5)
    : []

  function goTo(to: string) {
    navigate(to)
    setQuery('')
    setFocused(false)
    inputRef.current?.blur()
  }

  // GRILLE À TROIS COLONNES, et non une rangée à ressorts.
  //
  // Le logo était posé entre deux `flex-1`, ce qui le centrait sur l'espace RESTANT — donc à droite,
  // puisque le fil d'Ariane, la recherche et le ticker occupent bien plus de place que le bouton de
  // déconnexion. Signalé le 20/08/2026.
  //
  // Deux colonnes latérales de largeur identique (`minmax(0,1fr)`) le centrent sur la page, sans
  // recourir à un positionnement absolu : celui-ci avait déjà provoqué un recouvrement du ticker dès
  // 1568 px, corrigé le 16/08/2026, et on ne le réintroduit pas.
  return (
    /* DEUX COLONNES ET NON TROIS. Naoëlle, 27/08/2026 : « enlève le logo Kimatch de la fenêtre
       principale en haut et place-le au-dessus du menu de gauche, ça désengorge la fenêtre et ça
       remplit le haut du menu tout vide. »

       La troisième colonne n'existait QUE pour porter le logo au centre. La laisser vide aurait
       gardé un trou au milieu de la barre et repoussé la déconnexion vers l'intérieur : retirer un
       élément et retirer sa place ne sont pas la même chose. */
    <header className="relative grid h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 border-b border-navy-100 bg-white px-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3.5">
      <div className="min-w-0 truncate text-[12px] text-navy-500">
        {crumb && <span>{crumb} / </span>}
        {/* UN TITRE DE NIVEAU 1 PAR ECRAN, et c'est celui-ci.

            Trente-six pages sur trente-huit n'avaient aucun <h1> : les lecteurs d'ecran et le
            raccourci « aller au titre principal » n'avaient nulle part ou se poser, et le plan du
            document commencait directement au niveau 2 de l'en-tete de liste.

            La bascule ne change rien a l'oeil : le reset de Tailwind rend aux titres la taille et la
            graisse de leur parent, donc ce <h1> s'affiche exactement comme le <span> qu'il remplace,
            aux memes classes. L'en-tete de liste reste en niveau 2, dessous, ce qui est sa place. */}
        <h1 className="font-semibold text-navy-800">{title}</h1>
      </div>

      <div className="relative hidden sm:block">
        <div
          className={cn(
            'flex w-[260px] items-center gap-2 rounded-lg border border-navy-200 bg-navy-50 px-3 py-1.5 text-[11.5px] text-navy-500 transition-colors',
            focused && 'w-[340px] border-navy-300 bg-white',
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const cible = pageMatches[0]?.to ?? premierResultat
                if (cible) goTo(cible)
              }
              if (e.key === 'Escape') inputRef.current?.blur()
            }}
            placeholder="Rechercher un compte, site, compteur…"
            className="w-full min-w-0 bg-transparent outline-none placeholder:text-navy-400"
          />
          <span className="shrink-0 rounded border border-navy-200 bg-white px-1 font-mono text-[9px] text-navy-400">⌘K</span>
        </div>
        {focused && trimmed && (
          <ResultatsRecherche
            query={trimmed}
            pageMatches={pageMatches}
            onGoTo={goTo}
            onPremierResultat={setPremierResultat}
          />
        )}
      </div>

      <MarketTicker />

      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 justify-self-end">
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium text-navy-500 hover:bg-navy-50 hover:text-navy-700"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </div>
    </header>
  )
}
