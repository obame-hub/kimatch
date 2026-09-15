/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ALLO DANS KIMATCH — LE SEUL MOYEN D'APPELER ET DE RACCROCHER SANS QUITTER L'APPLICATION
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 08/09/2026 : « je ne comprends pas pourquoi ça n'ouvre pas une fenêtre pour appeler ce
 * numéro dans Kimatch, j'ai besoin de tester. » Et William le matin même : « il faut qu'on trouve
 * une solution pour pouvoir raccrocher depuis Kimatch, c'est important. »
 *
 * ══ POURQUOI L'API NE PEUT PAS RÉPONDRE À ÇA ══
 *
 * `POST /v2/api/dialing-queues/current/numbers` dépose un numéro dans la file du Power Dialer. La
 * file est une LISTE D'ATTENTE, pas une commande d'appel : rien ne compose tant que le Power Dialer
 * n'est pas lancé, et ce démarrage n'existe que dans l'interface d'Allo. Relevé sur leur table
 * complète portée-par-endpoint le 08/09/2026 : quatre chemins sous `dialing-queues` — lire,
 * configurer, ajouter, vider — et aucun pour composer ni pour raccrocher.
 *
 * ══ CE QUI RÉPOND, ET COMMENT JE L'AI VÉRIFIÉ ══
 *
 * `web.withallo.com` EST un softphone : c'est lui qui demande le microphone, et c'est lui qui porte
 * le bouton raccrocher. Il ne reste qu'à le mettre dans Kimatch.
 *
 * Vérifié avant d'écrire une ligne : leurs en-têtes ne portent NI `X-Frame-Options` NI
 * `Content-Security-Policy`. Puis éprouvé pour de vrai — page servie depuis une vraie origine, et
 * leur application s'affiche dans le cadre, logo et écran de connexion compris.
 *
 * ══ TROIS DÉCISIONS QUI TIENNENT TOUT ══
 *
 * ① LE CADRE NE SE DÉMONTE JAMAIS, et le repli le fait SORTIR DE L'ÉCRAN plutôt que de le cacher.
 *   Le démonter rechargerait `web.withallo.com` — donc couperait l'appel et perdrait un numéro à
 *   moitié tapé. Et `display: none` suspend le rendu d'un cadre, ce qui revient au même risque.
 *   Naoëlle, 08/09/2026 : « que la réduction ne stoppe pas l'action, c'est important. » C'est le
 *   seul vrai piège de ce composant.
 *
 * ② LE MICROPHONE EST DÉLÉGUÉ. `allow="microphone"` sur le cadre, sans quoi Allo affiche son bandeau
 *   « vous ne pouvez pas passer d'appels tant que le microphone n'est pas activé » — exactement ce
 *   qu'on voyait sur sa capture du jour.
 *
 * ③ LA SESSION DU CADRE EST SÉPARÉE DE CELLE DE L'ONGLET. Les navigateurs cloisonnent le stockage
 *   d'un site affiché dans un autre : il faut donc se connecter UNE FOIS dans le volet, même si l'on
 *   est déjà connecté à Allo dans un onglet voisin. Ce n'est pas un défaut à corriger, c'est une
 *   règle du navigateur — et c'est dit à l'écran plutôt que laissé deviner.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useState } from 'react'
import { Phone, Minus, X, ExternalLink, ZoomIn, ZoomOut, Maximize2, Minimize2, Move } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppelEnCours } from '@/lib/data/appelEnCours'

const URL_ALLO = 'https://web.withallo.com'

/* CE QUI COMPOSE VRAIMENT UN NUMÉRO D'UN CLIC, et que Kimatch ne peut pas faire à sa place.
 *
 * Leur documentation : « Click the icon → the extension opens a small popup showing the number.
 * Click Call. The call starts immediately in your Allo app (web or desktop). » L'API, elle, n'a
 * aucun endpoint de composition — d'où ce lien, plutôt qu'un bouton qui ferait semblant.
 *
 * L'ÉTAPE QU'ON OUBLIE : après l'installation, il faut cliquer l'icône dans la barre d'outils et
 * S'Y CONNECTER. Installée sans connexion, l'extension ne décore rien et on conclut qu'elle ne
 * marche pas. */
const URL_EXTENSION =
  'https://chromewebstore.google.com/detail/allo-click-to-call/bjjbpnjndjmamflhendfjfefdbpleclk'

/** Le volet se souvient d'être ouvert entre deux pages, pas entre deux sessions. */
const CLE_MEMOIRE = 'kimatch.volet-allo.ouvert'
/* LA CLÉ CHANGE AVEC LE DÉFAUT. Une largeur déjà mémorisée l'emporterait sur le nouveau défaut,
   et le volet resterait aussi petit qu'avant chez ceux qui ont touché la poignée — donc chez la
   personne qui a justement demandé plus grand. Un suffixe suffit à repartir du bon réglage. */
const CLE_LARGEUR = 'kimatch.volet-allo.largeur.v2'

/* ══ LA LARGEUR EST LE ZOOM ══
 *
 * Naoëlle, 08/09/2026, trois fois de suite : « l'affichage est coupé », puis « le volet est encore
 * coupé », puis « augmente un peu la police, c'est trop petit ». Les deux premières fois j'ai
 * élargi, ce qui ne pouvait pas suffire — voir le bloc suivant. La troisième a donné la bonne
 * lecture du problème : IL N'Y A PAS DE RÉGLAGE DE POLICE À TOURNER. Allo est rendu à une largeur
 * fixe puis réduit pour tenir, donc AGRANDIR LE TEXTE, C'EST ÉLARGIR LE VOLET. Un faux zoom par-dessus l'échelle rognerait de nouveau les colonnes
 * — on serait revenu au problème de départ.
 *
 * 1040 px et une largeur logique ramenée à 1180 donnent une échelle de 0,88 au lieu de 0,64 : le
 * texte grossit de près de 40 %. Et les deux boutons de l'en-tête rendent le réglage visible — la
 * poignée sur le bord existait déjà, mais rien ne disait qu'elle était là. */
