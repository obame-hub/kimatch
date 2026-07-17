import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { KiweeMark } from '@/components/ui/kiwee-mark'

export default function Login() {
  const { signInWithPassword, enterDemoMode, demoMode } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await signInWithPassword(email, password)
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    navigate('/')
  }

  function handleDemoEntry() {
    enterDemoMode()
    navigate('/')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-kiwi-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-kiwi-400/10 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <KiweeMark className="mb-3 h-14 w-14 drop-shadow-[0_8px_20px_rgba(140,203,56,0.5)]" />
          <h1 className="font-display text-xl font-semibold text-white">KiWee OS</h1>
          <p className="mt-1 text-sm text-navy-300">Plateforme conseil énergie</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-ink-800 bg-ink-900 p-6 shadow-card">
          <label className="mb-1 block text-xs font-medium text-navy-300">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-white placeholder:text-navy-500 focus:border-kiwi-500 focus:outline-none"
            placeholder="prenom@kiwee-energie.fr"
          />
          <label className="mb-1 block text-xs font-medium text-navy-300">Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-white placeholder:text-navy-500 focus:border-kiwi-500 focus:outline-none"
            placeholder="••••••••"
          />
          {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Connexion…' : 'Se connecter'}
          </Button>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-ink-800" />
            <span className="text-[11px] uppercase tracking-wide text-navy-500">ou</span>
            <div className="h-px flex-1 bg-ink-800" />
          </div>

          <Button type="button" variant="subtle" className="w-full bg-ink-800 text-navy-100 hover:bg-ink-700" onClick={handleDemoEntry}>
            Continuer en mode démo
          </Button>
          {demoMode && (
            <p className="mt-3 text-center text-[11px] text-kiwi-300/80">
              Aucun compte requis — explore l'app avec des données d'exemple.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
