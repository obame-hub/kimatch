import { createHmac, timingSafeEqual } from 'crypto'

/**
 * LES TROIS DÉCISIONS DU WEBHOOK DOCUSIGN, SORTIES DU HANDLER POUR ÊTRE TESTÉES.
 *
 * Elles vivaient à l'intérieur de la fonction de requête, donc sans filet — alors que ce sont
 * exactement les règles qui décident si un contrat passe à « Signé ». Une régression y est
 * silencieuse : le mandat reste dans son ancien état, personne ne voit d'erreur, et on ne s'en
 * aperçoit qu'en cherchant pourquoi une signature n'est jamais arrivée. C'est précisément ce qui
 * s'est produit pendant des semaines — 25 notifications refusées en 401, dont l'enveloppe signée de
 * CABINET MOLINIER.
 *
 * Le comportement est inchangé : ce fichier ne fait que déplacer le code.
 */

/**
 * La signature HMAC de DocuSign porte sur les OCTETS REÇUS, jamais sur une re-sérialisation du
 * corps : `JSON.parse` puis `JSON.stringify` change les espaces et l'ordre des clés, et la
 * signature ne correspond plus. C'était la première des deux causes des 401.
 *
 * La comparaison est à temps constant (`timingSafeEqual`) : comparer avec `===` laisse fuir, par
 * la durée, le nombre de caractères devinés justes.
 */
export function verifierSignature(
  corpsBrut: string,
  entete: string | undefined,
  secret: string,
): boolean {
  if (!entete) return false
  const attendu = createHmac('sha256', secret).update(corpsBrut, 'utf8').digest('base64')
  const a = Buffer.from(entete)
  const b = Buffer.from(attendu)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * L'état d'enveloppe DocuSign traduit en statut de signature Kimatch.
 *
 * Tout état non listé (`created`, `deleted`…) rend `null` : on préfère ignorer une notification que
 * d'inventer un statut.
 */
export function statutPourEnveloppe(etat: string | undefined | null): string | null {
  /**
   * `delivered` NE VEUT PAS DIRE « REMIS », IL VEUT DIRE « OUVERT ».
   *
   * DocuSign l'émet quand le destinataire affiche l'enveloppe. Le traduire en « Envoyé » perdait
   * l'information la plus utile du parcours : un client qui a ouvert le mandat sans le signer est
   * exactement celui qu'il faut relancer, et rien ne le distinguait d'un client qui n'a pas encore
   * regardé son courrier. William, 08/09/2026 : « à la seconde où le client a consulté le mandat,
   * le statut passe immédiatement à Consulté ».
   *
   * `completed` reste traduit « SIGNE » ICI, et ce n'est pas une contradiction avec la suppression
   * du jalon : cette fonction dit ce qu'est devenue L'ENVELOPPE, pas ce que devient l'objet. Deux
   * objets la lisent — `statutAEcrire` pour le mandat, qui en tire « Actif » ou « Expiré », et
   * `statutMetierContrat` pour le contrat, dont le vocabulaire garde un « Signé » bien vivant.
   */
  const parEvenement: Record<string, string> = {
    sent: 'ENVOYE',
    delivered: 'CONSULTE',
    completed: 'SIGNE',
    declined: 'REFUSE',
    voided: 'ANNULE',
  }
  if (!etat) return null
  return parEvenement[etat] ?? null
}

/**
 * UNE SIGNATURE NE SE DÉFAIT PAS.
 *
 * DocuSign rejoue ses notifications quand la première n'a pas abouti, et rien ne garantit qu'elles
 * arrivent dans l'ordre. Sans cette règle, un rejeu de « sent » arrivé après « completed » ramènerait
 * un contrat signé à « envoyé » — et le mandat repartirait en attente de quelque chose qui a déjà eu
 * lieu.
 */
const AVANT_SIGNATURE = new Set(['ENVOYE', 'CONSULTE'])

export function doitEcrire(statutActuel: string | null | undefined, statutRecu: string): boolean {
  // « Consulté » s'ajoute à « Envoyé » le 08/09/2026 : un rejeu de `delivered` arrivé après
  // `completed` ramènerait sinon un contrat signé à « le client vient d'ouvrir le document ».
  if (statutActuel === 'SIGNE' && AVANT_SIGNATURE.has(statutRecu)) return false
  return true
}


/**
 * ══ LES DEUX RÈGLES DE TRADUCTION, EN UN SEUL ENDROIT ══
 *
 * Elles vivaient dans `webhook.ts`, sans être exportées. Le 31/08/2026 j'ai fait interroger DocuSign
 * depuis `etat-enveloppe.ts` sans les réutiliser : ce chemin écrivait donc « Signé » là où le webhook
 * aurait écrit « Actif ». Constaté sur le mandat SENAC IMMOBILIER — signé, mais reste invisible pour
 * les recommandations, exactement le bug que Michel avait signalé le 21/08.
 *
 * UNE RÈGLE MÉTIER ÉCRITE À DEUX ENDROITS N'EST PAS DUPLIQUÉE, ELLE EST DÉDOUBLÉE : les deux copies
 * divergent, et c'est celle qu'on n'a pas relue qui s'exécute. Elles sont donc ici, et les deux
 * chemins — notification et vérification manuelle — les importent.
 */
export function statutAEcrire(
  statutDocusign: string,
  fenetre: { debut: string | null; fin: string | null },
): string {
  if (statutDocusign !== 'SIGNE') return statutDocusign
  /**
   * UN MANDAT SIGNÉ EST ACTIF, OU PÉRIMÉ — plus jamais « Signé ».
   *
   * Le jalon a été supprimé du référentiel le 08/09/2026 (migration 20260908230000) : il n'a jamais
   * désigné une seule ligne sur les 1 466 mandats de la base, mais la frise le proposait au clic, et
   * s'y arrêter rendait le compte invisible dans la création de recommandation. Retourner « SIGNE »
   * ici écrirait donc un code que le référentiel ne connaît plus.
   *
   * HORS FENÊTRE, C'EST « EXPIRÉ ». Le cas se produit quand on enregistre après coup un mandat déjà
   * échu — jamais sur une signature DocuSign du jour, dont le début EST la date de signature.
   */
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const commence = !fenetre.debut || fenetre.debut <= aujourdhui
  const courtEncore = !fenetre.fin || fenetre.fin >= aujourdhui
  return commence && courtEncore ? 'ACTIF' : 'EXPIRE'
}

export function statutMetierContrat(
  statutSignature: string,
  fenetre: { debut: string | null; fin: string | null },
): string | null {
  if (statutSignature === 'REFUSE' || statutSignature === 'ANNULE') return 'ANNULE'
  // « Consulté » n'existe pas dans le vocabulaire du contrat : ouvert ou non, il reste à signer.
  if (statutSignature === 'ENVOYE' || statutSignature === 'CONSULTE') return 'A_SIGNER'
  if (statutSignature !== 'SIGNE') return null
  if (!fenetre.debut) return 'SIGNE'
  const aujourdhui = new Date().toISOString().slice(0, 10)
  if (fenetre.debut > aujourdhui) return 'A_VENIR'
  if (fenetre.fin && fenetre.fin < aujourdhui) return 'TERMINE'
  return 'ACTIF'
}
