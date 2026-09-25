import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Contact } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CRÉER UN CONTACT, DEPUIS N'IMPORTE OÙ, AVEC LE BON COMPTE DÉJÀ RENSEIGNÉ
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 24/09/2026 : « en fonction de la page depuis laquelle je lance le process, il faudra
 * lier ce nouveau contact au compte lié à l'enregistrement d'origine (bien qu'il puisse être changé
 * rapidement) […] ce process de création de contact devra avoir lieu depuis n'importe quel bouton,
 * lien ou autre permettant de créer un contact. »
 *
 * C'est la même mécanique que pour le compte (`creationCompte.tsx`), avec une exigence de plus, et
 * c'est elle qui justifie le second contexte : LE PARCOURS DOIT SAVOIR OÙ L'ON ÉTAIT.
 *
 * ── LE COMPTE DE L'ÉCRAN, DÉCLARÉ PAR L'ÉCRAN ────────────────────────────────────────────────
 *
 * Le menu « Créer » vit dans la barre du haut : il est monté par les 36 écrans et ne sait rien
 * d'aucun d'eux. Le deviner depuis l'adresse reviendrait à écrire, dans la barre, une table des
 * chemins de Kimatch — `/compteurs/:id` donne un compteur, dont il faudrait lire le compte, etc. —
 * qui serait fausse au prochain écran ajouté.
 *
 * Alors c'est la fiche qui parle : `useDeclarerCompteCourant(id, nom)`, une ligne dans chaque fiche
 * qui connaît son compte. La barre lit ce que l'écran a déclaré. Un écran qui ne déclare rien — une
 * liste, un tableau de bord — laisse simplement le parcours demander le compte, ce qu'il sait faire.
 *
 * LA DÉCLARATION S'EFFACE AU DÉMONTAGE. Sans cela, quitter une fiche compte pour le tableau de bord
 * y laisserait le compte précédent, et le contact suivant serait rattaché au mauvais client sans
 * que rien ne l'annonce. C'est le genre d'erreur qu'on ne voit qu'au moment des commissions.
 *
 * ── `onCree` : CEUX QUI ATTENDENT LE CONTACT ─────────────────────────────────────────────────
 *
 * Trois écrans ne créent pas un contact pour lui-même : ils le créent pour le CHOISIR dans le
 * formulaire qu'ils sont en train de remplir — une recommandation, un contrat, un compteur. Ils
 * passent `onCree`, reçoivent le contact et le sélectionnent. Le parcours, lui, ne les emmène pas
 * sur la fiche du nouveau contact : ils perdraient leur saisie.
 */

const ParcoursCreationContact = lazy(() =>
  import('@/components/contact/ParcoursCreationContact').then((m) => ({ default: m.ParcoursCreationContact })),
)

export interface CompteCourant {
  id: string
  nom: string
}

export type TypeDeContact = 'contact' | 'membreCS'

interface DemandeCreation {
  compte?: CompteCourant | null
  /**
   * Le type avec lequel le parcours s'ouvre.
   *
   * Il vient des fentes d'un compteur : ouvrir « Créer un membre CS » depuis le champ du conseil
   * syndical et retomber sur un contact ordinaire renverrait quelqu'un qui n'y serait pas éligible
   * — on aurait créé exactement le contact qu'on ne cherchait pas. Le choix reste modifiable dans
   * l'écran : c'est un point de départ, pas un verrou.
   */
  type?: TypeDeContact
  onCree?: (contact: Contact) => void
}

interface ValeurContexte {
  ouvrir: (demande?: DemandeCreation) => void
  compteCourant: CompteCourant | null
  declarer: (compte: CompteCourant | null) => void
}

const Contexte = createContext<ValeurContexte | null>(null)

export function CreationContactProvider({ children }: { children: React.ReactNode }) {
  const [demande, setDemande] = useState<DemandeCreation | null>(null)
  const [compteCourant, setCompteCourant] = useState<CompteCourant | null>(null)

  const ouvrir = useCallback((d?: DemandeCreation) => setDemande(d ?? {}), [])
  const declarer = useCallback((c: CompteCourant | null) => {
    /* Comparer avant d'écrire : les fiches recalculent leur objet compte à chaque rendu, et poser
       l'état à chaque fois relancerait le rendu en boucle. */
    setCompteCourant((precedent) =>
      precedent?.id === c?.id && precedent?.nom === c?.nom ? precedent : c,
    )
  }, [])

  const valeur = useMemo(() => ({ ouvrir, compteCourant, declarer }), [ouvrir, compteCourant, declarer])

  return (
    <Contexte.Provider value={valeur}>
      {children}
      {demande && (
        <Suspense fallback={null}>
          <ParcoursCreationContact
            /* Ce que l'appelant sait prime sur ce que l'écran a déclaré : le sélecteur de contact
               d'une recommandation connaît le compte du dossier, qui n'est pas forcément celui de
               la fiche ouverte derrière. */
            compte={demande.compte ?? compteCourant}
            type={demande.type}
            onCree={demande.onCree}
            onFermer={() => setDemande(null)}
          />
        </Suspense>
      )}
    </Contexte.Provider>
  )
}

/**
 * Ouvre le parcours de création d'un contact par-dessus l'écran courant.
 *
 * Sans argument, il part avec le compte que l'écran a déclaré. Avec `{ compte }`, il part avec
 * celui-là. Avec `{ onCree }`, il rend le contact créé au lieu d'ouvrir sa fiche.
 *
 * Hors du fournisseur, la fonction ne fait rien plutôt que de lever : un bouton inerte est un
 * défaut visible à l'usage, une exception casse l'écran entier.
 */
export function useCreerUnContact(): (demande?: DemandeCreation) => void {
  return useContext(Contexte)?.ouvrir ?? (() => {})
}

/**
 * À poser dans toute fiche qui connaît son compte, pour que le menu « Créer » de la barre du haut
 * rattache le contact au bon client sans le redemander.
 *
 * Les deux arguments sont acceptés vides : une fiche les découvre après sa requête, et appeler le
 * crochet conditionnellement serait interdit.
 */
export function useDeclarerCompteCourant(id: string | null | undefined, nom: string | null | undefined) {
  const declarer = useContext(Contexte)?.declarer
  useEffect(() => {
    if (!declarer) return
    declarer(id && nom ? { id, nom } : null)
    return () => declarer(null)
  }, [declarer, id, nom])
}
