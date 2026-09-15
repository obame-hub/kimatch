/**
 * ══ LIRE UN LEAD DANS LE MESSAGE SLACK QUI L'ANNONCE ══
 *
 * Naoëlle, 15/09/2026 : « quand un lead arrive sur ce canal, il faut une automatisation qui crée
 * une piste sur Kimatch ».
 *
 * Le message posté par l'app « Kiwee Énergie » dans #leads a cette forme :
 *
 *     🔔 Nouveau lead — Comparateur
 *     👤 Nom : Bruno  Athea
 *     📧 Email : gestion@etikimmo.com
 *     🏢 Entreprise : ETIK IMMO
 *     📋 Type : Syndic
 *     ⚡ Consommation : 1 000 - 2 000 €/mois
 *     💬 Message : Énergie: Électricité | Coût: … | Tél: 0695428787 | Structure: Syndic
 *
 * ══ CE FICHIER EST LE POINT FAIBLE, ET IL LE SAIT ══
 *
 * Lire du texte écrit pour des humains est fragile : le jour où quelqu'un change une étiquette dans
 * la fonction `google-sheets-lead`, l'analyse cesse de trouver ses champs. Le vrai danger n'est pas
 * l'échec, c'est l'échec SILENCIEUX — une piste qui n'arrive plus sans que personne ne s'en
 * aperçoive avant des semaines.
 *
 * D'où la règle de ce fichier : ON NE DEVINE JAMAIS. Un champ introuvable rend `null` et la liste
 * `manques` le nomme ; l'appelant refuse alors de créer et le dit. Mieux vaut un message d'erreur
 * dans les journaux qu'une piste à moitié remplie qu'on croira complète.
 *
 * ══ TROIS CHOSES QUI ONT L'AIR DE DÉTAILS ══
 *
 * LES ÉTIQUETTES SE CHERCHENT SANS LEUR ÉMOJI. Slack peut les rendre en `:bell:` ou en 🔔 selon
 * l'API ; s'accrocher au pictogramme casserait sur un caprice d'encodage.
 *
 * LE SÉPARATEUR EST « : » MAIS LES VALEURS EN CONTIENNENT AUSSI — « Énergie: Électricité | … ».
 * On coupe donc au PREMIER deux-points seulement.
 *
 * LE TÉLÉPHONE N'A PAS DE LIGNE À LUI : il est enfoui dans « Message : … | Tél: 0695428787 | … ».
 * C'est le seul champ qu'il faut aller chercher à l'intérieur d'un autre.
 */

export interface LeadSlack {
  prenom: string | null
  nom: string | null
  contactNom: string | null
  email: string | null
  societe: string | null
  telephone: string | null
  /** « Syndic professionnel » ou « Entreprise » — le vocabulaire de Kimatch, pas celui du formulaire. */
  segment: string | null
  /** La ligne Message telle quelle : elle porte l'énergie et le budget, qu'on ne range pas ailleurs. */
  commentaire: string | null
  /** Les champs obligatoires qui manquent. Non vide = on ne crée pas. */
  manques: string[]
}

