import { AlertTriangle, Check, ClipboardList, Crown, Lock, PenLine, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  AIDE_ROLE,
  LIBELLE_ROLE,
  conseilSyndicalQuiSigne,
  rolesDisponibles,
  rolesEntraines,
  rolesVerrouilles,
  type RoleContact,
} from '@/lib/contactRoles'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE SÉLECTEUR DE RÔLES — QUATRE CASES, CUMULABLES
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 13/09/2026 : « Voici les rôles : Décisionnaire, Signataire, Administratif, Conseil
 * Syndical. […] Un choix multiple est possible par exemple : Décisionnaire et signataire. »
 *
 * ══ POURQUOI UN COMPOSANT PARTAGÉ ══
 *
 * Le rôle se saisit à deux endroits — la création d'un contact et sa fiche. Deux implémentations,
 * ce sont deux règles d'entraînement qui divergent au premier correctif : celle du syndic bénévole
 * ne serait appliquée qu'à un seul des deux écrans, et l'autre produirait des contacts incohérents
 * sans que rien ne le signale.
 *
 * ══ SIGNATAIRE PORTE L'OR ══
 *
 * Même règle qu'à l'onglet Contacts : sa couleur ne dépend ni de l'écran ni du voisinage, parce
 * qu'il répond à une question qu'on se pose partout — qui peut signer.
 *
 * ══ L'ENTRAÎNEMENT SE VOIT ══
 *
 * En syndic bénévole, cocher « Conseil syndical » coche et VERROUILLE décisionnaire et signataire :
 * sans cabinet entre la copropriété et Kiwee, le conseil syndical est la partie contractante. Le
 * cadenas et la phrase sous les cases disent pourquoi. C'est délibérément fait ici plutôt que par un
 * déclencheur en base : un trigger corrigerait la saisie sans que personne ne le sache.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ICONE: Record<RoleContact, typeof Crown> = {
  DECISIONNAIRE: Crown,
  SIGNATAIRE: PenLine,
  ADMINISTRATIF: ClipboardList,
  CONSEIL_SYNDICAL: Users,
}

/** L'or du thème pour le signataire, la teinte de son sens pour les autres. */
const ACTIF: Record<RoleContact, string> = {
  DECISIONNAIRE: 'border-km-green bg-km-green-soft text-km-green',
  SIGNATAIRE: 'border-km-amber bg-km-amber-soft text-km-amber',
  ADMINISTRATIF: 'border-km-blue bg-km-blue-soft text-km-blue',
  CONSEIL_SYNDICAL: 'border-km-piste bg-km-piste-soft text-km-piste',
}

export function SelecteurRoles({
  roles,
  segment,
  onChange,
  disabled,
}: {
  roles: readonly RoleContact[]
  /** `comptes.segment` : il décide des rôles proposés et de la règle du syndic bénévole. */
  segment: string | null | undefined
  onChange: (roles: RoleContact[]) => void
  disabled?: boolean
}) {
  const options = rolesDisponibles(segment)
  const verrouilles = rolesVerrouilles(roles, segment)
  const alerte = conseilSyndicalQuiSigne(roles, segment)

  function basculer(r: RoleContact) {
    if (disabled || verrouilles.includes(r)) return
    const suivant = roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r]
    onChange(rolesEntraines(suivant, segment))
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((r) => {
          const actif = roles.includes(r)
          const verrouille = verrouilles.includes(r)
          const Icone = ICONE[r]
          return (
            <button
              key={r}
              type="button"
              aria-pressed={actif}
              onClick={() => basculer(r)}
              disabled={disabled}
              className={cn(
                'relative flex items-start gap-2.5 rounded-xl border-2 p-2.5 text-left transition-all',
                actif ? cn(ACTIF[r], 'shadow-sm') : 'border-km-line bg-km-surface hover:border-km-green-line',
                verrouille && 'cursor-default',
                disabled && 'pointer-events-none opacity-50',
              )}
            >
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', actif ? 'bg-white/70' : 'bg-km-soft text-km-faint')}>
                <Icone className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-km-body font-semibold leading-tight', !actif && 'text-km-text')}>
                  {LIBELLE_ROLE[r]}
                </span>
                <span className="mt-0.5 block text-km-label leading-snug text-km-muted">{AIDE_ROLE[r]}</span>
              </span>
              {verrouille ? (
                <Lock className="h-3.5 w-3.5 shrink-0" />
              ) : (
                actif && <Check className="h-4 w-4 shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      {verrouilles.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-km-label text-km-piste">
          <Lock className="mt-px h-3 w-3 shrink-0" />
          Syndic bénévole : la copropriété est son propre syndic, il n’y a pas de cabinet. Un membre du
          conseil syndical y décide et signe forcément.
        </p>
      )}

      {/* AVERTIR PLUTÔT QU'INTERDIRE. Six contacts étaient dans ce cas le 13/09/2026 ; trois
          relevaient du syndic bénévole et étaient donc légitimes. Bloquer aurait effacé leur
          signature ; laisser passer sans rien dire laisserait les trois autres se reproduire. */}
      {alerte && (
        <p className="mt-2 flex items-start gap-1.5 text-km-label text-km-amber">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          Un membre du conseil syndical ne contractualise pas chez un syndic professionnel — c’est le
          cabinet qui signe. À vérifier avant d’enregistrer.
        </p>
      )}
    </div>
  )
}
