import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import kiweePicto from '@/assets/kiwee-picto.png'

export default function Login() {
  const { signInWithMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await signInWithMagicLink(email)
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    setSent(true)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-kiwi-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-kiwi-400/10 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={kiweePicto} alt="KiWee" className="mb-3 h-14 w-14 object-contain drop-shadow-[0_8px_20px_rgba(13,122,95,0.5)]" />
          <h1 className="font-display text-xl font-semibold text-white">Kimatch</h1>
          <p className="mt-1 text-sm text-navy-300">Plateforme conseil énergie</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-ink-800 bg-ink-900 p-6 shadow-card">
          {sent ? (
            <p className="text-center text-sm text-navy-200">
              Un lien de connexion a été envoyé à <span className="font-medium text-white">{email}</span>. Ouvre-le
              depuis ta boîte mail pour te connecter (ton compte est créé automatiquement à la première connexion).
            </p>
          ) : (
            <>
              <label className="mb-1 block text-xs font-medium text-navy-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-4 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-white placeholder:text-navy-500 focus:border-kiwi-500 focus:outline-none"
                placeholder="prenom@kiwee-energie.fr"
              />
              {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting || !email}>
                {submitting ? 'Envoi…' : 'Recevoir un lien de connexion'}
              </Button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
