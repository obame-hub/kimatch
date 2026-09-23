/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CHAQUE RÔLE DONNE VRAIMENT — ET NON CE QU'ON VOUDRAIT QU'IL DONNE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 23/09/2026 : « vérifie si tout fonctionne bien et si c'est cohérent, car on a fait cette
 * page au tout début de Kimatch et je ne suis jamais repassée dessus. »
 *
 * ══ CE QUE J'AI TROUVÉ, MESURÉ ══
 *
 * La page affichait deux matrices de cases à cocher : 24 permissions × 9 rôles, plus 24 × les
 * postes. Cent vingt et une attributions enregistrées en base.
 *
 * ELLES N'ONT AUCUN EFFET. Aucun écran, aucune fonction, aucune règle de base ne lit
 * `roles_acces_permissions`. Compté dans le dépôt : 29 endroits testent le RÔLE (`useIsAdmin`,
 * `code === 'ADMIN'`), et ZÉRO teste une permission. Cocher une case ne changeait rien pour
 * personne — et décocher non plus, ce qui est plus grave : on pouvait croire avoir retiré un droit.
 *
 * ET ELLES NE DISTINGUENT MÊME PAS CE QU'ELLES PRÉTENDENT : ADMIN et SUPER_ADMIN portent les mêmes
 * vingt-quatre permissions.
 *
 * ══ POURQUOI ON NE LES A PAS CÂBLÉES ══
 *
 * Parce que ce qu'elles décrivent — lire un compte, écrire un contrat — est DÉJÀ assuré, par deux
 * mécanismes qui, eux, fonctionnent et sont éprouvés :
 *
 *   · LA VISIBILITÉ (`lib/data/visibility.ts`) : un conseiller ne voit que les comptes dont il est
 *     propriétaire ; un administrateur voit tout. C'est le vrai filtre, appliqué à chaque lecture.
 *   · LE RÔLE : 29 contrôles répartis dans l'application, dont ceux qui autorisent à supprimer une
 *     interaction, à modifier la tâche d'un autre, ou à ouvrir l'administration.
 *
 * Câbler les permissions par-dessus reviendrait à réécrire le contrôle d'accès de toute
 * l'application pour arriver au même résultat — en prenant le risque d'ouvrir un accès par erreur.
 *
 * ══ CE QUE CETTE PAGE FAIT DONC ══
 *
 * Elle DÉCRIT le modèle réel, au lieu de proposer des réglages sans effet. Une page qui ment sur ce
 * qu'elle contrôle est pire qu'une page absente : on croit avoir agi.
 *
 * Le jour où l'on veut de vraies permissions fines, c'est un chantier à part — et il commencera par
 * cette page, qui dit enfin d'où l'on part.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { Eye, ShieldCheck, Users, Info } from 'lucide-react'
import { useRolesAcces, useProfilsAdmin } from '@/lib/data/roles'
import { cn } from '@/lib/utils'

/**
 * Ce que chaque rôle ouvre RÉELLEMENT, relevé dans le code le 23/09/2026.
 *
 * Écrit ici et non déduit de la base : ces droits vivent dans des `if` répartis dans
 * l'application, pas dans une table. Les inventer depuis `roles_acces_permissions` reproduirait le
 * mensonge qu'on corrige. Quand un contrôle change dans le code, cette ligne se met à jour avec lui.
 */
const DROITS_REELS: Record<string, { visibilite: string; enPlus: string[] }> = {
  SUPER_ADMIN: {
    visibilite: 'Tous les comptes',
    enPlus: [
      'Administration : utilisateurs, accès, objets, corbeille',
      'Supprimer n’importe quelle interaction ou tâche',
      'Publier les nouveautés',
      'Reçoit les demandes de support',
    ],
  },
  ADMIN: {
    visibilite: 'Tous les comptes',
    enPlus: [
      'Administration : utilisateurs, accès, objets, corbeille',
      'Supprimer n’importe quelle interaction ou tâche',
      'Publier les nouveautés',
      'Reçoit les demandes de support',
    ],
  },
  DIRECTEUR: { visibilite: 'Ses comptes uniquement', enPlus: [] },
  MANAGER: { visibilite: 'Ses comptes uniquement', enPlus: [] },
  CONSEILLER: { visibilite: 'Ses comptes uniquement', enPlus: [] },
  SERVICE_CLIENT: { visibilite: 'Ses comptes uniquement', enPlus: [] },
}

