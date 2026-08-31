import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { Input } from '@/components/ui/form'
import { searchAddressBAN, type BanAddress } from '@/lib/banAddress'

/** Champ adresse avec autocomplétion BAN (api-adresse.data.gouv.fr, gratuit, sans clé) --
 * confirmé dans le code de Tools que ce n'est PAS Google Maps malgré ce qui a été dit en réunion. */
export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  onSelect: (address: BanAddress) => void
  placeholder?: string
}) {
  const [results, setResults] = useState<BanAddress[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (value.trim().length < 3) { setResults([]); return }
    setLoading(true)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const handle = setTimeout(async () => {
      try {
        setResults(await searchAddressBAN(value, ctrl.signal))
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => { clearTimeout(handle); ctrl.abort() }
  }, [value])

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimeout.current = setTimeout(() => setOpen(false), 150) }}
        placeholder={placeholder ?? 'Commence à taper une adresse…'}
      />
      {loading && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-km-faint" />}
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-km-line bg-white shadow-lg">
          {results.map((r) => (
            <button
              key={r.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); onSelect(r); setOpen(false) }}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-km-text hover:bg-km-bg"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-faint" />
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
