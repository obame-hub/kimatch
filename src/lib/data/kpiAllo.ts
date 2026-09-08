/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES CHIFFRES D'APPELS, LUS CHEZ ALLO
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Passe par `/api/allo/kpi` et jamais directement par Allo : leur clé donne accès à tout le compte —
 * appels, enregistrements, transcriptions — et n'a rien à faire dans un navigateur.
 *
 * ON NE RECOMPTE RIEN. Allo calcule déjà ces métriques et les sert prêtes à l'emploi. Les recalculer
 * depuis `interactions` donnerait deux chiffres pour la même chose, qui finiraient par diverger — et
 * le nôtre serait le moins juste, puisqu'il ne connaît que les appels que le webhook a vus.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ResumeAppels {
  appels: number
  secondes_au_telephone: number
  appels_plus_une_minute: number
  taux_decroche: number
}

export interface AppelsParPersonne extends ResumeAppels {
  nom: string
  email: string
}

export interface EtapeEntonnoir {
  libelle: string
  nombre: number
  /** La part de l'étape précédente, telle qu'Allo la calcule. Nulle sur la première. */
  taux: number | null
}

export interface KpiAppels {
  jours: number
  resume: ResumeAppels
  parPersonne: AppelsParPersonne[]
  entonnoir: EtapeEntonnoir[]
}

export function useKpiAppels(jours: 7 | 30) {
  return useQuery({
    queryKey: ['kpi-appels', jours],
    // CINQ MINUTES DE FRAÎCHEUR. Ce sont des chiffres de période, pas un état en temps réel :
    // les relire à chaque montage de l'onglet ferait deux appels à Allo pour le même nombre.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<KpiAppels> => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Session expirée — rechargez la page.')

      const res = await fetch(`/api/allo/kpi?jours=${jours}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const corps = (await res.json()) as KpiAppels & { error?: string; code?: string }
      if (!res.ok) {
        if (corps.code === 'portee_manquante') {
          throw new Error('La clé Allo n’a pas le droit de lire les conversations.')
        }
        throw new Error(corps.error ?? `Erreur ${res.status}`)
      }
      return corps
    },
  })
}

/**
 * « 8 h 25 », « 42 min », « 38 s ».
 *
 * PAS DE SECONDES AU-DELÀ DE L'HEURE : sur huit heures de téléphone, la seconde n'informe personne
 * et allonge un chiffre qu'on lit d'un coup d'œil.
 */
export function dureeCourte(secondes: number): string {
  if (secondes < 60) return `${Math.round(secondes)} s`
  const minutes = Math.round(secondes / 60)
  if (minutes < 60) return `${minutes} min`
  const heures = Math.floor(minutes / 60)
  const reste = minutes % 60
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, '0')}`
}

/** « 76,6 % ». Une décimale : le taux de décroché bouge de quelques dixièmes d'un jour à l'autre. */
export function pourcentage(part: number): string {
  return `${(part * 100).toFixed(1).replace('.', ',')} %`
}
