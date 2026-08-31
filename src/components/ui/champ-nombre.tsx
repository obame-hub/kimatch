import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Saisie d'un nombre en place : un pointillé cliquable, Entrée valide, Échap annule.
 *
 * Sorti de `OffresDuFournisseur` le 18/08/2026 pour être partagé avec la saisie des prix par point de
 * livraison. Même geste des deux côtés : le conseiller lit une valeur dans un mail et la tape là où
 * elle s'affiche, sans ouvrir de formulaire.
 *
 * Une valeur absente s'affiche quand même, en gris et en pointillé : sans ça rien n'indique qu'elle
 * se saisit ici.
 */
export function ChampNombre({
  valeur,
  suffixe,
  placeholder,
  decimales,
  largeur,
  onCommit,
  peutModifier,
  titre,
}: {
  valeur: number | null | undefined
  suffixe: string
  placeholder: string
  decimales?: number
  /** Classe de largeur du champ en édition. Les prix au MWh sont plus courts qu'un budget annuel. */
  largeur?: string
  onCommit: (v: number | null) => void
  peutModifier: boolean
  titre: string
}) {
  const [edition, setEdition] = useState(false)
  const [brouillon, setBrouillon] = useState('')

  const affiche =
    valeur != null
      ? `${valeur.toLocaleString('fr-FR', { maximumFractionDigits: decimales ?? 0 })} ${suffixe}`
      : placeholder

  function commettre() {
    setEdition(false)
    const brut = brouillon.trim().replace(/\s/g, '').replace(',', '.')
    if (brut === '') {
      // Rien saisi ET rien à effacer : on ne touche pas à la base. Sans ce garde-fou, entrer dans
      // une case vide puis en sortir écrivait `null` — donc CRÉAIT les lignes de détail et de prix,
      // vides. Constaté le 19/08/2026 : deux lignes de prix gaz entièrement nulles existaient parce
      // que quelqu'un avait simplement cliqué dans un champ. Regarder ne doit pas écrire.
      if (valeur == null) return
      return onCommit(null)
    }
    const n = Number.parseFloat(brut)
    if (!Number.isFinite(n) || n < 0) return
    // Valeur inchangée : pas d'écriture, et pas de notification qui ferait croire à une modification.
    if (n === valeur) return
    onCommit(n)
  }

  if (edition) {
    return (
      <input
        autoFocus
        value={brouillon}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={commettre}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commettre()
          if (e.key === 'Escape') setEdition(false)
        }}
        placeholder={suffixe}
        className={cn(
          'rounded-km-sm border border-km-green bg-white px-1.5 py-0.5 font-mono text-km-body font-bold text-km-text outline-none ring-[3px] ring-km-green/10',
          largeur ?? 'w-[86px]',
        )}
      />
    )
  }
  return (
    <button
      type="button"
      disabled={!peutModifier}
      title={peutModifier ? `${titre} — cliquer pour saisir` : titre}
      onClick={() => { setBrouillon(valeur != null ? String(valeur) : ''); setEdition(true) }}
      className={cn(
        'font-mono text-km-body',
        peutModifier && 'cursor-text border-b border-dashed border-[#d9d0bd]',
        valeur != null ? 'font-bold text-km-text' : 'text-km-faint',
      )}
    >
      {affiche}
    </button>
  )
}
