/**
 * ══ UN NOM SE LIT ENTIER, ET SE MODIFIE EN TROIS ══
 *
 * Naoëlle, 14/09/2026 : « il faut que ça s'affiche en nom complet mais que quand on clique pour
 * modifier, on voie bien les trois champs, partout où on voit le nom. »
 *
 * `InlineField variant="text"` ouvre UN champ sur la valeur affichée. Sur un nom, cela redonne à
 * corriger « Evelyne Tixier » d'un seul tenant — donc à recoller ce qu'on vient de séparer, et à
 * reperdre la civilité. C'est exactement ce qu'elle a vu en cliquant sur « Contact » d'une piste.
 *
 * Ce champ-ci lit comme les autres — une ligne, « Monsieur Jean DUPONT » — et s'ouvre sur trois
 * entrées. Il n'enregistre qu'une fois, avec les trois valeurs : trois `onCommit` séparés
 * feraient trois écritures et trois occasions d'en rater une.
 *
 * ══ IL NE MET PAS EN FORME LUI-MÊME ══
 *
 * Le nom en majuscules et le prénom en Capitale sont garantis par la base — `fn_formater_identite_contact`
 * pour les contacts (migration 20260914180000), le script d'import pour les pistes. Le faire aussi
 * ici donnerait une seconde règle à tenir d'accord avec la première, et c'est toujours la seconde
 * qui dérive. On se contente de montrer, à la frappe, ce que la base gardera — un confort, pas une
 * garantie, et le commentaire est là pour que personne ne s'y trompe.
 */
import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { optionsCivilite, nomComplet, nomEnMajuscules, prenomEnCapitale } from '@/lib/civilite'

export interface Identite {
  civilite: string | null
  prenom: string | null
  nom: string | null
}

const champBase =
  'h-8 w-full rounded-km-sm border border-km-green bg-white px-1.5 text-km-name text-km-text outline-none'

export function InlineIdentite({
  valeur,
  onCommit,
  label = 'Contact',
  emptyLabel = 'ajouter',
  onSaved,
  onError,
  disabled,
  className,
}: {
  valeur: Identite
  onCommit: (v: Identite) => Promise<void>
  label?: string
  emptyLabel?: string
  onSaved?: () => void
  onError?: (err: Error) => void
  disabled?: boolean
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [civilite, setCivilite] = useState(valeur.civilite ?? '')
  const [prenom, setPrenom] = useState(valeur.prenom ?? '')
  const [nom, setNom] = useState(valeur.nom ?? '')
  const [enCours, setEnCours] = useState(false)
  const premierRef = useRef<HTMLSelectElement>(null)

  /* La valeur peut changer sous nos pieds — un autre onglet, un rafraîchissement. On ne recopie
     QUE hors édition : écraser une saisie en cours parce que le serveur a répondu serait le pire
     des défauts, celui qui fait perdre ce qu'on vient de taper. */
  useEffect(() => {
    if (editing) return
    setCivilite(valeur.civilite ?? '')
    setPrenom(valeur.prenom ?? '')
    setNom(valeur.nom ?? '')
  }, [valeur.civilite, valeur.prenom, valeur.nom, editing])

  useEffect(() => { if (editing) premierRef.current?.focus() }, [editing])

  const affiche = nomComplet(valeur)

  function annuler() {
    setCivilite(valeur.civilite ?? '')
    setPrenom(valeur.prenom ?? '')
    setNom(valeur.nom ?? '')
    setEditing(false)
  }

  async function valider() {
    if (enCours) return
    setEnCours(true)
    try {
      await onCommit({
        civilite: civilite.trim() || null,
        prenom: prenom.trim() || null,
        nom: nom.trim() || null,
      })
      setEditing(false)
      onSaved?.()
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error('Enregistrement impossible'))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <div className="mb-0.5 text-km-label font-semibold uppercase tracking-wide text-km-faint">
          {label}
        </div>
      )}

      {editing ? (
        <div
          /* Échap annule, Entrée valide — le même contrat que les autres champs en ligne, pour
             qu'on n'ait pas à réapprendre un geste selon le champ qu'on ouvre. */
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); annuler() }
            if (e.key === 'Enter') { e.preventDefault(); void valider() }
          }}
          className="flex flex-col gap-1.5"
        >
          <div className="grid grid-cols-[minmax(0,7rem)_1fr_1fr] gap-1.5">
            <select
              ref={premierRef}
              value={civilite}
              onChange={(e) => setCivilite(e.target.value)}
              aria-label="Civilité"
              className={champBase}
            >
              <option value="">—</option>
              {optionsCivilite(valeur.civilite).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              /* La mise en forme au `blur` et non à la frappe : corriger la casse sous les doigts
                 déplace le curseur et empêche d'écrire « McDonald » le temps d'un caractère. */
              onBlur={(e) => setPrenom(prenomEnCapitale(e.target.value))}
              placeholder="Prénom"
              aria-label="Prénom"
              autoComplete="given-name"
              className={champBase}
            />
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              onBlur={(e) => setNom(nomEnMajuscules(e.target.value))}
              placeholder="NOM"
              aria-label="Nom"
              autoComplete="family-name"
              className={champBase}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void valider() }}
              disabled={enCours}
              className="rounded-km-sm bg-km-green px-2 py-0.5 text-km-label font-semibold text-white disabled:opacity-60"
            >
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              onClick={annuler}
              className="text-km-label text-km-faint underline-offset-2 hover:underline"
            >
              Annuler
            </button>
            <span className="text-km-xs text-km-faint">
              Le nom part en majuscules, le prénom en Capitale.
            </span>
          </div>
        </div>
      ) : affiche ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setEditing(true)}
          title={`Modifier ${label.toLocaleLowerCase('fr-FR')}`}
          className="flex w-full min-w-0 items-center gap-1.5 rounded-km-sm px-1.5 py-0.5 text-left text-km-name text-km-text transition-colors hover:bg-km-soft"
        >
          <span className="min-w-0 truncate">{affiche}</span>
          <Pencil className="h-3 w-3 shrink-0 text-km-faint" />
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setEditing(true)}
          className="rounded-km-sm border border-dashed border-km-line px-1.5 py-0.5 text-km-label text-km-faint transition-colors hover:border-km-green hover:text-km-green"
        >
          {emptyLabel}
        </button>
      )}
    </div>
  )
}
