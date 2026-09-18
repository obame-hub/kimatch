import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Bold, Italic, Link2, List, ListOrdered, Loader2, Mail, Minus, Paperclip, PenLine, Send, Underline, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useVoletEmail, type BrouillonEmail } from '@/lib/voletEmail'
import { useSignatureEmail, envoyerEmail, GmailNonConnecte, type PieceJointe } from '@/lib/data/signatureEmail'
import { supabase } from '@/lib/supabase'
import {
  LIMITE_PIECES_JOINTES,
  deposerPieceJointe,
  formaterTaille,
  retirerPieceJointe,
} from '@/lib/data/piecesJointesEmail'
import { useGmailConnection, connectGmail } from '@/lib/data/gmail'

/**
 * ══ ÉCRIRE UN MAIL SANS QUITTER KIMATCH ══
 *
 * Naoëlle, 07/09/2026 : « quand on clique sur un mail dans Kimatch, ça ouvre un volet pour écrire le
 * mail dans Kimatch comme dans Cockpit, connecté au Gmail. […] Il faut que le volet soit rétractable
 * au cas où on a besoin de chercher une info, mais sans perdre le mail déjà écrit. »
 *
 * ══ UN VOLET, PAS UNE FENÊTRE MODALE ══
 *
 * Une modale prend tout l'écran et bloque le reste : impossible d'aller lire l'échéance d'un contrat
 * en écrivant. Le volet occupe la droite, la fiche reste lisible à côté, et le bouton « réduire » le
 * range en pastille sans rien perdre — c'est la demande, mot pour mot.
 *
 * ══ POURQUOI `contentEditable` ET NON UN ÉDITEUR ══
 *
 * Kimatch embarque TipTap depuis les Nouveautés, mais cet éditeur-là est taillé pour un article
 * interne : images privées, liens vers des fichiers, tableaux, vidéos. Rien de tout cela ne part
 * dans un mail client, et il pèse 490 ko chargés à part.
 *
 * Un `contentEditable` avec `document.execCommand` donne gras, italique, listes et liens en zéro
 * dépendance — c'est exactement ce que fait Cockpit, et c'est suffisant pour un mail commercial.
 * `execCommand` est officiellement déprécié ; il reste implémenté partout et le restera, parce que
 * la moitié du web l'utilise. Le jour où il tombe, cette barre d'outils est le seul endroit à
 * reprendre.
 *
 * ══ CE QUI PART, ET CE QUI RESTE ══
 *
 * Le corps HTML part ; la signature est collée PAR LE SERVEUR, qui la relit en base. Le volet n'en
 * montre qu'un aperçu : une signature est une identité, elle ne se laisse pas dicter par le
 * navigateur.
 */
