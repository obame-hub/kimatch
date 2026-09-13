import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA COUVERTURE PAR LES RELAIS DE CONSEIL SYNDICAL, SUR TOUT LE PORTEFEUILLE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Un mandat de syndic se rejoue tous les un à trois ans. Quand la copropriété change de cabinet, le
 * contrat d'énergie suit le COMPTEUR — pas le cabinet. Le membre du conseil syndical est alors le
 * seul fil qui ne casse pas, et le seul moyen d'apprendre qui est le nouveau syndic.
 *
 * UNE ASSURANCE QU'ON NE MESURE PAS N'EST JAMAIS SOUSCRITE. Sur la fiche d'un compte, la couverture
 * dit ce qu'il reste à faire sur ce compte-là. Ici elle dit l'exposition de Kiwee, et c'est ce
 * chiffre qui décide s'il faut lancer une campagne de collecte.
 *
 * ══ LE DÉNOMINATEUR EST LE COMPTEUR SOUS CONTRAT ══
 *
 * `nature_echeance = 'PROUVEE'` : un contrat actif dont la date de fin n'est pas passée. Compter
 * tous les liens `contrats_compteurs` donnerait 1 454 compteurs au lieu de 1 033 et gonflerait le
 * dénominateur de 40 % avec des contrats morts — un contrat terminé n'expose à rien.
 *
 * ══ ET SEULS LES SYNDICS PROFESSIONNELS COMPTENT ══
 *
 * Une entreprise n'a pas de conseil syndical, et un syndic bénévole n'a pas de cabinet à perdre :
 * les inclure ferait un taux de 0,5 % qui ne mesurerait plus rien. Restreint aux cabinets, le
 * chiffre dit une exposition réelle.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface Mesure {
  sousContrat: number
  couverts: number
  taux: number
  /** Les cabinets les plus exposés : beaucoup de compteurs sous contrat, aucun relais. */
  exposes: { compte_id: string; nom: string; sans_filet: number }[]
}

function useCouvertureNationale(proprietaireId: string | null) {
  return useQuery({
    queryKey: ['couverture-nationale', proprietaireId],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Mesure> => {
      const { data: lignes, error } = await supabase
        .from('v_compteurs_liste')
        .select('compte_id, contact_conseil_syndical_id')
        .eq('actif', true)
        .eq('nature_echeance', 'PROUVEE')
      if (error) throw new Error(error.message)

      const ids = [...new Set((lignes ?? []).map((l: { compte_id: string }) => l.compte_id))]
      if (ids.length === 0) return { sousContrat: 0, couverts: 0, taux: 0, exposes: [] }

      // Les cabinets seulement — voir l'en-tête. Le propriétaire filtre comme partout ailleurs sur
      // la page : le taux affiché doit correspondre au périmètre choisi en haut.
      let qc = supabase
        .from('comptes')
        .select('id, nom, proprietaire_id')
        .eq('segment', 'Syndic professionnel')
        .in('id', ids)
      if (proprietaireId) qc = qc.eq('proprietaire_id', proprietaireId)
      const { data: comptes, error: e2 } = await qc
      if (e2) throw new Error(e2.message)

      const nomParId = new Map((comptes ?? []).map((c) => [c.id as string, c.nom as string]))
      const retenues = (lignes ?? []).filter((l: { compte_id: string }) => nomParId.has(l.compte_id))

      const sansFiletParCompte = new Map<string, number>()
      let couverts = 0
      for (const l of retenues as { compte_id: string; contact_conseil_syndical_id: string | null }[]) {
        if (l.contact_conseil_syndical_id) couverts += 1
        else sansFiletParCompte.set(l.compte_id, (sansFiletParCompte.get(l.compte_id) ?? 0) + 1)
      }

      const sousContrat = retenues.length
      return {
        sousContrat,
        couverts,
        taux: sousContrat === 0 ? 0 : Math.round((couverts / sousContrat) * 100),
        exposes: [...sansFiletParCompte.entries()]
          .map(([compte_id, sans_filet]) => ({ compte_id, nom: nomParId.get(compte_id) ?? '', sans_filet }))
          .sort((a, b) => b.sans_filet - a.sans_filet)
          .slice(0, 5),
      }
    },
  })
}

export function CouvertureNationale({ proprietaireId }: { proprietaireId: string | null }) {
  const { data, isLoading } = useCouvertureNationale(proprietaireId)

  // Pas de cabinet dans le périmètre, pas de zone : un bloc à 0/0 n'apprend rien et use le signal.
  if (isLoading || !data || data.sousContrat === 0) return null

  const sansFilet = data.sousContrat - data.couverts
  const tout = sansFilet === 0

  return (
    <section className="rounded-[22px] bg-km-piste-soft p-2.5 ring-1 ring-inset ring-km-piste-line sm:p-3">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 px-1.5">
        <h2 className="text-km-name font-semibold text-km-piste">Continuité</h2>
        <p className="min-w-0 flex-1 truncate text-km-body text-km-muted">
          Ce qui resterait si un cabinet perdait sa copropriété
        </p>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <div className="flex flex-col justify-center rounded-[16px] bg-km-surface px-4 py-3">
          <p className="text-km-label font-bold uppercase tracking-[0.06em] text-km-faint">
            Compteurs sous contrat couverts
          </p>
          <p className="mt-1.5 text-[30px] font-bold leading-none tracking-[-.04em] tabular-nums text-km-piste">
            {data.taux}<span className="ml-0.5 text-km-lead text-km-muted">%</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-km-soft">
            <div className="h-full rounded-full bg-km-piste" style={{ width: `${data.taux}%` }} />
          </div>
          <p className="mt-2 text-km-label tabular-nums text-km-muted">
            {data.couverts.toLocaleString('fr-FR')} sur {data.sousContrat.toLocaleString('fr-FR')} compteurs,
            chez les syndics professionnels
          </p>
          <p className={cn(
            'mt-2 flex items-start gap-1 border-t border-km-line-soft pt-2 text-km-label font-semibold',
            tout ? 'text-km-green' : 'text-km-red',
          )}>
            {tout
              ? <><ShieldCheck className="mt-px h-3 w-3 shrink-0" /> Tout est couvert</>
              : <><AlertTriangle className="mt-px h-3 w-3 shrink-0" /> {sansFilet.toLocaleString('fr-FR')} compteurs sans filet</>}
          </p>
        </div>

        <div className="min-w-0 overflow-hidden rounded-[16px] bg-km-surface">
          <div className="border-b border-km-line px-4 py-2.5">
            {/* LE CLASSEMENT EST LA CAMPAGNE. Un taux global dit l'ampleur ; ces cinq lignes disent
                par où commencer, et c'est la seule chose qui transforme la mesure en travail. */}
            <h3 className="text-km-body font-semibold text-km-text">Les cabinets les plus exposés</h3>
          </div>
          {data.exposes.length === 0 ? (
            <p className="px-4 py-6 text-center text-km-body text-km-muted">Aucun cabinet découvert.</p>
          ) : (
            data.exposes.map((e) => (
              <Link
                key={e.compte_id}
                to={`/comptes/${e.compte_id}`}
                className="flex items-center gap-3 border-b border-km-line-soft px-4 py-2 last:border-b-0 hover:bg-km-soft"
              >
                <span className="min-w-0 flex-1 truncate text-km-body font-semibold text-km-text">{e.nom}</span>
                <span className="shrink-0 text-km-body font-bold tabular-nums text-km-red">{e.sans_filet}</span>
                <span className="shrink-0 text-km-label text-km-faint">sans filet</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
