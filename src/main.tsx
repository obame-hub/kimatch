import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'

// staleTime élevé + pas de refetch au focus : si une insertion échoue côté Supabase (colonne
// manquante, policy RLS trop stricte), un refetch-on-mount par défaut effacerait silencieusement
// la création locale optimiste à chaque navigation. Les mutations patchent déjà le cache
// elles-mêmes (setQueryData), donc pas besoin de refetch agressif.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
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