const LARGEUR_DEFAUT = 1040
const PAS_LARGEUR = 140
const LARGEUR_MIN = 380
const LARGEUR_MAX = 1600

/* ══ ALLO NE SE REPLIE PAS : ON LE MET À L'ÉCHELLE ══
 *
 * Naoëlle, 08/09/2026, après l'élargissement à 760 px : « le volet est encore coupé, c'est bizarre ».
 * Elle avait raison, et élargir ne suffisait pas — leur interface a une largeur MINIMALE et ne
 * reflue pas en dessous. Sa troisième colonne, celle où vivent les commandes d'appel, restait rognée
 * quelle que soit la place qu'on lui donnait.
 *
 * On rend donc le cadre à sa largeur naturelle — 1180 px — puis on le RÉDUIT pour qu'il tienne dans
 * le volet. Tout est visible, plus petit. Élargir le volet ne révèle plus du contenu caché : ça
 * agrandit ce qui est déjà là, ce qui est bien plus lisible comme comportement.
 *
 * L'échelle ne descend pas sous 0,62 : en dessous, le texte d'Allo devient illisible et la place
 * gagnée ne sert plus à rien. À largeur minimale, le volet montre donc Allo un peu rogné — mais
 * c'est un volet de 380 px, on l'a replié pour lire la fiche, pas pour téléphoner. */
const LARGEUR_LOGIQUE = 1180
const ECHELLE_MIN = 0.62

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * LE HUBLOT — VOIR LA BARRE D'APPEL D'ALLO, ET RIEN D'AUTRE
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 15/09/2026, capture à l'appui : « en gros je ne veux pas voir tout ça, juste le petit
 * bloc qui concerne l'appel en cours, c'est tout ». Et William : un petit carré avec le nom de la
 * personne, transférer, raccrocher — pas un gros volet.
 *
 * ── POURQUOI UN RECADRAGE ET NON UNE INTERFACE À NOUS ──
 *
 * L'API d'Allo n'a AUCUN contrôle d'appel : vérifié le 15/09 sur leur référence (16 familles de
 * ressources, les appels en lecture seule), sur leur page de transfert (depuis leur application
 * uniquement), et sur notre propre clé (21 portées, aucune ne touche un appel en cours). Raccrocher
 * et transférer n'existent QUE dans l'interface d'Allo.
 *
 * Or cette interface est ici, dans le cadre. Un site ne peut ni restyler ni découper un site
 * étranger qu'il affiche — même origine oblige. La seule chose qu'on maîtrise, c'est la FENÊTRE
 * par laquelle on le regarde. On garde donc Allo rendu à sa taille naturelle et on n'en montre
 * qu'un rectangle : celui de la barre d'appel.
 *
 * ── CE QUE ÇA COÛTE, ET COMMENT ON LE PAIE ──
 *
 * Le jour où Allo déplace ses boutons, le cadrage tombe à côté. On ne peut pas l'empêcher ; on peut
 * le rendre réparable en cinq secondes plutôt qu'en un déploiement : le bouton « recadrer » laisse
 * glisser Allo derrière le hublot, et la position est retenue. Personne n'attend une correction.
 */
const HUBLOT_MIN = 180
const HUBLOT_MAX_L = 900
const HUBLOT_MAX_H = 700
/* LA HAUTEUR À LAQUELLE ON REND ALLO. Leur mise en page dépend de la hauteur de la fenêtre : un
   cadre de 170 px leur ferait produire une disposition d'écran minuscule, pas le haut de la leur. */
const HAUTEUR_LOGIQUE = 860
/* LE CADRAGE PAR DÉFAUT vise la colonne de droite, celle où vivent les commandes d'appel — constaté
   le 08/09 quand elle restait rognée quelle que soit la largeur du volet. C'est un point de départ,
   pas une vérité : le premier appel servira à le régler pour de bon. */
/* ══ DEUX CADRAGES, PAS UN ══
 *
 * L'écran d'Allo n'est pas le même au repos et en ligne : au repos on veut sa barre de composition,
 * en appel on veut ses touches — raccrocher, muet, transfert. Un cadrage unique obligerait à
 * recadrer à chaque décrochage, donc pendant qu'on parle à un client. Kimatch sait déjà s'il y a un
 * appel en cours (c'est ce qui fait clignoter la pastille) : il choisit le cadrage tout seul. */
/* ══ LE REPÈRE VERTICAL PART DU BAS, PAS DU HAUT ══
 *
 * Premier essai, compté depuis le haut : le cadrage tombait sur le champ « ajoutez une note
 * interne », juste au-dessus de la barre. Et c'était structurel, pas un mauvais chiffre — la hauteur
 * à laquelle on rend Allo est une valeur qu'on choisit, donc tout repère pris depuis le haut se
 * décale dès qu'on la change.
 *
 * La barre de composition et les touches d'appel vivent en BAS de leur écran. On aligne donc le bas
 * du hublot sur le bas d'Allo : `y` devient une distance AU-DESSUS du bas, et `0` montre exactement
 * la barre. Ce repère-là ne bouge plus.
 */
