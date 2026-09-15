/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * QUEL STATUT MÉTIER POSER SUR UN CONTRAT QU'ON VIENT DE DÉCLARER SIGNÉ
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 15/09/2026 : « ajoute la possibilité de le passer au statut signé à la main (quand
 * exceptionnellement on l'a pas envoyé via DocuSign) ».
 *
 * ══ LA RÈGLE N'EST PAS INVENTÉE ICI ══
 *
 * C'est exactement celle que le webhook DocuSign applique depuis toujours quand une enveloppe
 * revient signée — `statutMetierContrat`, dans `api/docusign/_decision.ts`. Un contrat signé à la
 * main doit finir dans le MÊME état qu'un contrat signé par DocuSign, sinon les deux chemins
 * produisent deux populations différentes et les filtres du portefeuille mentent.
 *
 * ELLE EST RECOPIÉE PLUTÔT QU'IMPORTÉE : `api/` est un autre projet de compilation, déployé en
 * fonctions serverless, et rien de `src/` n'y entre ni n'en sort. Deux écritures d'une règle, c'est
 * une dérive qui attend son heure — d'où le test qui épingle les quatre cas ET la mention explicite
 * de la fonction jumelle, pour que celui qui touche l'une trouve l'autre.
 *
 * ══ POURQUOI CETTE COLONNE, ALORS QUE L'ÉCRAN DÉDUIT LA VIE DES DATES ══
 *
 * `contrats` porte trois colonnes de statut remplies en parallèle — `statut_id`, `statut_vie_id` et
 * `statut_avancement_id` — et la question de savoir laquelle fait foi est posée à Michel depuis le
 * 21/08/2026, sans réponse (voir `api/contrats/reevaluer-statuts.ts`).
 *
 * En attendant, on écrit les deux que quelqu'un lit vraiment : `statut_avancement_id`, que le cycle
 * de signature affiche, et `statut_id`, que 42 endroits du code interrogent. Ne pas écrire la
 * seconde ferait d'un contrat signé à la main un contrat qui n'apparaît nulle part comme signé.
 */

/** Les statuts métier que peut prendre un contrat au moment où sa signature est enregistrée. */
export type StatutMetierApresSignature = 'SIGNE' | 'A_VENIR' | 'ACTIF' | 'TERMINE'

/**
 * @param dateDebut   Début de fourniture, `AAAA-MM-JJ` — pas la date de signature.
 * @param dateFin     Fin de fourniture, `AAAA-MM-JJ`.
 * @param aujourdhui  Injecté plutôt que lu dans l'horloge : c'est ce qui rend la fonction testable,
 *                    et ce qui évite qu'un fuseau décale la frontière d'un jour.
 *
 * SANS DATE DE DÉBUT, LE CONTRAT EST « SIGNÉ » ET RIEN DE PLUS : il est signé mais la fourniture
 * n'a pas de calendrier. Lui donner « à venir » lui inventerait un avenir qu'aucune date ne porte.
 *
 * Comparaison de chaînes et non de dates : au format `AAAA-MM-JJ`, l'ordre alphabétique EST l'ordre
 * chronologique, et passer par `new Date()` réintroduirait les fuseaux.
 */
export function statutMetierApresSignature(
  dateDebut: string | null | undefined,
  dateFin: string | null | undefined,
  aujourdhui: string = new Date().toISOString().slice(0, 10),
): StatutMetierApresSignature {
  if (!dateDebut) return 'SIGNE'
  if (dateDebut.slice(0, 10) > aujourdhui) return 'A_VENIR'
  if (dateFin && dateFin.slice(0, 10) < aujourdhui) return 'TERMINE'
  return 'ACTIF'
}

/**
 * La mention conservée sur le contrat, faute d'enveloppe DocuSign à consulter.
 *
 * ELLE S'AJOUTE AU COMMENTAIRE EXISTANT, elle ne le remplace pas : le commentaire d'un contrat porte
 * souvent des conditions négociées, et les écraser pour y mettre « signé sur papier » échangerait
 * une information contre une autre.
 */
export function mentionSignatureManuelle(
  commentaireExistant: string | null | undefined,
  origine: string,
  dateSignature: string,
): string {
  const jour = dateSignature.slice(0, 10).split('-').reverse().join('/')
  const mention = `Signature enregistrée à la main le ${jour} — ${origine.trim() || 'origine non précisée'}.`
  const existant = (commentaireExistant ?? '').trim()
  return existant ? `${existant}\n\n${mention}` : mention
}
