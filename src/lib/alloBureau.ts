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

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE LANCEUR DU SPRINT — DEUX PROTOCOLES, DANS LE GESTE DU CLIC, SANS LE VOLET
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « je ne veux pas utiliser la fenêtre Allô ou quoi que ce soit, je veux
 * utiliser l'application desktop de Allô installée sur mon ordinateur. »
 *
 * ══ CE QUE SA SPÉCIFICATION LOVABLE APPREND, ET QUE NOUS AVIONS ÉCARTÉ ══
 *
 * Il a fourni le même jour la spécification d'une application d'appel qui MARCHAIT avec Allô. Son
 * lanceur n'utilise pas `allo://` : il utilise **`tel:`**, et il le fait deux fois — un `<a>`
 * inséré dans le DOM puis cliqué, PUIS `window.location.href`, parce que certains navigateurs
 * ignorent l'un ou l'autre.
 *
 * Kimatch réservait `tel:` aux appareils tactiles depuis le 26/08/2026, après que Chrome eut
 * ouvert « Sélectionner une application » sur le poste de Naoëlle. Cette observation reste vraie —
 * mais elle dit que SON poste n'avait pas Allô enregistré pour `tel:`, pas que le chemin est
 * mauvais. C'est un réglage de système d'exploitation, pas une propriété du code.
 *
 * ══ UN SEUL PROTOCOLE, ET C'EST `tel:` — CORRIGÉ LE 22/09/2026 ══
 *
 * J'avais d'abord déclenché `allo://` PUIS `tel:`, en me disant qu'aucun ne coûtait rien. C'était
 * une erreur de raisonnement : trois navigations de protocole enchaînées dans le même geste ne
 * sont pas gratuites, le navigateur peut n'en honorer qu'une — et rien ne dit laquelle. La
 * spécification de William n'en déclenche qu'un, et c'est celle qui marchait.
 *
 * `tel:` EST AUSSI LE MEILLEUR CHEMIN DANS LEUR CODE, lu ce jour dans l'application installée
 * (`/Applications/Allo.app`, version 3.47.0). Les deux protocoles n'aboutissent pas au même
 * endroit : `allo://call` émet `open-url/alloCall`, consommé par un seul composant du routeur ;
 * `tel:` émet `open-url/tel`, qui est lu à deux endroits et qui, à plusieurs lignes, ouvre une
 * invite de choix ET RAMÈNE LA FENÊTRE AU PREMIER PLAN (`showMainWindow`). C'est le chemin le
 * plus visible, donc le plus sûr.
 *
 * TOUT EST SYNCHRONE, et c'est le piège numéro un de sa liste : « `tel:` après un `await` → Allô
 * ne s'ouvre pas sur Safari/macOS/iOS. Le déclenchement doit être la première instruction du
 * gestionnaire de clic. »
 */
export function lancerAppelBureau(e164: string) {
  ouvrirProtocole(`tel:${e164}`)
  try {
    window.location.href = `tel:${e164}`
  } catch {
    /* Ignoré : certains navigateurs refusent l'affectation, le `<a>` cliqué a déjà fait le travail. */
  }
}

/**
 * Ramène l'application de bureau au premier plan, sans composer.
 *
 * William, 22/09/2026 : « je sais que je ne peux pas raccrocher depuis Kimatch, mais au moins je
 * veux que quand je clique sur "Raccrocher", ça ouvre l'application Allô afin de me permettre de
 * raccrocher depuis l'app. »
 *
 * C'est le seul geste honnête que le code puisse rendre ici : leur API n'a aucun contrôle d'appel
 * — revérifié ce jour avec notre clé, onze routes, toutes en lecture. Un protocole sans paramètre
 * ACTIVE l'application enregistrée sans rien lui demander d'autre ; le bouton rouge de Kimatch
 * amène donc le raccroché sous la souris au lieu de le promettre.
 */
export function ouvrirAlloBureau() {
  ouvrirProtocole('allo://')
}

/* `ouvrirProtocole` vit plus haut : il existait déjà dans ce fichier, j'en avais écrit un second
   sans le voir. Une seule forme du `<a>` cliqué, pour tout le monde. */
