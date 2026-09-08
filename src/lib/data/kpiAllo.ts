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
  du: string
  au: string
  /** L'instant où le serveur a interrogé Allo. Affiché : voir `KpiAppels.tsx`. */
  luLe: string
  resume: ResumeAppels
  parPersonne: AppelsParPersonne[]
  entonnoir: EtapeEntonnoir[]
}

/**
 * ══ DES PÉRIODES NOMMÉES, ET NON DES FENÊTRES GLISSANTES ══════════════════════════════════════
 *
 * Michel, 08/09/2026, rapporté par Naoëlle : « il aimerait qu'on mette plutôt des dates relatives
 * comme demain, aujourd'hui, cette semaine. »
 *
 * L'écran offrait « 7 jours » et « 30 jours », deux fenêtres qui reculent avec l'horloge. Elles ne
 * répondent pas à la question qu'on pose : « 7 jours » mélange la moitié de la semaine dernière
 * avec la moitié de celle-ci, donc « comment on a fait cette semaine ? » n'a pas de réponse.
 *
 * PAS DE « DEMAIN » : ces chiffres sont des appels déjà passés. « Hier » est son équivalent utile —
 * c'est la question du lundi matin sur le vendredi.
 *
 * PAS DE « CETTE HEURE » NON PLUS, et ce n'est pas un oubli. Vérifié le 08/09/2026 : Allo ignore
 * l'heure. `granularity: 'HOUR'`, `'HOURLY'` et des bornes horodatées rendent tous les trois la
 * journée entière à l'identique. Notre propre table `interactions` a bien l'heure, mais elle ne
 * porte que ce que le webhook a vu — 14 appels ce jour-là contre 67 chez Allo, le webhook n'étant
 * branché que depuis 14 h. Un chiffre horaire tiré de là serait faux d'un facteur cinq, sans moyen
 * de le vérifier puisque Allo ne descend pas sous la journée.
 *
 * ══ LES BORNES SE CALCULENT ICI, DANS LE NAVIGATEUR ══
 *
 * « Aujourd'hui » et « cette semaine » sont locaux. Le serveur tourne en UTC : il donnerait le
 * mauvais jour chaque soir. Et la semaine commence LUNDI — `getDay()` rend 0 pour dimanche, d'où le
 * décalage `(jour + 6) % 7` plutôt qu'une soustraction naïve.
 */
export type ClePeriode = 'aujourdhui' | 'hier' | 'semaine' | 'mois' | 'annee'

/** Le jour d'une date en « AAAA-MM-JJ », lu en heure LOCALE — `toISOString()` recule d'un jour le soir. */
function jourIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${j}`
}

export const PERIODES: { cle: ClePeriode; libelle: string; bornes: () => { du: string; au: string } }[] = [
  {
    cle: 'aujourdhui',
    libelle: 'Aujourd’hui',
    bornes: () => {
      const j = jourIso(new Date())
      return { du: j, au: j }
    },
  },
  {
    cle: 'hier',
    libelle: 'Hier',
    bornes: () => {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      const j = jourIso(d)
      return { du: j, au: j }
    },
  },
  {
    cle: 'semaine',
    libelle: 'Cette semaine',
    bornes: () => {
      const maintenant = new Date()
      const lundi = new Date(maintenant)
      lundi.setDate(maintenant.getDate() - ((maintenant.getDay() + 6) % 7))
      return { du: jourIso(lundi), au: jourIso(maintenant) }
    },
  },
  {
    cle: 'mois',
    libelle: 'Ce mois',
    bornes: () => {
      const maintenant = new Date()
      return {
        du: jourIso(new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)),
        au: jourIso(maintenant),
      }
    },
  },
  {
    cle: 'annee',
    libelle: 'Cette année',
    bornes: () => {
      const maintenant = new Date()
      return { du: `${maintenant.getFullYear()}-01-01`, au: jourIso(maintenant) }
    },
  },
]

export function useKpiAppels(cle: ClePeriode) {
  const periode = PERIODES.find((p) => p.cle === cle) ?? PERIODES[0]
  const { du, au } = periode.bornes()
  return useQuery({
    // LES BORNES SONT DANS LA CLÉ, pas seulement le nom de la période : « aujourd'hui » change de
    // sens à minuit, et une clé qui ne le dit pas servirait les chiffres de la veille au matin.
    queryKey: ['kpi-appels', cle, du, au],
    // CINQ MINUTES DE FRAÎCHEUR. Ce sont des chiffres de période, pas un état en temps réel :
    // les relire à chaque montage de l'onglet ferait deux appels à Allo pour le même nombre.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<KpiAppels> => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Session expirée — rechargez la page.')

      const res = await fetch(`/api/allo/kpi?du=${du}&au=${au}`, {
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
