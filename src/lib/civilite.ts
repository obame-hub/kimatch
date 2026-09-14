/**
 * ══ CIVILITÉ, NOM, PRÉNOM : UNE SEULE CONVENTION ══
 *
 * Naoëlle, 14/09/2026 : « civilité Monsieur ou Madame, nom formaté tout en majuscules et prénom
 * première lettre en majuscule. C'est très très important pour plus tard, quand on fera des
 * rapports, des stats. »
 *
 * La règle vit en base — `fn_formater_identite_contact`, migration 20260914180000, appliquée à
 * chaque écriture quelle qu'en soit l'origine. Ce fichier ne la réimplémente pas : il donne à
 * l'interface les MÊMES valeurs, pour qu'un menu déroulant ne propose pas « M. » là où la base
 * écrira « Monsieur ».
 *
 * C'EST EXACTEMENT LE DÉFAUT QU'ON ÉVITE ICI. Les écrans offraient `['M.', 'Mme', 'Autre']` ; la
 * base range désormais en « Monsieur » / « Madame ». Un contact repris se serait affiché avec un
 * menu vide — aucune option ne correspondant à sa valeur — et le premier enregistrement l'aurait
 * effacée sans que personne ne le demande.
 */

/** Les deux seules valeurs que la base écrit d'elle-même. */
export const CIVILITES = ['Monsieur', 'Madame'] as const
export type Civilite = (typeof CIVILITES)[number]

/**
 * Les options d'un menu de civilité, en gardant CE QUI EST DÉJÀ LÀ.
 *
 * Le déclencheur laisse passer ce qu'il ne reconnaît pas — « Dr », « Maître » — plutôt que de
 * l'effacer. Un menu qui n'offrirait que Monsieur et Madame ferait disparaître ces valeurs au
 * premier enregistrement. On ajoute donc la valeur courante à la liste quand elle en sort.
 */
export function optionsCivilite(valeurActuelle?: string | null): string[] {
  const v = (valeurActuelle ?? '').trim()
  const base: string[] = [...CIVILITES]
  return v && !base.includes(v) ? [...base, v] : base
}

/** Le nom qu'on lit : « Monsieur Jean DUPONT ». La civilité est facultative, le reste non. */
export function nomComplet(p: {
  civilite?: string | null
  prenom?: string | null
  nom?: string | null
}): string {
  return [p.civilite, p.prenom, p.nom].map((x) => (x ?? '').trim()).filter(Boolean).join(' ')
}

/** Le nom sans la civilité : c'est ce qu'on met dans un « À : » d'e-mail ou une liste dense. */
export function prenomNom(p: { prenom?: string | null; nom?: string | null }): string {
  return [p.prenom, p.nom].map((x) => (x ?? '').trim()).filter(Boolean).join(' ')
}

/**
 * La mise en forme, côté écran, pour que la saisie montre tout de suite ce que la base gardera.
 *
 * ELLE NE REMPLACE PAS LE DÉCLENCHEUR, elle le double : un import, une correction en SQL ou un
 * écran qu'on oublierait passeraient à côté d'elle. C'est la base qui garantit l'invariant ; ici
 * on évite seulement à l'utilisateur de voir son « dupont » se transformer après coup.
 */
export const nomEnMajuscules = (s: string): string => s.toUpperCase()

/** « jean-pierre » → « Jean-Pierre », comme `initcap` côté serveur. */
export function prenomEnCapitale(s: string): string {
  return s.toLowerCase().replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase())
}