export function VoletEmail() {
  const volet = useVoletEmail()
  const { data: signature } = useSignatureEmail()
  const { data: connexion } = useGmailConnection()

  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [besoinGmail, setBesoinGmail] = useState(false)
  const [succes, setSucces] = useState<string | null>(null)
  const [depotEnCours, setDepotEnCours] = useState(0)
  const fichierRef = useRef<HTMLInputElement>(null)

  const corpsRef = useRef<HTMLDivElement>(null)
  /** L'identité du brouillon dont l'éditeur porte déjà le contenu, pour ne pas le réécrire à chaque frappe. */
  const brouillonCharge = useRef<string | null>(null)

  const etat = volet?.etat ?? null
  const brouillon = etat?.brouillon ?? null

  /* ══ LE CONTENU N'EST INJECTÉ QU'À L'OUVERTURE ══
     Réécrire `innerHTML` à chaque rendu replacerait le curseur au début à chaque lettre tapée. On ne
     le pose donc qu'au changement de brouillon — l'éditeur est ensuite maître de son contenu, et
     `onInput` remonte l'état. */
  useEffect(() => {
    if (!etat || etat.reduit) {
      brouillonCharge.current = null
      return
    }
    const cle = `${etat.contexte.a}|${etat.contexte.threadId ?? ''}`
    if (brouillonCharge.current === cle) return
    brouillonCharge.current = cle
    if (corpsRef.current) corpsRef.current.innerHTML = etat.brouillon.corpsHtml
  }, [etat])

  // Échap réduit plutôt que de fermer : fermer perdrait ce qui est écrit, or c'est le réflexe qu'on
  // a quand on veut « juste aller voir quelque chose ».
  useEffect(() => {
    if (!etat || etat.reduit) return
    const sur = (e: KeyboardEvent) => {
      if (e.key === 'Escape') volet?.reduire()
    }
    document.addEventListener('keydown', sur)
    return () => document.removeEventListener('keydown', sur)
  }, [etat, volet])

  if (!volet || !etat || !brouillon) return null

  const maj = (patch: Partial<BrouillonEmail>) => volet.majBrouillon({ ...brouillon, ...patch })

  const nomAffiche = etat.contexte.nom || etat.contexte.a
  const texteBrut = brouillon.corpsHtml.replace(/<[^>]*>/g, '').trim()
  const pieces = brouillon?.piecesJointes ?? []
  const totalPieces = pieces.reduce((t, p) => t + p.taille, 0)
  const tropLourd = totalPieces > LIMITE_PIECES_JOINTES

  // UN DÉPÔT EN COURS BLOQUE L'ENVOI. Sans ça, envoyer pendant un téléversement ferait partir le
  // mail sans la pièce qu'on croyait y avoir mise — une perte silencieuse, la pire espèce.
  const peutEnvoyer = Boolean(brouillon.a.trim() && brouillon.objet.trim() && texteBrut)
    && !envoiEnCours && depotEnCours === 0 && !tropLourd

  /* ── La pastille, quand le volet est réduit ── */
  if (etat.reduit) {
    return (
      <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-0.5 rounded-full border border-km-green-line bg-km-surface p-1 shadow-km-pop">
        <button
          type="button"
          onClick={volet.restaurer}
          title="Reprendre le mail en cours"
          className="flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors hover:bg-km-green-soft"
        >
          <Mail className="h-3.5 w-3.5 shrink-0 text-km-green" />
          <span className="max-w-[240px] truncate text-km-body font-semibold text-km-text">
            {brouillon.objet.trim() || `Mail à ${nomAffiche}`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (!volet.aDuContenu || window.confirm('Supprimer le mail en cours d’écriture ?')) volet.fermer()
          }}
          title="Supprimer le brouillon"
          aria-label="Supprimer le brouillon"
          className="flex h-7 w-7 items-center justify-center rounded-full text-km-faint transition-colors hover:bg-km-red-soft hover:text-km-red"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  const commande = (nom: string, valeur?: string) => {
    corpsRef.current?.focus()
    document.execCommand(nom, false, valeur)
    if (corpsRef.current) maj({ corpsHtml: corpsRef.current.innerHTML })
  }

  const insererLien = () => {
    const url = window.prompt('Adresse du lien')
    if (!url) return
    commande('createLink', /^https?:\/\//i.test(url) ? url : `https://${url}`)
  }

  /**
   * LE DÉPÔT COMMENCE À LA SÉLECTION, pas à l'envoi : il occupe le temps pendant lequel on écrit.
   * Chaque fichier est déposé séparément pour qu'un refus n'emporte pas les autres — choisir cinq
   * pièces dont une trop lourde doit en joindre quatre, pas zéro.
   */
  async function ajouterFichiers(fichiers: File[]) {
    // UN TABLEAU ET NON UNE `FileList` : celle-ci est vivante et se vide avec le champ qui la porte.
    // Le type dit désormais l'invariant, pour que le défaut ne puisse pas revenir par une autre
    // porte.
    if (fichiers.length === 0 || !volet || !brouillon) return
    setErreur(null)
    const { data } = await supabase.auth.getUser()
    const profilId = data.user?.id
    if (!profilId) {
      setErreur('Session expirée — reconnecte-toi pour joindre un fichier.')
      return
    }
    setDepotEnCours((n) => n + fichiers.length)
    const echecs: string[] = []
    for (const fichier of fichiers) {
      try {
        const piece = await deposerPieceJointe(fichier, profilId)
        // On relit l'état à chaque tour : deux dépôts qui se terminent en même temps écraseraient
        // l'un l'autre en partant d'une copie figée du brouillon.
        const courant = volet.etat?.brouillon
        if (courant) volet.majBrouillon({ ...courant, piecesJointes: [...courant.piecesJointes, piece] })
        // LE BROUILLON A DISPARU PENDANT LE DÉPÔT — volet fermé entre-temps. Le fichier est déjà
        // dans le stockage : on le retire plutôt que de le laisser traîner dans un seau public,
        // et on le dit, parce qu'un dépôt qui s'évapore en silence est le défaut qu'on vient de
        // corriger juste à côté.
        else {
          void retirerPieceJointe(piece)
          echecs.push(`« ${fichier.name} » n’a pas pu être joint : le brouillon a été fermé.`)
        }
      } catch (e) {
        echecs.push(e instanceof Error ? e.message : String(e))
      } finally {
        setDepotEnCours((n) => n - 1)
      }
    }
    if (echecs.length > 0) setErreur(echecs.join(' '))
  }

  function retirer(piece: PieceJointe) {
    if (!volet || !brouillon) return
    volet.majBrouillon({ ...brouillon, piecesJointes: brouillon.piecesJointes.filter((p) => p.url !== piece.url) })
    // Le fichier part du stockage sans qu'on attende : l'écran a déjà répondu.
    void retirerPieceJointe(piece)
  }

  async function envoyer() {
    // La garde rend surtout le narrowing possible : `envoyer` est déclarée avant le retour anticipé
    // du composant, donc TypeScript ne sait pas encore que le brouillon existe.
    if (!volet || !etat || !brouillon || !peutEnvoyer) return
    setEnvoiEnCours(true)
    setErreur(null)
    setBesoinGmail(false)
    try {
      const resultat = await envoyerEmail({
        to: brouillon.a,
        cc: brouillon.copie || undefined,
        bcc: brouillon.copieCachee || undefined,
        subject: brouillon.objet,
        html: brouillon.corpsHtml,
        avecSignature: brouillon.avecSignature,
        threadId: etat.contexte.threadId,
        contactId: etat.contexte.contactId,
        compteId: etat.contexte.compteId,
        pisteId: etat.contexte.pisteId,
        siteId: etat.contexte.siteId,
        recommandationId: etat.contexte.recommandationId,
        mandatId: etat.contexte.mandatId,
        contratId: etat.contexte.contratId,
        piecesJointes: brouillon.piecesJointes,
      })
      volet.fermer()
      // LA TRACE MANQUANTE SE DIT. Le mail est bien parti — refuser de le reconnaître serait faux —
      // mais si l'interaction n'a pas été consignée, la fiche restera muette et il faut le savoir.
      setSucces(
        resultat.consigne
          ? `✓ Mail envoyé à ${nomAffiche}, et consigné sur la fiche.`
          : `✓ Mail envoyé à ${nomAffiche}. En revanche il n’a pas pu être consigné dans l’historique.`,
      )
      window.setTimeout(() => setSucces(null), 7000)
    } catch (e) {
      if (e instanceof GmailNonConnecte) {
        setBesoinGmail(true)
        setErreur('Ton compte Gmail n’est pas encore lié à Kimatch.')
      } else {
        setErreur(e instanceof Error ? e.message : 'Envoi impossible')
      }
    } finally {
      setEnvoiEnCours(false)
    }
  }

  return (
    <>
      {succes && (
        <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-km-md border border-km-green-line bg-km-green-soft px-4 py-2.5 text-km-body font-semibold text-km-green shadow-km-pop">
          {succes}
        </div>
      )}

      <div
        role="dialog"
        aria-label="Écrire un mail"
        className="fixed bottom-0 right-0 top-0 z-[60] flex w-full max-w-[620px] flex-col border-l border-km-line bg-km-surface shadow-km-pop"
      >
        {/* ── L'en-tête : de qui, et les deux boutons qui comptent ── */}
        <div className="flex items-center gap-2 border-b border-km-line px-4 py-3">
          <Mail className="h-4 w-4 shrink-0 text-km-green" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-km-name font-bold text-km-text">Écrire à {nomAffiche}</p>
            <p className="truncate text-km-label text-km-faint">
              {connexion?.email_gmail
                ? `depuis ${connexion.email_gmail} — le mail apparaîtra dans tes Envoyés Gmail`
                : 'aucun compte Gmail lié'}
            </p>
          </div>
          <button
            type="button"
            onClick={volet.reduire}
            title="Réduire — le mail est conservé"
            aria-label="Réduire"
            className="flex h-8 w-8 items-center justify-center rounded-km text-km-muted transition-colors hover:bg-km-soft"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!volet.aDuContenu || window.confirm('Supprimer le mail en cours d’écriture ?')) volet.fermer()
            }}
            title="Fermer et supprimer le brouillon"
            aria-label="Fermer"
            className="flex h-8 w-8 items-center justify-center rounded-km text-km-muted transition-colors hover:bg-km-red-soft hover:text-km-red"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ══ AUCUN ENFANT DE CETTE COLONNE NE SE LAISSE ÉCRASER ══
            William, 18/09/2026 : « lors de l'édition d'un mail, si ce dernier est plus long que la
            fenêtre d'édition, il est impossible de scroller afin de voir la totalité du mail ».

            LA CAUSE N'ÉTAIT PAS L'ABSENCE DE DÉFILEMENT — cette colonne a bien son `overflow-y-auto`
            et son `min-h-0`. C'est que dans un conteneur flex, un enfant porte `flex-shrink: 1` par
            DÉFAUT : il se laisse comprimer sous la taille de son contenu pour tenir dans la place
            disponible. Le corps du mail débordait donc d'une boîte qui, elle, ne grandissait pas, et
            le parent n'avait rien de plus à faire défiler.

            Mesuré sur un montage isolé reproduisant cette colonne, avec soixante lignes de texte :

              flex-shrink par défaut   boîte 398 px, contenu 1 548 px — 1 150 px inatteignables
              flex-1 (le code d'avant) boîte 398 px, contenu 1 548 px — strictement identique
              flex-shrink: 0           boîte 1 562 px, contenu 1 560 px — rien n'est coupé

            LA RÈGLE EST SUR LE PARENT ET NON SUR LE SEUL CORPS. Les autres enfants — destinataires,
            pièces jointes, signature — portaient le même défaut, latent parce qu'ils sont courts. Un
            `shrink-0` posé sur le seul bloc fautif aurait laissé le piège intact pour le suivant.

            `flex-1` A DISPARU DU CORPS au passage, et son départ ne change rien : il lui donnait une
            base de 0 et le laissait grandir dans la place libre, ce que `min-h-[220px]` fait déjà —
            mais il n'empêchait pas la compression, qui est le vrai sujet. Le garder aurait laissé
            croire que la hauteur était gérée. */}
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3 [&>*]:shrink-0">
          {/* ── Destinataires ── */}
          <Champ libelle="À" valeur={brouillon.a} onChange={(a) => maj({ a })} placeholder="prenom.nom@societe.fr" />
          {brouillon.afficherCopie && (
            <Champ libelle="Cc" valeur={brouillon.copie} onChange={(copie) => maj({ copie })} placeholder="séparées par des virgules" />
          )}
          {brouillon.afficherCopieCachee && (
            <Champ libelle="Cci" valeur={brouillon.copieCachee} onChange={(copieCachee) => maj({ copieCachee })} placeholder="séparées par des virgules" />
          )}
          <div className="flex gap-3 pl-[42px]">
            {!brouillon.afficherCopie && (
              <button type="button" onClick={() => maj({ afficherCopie: true })} className="text-km-label font-semibold text-km-green hover:underline">
                + Cc
              </button>
            )}
            {!brouillon.afficherCopieCachee && (
              <button type="button" onClick={() => maj({ afficherCopieCachee: true })} className="text-km-label font-semibold text-km-green hover:underline">
                + Cci
              </button>
            )}
          </div>

          <Champ libelle="Objet" valeur={brouillon.objet} onChange={(objet) => maj({ objet })} placeholder="L’objet que verra le client" />

          {/* ── La barre d'outils ── */}
          <div className="flex flex-wrap items-center gap-1 rounded-km border border-km-line bg-km-soft px-2 py-1.5">
            <Outil onClick={() => commande('bold')} titre="Gras"><Bold className="h-3.5 w-3.5" /></Outil>
            <Outil onClick={() => commande('italic')} titre="Italique"><Italic className="h-3.5 w-3.5" /></Outil>
            <Outil onClick={() => commande('underline')} titre="Souligné"><Underline className="h-3.5 w-3.5" /></Outil>
            <span className="mx-1 h-4 w-px bg-km-line" />
            <Outil onClick={() => commande('insertUnorderedList')} titre="Liste à puces"><List className="h-3.5 w-3.5" /></Outil>
            <Outil onClick={() => commande('insertOrderedList')} titre="Liste numérotée"><ListOrdered className="h-3.5 w-3.5" /></Outil>
            <span className="mx-1 h-4 w-px bg-km-line" />
            <Outil onClick={insererLien} titre="Insérer un lien"><Link2 className="h-3.5 w-3.5" /></Outil>
          </div>

          {/* ── Le corps ── */}
          <div
            ref={corpsRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => maj({ corpsHtml: e.currentTarget.innerHTML })}
            data-vide={texteBrut.length === 0}
            className={cn(
              'min-h-[220px] rounded-km border border-km-line bg-white px-3.5 py-3 text-km-body leading-relaxed text-km-text',
              'focus:outline-none focus:ring-2 focus:ring-km-green/20',
              '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-km-green [&_a]:underline',
              // Le repère de saisie, en CSS : un `placeholder` n'existe pas sur un contentEditable.
              'data-[vide=true]:before:pointer-events-none data-[vide=true]:before:text-km-faint data-[vide=true]:before:content-["Écrivez_votre_message…"]',
            )}
          />

          {/* ══ LA SIGNATURE : ON CHOISIT AU MOMENT D'ÉCRIRE ══

              Naoëlle, 07/09/2026 : « que dans le volet on puisse choisir cette signature. » Le mode
              se règle une fois dans Mon profil ; ici on décide juste, pour CE mail, si elle part.
              Un mail interne de deux lignes n'a pas besoin d'un bloc de signature. */}
          <div className="rounded-km border border-dashed border-km-line bg-km-soft px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={brouillon.avecSignature}
                  onChange={(e) => maj({ avecSignature: e.target.checked })}
                  className="h-3.5 w-3.5 accent-km-green"
                />
                <span className="text-km-label font-bold uppercase tracking-[0.06em] text-km-muted">
                  Ajouter ma signature
                </span>
              </label>
              {signature && (
                <span className="flex items-center gap-2 text-km-label text-km-faint">
                  {signature.mode === 'LIBRE' ? 'ma signature à moi' : 'gabarit KiWee'}
                  <a href="/profil" className="font-semibold text-km-green hover:underline">
                    changer
                  </a>
                </span>
              )}
            </div>
            {brouillon.avecSignature && (
              signature?.corps_html?.trim() ? (
                <div
                  className="mt-2 rounded-km bg-white px-2.5 py-2 text-km-label text-km-text"
                  // L'aperçu de sa PROPRE signature, écrite par soi et relue par le serveur avant
                  // envoi : le contenu ne vient pas d'un tiers.
                  dangerouslySetInnerHTML={{ __html: signature.corps_html }}
                />
              ) : (
                <p className="mt-1.5 flex items-start gap-1.5 text-km-label leading-snug text-km-amber">
                  <PenLine className="mt-0.5 h-3 w-3 shrink-0" />
                  Ta signature n’est pas encore renseignée. Le mail partira sans. Tu peux l’écrire
                  depuis <strong>Mon profil</strong>.
                </p>
              )
            )}
          </div>

          {/* ══ LES PIÈCES JOINTES ══
              Le trombone et la liste vivent SOUS le corps du message, à l'endroit où on les
              cherche après avoir écrit — et non dans la barre d'outils de l'éditeur, qui met en
              forme le texte et ne parle pas de fichiers. */}
          <div className="rounded-km border border-km-line bg-km-soft px-3 py-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fichierRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-km border border-km-line bg-km-surface px-2.5 py-1 text-km-label font-semibold text-km-text hover:bg-km-bg"
              >
                <Paperclip className="h-3.5 w-3.5" /> Joindre un fichier
              </button>
              <input
                ref={fichierRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  /* ══ LES FICHIERS SONT COPIÉS AVANT QUE LE CHAMP SOIT VIDÉ ══
                     Fabien, 15/09/2026 : le fichier ne s'ajoutait pas, sans message d'erreur, et le
                     mail partait sans pièce jointe.

                     `e.target.files` est une `FileList` VIVANTE, attachée au champ. `ajouterFichiers`
                     est asynchrone : elle rendait la main à son premier `await`, la ligne suivante
                     vidait le champ, et la liste se vidait AVEC LUI. La fonction reprenait ensuite sur
                     une liste à zéro élément — donc aucune boucle, aucun dépôt, et surtout aucune
                     erreur à afficher puisque rien n'avait échoué.

                     C'est aussi pourquoi le défaut ne se voyait pas partout : selon le navigateur, la
                     `FileList` est vidée sur place ou simplement remplacée, et dans le second cas la
                     référence déjà prise gardait ses fichiers. Testé chez l'un, cassé chez l'autre.

                     `Array.from` fige le contenu : ce qu'on a choisi ne dépend plus de ce que devient
                     le champ. */
                  const choisis = Array.from(e.target.files ?? [])
                  // Le champ est vidé pour que rechoisir LE MÊME fichier déclenche un événement.
                  e.target.value = ''
                  void ajouterFichiers(choisis)
                }}
              />
              {depotEnCours > 0 && (
                <span className="flex items-center gap-1.5 text-km-label text-km-muted">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {depotEnCours} fichier{depotEnCours > 1 ? 's' : ''} en cours d’ajout…
                </span>
              )}
              {pieces.length > 0 && depotEnCours === 0 && (
                <span className={cn('text-km-label tabular-nums', tropLourd ? 'font-semibold text-km-red' : 'text-km-faint')}>
                  {pieces.length} pièce{pieces.length > 1 ? 's' : ''} · {formaterTaille(totalPieces)}
                </span>
              )}
            </div>

            {pieces.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {pieces.map((p) => (
                  <li key={p.url} className="flex items-center gap-2 rounded-km bg-km-surface px-2 py-1.5">
                    <Paperclip className="h-3 w-3 shrink-0 text-km-faint" />
                    <span className="min-w-0 flex-1 truncate text-km-label text-km-text">{p.nom}</span>
                    <span className="shrink-0 text-km-label tabular-nums text-km-faint">{formaterTaille(p.taille)}</span>
                    <button
                      type="button"
                      onClick={() => retirer(p)}
                      title={`Retirer ${p.nom}`}
                      className="shrink-0 rounded p-0.5 text-km-faint hover:bg-km-red-soft hover:text-km-red"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* LA LIMITE SE DIT AVANT L'ENVOI, pas après. Un refus qui arrive une fois le message
                écrit et le bouton cliqué fait perdre le travail de confiance en plus du temps. */}
            {tropLourd && (
              <p className="mt-2 flex items-start gap-1.5 text-km-label leading-snug text-km-red">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {formaterTaille(totalPieces)} au total — Gmail n’accepte pas plus de 25 Mo. Retire une
                pièce ou envoie un lien de téléchargement à la place.
              </p>
            )}
          </div>

          {erreur && (
            <div className="rounded-km border border-km-red-line bg-km-red-soft px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-km-body font-bold text-km-red">
                <AlertTriangle className="h-3.5 w-3.5" /> Le mail n’est pas parti
              </p>
              <p className="mt-1 text-km-label leading-snug text-km-text">{erreur}</p>
              {besoinGmail && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  onClick={() => { connectGmail().catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur')) }}
                >
                  Lier mon compte Gmail
                </Button>
              )}
              <p className="mt-1.5 text-km-label text-km-faint">Ton message est conservé.</p>
            </div>
          )}
        </div>

        {/* ── Le pied : envoyer ── */}
        <div className="flex items-center gap-2 border-t border-km-line px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-km-label text-km-faint">
            {peutEnvoyer
              ? 'Le mail partira de ton Gmail, et sera consigné sur la fiche.'
              : 'Destinataire, objet et message sont nécessaires.'}
          </p>
          <Button type="button" variant="ghost" onClick={volet.reduire}>
            Plus tard
          </Button>
          <Button type="button" disabled={!peutEnvoyer} onClick={() => void envoyer()}>
            {envoiEnCours ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Envoi…</>
            ) : (
              <><Send className="mr-1.5 h-3.5 w-3.5" /> Envoyer</>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}

/** Une ligne d'en-tête du mail : intitulé court à gauche, saisie qui prend le reste. */
function Champ({
  libelle, valeur, onChange, placeholder,
}: {
  libelle: string
  valeur: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="flex items-center gap-2 border-b border-km-line pb-1.5">
      <span className="w-[34px] shrink-0 text-km-label font-bold uppercase tracking-[0.06em] text-km-faint">
        {libelle}
      </span>
      <input
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-km-body text-km-text outline-none placeholder:text-km-faint"
      />
    </label>
  )
}

function Outil({ onClick, titre, children }: { onClick: () => void; titre: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      // `onMouseDown` avec `preventDefault` : un clic ordinaire ferait perdre la sélection dans
      // l'éditeur avant que la commande s'applique, et le gras ne s'appliquerait à rien.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={titre}
      className="flex h-7 w-7 items-center justify-center rounded-km text-km-muted transition-colors hover:bg-km-surface hover:text-km-text"
    >
      {children}
    </button>
  )
}
