import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const DISMISS_KEY = 'kiwee-os-install-dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    if (isIos()) {
      setShowIosHint(true)
      return
    }
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (dismissed || isStandalone()) return null
  if (!deferredPrompt && !showIosHint) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDeferredPrompt(null)
    dismiss()
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex items-center gap-3 border-t border-navy-100 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-sm sm:rounded-xl sm:border">
      {deferredPrompt ? (
        <>
          <Download className="h-5 w-5 shrink-0 text-kiwi-600" />
          <p className="flex-1 text-xs text-navy-700">Installez KiWee OS sur votre écran d'accueil pour un accès plus rapide.</p>
          <Button size="sm" onClick={() => void install()}>Installer</Button>
        </>
      ) : (
        <>
          <Share className="h-5 w-5 shrink-0 text-kiwi-600" />
          <p className="flex-1 text-xs text-navy-700">
            Sur iPhone : appuyez sur <strong>Partager</strong> puis <strong>Sur l'écran d'accueil</strong> pour installer KiWee OS.
          </p>
        </>
      )}
      <button type="button" onClick={dismiss} className="shrink-0 rounded-md p-1 text-navy-400 hover:bg-navy-100" aria-label="Fermer">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
