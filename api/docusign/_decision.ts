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
 * `delivered` veut dire « ouverte par le destinataire », pas « livrée au sens du courrier » : côté
 * métier c'est toujours « envoyé, en attente ». Tout état non listé (`created`, `deleted`…) rend
 * `null` : on préfère ignorer une notification que d'inventer un statut.
 */
export function statutPourEnveloppe(etat: string | undefined | null): string | null {
  const parEvenement: Record<string, string> = {
    sent: 'ENVOYE',
    delivered: 'ENVOYE',
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
export function doitEcrire(statutActuel: string | null | undefined, statutRecu: string): boolean {
  if (statutActuel === 'SIGNE' && statutRecu === 'ENVOYE') return false
  return true
}
