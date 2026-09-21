/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * NOTRE PROPRE FENÊTRE D'APPEL — CE QUI SE PASSE ENTRE LE CLIC ET LA SONNERIE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 21/09/2026 : « l'app c'est ça, mais moi ce que je veux c'est appeler et raccrocher depuis
 * Kimatch. Le volet là est bien, juste je veux que quand je clique sur appeler ça appelle direct.
 * Là juste ça ouvre le volet. » Puis : « triche comme tu veux, même s'il faut créer notre propre
 * fenêtre d'appel. »
 *
 * ══ CE QUI NE PEUT PAS EXISTER, ET IL FAUT LE DIRE EN PREMIER ══
 *
 * Aucune triche ne fera passer la VOIX par Kimatch. Un appel a besoin d'un microphone et d'une
 * connexion au réseau d'Allo ; seul leur logiciel les a. Ce qu'on peut supprimer, ce sont les
 * gestes AUTOUR de l'appel — et il y en avait quatre.
 *
 * ══ LES QUATRE PORTES ESSAYÉES, ET POURQUOI ELLES SONT TOUTES FERMÉES ══
 *
 * Revérifié le 21/09/2026 sur le paquet du jour et sur leur OpenAPI, pas sur mes notes :
 *
 *   ① `DIAL_NUMBER` par postMessage — leur application embarque le SDK HubSpot et accepte la
 *      poignée de main, mais `on("dialNumber"` compte ZÉRO abonné (contre 1 pour `on("ready"`).
 *      Le message arrive, un événement part, personne ne l'écoute.
 *
 *   ② L'API REST — 64 chemins, 44 écritures, et pas une ne compose. Les seules routes `dialing-queues`
 *      lisent la file, la vident, la remplissent. Aucune ne décroche.
 *
 *   ③ `allo://call?number=…` — le protocole existe, l'application du Microsoft Store le déclare
 *      bien. Mais sur les postes de l'équipe Windows a donné `tel:` à Chrome et n'a enregistré
 *      AUCUN choix pour `allo`. Le navigateur n'a donc rien à lancer : c'est exactement ce que
 *      Naoëlle a vu, un clavier vide. C'est la faute que cette fenêtre corrige.
 *
 *   ④ Un softphone WebRTC à nous — leur paquet contient bien du WebRTC, mais c'est LEUR pile, liée
 *      à LEUR session. `startOutboundCall` n'existe que dans leur connecteur Freshsales, et il ne
 *      fait qu'écrire un objet en mémoire. Rien à emprunter.
 *
 * ══ LA CINQUIÈME PORTE ÉTAIT FAUSSE AUSSI — MESURÉ LE 21/09/2026 AU SOIR ══
 *
 * La première version de cette fenêtre disait « le numéro attend dans le téléphone, appuie sur
 * Appeler ». Deux choses l'ont démentie le soir même :
 *
 *   · LA CAPTURE DE NAOËLLE : le clavier d'Allo est VIDE et il n'y a AUCUN bouton « Appeler ».
 *     Juste un champ « Entrez un nom ou un numéro » et une pastille verte sous les touches. On
 *     envoyait chercher un bouton qui n'existe pas.
 *
 *   · LEUR API, INTERROGÉE DIRECTEMENT : son numéro était dans la file depuis le 8 SEPTEMBRE,
 *     position 0, `sync_status: NOT_SYNCED`. Treize jours sans qu'un seul appel parte. La file
 *     n'est pas « un clic de plus », c'est un cul-de-sac : elle alimente le Power Dialer, que ce
 *     clavier n'affiche même pas.
 *
 * ══ ET LA VRAIE CAUSE RACINE EST DANS WINDOWS, PAS DANS ALLO ══
 *
 * Relevé dans le registre du poste le 21/09 : l'application Allo (Microsoft Store,
 * `Mobile-First.All_3.44.0.0`) DÉCLARE bien les protocoles `tel`, `callto` et `allo` dans son
 * manifeste — mais son paquet n'est PAS ENREGISTRÉ pour la session de l'utilisateur. Les clés
 * `HKCU\Software\Classes\tel` et `…\allo` existent, vides, sans `shell\open\command`.
 *
 * Donc quand le navigateur rencontre `allo://call?number=…`, il cherche quoi lancer, ne trouve
 * rien, et NE FAIT RIEN, sans message. C'est l'explication de tout : du click-to-call d'Allo, de
 * leur extension Chrome, et de notre tentative par leur route `/call/`.
 *
 * ══ CE QUI RESTE, ET QUI MARCHE VRAIMENT ══
 *
 * Coller. Le numéro est copié dès l'ouverture de cette fenêtre : il n'y a plus qu'à se placer dans
 * le champ d'Allo, faire Ctrl+V, et appuyer sur le bouton vert. Ce n'est pas « ça appelle direct »,
 * et cette fenêtre ne le prétend plus.
 *
 * ══ POURQUOI UNE FENÊTRE À NOUS PLUTÔT QU'UN BANDEAU ══
 *
 * Le bandeau d'avant disait « ajouté à ta file d'appel Allo, en position 3 » et disparaissait en six
 * secondes. Trois défauts : il fallait savoir ce qu'est une file, la position 3 voulait dire qu'il
 * fallait cliquer trois fois, et le message partait avant qu'on ait fini de lire.
 *
 * Cette fenêtre-ci répond aux trois : elle NE PART PAS toute seule, elle dit QUI on appelle — pas
 * seulement un numéro —, et elle copie le numéro pour qu'il n'y ait plus qu'à le coller. Elle se
 * ferme quand l'appel démarre : à ce moment `CarteAppel` prend le relais, avec le
 * chronomètre et la qualification.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useState } from 'react'
