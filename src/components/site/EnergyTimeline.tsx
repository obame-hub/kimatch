import { useNavigate } from 'react-router-dom'
import { Zap, Flame } from 'lucide-react'
import type { Compteur, Contrat } from '@/types/domain'

const STATUT_COLOR: Record<string, string> = {
  ACTIF: '#0d7a5f',
  A_RENOUVELER: '#b57a24',
  EXPIRE: '#a3a5a0',
  RESILIE: '#a3a5a0',
}

function toTime(d: string | null, fallback: number): number {
  if (!d) return fallback
  const t = new Date(d).getTime()
  return Number.isNaN(t) ? fallback : t
}

export function EnergyTimeline({ compteurs, contrats }: { compteurs: Compteur[]; contrats: Contrat[] }) {
  const navigate = useNavigate()
  if (compteurs.length === 0) return null

  const now = Date.now()
  const twoYears = 2 * 365 * 24 * 60 * 60 * 1000
  const dates = contrats.flatMap((c) => [toTime(c.date_debut, now - twoYears), toTime(c.date_fin, now + twoYears)])
  const rangeStart = dates.length ? Math.min(...dates, now - twoYears / 2) : now - twoYears
  const rangeEnd = dates.length ? Math.max(...dates, now + twoYears / 2) : now + twoYears
  const span = Math.max(rangeEnd - rangeStart, 1)

  const pct = (t: number) => Math.min(100, Math.max(0, ((t - rangeStart) / span) * 100))
  const todayPct = pct(now)

  const startYear = new Date(rangeStart).getFullYear()
  const endYear = new Date(rangeEnd).getFullYear()
  const years: number[] = []
  for (let y = startYear; y <= endYear; y++) years.push(y)

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-navy-400">Frise énergétique</span>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[10px] text-navy-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: STATUT_COLOR.ACTIF }} /> actif</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: STATUT_COLOR.A_RENOUVELER }} /> à renouveler</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: STATUT_COLOR.EXPIRE }} /> expiré</span>
        </div>
      </div>

      <div className="relative pt-1">
        <div className="absolute bottom-6 top-0 z-10 w-px bg-red-400" style={{ left: `${todayPct}%` }} />
        <span
          className="absolute -top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold text-white"
          style={{ left: `${todayPct}%`, background: '#c2452d' }}
        >
          AUJ.
        </span>

        <div className="space-y-2.5">
          {compteurs.map((compteur) => {
            const contratsDuCompteur = contrats.filter((c) => c.compteurs.some((cc) => cc.id === compteur.id))
            const Icon = compteur.type_energie === 'gaz' ? Flame : Zap
            return (
              <div key={compteur.id} className="grid grid-cols-[130px_1fr] items-center gap-3">
                <div className="flex items-center gap-2 overflow-hidden">
                  {/* Les deux couleurs etaient INVERSEES : l'electricite en bleu et le gaz en
                      ambre, alors que la charte des maquettes dit l'inverse — electricite dorée
                      (kw-gold #c8940a), gaz bleuté (kw-gas #4a7fa5). Le rouge et l'orange sont
                      proscrits pour le gaz, leur connotation d'alerte est trompeuse sur une frise
                      qui ne signale rien d'anormal. Les jetons existaient deja dans
                      tailwind.config.js, ils n'etaient simplement pas employes ici. */}
                  <span
                    className={
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded ' +
                      (compteur.type_energie === 'electricite'
                        ? 'bg-kw-gold-light text-kw-gold'
                        : 'bg-kw-gas-light text-kw-gas')
                    }
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="truncate text-xs font-semibold text-navy-800">{compteur.utilisation || compteur.numero_pdl}</span>
                </div>
                <div className="relative h-6 rounded bg-navy-50">
                  {contratsDuCompteur.length === 0 && (
                    <span className="absolute inset-0 flex items-center px-2 text-[10px] text-navy-400">Aucun contrat</span>
                  )}
                  {contratsDuCompteur.map((c) => {
                    const left = pct(toTime(c.date_debut, rangeStart))
                    const right = pct(toTime(c.date_fin, rangeEnd))
                    const width = Math.max(right - left, 2)
                    return (
                      <div
                        key={c.id}
                        onClick={() => navigate(`/contrats/${c.id}`)}
                        className="absolute top-0 flex h-full cursor-pointer items-center overflow-hidden whitespace-nowrap rounded px-2 text-[10px] font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ left: `${left}%`, width: `${width}%`, background: STATUT_COLOR[c.statut] ?? '#a3a5a0' }}
                        title={`${c.fournisseur_nom} · ${c.statut}`}
                      >
                        {c.fournisseur_nom}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-2 grid grid-cols-[130px_1fr]">
          <div />
          <div className="flex justify-between border-t border-navy-100 pt-1.5 font-mono text-[9px] text-navy-400">
            {years.map((y) => <span key={y}>{y}</span>)}
          </div>
        </div>
      </div>
    </div>
  )
}
