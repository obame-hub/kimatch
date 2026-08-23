import { useState } from 'react'
import { Input } from '@/components/ui/form'

/**
 * Choisir un enregistrement parmi quelques milliers, par recherche et non par liste déroulante.
 *
 * POURQUOI CE COMPOSANT EXISTE. Naoëlle, 21/08/2026, sur l'assistant de recommandation : « c'est
 * encore une liste de sélection déroulante ». Le même défaut se répétait ailleurs — 2 765 options
 * pour les comptes, 3 387 pour les contacts, 1 601 pour les contrats, mesurés à l'écran le
 * 23/08/2026. Un `<select>` de cette taille n'est pas un choix, c'est un mur.
 *
 * LE MOTIF EST CELUI DE L'ASSISTANT MANDAT, déjà en place dans l'application : un champ de
 * recherche, cinquante résultats au plus, et le total annoncé tant qu'on n'a rien tapé. Rien
 * d'inventé ici, seulement mis en commun.
 *
 * RIEN NE S'AFFICHE AVANT LA PREMIÈRE FRAPPE : dérouler mille lignes « au cas où » coûte le même
 * prix que la liste qu'on remplace.
 */
export function ChoixParRecherche<T extends { id: string }>({
  items,
  valeur,
  onChoisir,
  placeholder,
  principal,
  secondaire,
  filtre,
  aucun = 'Aucun résultat.',
  totalLibelle,
}: {
  items: T[]
  /** L'identifiant retenu, ou une chaîne vide. */
  valeur: string
  /** `null` quand on efface le choix. */
  onChoisir: (item: T | null) => void
  placeholder: string
  /** La ligne principale : ce qu'on lit d'abord. */
  principal: (item: T) => string
  /** La ligne d'appoint, à droite dans la liste et sous le nom une fois choisi. */
  secondaire?: (item: T) => string | null
  /** `q` arrive déjà en minuscules et sans espaces autour. */
  filtre: (item: T, q: string) => boolean
  aucun?: string
  /** Ce qu'on annonce tant qu'aucune recherche n'est tapée — « 2 765 comptes », par exemple. */
  totalLibelle: string
}) {
  const [recherche, setRecherche] = useState('')
  const choisi = items.find((i) => i.id === valeur)

  if (choisi) {
    const detail = secondaire?.(choisi)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-navy-200 bg-white px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-navy-800">{principal(choisi)}</p>
          {detail && <p className="truncate text-[11px] text-navy-400">{detail}</p>}
        </div>
        <button
          type="button"
          onClick={() => { onChoisir(null); setRecherche('') }}
          className="shrink-0 text-xs font-semibold text-kiwi-700 hover:underline"
        >
          changer
        </button>
      </div>
    )
  }

  const q = recherche.trim().toLowerCase()
  const trouves = q ? items.filter((i) => filtre(i, q)).slice(0, 50) : []

  return (
    <div className="space-y-1.5">
      <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder={placeholder} />
      {q && (
        <div className="max-h-[152px] overflow-y-auto rounded-lg border border-navy-100">
          {trouves.map((i) => {
            const detail = secondaire?.(i)
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => onChoisir(i)}
                className="flex w-full items-center gap-2 border-b border-navy-50 px-3 py-2 text-left last:border-b-0 hover:bg-navy-50/60"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-navy-800">{principal(i)}</span>
                {detail && <span className="shrink-0 truncate text-[10.5px] text-navy-400">{detail}</span>}
              </button>
            )
          })}
          {trouves.length === 0 && <p className="p-3 text-center text-xs text-navy-400">{aucun}</p>}
        </div>
      )}
      {!q && <p className="text-[10.5px] text-navy-400">{totalLibelle} — tapez pour chercher.</p>}
    </div>
  )
}
