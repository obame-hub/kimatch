import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CompteurChiffrage, SaisieLigne } from '@/lib/data/chiffrage'
import { detailBudget } from '@/lib/pricing/detailBudget'

/**
 * LE DÉTAIL DU CALCUL D'UNE LIGNE — William, 02/10/2026 : « ce serait bien d'avoir cette option de
 * calcul détaillé par ligne ». Un clic sur le budget d'une ligne ouvre, par-dessus le tableau, ce qui
 * le compose : fourniture, acheminement, taxes, TVA — chaque montant avec sa formule et, pour ce qui
 * est réglementé, la date ou la période qui l'a choisi (`pricing/detailBudget.ts`).
 */

const eur = (v: number) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

export function BudgetCliquable({ titre, compteur, saisie, duree, children }: {
  titre: string
  compteur: CompteurChiffrage
  saisie: SaisieLigne
  duree: number | null
  children: React.ReactNode
}) {
  /* POSÉ PAR-DESSUS LE TABLEAU, comme le menu de la ligne : le tableau défile et rognerait le reste. */
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const volet = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pos) return
    const fermer = (e: MouseEvent) => { if (!volet.current?.contains(e.target as Node) && !bouton.current?.contains(e.target as Node)) setPos(null) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    const defile = (e: Event) => { if (!volet.current?.contains(e.target as Node)) setPos(null) }
    document.addEventListener('mousedown', fermer)
    document.addEventListener('keydown', echap)
    window.addEventListener('scroll', defile, true)
    const retaille = () => setPos(null)
    window.addEventListener('resize', retaille)
    return () => {
      document.removeEventListener('mousedown', fermer)
      document.removeEventListener('keydown', echap)
      window.removeEventListener('scroll', defile, true)
      window.removeEventListener('resize', retaille)
    }
  }, [pos])
  const basculer = () => {
    if (pos) { setPos(null); return }
    const r = bouton.current?.getBoundingClientRect()
    if (!r) return
    const right = Math.max(8, window.innerWidth - r.right - 8)
    setPos(window.innerHeight - r.bottom < 420 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right })
  }
  const d = pos ? detailBudget(compteur, saisie, duree) : null
  return (
    <>
      <button
        ref={bouton}
        type="button"
        onClick={basculer}
        title="Voir le détail du calcul"
        aria-expanded={!!pos}
        className={cn('-mx-1.5 rounded-[7px] px-1.5 py-0.5 underline decoration-dotted decoration-km-faint underline-offset-[3px] transition-colors hover:bg-km-soft hover:decoration-km-green', pos && 'bg-km-soft decoration-km-green')}
      >
        {children}
      </button>
      {pos && d && (
        <div
          ref={volet}
          role="dialog"
          aria-label={`Détail du calcul · ${titre}`}
          style={{ top: pos.top, bottom: pos.bottom, right: pos.right }}
          className="fixed z-50 flex max-h-[min(640px,calc(100vh-24px))] w-[460px] flex-col overflow-hidden rounded-[13px] border border-km-line bg-white text-left shadow-km-pop"
        >
          <header className="flex items-start gap-2 border-b border-km-line-soft px-4 pb-2.5 pt-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[9.5px] font-extrabold uppercase tracking-[.1em] text-km-faint">Détail du calcul · par an</span>
              <span className="truncate text-[13.5px] font-extrabold text-km-text">{titre}</span>
              <span className="truncate font-mono text-[11px] text-km-muted">{compteur.numero}{compteur.libelle ? ` · ${compteur.libelle}` : ''}</span>
            </span>
            <button type="button" onClick={() => setPos(null)} aria-label="Fermer le détail" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-km-sm text-km-faint hover:bg-km-soft hover:text-km-text">
              <X className="h-3.5 w-3.5" />
            </button>
          </header>

          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 py-3">
            {!d.complet && (
              <span className="flex items-start gap-1.5 rounded-[8px] border border-km-amber-line bg-km-amber-soft px-2.5 py-1.5 text-[11px] leading-[15px] text-[#8a4b2a]">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> Budget partiel : des prix de la ligne ne sont pas saisis (ils comptent pour zéro).
              </span>
            )}
            {d.manques.map((m) => (
              <span key={m} className="flex items-start gap-1.5 rounded-[8px] border border-km-amber-line bg-km-amber-soft px-2.5 py-1.5 text-[11px] leading-[15px] text-[#8a4b2a]">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> {m}
              </span>
            ))}
            {d.sections.map((sec) => (
              <section key={sec.titre} className="flex flex-col">
                <span className="flex items-baseline justify-between border-b border-km-line pb-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-[.08em] text-km-muted">{sec.titre}</span>
                  <span className="font-mono text-[12px] font-extrabold tabular-nums text-km-text">{eur(sec.sousTotal)}</span>
                </span>
                {sec.lignes.map((l) => (
                  <span key={l.libelle} className="flex items-start justify-between gap-3 border-b border-km-line-soft py-1.5 last:border-b-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[12px] font-semibold text-km-text">{l.libelle}</span>
                      <span className="font-mono text-[10.5px] leading-[15px] text-km-muted">{l.formule}</span>
                      {l.source && <span className="text-[10px] italic leading-[14px] text-km-faint">{l.source}</span>}
                    </span>
                    <span className="shrink-0 whitespace-nowrap pt-px font-mono text-[12px] font-semibold tabular-nums text-km-text">{eur(l.montant)}</span>
                  </span>
                ))}
              </section>
            ))}
          </div>

          <footer className="flex flex-col gap-0.5 border-t border-km-line bg-km-soft px-4 py-2.5">
            <span className="flex items-baseline justify-between">
              <span className="text-[12px] font-bold text-km-text">Budget HTVA</span>
              <span className="font-mono text-[13px] font-extrabold tabular-nums text-km-text">{eur(d.totalHt)}</span>
            </span>
            {d.tva.map((t) => (
              <span key={t.libelle} className="flex items-baseline justify-between">
                <span className="text-[11px] text-km-muted">{t.libelle} <span className="font-mono text-[10.5px] text-km-faint">· {t.formule}</span></span>
                <span className="font-mono text-[11.5px] tabular-nums text-km-muted">{eur(t.montant)}</span>
              </span>
            ))}
            <span className="mt-1 flex items-baseline justify-between border-t border-km-line pt-1.5">
              <span className="text-[12px] font-bold text-km-text">Budget TTC</span>
              <span className="font-mono text-[13px] font-extrabold tabular-nums text-km-green">{eur(d.totalTtc)}</span>
            </span>
          </footer>
        </div>
      )}
    </>
  )
}
