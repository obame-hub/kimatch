// Bandeau permanent affiche uniquement sur le deploiement sandbox (VITE_ENV_LABEL=sandbox,
// jamais defini en prod) -- meme principe que l'indicateur "Sandbox" de Salesforce, pour qu'on
// ne confonde jamais les deux environnements au premier coup d'oeil.
export function SandboxBanner() {
  if (import.meta.env.VITE_ENV_LABEL !== 'sandbox') return null
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-ink-950">
      🧪 Sandbox — données de test, pas la production
    </div>
  )
}
