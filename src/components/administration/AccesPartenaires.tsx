/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * OUVRIR KIMATCH À UN CONTACT DE PARTENAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 24/09/2026 : « faudrait qu'on ajoute dans les accès autorisés les mails des utilisateurs
 * des comptes partenaires, et faut que ce mail soit dans les contacts du compte partenaire ».
 *
 * ══ POURQUOI UN BLOC À PART, ET NON UNE LIGNE DE PLUS DANS LE FORMULAIRE ══
 *
 * Le formulaire du dessous ouvre un accès à qui l'on veut, en saisissant l'adresse. C'est ce qu'il
 * faut pour l'équipe KiWee. Pour un partenaire, non : deux champs libres — l'adresse et le compte —
 * et la seconde erreur ouvre le patrimoine d'un AUTRE partenaire, c'est-à-dire d'un concurrent.
 *
 * ICI ON NE SAISIT RIEN, ON CHOISIT QUELQU'UN. Le compte vient avec la personne, donc il ne peut
 * pas être faux. Mêler les deux gestes dans un seul formulaire aurait rendu cette garantie
 * facultative — or c'est toute sa valeur.
 *
 * ══ CE QUE L'ÉCRAN NE GARANTIT PAS ══
 *
 * Rien. La base est seule garante (migration 20260924153000) : elle refuse un contact qui n'est pas
 * celui d'un partenaire, et recopie l'adresse depuis la fiche. Cet écran rend le bon geste facile,
 * il ne rend pas le mauvais impossible — un appel direct à l'API ne passe pas par lui.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useState } from 'react'
import { Building2, UserPlus, Check, AlertTriangle, Info } from 'lucide-react'
import { useContactsPartenaires, useOuvrirAccesPartenaire, type ContactPartenaire } from '@/lib/data/accesPartenaire'
import { cn } from '@/lib/utils'

export function AccesPartenaires() {
  const { data: contacts, isLoading, isError } = useContactsPartenaires()
  const ouvrir = useOuvrirAccesPartenaire()
  const [erreur, setErreur] = useState<string | null>(null)
  const [ouvert, setOuvert] = useState(false)

  if (isLoading) return null

  if (isError) {
    return (
      <div className="rounded-km border border-km-red/30 bg-km-red-soft px-3.5 py-3">
        <p className="text-km-xs text-km-red">Impossible de lire les contacts des comptes partenaires.</p>
      </div>
    )
  }

  const liste = contacts ?? []
  const disponibles = liste.filter((c) => !c.deja_autorise)

  /* ON GROUPE PAR COMPTE : la question qu'on se pose est « qui, chez OBD-GROUPE ? », pas « où est
     Alison dans une liste de trente noms ». */
  const parCompte = new Map<string, ContactPartenaire[]>()
  for (const c of liste) parCompte.set(c.compte_nom, [...(parCompte.get(c.compte_nom) ?? []), c])

  const accorder = (c: ContactPartenaire) => {
    setErreur(null)
    ouvrir.mutate(c, { onError: (e) => setErreur(e.message) })
  }

  return (
    <div className="rounded-km border border-km-line bg-white p-4">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className="flex w-full items-center gap-2 text-left"
      >
        <Building2 className="h-4 w-4 shrink-0 text-km-amber" />
        <span className="flex-1 text-km-sm font-semibold text-km-text">
          Ouvrir un accès à un partenaire
        </span>
        <span className="rounded-md bg-km-amber-soft px-1.5 py-0.5 text-km-tiny font-bold text-km-amber">
          {disponibles.length}
        </span>
      </button>

      <p className="mt-1 text-km-xs text-km-muted">
        L’accès s’ouvre à un <strong className="text-km-text">contact</strong> d’un compte
        partenaire, jamais à une adresse saisie à la main : le partenaire concerné se déduit de la
        personne choisie, et ne peut donc pas être le mauvais.
      </p>

      {erreur && (
        <div className="mt-3 flex items-start gap-2.5 rounded-km border border-km-red/30 bg-km-red-soft px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-red" />
          <p className="text-km-xs text-km-red">{erreur}</p>
        </div>
      )}

      {ouvert && (
        liste.length === 0 ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-km bg-km-soft px-3 py-2.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-muted" />
            <p className="text-km-xs text-km-muted">
              Aucun contact éligible. Un contact doit être <strong className="text-km-text">actif</strong>,
              porter une <strong className="text-km-text">adresse email</strong>, et appartenir à un
              compte de type <strong className="text-km-text">Partenaire</strong>.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {[...parCompte.entries()].map(([compte, gens]) => (
              <div key={compte}>
                <p className="mb-1 text-km-tiny font-semibold uppercase tracking-[0.06em] text-km-faint">
                  {compte}
                </p>
                <ul className="divide-y divide-km-line rounded-km border border-km-line">
                  {gens.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-2.5 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-km-xs font-medium text-km-text">
                          {`${c.prenom ?? ''} ${c.nom ?? ''}`.trim() || c.email}
                        </span>
                        <span className="block truncate text-km-tiny text-km-faint">{c.email}</span>
                      </span>
                      {c.deja_autorise ? (
                        <span className="flex shrink-0 items-center gap-1 text-km-tiny font-semibold text-km-green">
                          <Check className="h-3.5 w-3.5" />
                          Accès ouvert
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={ouvrir.isPending}
                          onClick={() => accorder(c)}
                          className={cn(
                            'flex shrink-0 items-center gap-1 rounded-km border border-km-line px-2.5 py-1',
                            'text-km-tiny font-semibold text-km-muted transition-colors',
                            'hover:bg-km-soft hover:text-km-text disabled:opacity-50',
                          )}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          Ouvrir l’accès
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