const CADRAGE_DEFAUT = {
  repos: { x: 0, y: 0 },
  appel: { x: 0, y: 0 },
}
/* ══ LES VALEURS SONT CELLES DE LA VRAIE BARRE D'ALLO ══
 *
 * Capture de Naoëlle, 15/09/2026 : pendant un appel, Allo affiche UNE SEULE RANGÉE tout en bas —
 * nom et numéro à gauche, puis muet, haut-parleur, clavier, étiquette, transfert, note, incrustation,
 * l'état (« Sonnerie en cours… »), et raccrocher en rouge à l'extrémité droite.
 *
 * C'est le cas favorable : une rangée se cadre, des boutons éparpillés ne se cadrent pas.
 *
 * LA BARRE PREND TOUTE LA LARGEUR, environ 40 px de haut. À l'échelle 1 elle ne tiendrait pas dans
 * un petit carré — d'où 50 %, où les icônes restent reconnaissables et le nom lisible. 620 px de
 * large montrent 1240 px de leur écran, soit la rangée entière, raccrocher compris. */
const HUBLOT_L_INITIAL = 620
const HUBLOT_H_INITIAL = 70
const ZOOM_INITIAL = 0.5

const CLE_HUBLOT = 'kimatch.volet-allo.hublot'
const CLE_CADRAGE = 'kimatch.volet-allo.cadrage'
const CLE_TAILLE_HUBLOT = 'kimatch.volet-allo.hublot.taille'
const CLE_ZOOM_HUBLOT = 'kimatch.volet-allo.hublot.zoom'
const ZOOM_MIN = 0.3
const ZOOM_MAX = 1.6
const PAS_ZOOM = 0.1

/**
 * La commande globale, comme pour la téléphonie.
 *
 * Le bouton « Appeler » vit au fond de listes imbriquées ; il doit pouvoir ouvrir ce volet sans
 * qu'on remonte un contexte jusqu'à lui. Le téléphone est unique dans l'application.
 */
let ouvrirCourant: (() => void) | null = null
let dejaUtilise = false

/**
 * L'APPEL DOIT-IL VIVRE DANS LE HUBLOT PLUTÔT QUE DANS L'APPLICATION DE BUREAU ?
 *
 * Les deux s'excluent, et c'est la découverte du 15/09 : raccrocher et transférer n'existent que
 * dans l'interface d'Allo. Si l'appel part dans l'application de bureau, Kimatch n'a plus aucune
 * prise dessus — l'API d'Allo n'offre aucun contrôle d'appel. Si l'appel part dans le hublot, les
 * boutons d'Allo sont là, sous les yeux, dans Kimatch.
 *
 * Lancer `allo://` EN PLUS du dépôt dans la file avait du sens tant que le volet n'était qu'un
 * dépannage. Depuis qu'on choisit le hublot, c'est le contraire : le protocole ouvre l'application
 * de bureau par-dessus, l'appel s'y déroule, et le hublot reste vide.
 *
 * ── LE VOLET EST LE DÉFAUT, ET NE DÉPEND PAS DE SON ÉTAT D'OUVERTURE ──
 *
 * Première version fausse, 15/09 : je n'écartais `allo://` que si le volet était DÉJÀ OUVERT.
 * Naoëlle avait le sien fermé — Chrome lui a redemandé d'ouvrir l'application de bureau, et le
 * hublot est resté vide. L'ouverture du volet est une conséquence de l'appel, pas sa condition :
 * s'en servir comme test inversait la cause et l'effet.
 *
 * On lit donc une PRÉFÉRENCE, distincte de l'état d'ouverture, et dont le défaut est le volet.
 * Seul quelqu'un qui a explicitement choisi l'application de bureau retrouve le protocole.
 *
 * On lit le stockage et non un état React : `appeler()` vit dans le fournisseur de téléphonie, qui
 * ne connaît pas ce composant. Une fonction, pas un contexte de plus.
 */
const CLE_PREFERENCE_BUREAU = 'kimatch.appel.application-bureau'

export function appelDansLeVolet(): boolean {
  try {
    return localStorage.getItem(CLE_PREFERENCE_BUREAU) !== '1'
  } catch {
    /* Stockage refusé : on garde le volet, qui marche partout, plutôt qu'un protocole qui suppose
       une application installée. */
    return true
  }
}

export function ouvrirVoletAllo() {
  ouvrirCourant?.()
}

/**
 * Ouvre le volet SEULEMENT s'il a déjà servi dans cette session.
 *
 * Depuis qu'un clic sur un numéro tente `allo://call` — donc lance l'appel dans l'application de
 * bureau quand elle est installée — faire surgir le volet à chaque appel serait du bruit pour qui
 * téléphone depuis son application. Mais pour qui n'a pas cette application, le volet EST le
 * téléphone : il doit continuer de s'ouvrir.
 *
 * La règle est donc « ouvre ce qui sert déjà » : la pastille reste là pour le premier clic, et
 * ensuite le volet suit les appels.
 */
export function ouvrirVoletAlloSiDejaUtilise() {
  if (dejaUtilise) ouvrirCourant?.()
}

