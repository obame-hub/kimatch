import { useEffect, useRef, useState } from 'react'
import { Phone, Mail, Copy, Check } from 'lucide-react'
import { useTelephonie } from '@/lib/telephonie'
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
  ActionIcon: typeof Phone
}) {
  const { open, setOpen, ref } = usePopover()

  return (
    <span ref={ref} className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={cn('cursor-pointer text-left underline decoration-navy-200 decoration-dashed underline-offset-2 hover:text-kiwi-600 hover:decoration-kiwi-400', monospace && 'font-mono', className)}
      >
        {value}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-30 mt-1 flex overflow-hidden rounded-lg border border-navy-100 bg-white shadow-lg">
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
              className="flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-[11px] font-medium text-navy-700 hover:bg-navy-50"
            >
              <ActionIcon className="h-3 w-3 text-kiwi-600" />
              {actionLabel}
            </button>
          ) : (
            <a
              href={actionHref}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
              }}
              className="flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-[11px] font-medium text-navy-700 hover:bg-navy-50"
            >
              <ActionIcon className="h-3 w-3 text-kiwi-600" />
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
            className="flex items-center gap-1 border-l border-navy-100 px-2 py-1.5 text-navy-400 hover:bg-navy-50 hover:text-navy-700"
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
 * LE NUMÉRO REDEVIENT DONC UN SIMPLE `<span>`, et c'est ce qui rend l'appel possible : l'extension y
 * pose son icône, et cliquer cette icône lance l'appel dans Allo. C'était la demande de Michel.
 *
 * ET LE BOUTON « APPELER » DISPARAÎT SUR ORDINATEUR — pas par simplification, par honnêteté : aucun
 * code ne peut ouvrir Allo, donc il ne savait que copier, exactement ce que fait le bouton copier juste
 * à côté. Un bouton qui promet un appel et se contente d'une copie est un bouton qui mentait, et en
 * prime il empêchait l'extension de travailler. Sur un appareil tactile il reste : là, `tel:` compose
 * vraiment.
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
      <span className={cn('font-mono', className)}>{value}</span>

      {tactile ? (
        <button
          type="button"
          title="Appeler"
          onClick={(e) => {
            e.stopPropagation()
            void appeler(value)
          }}
          className="shrink-0 rounded p-0.5 text-kiwi-600"
        >
          <Phone className="h-3 w-3" />
        </button>
      ) : (
        <button
          type="button"
          title={copie ? 'Numéro copié' : 'Copier le numéro'}
          onClick={(e) => {
            e.stopPropagation()
            navigator.clipboard
              ?.writeText(value)
              .then(() => setCopie(true))
              .catch(() => {})
          }}
          className="shrink-0 rounded p-0.5 text-navy-300 opacity-0 transition-opacity hover:text-navy-600 focus:opacity-100 group-hover/tel:opacity-100"
        >
          {copie ? <Check className="h-3 w-3 text-kiwi-600" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </span>
  )
}

/** Email affiché n'importe où dans l'app : au survol (web) / au clic (mobile), propose d'envoyer un mail ou de copier. */
export function EmailLink({ value, className }: { value: string; className?: string }) {
  return <ContactPopover value={value} className={className} actionLabel="Envoyer un email" actionHref={`mailto:${value}`} ActionIcon={Mail} />
}
