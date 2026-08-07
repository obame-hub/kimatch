import { useEffect, useMemo, useState } from 'react'

const TRANCHE_INITIALE = 100
const TRANCHE_SUIVANTE = 200

/**
 * Borne le nombre de lignes réellement rendues dans une liste.
 *
 * Les tables du CRM sont grosses (6346 sites, 7884 compteurs, 66 643 interactions) et les pages
 * rendaient tout d'un coup : plusieurs secondes de travail pour le navigateur alors que l'écran
 * n'en montre qu'une vingtaine, et pendant ce temps il traite les réponses réseau au ralenti.
 * Sur la liste des sites, borner l'affichage a fait passer le chargement complet de 30 s à 7 s
 * (mesuré en production le 06/08/2026).
 *
 * Le filtrage et le tri restent faits sur la liste COMPLÈTE en amont : seul l'affichage est borné,
 * donc une recherche continue de porter sur l'ensemble des données.
 *
 * `signature` sert à repartir du début quand la liste change de nature (nouvelle recherche, tri
 * inversé) : y passer la requête et la clé de tri.
 */
export function useTranchesAffichage<T>(items: T[] | undefined, signature: unknown) {
  const [nbAffiches, setNbAffiches] = useState(TRANCHE_INITIALE)

  useEffect(() => {
    setNbAffiches(TRANCHE_INITIALE)
  }, [signature])

  const total = items?.length ?? 0
  const visibles = useMemo(() => (items ?? []).slice(0, nbAffiches), [items, nbAffiches])

  return {
    visibles,
    total,
    reste: total - visibles.length,
    afficherPlus: () => setNbAffiches((n) => n + TRANCHE_SUIVANTE),
    tailleTrancheSuivante: TRANCHE_SUIVANTE,
  }
}
