import { useMutation, useQuery } from '@tanstack/react-query'
import { authHeader } from '@/lib/data/authHeader'

export interface EllisphereScore {
  siren: string
  score: string | null
  scale: string | null
  /** Classe de risque en clair, ex. « Risque moyen à élevé (classe C) ». Absent si seul le
   * repli « liste de surveillance » a répondu (il ne porte que la note brute). */
  creditOpinion: string | null
  /** Points faibles / commentaire du score. Même réserve que creditOpinion. */
  paymentIncidents: string | null
  /** L'encours conseillé, et les notes précédentes — tirés du même rapport, déjà payé. Absents
   *  quand le rapport ne les porte pas : l'écran n'affiche alors rien à leur sujet. */
  encoursConseille?: string | null
  historique?: { valeur: string; date: string | null }[]
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: await authHeader() })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`)
  return data as T
}

export function useEllisphereScore() {
  return useMutation({
    mutationFn: (siren: string) => fetchJson<EllisphereScore>(`/api/ellisphere/score?siren=${encodeURIComponent(siren)}`),
  })
}

/**
 * ══ LA RECHERCHE ENRICHIE ══
 *
 * William, 24/09/2026, pour le parcours de création d'un compte : « une barre de recherche reliée à
 * Ellipro. Cela me permet de faire une recherche enrichie. Au clic sur le résultat qui me convient,
 * un ensemble de champs se pré-remplit. »
 *
 * ELLE N'EST PAS L'ANNUAIRE INSEE, et c'est la différence qui compte. `searchCompanies`
 * (`companyDirectory`) interroge l'API publique : gratuite, sans clé, parfaite pour retrouver un
 * SIREN. Ellisphere est un service payant qui répond avec ce qu'il SAIT du dossier — et surtout,
 * c'est lui qui rendra le score à l'étape suivante. Chercher ici, c'est chercher dans la même base
 * que celle qui notera l'entreprise.
 *
 * ══ ELLE DOIT PARAÎTRE INSTANTANÉE ══
 *
 * William, 24/09/2026 : « la recherche Ellipro doit afficher des propositions beaucoup plus
 * rapidement, presque sans temps de chargement ».
 *
 * L'aller-retour vers Ellisphere, lui, ne raccourcit pas : c'est leur service. Ce qui se corrige,
 * c'est TOUT LE RESTE — et c'est presque tout le temps perçu :
 *
 *   · l'attente avant de partir passe de 400 ms à 150 ;
 *   · les résultats précédents RESTENT à l'écran pendant que les suivants arrivent, au lieu de
 *     laisser un vide puis un squelette. Une liste qui s'affine sous les doigts se lit comme
 *     instantanée ; une liste qui disparaît à chaque lettre se lit comme lente, à durée égale ;
 *   · une recherche déjà faite revient du cache sans aucun appel — et effacer une lettre est le
 *     geste le plus courant qui soit.
 *
 * TROIS CARACTÈRES MINIMUM, et chaque appel reste facturé : c'est pourquoi l'attente descend à
 * 150 ms et non à zéro.
 */
export interface EllisphereCompany {
  raisonSociale: string | null
  nomCommercial: string | null
  siren: string | null
  siret: string | null
  adresse: string | null
  rue: string | null
  codePostal: string | null
  ville: string | null
  codeNAF: string | null
  libelleAPE: string | null
  srcId: string | null
}

export function useRechercheEllisphere(terme: string) {
  const q = terme.trim()
  return useQuery({
    queryKey: ['ellisphere', 'recherche', q],
    enabled: q.length >= 3,
    /* Une heure : une raison sociale ne change pas dans la séance, et revenir en arrière dans sa
       frappe ne doit jamais coûter un appel. */
    staleTime: 60 * 60 * 1000,
    retry: false,
    /* Ce qui était affiché le reste pendant que la suite arrive. */
    placeholderData: (precedent) => precedent,
    queryFn: async (): Promise<EllisphereCompany[]> => {
      /* Un SIRET ou un SIREN se cherche par identifiant, un nom par raison sociale : l'API a deux
         portes, et se tromper de porte ne rend rien. */
      const chiffres = q.replace(/\s/g, '')
      const parIdentifiant = /^\d{9}(\d{5})?$/.test(chiffres)
      const url = parIdentifiant
        ? `/api/ellisphere/search?siret=${encodeURIComponent(chiffres)}`
        : `/api/ellisphere/search?name=${encodeURIComponent(q)}`
      const data = await fetchJson<{ company?: EllisphereCompany; companies?: EllisphereCompany[] }>(url)
      if (data.company) return [data.company]
      return data.companies ?? []
    },
  })
}