import { Phone, X, Loader2, AlertTriangle, Copy, Check } from 'lucide-react'
import { numeroLisible } from '@/lib/telephonie'
import { useAppelEnCours } from '@/lib/data/appelEnCours'
import { ouvrirVoletAllo } from '@/components/allo/VoletAllo'
import { cn } from '@/lib/utils'

/** Ce que la fenêtre montre, et qui vient du clic sur « Appeler ». */
export interface AppelALancer {
  /** Le numéro en E.164, seul format qu'un composeur accepte sans ambiguïté. */
  e164: string
  /** Qui l'on appelle, quand l'écran le sait. Un numéro nu ne dit rien à personne. */
  nom?: string | null
  societe?: string | null
}

/** L'état du dépôt dans la file : c'est la seule chose qui puisse échouer. */
type EtatFile =
  | { phase: 'en_cours' }
  | { phase: 'pret'; position: number | null }
  | { phase: 'echec'; raison: string }

/* LA COMMANDE GLOBALE, comme pour le volet et la téléphonie. Les boutons « Appeler » vivent au fond
   de listes imbriquées ; ils ne doivent pas avoir à remonter un contexte jusqu'ici. */
let ouvrirCourant: ((appel: AppelALancer) => void) | null = null
let majFileCourante: ((etat: EtatFile) => void) | null = null

/** Ouvre la fenêtre d'appel. Appelée au clic, avant toute requête. */
export function ouvrirFenetreAppel(appel: AppelALancer) {
  ouvrirCourant?.(appel)
}

/** Dit à la fenêtre où en est le dépôt dans la file. */
export function signalerEtatFile(etat: EtatFile) {
  majFileCourante?.(etat)
}

