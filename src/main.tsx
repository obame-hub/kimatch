import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/lib/auth'

// staleTime élevé + pas de refetch au focus : en mode démo (ou tant que les policies RLS
// ne sont pas posées côté Supabase), un fetch réel ne renvoie jamais les créations locales
// optimistes — un refetch-on-mount par défaut les efface silencieusement à chaque navigation.
// Les mutations patchent déjà le cache elles-mêmes (setQueryData), donc pas besoin de refetch agressif.
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
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

// Uniquement en production : en dev, un service worker interfère avec le hot-reload de Vite.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}
