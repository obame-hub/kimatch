import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useEllisphereScore } from '@/lib/data/ellisphere'
import { useUpdateCompteScore } from '@/lib/data/comptes'
import { cn } from '@/lib/utils'

type Etat =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'done'; score: number | null; creditOpinion: string | null; paymentIncidents: string | null; synced: boolean }

/** Paliers repris tels quels de Tools (`OpportuniteEllisphereScore.scoreTier`). */
function palier(score: number) {
  if (score >= 8) return { label: 'Excellent', from: 'from-emerald-500', to: 'to-teal-600', bg: 'from-emerald-500/10', ring: 'ring-emerald-500/30', text: 'text-emerald-700' }
  if (score >= 6) return { label: 'Bon', from: 'from-lime-500', to: 'to-emerald-600', bg: 'from-lime-500/10', ring: 'ring-lime-500/30', text: 'text-lime-700' }
  if (score >= 4) return { label: 'Moyen', from: 'from-amber-500', to: 'to-orange-600', bg: 'from-amber-500/10', ring: 'ring-amber-500/30', text: 'text-amber-700' }
  return { label: 'Fragile', from: 'from-red-500', to: 'to-rose-600', bg: 'from-red-500/10', ring: 'ring-red-500/30', text: 'text-red-700' }
}

/**
 * Récupère la note Ellipro (par SIREN) et met à jour le score du compte, avant le lancement de
 * l'opportunité -- transposition de `OpportuniteEllisphereScore` de Tools : mêmes quatre états
 * (chargement / erreur + « Réessayer » / pas de note + « Rafraîchir » / carte de score), mêmes
 * textes, mêmes paliers, récupération automatique au montage.
 *
 * Avis crédit et points faibles ne sont présents que si le rapport de risque Ellisphere a répondu
 * (`svcOnlineOrder`) ; sur le chemin de repli « liste de surveillance » on n'a que la note. Comme
 * dans Tools, ces deux lignes sont conditionnelles.
 */
export function EllisphereScoreCard({ compteId, siren }: { compteId: string; siren: string | null | undefined }) {
  const { mutateAsync: fetchScore } = useEllisphereScore()
  const updateCompteScore = useUpdateCompteScore()
  const [etat, setEtat] = useState<Etat>({ phase: 'idle' })

  async function run() {
    if (!siren) {
      setEtat({ phase: 'error', message: 'SIREN absent sur le compte' })
      return
    }
    setEtat({ phase: 'loading' })
    try {
      const s = await fetchScore(siren)
      const valeur = s.score === null || s.score === '' ? null : Number(s.score)
      let synced = false
      if (valeur !== null && Number.isFinite(valeur)) {
        try {
          // `persisted: false` = écriture Supabase refusée, le cache local est quand même à jour.
          const res = await updateCompteScore.mutateAsync({ compteId, score: s })
          synced = res.persisted
        } catch {
          /* la note reste affichée, seule la synchro a échoué */
        }
      }
      setEtat({
        phase: 'done',
        score: valeur !== null && Number.isFinite(valeur) ? valeur : null,
        creditOpinion: s.creditOpinion,
        paymentIncidents: s.paymentIncidents,
        synced,
      })
    } catch (e) {
      setEtat({ phase: 'error', message: e instanceof Error ? e.message : 'Erreur Ellisphere' })
    }
  }

  // Récupération automatique au montage
  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compteId, siren])

  if (etat.phase === 'idle' || etat.phase === 'loading') {
    return (
      <Card className="flex items-center gap-3 p-4 text-sm text-km-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Récupération de la note Ellipro…
      </Card>
    )
  }

  if (etat.phase === 'error') {
    return (
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 text-sm text-km-muted">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          Note Ellipro indisponible : {etat.message}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={run} className="shrink-0">
          <RefreshCw className="h-3.5 w-3.5" /> Réessayer
        </Button>
      </Card>
    )
  }

  if (etat.score === null) {
    return (
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 text-sm text-km-muted">
          <Shield className="h-4 w-4 shrink-0" />
          Aucune note Ellisphere disponible pour ce compte.
        </div>
        <Button type="button" size="sm" variant="outline" onClick={run} className="shrink-0">
          <RefreshCw className="h-3.5 w-3.5" /> Rafraîchir
        </Button>
      </Card>
    )
  }

  const tier = palier(etat.score)
  const pct = Math.max(0, Math.min(100, (etat.score / 10) * 100))

  return (
    <Card className={cn('overflow-hidden shadow-sm ring-1', tier.ring)}>
      <div className={cn('bg-gradient-to-br to-transparent px-4 py-3', tier.bg)}>
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-baseline gap-0.5">
            <span className={cn('bg-gradient-to-br bg-clip-text text-3xl font-black leading-none tabular-nums text-transparent', tier.from, tier.to)}>
              {/* Entier, jamais de décimale : « Tu enlèves la décimale. Ça ne sert à rien. Tu ne
                  peux pas avoir de 8.5 » (William, réunion du 04/08). Ellisphere note sur une
                  échelle entière de 0 à 10. */}
              {Math.round(etat.score)}
            </span>
            <span className="text-sm font-semibold text-km-faint">/10</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Shield className={cn('h-3.5 w-3.5 shrink-0', tier.text)} />
              <p className="truncate text-km-xs font-semibold uppercase tracking-wider text-km-faint">
                Score de solvabilité Ellipro
              </p>
              <Badge tone="neutral" className={cn('ml-auto shrink-0 text-km-xs font-semibold', tier.text)}>
                {tier.label}
              </Badge>
            </div>
            {etat.creditOpinion && <p className="mt-0.5 truncate text-xs font-medium text-km-text">{etat.creditOpinion}</p>}
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-km-soft">
              <div className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-700', tier.from, tier.to)} style={{ width: `${pct}%` }} />
            </div>
          </div>

          <Button type="button" size="sm" variant="ghost" onClick={run} className="h-7 shrink-0 px-2">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {etat.paymentIncidents && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
            <p className="text-km-label text-km-amber">{etat.paymentIncidents}</p>
          </div>
        )}

        <div className="mt-2">
          {etat.synced ? (
            <span className="inline-flex items-center gap-1 text-km-label text-km-green">
              <CheckCircle2 className="h-3 w-3" /> Note synchronisée avec le compte
            </span>
          ) : (
            <span className="text-km-label text-km-faint">Note non synchronisée avec le compte</span>
          )}
        </div>
      </div>
    </Card>
  )
}
