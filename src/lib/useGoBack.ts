import { useNavigate } from 'react-router-dom'

/** Revient à l'écran précédent dans l'historique du navigateur quand on est arrivé
 * par navigation interne (clic sur un lien) ; retombe sur `fallback` si la page a été
 * ouverte directement (rechargement, lien externe, premier écran de la session). */
export function useGoBack(fallback: string) {
  const navigate = useNavigate()
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (typeof idx === 'number' && idx > 0) navigate(-1)
    else navigate(fallback)
  }
}
