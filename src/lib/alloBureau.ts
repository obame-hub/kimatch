/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDER À L'APPLICATION ALLO DE COMPOSER — LE PROTOCOLE `allo://`
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══ CE N'EST PAS UNE TRICHE : C'EST LEUR PORTE D'ENTRÉE POUR LES CRM ══
 *
 * Lu le 22/09/2026 dans le code source de leur application de bureau (`app.asar`, 112 Mo, extrait
 * du paquet Microsoft Store), commentaire écrit par eux :
 *
 *     « Parse `allo://call?number=+33...` or `allo://call/+33...` and return the raw phone number.
 *       LETS EXTERNAL TOOLS (CUSTOM CRMS, intranet pages, shortcuts) TRIGGER A CALL ON WINDOWS
 *       WHERE `tel:` IS NOT ROUTED TO ALLO. »
 *
 * Kimatch est exactement le « custom CRM » de cette phrase, sur exactement la plateforme visée.
 *
 * ══ CE QUI A ÉTÉ VÉRIFIÉ, ET CE QUI RESTE INEXPLIQUÉ ══
 *
 * Éprouvé sur le poste de Naoëlle le 21 et le 22/09 :
 *
 *   · le paquet `Mobile-First.All_3.44.0.0` déclare bien `tel`, `callto` et `allo` ;
 *   · leur code appelle `setAsDefaultProtocolClient` pour les trois ;
 *   · leur `second-instance` (le chemin WINDOWS d'un lien profond) lit bien l'URL et en extrait le
 *     numéro — j'avais d'abord cru à tort qu'ils n'avaient branché que `open-url`, le chemin macOS ;
 *   · leur `readPhoneQueryParam` décode la valeur, donc `+` et `%2B` sont tous deux acceptés — mon
 *     encodage n'était pas en cause non plus ;
 *   · `Start-Process "allo://call?number=…"` est ACCEPTÉ par Windows et ouvre l'application.
 *
 * ET POURTANT L'APPEL NE PART PAS. Tout le mécanisme est en place des deux côtés, il est prévu pour
 * notre usage, et il ne compose pas. À ce stade c'est un défaut chez eux, ou une condition qu'on ne
 * voit pas depuis l'extérieur.
 *
 * ══ POURQUOI ON LE LANCE QUAND MÊME ══
 *
 * Il ne coûte RIEN quand il n'aboutit pas : un protocole sans gestionnaire ne navigue pas, aucune
 * erreur ne remonte, et la fenêtre d'appel reste là avec le numéro déjà copié. Il fait gagner
 * l'appel entier le jour où il aboutit — c'est-à-dire dès qu'Allo corrige, sans rien changer ici.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Demande à l'application de bureau d'Allo de composer ce numéro.
 *
 * NE REND RIEN ET NE LÈVE JAMAIS : un protocole personnalisé ne renvoie aucune réponse, on ne peut
 * donc pas savoir s'il a été pris en charge. Tout écran qui appellerait cette fonction et
 * afficherait ensuite « l'appel est lancé » ferait une promesse invérifiable.
 *
 * `<a>` CLIQUÉ PLUTÔT QUE `location.href`, et de façon SYNCHRONE dans le geste de l'utilisateur :
 * c'est la leçon du document de William sur Cockpit, où Safari et iOS refusent d'ouvrir une
 * application externe depuis un appel différé.
 */
export function lancerAlloBureau(e164: string) {
  ouvrirProtocole(`allo://call?number=${encodeURIComponent(e164)}`)
}

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * NOTRE PROPRE PROTOCOLE — CELUI-LÀ, ON LE MAÎTRISE
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 22/09/2026 : « ils ne veulent pas répondre, faut qu'on le fasse nous-mêmes de n'importe
 * quelle manière. »
 *
 * `kimatch://appeler?numero=…` est enregistré sur le poste par
 * `scripts/installer-clic-pour-appeler.ps1`. Windows lance alors un script qui, dans Allo :
 *
 *   ① écrit le numéro dans le champ de composition,
 *   ② RELIT le champ pour vérifier que c'est bien écrit,
 *   ③ actionne le bouton « Appeler ».
 *
 * ── CE N'EST PAS DE LA SIMULATION DE CLIC ──
 *
 * Allo est une application Electron, donc une page web, et Windows publie son arbre
 * d'accessibilité — 266 éléments, mesuré le 22/09/2026. Le champ supporte `ValuePattern` (on y
 * écrit) et le bouton `InvokePattern` (on l'actionne). C'est le mécanisme d'un lecteur d'écran :
 * rien n'est détourné, et surtout RIEN NE DÉPEND DE COORDONNÉES À L'ÉCRAN — une fenêtre déplacée
 * ou une notification qui passe devant ne peuvent plus envoyer le numéro ailleurs.
 *
 * ── ON LANCE LES DEUX PROTOCOLES, ET C'EST VOULU ──
 *
 * `allo://` d'abord, parce que c'est le chemin officiel : leur propre code le documente pour les
 * CRM sous Windows, et le jour où ils le réparent il faut qu'on en profite sans rien changer ici.
 * `kimatch://` ensuite, parce que c'est celui qui marche aujourd'hui.
 *
 * Aucun des deux ne coûte quoi que ce soit quand il n'aboutit pas : un protocole non enregistré ne
 * navigue pas et ne lève rien. Sur un poste sans notre installation, ou sur mobile, le
 * comportement est exactement celui d'avant — le numéro copié, le volet ouvert.
 */
export function composerSurLePoste(e164: string) {
  ouvrirProtocole(`kimatch://appeler?numero=${encodeURIComponent(e164)}`)
}

/**
 * Ouvre une URL de protocole sans quitter la page.
 *
 * `<a>` CLIQUÉ PLUTÔT QUE `location.href`, et de façon SYNCHRONE dans le geste de l'utilisateur :
 * c'est la leçon du document de William sur Cockpit, où Safari et iOS refusent d'ouvrir une
 * application externe depuis un appel différé.
 *
 * NE LÈVE JAMAIS, et ne rend rien : un protocole ne renvoie aucune réponse. Tout écran qui
 * appellerait ceci puis afficherait « l'appel est lancé » ferait une promesse invérifiable — la
 * faute commise deux fois de suite les 20 et 21/09.
 */
function ouvrirProtocole(url: string) {
  try {
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    a.style.position = 'fixed'
    a.style.left = '-9999px'
    document.body.appendChild(a)
    a.click()
    // Retiré au tick suivant : l'enlever tout de suite annulerait le clic sur certains navigateurs.
    setTimeout(() => a.remove(), 0)
  } catch {
    /* Un protocole refusé n'est pas une erreur à remonter : la fenêtre d'appel garde le numéro
       copié, qui est le seul comportement dont on soit sûr. */
  }
}
