import { Suspense, createContext, lazy, useCallback, useContext, useMemo, useState } from 'react'
import { useCompteCourant } from '@/lib/creationContact'

/**
 * ══ LE PARCOURS DE CRÉATION D'UN COMPTEUR, OUVERT DE PARTOUT ══
 *
 * William, 29/09/2026 : en faire « un process à part entière, avec le même design ». Comme ceux du
 * compte et du contact, il s'ouvre PAR-DESSUS l'écran courant plutôt que de naviguer : « ça donne
 * plus l'impression qu'un process se lance, et non pas un changement de page complet » (23/09).
 *
 * LE COMPTE PART DE LA FICHE OUVERTE. Chaque fiche déclare son compte (`useDeclarerCompteCourant`,
 * partagé avec le contact) ; le parcours le reprend et passe directement à la méthode. Ce que
 * l'appelant sait prime : un bouton qui connaît son compte le donne lui-même.
 *
 * Le parcours est chargé à la demande : son code ne pèse rien tant qu'on ne l'ouvre pas.
 */
const ParcoursCreationCompteur = lazy(() =>
  import('@/components/compteur/ParcoursCreationCompteur').then((m) => ({ default: m.ParcoursCreationCompteur })),
)

interface DemandeCompteur {
  compte?: { id: string; nom: string } | null
}

const Contexte = createContext<{ ouvrir: (demande?: DemandeCompteur) => void } | null>(null)

export function CreationCompteurProvider({ children }: { children: React.ReactNode }) {
  const [demande, setDemande] = useState<DemandeCompteur | null>(null)
  const compteCourant = useCompteCourant()
  const ouvrir = useCallback((d?: DemandeCompteur) => setDemande(d ?? {}), [])
  const valeur = useMemo(() => ({ ouvrir }), [ouvrir])
  const fermer = useCallback(() => setDemande(null), [])

  return (
    <Contexte.Provider value={valeur}>
      {children}
      {demande && (
        <Suspense fallback={null}>
          <ParcoursCreationCompteur
            /* `compte: null` explicite veut dire « sans compte » : on ne reprend pas celui de la
               fiche. Absent, on le reprend. */
            compteInitial={demande.compte === undefined ? compteCourant : demande.compte}
            onFermer={fermer}
          />
        </Suspense>
      )}
    </Contexte.Provider>
  )
}

export function useCreerUnCompteur(): (demande?: DemandeCompteur) => void {
  return useContext(Contexte)?.ouvrir ?? (() => {})
}
