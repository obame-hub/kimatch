import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useEllisphereScore } from '@/lib/data/ellisphere'
import { useUpdateCompteScore } from '@/lib/data/comptes'
import { palierScoreEllipro } from '@/lib/scoreEllipro'
import { cn } from '@/lib/utils'

type Etat =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'done'; score: number | null; creditOpinion: string | null; paymentIncidents: string | null; synced: boolean }

/* LES PALIERS ONT QUITTÉ CE FICHIER le 24/09/2026. Ils venaient de Tools et comptaient quatre
   bandes ; William en a fixé trois — 0-2 rouge, 3-6 jaune, 7-10 vert — et le score se montre aussi
   dans le parcours de création d'un compte. Une seule définition, dans `@/lib/scoreEllipro`, pour
   qu'un même 6 ne soit pas vert ici et jaune là. */

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
/**
 * La lecture de la note — partagée par la carte de la fiche et la ligne du parcours de création
 * d'une recommandation (06/10/2026). Relue à l'ouverture, notée sur le compte quand elle répond.
 */
export function useNoteEllipro(compteId: string, siren: string | null | undefined) {
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
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compteId, siren])

  return { etat, run }
}

/**
 * ══ LA NOTE SUR UNE LIGNE — création d'une recommandation, William, 06/10/2026 ══
 * Direction A retenue : la note actualisée tient sur une ligne en tête de l'étape 1, aux couleurs
 * du barème (`palierScoreEllipro`), avec de quoi la relancer.
 */
export function NoteElliproLigne({ compteId, siren }: { compteId: string; siren: string | null | undefined }) {
  const { etat, run } = useNoteEllipro(compteId, siren)
  const relancer = (
    <button
      type="button"
      onClick={() => void run()}
      aria-label="Actualiser la note Ellipro"
      title="Actualiser la note Ellipro"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-km-line bg-white text-km-muted hover:text-km-green"
    >
      <RefreshCw className={cn('h-3.5 w-3.5', etat.phase === 'loading' && 'animate-spin')} />
    </button>
  )
  if (etat.phase !== 'done' || etat.score === null) {
    return (
      <div className="flex min-h-[50px] items-center gap-3 rounded-[12px] border border-km-line bg-km-bg px-[14px] py-[9px] text-[12.5px] text-km-muted">
        {etat.phase === 'error'
          ? <><AlertTriangle className="h-4 w-4 shrink-0 text-km-amber" /><span className="flex-1">Note Ellipro indisponible : {etat.message}</span>{relancer}</>
          : etat.phase === 'done'
            ? <><Shield className="h-4 w-4 shrink-0" /><span className="flex-1">Aucune note Ellipro pour ce compte.</span>{relancer}</>
            : <><Loader2 className="h-4 w-4 shrink-0 animate-spin text-km-green" /><span className="flex-1">Actualisation de la note Ellipro…</span></>}
      </div>
    )
  }
  const p = palierScoreEllipro(etat.score)
  const fond = p.bande === 'vert' ? 'bg-km-green' : p.bande === 'jaune' ? 'bg-km-amber' : 'bg-km-red'
  const details = [etat.creditOpinion, etat.paymentIncidents].filter(Boolean).join(' · ')
  return (
    <div className={cn('flex min-h-[50px] items-center gap-3 rounded-[12px] border px-[14px] py-[9px]', p.bordureToken, p.fondToken)}>
      {/* Entier, jamais de décimale (William, 04/08) : Ellisphere note de 0 à 10. */}
      <span className={cn('flex shrink-0 items-baseline rounded-[8px] px-[9px] py-[3px] font-mono font-semibold text-white', fond)}>
        <span className="text-[16px]">{Math.round(etat.score)}</span><span className="text-[11px] opacity-75">/10</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[12.5px] font-semibold text-km-text">Note Ellipro · {p.libelle.toLowerCase()}</span>
        {details && <span className="truncate text-[11px] text-km-muted" title={details}>{details}</span>}
      </span>
      <span className={cn('shrink-0 text-[11px] font-semibold', p.texteToken)}>Actualisée à l’instant</span>
      {relancer}
    </div>
  )
}

export function EllisphereScoreCard({ compteId, siren }: { compteId: string; siren: string | null | undefined }) {
  const { etat, run } = useNoteEllipro(compteId, siren)

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

  const tier = palierScoreEllipro(etat.score)
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
                {tier.libelle}
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