export function FenetreAppel() {
  const [appel, setAppel] = useState<AppelALancer | null>(null)
  const [file, setFile] = useState<EtatFile>({ phase: 'en_cours' })
  const [copie, setCopie] = useState(false)
  const { data: enCours } = useAppelEnCours()

  useEffect(() => {
    ouvrirCourant = (a: AppelALancer) => {
      setAppel(a)
      setFile({ phase: 'en_cours' })
      setCopie(false)
      /* ══ ON COPIE TOUT DE SUITE, SANS ATTENDRE UN SECOND CLIC ══
       *
       * Puisque le seul chemin qui marche est « coller dans le clavier d'Allo », autant que le
       * numéro y soit déjà. Le commercial clique « Appeler », se place dans le champ d'Allo, fait
       * Ctrl+V, appuie sur le vert. Trois gestes au lieu de cinq.
       *
       * LA COPIE PART DU CLIC DE L'UTILISATEUR, et c'est indispensable : les navigateurs refusent
       * l'accès au presse-papiers hors d'un geste. Ici on est bien dans la pile d'appels du clic
       * sur « Appeler », donc l'autorisation est acquise. */
      void navigator.clipboard?.writeText(a.e164).then(
        () => setCopie(true),
        () => { /* Presse-papiers refusé : le bouton copier reste là, et le numéro est affiché. */ },
      )
      /* LE VOLET S’OUVRE AVEC LA FENÊTRE, et sans condition. C'est là qu'on colle le numéro : une
         fenêtre qui dit « colle dans le téléphone » sans le montrer serait une énigme. */
      ouvrirVoletAllo()
    }
    majFileCourante = setFile
    return () => {
      ouvrirCourant = null
      majFileCourante = null
    }
  }, [])

  /* ══ LA FENÊTRE S'EFFACE QUAND L'APPEL COMMENCE ══
   *
   * Dès que le webhook d'Allo écrit l'appel, `CarteAppel` l'affiche avec son chronomètre et ses
   * quatre boutons de qualification. Garder les deux à l'écran ferait deux fenêtres pour un seul
   * appel, l'une périmée. Celle-ci s'efface donc, et elle ne réapparaît qu'au prochain clic. */
  useEffect(() => {
    if (appel && enCours && !enCours.termine_le) setAppel(null)
  }, [appel, enCours])

  if (!appel) return null

  const qui = [appel.nom, appel.societe].filter(Boolean).join(' · ')

  const copier = async () => {
    try {
      await navigator.clipboard?.writeText(appel.e164)
      setCopie(true)
      setTimeout(() => setCopie(false), 2500)
    } catch {
      /* Presse-papiers refusé : le numéro est affiché en grand juste au-dessus, il reste lisible. */
    }
  }

  return (
    /* EN BAS À DROITE, MAIS JAMAIS SUR LE VOLET. `--volet-allo` porte la largeur qu'il occupe :
       recouvrir Allo reviendrait à cacher le bouton même qu'on demande de presser. */
    <div
      className="fixed bottom-[4.5rem] z-[71] w-[320px] overflow-hidden rounded-km border border-km-line bg-white shadow-km-pop md:bottom-4"
      style={{ right: 'calc(1rem + var(--volet-allo, 0px))' }}
      role="dialog"
      aria-label={`Appel de ${numeroLisible(appel.e164)}`}
    >
      <div className="flex items-center gap-2 bg-km-green-soft px-3.5 py-2.5 text-km-green">
        <Phone className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-km-xs font-semibold">Appeler ce numéro</span>
        <button
          type="button"
          onClick={() => setAppel(null)}
          title="Fermer"
          aria-label="Fermer la fenêtre d’appel"
          className="rounded p-0.5 text-km-green transition-opacity hover:opacity-70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3.5 py-3">
        {/* QUI, AVANT COMBIEN. Thomas, 21/09/2026 : « comme ça m'affiche que le numéro de téléphone,
            je sais même pas à qui ça correspond ». Le nom passe donc devant, et le numéro dessous. */}
        {qui && <p className="truncate text-km-sm font-semibold text-km-text">{qui}</p>}
        <div className="mt-0.5 flex items-center gap-2">
          <p className="flex-1 text-km-base font-semibold tabular-nums text-km-text">
            {numeroLisible(appel.e164)}
          </p>
          {/* LE NUMÉRO EN TEXTE, ET COPIABLE : c'est le repli universel. Si la file refuse, si Allo
              tousse, si le commercial préfère son mobile, le numéro reste à portée d'un clic. */}
          <button
            type="button"
            onClick={copier}
            title="Copier le numéro"
            aria-label="Copier le numéro"
            className="rounded-km border border-km-line p-1.5 text-km-muted transition-colors hover:bg-km-soft"
          >
            {copie ? <Check className="h-3.5 w-3.5 text-km-green" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* ── CE QU'IL RESTE À FAIRE, ET RIEN D'AUTRE ── */}
        <div className="mt-3 rounded-km bg-km-soft px-3 py-2.5">
          {file.phase === 'en_cours' && (
            <p className="flex items-center gap-2 text-km-xs text-km-muted">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              Préparation du numéro…
            </p>
          )}

          {file.phase === 'pret' && (
            <>
              {/* ══ ON DÉCRIT CE QUI EST À L'ÉCRAN, ET RIEN D'AUTRE — 21/09/2026 ══
               *
               * Cette fenêtre disait « Le numéro attend dans le téléphone. Appuie sur Appeler dans
               * le téléphone, à droite. » Capture de Naoëlle : le clavier d'Allo était VIDE, et il
               * n'y a AUCUN bouton « Appeler » — juste un champ « Entrez un nom ou un numéro » et
               * une pastille verte sous les touches. On donnait une instruction impossible à
               * suivre, ce qui est pire qu'un silence : on fait chercher un bouton qui n'existe pas.
               *
               * ET LE DÉPÔT DANS LA FILE NE REMPLIT PAS CE CHAMP. Vérifié le 21/09 contre leur API :
               * le numéro de Naoëlle était dans la file depuis le 8 septembre, position 0,
               * `sync_status: NOT_SYNCED`. TREIZE JOURS sans qu'un appel parte. La file est une
               * liste pour le Power Dialer, que ce clavier n'affiche même pas.
               *
               * On décrit donc le seul chemin qui marche vraiment : coller et appuyer sur le vert.
               * C'est moins beau qu'un « ça appelle tout seul », mais c'est faisable. */}
              {/* ══ ON N'AFFIRME PAS QUE ÇA SONNE, ET ON NE DIT PAS NON PLUS QUE NON ══
               *
               * Kimatch lance `allo://call?number=…`, qui ouvre l'application de bureau et compose.
               * Mais RIEN NE REVIENT : un protocole ne rend pas de réponse, et on ne peut pas
               * savoir s'il a abouti. Écrire « l'appel part » serait une promesse invérifiable —
               * la faute commise deux fois de suite les 20 et 21/09.
               *
               * On décrit donc ce qui vient d'être tenté, puis le repli, dans cet ordre : celui
               * pour qui ça a marché lit la première ligne et ne lit pas la suite. */}
              <p className="text-km-xs font-semibold text-km-text">
                L’appel part dans l’application Allo.
              </p>
              <p className="mt-1 text-km-xs text-km-muted">
                Si rien ne se passe, le numéro est déjà copié : colle-le dans le téléphone à droite,
                puis appuie sur le bouton vert.
              </p>
            </>
          )}

          {file.phase === 'echec' && (
            <>
              <p className="flex items-start gap-2 text-km-xs font-semibold text-km-text">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-km-amber" />
                Allo n’a pas pris le numéro.
              </p>
              {/* LA RAISON EST DITE EN CLAIR : les deux causes fréquentes se règlent ailleurs que
                  dans le code — une case à cocher chez Allo, une adresse dans Mon profil. Sans ça
                  on lit « erreur » et on cherche un bug ici. */}
              <p className="mt-1 text-km-xs text-km-muted">{file.raison}</p>
              <p className="mt-1.5 text-km-xs text-km-muted">
                Compose le numéro ci-dessus dans le téléphone, à droite.
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => ouvrirVoletAllo()}
          className={cn(
            'mt-2.5 flex w-full items-center justify-center gap-2 rounded-km px-3 py-2',
            'bg-kiwi-gradient text-km-xs font-semibold text-white transition-opacity hover:opacity-90',
          )}
        >
          <Phone className="h-3.5 w-3.5" />
          Ouvrir le téléphone
        </button>
      </div>
    </div>
  )
}