export function DroitsReels() {
  const { data: roles } = useRolesAcces()
  const { data: profils } = useProfilsAdmin()

  if (!roles) return <p className="text-sm text-km-faint">Chargement…</p>

  const parRole = new Map<string, string[]>()
  for (const p of (profils ?? []).filter((x) => x.actif)) {
    const code = p.role_acces?.code
    if (!code) continue
    const nom = `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() || p.email
    parRole.set(code, [...(parRole.get(code) ?? []), nom])
  }

  /* LES RÔLES SANS PERSONNE PASSENT EN BAS, grisés : ils existent en base mais ne servent à rien
     aujourd'hui. Les cacher tout à fait tromperait — quelqu'un pourrait en attribuer un demain. */
  const utilises = roles.filter((r) => (parRole.get(r.code)?.length ?? 0) > 0)
  const vides = roles.filter((r) => (parRole.get(r.code)?.length ?? 0) === 0)

  return (
    <div className="space-y-5">
      {/* ON DIT D'ABORD CE QUI A CHANGÉ, sinon quelqu'un cherchera les cases à cocher d'hier et
          conclura à une panne. */}
      <div className="flex items-start gap-2.5 rounded-km border border-km-line bg-km-soft px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-km-muted" />
        <div className="text-km-xs leading-relaxed text-km-muted">
          <p className="font-semibold text-km-text">Cette page décrit, elle ne règle pas.</p>
          <p className="mt-1">
            Les droits de Kimatch dépendent du <strong className="text-km-text">rôle</strong> et de
            la <strong className="text-km-text">propriété des comptes</strong>. Les cases à cocher
            qui figuraient ici n’avaient aucun effet : rien dans l’application ne les lisait. Pour
            changer les droits de quelqu’un, changez son rôle dans l’onglet{' '}
            <strong className="text-km-text">Utilisateurs</strong>.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {utilises.map((r) => {
          const droits = DROITS_REELS[r.code]
          const gens = parRole.get(r.code) ?? []
          return (
            <div key={r.id} className="rounded-km border border-km-line bg-white p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-km-green" />
                <span className="font-semibold text-km-text">{r.libelle}</span>
                <span className="ml-auto rounded-md bg-km-green-soft px-1.5 py-0.5 text-km-tiny font-bold text-km-green">
                  {gens.length}
                </span>
              </div>

              <p className="mt-2.5 flex items-start gap-1.5 text-km-xs text-km-muted">
                <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-faint" />
                <span>
                  Voit : <strong className="text-km-text">{droits?.visibilite ?? 'Ses comptes uniquement'}</strong>
                </span>
              </p>

              {droits?.enPlus.length ? (
                <ul className="mt-1.5 space-y-0.5 pl-5 text-km-xs text-km-muted">
                  {droits.enPlus.map((d) => (
                    <li key={d} className="list-disc">{d}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 pl-5 text-km-xs text-km-faint">
                  Aucun droit supplémentaire : accès standard.
                </p>
              )}

              <p className="mt-2.5 flex items-start gap-1.5 border-t border-km-line pt-2 text-km-xs text-km-muted">
                <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-faint" />
                <span className="truncate">{gens.join(', ')}</span>
              </p>
            </div>
          )
        })}
      </div>

      {vides.length > 0 && (
        <div>
          <p className="mb-2 text-km-xs font-semibold uppercase tracking-[0.06em] text-km-faint">
            Rôles définis mais attribués à personne
          </p>
          <div className="flex flex-wrap gap-1.5">
            {vides.map((r) => (
              <span
                key={r.id}
                className={cn(
                  'rounded-km border border-km-line bg-km-bg px-2.5 py-1 text-km-xs text-km-faint',
                )}
                title="Aucune personne active ne porte ce rôle"
              >
                {r.libelle}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
