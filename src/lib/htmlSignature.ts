import DOMPurify from 'dompurify'

/**
 * ══ L'APERÇU D'UNE SIGNATURE EST DU HTML RÉINJECTÉ, LUI AUSSI ══
 *
 * Audit du 13/09/2026, constat SEC-03. Trois endroits de l'application appellent
 * `dangerouslySetInnerHTML`. Un seul passait par un nettoyage — `CartePublication`, via
 * `nettoyerHtml`. Les deux autres affichaient `signature.corps_html` brut :
 *
 *     src/components/email/CarteSignature.tsx:246   (Mon profil, l'aperçu sous l'éditeur)
 *     src/components/email/VoletEmail.tsx:311       (le volet d'écriture, le bas du brouillon)
 *
 * ── L'ARGUMENT QUI JUSTIFIAIT L'ABSENCE DE NETTOYAGE, ET CE QU'IL OUBLIE ──
 *
 * Le commentaire de `VoletEmail` disait : « l'aperçu de sa PROPRE signature, écrite par soi et
 * relue par le serveur avant envoi : le contenu ne vient pas d'un tiers ». C'est vrai dans le cas
 * nominal, et le mode GABARIT est même construit en base par `fn_signature_html` — l'écran n'y
 * écrit rien. Deux réserves, cependant :
 *
 *   · Le mode LIBRE existe précisément pour coller ce qu'on avait déjà dans Gmail. On colle alors
 *     du HTML qu'on n'a pas écrit, venu d'un ancien client de messagerie ou d'une page web.
 *   · `profils_signatures_email` est sous la politique `authenticated_all` comme le reste, et les
 *     administrateurs lisent toutes les signatures pour dépanner : la signature de quelqu'un
 *     d'autre PEUT s'afficher sur un autre écran que le sien.
 *
 * Le risque réel reste modéré. Mais le correctif coûte deux lignes, et l'application n'a aucune
 * Content-Security-Policy (constat SEC-02) : un script qui s'exécuterait ici aurait accès au jeton
 * Supabase du stockage local. On ne laisse pas une porte ouverte au motif que le couloir est
 * surveillé.
 *
 * ── POURQUOI PAS `nettoyerHtml` ──
 *
 * Celui des nouveautés autorise les `<iframe>` — il le faut, une nouveauté intègre des vidéos.
 * Une signature de mail n'a aucune raison d'en contenir : lui appliquer ce profil serait élargir
 * l'autorisation sans nécessité. Ici, le strict minimum de ce qu'une signature contient vraiment :
 * du texte mis en forme, des liens, un logo, un tableau de mise en page.
 */

/** Les balises qu'une signature de mail utilise réellement. Tout le reste est retiré. */
const BALISES = [
  'p', 'br', 'div', 'span', 'a', 'img',
  'strong', 'b', 'em', 'i', 'u', 's',
  'table', 'tbody', 'thead', 'tr', 'td', 'th',
  'ul', 'ol', 'li', 'hr', 'small', 'font',
]

/**
 * `style` EST ADMIS, ET C'EST UN CHOIX À ASSUMER.
 *
 * Une signature en vit : `fn_signature_html` (migration 20260907230000) construit tout son rendu
 * avec des `style` en ligne — couleurs de la charte, tailles, alignements, le filet vert à gauche.
 * L'interdire viderait l'aperçu de sa mise en forme, et l'écran deviendrait mensonger puisque le
 * mail parti, lui, garderait la sienne.
 *
 * Ce que cela laisse passer : de la mise en forme arbitraire. Ce que cela ne laisse plus passer,
 * et qui était le vrai danger : les balises et attributs qui EXÉCUTENT — `<script>`, `<iframe>`,
 * les `on*`, les `href="javascript:"`. Un attribut `style` seul ne peut plus lancer de code sur un
 * navigateur moderne (`expression()` est mort avec Internet Explorer, `url(javascript:)` est
 * bloqué). Le résidu est un défaut d'affichage, pas une prise de contrôle.
 *
 * Toutes les balises et tous les attributs produits par `fn_signature_html` sont dans ces deux
 * listes — vérifié ligne à ligne le 13/09/2026 : div, a, img, span, table, tr, td, et les
 * attributs style, href, src, width, height, alt, cellpadding, cellspacing, border. Le gabarit
 * traverse ce nettoyage intact.
 */
const ATTRIBUTS = [
  'href', 'src', 'alt', 'title', 'width', 'height',
  'style', 'class', 'align', 'valign', 'color', 'face', 'size',
  'cellpadding', 'cellspacing', 'border', 'colspan', 'rowspan',
]

export function nettoyerSignature(html: string | null | undefined): string {
  if (!html) return ''

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: BALISES,
    ALLOWED_ATTR: ATTRIBUTS,
    /* Les protocoles admis dans un `href` ou un `src`. `data:` est exclu volontairement : une
       image en `data:` est possible dans une signature, mais `data:text/html` est un vecteur
       d'exécution classique, et le gabarit maison n'en produit pas. `cid:` sert aux images
       embarquées d'un mail — inoffensif, et utile si une signature vient d'Outlook. */
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|cid:|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    /* Une signature ne contient pas de `<form>`, et un formulaire posé dans une page de
       l'application pourrait en détourner la soumission. */
    FORBID_TAGS: ['form', 'input', 'button', 'style', 'script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['srcset', 'formaction', 'form', 'ping'],
  })
}