export function VoletAllo() {
  /* DEUX ÉTATS, ET C'EST TOUTE L'ASTUCE. `charge` dit si le cadre a déjà été monté — il ne
     redescend jamais à faux. `ouvert` dit s'il est visible. Un seul état aurait démonté le cadre au
     repli, donc raccroché l'appel. */
  const [charge, setCharge] = useState(false)
  const [ouvert, setOuvert] = useState(false)
  const [largeur, setLargeur] = useState(LARGEUR_DEFAUT)
  /* CE QUE KIMATCH SAIT DE L'APPEL EN COURS, et qui sert à protéger le seul geste destructeur de ce
     volet. Le hook interroge déjà pour la carte d'appel : le lire ici ne coûte rien de plus. */
  const { data: appel } = useAppelEnCours()
  const appelEnCours = Boolean(appel && !appel.termine_le)
  /* PENDANT LE GLISSEMENT, LE CADRE NE DOIT PLUS RECEVOIR LA SOURIS. Un iframe avale les événements
     de pointeur : sans ce drapeau, la poignée se décroche dès que le curseur passe au-dessus d'Allo,
     et le volet se figeait à mi-course. */
  const [glisse, setGlisse] = useState(false)

  /* ══ LE HUBLOT ══
     `hublot` : on ne montre qu'un rectangle d'Allo. `cadrage` : quel rectangle. `recadre` : on est
     en train de le déplacer, donc le cadre ne doit plus recevoir la souris. */
  const [hublot, setHublot] = useState(true)
  const [cadrages, setCadrages] = useState(CADRAGE_DEFAUT)
  const [tailleHublot, setTailleHublot] = useState({ l: HUBLOT_L_INITIAL, h: HUBLOT_H_INITIAL })
  const [recadre, setRecadre] = useState(false)
  /* LE ZOOM DU HUBLOT, indépendant de l'échelle du volet entier. La barre d'appel d'Allo est large :
     à l'échelle 1 elle ne tient pas dans un petit carré, et réduite de trop elle devient illisible.
     Le bon réglage ne se devine pas depuis le code — il se trouve devant un vrai appel. */
  const [zoomHublot, setZoomHublot] = useState(ZOOM_INITIAL)
  const [glisseCadrage, setGlisseCadrage] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [glisseTaille, setGlisseTaille] = useState<{ x: number; y: number; l: number; h: number } | null>(null)

  useEffect(() => {
    try {
      if (localStorage.getItem(CLE_MEMOIRE) === '1') {
        dejaUtilise = true
        setCharge(true)
        setOuvert(true)
      }
      const l = Number(localStorage.getItem(CLE_LARGEUR))
      if (Number.isFinite(l) && l >= LARGEUR_MIN && l <= LARGEUR_MAX) setLargeur(l)

      /* LE HUBLOT EST LE DÉFAUT. Seul un « 0 » explicite rend le volet entier : quelqu'un qui n'a
         jamais rien réglé doit voir le petit carré, pas les quatre colonnes d'Allo. */
      if (localStorage.getItem(CLE_HUBLOT) === '0') setHublot(false)

      const c = localStorage.getItem(CLE_CADRAGE)
      if (c) {
        /* `x,y,x,y` : repos puis appel. Une ancienne valeur à deux nombres vaut pour les deux —
           personne ne perd son réglage parce qu'on en a ajouté un second. */
        const n = c.split(',').map(Number)
        if (n.length >= 2 && n.every(Number.isFinite)) {
          setCadrages({
            repos: { x: n[0], y: n[1] },
            appel: n.length >= 4 ? { x: n[2], y: n[3] } : { x: n[0], y: n[1] },
          })
        }
      }
      const z = Number(localStorage.getItem(CLE_ZOOM_HUBLOT))
      if (Number.isFinite(z) && z >= ZOOM_MIN && z <= ZOOM_MAX) setZoomHublot(z)

      const t = localStorage.getItem(CLE_TAILLE_HUBLOT)
      if (t) {
        const [tl, th] = t.split(',').map(Number)
        if (Number.isFinite(tl) && Number.isFinite(th)) {
          setTailleHublot({
            l: Math.min(HUBLOT_MAX_L, Math.max(HUBLOT_MIN, tl)),
            h: Math.min(HUBLOT_MAX_H, Math.max(HUBLOT_MIN, th)),
          })
        }
      }
    } catch {
      /* Navigation privée, stockage refusé : le volet s'ouvrira au premier clic, c'est tout. */
    }
  }, [])

  useEffect(() => {
    ouvrirCourant = () => {
      dejaUtilise = true
      setCharge(true)
      setOuvert(true)
      try { localStorage.setItem(CLE_MEMOIRE, '1') } catch { /* sans conséquence */ }
    }
    return () => { ouvrirCourant = null }
  }, [])

  /* ══ LE VOLET ANNONCE SA LARGEUR, ET LA CARTE D'APPEL S'ECARTE ══
   *
   * Les deux vivaient au meme endroit — `bottom-4 right-4` — et la carte, plus haute dans la pile,
   * recouvrait la pastille. Volet ouvert, elle aurait recouvert l'interface d'Allo elle-meme, donc
   * peut-etre son bouton raccrocher : le seul bouton de tout ce dispositif qu'il ne faut jamais
   * masquer.
   *
   * Une variable CSS sur la racine plutot qu'un etat remonte dans le fournisseur : les deux
   * composants restent independants, et le decalage est une affaire de mise en page, pas de logique.
   */
  useEffect(() => {
    const occupe = hublot ? tailleHublot.l : largeur
    document.documentElement.style.setProperty('--volet-allo', ouvert ? `${occupe}px` : '0px')
    return () => document.documentElement.style.setProperty('--volet-allo', '0px')
  }, [ouvert, largeur, hublot, tailleHublot.l])

  /* LE CADRAGE ACTIF. `appelEnCours` vient déjà du hook lu plus haut pour protéger la fermeture. */
  const modeCadrage: 'repos' | 'appel' = appelEnCours ? 'appel' : 'repos'
  const cadrage = cadrages[modeCadrage]

  /** Enregistre les deux cadrages sous la forme `repos.x,repos.y,appel.x,appel.y`. */
  const retenirCadrages = (c: typeof CADRAGE_DEFAUT) => {
    try {
      localStorage.setItem(
        CLE_CADRAGE,
        [c.repos.x, c.repos.y, c.appel.x, c.appel.y].map(Math.round).join(','),
      )
    } catch { /* sans conséquence */ }
  }

  /* ══ DÉPLACER LE CADRAGE ══
     On glisse le hublot SUR Allo : tirer vers la droite doit faire apparaître ce qui est à droite,
     donc le cadre recule d'autant. Les bornes empêchent de sortir du rendu et de ne montrer que du
     vide — le seul état d'où l'on ne saurait pas revenir. */
  useEffect(() => {
    if (!glisseCadrage) return
    const bouge = (e: PointerEvent) => {
      /* ON DIVISE PAR LE ZOOM : un déplacement de 100 px à l'écran vaut 200 px d'Allo quand tout est
         réduit de moitié. Sans ça, le cadrage file deux fois trop vite ou deux fois trop lentement. */
      const z = zoomHublot || 1
      /* ON NE TOUCHE QUE LE CADRAGE DU MOMENT : régler pendant un appel ne doit pas défaire celui du
         repos, et inversement. */
      setCadrages((c) => ({
        ...c,
        [modeCadrage]: {
          x: Math.min(LARGEUR_LOGIQUE - 60, Math.max(0, glisseCadrage.ox - (e.clientX - glisseCadrage.x) / z)),
          /* `+` ET NON `-` sur l'axe vertical : `y` se compte vers le HAUT depuis le bas d'Allo, donc
             tirer le contenu vers le bas revient à monter dans leur écran. */
          y: Math.min(HAUTEUR_LOGIQUE - 60, Math.max(0, glisseCadrage.oy + (e.clientY - glisseCadrage.y) / z)),
        },
      }))
    }
    const fini = () => {
      setGlisseCadrage(null)
      setCadrages((c) => { retenirCadrages(c); return c })
    }
    window.addEventListener('pointermove', bouge)
    window.addEventListener('pointerup', fini)
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', bouge)
      window.removeEventListener('pointerup', fini)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [glisseCadrage, zoomHublot, modeCadrage])

  /* ══ REDIMENSIONNER LE HUBLOT ══
     Par le coin haut-gauche : le hublot est ancré en bas à droite, c'est donc ce coin-là qui bouge
     quand on l'agrandit. */
  useEffect(() => {
    if (!glisseTaille) return
    const bouge = (e: PointerEvent) => {
      setTailleHublot({
        l: Math.min(HUBLOT_MAX_L, Math.max(HUBLOT_MIN, glisseTaille.l - (e.clientX - glisseTaille.x))),
        h: Math.min(HUBLOT_MAX_H, Math.max(HUBLOT_MIN, glisseTaille.h - (e.clientY - glisseTaille.y))),
      })
    }
    const fini = () => {
      setGlisseTaille(null)
      setTailleHublot((t) => {
        try { localStorage.setItem(CLE_TAILLE_HUBLOT, `${Math.round(t.l)},${Math.round(t.h)}`) } catch { /* sans conséquence */ }
        return t
      })
    }
    window.addEventListener('pointermove', bouge)
    window.addEventListener('pointerup', fini)
    document.body.style.cursor = 'nwse-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', bouge)
      window.removeEventListener('pointerup', fini)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [glisseTaille])

  /** Passe du hublot au volet entier, et retient le choix. */
  const basculerHublot = () => {
    setHublot((h) => {
      const n = !h
      if (n) setRecadre(false)
      try { localStorage.setItem(CLE_HUBLOT, n ? '1' : '0') } catch { /* sans conséquence */ }
      return n
    })
  }

  /* ══ LA POIGNÉE ══
   *
   * Les événements sont posés sur la FENÊTRE et non sur la poignée : un glissement rapide sort du
   * trait de 6 pixels avant que le navigateur n'ait envoyé le mouvement suivant, et la poignée
   * perdrait le curseur. */
  useEffect(() => {
    if (!glisse) return
    const bouge = (e: PointerEvent) => {
      const l = Math.min(LARGEUR_MAX, Math.max(LARGEUR_MIN, window.innerWidth - e.clientX))
      setLargeur(l)
    }
    const fini = () => {
      setGlisse(false)
      // On n'enregistre qu'à la fin : écrire à chaque pixel remplirait le stockage pour rien.
      setLargeur((l) => {
        try { localStorage.setItem(CLE_LARGEUR, String(Math.round(l))) } catch { /* sans conséquence */ }
        return l
      })
    }
    window.addEventListener('pointermove', bouge)
    window.addEventListener('pointerup', fini)
    // Le curseur et la sélection suivent le geste, pas la page en dessous.
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', bouge)
      window.removeEventListener('pointerup', fini)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [glisse])

  /* L'ÉCHELLE SUIT LA LARGEUR RÉELLE, bornée à 1 : élargi au-delà de 1280 px, le volet n'agrandit
     pas Allo artificiellement — il lui rend sa taille normale, et c'est là qu'il est le plus lisible. */
  const largeurUtile = Math.min(largeur, typeof window === 'undefined' ? largeur : window.innerWidth * 0.95)
  const echelle = Math.max(ECHELLE_MIN, Math.min(1, largeurUtile / LARGEUR_LOGIQUE))

  /** Change la largeur d'un cran, et la retient. C'est le réglage de taille du texte. */
  const regler = (delta: number) => {
    setLargeur((l) => {
      const n = Math.min(LARGEUR_MAX, Math.max(LARGEUR_MIN, l + delta))
      try { localStorage.setItem(CLE_LARGEUR, String(n)) } catch { /* sans conséquence */ }
      return n
    })
  }

  /** En hublot, les mêmes boutons règlent le zoom : la largeur, elle, se tire par le coin. */
  const reglerZoom = (delta: number) => {
    setZoomHublot((z) => {
      const n = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta)) * 100) / 100
      try { localStorage.setItem(CLE_ZOOM_HUBLOT, String(n)) } catch { /* sans conséquence */ }
      return n
    })
  }

  const replier = () => {
    setOuvert(false)
    try { localStorage.setItem(CLE_MEMOIRE, '0') } catch { /* sans conséquence */ }
  }

  /* ÉCHAP REPLIE, comme partout ailleurs dans l'application.
   *
   * AVEC UNE LIMITE À DIRE : quand le curseur travaille DANS Allo, la touche part au cadre et ne nous
   * parvient jamais — un site affiché dans un autre ne partage pas ses événements clavier. Échap
   * sert donc quand on est revenu sur la fiche, ce qui est justement le moment où l'on veut replier. */
  useEffect(() => {
    if (!ouvert) return
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') replier() }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [ouvert])

  /* ══ FERMER DÉMONTE VRAIMENT, ET C'EST LE SEUL GESTE QUI LE FASSE ══
   *
   * Il coupe la session du volet, donc l'appel en cours et tout numéro à moitié tapé. C'est
   * légitime — il faut bien pouvoir remettre le volet à zéro — mais Naoëlle vient d'insister :
   * « que la réduction ne stoppe pas l'action, c'est important ». Le repli ne stoppe rien ; la
   * fermeture, elle, est à trois pixels du bouton de repli.
   *
   * ON DEMANDE DONC CONFIRMATION, MAIS SEULEMENT QUAND ÇA COÛTE QUELQUE CHOSE : un appel est en
   * cours d'après ce que le webhook a écrit. Le reste du temps la croix ferme sans rien demander —
   * confirmer un geste inoffensif apprend surtout à cliquer « oui » sans lire. */
  const fermer = () => {
    if (appelEnCours) {
      const message = [
        'Un appel est en cours. Fermer le volet couperait la session Allo.',
        '',
        'Pour garder l’appel, utilise « replier » : le volet disparaît sans rien interrompre.',
      ].join('\n')
      if (!window.confirm(message)) return
    }
    setOuvert(false)
    setCharge(false)
    try { localStorage.setItem(CLE_MEMOIRE, '0') } catch { /* sans conséquence */ }
  }

  /* ══ LA PASTILLE : À GAUCHE DE LA ZONE PRINCIPALE, ET SANS ÉTIQUETTE ══
   *
   * Naoëlle, 08/09/2026 : « mets le bouton téléphone à gauche de l'écran principal et non à droite,
   * et juste le logo du téléphone, pas besoin d'écrire téléphone. »
   *
   * À GAUCHE DU CONTENU, PAS DE LA FENÊTRE. La barre latérale fait 215 px et le contenu commence
   * après — `md:pl-[215px]` sur le `<main>`. Une pastille à `left-4` se serait posée sur « Mon
   * profil », en bas de cette barre.
   *
   * SUR MOBILE, elle remonte au-dessus de la barre de navigation du bas — `pb-14` sur le contenu —
   * et revient au bord gauche, puisque la barre latérale devient un tiroir.
   *
   * ET L'ÉTIQUETTE PART, mais pas pour tout le monde : `aria-label` et `title` la remplacent. Un
   * bouton réduit à une icône est muet pour un lecteur d'écran, et illisible au survol pour qui ne
   * reconnaît pas le pictogramme. */
  const pastille = (
    <button
      type="button"
      onClick={() => ouvrirVoletAllo()}
      title="Ouvrir le téléphone"
      aria-label="Ouvrir le téléphone"
      className="pastille-flottante fixed bottom-[4.5rem] left-4 z-[65] flex h-11 w-11 items-center justify-center rounded-full bg-kiwi-gradient text-white shadow-km-green transition-opacity hover:opacity-90 md:bottom-4 md:left-[231px]"
    >
      <Phone className="h-[18px] w-[18px] text-white" />
      {charge && (
        /* LE POINT DIT CE QUI VIT DERRIÈRE. Vert : la session du volet est encore là, rouvrir ne
           redemandera pas de se connecter. Ambre et clignotant : un appel est en cours — c'est ce
           qui rassure quand on a replié le volet au milieu d'une conversation. */
        <span
          className={cn(
            // En médaillon sur l'icône, puisqu'il n'y a plus de texte à côté de quoi se ranger.
            /* SUR FOND VERT, LE POINT VERT DISPARAÎT. Naoëlle, 10/09/2026 : « il faudrait changer
               la couleur des icônes d'appel et de notification car blanc sur blanc ce n'est pas
               visible. » En passant la pastille au vert plein, le médaillon devait suivre : blanc
               pour la session vivante, ambre pour l'appel en cours — les deux se détachent du vert,
               ce que ni le vert ni le blanc ne faisaient sur leur propre fond. */
            'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-km-green',
            appelEnCours ? 'animate-pulse bg-km-amber' : 'bg-white',
          )}
          aria-label={appelEnCours ? 'appel en cours' : 'session Allo active'}
        />
      )}
    </button>
  )

  return (
    <>
      {!ouvert && pastille}

      {/* ══ REPLIER NE DOIT RIEN INTERROMPRE — ET LE REPLI GLISSE, IL NE CACHE PAS ══
       *
       * Naoëlle, 08/09/2026 : « le raccourci réduire à côté de la croix ne fonctionne pas », puis
       * « même si on replie le volet, il faut que le numéro saisi ou l'appel en cours soit encore
       * là, que la réduction ne stoppe pas l'action, c'est important ».
       *
       * LE BOUTON NE MARCHAIT PAS, ET C'ÉTAIT DE MON FAIT : le volet porte `flex`, donc
       * `display: flex`, qui ÉCRASE l'attribut `hidden`. Celui-ci ne vaut qu'un `display: none` de
       * la feuille du navigateur, que n'importe quelle déclaration d'auteur bat. Le bouton appelait
       * bien `replier`, et rien ne bougeait à l'écran.
       *
       * ET ON NE LE CORRIGE PAS AVEC `display: none`. Un cadre non affiché voit son rendu suspendu
       * par le navigateur, et un numéro à moitié tapé dans un champ démonté est perdu. C'est
       * exactement ce que Naoëlle demande d'éviter.
       *
       * LE VOLET SORT DONC DE L'ÉCRAN : toujours rendu, toujours audible, toujours en train de
       * garder ce qu'on y a saisi — simplement plus visible. `pointer-events-none` l'empêche
       * d'intercepter les clics de la fiche derrière lui, et le cadre n'est jamais démonté tant
       * qu'on n'a pas cliqué « fermer ». */}
      {charge && (
        <div
          aria-hidden={!ouvert}
          /* LE MÊME ÉLÉMENT DANS LES DEUX MODES, et c'est vital : déplacer le cadre dans l'arbre le
             remonterait, et remonter le cadre RACCROCHE L'APPEL. On ne change que des classes. */
          style={
            hublot
              ? { width: `min(${tailleHublot.l}px, 95vw)`, height: `min(${tailleHublot.h}px, 80vh)` }
              : { width: `min(${largeur}px, 95vw)` }
          }
          className={cn(
            'fixed z-[66] flex flex-col border-km-line bg-white shadow-km-pop',
            'transition-transform duration-200 motion-reduce:transition-none',
            hublot
              ? 'bottom-4 right-4 overflow-hidden rounded-km-md border'
              : 'bottom-0 right-0 top-0 border-l',
            ouvert ? 'translate-x-0' : 'pointer-events-none translate-x-full',
          )}
        >
          {/* LA POIGNÉE, sur le bord gauche. Large de six pixels, elle déborde de trois de chaque
              côté du trait pour être attrapable sans viser. */}
          <div
            onPointerDown={(e) => { e.preventDefault(); setGlisse(true) }}
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionner le volet"
            title="Glisser pour redimensionner"
            className={cn(
              'absolute inset-y-0 -left-[3px] z-10 w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-km-green/40',
              hublot && 'hidden',
            )}
          />

          {/* LE COIN DU HUBLOT. Il est ancré en bas à droite : c'est donc son coin haut-gauche qui
              s'écarte quand on l'agrandit. */}
          <div
            onPointerDown={(e) => {
              e.preventDefault()
              setGlisseTaille({ x: e.clientX, y: e.clientY, l: tailleHublot.l, h: tailleHublot.h })
            }}
            role="separator"
            aria-label="Redimensionner le hublot"
            title="Glisser pour agrandir"
            className={cn(
              'absolute left-0 top-0 z-20 h-3 w-3 cursor-nwse-resize',
              !hublot && 'hidden',
            )}
          />
          <div
            className={cn(
              'flex flex-none items-center gap-2 border-b border-km-line',
              hublot ? 'px-2 py-1' : 'px-3.5 py-2.5',
            )}
          >
            <Phone className={cn('shrink-0 text-km-green', hublot ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
            <div className="min-w-0 flex-1">
              {hublot ? (
                /* EN HUBLOT, LE TITRE DIT L'APPEL, PAS L'OUTIL. La place est comptée, et « Téléphone
                   / Allo, dans Kimatch » n'apprend rien à quelqu'un qui a déjà quelqu'un en ligne. */
                <p className="truncate text-km-label font-semibold text-km-text">
                  {appelEnCours ? 'Appel en cours' : 'Téléphone'}
                </p>
              ) : (
                <>
                  <p className="text-km-body font-bold text-km-text">Téléphone</p>
                  <p className="truncate text-km-label text-km-faint">Allo, dans Kimatch</p>
                </>
              )}
            </div>

            {/* RECADRER — visible seulement en hublot. C'est la réparation de cinq secondes le jour
                où Allo déplace ses boutons : on tire Allo derrière la fenêtre jusqu'à retrouver la
                barre d'appel, et la position est retenue. */}
            <button
              type="button"
              onClick={() => setRecadre((r) => !r)}
              title={recadre ? 'Terminer le recadrage' : 'Recadrer — glisser pour choisir ce qu’on voit'}
              className={cn(
                'shrink-0 rounded p-1 transition-colors',
                !hublot && 'hidden',
                recadre ? 'bg-km-green text-white' : 'text-km-faint hover:bg-km-soft hover:text-km-text',
              )}
            >
              <Move className="h-3.5 w-3.5" />
            </button>

            {/* AGRANDIR / RÉDUIRE. Le volet entier reste accessible : c'est là que vivent les
                discussions, les résumés et le Power Dialer, dont le hublot ne montre rien. */}
            <button
              type="button"
              onClick={basculerHublot}
              title={hublot ? 'Voir tout Allo' : 'Ne garder que la barre d’appel'}
              className="shrink-0 rounded p-1 text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
            >
              {hublot ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
            </button>
            {/* LE RÉGLAGE DE TAILLE, dit dans les termes du résultat et non du mécanisme : personne
                n'a envie de savoir qu'il ajuste une échelle de transformation. Le pourcentage sert de
                repère entre deux crans. */}
            <div className="flex shrink-0 items-center gap-0.5 rounded-km border border-km-line px-0.5">
              <button
                type="button"
                onClick={() => (hublot ? reglerZoom(-PAS_ZOOM) : regler(-PAS_LARGEUR))}
                disabled={hublot ? zoomHublot <= ZOOM_MIN : largeur <= LARGEUR_MIN}
                title="Plus petit"
                className="rounded p-1 text-km-faint transition-colors hover:bg-km-soft hover:text-km-text disabled:opacity-30"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[30px] text-center font-mono text-km-tiny tabular-nums text-km-faint">
                {Math.round((hublot ? zoomHublot : echelle) * 100)}%
              </span>
              <button
                type="button"
                onClick={() => (hublot ? reglerZoom(PAS_ZOOM) : regler(PAS_LARGEUR))}
                disabled={hublot ? zoomHublot >= ZOOM_MAX : largeur >= LARGEUR_MAX}
                title="Plus grand"
                className="rounded p-1 text-km-faint transition-colors hover:bg-km-soft hover:text-km-text disabled:opacity-30"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>
            <a
              href={URL_ALLO}
              target="_blank"
              rel="noreferrer"
              title="Ouvrir Allo dans un onglet"
              className={cn('shrink-0 rounded p-1 text-km-faint transition-colors hover:bg-km-soft hover:text-km-text', hublot && 'hidden')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {/* REPLIER N'EST PAS FERMER, et les deux boutons sont là pour qu'on puisse choisir. */}
            <button
              type="button"
              onClick={replier}
              title="Replier — l’appel et le numéro saisi restent"
              className="shrink-0 rounded p-1 text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={fermer}
              title="Fermer — coupe la session Allo du volet"
              className="shrink-0 rounded p-1 text-km-faint transition-colors hover:bg-km-red-soft hover:text-km-red"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* LE CADRE VIT DANS UNE BOÎTE QUI LE ROGNE, et il est réduit pour tenir dedans.
              `height: calc(100% / var(--zoom))` compense la réduction : sans cette division, le
              cadre mis à l'échelle ne remplirait que les deux tiers de la hauteur du volet. */}
          <div
            onPointerDown={(e) => {
              if (!hublot || !recadre) return
              e.preventDefault()
              setGlisseCadrage({ x: e.clientX, y: e.clientY, ox: cadrage.x, oy: cadrage.y })
            }}
            className={cn(
              'relative min-h-0 flex-1 overflow-hidden',
              hublot && recadre && 'cursor-grab ring-2 ring-inset ring-km-green',
            )}
            style={{ ['--zoom' as string]: String(hublot ? 1 : echelle) }}
          >
            <iframe
              src={URL_ALLO}
              title="Allo"
              /* LE MICROPHONE EST DÉLÉGUÉ AU CADRE. Sans cette permission, Allo affiche « vous ne
                 pouvez pas recevoir ou passer d'appels tant que le microphone n'est pas activé ».
                 `autoplay` pour la sonnerie et la voix, `clipboard-write` parce qu'Allo propose de
                 copier des numéros. */
              allow="microphone; autoplay; clipboard-write"
              className="absolute border-0"
              /* EN HUBLOT : taille naturelle, décalée de la position du cadrage — le rectangle
                 visible est donc un morceau d'Allo à l'échelle 1, lisible.
                 EN VOLET : tout Allo, réduit pour tenir. Deux mises en page, un seul cadre. */
              style={
                hublot
                  ? {
                      /* LE DÉCALAGE EST EN PIXELS D'ÉCRAN, donc multiplié par le zoom : le cadrage se
                         raisonne dans les coordonnées d'Allo, l'affichage dans celles de la page.
                         `bottom` et non `top` : c'est le bas d'Allo qu'on aligne sur le bas du
                         hublot, parce que c'est là que vivent ses touches. */
                      left: `${-cadrage.x * zoomHublot}px`,
                      bottom: `${-cadrage.y * zoomHublot}px`,
                      width: `${LARGEUR_LOGIQUE}px`,
                      height: `${HAUTEUR_LOGIQUE}px`,
                      transform: `scale(${zoomHublot})`,
                      transformOrigin: 'top left',
                      /* PENDANT LE RECADRAGE, LE CADRE NE PREND PLUS LA SOURIS : un iframe avale les
                         événements de pointeur, et le glissement se figerait au premier pixel. */
                      pointerEvents: recadre || glisseCadrage || glisseTaille ? 'none' : 'auto',
                    }
                  : {
                      left: 0,
                      top: 0,
                      width: `${LARGEUR_LOGIQUE}px`,
                      height: 'calc(100% / var(--zoom))',
                      transform: 'scale(var(--zoom))',
                      transformOrigin: 'top left',
                      pointerEvents: glisse ? 'none' : 'auto',
                    }
              }
            />
          </div>

          {/* CE QU'IL FAUT SAVOIR PENDANT QU'ON RECADRE, et seulement à ce moment-là. */}
          {hublot && recadre && (
            <div className="flex-none border-t border-km-line bg-km-green/10 px-2 py-1 text-km-tiny leading-tight text-km-text">
              <p>
                {modeCadrage === 'appel'
                  ? 'Glisse jusqu’à voir les touches d’appel, puis reclique sur l’icône.'
                  : 'Glisse jusqu’à voir la barre de composition, puis reclique sur l’icône.'}
              </p>
              <p className="text-km-muted">
                Réglage « {modeCadrage === 'appel' ? 'pendant un appel' : 'au repos'} » — l’autre est
                conservé.
              </p>
              {/* LES CHIFFRES SONT AFFICHÉS POUR POUVOIR ÊTRE RAPPORTÉS. Le réglage est retenu dans
                  CE navigateur ; le lire permet d'en faire le défaut de toute l'équipe, pour que
                  personne d'autre n'ait à recommencer. */}
              <p className="mt-0.5 font-mono tabular-nums text-km-muted">
                cadrage {Math.round(cadrage.x)}, {Math.round(cadrage.y)}
                {'  ·  '}hublot {Math.round(tailleHublot.l)} × {Math.round(tailleHublot.h)}
                {'  ·  '}zoom {Math.round(zoomHublot * 100)}%
                {'  ·  '}(y compté depuis le bas)
              </p>
            </div>
          )}

          {/* DEUX CHOSES QU'ON NE DEVINE PAS, dites ici plutôt que découvertes en tâtonnant : la
              session du volet est distincte de celle de l'onglet, et c'est l'extension — pas
              Kimatch — qui sait composer un numéro d'un clic. */}
          <div className={cn('flex-none border-t border-km-line bg-km-soft px-3.5 py-2 text-km-label leading-snug text-km-muted', hublot && 'hidden')}>
            <p>
              La première fois, connecte-toi ici même — le navigateur garde la session du volet à
              part de celle de ton onglet Allo. Ensuite, elle reste.
            </p>
            <p className="mt-1.5">
              Pour appeler un numéro d’un seul clic depuis une fiche,{' '}
              <a
                href={URL_EXTENSION}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-km-green hover:underline"
              >
                installe l’extension Allo
              </a>{' '}
              et connecte-toi dedans. Elle pose son icône à côté des numéros et lance l’appel
              directement.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
