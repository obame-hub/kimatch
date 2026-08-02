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
import { navItems } from '@/lib/navItems'
import { cn } from '@/lib/utils'
import kiweeLogo from '@/assets/kiwee-logo.png'
import { useComptes } from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'
import { useContacts } from '@/lib/data/contacts'
import { useCompteurs } from '@/lib/data/compteurs'
import { useSignaux } from '@/lib/data/signaux'
import { useMandats } from '@/lib/data/mandats'
import { useRecommandations } from '@/lib/data/recommandations'
import { useContrats } from '@/lib/data/contrats'
import { useDocuments } from '@/lib/data/documents'
import { useActions } from '@/lib/data/actions'
import { useInteractions } from '@/lib/data/interactions'
import { buildSearchIndex, searchIndex, SEARCH_KIND_LABEL, type SearchKind } from '@/lib/search'

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

export function Topbar({ title, crumb }: { title: string; crumb?: string }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: contacts } = useContacts()
  const { data: compteurs } = useCompteurs()
  const { data: signaux } = useSignaux()
  const { data: mandats } = useMandats()
  const { data: recommandations } = useRecommandations()
  const { data: contrats } = useContrats()
  const { data: documents } = useDocuments()
  const { data: actions } = useActions()
  const { data: interactions } = useInteractions()

  const index = useMemo(
    () => buildSearchIndex({ comptes, sites, contacts, compteurs, signaux, mandats, recommandations, contrats, documents, actions, interactions }),
    [comptes, sites, contacts, compteurs, signaux, mandats, recommandations, contrats, documents, actions, interactions],
  )

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
  const pageMatches = trimmed ? navItems.filter((n) => n.label.toLowerCase().includes(trimmed.toLowerCase())).slice(0, 5) : []
  const dataMatches = useMemo(() => searchIndex(index, trimmed, 5), [index, trimmed])

  const groupedData = useMemo(() => {
    const groups = new Map<SearchKind, typeof dataMatches>()
    for (const m of dataMatches) {
      const list = groups.get(m.entry.kind) ?? []
      list.push(m)
      groups.set(m.entry.kind, list)
    }
    return groups
  }, [dataMatches])

  const hasResults = pageMatches.length > 0 || dataMatches.length > 0

  function goTo(to: string) {
    navigate(to)
    setQuery('')
    setFocused(false)
    inputRef.current?.blur()
  }

  return (
    <header className="relative flex h-[52px] items-center gap-3.5 border-b border-navy-100 bg-white px-4 sm:px-5">
      <div className="min-w-0 truncate text-[12px] text-navy-500">
        {crumb && <span>{crumb} / </span>}
        <span className="font-semibold text-navy-800">{title}</span>
      </div>

      <img
        src={kiweeLogo}
        alt="KiWee"
        className="pointer-events-none absolute left-1/2 top-1/2 hidden h-9 w-auto -translate-x-1/2 -translate-y-1/2 object-contain md:block"
      />

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
              if (e.key === 'Enter' && (pageMatches[0] || dataMatches[0])) goTo(pageMatches[0]?.to ?? dataMatches[0].entry.to)
              if (e.key === 'Escape') inputRef.current?.blur()
            }}
            placeholder="Rechercher un compte, site, compteur…"
            className="w-full min-w-0 bg-transparent outline-none placeholder:text-navy-400"
          />
          <span className="shrink-0 rounded border border-navy-200 bg-white px-1 font-mono text-[9px] text-navy-400">⌘K</span>
        </div>
        {focused && trimmed && (
          <div className="absolute left-0 top-full z-20 mt-1.5 max-h-[420px] w-[380px] overflow-y-auto rounded-lg border border-navy-100 bg-white py-1.5 shadow-lg">
            {!hasResults && <p className="px-3 py-2 text-[12px] text-navy-400">Aucun résultat pour « {trimmed} ».</p>}

            {pageMatches.length > 0 && (
              <div className="mb-1 border-b border-navy-50 pb-1">
                <p className="px-3 pb-1 text-[9.5px] font-bold uppercase tracking-wide text-navy-300">Pages</p>
                {pageMatches.map((m) => (
                  <button
                    key={m.to}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => goTo(m.to)}
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
                      onClick={() => goTo(entry.to)}
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
        )}
      </div>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-2">
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
