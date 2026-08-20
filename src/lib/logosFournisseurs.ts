/**
 * Le logo d'un fournisseur, quand on l'a.
 *
 * DEMANDE DE NAOËLLE, 20/08/2026 : « peux-tu récupérer les logos des fournisseurs sur internet et
 * les mettre en place ». Ils manquaient au comparatif client, où la maquette de William en montre un
 * par offre — c'est ce qui permet de reconnaître un fournisseur avant même d'avoir lu son nom.
 *
 * USAGE NOMINATIF. Ces logos identifient le fournisseur dont on présente l'offre, dans un comparatif
 * remis au client. Ils restent la propriété de leurs titulaires ; on ne les modifie pas et on ne s'en
 * sert pas comme des nôtres.
 *
 * DOUZE LOGOS, PAS CINQUANTE-UN. Les fichiers ont été récupérés depuis les sites officiels puis
 * regardés un par un, et cinq ont été écartés :
 *
 *   · vattenfall.fr renvoyait un logo qui n'est PAS celui de Vattenfall — un mauvais logo est bien
 *     pire que pas de logo, il désigne le mauvais fournisseur ;
 *   · SEFE, Gazel Énergie et Endesa ne donnaient qu'un favicon de 16 px, illisible à l'écran ;
 *   · GEDIA renvoyait une image dont rien ne garantissait qu'elle soit la sienne.
 *
 * Les douze retenus couvrent l'essentiel des consultations réelles. Les autres tombent sur la
 * pastille d'initiales, qui reste correcte et lisible.
 *
 * POUR EN AJOUTER UN : déposer le fichier dans `src/assets/fournisseurs/` sous un nom normalisé —
 * minuscules, accents retirés, espaces en tirets, tel que `normaliser()` le produit. Aucun code à
 * modifier, `import.meta.glob` le trouve au build.
 */

// Vite résout ces imports au build : le glob produit un objet {chemin: url}, et rien n'est chargé qui
// ne soit affiché.
const FICHIERS = import.meta.glob<string>('@/assets/fournisseurs/*.png', {
  eager: true,
  import: 'default',
  query: '?url',
})

/**
 * Réduit un nom de fournisseur à une clé stable.
 *
 * Les noms en base sont saisis à la main et arrivent en majuscules, parfois accentués, parfois avec
 * des mentions de forme juridique : « TOTAL ENERGIES », « MET ENERGIE », « GME FRANCE ». On les
 * ramène à une forme comparable plutôt que d'espérer une correspondance exacte.
 */
function normaliser(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(sas|sa|sarl|france|group|groupe)\b/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const PAR_CLE = new Map<string, string>(
  Object.entries(FICHIERS).map(([chemin, url]) => [
    normaliser(chemin.split('/').pop()!.replace(/\.png$/, '')),
    url,
  ]),
)

/**
 * L'URL du logo, ou `null` si on ne l'a pas.
 *
 * La correspondance est tentée sur le nom normalisé, puis sur son premier mot : « MET ENERGIE »
 * trouve `met-energie`, et « TOTALENERGIES » comme « TOTAL ENERGIES » trouvent `total-energies`. On
 * s'arrête là : deviner plus loin ferait afficher le logo d'un fournisseur pour un autre, ce qui est
 * exactement l'erreur à ne pas commettre sur un document client.
 */
export function logoFournisseur(nom: string | null | undefined): string | null {
  if (!nom) return null
  const cle = normaliser(nom)
  if (PAR_CLE.has(cle)) return PAR_CLE.get(cle)!
  const sansTirets = cle.replace(/-/g, '')
  for (const [k, url] of PAR_CLE) {
    if (k.replace(/-/g, '') === sansTirets) return url
  }
  return null
}

/** Les initiales, pour la pastille de repli. Deux lettres au plus : au-delà ce n'est plus lisible. */
export function initialesFournisseur(nom: string | null | undefined): string {
  if (!nom) return '—'
  return nom
    .split(/\s+/)
    .filter((m) => m.length > 1)
    .slice(0, 2)
    .map((m) => m[0])
    .join('')
    .toUpperCase()
}
