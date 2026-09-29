import { Suspense, createContext, lazy, useCallback, useContext, useMemo, useState } from 'react'
import { useCompteCourant } from '@/lib/creationContact'
import type { DemandeMandat } from '@/components/mandat/ParcoursCreationMandat'

/**
 * ══ LE PARCOURS DE CRÉATION D'UN MANDAT, OUVERT DE PARTOUT ══
 *
 * William, 29/09/2026 : faire de la création de mandat un process à part entière, sur le modèle de
 * celui de la conversion d'une piste. Comme les parcours du compte, du contact et du compteur, il
 * s'ouvre PAR-DESSUS l'écran courant.
 *
 * LE COMPTE PART DE LA FICHE OUVERTE (`useDeclarerCompteCourant`). Ce que l'appelant sait prime :
 * une opportunité donne elle-même son compte, son contact et ses compteurs.
 *
 * Le parcours est chargé à la demande : son code ne pèse rien tant qu'on ne l'ouvre pas.
 */
const ParcoursCreationMandat = lazy(() =>
  import('@/components/mandat/ParcoursCreationMandat').then((m) => ({ default: m.ParcoursCreationMandat })),
)

const Contexte = createContext<{ ouvrir: (demande?: DemandeMandat) => void } | null>(null)

export function CreationMandatProvider({ children }: { children: React.ReactNode }) {
  const [demande, setDemande] = useState<DemandeMandat | null>(null)
  const compteCourant = useCompteCourant()
  const ouvrir = useCallback((d?: DemandeMandat) => setDemande(d ?? {}), [])
  const valeur = useMemo(() => ({ ouvrir }), [ouvrir])
  const fermer = useCallback(() => setDemande(null), [])

  return (
    <Contexte.Provider value={valeur}>
      {children}
      {demande && (
        <Suspense fallback={null}>
          <ParcoursCreationMandat
            /* `compte: null` explicite veut dire « sans compte » : on ne reprend pas celui de la
               fiche. Absent, on le reprend. */
            demande={{ ...demande, compte: demande.compte === undefined ? compteCourant : demande.compte }}
            onFermer={fermer}
          />
        </Suspense>
      )}
    </Contexte.Provider>
  )
}

export function useCreerUnMandat(): (demande?: DemandeMandat) => void {
  return useContext(Contexte)?.ouvrir ?? (() => {})
}
