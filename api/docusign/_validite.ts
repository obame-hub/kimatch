/**
 * ══ LA PÉRIODE DE VALIDITÉ D'UN MANDAT COURT DEPUIS SA SIGNATURE ══
 *
 * William, 08/09/2026, sur le mandat SAS TVPJ : « la date de signature est bien le 08/09/2026, donc
 * la période de validité ne devrait pas commencer au 07/09/2026… et sur 36 mois elle devrait se
 * terminer le 08/09/2029. »
 *
 * ── CE QUI SE PASSAIT ──
 *
 * `date_debut_validite` était posée À LA CRÉATION du mandat, avant tout envoi :
 * `input.date_signature ?? aujourd'hui`. Or un mandat créé dans Kimatch n'a évidemment pas encore de
 * signature — il part au statut « À préparer ». Le début valait donc le jour où on avait préparé le
 * document, et la fin, ce jour-là plus la durée.
 *
 * Le webhook DocuSign écrivait ensuite `date_signature` sans jamais revenir sur ces deux dates. Rien
 * n'était donc « faux » au sens d'un calcul raté : personne ne recalculait. Mesuré le 08/09/2026 sur
 * les 1 164 mandats signés, quatre sont concernés — tous ceux passés par DocuSign depuis que la
 * chaîne existe, chacun décalé d'un ou deux jours.
 *
 * ── POURQUOI CES DEUX FONCTIONS EXISTENT PLUTÔT QU'UN CALCUL EN LIGNE ──
 *
 * Chacune porte un piège de calendrier qui ne se voit pas à la relecture, et toutes deux sont
 * testées dans `__tests__/validite.test.ts`.
 */

/**
 * Le jour d'un instant, tel qu'on le vit à Paris.
 *
 * `completedDateTime` arrive en UTC. Une signature à 23 h 30 le 8 septembre est un 8 septembre pour
 * DocuSign et un 9 septembre pour le client qui vient de signer — c'est sa journée à lui qui fait
 * foi sur un mandat. Deux heures d'écart en été suffisent à décaler la période de validité d'un
 * jour entier, et c'est exactement le genre d'écart qu'on ne retrouve jamais après coup.
 */
export function jourParis(instant: string): string {
  const d = new Date(instant)
  if (Number.isNaN(d.getTime())) throw new Error(`instant illisible : ${instant}`)
  // `en-CA` rend AAAA-MM-JJ, le seul format que Postgres accepte sans ambiguïté.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/**
 * Une date, plus un nombre de mois — en s'arrêtant au dernier jour du mois d'arrivée.
 *
 * `setMonth` de JavaScript DÉBORDE au lieu de s'arrêter : le 31 janvier plus un mois donne le
 * 3 mars, parce que le 31 février n'existe pas et qu'il continue de compter. La fonction
 * précédente (`addMonthsISO`, côté client) faisait exactement cela.
 *
 * Sur 36 mois — la durée de tous les mandats Kiwee — le cas ne se présente que pour un 29 février :
 * 29/02/2028 + 36 mois n'existe pas en 2031, et le mandat se serait terminé le 1ᵉʳ mars. Un jour de
 * validité inventé sur un document juridique, une fois tous les quatre ans, est précisément le
 * genre de défaut que personne ne cherche quand il se produit.
 */
export function ajouterMois(dateISO: string, mois: number): string {
  const [annee, mo, jour] = dateISO.slice(0, 10).split('-').map(Number)
  if (!annee || !mo || !jour) throw new Error(`date illisible : ${dateISO}`)
  // Le jour 0 du mois suivant EST le dernier jour du mois visé.
  const dernierJourDuMois = new Date(Date.UTC(annee, mo - 1 + mois + 1, 0)).getUTCDate()
  const cible = new Date(Date.UTC(annee, mo - 1 + mois, Math.min(jour, dernierJourDuMois)))
  return cible.toISOString().slice(0, 10)
}

/**
 * Les deux dates de validité d'un mandat qui vient d'être signé.
 *
 * Sans durée connue, on pose le début et on laisse la fin telle quelle : 1 137 mandats sur 1 164
 * viennent de Salesforce sans `duree_mois`, et inventer une durée par défaut leur donnerait une
 * échéance que personne n'a signée.
 */
export function validitePourSignature(
  instantSignature: string,
  dureeMois: number | null | undefined,
): { date_debut_validite: string; date_fin_validite?: string } {
  const debut = jourParis(instantSignature)
  return dureeMois && dureeMois > 0
    ? { date_debut_validite: debut, date_fin_validite: ajouterMois(debut, dureeMois) }
    : { date_debut_validite: debut }
}
