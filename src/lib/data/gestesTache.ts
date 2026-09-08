import { useEffect, useRef, useState } from 'react'
import { useCompleteAction, useReouvrirAction, useReporterAction } from '@/lib/data/actions'

/**
 * ══ LES DEUX GESTES QU'ON FAIT SUR UNE TÂCHE, PARTAGÉS PAR LES ÉCRANS QUI LES OFFRENT ══
 *
 * Cocher avec cinq secondes pour se rétracter, et reporter en un clic. Ces deux gestes vivaient
 * dans `TachesOuvertes` — le volet d'activité — et William, 08/09/2026, les a demandés aussi dans
 * « Ma journée » : « ajoute les mêmes logiques que sur les fils d'activités ».
 *
 * ── POURQUOI EXTRAIRE PLUTÔT QUE RECOPIER ──
 *
 * Ce n'est pas un principe, c'est une cicatrice. Le 07/09/2026, deux écrans affichaient la même
 * tâche avec deux états contradictoires — l'un « réalisée », l'autre « à faire » — parce que
 * `useCompleteAction` posait la date de réalisation sans toucher au statut, et que chaque écran
 * lisait celui des deux champs qui l'arrangeait. Douze lignes à corriger en base. Deux
 * implémentations de la même intention finissent toujours par diverger : la seconde reçoit une
 * correction que la première ignore.
 *
 * Le RENDU, lui, reste à chaque écran : le volet de droite dispose de 324 px, le tableau de bord
 * d'une demi-largeur. Ce qui se partage ici, c'est ce que le geste FAIT, pas ce à quoi il ressemble.
 */

export interface ReportPropose {
  libelle: string
  calcul: (base: Date) => Date
}

/**
 * Les trois reports proposés.
 *
 * L'HEURE EST CONSERVÉE pour « demain » et « +1 semaine » : une tâche prévue à 9 h le reste,
 * décaler le jour ne doit pas décaler la matinée. « Lundi » repart à 9 h, parce qu'aucune heure de
 * vendredi soir n'a de sens le lundi matin.
 */
export const REPORTS: ReportPropose[] = [
  {
    libelle: 'Demain',
    calcul: (base) => {
      const d = new Date(base)
      d.setDate(d.getDate() + 1)
      return d
    },
  },
  {
    libelle: '+1 semaine',
    calcul: (base) => {
      const d = new Date(base)
      d.setDate(d.getDate() + 7)
      return d
    },
  },
  {
    libelle: 'Lundi',
    calcul: (base) => {
      const d = new Date(base)
      // `getDay()` vaut 0 le dimanche : le reste de la division ramène toujours sur le lundi
      // suivant, et jamais sur aujourd'hui même si l'on est déjà lundi.
      const versLundi = ((8 - d.getDay()) % 7) || 7
      d.setDate(d.getDate() + versLundi)
      d.setHours(9, 0, 0, 0)
      return d
    },
  },
]

/** Une tâche fraîchement cochée, gardée à l'écran le temps de pouvoir se rétracter. */
export interface TacheAnnulable {
  id: string
  titre: string
}

export function useGestesTache() {
  const completer = useCompleteAction()
  const reouvrir = useReouvrirAction()
  const reporterAction = useReporterAction()

  const [annulables, setAnnulables] = useState<TacheAnnulable[]>([])
  const minuteurs = useRef<number[]>([])

  // Les minuteurs meurent avec le composant : sans ce nettoyage, quitter l'écran pendant les cinq
  // secondes déclencherait un `setState` sur un composant démonté.
  useEffect(() => {
    const encours = minuteurs.current
    return () => encours.forEach((t) => window.clearTimeout(t))
  }, [])

  /** Coche la tâche et ouvre la fenêtre de rétractation de cinq secondes. */
  function cocher(id: string, titre: string) {
    completer.mutate(id)
    setAnnulables((liste) => [...liste, { id, titre }])
    const t = window.setTimeout(() => {
      setAnnulables((liste) => liste.filter((x) => x.id !== id))
    }, 5000)
    minuteurs.current.push(t)
  }

  function annuler(id: string) {
    reouvrir.mutate(id)
    setAnnulables((liste) => liste.filter((x) => x.id !== id))
  }

  /**
   * Reporte une tâche.
   *
   * LA BASE DE CALCUL EST L'ÉCHÉANCE ACTUELLE, pas aujourd'hui : reporter « +1 semaine » une tâche
   * déjà en retard de trois jours doit partir de son échéance, sinon le report grignote le retard
   * au lieu de le déplacer.
   */
  function reporter(id: string, echeanceActuelle: string | null | undefined, report: ReportPropose) {
    const base = echeanceActuelle ? new Date(echeanceActuelle) : new Date()
    reporterAction.mutate({ actionId: id, echeance: report.calcul(base).toISOString() })
  }

  return {
    cocher,
    annuler,
    reporter,
    annulables,
    /** Vrai pendant l'aller-retour réseau : les cases se désactivent pour éviter le double clic. */
    enCours: completer.isPending,
  }
}
