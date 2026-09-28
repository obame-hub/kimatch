import { useEffect, useRef, useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * UN CHAMP QUI SE CORRIGE PENDANT L'APPEL
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « dans Cockpit, depuis le sprint, tous les champs doivent être
 * modifiables ! »
 *
 * ══ POURQUOI PAS `InlineField` ══
 *
 * Le champ modifiable du reste de l'application existe et fonctionne — mais toute sa palette est
 * celle de la page claire : `km-text` sur `km-surface`, bordure `km-green`. Posé sur l'anthracite
 * du sprint, il donnerait exactement le défaut que William a signalé ce matin sur ce même écran —
 * du texte sombre sur un fond sombre. Ce composant reprend donc son COMPORTEMENT, pas ses
 * couleurs : clic pour ouvrir, Entrée ou perte du focus pour enregistrer, Échap pour renoncer.
 *
 * ══ TROIS DÉCISIONS QUI VIENNENT DE L'USAGE, PAS DU DESSIN ══
 *
 * ON ENREGISTRE À LA PERTE DU FOCUS, et pas seulement sur Entrée. Au téléphone, on tape le mail
 * qu'on vient d'entendre puis on clique ailleurs pour faire autre chose — exiger Entrée perdrait
 * la saisie au moment précis où elle vaut le plus cher.
 *
 * ÉCHAP RESTE LA PORTE DE SORTIE, et elle ne doit pas fermer le sprint tant qu'un champ est
 * ouvert : l'événement est donc arrêté ici. Sans ça, corriger un prénom puis se raviser ferait
 * quitter la séance entière.
 *
 * RIEN N'EST ENVOYÉ SI RIEN N'A CHANGÉ. Ouvrir un champ pour lire une valeur est un geste courant ;
 * il ne doit pas écrire en base, ni faire clignoter la ligne, ni compter comme une modification
 * dans l'historique du contact.
 */
export function ChampSprint({
  valeur,
  onCommit,
  placeholder = 'à compléter',
  mono,
  multiligne,
  className,
  classeLecture,
  ariaLabel,
  aLaLigne,
}: {
  valeur: string | null | undefined
  onCommit: (v: string) => Promise<void> | void
  placeholder?: string
  mono?: boolean
  multiligne?: boolean
  /** Appliqué au champ ET à la valeur lue : c'est ce qui évite le saut de taille à l'ouverture. */
  className?: string
  /** Réservé aux cas où la lecture porte un style que l'édition ne doit pas reprendre. */
  classeLecture?: string
  ariaLabel: string
  /**
   * ══ REVENIR À LA LIGNE PLUTÔT QUE COUPER ══
   *
   * William, 28/09/2026, sur l'onglet Société du sprint : « les champs sont coupés par des "…"
   * alors qu'il doit y avoir largement la place ». La ligne qui l'accueille était faite pour
   * revenir à la ligne (`break-words`) ; ce champ, lui, forçait une seule ligne tronquée — et
   * depuis que chaque champ de l'onglet est modifiable, c'est lui qui affichait toutes les valeurs.
   *
   * PAR DÉFAUT IL TRONQUE ENCORE : un nom sur une seule ligne, en tête de fiche, doit le rester.
   * Là où l'on lit une adresse ou un libellé NAF, la valeur entière compte plus que la hauteur.
   */
  aLaLigne?: boolean
}) {
  const [ouvert, setOuvert] = useState(false)
  const [brouillon, setBrouillon] = useState(valeur ?? '')
  const champ = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  /* La valeur peut changer sous nos pieds — on passe à la fiche suivante, ou le pipe se relit après
     un enregistrement. Le brouillon suit, sauf pendant qu'on écrit dedans. */
  useEffect(() => {
    if (!ouvert) setBrouillon(valeur ?? '')
  }, [valeur, ouvert])

  useEffect(() => {
    if (ouvert) champ.current?.focus()
  }, [ouvert])

  function enregistrer() {
    setOuvert(false)
    const propre = brouillon.trim()
    if (propre === (valeur ?? '').trim()) return
    void onCommit(propre)
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-label={`Modifier ${ariaLabel}`}
        title={`Modifier ${ariaLabel}`}
        className={cn(
          'group/champ -mx-1 inline-flex max-w-full gap-1.5 rounded-km-sm px-1 text-left transition-colors hover:bg-km-side-line/50',
          aLaLigne || multiligne ? 'items-start' : 'items-center',
          className,
          classeLecture,
        )}
      >
        {/* UNE NOTE GARDE SES RETOURS À LA LIGNE, une valeur longue revient à la ligne, le
            reste tient sur une ligne : c'est le contenu qui décide, pas le composant. */}
        <span
          className={cn(
            'min-w-0',
            multiligne ? 'whitespace-pre-wrap break-words' : aLaLigne ? 'whitespace-normal break-words' : 'truncate',
            !valeur && 'text-km-side-faint italic',
          )}
        >
          {valeur || placeholder}
        </span>
        <Pencil
          className={cn(
            'h-3 w-3 shrink-0 text-km-side-faint opacity-0 transition-opacity group-hover/champ:opacity-100',
            (aLaLigne || multiligne) && 'mt-[0.35em]',
          )}
          aria-hidden="true"
        />
      </button>
    )
  }

  const commun = cn(
    '-mx-1 w-full rounded-km-sm border border-km-side-green bg-km-side px-1 text-km-side-text outline-none',
    mono && 'font-mono tabular-nums',
    className,
  )

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {multiligne ? (
        <textarea
          ref={champ as React.RefObject<HTMLTextAreaElement>}
          value={brouillon}
          aria-label={ariaLabel}
          onChange={(e) => setBrouillon(e.target.value)}
          onBlur={enregistrer}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.stopPropagation(); setBrouillon(valeur ?? ''); setOuvert(false) }
          }}
          rows={3}
          className={cn(commun, 'resize-y py-1')}
        />
      ) : (
        <input
          ref={champ as React.RefObject<HTMLInputElement>}
          value={brouillon}
          aria-label={ariaLabel}
          onChange={(e) => setBrouillon(e.target.value)}
          onBlur={enregistrer}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); enregistrer() }
            if (e.key === 'Escape') { e.stopPropagation(); setBrouillon(valeur ?? ''); setOuvert(false) }
          }}
          className={commun}
        />
      )}
      <Check className="h-3.5 w-3.5 shrink-0 text-km-side-green" aria-hidden="true" />
    </span>
  )
}
