import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Target } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES OPPORTUNITÉS QUI PASSENT PAR CE COMPTEUR
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * L'audit des rattachements (`scripts/auditer-rattachements.cjs`) le signalait depuis le 10/09 :
 *
 *     opportunité ↔ compteur
 *       écran A : OpportuniteDetail · Rattachements
 *       écran B : CompteurDetail — AUCUN ÉCRAN NE LE MONTRE
 *
 * Le lien existait, les 54 liens étaient bien en base — mais il ne se lisait que d'un côté. Depuis
 * une opportunité on voyait son périmètre ; depuis un compteur, on ne savait pas qu'une affaire le
 * concernait. C'est la question qu'on se pose en décrochant : « est-ce qu'on a déjà quelque chose
 * en cours sur ce point de livraison ? »
 *
 * LES COMPTEURS ÉCARTÉS SONT MONTRÉS AUSSI, et distingués. Michel, 11/09/2026 : écarter est une
 * décision, pas un oubli. Masquer les écartés ferait croire que l'opportunité n'a jamais regardé ce
 * compteur, alors que quelqu'un l'a examiné et mis de côté.
 */

/**
 * ══ LES VRAIS NOMS DE COLONNES, ET COMMENT JE M'EN ÉTAIS PASSÉ ══
 *
 * Première version : je lisais `nom` et `statut` sur `opportunites`. Ni l'une ni l'autre n'existe —
 * une opportunité porte une `reference`, un `type_opportunite`, une `origine`, et un `statut_id`
 * qui pointe vers `statuts_opportunites`. La requête échouait donc toujours, et la carte ne
 * s'affichait jamais : elle se cache quand la liste est vide, ce qui rendait la panne invisible.
 *
 * `npm run carte` l'a dit le 20/09 — « le code lit des colonnes que le schéma ne porte plus ». Je
 * n'avais pas lancé le contrôle après avoir écrit ce composant.
 */
interface LienOpportunite {
  ecarte: boolean | null
  motif_ecart: string | null
  opportunite: {
    id: string
    reference: string | null
    type_opportunite: string | null
    origine: string | null
    statut: { libelle: string | null } | { libelle: string | null }[] | null
  } | null
}

/** PostgREST rend une relation soit en objet, soit en tableau d'un élément selon la cardinalité. */
const libelleStatut = (s: LienOpportunite['opportunite'] extends null ? never : NonNullable<LienOpportunite['opportunite']>['statut']): string | null =>
  (Array.isArray(s) ? s[0]?.libelle : s?.libelle) ?? null

function useOpportunitesDuCompteur(compteurId: string | undefined) {
  return useQuery({
    queryKey: ['opportunites-du-compteur', compteurId],
    enabled: Boolean(compteurId),
    staleTime: 60_000,
    queryFn: async (): Promise<LienOpportunite[]> => {
      const { data, error } = await supabase
        .from('opportunites_compteurs')
        .select('ecarte, motif_ecart, opportunite:opportunites(id, reference, type_opportunite, origine, statut:statuts_opportunites(libelle))')
        .eq('compteur_id', compteurId as string)
      if (error) throw new Error(error.message)
      return (data as unknown as LienOpportunite[]).filter((l) => l.opportunite)
    },
  })
}

export function OpportunitesDuCompteur({ compteurId }: { compteurId: string | undefined }) {
  const { data, isLoading } = useOpportunitesDuCompteur(compteurId)

  /* RIEN QUAND IL N'Y A RIEN. Une carte « aucune opportunité » sur les 7 900 compteurs qui n'en ont
     pas encombrerait l'écran d'une information que l'absence dit déjà. */
  if (isLoading || !data || data.length === 0) return null

  return (
    <div className="rounded-km-md border border-km-line bg-white p-3.5">
      <div className="mb-2 flex items-center gap-1.5">
        <Target className="h-3.5 w-3.5 text-km-green" />
        <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">
          Opportunités sur ce compteur
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {data.map((l) => (
          <div key={l.opportunite!.id} className="flex flex-wrap items-center gap-2">
            <Link
              to={`/opportunites/${l.opportunite!.id}`}
              className="font-mono text-km-label font-semibold text-km-green hover:underline"
            >
              {l.opportunite!.reference ?? 'sans référence'}
            </Link>
            {/* UNE OPPORTUNITÉ N'A PAS DE NOM — elle se désigne par sa référence, et se décrit par
                son type et son origine. « Captation · depuis une piste » dit ce qu'un nom aurait
                dit, sans inventer un champ qui n'existe pas. */}
            <span className="min-w-0 flex-1 truncate text-km-label text-km-text">
              {[l.opportunite!.type_opportunite, l.opportunite!.origine?.toLowerCase()]
                .filter(Boolean).join(' · ') || '—'}
            </span>
            {libelleStatut(l.opportunite!.statut) && (
              <Badge tone="neutral">{libelleStatut(l.opportunite!.statut)}</Badge>
            )}
            {l.ecarte && (
              <Badge tone="amber" title={l.motif_ecart ?? undefined}>
                écarté
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
