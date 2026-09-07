import type { Contact } from '@/types/domain'

/**
 * ══ TOUS LES CONTACTS D'UN COMPTE, Y COMPRIS CEUX QUI N'Y SONT PAS PRINCIPALEMENT ══
 *
 * William, 07/09/2026, sur le contrat CT-01606 : « il faudrait que dans le contrat on puisse
 * sélectionner tous les contacts liés au compte. Là on ne peut sélectionner que Christian, pas
 * Arnaud qui est lui lié via MEMPHIS LENS 2. Guillaume voulait envoyer à Arnaud à la base mais il
 * pouvait pas le sélectionner. » Naoëlle : « il faudrait le rattacher même si ce n'est pas son
 * compte principal. » William : « oui c'est hyper important ça aussi. »
 *
 * ══ LE CAS EXACT QUI L'A FAIT REMONTER ══
 *
 * Contrat CT-01606, compte MEMPHIS BRUAY-LA-BUISSIERE. Deux personnes y sont rattachées :
 *
 *   Christian SCHROTTER   compte_id = MEMPHIS BRUAY   ·  email = AUCUN
 *   Arnaud SCHROTTER      compte_id = MEMPHIS LENS 2  ·  email = direction@acs-group.fr
 *
 * Christian était le seul proposé, et il n'a pas d'email : l'envoi DocuSign était donc impossible
 * alors que la personne à qui il fallait envoyer existait, avec son adresse, rattachée au bon
 * compte — simplement pas par `contacts.compte_id`.
 *
 * ══ DEUX CHEMINS DE RATTACHEMENT, ET UN SEUL ÉTAIT LU ══
 *
 * `contacts.compte_id` porte le compte PRINCIPAL, un seul. Depuis la reprise de
 * AccountContactRelation le 13/08/2026, `contacts_comptes` porte tous les rattachements — un contact
 * peut appartenir à plusieurs comptes, ce qui est la règle chez les syndics et les groupes.
 *
 * Douze écrans filtraient sur `compte_id` seul. Ce fichier existe pour qu'il n'y ait qu'une
 * définition de « les contacts de ce compte », et qu'elle soit la bonne.
 *
 * ══ CE QUE ÇA DÉBLOQUE, MESURÉ LE 07/09/2026 ══
 *
 * 147 rattachements indirects sur 138 comptes, dont 140 avec une adresse email.
 * 233 contrats gagnent des signataires possibles, et 68 d'entre eux n'en avaient AUCUN — comme
 * CT-01606. Ce n'était donc pas un cas isolé, c'était un cas visible.
 */

/**
 * Ce contact est-il rattaché à ce compte, par l'un ou l'autre chemin ?
 *
 * `comptes` porte AUSSI le rattachement principal (`relation_directe = true`), donc le test sur
 * `compte_id` est en théorie redondant. Il reste par prudence : un contact créé hors de l'interface,
 * ou dont la ligne de `contacts_comptes` manquerait, resterait visible sur son compte principal
 * plutôt que de disparaître de tous les écrans.
 */
export function estRattacheAuCompte(contact: Contact, compteId: string | null | undefined): boolean {
  if (!compteId) return false
  if (contact.compte_id === compteId) return true
  return contact.comptes.some((lien) => lien.id === compteId)
}

/**
 * Les contacts d'un compte, dans l'ordre où on les cherche : le compte principal d'abord, puis les
 * rattachés, chacun par ordre alphabétique.
 *
 * L'ORDRE COMPTE, parce que ces listes servent de déroulants et que le premier élément est celui
 * qu'on prend par défaut. Mettre en tête les personnes dont c'est le compte principal évite de
 * proposer d'emblée quelqu'un d'une société voisine.
 */
export function contactsDuCompte(
  contacts: Contact[] | undefined,
  compteId: string | null | undefined,
): Contact[] {
  if (!compteId) return []
  return (contacts ?? [])
    .filter((c) => estRattacheAuCompte(c, compteId))
    .sort((a, b) => {
      const aDirect = a.compte_id === compteId ? 0 : 1
      const bDirect = b.compte_id === compteId ? 0 : 1
      if (aDirect !== bDirect) return aDirect - bDirect
      return `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr')
    })
}

/**
 * Le libellé d'un contact dans un déroulant, avec sa société d'origine quand ce n'est pas celle du
 * compte ouvert.
 *
 * « Arnaud SCHROTTER — MEMPHIS LENS 2 » plutôt que « Arnaud SCHROTTER ». Sans cette mention, un
 * choix élargi devient un choix confus : on ne sait plus pourquoi cette personne est proposée, ni
 * si c'est la bonne.
 */
export function libelleContactPourCompte(contact: Contact, compteId: string | null | undefined): string {
  const nom = `${contact.prenom ?? ''} ${contact.nom ?? ''}`.trim() || '(sans nom)'
  if (contact.compte_id === compteId || !contact.compte_nom) return nom
  return `${nom} — ${contact.compte_nom}`
}

/**
 * Peut-il recevoir un document à signer ?
 *
 * DocuSign envoie par email : sans adresse, il n'y a rien à envoyer. La question est posée ici pour
 * que les écrans puissent AFFICHER la personne en la désactivant, au lieu de la faire disparaître —
 * c'est ce qui s'est passé sur CT-01606 : la liste était vide et personne ne savait pourquoi.
 */
export function peutRecevoirUneSignature(contact: Contact): boolean {
  return Boolean(contact.email && contact.email.trim())
}
