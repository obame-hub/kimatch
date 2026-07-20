import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Search } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { navItems } from '@/lib/navItems'
import { cn } from '@/lib/utils'

export function Topbar({ title, crumb }: { title: string; crumb?: string }) {
  const { signOut, demoMode } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
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

  const matches = query.trim()
    ? navItems.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : []

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

      <div className="relative hidden sm:block">
        <div
          className={cn(
            'flex min-w-[230px] items-center gap-2 rounded-lg border border-navy-200 bg-navy-50 px-3 py-1.5 text-[11.5px] text-navy-500 transition-colors',
            focused && 'border-navy-300 bg-white',
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) goTo(matches[0].to)
              if (e.key === 'Escape') inputRef.current?.blur()
            }}
            placeholder="Rechercher, naviguer…"
            className="w-full min-w-0 bg-transparent outline-none placeholder:text-navy-400"
          />
          <span className="shrink-0 rounded border border-navy-200 bg-white px-1 font-mono text-[9px] text-navy-400">⌘K</span>
        </div>
        {focused && matches.length > 0 && (
          <div className="absolute left-0 top-full z-20 mt-1.5 w-full min-w-[230px] overflow-hidden rounded-lg border border-navy-100 bg-white py-1 shadow-lg">
            {matches.map((m) => (
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
      </div>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-2">
        {demoMode && (
          <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10.5px] font-semibold text-amber-600 sm:inline-block">
            Mode démo
          </span>
        )}
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