/** Slack décore ses liens : `<mailto:a@b.fr|a@b.fr>`, `<https://x|x>`. On garde ce qui se lit. */
function sansDecorationSlack(v: string): string {
  return v
    .replace(/<mailto:([^|>]+)(\|[^>]*)?>/g, '$1')
    .replace(/<(https?:[^|>]+)(\|[^>]*)?>/g, '$1')
    .replace(/[*_~`]/g, '')
    .trim()
}

/**
 * La valeur d'une étiquette, cherchée ligne à ligne.
 *
 * On ne regarde ni l'émoji ni les espaces qui précèdent : seule compte l'étiquette elle-même, en
 * tête de ligne, suivie de deux points. La comparaison ignore casse et accents — « Entreprise »
 * et « entreprise » désignent le même champ, et un accent perdu en chemin ne doit rien casser.
 */
function valeurDe(texte: string, etiquette: string): string | null {
  const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const cible = sansAccent(etiquette)

  for (const brute of texte.split(/\r?\n/)) {
    /* ON RETIRE D'ABORD L'ÉMOJI DE TÊTE, et c'est un test qui l'a exigé : Slack rend souvent ses
       pictogrammes en code court — « :bust_in_silhouette: Nom : Jean Dupont ». Chercher « le
       premier deux-points » tombait alors sur celui du code, l'étiquette devenait vide, et le champ
       n'était jamais trouvé — sans que rien ne le signale. */
    const ligne = brute
      // Les codes courts d'abord — leur deux-points d'ouverture doit rester à eux.
      .replace(/^(?:\s*:[a-z0-9_+-]+:)+/i, '')
      // Puis les pictogrammes, puces et espaces qui restent devant l'étiquette.
      .replace(/^[^\p{L}\p{N}]+/u, '')
    const coupe = ligne.indexOf(':')
    if (coupe < 0) continue
    const debut = sansAccent(ligne.slice(0, coupe)).replace(/[^a-z]/g, '')
    if (debut !== cible.replace(/[^a-z]/g, '')) continue
    const valeur = sansDecorationSlack(ligne.slice(coupe + 1))
    return valeur || null
  }
  return null
}

/**
 * Le segment de Kimatch, à partir du « Type » du formulaire.
 *
 * Le formulaire dit « Syndic » ou « Entreprise » ; `pistes.segment` porte « Syndic professionnel »
 * ou « Entreprise », valeurs venues de Salesforce et déjà présentes sur 5 073 pistes. Traduire ici
 * évite d'avoir deux vocabulaires dans la même colonne — et donc deux lignes dans un rapport.
 *
 * UN TYPE INCONNU RESSORT TEL QUEL plutôt que d'être écarté : il vaut mieux une valeur à corriger
 * qu'une piste sans segment, et elle se verra dans la liste.
 */
function segmentDe(type: string | null): string | null {
  if (!type) return null
  const t = type.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  if (t.startsWith('syndic')) return 'Syndic professionnel'
  if (t.startsWith('entreprise')) return 'Entreprise'
  return type.trim()
}

/** « Bruno  Athea » → prénom « Bruno », nom « ATHEA ». Le premier mot est le prénom, le reste le nom. */
function couperLeNom(complet: string | null): { prenom: string | null; nom: string | null } {
  if (!complet) return { prenom: null, nom: null }
  const mots = complet.trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return { prenom: null, nom: null }
  /* UN SEUL MOT EST UN NOM, PAS UN PRÉNOM. « Dupont » seul désigne une personne qu'on appellera
     « M. DUPONT » ; en faire un prénom donnerait « Dupont » tout court dans les listes. */
  if (mots.length === 1) return { prenom: null, nom: mots[0].toUpperCase() }
  return { prenom: mots[0], nom: mots.slice(1).join(' ').toUpperCase() }
}

/** Le téléphone, enfoui dans la ligne Message : « … | Tél: 0695428787 | … ». */
function telephoneDe(message: string | null): string | null {
  if (!message) return null
  const m = message.match(/t[ée]l\s*:?\s*([+\d][\d\s.\-()]{6,})/i)
  return m ? m[1].replace(/[\s.]/g, '').trim() : null
}

/**
 * Lit un message Slack et en tire un lead.
 *
 * ON EXIGE TROIS CHOSES : un nom, une société, et de quoi joindre la personne — e-mail ou
 * téléphone. Sans elles la piste ne sert à rien : les cinq vérifications de Kimatch portent
 * justement sur le contact, la société et les moyens de le joindre. Une piste qui naîtrait vide
 * encombrerait le plan de travail d'un commercial sans lui donner de quoi appeler.
 */
export function analyseLeadSlack(texte: string): LeadSlack {
  const nomComplet = valeurDe(texte, 'Nom')
  const { prenom, nom } = couperLeNom(nomComplet)
  const email = valeurDe(texte, 'Email')
  const societe = valeurDe(texte, 'Entreprise')
  const message = valeurDe(texte, 'Message')
  const telephone = telephoneDe(message)

  const manques: string[] = []
  if (!nom) manques.push('Nom')
  if (!societe) manques.push('Entreprise')
  if (!email && !telephone) manques.push('Email ou Tél')

  return {
    prenom,
    nom,
    contactNom: nomComplet ? nomComplet.replace(/\s+/g, ' ').trim() : null,
    email,
    societe,
    telephone,
    segment: segmentDe(valeurDe(texte, 'Type')),
    /* La consommation rejoint le message : les deux disent le budget, et les séparer obligerait à
       lire deux champs pour répondre à une seule question. */
    commentaire: [valeurDe(texte, 'Consommation'), message]
      .filter(Boolean).join(' · ') || null,
    manques,
  }
}

/**
 * Ce message annonce-t-il un lead ?
 *
 * Le canal reçoit aussi des arrivées de membres — « Naoëlle a été ajoutée à #leads par Michel
 * OBAME » — et tout ce que quelqu'un y écrira un jour. Sans ce filtre, chaque message deviendrait
 * une tentative de création, et les journaux se rempliraient d'échecs qui n'en sont pas.
 */
export function estUnLead(texte: string): boolean {
  return /nouveau\s+lead/i.test(texte)
}
