import { useEffect, useRef, useState } from 'react'
import { Phone, Mail, Copy } from 'lucide-react'
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

/** Numéro affiché n'importe où dans l'app : au survol (web) / au clic (mobile), propose d'appeler ou de copier. */
export function PhoneLink({ value, className }: { value: string; className?: string }) {
  const { appeler } = useTelephonie()
  return (
    <ContactPopover
      value={value}
      className={className}
      monospace
      actionLabel="Appeler"
      onAction={() => void appeler(value)}
      ActionIcon={Phone}
    />
  )
}

/** Email affiché n'importe où dans l'app : au survol (web) / au clic (mobile), propose d'envoyer un mail ou de copier. */
export function EmailLink({ value, className }: { value: string; className?: string }) {
  return <ContactPopover value={value} className={className} actionLabel="Envoyer un email" actionHref={`mailto:${value}`} ActionIcon={Mail} />
}
