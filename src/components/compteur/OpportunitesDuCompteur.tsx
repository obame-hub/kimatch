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

interface LienOpportunite {
  ecarte: boolean | null
  motif_ecart: string | null
  opportunite: { id: string; reference: string | null; nom: string | null; statut: string | null } | null
}

function useOpportunitesDuCompteur(compteurId: string | undefined) {
  return useQuery({
    queryKey: ['opportunites-du-compteur', compteurId],
    enabled: Boolean(compteurId),
    staleTime: 60_000,
    queryFn: async (): Promise<LienOpportunite[]> => {
      const { data, error } = await supabase
        .from('opportunites_compteurs')
        .select('ecarte, motif_ecart, opportunite:opportunites(id, reference, nom, statut)')
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
            <span className="min-w-0 flex-1 truncate text-km-label text-km-text">
              {l.opportunite!.nom ?? '—'}
            </span>
            {l.opportunite!.statut && <Badge tone="neutral">{l.opportunite!.statut}</Badge>}
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
