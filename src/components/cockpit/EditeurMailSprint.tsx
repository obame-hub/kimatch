import { useEffect, useRef, useState } from 'react'
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, Bold, Eraser, Indent, Italic, Link2, List,
  ListOrdered, Loader2, Minus, Outdent, Palette, Paperclip, PenLine, Quote, Redo2, Send,
  Strikethrough, Underline, Undo2, Unlink, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { envoyerEmail, GmailNonConnecte, useSignatureEmail, type PieceJointe } from '@/lib/data/signatureEmail'
import {
  deposerPieceJointe, formaterTaille, retirerPieceJointe, LIMITE_PIECES_JOINTES,
} from '@/lib/data/piecesJointesEmail'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'ÉDITEUR DE MAIL DU SPRINT — COMPLET, ET À HAUTEUR FIXE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « l'éditeur ne doit en aucun cas bouger les boutons en dessous. Essaie de
 * gagner de la place tout en ajoutant une case Cc, un éditeur WYSIWYG hyper complet et une
 * fonctionnalité de pièce jointe. Il doit être compact, entre les cartes de contact et les boutons
 * du bas. »
 *
 * ══ LA HAUTEUR EST UNE PROMESSE, PAS UNE CONSÉQUENCE ══
 *
 * Rien ici ne pousse. Le composant occupe EXACTEMENT la place que le parent lui donne : un
 * `h-full flex flex-col` où une seule zone — le corps du message — porte `flex-1 min-h-0
 * overflow-y-auto`. Tout le reste est en `shrink-0`.
 *
 * C'est la seule construction qui tienne la promesse. Une hauteur minimale sur le corps, ou un
 * `min-h` sur le cadre, suffirait à faire déborder dès qu'on ajoute une pièce jointe ou qu'on
 * déplie le Cc — et les boutons du bas descendraient, ce que William refuse. Ici, ajouter du
 * contenu fait défiler, jamais grandir.
 *
 * ══ `contentEditable` ET NON UN ÉDITEUR EMBARQUÉ ══
 *
 * C'est le choix déjà fait pour le volet e-mail, et il vaut doublement ici : TipTap et ses
 * extensions pèsent 490 ko, et le sprint est l'écran où l'on enchaîne les fiches — chaque
 * kilo-octet se paie au chargement, pendant qu'on a le téléphone à l'oreille. `document.execCommand`
 * est déprécié sur le papier, implémenté partout en pratique, et donne gras, italique, souligné,
 * listes et liens sans une seule dépendance.
 *
 * ══ CE QUI FAIT GAGNER LA PLACE, POINT PAR POINT ══
 *
 *   · LE DESTINATAIRE EST UNE PASTILLE dans l'en-tête, pas une ligne de formulaire. On ne le change
 *     pas depuis ici : c'est la personne qu'on vient d'appeler.
 *   · LE Cc N'APPARAÎT QU'À LA DEMANDE. Il sert une fois sur dix ; lui réserver une ligne en
 *     permanence coûterait cette ligne dix fois sur dix.
 *   · PAS D'INTITULÉS AU-DESSUS DES CHAMPS. « Objet » écrit en petites capitales au-dessus d'un
 *     champ qui dit déjà « Objet » en repère de saisie, c'est une ligne pour rien.
 *   · LA BARRE D'OUTILS EST SUR LA MÊME LIGNE QUE LE TROMBONE ET LA SIGNATURE. Trois rangées de
 *     commandes devenaient trois fois plus hautes que le message.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function EditeurMailSprint({
  nom,
  email,
  contexte,
  modele,
  onFermer,
  onEnvoye,
}: {
  nom: string
  email: string | null
  contexte: { contactId?: string; pisteId?: string; compteId?: string }
  /**
   * Un objet et un corps déjà écrits, quand l'éditeur s'ouvre depuis une action rapide.
   *
   * POURQUOI PRÉ-REMPLIR PLUTÔT QU'ENVOYER TOUT SEUL : « Demander les factures » est le même mail
   * quinze fois par jour, mais jamais tout à fait — il y manque toujours le nom d'une résidence ou
   * le rappel d'une phrase dite au téléphone. Un envoi automatique aurait été plus rapide et moins
   * juste ; ce qu'on fait gagner, c'est la frappe, pas la relecture.
   */
  modele?: { objet: string; corps: string }
  onFermer: () => void
  onEnvoye: (message: string) => void
}) {
  const { data: signature } = useSignatureEmail()
  const corps = useRef<HTMLDivElement | null>(null)
  const fichierRef = useRef<HTMLInputElement | null>(null)

  const [copie, setCopie] = useState('')
  const [afficherCopie, setAfficherCopie] = useState(false)
  const [objet, setObjet] = useState(modele?.objet ?? '')
  const [corpsHtml, setCorpsHtml] = useState('')
  const [vide, setVide] = useState(true)
  /* LA SIGNATURE EST INCLUSE PAR DÉFAUT (William, 22/09/2026 : « la signature doit toujours être
     incluse par défaut »). Le bouton reste là pour la retirer sur un mot envoyé à un collègue —
     mais le cas ordinaire est un mail à un prospect, et il se signe. */
  const [avecSignature, setAvecSignature] = useState(true)
  const [pieces, setPieces] = useState<PieceJointe[]>([])
  const [depot, setDepot] = useState(false)
  const [palette, setPalette] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  /* ══ LE MODÈLE S'ÉCRIT DANS LE CORPS, UNE SEULE FOIS ══
     Le corps est un `contentEditable` : React ne le pilote pas, on ne peut donc pas lui passer une
     valeur initiale par une prop. On l'écrit à l'ouverture — et JAMAIS ensuite, sinon la moindre
     re-mesure du chrono effacerait ce que l'on est en train de taper. */
  const modelePose = useRef(false)
  useEffect(() => {
    if (modelePose.current || !corps.current || !modele?.corps) return
    modelePose.current = true
    corps.current.innerHTML = modele.corps
    setCorpsHtml(modele.corps)
    setVide(corps.current.textContent?.trim().length === 0)
  }, [modele])

  const commande = (nom: string, valeur?: string) => {
    corps.current?.focus()
    document.execCommand(nom, false, valeur)
    if (corps.current) {
      setCorpsHtml(corps.current.innerHTML)
      setVide(corps.current.textContent?.trim().length === 0)
    }
  }

  const insererLien = () => {
    const url = window.prompt('Adresse du lien')
    if (!url) return
    commande('createLink', /^https?:\/\//i.test(url) ? url : `https://${url}`)
  }

  /* LE DÉPÔT COMMENCE À LA SÉLECTION et non à l'envoi : il occupe le temps pendant lequel on écrit,
     au lieu de faire attendre au moment où l'on veut partir. */
  async function deposer(fichiers: FileList | null) {
    if (!fichiers?.length) return
    const total = pieces.reduce((s, p) => s + p.taille, 0)
      + Array.from(fichiers).reduce((s, f) => s + f.size, 0)
    if (total > LIMITE_PIECES_JOINTES) {
      setErreur(`Au-delà de ${formaterTaille(LIMITE_PIECES_JOINTES)}, Gmail refuse l’envoi.`)
      return
    }
    setDepot(true)
    setErreur(null)
    try {
      const { data } = await supabase.auth.getUser()
      const profilId = data.user?.id
      if (!profilId) throw new Error('Session expirée — reconnectez-vous.')
      for (const f of Array.from(fichiers)) {
        const piece = await deposerPieceJointe(f, profilId)
        setPieces((p) => [...p, piece])
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Dépôt impossible')
    } finally {
      setDepot(false)
      if (fichierRef.current) fichierRef.current.value = ''
    }
  }

  function retirer(piece: PieceJointe) {
    setPieces((p) => p.filter((x) => x.url !== piece.url))
    // Le fichier part du stockage sans qu'on attende : l'écran a déjà répondu.
    void retirerPieceJointe(piece)
  }

  const pret = Boolean(email && objet.trim() && !vide) && !envoi && !depot

  async function envoyer() {
    if (!email || !pret) return
    setEnvoi(true)
    setErreur(null)
    try {
      const resultat = await envoyerEmail({
        to: email,
        cc: copie.trim() || undefined,
        subject: objet.trim(),
        html: corpsHtml,
        avecSignature,
        contactId: contexte.contactId,
        pisteId: contexte.pisteId,
        compteId: contexte.compteId,
        piecesJointes: pieces,
      })
      /* LA TRACE MANQUANTE SE DIT. Le mail est parti — le nier serait faux — mais si l'interaction
         n'a pas été consignée, la fiche restera muette et il faut le savoir tout de suite. */
      onEnvoye(
        resultat.consigne
          ? `✓ Mail envoyé à ${nom || email}, et consigné sur la fiche.`
          : `✓ Mail envoyé à ${nom || email}. En revanche il n’a pas pu être consigné.`,
      )
    } catch (e) {
      setErreur(
        e instanceof GmailNonConnecte
          ? 'Votre compte Gmail n’est pas lié à Kimatch — à faire dans Mon profil.'
          : e instanceof Error ? e.message : 'Envoi impossible',
      )
    } finally {
      setEnvoi(false)
    }
  }

  if (!email) {
    return (
      <div className="flex h-full flex-col">
        <EnTete onFermer={onFermer} titre="Écrire à ce contact" />
        <p className="text-km-body text-km-side-muted">
          Cette fiche ne porte aucune adresse. Ajoutez-la sur la carte « Contacter », juste
          au-dessus : elle est modifiable.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <EnTete onFermer={onFermer} titre="Écrire" destinataire={email}>
        {!afficherCopie && (
          <button
            type="button"
            onClick={() => setAfficherCopie(true)}
            className="shrink-0 rounded-km-sm px-1.5 py-0.5 text-km-label font-semibold text-km-side-green hover:bg-km-side-green/10"
          >
            + Cc
          </button>
        )}
      </EnTete>

      {/* ── LES DEUX CHAMPS, SANS INTITULÉ : le repère de saisie suffit et économise deux lignes ── */}
      <div className="shrink-0 space-y-1.5">
        {afficherCopie && (
          <div className="flex items-center gap-1.5">
            <input
              value={copie}
              autoFocus
              onChange={(e) => setCopie(e.target.value)}
              placeholder="Cc — séparer par des virgules"
              aria-label="Copie"
              className={champ}
            />
            <button
              type="button"
              onClick={() => { setAfficherCopie(false); setCopie('') }}
              title="Retirer la copie"
              className="shrink-0 rounded-km-sm p-1 text-km-side-faint hover:text-km-side-text"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <input
          value={objet}
          onChange={(e) => setObjet(e.target.value)}
          placeholder="Objet"
          aria-label="Objet du message"
          className={cn(champ, 'font-medium')}
        />
      </div>

      {/* ══════════ LA BARRE D'OUTILS — DENSE, ET GROUPÉE PAR INTENTION ══════════

          William, 22/09/2026 : « les options d'édition doivent être beaucoup plus denses, tu dois
          me permettre d'avoir des fonctionnalités d'édition très poussées ».

          VINGT COMMANDES SUR UNE À DEUX RANGÉES, séparées par des filets en huit groupes : annuler,
          niveau de texte, graisse, couleur, alignement, listes et retraits, liens et séparateur,
          puis les pièces jointes et la signature. L'ordre est celui d'un traitement de texte —
          celui que la main connaît déjà.

          `onMouseDown` EST NEUTRALISÉ SUR CHAQUE OUTIL, et c'est ce qui les fait tous fonctionner :
          sans ça, cliquer un bouton retire le focus du texte, la sélection disparaît, et la
          commande s'applique à rien. C'est LE piège de ce genre de barre.

          LE NIVEAU DE TEXTE EST UNE LISTE et non trois boutons : « Titre », « Sous-titre »,
          « Citation » s'excluent, et trois boutons qui s'excluent demandent d'en désactiver deux à
          chaque clic — une liste le dit toute seule et tient dans la largeur d'un mot. */}
      <div className="mt-1.5 flex shrink-0 flex-wrap items-center gap-0.5 rounded-km border border-km-side-line bg-km-side px-1.5 py-1">
        <Outil onClick={() => commande('undo')} titre="Annuler"><Undo2 className="h-3.5 w-3.5" /></Outil>
        <Outil onClick={() => commande('redo')} titre="Rétablir"><Redo2 className="h-3.5 w-3.5" /></Outil>
        <Filet />

        <select
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => { commande('formatBlock', e.target.value); e.currentTarget.selectedIndex = 0 }}
          aria-label="Niveau de texte"
          title="Niveau de texte"
          className="h-7 cursor-pointer rounded-km-sm border border-km-side-line bg-km-side px-1.5 text-km-label text-km-side-muted hover:text-km-side-text focus:outline-none"
        >
          <option value="" className="bg-km-side">Texte</option>
          <option value="h2" className="bg-km-side">Titre</option>
          <option value="h3" className="bg-km-side">Sous-titre</option>
          <option value="p" className="bg-km-side">Paragraphe</option>
        </select>
        <Outil onClick={() => commande('formatBlock', 'blockquote')} titre="Citation"><Quote className="h-3.5 w-3.5" /></Outil>
        <Filet />

        <Outil onClick={() => commande('bold')} titre="Gras"><Bold className="h-3.5 w-3.5" /></Outil>
        <Outil onClick={() => commande('italic')} titre="Italique"><Italic className="h-3.5 w-3.5" /></Outil>
        <Outil onClick={() => commande('underline')} titre="Souligné"><Underline className="h-3.5 w-3.5" /></Outil>
        <Outil onClick={() => commande('strikeThrough')} titre="Barré"><Strikethrough className="h-3.5 w-3.5" /></Outil>
        <Filet />

        {/* LA COULEUR EST UN PETIT NUANCIER, pas le sélecteur du système : celui-ci ouvre une
            fenêtre native qui recouvre l'écran et fait perdre la sélection. Six teintes suffisent
            à un mail commercial. */}
        <div className="relative">
          <Outil onClick={() => setPalette((v) => !v)} titre="Couleur du texte" actif={palette}>
            <Palette className="h-3.5 w-3.5" />
          </Outil>
          {palette ? (
            <div className="absolute left-0 top-8 z-10 flex gap-1 rounded-km border border-km-side-line bg-km-side-bas p-1.5 shadow-km-pop">
              {COULEURS.map((c) => (
                <button
                  key={c.valeur}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { commande('foreColor', c.valeur); setPalette(false) }}
                  title={c.nom}
                  aria-label={c.nom}
                  className="h-5 w-5 rounded-full border border-km-side-line"
                  style={{ background: c.valeur }}
                />
              ))}
            </div>
          ) : null}
        </div>
        <Filet />

        <Outil onClick={() => commande('justifyLeft')} titre="Aligner à gauche"><AlignLeft className="h-3.5 w-3.5" /></Outil>
        <Outil onClick={() => commande('justifyCenter')} titre="Centrer"><AlignCenter className="h-3.5 w-3.5" /></Outil>
        <Outil onClick={() => commande('justifyRight')} titre="Aligner à droite"><AlignRight className="h-3.5 w-3.5" /></Outil>
        <Filet />

        <Outil onClick={() => commande('insertUnorderedList')} titre="Liste à puces"><List className="h-3.5 w-3.5" /></Outil>
        <Outil onClick={() => commande('insertOrderedList')} titre="Liste numérotée"><ListOrdered className="h-3.5 w-3.5" /></Outil>
        <Outil onClick={() => commande('outdent')} titre="Réduire le retrait"><Outdent className="h-3.5 w-3.5" /></Outil>
        <Outil onClick={() => commande('indent')} titre="Augmenter le retrait"><Indent className="h-3.5 w-3.5" /></Outil>
        <Filet />

        <Outil onClick={insererLien} titre="Insérer un lien"><Link2 className="h-3.5 w-3.5" /></Outil>
        <Outil onClick={() => commande('unlink')} titre="Retirer le lien"><Unlink className="h-3.5 w-3.5" /></Outil>
        <Outil onClick={() => commande('insertHorizontalRule')} titre="Séparateur"><Minus className="h-3.5 w-3.5" /></Outil>
        <Outil onClick={() => commande('removeFormat')} titre="Effacer la mise en forme"><Eraser className="h-3.5 w-3.5" /></Outil>
        {/* LE TROMBONE ET LA SIGNATURE SONT POUSSÉS À DROITE : ce ne sont pas des commandes de
            mise en forme, et les mêler aux dix-huit autres obligeait à les chercher. Sur une
            colonne étroite ils passent à la ligne ensemble, ce qui garde le groupe lisible. */}
        <span className="ml-auto" aria-hidden="true" />

        <Outil onClick={() => fichierRef.current?.click()} titre="Joindre un fichier">
          {depot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        </Outil>
        <input ref={fichierRef} type="file" multiple hidden onChange={(e) => void deposer(e.target.files)} />
        <Outil
          onClick={() => setAvecSignature((v) => !v)}
          titre={avecSignature ? 'Signature incluse — cliquer pour la retirer' : 'Ajouter ma signature'}
          actif={avecSignature}
        >
          <PenLine className="h-3.5 w-3.5" />
        </Outil>
        {!signature && avecSignature ? (
          <span className="ml-1 text-km-micro text-km-side-faint">aucune signature enregistrée</span>
        ) : null}
      </div>

      {/* ══ LE CORPS EST LA SEULE ZONE QUI S'ÉTIRE, ET LA SEULE QUI DÉFILE ══
          C'est ce qui garantit que les boutons du bas ne bougent jamais : tout le reste est
          `shrink-0`, donc la hauteur totale ne dépend pas de ce qu'on écrit. */}
      <div
        ref={corps}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Message"
        onInput={(e) => {
          setCorpsHtml(e.currentTarget.innerHTML)
          setVide(e.currentTarget.textContent?.trim().length === 0)
        }}
        data-vide={vide}
        className={cn(
          'mt-1.5 min-h-0 flex-1 overflow-y-auto rounded-km border border-km-side-line bg-km-side px-3 py-2 text-km-body leading-relaxed text-km-side-text',
          'focus:border-km-side-green focus:outline-none',
          /* CE QU'ON TAPE DOIT SE VOIR. Tailwind remet à zéro les styles des balises HTML : sans
             ces règles, un titre inséré par « formatBlock » s'afficherait comme du texte courant, et
             on croirait la commande cassée. Elles reprennent ce que rend une boîte de réception. */
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-km-side-green [&_a]:underline',
          '[&_h2]:mt-1 [&_h2]:text-km-metric [&_h2]:font-bold [&_h3]:mt-1 [&_h3]:text-km-lead [&_h3]:font-semibold',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-km-side-line [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-km-side-muted',
          '[&_hr]:my-2 [&_hr]:border-km-side-line [&_p]:min-h-[1em]',
          // Le repère de saisie, en CSS : un `placeholder` n'existe pas sur un contentEditable.
          'data-[vide=true]:before:pointer-events-none data-[vide=true]:before:text-km-side-faint data-[vide=true]:before:content-["Écrivez_votre_message…"]',
        )}
      />

      {/* ── LES PIÈCES JOINTES, en pastilles, seulement s'il y en a ── */}
      {pieces.length > 0 && (
        <div className="mt-1.5 flex shrink-0 flex-wrap gap-1.5">
          {pieces.map((p) => (
            <span
              key={p.url}
              className="inline-flex max-w-[15rem] items-center gap-1.5 rounded-km-pill border border-km-side-line bg-km-side px-2 py-0.5 text-km-label text-km-side-muted"
            >
              <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate text-km-side-text">{p.nom}</span>
              <span className="shrink-0 text-km-micro text-km-side-faint">{formaterTaille(p.taille)}</span>
              <button
                type="button"
                onClick={() => retirer(p)}
                aria-label={`Retirer ${p.nom}`}
                className="shrink-0 rounded-full p-0.5 hover:bg-km-side-red/20 hover:text-km-side-red"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── LE PIED : l'envoi, et ce qui a échoué ── */}
      <div className="mt-2 flex shrink-0 flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!pret}
          onClick={() => void envoyer()}
          className={cn(
            'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-km px-4 text-km-name font-bold transition-[filter]',
            pret ? 'bg-km-side-green text-[#0B241C] hover:brightness-110' : 'cursor-not-allowed bg-km-side-line text-km-side-faint',
          )}
        >
          {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {envoi ? 'Envoi…' : 'Envoyer'}
        </button>
        {erreur ? <span className="min-w-0 flex-1 text-km-label text-km-side-red">{erreur}</span> : null}
      </div>
    </div>
  )
}

/* Six teintes : le texte, le vert de marque, et quatre couleurs qui se lisent sur du blanc dans
   une boîte de réception. Au-delà, on fabrique des mails illisibles. */
const COULEURS = [
  { nom: 'Noir', valeur: '#16181d' },
  { nom: 'Gris', valeur: '#5c5f66' },
  { nom: 'Vert KiWee', valeur: '#0d7a5f' },
  { nom: 'Bleu', valeur: '#2f4d70' },
  { nom: 'Ambre', valeur: '#8a6420' },
  { nom: 'Rouge', valeur: '#b85145' },
] as const

const champ =
  'min-w-0 flex-1 w-full rounded-km border border-km-side-line bg-km-side px-3 py-1.5 text-km-body text-km-side-text placeholder:text-km-side-faint focus:border-km-side-green focus:outline-none'

function EnTete({
  onFermer, titre, destinataire, children,
}: { onFermer: () => void; titre: string; destinataire?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-2 flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={onFermer}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-km border border-km-side-line px-2 py-1 text-km-label font-semibold text-km-side-muted transition-colors hover:border-km-side-muted hover:text-km-side-text"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" />
        Retour
      </button>
      <span className="shrink-0 font-mono text-km-label font-semibold uppercase tracking-[0.16em] text-km-side-faint">
        {titre}
      </span>
      {destinataire ? (
        <span className="min-w-0 flex-1 truncate rounded-km-pill bg-km-side-green/12 px-2.5 py-0.5 text-km-label font-medium text-km-side-green">
          {destinataire}
        </span>
      ) : null}
      {children}
    </div>
  )
}

function Outil({
  onClick, titre, actif, children,
}: { onClick: () => void; titre: string; actif?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={titre}
      aria-label={titre}
      aria-pressed={actif}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-km-sm transition-colors',
        actif
          ? 'bg-km-side-green/20 text-km-side-green'
          : 'text-km-side-muted hover:bg-km-side-line hover:text-km-side-text',
      )}
    >
      {children}
    </button>
  )
}

function Filet() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-km-side-line" aria-hidden="true" />
}
