import { AlertTriangle, Check, ClipboardList, Crown, Gauge, Lock, PenLine, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AIDE_ROLE, LIBELLE_ROLE, ROLES_CONTACT, estSyndic, type RoleContact } from '@/lib/contactRoles'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES RÔLES D'UN CONTACT : TROIS CONSTATS, UN SEUL CHOIX
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 14/09/2026 :
 *   « Un contact est "Signataire" s'il est renseigné sur un mandat ou sur un contrat »
 *   « Un contact est "Décisionnaire" s'il a au minimum un compteur d'affilié »
 *   « Un contact administratif ne peut pas avoir de compteurs liés »
 *   « Un contact "Signataire" ne peut pas être aussi "Administratif" »
 *
 * ══ ON N'A PLUS RIEN À COCHER, SAUF UNE CHOSE ══
 *
 * Décisionnaire, Signataire et Conseil syndical sont désormais DÉDUITS des faits par la base
 * (`fn_roles_contact`, migration du 14/09/2026). Les laisser cochables serait offrir un bouton qui
 * ne change rien — ou pire, qui ferait croire qu'on peut nommer signataire quelqu'un qui n'a jamais
 * signé. Ils s'affichent donc comme ce qu'ils sont : des constats, avec la raison qui les fonde.
 *
 * ADMINISTRATIF est le seul qui reste un choix, parce qu'il ne se déduit pas : quelqu'un sans
 * compteur et sans signature est peut-être une comptable, peut-être un contact qu'on n'a pas encore
 * qualifié. Seul un humain sait. Et il devient impossible à cocher dès qu'un fait le contredit —
 * 477 contacts portaient Signataire ET Administratif avant cette règle, et apparaissaient deux fois
 * dans l'onglet Contacts.
 */

const ICONE: Record<RoleContact, typeof Crown> = {
  DECISIONNAIRE: Gauge,
  SIGNATAIRE: PenLine,
  ADMINISTRATIF: ClipboardList,
  CONSEIL_SYNDICAL: Users,
}

const TEINTE: Record<RoleContact, string> = {
  DECISIONNAIRE: 'border-km-green bg-km-green-soft text-km-green',
  SIGNATAIRE: 'border-km-amber bg-km-amber-soft text-km-amber',
  ADMINISTRATIF: 'border-km-blue bg-km-blue-soft text-km-blue',
  CONSEIL_SYNDICAL: 'border-km-piste bg-km-piste-soft text-km-piste',
}

/** Ce qui fonde un rôle déduit — affiché à la place de la case à cocher. */
const FONDEMENT: Record<Exclude<RoleContact, 'ADMINISTRATIF'>, string> = {
  DECISIONNAIRE: 'Responsable d’au moins un compteur',
  SIGNATAIRE: 'Nommé sur un mandat ou un contrat',
  CONSEIL_SYNDICAL: 'Désigné relais sur au moins un compteur',
}

export function SelecteurRoles({
  roles,
  segment,
  onChange,
  disabled,
}: {
  roles: readonly RoleContact[]
  /** `comptes.segment` : seul un syndic peut porter un conseil syndical. */
  segment: string | null | undefined
  onChange: (roles: RoleContact[]) => void
  disabled?: boolean
}) {
  const deduits = ROLES_CONTACT.filter(
    (r) => r !== 'ADMINISTRATIF' && roles.includes(r) && (r !== 'CONSEIL_SYNDICAL' || estSyndic(segment)),
  )
  const empeche = deduits.length > 0
  const administratif = roles.includes('ADMINISTRATIF')

  function basculerAdministratif() {
    if (disabled || empeche) return
    onChange(administratif ? roles.filter((r) => r !== 'ADMINISTRATIF') : [...roles, 'ADMINISTRATIF'])
  }

  return (
    <div className="flex flex-col gap-2">
      {/* ══ CE QUE LA BASE CONSTATE ══ */}
      {deduits.map((r) => {
        const Icone = ICONE[r]
        return (
          <div key={r} className={cn('flex items-start gap-2.5 rounded-xl border-2 p-2.5', TEINTE[r])}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70">
              <Icone className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-km-body font-semibold leading-tight">{LIBELLE_ROLE[r]}</span>
              <span className="mt-0.5 block text-km-label leading-snug text-km-muted">
                {FONDEMENT[r as Exclude<RoleContact, 'ADMINISTRATIF'>]}
              </span>
            </span>
            {/* Le cadenas dit « constaté », pas « verrouillé par erreur ». */}
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          </div>
        )
      })}

      {/* ══ LE SEUL CHOIX QUI RESTE ══ */}
      <button
        type="button"
        aria-pressed={administratif}
        onClick={basculerAdministratif}
        disabled={disabled || empeche}
        className={cn(
          'flex items-start gap-2.5 rounded-xl border-2 p-2.5 text-left transition-all',
          administratif ? cn(TEINTE.ADMINISTRATIF, 'shadow-sm') : 'border-km-line bg-km-surface hover:border-km-green-line',
          (disabled || empeche) && 'cursor-default opacity-60 hover:border-km-line',
        )}
      >
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', administratif ? 'bg-white/70' : 'bg-km-soft text-km-faint')}>
          <ClipboardList className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-km-body font-semibold leading-tight', !administratif && 'text-km-text')}>
            {LIBELLE_ROLE.ADMINISTRATIF}
          </span>
          <span className="mt-0.5 block text-km-label leading-snug text-km-muted">{AIDE_ROLE.ADMINISTRATIF}</span>
        </span>
        {administratif && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
      </button>

      {empeche && (
        <p className="flex items-start gap-1.5 text-km-label leading-snug text-km-amber">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          Administratif est impossible ici : ce contact {deduits.includes('DECISIONNAIRE') ? 'porte des compteurs' : deduits.includes('SIGNATAIRE') ? 'a signé' : 'est relais de conseil syndical'}.
          Un administratif n’a ni compteur ni signature.
        </p>
      )}

      {deduits.length === 0 && !administratif && (
        <p className="text-km-label leading-snug text-km-faint">
          Les autres rôles se constatent : ils apparaîtront dès que ce contact portera un compteur ou
          signera un mandat.
        </p>
      )}
    </div>
  )
}
