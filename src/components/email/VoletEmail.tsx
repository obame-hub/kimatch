import { useEffect, useRef, useState } from 'react'
import {
  Mail, X, Minus, Send, Bold, Italic, Underline, List, ListOrdered, Link2,
  AlertTriangle, PenLine, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useVoletEmail, type BrouillonEmail } from '@/lib/voletEmail'
import { useSignatureEmail, envoyerEmail, GmailNonConnecte } from '@/lib/data/signatureEmail'
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
  const peutEnvoyer = Boolean(brouillon.a.trim() && brouillon.objet.trim() && texteBrut) && !envoiEnCours

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
        siteId: etat.contexte.siteId,
        recommandationId: etat.contexte.recommandationId,
        mandatId: etat.contexte.mandatId,
        contratId: etat.contexte.contratId,
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

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
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
              'min-h-[220px] flex-1 rounded-km border border-km-line bg-white px-3.5 py-3 text-km-body leading-relaxed text-km-text',
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
