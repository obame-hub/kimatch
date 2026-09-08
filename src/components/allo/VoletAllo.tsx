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
import { Phone, Minus, X, ExternalLink, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppelEnCours } from '@/lib/data/appelEnCours'

const URL_ALLO = 'https://web.withallo.com'

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

/**
 * La commande globale, comme pour la téléphonie.
 *
 * Le bouton « Appeler » vit au fond de listes imbriquées ; il doit pouvoir ouvrir ce volet sans
 * qu'on remonte un contexte jusqu'à lui. Le téléphone est unique dans l'application.
 */
let ouvrirCourant: (() => void) | null = null

export function ouvrirVoletAllo() {
  ouvrirCourant?.()
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

  useEffect(() => {
    try {
      if (localStorage.getItem(CLE_MEMOIRE) === '1') {
        setCharge(true)
        setOuvert(true)
      }
      const l = Number(localStorage.getItem(CLE_LARGEUR))
      if (Number.isFinite(l) && l >= LARGEUR_MIN && l <= LARGEUR_MAX) setLargeur(l)
    } catch {
      /* Navigation privée, stockage refusé : le volet s'ouvrira au premier clic, c'est tout. */
    }
  }, [])

  useEffect(() => {
    ouvrirCourant = () => {
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
    document.documentElement.style.setProperty('--volet-allo', ouvert ? `${largeur}px` : '0px')
    return () => document.documentElement.style.setProperty('--volet-allo', '0px')
  }, [ouvert, largeur])

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

  // ── LA PASTILLE, quand le volet est replié ou pas encore ouvert ──────────────────────────────
  const pastille = (
    <button
      type="button"
      onClick={() => ouvrirVoletAllo()}
      title="Ouvrir Allo dans Kimatch"
      className="fixed bottom-4 right-4 z-[65] flex items-center gap-2 rounded-full border border-km-line bg-white px-3.5 py-2.5 text-km-label font-semibold text-km-text shadow-km-pop transition-colors hover:bg-km-soft"
    >
      <Phone className="h-3.5 w-3.5 text-km-green" />
      Téléphone
      {charge && (
        /* LE POINT DIT CE QUI VIT DERRIÈRE. Vert : la session du volet est encore là, rouvrir ne
           redemandera pas de se connecter. Ambre et clignotant : un appel est en cours — c'est ce
           qui rassure quand on a replié le volet au milieu d'une conversation. */
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            appelEnCours ? 'animate-pulse bg-km-amber' : 'bg-km-green',
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
          style={{ width: `min(${largeur}px, 95vw)` }}
          className={cn(
            'fixed bottom-0 right-0 top-0 z-[66] flex flex-col border-l border-km-line bg-white shadow-km-pop',
            'transition-transform duration-200 motion-reduce:transition-none',
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
            className="absolute inset-y-0 -left-[3px] z-10 w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-km-green/40"
          />
          <div className="flex flex-none items-center gap-2 border-b border-km-line px-3.5 py-2.5">
            <Phone className="h-4 w-4 shrink-0 text-km-green" />
            <div className="min-w-0 flex-1">
              <p className="text-km-body font-bold text-km-text">Téléphone</p>
              <p className="truncate text-km-label text-km-faint">Allo, dans Kimatch</p>
            </div>
            {/* LE RÉGLAGE DE TAILLE, dit dans les termes du résultat et non du mécanisme : personne
                n'a envie de savoir qu'il ajuste une échelle de transformation. Le pourcentage sert de
                repère entre deux crans. */}
            <div className="flex shrink-0 items-center gap-0.5 rounded-km border border-km-line px-0.5">
              <button
                type="button"
                onClick={() => regler(-PAS_LARGEUR)}
                disabled={largeur <= LARGEUR_MIN}
                title="Plus petit"
                className="rounded p-1 text-km-faint transition-colors hover:bg-km-soft hover:text-km-text disabled:opacity-30"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[30px] text-center font-mono text-km-tiny tabular-nums text-km-faint">
                {Math.round(echelle * 100)}%
              </span>
              <button
                type="button"
                onClick={() => regler(PAS_LARGEUR)}
                disabled={largeur >= LARGEUR_MAX}
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
              className="shrink-0 rounded p-1 text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
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
            className="relative min-h-0 flex-1 overflow-hidden"
            style={{ ['--zoom' as string]: String(echelle) }}
          >
            <iframe
              src={URL_ALLO}
              title="Allo"
              /* LE MICROPHONE EST DÉLÉGUÉ AU CADRE. Sans cette permission, Allo affiche « vous ne
                 pouvez pas recevoir ou passer d'appels tant que le microphone n'est pas activé ».
                 `autoplay` pour la sonnerie et la voix, `clipboard-write` parce qu'Allo propose de
                 copier des numéros. */
              allow="microphone; autoplay; clipboard-write"
              className="absolute left-0 top-0 border-0"
              style={{
                width: `${LARGEUR_LOGIQUE}px`,
                height: 'calc(100% / var(--zoom))',
                transform: 'scale(var(--zoom))',
                transformOrigin: 'top left',
                pointerEvents: glisse ? 'none' : 'auto',
              }}
            />
          </div>

          {/* LA SESSION SÉPARÉE, DITE UNE FOIS. Sans cette phrase, on croit à une panne : on est
              connecté à Allo dans un onglet, et le volet redemande la connexion. */}
          <p className="flex-none border-t border-km-line bg-km-soft px-3.5 py-2 text-km-label leading-snug text-km-muted">
            La première fois, connecte-toi ici même — le navigateur garde la session du volet à part
            de celle de ton onglet Allo. Ensuite, elle reste.
          </p>
        </div>
      )}
    </>
  )
}
