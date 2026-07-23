import { getImpersonationInfo, stopImpersonating } from '@/lib/data/impersonation'

export function ImpersonationBanner() {
  const info = getImpersonationInfo()
  if (!info) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex h-7 items-center justify-center gap-3 bg-amber-500 px-4 text-[11px] font-medium text-white shadow">
      <span className="truncate">
        Connecté en tant que <strong>{info.targetNom}</strong> ({info.targetEmail}) — emprunté par {info.adminEmail}
      </span>
      <button
        type="button"
        onClick={() => void stopImpersonating()}
        className="shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 font-semibold hover:bg-white/30"
      >
        Quitter
      </button>
    </div>
  )
}
