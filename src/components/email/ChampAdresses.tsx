import { useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAnnuaireEquipe } from '@/lib/data/annuaireEquipe'
import { adressesDe, insererAdresse, jetonAuCurseur, suggestions } from '@/lib/adresses'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * UN CHAMP D'ADRESSES QUI CONNAÎT L'ÉQUIPE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 28/09/2026 : « si je tape marie, on me propose directement le mail de Marie THONNARD.
 * Cela permettrait de gagner du temps vu que plusieurs utilisateurs sont régulièrement mis en copie
 * des mails. »
 *
 * ══ UN SEUL CHAMP POUR TOUS LES ÉDITEURS ══
 *
 * Cinq champs d'adresse dans trois éditeurs — le volet mail (À, Cc, Cci), le sprint (Cc), l'envoi
 * d'une version de recommandation (À). Écrire la suggestion cinq fois aurait fait cinq comportements
 * au premier ajustement. Ce composant rend le champ de l'éditeur tel quel — son style, sa place —
 * et n'y ajoute que la liste.
 *
 * ══ LE TEXTE RESTE LIBRE ══
 *
 * Pas de « puces » d'adresses à la Gmail : le champ reste une ligne de texte séparée par des
 * virgules, comme avant. On colle toujours une liste, on corrige toujours une lettre au milieu. La
 * suggestion ne porte que sur le morceau sous le curseur, et ne remplace que lui.
 *
 * ══ AU CLAVIER, COMME AILLEURS ══
 *
 * Flèches pour parcourir, Entrée ou Tab pour choisir, Échap pour refermer la liste — et SEULEMENT la
 * liste : dans le sprint, Échap ferme la séance entière. L'événement s'arrête donc ici tant que la
 * liste est ouverte.
 */
export function ChampAdresses({
  valeur,
  onChange,
  placeholder,
  ariaLabel,
  className,
  classeConteneur,
  theme = 'clair',
  autoFocus,
}: {
  valeur: string
  onChange: (v: string) => void
  placeholder?: string
  ariaLabel: string
  /** Le style du champ : celui de l'éditeur qui l'accueille, inchangé. */
  className?: string
  /** La place du champ dans sa ligne — `min-w-0 flex-1` dans une ligne flexible, par exemple. */
  classeConteneur?: string
  /** Le fond sur lequel la liste s'ouvre : les pages claires, ou l'anthracite du sprint. */
  theme?: 'clair' | 'sombre'
  autoFocus?: boolean
}) {
  const { data: equipe } = useAnnuaireEquipe()
  const champ = useRef<HTMLInputElement | null>(null)
  const idListe = useId()
  const [curseur, setCurseur] = useState(valeur.length)
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(0)

  const proposees = useMemo(() => {
    if (!ouvert || !equipe) return []
    const { texte } = jetonAuCurseur(valeur, curseur)
    /* Une adresse complète déjà tapée n'appelle plus rien. */
    if (texte.includes('@') && texte.includes('.')) return []
    return suggestions(equipe, texte, adressesDe(valeur))
  }, [ouvert, equipe, valeur, curseur])

  const visible = proposees.length > 0
  const indexActif = Math.min(actif, Math.max(0, proposees.length - 1))

  function suivreCurseur(el: HTMLInputElement) {
    setCurseur(el.selectionStart ?? el.value.length)
  }

  function choisir(email: string) {
    const suite = insererAdresse(valeur, curseur, email)
    onChange(suite.valeur)
    setCurseur(suite.curseur)
    setActif(0)
    /* Le curseur se replace APRÈS l'adresse insérée, prêt pour la suivante. */
    requestAnimationFrame(() => {
      const el = champ.current
      if (!el) return
      el.focus()
      el.setSelectionRange(suite.curseur, suite.curseur)
    })
  }

  const clair = theme === 'clair'

  return (
    <span className={cn('relative', classeConteneur ?? 'block')}>
      <input
        ref={champ}
        value={valeur}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={idListe}
        aria-activedescendant={visible ? `${idListe}-${indexActif}` : undefined}
        autoComplete="off"
        spellCheck={false}
        className={className}
        onChange={(e) => {
          onChange(e.target.value)
          suivreCurseur(e.target)
          setOuvert(true)
          setActif(0)
        }}
        onSelect={(e) => suivreCurseur(e.currentTarget)}
        onFocus={() => setOuvert(true)}
        onBlur={() => setOuvert(false)}
        onKeyDown={(e) => {
          if (!visible) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActif((i) => (i + 1) % proposees.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActif((i) => (i - 1 + proposees.length) % proposees.length)
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            choisir(proposees[indexActif].email)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setOuvert(false)
          }
        }}
      />

      {visible ? (
        <ul
          id={idListe}
          role="listbox"
          aria-label="Membres de l’équipe"
          className={cn(
            'absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-km border py-1',
            clair ? 'border-km-line bg-km-surface shadow-km-pop' : 'border-km-side-line bg-km-side shadow-xl',
          )}
        >
          {proposees.map((p, i) => (
            <li
              key={p.id}
              id={`${idListe}-${i}`}
              role="option"
              aria-selected={i === indexActif}
              /* `onMouseDown` et non `onClick` : le clic ferait d'abord perdre le focus au champ,
                 qui refermerait la liste avant que le choix ne soit pris. */
              onMouseDown={(e) => { e.preventDefault(); choisir(p.email) }}
              onMouseEnter={() => setActif(i)}
              className={cn(
                'flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-km-body',
                i === indexActif
                  ? (clair ? 'bg-km-green-tint' : 'bg-km-side-green/12')
                  : '',
              )}
            >
              <span className={cn('shrink-0 font-semibold', clair ? 'text-km-text' : 'text-km-side-text')}>
                {p.prenom} {p.nom}
              </span>
              <span className={cn('min-w-0 truncate text-km-label', clair ? 'text-km-muted' : 'text-km-side-muted')}>
                {p.email}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  )
}
