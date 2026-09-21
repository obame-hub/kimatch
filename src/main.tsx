import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/lib/auth'
import { surveillerLesMorceauxManquants } from '@/lib/chargerPage'

// staleTime élevé + pas de refetch au focus : si une insertion échoue côté Supabase (colonne
// manquante, policy RLS trop stricte), un refetch-on-mount par défaut effacerait silencieusement
// la création locale optimiste à chaque navigation. Les mutations patchent déjà le cache
// elles-mêmes (setQueryData), donc pas besoin de refetch agressif.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      /* ══ UN ÉCHEC DOIT FINIR PAR SE DIRE ══
         Mesuré le 21/09/2026 en coupant la lecture des pistes : la requête est partie VINGT-TROIS
         fois avant que l'écran ne renonce. `fetchAllRows` réessaie déjà trois fois par page, et
         React Query relançait trois fois par-dessus, chaque tour avec une attente plus longue. Le
         commercial restait donc plusieurs minutes devant une liste vide sans le moindre message —
         le silence qu'on vient justement de corriger dans `lib/data`.

         Une tentative de reprise suffit : les deux essais internes ont déjà absorbé le hoquet
         passager. Au-delà, c'est une panne, et une panne s'annonce. Le bouton « Réessayer » de
         `ListeEnEchec` rend la main à qui veut insister. */
      retry: 1,
    },
  },
})

/* AVANT LE PREMIER RENDU : un morceau demandé à la demande — visionneuse PDF, génération de
   mandat — peut manquer après une mise en ligne, et l'écran resterait blanc sans que personne
   sache pourquoi. Voir `src/lib/chargerPage.ts`. */
surveillerLesMorceauxManquants()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

// Titre d'onglet distinct sur la sandbox (meme VITE_ENV_LABEL que SandboxBanner) -- pour ne pas
// confondre les deux quand prod et sandbox sont ouvertes en meme temps dans le navigateur.
if (import.meta.env.VITE_ENV_LABEL === 'sandbox') {
  document.title = 'Sandbox Kimatch'
}

// Uniquement en production : en dev, un service worker interfère avec le hot-reload de Vite.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}
