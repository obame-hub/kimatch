import { useEffect, useRef, useState } from 'react'
import { useVoletEmail } from '@/lib/voletEmail'
import { Phone, Mail, Copy, Check } from 'lucide-react'
import { numeroInternational, numeroLisible, useTelephonie } from '@/lib/telephonie'
import { cn } from '@/lib/utils'

function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return { open, setOpen, ref }
}

function ContactPopover({
  value,
  className,
  monospace,
  actionLabel,
  actionHref,
  onAction,
  onClicPrincipal,
  ActionIcon,
}: {
  value: string
  className?: string
  monospace?: boolean
  actionLabel: string
  /** Lien classique — le courriel. Absent quand l'action est un appel, qui n'est plus un lien. */
  actionHref?: string
  /** Action a executer — l'appel Aircall. */
  onAction?: () => void
  /**
   * L'action du CLIC SUR L'ADRESSE elle-même, quand il y en a une.
   *
   * Naoëlle, 07/09/2026 : « quand on clique sur un mail dans Kimatch, ça ouvre un volet pour écrire
   * le mail dans Kimatch. » Un clic, pas deux : sans ça il faudrait cliquer l'adresse pour ouvrir la
   * bulle, puis « Envoyer un email » dedans. La bulle reste au survol, pour copier.
   */
  onClicPrincipal?: () => void
  ActionIcon: typeof Phone
}) {
  const { open, setOpen, ref } = usePopover()

  return (
    <span ref={ref} className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (onClicPrincipal) {
            setOpen(false)
            onClicPrincipal()
            return
          }
          setOpen((v) => !v)
        }}
        title={onClicPrincipal ? actionLabel : undefined}
        className={cn('cursor-pointer text-left underline decoration-navy-200 decoration-dashed underline-offset-2 hover:text-km-green hover:decoration-kiwi-400', monospace && 'font-mono', className)}
      >
        {value}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-30 mt-1 flex overflow-hidden rounded-lg border border-km-line bg-white shadow-lg">
          {/* UN APPEL N'EST PLUS UN LIEN. Tant que « Appeler » etait un href="tel:", c'etait le
              systeme d'exploitation qui decidait — et il ouvrait Skype, FaceTime, ou rien du tout.
              Le bouton compose maintenant dans Aircall, sans quitter Kimatch. Le courriel reste un
              lien : la, le client de messagerie du poste est bien ce qu'on veut. */}
          {onAction ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onAction()
              }}
              className="flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-km-label font-medium text-km-text hover:bg-km-bg"
            >
              <ActionIcon className="h-3 w-3 text-km-green" />
              {actionLabel}
            </button>
          ) : (
            <a
              href={actionHref}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
              }}
              className="flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-km-label font-medium text-km-text hover:bg-km-bg"
            >
              <ActionIcon className="h-3 w-3 text-km-green" />
              {actionLabel}
            </a>
          )}
          <button
            type="button"
            title="Copier"
            onClick={(e) => {
              e.stopPropagation()
              navigator.clipboard?.writeText(value).catch(() => {})
              setOpen(false)
            }}
            className="flex items-center gap-1 border-l border-km-line px-2 py-1.5 text-km-faint hover:bg-km-bg hover:text-km-text"
          >
            <Copy className="h-3 w-3" />
          </button>
        </span>
      )}
    </span>
  )
}

/**
 * UN NUMÉRO DE TÉLÉPHONE — EN TEXTE SIMPLE, ET C'EST TOUT L'ENJEU.
 *
 * Constaté le 26/08/2026, et de la façon la plus claire possible : l'extension Allo a décoré le numéro
 * affiché dans NOTRE PROPRE bandeau de confirmation, alors qu'elle ignorait celui des fiches. La
 * différence tenait au balisage — dans le bandeau, du texte ; dans les fiches, un `<button>`. Les
 * extensions de ce type sautent volontairement les éléments cliquables, pour ne pas doubler une action
 * que le site a déjà posée sur le numéro.
 *
 * LE NUMÉRO RESTE DONC UN SIMPLE `<span>`, et ça ne change pas : l'extension y pose son icône, et rien
 * de cliquable ne l'entoure. Ce qui suit s'ajoute À CÔTÉ du numéro, jamais autour.
 *
 * ══ LE BOUTON « APPELER » REVIENT SUR ORDINATEUR ══
 *
 * Il avait été retiré, et pour une bonne raison à l'époque : « aucun code ne peut ouvrir Allo, donc il
 * ne savait que copier — un bouton qui promet un appel et se contente d'une copie est un bouton qui
 * mentait ». C'était juste tant que la clé Allo n'avait pas le droit d'écrire dans la file d'appel.
 *
 * CETTE RAISON A DISPARU LE 08/09/2026. La portée `DIALING_QUEUE_READ_WRITE` est accordée : le bouton
 * dépose vraiment le numéro dans la file du Power Dialer de la personne connectée, avec son nom et sa
 * société, et il ne reste qu'à lancer l'appel dans Allo. Naoëlle : « je ne vois pas le bouton
 * appeler » — il n'existait plus, et le commentaire qui l'expliquait était devenu faux.
 *
 * LE REPLI TIENT TOUJOURS. Sans la portée, sans réseau, ou sans compte Allo à son nom — trois profils
 * sur dix au 08/09/2026 — le bouton copie le numéro et dit pourquoi, au lieu de rester muet.
 */
