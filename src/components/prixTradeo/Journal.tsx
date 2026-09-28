import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useJournalTradeo } from '@/lib/data/tradeo'
import { Aide, Json } from './commun'

/**
 * LE JOURNAL — ce que William lira pour intégrer. Chaque appel du banc, par qui, avec ce qui est
 * parti et ce qui est revenu. Les cinquante derniers suffisent : c'est un banc, pas un historique.
 */
export function Journal() {
  const { data, isLoading, refetch, isFetching } = useJournalTradeo(true)
  return (
    <div>
      <Aide>
        Les cinquante derniers appels à Tradeo, de William et de Naoëlle. Ils sont aussi dans la table
        <code className="mx-1 rounded bg-km-soft px-1">appels_tradeo</code>. Ni le jeton ni le mot de passe n’y sont écrits.
      </Aide>
      <Button className="mb-3" onClick={() => void refetch()} disabled={isFetching}>
        {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Actualiser
      </Button>
      {isLoading && <p className="text-km-muted">Lecture…</p>}
      {data && data.length === 0 && <p className="text-km-muted">Aucun appel pour l’instant.</p>}
      <div className="space-y-2">
        {data?.map((a) => (
          <details key={a.id} className="rounded-km border border-km-line">
            <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2 px-3 py-2 text-km-body">
              <Badge tone={a.succes ? 'green' : 'red'}>{a.statut_http ?? 'sans réponse'}</Badge>
              <span className="font-semibold">{a.action}</span>
              <span className="font-mono text-km-label text-km-muted">{a.chemin}</span>
              <span className="ml-auto text-km-label text-km-muted">
                {a.auteur?.prenom ?? '—'} · {new Date(a.date_appel).toLocaleString('fr-FR')}
                {a.duree_ms !== null && ` · ${(a.duree_ms / 1000).toFixed(1)} s`}
              </span>
            </summary>
            {a.erreur && <p className="border-t border-km-line px-3 py-2 text-km-red">{a.erreur}</p>}
            <p className="border-t border-km-line px-3 pt-2 text-km-label font-semibold text-km-muted">Envoyé</p>
            <Json valeur={a.requete} />
            <p className="border-t border-km-line px-3 pt-2 text-km-label font-semibold text-km-muted">Reçu</p>
            <Json valeur={a.reponse} />
          </details>
        ))}
      </div>
    </div>
  )
}
