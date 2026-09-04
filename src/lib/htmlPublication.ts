import DOMPurify from 'dompurify'
import { supabase } from '@/lib/supabase'

/**
 * LE CONTENU D'UNE NOUVEAUTÉ EST DU HTML, ET C'EST LE SEUL ENDROIT DE L'APPLICATION OÙ ON EN
 * RÉINJECTE.
 *
 * Partout ailleurs, React échappe ce qu'il affiche : écrire `<script>` dans un champ produit le
 * texte « <script> », pas un script. Un éditeur riche demande l'inverse — `dangerouslySetInnerHTML`
 * — et rend donc exécutable tout ce qui est enregistré. Sans le nettoyage ci-dessous, une balise
 * collée depuis une page web s'exécuterait chez les treize personnes qui ouvrent la nouveauté, avec
 * leur session et leurs droits.
 *
 * On nettoie DEUX FOIS, à l'écriture et à l'affichage. C'est volontaire : le nettoyage à l'écriture
 * garde la base propre, celui à l'affichage protège les lignes écrites avant cette règle ou par un
 * autre chemin. Une seule des deux barrières suffirait si l'on était sûr de l'histoire de la table —
 * on ne l'est jamais.
 */

export const BUCKET_NOUVEAUTES = 'nouveautes'

/**
 * Les seuls hôtes dont une vidéo peut être intégrée.
 *
 * Une `<iframe>` exécute la page d'un tiers dans la nôtre. La liste est donc fermée : n'importe
 * quelle adresse rendrait le nettoyage ci-dessus décoratif, puisqu'il suffirait d'héberger le
 * script ailleurs et de l'appeler ici.
 */
const HOTES_VIDEO = new Set([
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'player.vimeo.com',
  'www.loom.com',
  'loom.com',
])

/**
 * Les attributs que TipTap produit et que le profil par défaut de DOMPurify ne connaît pas.
 *
 * `data-chemin` est le nôtre : il porte le chemin de stockage privé d'une image ou d'une pièce
 * jointe. C'est LUI la source de vérité, pas le `src` enregistré — voir `injecterUrlsSignees`.
 */
const ATTRIBUTS_EN_PLUS = [
  'data-chemin',
  'data-nom',
  'allow',
  'allowfullscreen',
  'frameborder',
  'colwidth',
  'target',
]

export function nettoyerHtml(html: string): string {
  if (!html) return ''

  const propre = DOMPurify.sanitize(html, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ATTRIBUTS_EN_PLUS,
  })

  const doc = new DOMParser().parseFromString(propre, 'text/html')

  doc.querySelectorAll('iframe').forEach((cadre) => {
    const src = cadre.getAttribute('src') ?? ''
    let hote = ''
    try {
      hote = new URL(src, window.location.origin).hostname
    } catch {
      hote = ''
    }
    if (!HOTES_VIDEO.has(hote)) cadre.remove()
  })

  // Un lien vers l'extérieur s'ouvre à côté, et sans `noopener` la page ouverte garde la main sur
  // la nôtre par `window.opener`. Les liens internes (une fiche compte, une recommandation) restent
  // dans l'onglet courant : les envoyer ailleurs multiplierait les onglets sur un simple renvoi.
  doc.querySelectorAll('a[href]').forEach((lien) => {
    const href = lien.getAttribute('href') ?? ''
    if (/^https?:/i.test(href)) {
      lien.setAttribute('target', '_blank')
      lien.setAttribute('rel', 'noopener noreferrer')
    }
  })

  return doc.body.innerHTML
}

/** Les chemins de stockage privé cités par un contenu — images insérées et pièces jointes. */
export function cheminsPrives(html: string): string[] {
  if (!html) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const chemins = new Set<string>()
  doc.querySelectorAll('[data-chemin]').forEach((el) => {
    const chemin = el.getAttribute('data-chemin')
    if (chemin) chemins.add(chemin)
  })
  return [...chemins]
}

/**
 * Une adresse temporaire par fichier privé.
 *
 * Le bucket `nouveautes` est privé : ses fichiers n'ont pas d'adresse publique, et une capture
 * d'écran de Kimatch montre presque toujours des noms de vrais clients. L'adresse signée vaut une
 * heure, ce qui suffit largement à lire une publication et ne laisse rien de partageable derrière.
 */
export async function signerChemins(chemins: string[]): Promise<Record<string, string>> {
  if (chemins.length === 0) return {}
  const { data, error } = await supabase.storage
    .from(BUCKET_NOUVEAUTES)
    .createSignedUrls(chemins, 3600)
  if (error || !data) {
    console.error('signerChemins', error)
    return {}
  }
  const urls: Record<string, string> = {}
  data.forEach((entree) => {
    if (entree.path && entree.signedUrl) urls[entree.path] = entree.signedUrl
  })
  return urls
}

/**
 * Remplace l'adresse des images privées par leur adresse signée du moment.
 *
 * L'adresse enregistrée dans le HTML est périmée dès le lendemain de sa rédaction — c'est la
 * contrepartie du stockage privé. `data-chemin` survit, lui, et c'est à partir de lui qu'on
 * reconstruit. Une image dont la signature échoue garde son texte alternatif plutôt que de casser
 * la mise en page.
 */
export function injecterUrlsSignees(html: string, urls: Record<string, string>): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('img[data-chemin]').forEach((image) => {
    const chemin = image.getAttribute('data-chemin')
    const url = chemin ? urls[chemin] : undefined
    if (url) image.setAttribute('src', url)
  })
  return doc.body.innerHTML
}
