import { Suspense, createContext, lazy, useCallback, useContext, useMemo, useState } from 'react'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CRÉER UN COMPTE, DEPUIS N'IMPORTE OÙ, SANS QUITTER L'ÉCRAN
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 24/09/2026 : « vérifie sur toutes les pages tous les boutons d'action permettant de
 * créer un nouveau compte. Je veux que tous les boutons lancent ce process. Je ne veux aucun
 * bouton qui passe à la trappe. »
 *
 * Ils étaient QUATRE, et ils faisaient trois choses différentes :
 *
 *   · le bouton « Nouveau compte » de la liste            ouvrait le parcours
 *   · le menu « Créer » de la barre du haut               allait sur /comptes/nouveau (ancien écran)
 *   · le hub de la fiche compte                           allait sur /comptes avec un état de
 *   · le hub de la liste des contacts                     navigation que plus personne ne lisait
 *
 * Les deux derniers ne faisaient donc plus RIEN depuis que la liste des comptes a cessé d'écouter
 * `state.openCreate` : ils déposaient sur une liste, sans un mot.
 *
 * ── POURQUOI UN CONTEXTE, ET PAS UN CHEMIN ───────────────────────────────────────────────────
 *
 * Les dix autres objets s'ouvrent par `?creer=1` sur l'écran de l'objet (voir `ouvrirCreation.ts`),
 * parce que leur formulaire VIT dans cet écran. Le parcours de création d'un compte, lui, est une
 * fenêtre modale autonome — et c'est le point de la décision de William du 23/09 : « ça donne plus
 * l'impression qu'un process se lance, et non pas un changement de page complet ».
 *
 * Le faire passer par une navigation annulerait exactement cela : lancer une création de compte
 * depuis une fiche piste vous téléporterait sur la liste des comptes avant d'ouvrir la fenêtre, et
 * la fermer vous laisserait là. Monté une fois au-dessus de l'application, le parcours s'ouvre
 * PAR-DESSUS l'écran où l'on travaille, quel qu'il soit.
 *
 * `?creer=1` SUR /comptes CONTINUE DE MARCHER : c'est le lien partageable, et c'est ce que sert
 * désormais l'ancienne adresse `/comptes/nouveau`. Voir `src/pages/Comptes.tsx`.
 *
 * ── LE PARCOURS EST CHARGÉ À LA DEMANDE ──────────────────────────────────────────────────────
 *
 * Il tire la recherche Ellisphere, la carte de score, le formulaire de contact et celui des
 * compteurs. Monter ce fournisseur dans la coque ne doit pas faire peser tout cela sur le premier
 * chargement de quelqu'un qui ne créera aucun compte de la journée : `lazy` ne télécharge le
 * morceau qu'au premier clic.
 */

const ParcoursCreationCompte = lazy(() =>
  import('@/components/compte/ParcoursCreationCompte').then((m) => ({ default: m.ParcoursCreationCompte })),
)

const Contexte = createContext<{ ouvrir: () => void } | null>(null)

export function CreationCompteProvider({ children }: { children: React.ReactNode }) {
  const [ouverte, setOuverte] = useState(false)
  const ouvrir = useCallback(() => setOuverte(true), [])
  const valeur = useMemo(() => ({ ouvrir }), [ouvrir])

  return (
    <Contexte.Provider value={valeur}>
      {children}
      {ouverte && (
        /* Aucun repli visible : la fenêtre s'ouvre quand son morceau est là. Un squelette de
           chargement à la place d'une modale qui n'existe pas encore clignoterait pour rien — le
           morceau pèse peu et arrive en une fraction de seconde sur un réseau de bureau. */
        <Suspense fallback={null}>
          <ParcoursCreationCompte onFermer={() => setOuverte(false)} />
        </Suspense>
      )}
    </Contexte.Provider>
  )
}

/**
 * Ouvre le parcours de création d'un compte par-dessus l'écran courant.
 *
 * Hors du fournisseur (un test, un écran monté seul), la fonction ne fait rien plutôt que de lever :
 * un bouton inerte est un défaut visible à l'usage, une exception casse l'écran entier.
 */
export function useCreerUnCompte(): () => void {
  const ctx = useContext(Contexte)
  return ctx?.ouvrir ?? (() => {})
}
