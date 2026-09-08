/**
 * L'ÉCHÉANCE D'UNE TÂCHE, AVEC OU SANS HEURE.
 *
 * `actions.date_prevue` est un `timestamptz`, donc l'heure a toujours été stockable — mais aucun
 * formulaire ne la proposait : le champ était un `<input type="date">`. Constaté le 25/08/2026 en
 * portant « Ma journée » de la maquette de Michel, qui affiche « 09:30 · Présenter la
 * recommandation » : le bloc aurait montré un tiret sur chaque ligne, et le badge « Dans 45 min »
 * n'aurait jamais pu apparaître.
 *
 * DEUX PIÈGES, ET C'EST TOUTE LA RAISON D'ÊTRE DE CE FICHIER.
 *
 * · UNE CHAÎNE `2026-08-26` ENVOYÉE À POSTGRES DEVIENT MINUIT UTC, soit 2 h du matin à Paris en été.
 *   Une tâche sans heure s'affichait donc « 02:00 » — un rendez-vous nocturne inventé par un décalage
 *   horaire. On envoie donc toujours un instant complet, calculé depuis l'heure LOCALE : minuit local
 *   quand aucune heure n'est donnée, ce qui permet aussi de reconnaître « pas d'heure » à la lecture.
 * · `new Date('2026-08-26T09:30')` EST INTERPRÉTÉ EN HEURE LOCALE par le navigateur, et `toISOString`
 *   rend l'instant UTC correspondant. C'est exactement la conversion voulue : ce que le commercial
 *   tape est ce qu'il lira, où qu'il soit.
 */

/** L'instant à stocker, depuis une date `AAAA-MM-JJ` et une heure `HH:MM` facultative. */
export function instantTache(date: string | null | undefined, heure?: string | null): string | null {
  if (!date) return null
  const d = new Date(`${date}T${heure && heure.length >= 4 ? heure : '00:00'}`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/**
 * L'heure `HH:MM` d'un instant stocké, ou `null` s'il tombe à minuit local — c'est-à-dire s'il n'a
 * pas d'heure. Sert à ne PAS perdre l'heure d'une tâche quand on ne modifie que sa date.
 */
export function heureDe(instant: string | null | undefined): string | null {
  if (!instant) return null
  const d = new Date(instant)
  if (Number.isNaN(d.getTime())) return null
  if (d.getHours() === 0 && d.getMinutes() === 0) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** L'échéance telle qu'on la montre : la date seule, ou la date et l'heure. */
export function echeanceLisible(instant: string | null | undefined): string {
  if (!instant) return ''
  const d = new Date(instant)
  if (Number.isNaN(d.getTime())) return ''
  const jour = d.toLocaleDateString('fr-FR')
  const h = heureDe(instant)
  return h ? `${jour} à ${h}` : jour
}