export function PhoneLink({ value, className }: { value: string; className?: string }) {
  const { appeler } = useTelephonie()
  const [copie, setCopie] = useState(false)
  // Le pointeur, pas la largeur : un portable tactile compose, une fenêtre étroite sur un poste fixe
  // non. Calculé au rendu — ce trait ne change pas en cours de session.
  const tactile =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(hover: none) and (pointer: coarse)').matches === true

  return (
    <span className="group/tel inline-flex items-center gap-1 align-middle">
      {/* Rien de cliquable autour du numéro : c'est la condition pour qu'Allo le décore. */}
      <span className={cn('font-mono', className)}>{numeroLisible(value)}</span>

      {/* APPELER. Sur tactile, `tel:` compose vraiment ; sur ordinateur, le numéro part dans la file
          du Power Dialer. L'entonnoir `appeler` tranche entre les deux et gère le repli — ce
          composant n'a pas à savoir lequel des deux s'applique. */}
      <button
        type="button"
        title="Appeler"
        aria-label={`Appeler le ${numeroLisible(value)}`}
        onClick={(e) => {
          e.stopPropagation()
          void appeler(value)
        }}
        className="shrink-0 rounded p-0.5 text-km-green transition-colors hover:bg-km-green-soft"
      >
        <Phone className="h-3 w-3" />
      </button>

      {/* LA COPIE RESTE, et discrètement : elle sert quand on veut le numéro ailleurs — un SMS, un
          courrier, un collègue. Visible au survol seulement, pour ne pas concurrencer l'appel. */}
      {!tactile && (
        <button
          type="button"
          title={copie ? 'Numéro copié' : 'Copier le numéro'}
          onClick={(e) => {
            e.stopPropagation()
            /* ON COPIE LA FORME COMPOSABLE, pas celle qu'on affiche : collé dans un composeur,
               `+33612345678` fonctionne partout, `+33 6 12 34 56 78` fait trébucher la moitié
               d'entre eux sur les espaces. */
            navigator.clipboard
              ?.writeText(numeroInternational(value) ?? value)
              .then(() => setCopie(true))
              .catch(() => {})
          }}
          className="shrink-0 rounded p-0.5 text-km-faint opacity-0 transition-opacity hover:text-km-muted focus:opacity-100 group-hover/tel:opacity-100"
        >
          {copie ? <Check className="h-3 w-3 text-km-green" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </span>
  )
}

/**
 * ══ UNE ADRESSE EMAIL, CLIQUABLE POUR ÉCRIRE DANS KIMATCH ══
 *
 * Naoëlle, 07/09/2026 : « quand on clique sur un mail dans Kimatch, ça ouvre un volet pour écrire le
 * mail dans Kimatch comme dans Cockpit, connecté au Gmail. »
 *
 * Le clic ouvre donc le volet d'écriture. Le mail partira du Gmail de la personne connectée, avec sa
 * signature, et sera consigné sur la fiche du contact.
 *
 * ── LE REPLI SUR `mailto:` RESTE ──
 *
 * Hors du fournisseur — le document comparatif imprimé, par exemple, rendu en isolation — le volet
 * n'existe pas. Le lien retombe alors sur le client de messagerie du poste, comme avant, plutôt que
 * de ne rien faire.
 *
 * ── LE CONTEXTE EST OPTIONNEL ──
 *
 * Ce composant est posé à des dizaines d'endroits qui ne connaissent que l'adresse. Quand l'écran en
 * sait plus — quel contact, quel compte, quel contrat — il le transmet, et l'interaction consignée
 * se rattache au bon objet. Sinon le serveur retrouve le contact par son adresse.
 */
export function EmailLink({
  value,
  className,
  nom,
  contexte,
}: {
  value: string
  className?: string
  /** Le nom de la personne, pour l'en-tête du volet et la pastille du brouillon réduit. */
  nom?: string | null
  contexte?: {
    contactId?: string
    compteId?: string
    siteId?: string
    recommandationId?: string
    mandatId?: string
    contratId?: string
  }
}) {
  const volet = useVoletEmail()

  const ouvrir = volet
    ? () => {
        const ok = volet.ouvrir({ a: value, nom, ...contexte })
        if (ok) return
        // UN BROUILLON ÉCRIT NE S'ÉCRASE PAS EN SILENCE : on demande, parce que « sans perdre le
        // mail déjà écrit » est la moitié de la demande.
        if (window.confirm('Un mail est déjà en cours d’écriture. L’abandonner et écrire à ' + (nom || value) + ' ?')) {
          volet.ouvrirEnRemplacant({ a: value, nom, ...contexte })
        }
      }
    : undefined

  return (
    <ContactPopover
      value={value}
      className={className}
      actionLabel="Écrire un mail"
      actionHref={`mailto:${value}`}
      onClicPrincipal={ouvrir}
      onAction={ouvrir}
      ActionIcon={Mail}
    />
  )
}
