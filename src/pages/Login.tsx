import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import kiweePicto from '@/assets/kiwee-picto.png'

/**
 * Délai imposé par Supabase entre deux demandes de lien pour la MÊME adresse.
 * Il est indépendant du plafond horaire du projet : ce sont deux limites distinctes.
 */
const ATTENTE_SECONDES = 60

/** Mémorisé hors de React : un rechargement de page ne doit pas remettre le compteur à zéro. */
const CLE_DERNIERE_DEMANDE = 'kimatch-derniere-demande-lien'

/**
 * Traduit les refus d'authentification de Supabase, qui arrivent en anglais et sans indication
 * de ce qu'il faut faire.
 *
 * Le plafond d'envoi du projet est la limite qui gêne réellement les commerciaux le matin. Tant
 * qu'un SMTP personnalisé n'est pas configuré côté Supabase, quelques liens par heure suffisent
 * à l'épuiser pour TOUTE l'équipe — le message le dit, pour éviter que chacun réessaie en
 * boucle et consomme ce qui reste.
 */
function messageLisible(brut: string): string {
  const b = brut.toLowerCase()
  if (b.includes('rate limit') || b.includes('too many requests')) {
    return "Le nombre de liens de connexion autorisés par heure est atteint — c'est une limite partagée par toute l'équipe. Inutile de réessayer tout de suite : attends, ou demande à un collègue déjà connecté de prévenir Naoëlle."
  }
  if (b.includes('after') && b.includes('seconds')) {
    return `Un lien vient déjà d'être envoyé à cette adresse. Attends ${ATTENTE_SECONDES} secondes avant d'en demander un autre — et vérifie tes indésirables entre-temps.`
  }
  if (b.includes('invalid') && b.includes('email')) {
    return "Cette adresse e-mail n'est pas valide."
  }
  return brut
}

function secondesRestantes(): number {
  try {
    const t = Number(localStorage.getItem(CLE_DERNIERE_DEMANDE) ?? 0)
    if (!t) return 0
    return Math.max(0, ATTENTE_SECONDES - Math.floor((Date.now() - t) / 1000))
  } catch {
    return 0
  }
}

export default function Login() {
  const { signInWithMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [attente, setAttente] = useState(secondesRestantes)

  // Décompte visible. Sans lui, l'utilisateur ne sait pas s'il doit patienter ou recommencer, et
  // dans le doute il recommence — ce qui consomme le quota d'envoi de tout le monde.
  useEffect(() => {
    if (attente <= 0) return
    const t = setInterval(() => setAttente(secondesRestantes()), 1000)
    return () => clearInterval(t)
  }, [attente])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (attente > 0) return
    setSubmitting(true)
    setError(null)
    const { error } = await signInWithMagicLink(email)
    setSubmitting(false)
    if (error) {
      setError(messageLisible(error))
      // Un refus pour cause de délai compte aussi : on relance le décompte plutôt que de
      // laisser recliquer dans le vide.
      if (/rate limit|too many|seconds/i.test(error)) {
        try { localStorage.setItem(CLE_DERNIERE_DEMANDE, String(Date.now())) } catch { /* mode privé */ }
        setAttente(secondesRestantes())
      }
      return
    }
    try { localStorage.setItem(CLE_DERNIERE_DEMANDE, String(Date.now())) } catch { /* mode privé */ }
    setAttente(ATTENTE_SECONDES)
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
            <>
              <p className="text-center text-sm text-navy-200">
                Un lien de connexion a été envoyé à <span className="font-medium text-white">{email}</span>. Ouvre-le
                depuis ta boîte mail pour te connecter (ton compte est créé automatiquement à la première connexion).
              </p>
              <p className="mt-3 text-center text-xs text-navy-400">
                Rien reçu ? Regarde d'abord tes indésirables : c'est là qu'il finit le plus souvent.
              </p>
              <Button
                type="submit"
                variant="outline"
                className="mt-4 w-full"
                disabled={submitting || attente > 0}
              >
                {attente > 0 ? `Renvoyer un lien (${attente} s)` : 'Renvoyer un lien'}
              </Button>
              {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
            </>
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
              <Button type="submit" className="w-full" disabled={submitting || !email || attente > 0}>
                {submitting
                  ? 'Envoi…'
                  : attente > 0
                    ? `Nouveau lien possible dans ${attente} s`
                    : 'Recevoir un lien de connexion'}
              </Button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
