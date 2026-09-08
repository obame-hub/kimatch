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

/**
 * L'HEURE, QUAND UN HUMAIN L'A CHOISIE — et rien d'autre.
 *
 * William, 08/09/2026 : « neutralise l'heure de ces tâches ». Constaté le même jour sur les 337
 * tâches ouvertes de la base : 156 portaient une heure, dont **150 à midi UTC**, c'est-à-dire
 * 13:00 ou 14:00 à Paris selon l'heure d'été. Six seulement avaient été posées à la main.
 *
 * ── D'OÙ VIENT MIDI ──
 *
 * L'import Salesforce de Naoëlle (`importer-taches-ouvertes-salesforce.cjs`, 08/09/2026) écrit
 * `ActivityDate + T12:00:00Z`, et sa raison est bonne : `ActivityDate` n'a que le jour, et minuit
 * UTC bascule d'une journée dès qu'on le lit depuis un fuseau à l'ouest. Midi met la date à l'abri
 * dans les deux sens.
 *
 * Seulement la convention de CETTE application est l'inverse — minuit LOCAL veut dire « pas
 * d'heure », c'est ce que `heureDe` sait lire. Les deux conventions sont défendables ; ensemble,
 * elles font annoncer à 150 tâches un rendez-vous à 14 h que personne n'a fixé.
 *
 * ── POURQUOI `source_externe_id` PLUTÔT QU'UNE RÈGLE SUR MIDI ──
 *
 * Neutraliser « tout ce qui tombe à midi UTC » effacerait aussi le vrai rendez-vous de 14 h qu'un
 * commercial posera un jour d'été. La provenance, elle, ne se trompe pas : une tâche importée n'a
 * jamais eu d'heure à l'origine, quelle que soit celle qu'on lui a donnée en la rangeant.
 *
 * À TERME C'EST L'IMPORT QU'IL FAUT ALIGNER, pas l'affichage — la donnée restera fausse en base
 * tant que personne ne l'aura reprise avec Naoëlle. Cette fonction évite d'attendre cet arbitrage
 * pour cesser d'afficher une heure inventée.
 */
export function heureChoisie(
  instant: string | null | undefined,
  sourceExterne: string | null | undefined,
): string | null {
  if (sourceExterne) return null
  return heureDe(instant)
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
